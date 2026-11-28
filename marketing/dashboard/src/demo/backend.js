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

/* ---------- LinkedIn (demo): the connection lives in sessionStorage so the "Connect" round trip survives the reload.
   Pick a state with ?li=none | app | choose | connected | expiring | expired (kept for this tab). ---------- */
const LI_KEY = "dhiti.demo.li";
const DAY = 86400000;
const iso = (ms) => new Date(Date.now() + ms).toISOString();
const ORG = { org_urn: "urn:li:organization:10293847", org_id: 10293847, org_name: "Dhiti Services", org_vanity: "dhiti-services", org_logo_url: "/brand/dhiti-mark.webp" };
const SCOPES = ["rw_organization_admin", "w_organization_social", "r_organization_social", "w_organization_social_feed", "r_organization_social_feed"];
const BLANK = { id: 1, status: "not_configured", paused: false, client_id: null, app_saved_at: null, member_urn: null, org_urn: null, org_id: null, org_name: null, org_vanity: null, org_logo_url: null, org_candidates: [], scopes: [], access_token_expires_at: null, refresh_token_expires_at: null, has_refresh_token: false, last_refreshed_at: null, last_checked_at: null, last_check_active: null, last_error: null, connected_at: null };
const connected = (o = {}) => ({ ...BLANK, status: "connected", client_id: "86demo4ppl2to", app_saved_at: iso(-12 * DAY), member_urn: "urn:li:person:demo", ...ORG, scopes: SCOPES, access_token_expires_at: iso(52 * DAY + 3600e3), refresh_token_expires_at: iso(300 * DAY), has_refresh_token: false, last_checked_at: iso(-3 * 3600e3), last_check_active: true, connected_at: iso(-8 * DAY), ...o });
const PRESETS = {
  none: () => ({ ...BLANK }),
  app: () => ({ ...BLANK, status: "app_saved", client_id: "86demo4ppl2to", app_saved_at: iso(-2 * 3600e3) }),
  choose: () => ({ ...BLANK, status: "choose_org", client_id: "86demo4ppl2to", app_saved_at: iso(-1 * DAY), org_candidates: [{ org_urn: ORG.org_urn, org_name: "Dhiti Services" }, { org_urn: "urn:li:organization:55501234", org_name: "Dhiti Rural Careers" }] }),
  connected: () => connected(),
  expiring: () => connected({ access_token_expires_at: iso(9 * DAY), refresh_token_expires_at: null }),
  expired: () => connected({ status: "expired", last_check_active: false, access_token_expires_at: iso(-1 * DAY) }),
};
function loadLi() {
  try {
    const q = new URLSearchParams(window.location.search).get("li");
    if (q && PRESETS[q]) { const v = PRESETS[q](); sessionStorage.setItem(LI_KEY, JSON.stringify(v)); return v; }
    const saved = JSON.parse(sessionStorage.getItem(LI_KEY) || "null");
    return saved || PRESETS.connected();
  } catch { return PRESETS.connected(); }
}
function saveLi(v) { try { sessionStorage.setItem(LI_KEY, JSON.stringify(v)); } catch { /* private */ } }
const liError = (message, code, status = 409) => Object.assign(new Error(message), { code, status });

/** GET /status (LINKEDIN.md 3.5), warnings per 4.4. */
function statusOf(c, posts) {
  const warnings = [];
  const days = (t) => (t ? Math.floor((new Date(t).getTime() - Date.now()) / DAY) : null);
  if (["expired", "revoked", "error"].includes(c.status) || c.last_check_active === false) warnings.push({ level: "red", code: "RECONNECT_REQUIRED" });
  else if (c.status === "connected") {
    const a = days(c.access_token_expires_at);
    const r = days(c.refresh_token_expires_at);
    if (!c.has_refresh_token && a != null && a <= 14) warnings.push({ level: a <= 3 ? "red" : "amber", code: "ACCESS_TOKEN_EXPIRING", days_left: a });
    if (c.has_refresh_token && r != null && r <= 30) warnings.push({ level: r <= 7 ? "red" : "amber", code: "REFRESH_TOKEN_EXPIRING", days_left: r });
  }
  if (c.status === "connected" && posts.some((p) => p.status === "failed")) warnings.push({ level: "red", code: "POST_FAILED" });
  if (c.status === "connected" && posts.some((p) => p.comment_status === "failed")) warnings.push({ level: "red", code: "COMMENT_FAILED" });
  const connectedish = ["connected", "expired", "revoked"].includes(c.status);
  return {
    status: c.status, paused: c.paused, client_id: c.client_id, secret_saved: !!c.client_id, app_saved_at: c.app_saved_at,
    org: connectedish && c.org_urn ? { urn: c.org_urn, name: c.org_name, vanity: c.org_vanity, logo_url: c.org_logo_url } : null,
    org_candidates: c.org_candidates || [], scopes: c.scopes, access_token_expires_at: c.access_token_expires_at, refresh_token_expires_at: c.refresh_token_expires_at,
    has_refresh_token: c.has_refresh_token, last_refreshed_at: c.last_refreshed_at, last_checked_at: c.last_checked_at, last_check_active: c.last_check_active,
    connected_at: c.connected_at, warnings, api_version: "202611", api_version_sunset: "2027-11-16",
    redirect_uri: "https://yexxrcgxhwsopssfyylo.supabase.co/functions/v1/linkedin/oauth/callback",
  };
}

