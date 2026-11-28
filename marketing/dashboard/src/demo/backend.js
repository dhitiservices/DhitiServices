// In-memory backend with the same interface as lib/backend.js. Bundled only for demo builds.
import { buildFixtures } from "./fixtures.js";
import { uuid } from "../lib/format.js";
import { freshSignIn } from "../lib/session.js";

/** Demo sign-in: any address gets a "code"; the code is always 123456. Addresses starting "outsider" are not on
 *  the allowlist (to show that path). Asking again within 60 s answers like Supabase does. */
export const DEMO_CODE = "123456";
const SESSION_KEY = "dhiti.demo.session";
const authError = (message, status, code) => Object.assign(new Error(message), { name: "AuthApiError", status, code });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const clone = (x) => (typeof structuredClone === "function" ? structuredClone(x) : JSON.parse(JSON.stringify(x)));

export function createDemoBackend() {
  const db = buildFixtures();
  const listeners = new Set();
  const emit = (table, eventType, row) => listeners.forEach((l) => l({ table, eventType, row: clone(row), old: { id: row.id } }));
  const sessionListeners = new Set();
  const loadSession = () => { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null"); } catch { return null; } };
  const saveSession = (v) => { try { v ? sessionStorage.setItem(SESSION_KEY, JSON.stringify(v)) : sessionStorage.removeItem(SESSION_KEY); } catch { /* private */ } };
  // "Server-side" OTP state survives a reload, as it would on Supabase.
  const SENT_KEY = "dhiti.demo.sent";
  const lastSent = {
    all() { try { return JSON.parse(sessionStorage.getItem(SENT_KEY) || "{}"); } catch { return {}; } },
    get(k) { return this.all()[k]; },
    has(k) { return k in this.all(); },
    set(k, v) { const a = this.all(); a[k] = v; try { sessionStorage.setItem(SENT_KEY, JSON.stringify(a)); } catch { /* private */ } },
  };
  const attempts = new Map();
  const blobUrls = new Map();

  const touch = (row) => ({ ...row, updated_at: new Date().toISOString() });

  return {
    kind: "demo",
    auth: {
      getSession: async () => { await wait(250); return loadSession(); },
      takeUrlError: () => null,
      onChange: (cb) => { sessionListeners.add(cb); return () => sessionListeners.delete(cb); },
      async sendCode(email) {
        await wait(700);
        const prev = lastSent.get(email);
        if (prev && Date.now() - prev < 60_000) {
          throw authError(`For security purposes, you can only request this after ${Math.ceil((60_000 - (Date.now() - prev)) / 1000)} seconds.`, 429, "over_email_send_rate_limit");
        }
        lastSent.set(email, Date.now());
        attempts.set(email, 0);
      },
      async verifyCode(email, token) {
        await wait(650);
        const n = (attempts.get(email) || 0) + 1;
        attempts.set(email, n);
        if (n > 5) throw authError("Too many requests", 429, "over_request_rate_limit");
        if (token !== DEMO_CODE || !lastSent.has(email)) throw authError("Token has expired or is invalid", 403, "otp_expired");
        freshSignIn();
        const session = { user: { id: `demo-${email}`, email }, access_token: "demo" };
        saveSession(session);
        sessionListeners.forEach((l) => setTimeout(() => l(session, "SIGNED_IN"), 0));
        return session;
      },
      async signOut() {
        await wait(200);
        saveSession(null);
        sessionListeners.forEach((l) => setTimeout(() => l(null, "SIGNED_OUT"), 0));
      },
      async isAllowlisted() {
        await wait(300);
        return !/^outsider/i.test(loadSession()?.user?.email || "");
      },
    },

    async fetchAll() {
      await wait(450);
      const { settings, runs, briefs, topics, items, assets, jobs, library } = db;
      return clone({ settings, runs, briefs, topics, items, assets, jobs, library });
    },
    async fetchItem(id) { return clone(db.items.find((i) => i.id === id)); },
    async fetchAssets(itemId) { return clone(db.assets.filter((a) => a.content_item_id === itemId)); },
    async fetchRunLog(id) { await wait(250); return db.logs[id] || "No log captured for this run."; },

    async updateItem(id, patch) {
      await wait(260);
      const i = db.items.findIndex((r) => r.id === id);
      db.items[i] = touch({ ...db.items[i], ...patch });
      return clone(db.items[i]);
    },
    async updateTopic(id, patch) {
      await wait(200);
      const i = db.topics.findIndex((r) => r.id === id);
      db.topics[i] = { ...db.topics[i], ...patch };
      return clone(db.topics[i]);
    },
    async updateSettings(data) {
      await wait(300);
      db.settings = clone(data);
      return { data: clone(db.settings), updated_at: new Date().toISOString() };
    },
    async insertJob(kind, payload, requestedBy) {
      await wait(220);
      const row = { id: uuid(), kind, payload, status: "queued", requested_by: requestedBy, error: null, created_at: new Date().toISOString(), started_at: null, finished_at: null };
      db.jobs.unshift(row);
      // Simulate the worker picking it up.
      setTimeout(() => { Object.assign(row, { status: "running", started_at: new Date().toISOString() }); emit("jobs", "UPDATE", row); }, 2500);
      if (kind === "render_video") {
        // The revisions run re-times the reel to the voiceover and puts it back in review.
        setTimeout(() => {
          const it = db.items.find((i) => i.id === payload.content_item_id);
          const vo = db.library.find((l) => l.id === payload.library_asset_id);
          if (/fail/i.test(vo?.title || "")) {
            // Demo of a rejected recording (the playbook fails the job with an owner-readable reason).
            Object.assign(row, { status: "failed", finished_at: new Date().toISOString(), error: "The voiceover is 52 s; the reel allows 15 to 40 s. Please record the script at a brisker pace." });
            emit("jobs", "UPDATE", row);
            return;
          }
          if (it) {
            Object.assign(it, touch({ status: "pending_review", version: (it.version || 1) + 1, body: { ...it.body, voiceover: { library_asset_id: payload.library_asset_id, duration: vo?.duration || 27.4 } } }));
            emit("content_items", "UPDATE", it);
          }
          if (vo) { vo.used_count = (vo.used_count || 0) + 1; emit("library_assets", "UPDATE", vo); }
          Object.assign(row, { status: "done", finished_at: new Date().toISOString() });
          emit("jobs", "UPDATE", row);
        }, 9000);
      } else if (kind !== "run_weekly") setTimeout(() => { Object.assign(row, { status: "done", finished_at: new Date().toISOString() }); emit("jobs", "UPDATE", row); }, 9000);
      return clone(row);
    },

    async signUrls(paths) {
      await wait(60);
      return paths.map((p) => ({
        path: p,
        signedUrl: p.startsWith("data:") ? p : blobUrls.get(p) || (p.startsWith("demo/") ? `/demo-media/${p.slice(5)}` : `/demo-media/${p.split("/").pop()}`),
      }));
    },

    async uploadLibraryFile(file, { onProgress, signal } = {}) {
      // Simulated progress over ~1.2 s.
      for (let i = 1; i <= 12; i++) {
        if (signal?.aborted) throw Object.assign(new Error("Upload cancelled"), { name: "AbortError" });
        await wait(100);
        onProgress?.(i / 12);
      }
      const path = `library/${uuid()}/${file.name}`;
      blobUrls.set(path, URL.createObjectURL(file));
      return path;
    },
    async removeLibraryFile(path) { blobUrls.delete(path); },
    async insertLibrary(row) {
      await wait(150);
      const full = { id: uuid(), used_count: 0, created_at: new Date().toISOString(), notes: "", tags: [], ...row };
      db.library.unshift(full);
      return clone(full);
    },
    async updateLibrary(id, patch) {
      await wait(200);
      const r = db.library.find((x) => x.id === id);
      Object.assign(r, patch);
      return clone(r);
    },
    async deleteLibrary(row) {
      await wait(250);
      db.library = db.library.filter((r) => r.id !== row.id);
    },

    subscribe(cb, onStatus) {
      listeners.add(cb);
      setTimeout(() => onStatus?.(true), 600);
      return () => listeners.delete(cb);
    },
  };
}
