// In-memory backend with the same interface as lib/backend.js. Bundled only for demo builds.
import { buildFixtures } from "./fixtures.js";
import { uuid } from "../lib/format.js";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const clone = (x) => (typeof structuredClone === "function" ? structuredClone(x) : JSON.parse(JSON.stringify(x)));

export function createDemoBackend() {
  const db = buildFixtures();
  const listeners = new Set();
  const emit = (table, eventType, row) => listeners.forEach((l) => l({ table, eventType, row: clone(row), old: { id: row.id } }));
  const user = { id: "demo-user", email: "owner@dhitiservices.com" };
  const blobUrls = new Map();

  const touch = (row) => ({ ...row, updated_at: new Date().toISOString() });

  return {
    kind: "demo",
    auth: {
      getSession: async () => ({ user }),
      onChange: () => () => {},
      signInWithOtp: async () => {},
      signInWithPassword: async () => {},
      signOut: async () => {},
      isTeam: async () => true,
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
      if (kind !== "run_weekly") setTimeout(() => { Object.assign(row, { status: "done", finished_at: new Date().toISOString() }); emit("jobs", "UPDATE", row); }, 9000);
      return clone(row);
    },

    async signUrls(paths) {
      await wait(60);
      return paths.map((p) => ({
        path: p,
        signedUrl: p.startsWith("data:") ? p : blobUrls.get(p) || (p.startsWith("demo/") ? `/demo-media/${p.slice(5)}` : `/demo-media/${p.split("/").pop()}`),
      }));
    },

    async uploadLibraryFile(file) {
      await wait(900);
      const path = `library/${uuid()}/${file.name}`;
      blobUrls.set(path, URL.createObjectURL(file));
      return path;
    },
    async insertLibrary(row) {
      const full = { id: uuid(), used_count: 0, created_at: new Date().toISOString(), notes: "", tags: [], ...row };
      db.library.unshift(full);
      if (row.kind === "voiceover" && row.content_item_id) {
        const it = db.items.find((i) => i.id === row.content_item_id);
        if (it) {
          setTimeout(() => {
            Object.assign(it, { status: "generating" });
            emit("content_items", "UPDATE", it);
          }, 3000);
        }
      }
      return clone(full);
    },
    async updateLibrary(id, patch) {
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