export function createDemoBackend() {
  const db = buildFixtures();
  let li = loadLi();
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
      const { settings, runs, briefs, topics, items, assets, jobs, library, socialPosts } = db;
      return clone({ settings, runs, briefs, topics, items, assets, jobs, library, socialPosts, linkedin: li });
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

    async updateSocialPost(id, patch) {
      await wait(240);
      const i = db.socialPosts.findIndex((r) => r.id === id);
      const old = db.socialPosts[i];
      const next = { ...old, ...patch };
      // The database trigger's rules (LINKEDIN.md 2.4), so the demo refuses what the real thing refuses.
      if (patch.status === "approved") {
        const kid = db.items.filter((x) => x.parent_id === old.blog_item_id && x.type === next.format && ["approved", "published"].includes(x.status)).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
        if (!kid) throw Object.assign(new Error(`approve the ${next.format} first`), { code: "P0001" });
        Object.assign(next, { source_item_id: kid.id, approved_at: new Date().toISOString(), approved_by: "demo-owner@example.com", last_error: null, next_attempt_at: null });
      }
      db.socialPosts[i] = touch(next);
      return clone(db.socialPosts[i]);
    },
    async setLinkedinPaused(paused) { await wait(200); li = { ...li, paused }; saveLi(li); return clone(li); },

    async linkedin(route, { body } = {}) {
      await wait(route === "status" ? 380 : 700);
      const emitLi = () => { saveLi(li); emit("linkedin_connection", "UPDATE", li); };
      switch (route) {
        case "status": return statusOf(li, db.socialPosts);
        case "save_app": {
          if (!/^[A-Za-z0-9_-]{6,64}$/.test(body?.client_id || "")) throw liError("That Client ID doesn't look right.", "BAD_REQUEST", 400);
          if (!/^[\x21-\x7E]{8,256}$/.test(body?.client_secret || "")) throw liError("That Client Secret doesn't look right.", "BAD_REQUEST", 400);
          const changed = body.client_id !== li.client_id;
          li = changed ? { ...BLANK, status: "app_saved", client_id: body.client_id, app_saved_at: new Date().toISOString() } : { ...li, app_saved_at: new Date().toISOString(), status: li.status === "not_configured" ? "app_saved" : li.status };
          emitLi();
          return { client_id: li.client_id, secret_saved: true, redirect_uri: statusOf(li, []).redirect_uri, status: li.status };
        }
        case "oauth/start": {
          if (!li.client_id) throw liError("Paste your keys first.", "APP_NOT_SAVED");
          // Demo: pretend LinkedIn said yes, then come back the way the real callback does.
          li = connected({ client_id: li.client_id, app_saved_at: li.app_saved_at, connected_at: new Date().toISOString(), last_checked_at: new Date().toISOString() });
          saveLi(li);
          return { authorize_url: `${window.location.origin}/settings?linkedin=connected`, expires_at: iso(10 * 60e3) };
        }
        case "select_org": {
          const pick = (li.org_candidates || []).find((o) => o.org_urn === body?.org_urn);
          if (li.status !== "choose_org" || !pick) throw liError("Pick one of the pages in the list.", "BAD_REQUEST", 400);
          li = connected({ client_id: li.client_id, app_saved_at: li.app_saved_at, org_urn: pick.org_urn, org_name: pick.org_name, org_logo_url: pick.org_urn === ORG.org_urn ? ORG.org_logo_url : null, connected_at: new Date().toISOString() });
          emitLi();
          return statusOf(li, db.socialPosts);
        }
        case "disconnect": {
          li = body?.forget_app ? { ...BLANK } : { ...BLANK, status: "app_saved", client_id: li.client_id, app_saved_at: li.app_saved_at, paused: li.paused };
          emitLi();
          return { status: li.status };
        }
        case "publish_now": {
          const p = db.socialPosts.find((r) => r.id === body?.social_post_id);
          if (!p || p.status !== "approved") throw liError("Approve the post first.", "NOT_APPROVED");
          const blog = db.items.find((x) => x.id === p.blog_item_id);
          if (blog?.status !== "published") throw liError("The blog is not live yet.", "BLOG_NOT_LIVE");
          Object.assign(p, touch({ status: "publishing", stage: "media_uploading" }));
          emit("social_posts", "UPDATE", p);
          setTimeout(() => { Object.assign(p, touch({ status: "published", stage: "post_created", comment_status: "posted", published_at: new Date().toISOString(), post_urn: "urn:li:share:7264000000000000000", post_url: "https://www.linkedin.com/feed/update/urn:li:share:7264000000000000000/" })); emit("social_posts", "UPDATE", p); }, 2500);
          return { id: p.id, status: p.status, stage: p.stage, comment_status: p.comment_status, post_url: p.post_url, last_error: null };
        }
        case "retry_comment": {
          const p = db.socialPosts.find((r) => r.id === body?.social_post_id);
          if (!p || p.status !== "published" || p.comment_status !== "failed") throw liError("The comment can't be sent again right now.", "COMMENT_NOT_RETRYABLE");
          Object.assign(p, touch({ comment_status: "requested", comment_attempts: 0, last_error: null }));
          emit("social_posts", "UPDATE", p);
          setTimeout(() => { Object.assign(p, touch({ comment_status: "posted" })); emit("social_posts", "UPDATE", p); }, 2200);
          return { id: p.id, status: p.status, stage: p.stage, comment_status: p.comment_status, post_url: p.post_url, last_error: null };
        }
        default: throw liError("Unknown route", "NOT_FOUND", 404);
      }
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
