import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { POLL_MS, UNDO_MS } from "./config.js";
import { useToast } from "../components/Toast.jsx";
import { formatDateTime } from "./format.js";
import { setDownloadErrorHandler } from "./media.js";
import { TYPE_META, JOB_KIND } from "./model.js";

const DataContext = createContext(null);
export const useData = () => useContext(DataContext);

const EMPTY = { settings: {}, runs: [], briefs: [], topics: [], items: [], assets: [], jobs: [], library: [] };
const TABLE_KEY = { content_items: "items", jobs: "jobs", runs: "runs", topics: "topics", library_assets: "library" };
const SORTS = {
  items: (a, b) => (b.created_at || "").localeCompare(a.created_at || ""),
  jobs: (a, b) => (b.created_at || "").localeCompare(a.created_at || ""),
  runs: (a, b) => (b.started_at || "").localeCompare(a.started_at || ""),
  topics: (a, b) => (b.week_start || "").localeCompare(a.week_start || "") || (a.priority ?? 0) - (b.priority ?? 0),
  library: (a, b) => (b.created_at || "").localeCompare(a.created_at || ""),
};

function upsert(list, row, key) {
  const i = list.findIndex((r) => r.id === row.id);
  const next = i === -1 ? [row, ...list] : list.map((r, j) => (j === i ? { ...r, ...row } : r));
  return SORTS[key] ? [...next].sort(SORTS[key]) : next;
}

export function DataProvider({ backend, user, children }) {
  const toast = useToast();
  const [data, setData] = useState(EMPTY);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);
  const [live, setLive] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const pending = useRef(new Map()); // item id -> in-flight mutation count
  const assetTimers = useRef(new Map());
  const email = user?.email || "team";

  const itemsRef = useRef(new Map()); // item id -> last known status (to notice a reel coming back from rendering)
  const liveRef = useRef(false);
  liveRef.current = live;
  const load = useCallback(async ({ silent } = {}) => {
    try {
      // While realtime is connected it keeps asset rows fresh, so silent polls skip the (large) asset table.
      const fresh = await backend.fetchAll({ withAssets: !(silent && liveRef.current) });
      setData((prev) => {
        // Keep optimistic local copies of rows that still have a mutation in flight.
        const items = fresh.items.map((r) => (pending.current.get(r.id) ? prev.items.find((p) => p.id === r.id) || r : r));
        return { ...fresh, assets: fresh.assets ?? prev.assets, items };
      });
      setStatus("ready");
      setError(null);
      setLastSync(new Date());
    } catch (e) {
      if (!silent) { setError(e); setStatus((s) => (s === "ready" ? s : "error")); }
    }
  }, [backend]);

  // Every download button reports failures here instead of throwing into its click handler.
  useEffect(() => {
    setDownloadErrorHandler((e, name) => toast({ tone: "danger", title: "Couldn't download", description: `${name}: ${e?.message || "the file is unavailable"}` }));
    return () => setDownloadErrorHandler(null);
  }, [toast]);

  // Initial load, realtime, 30 s poll fallback, refresh on focus.
  useEffect(() => {
    load();
    const refreshAssets = (itemId) => {
      clearTimeout(assetTimers.current.get(itemId));
      assetTimers.current.set(itemId, setTimeout(async () => {
        try {
          const rows = await backend.fetchAssets(itemId);
          setData((d) => ({ ...d, assets: [...d.assets.filter((a) => a.content_item_id !== itemId), ...rows] }));
        } catch { /* next poll will catch up */ }
      }, 400));
    };
    const unsub = backend.subscribe(({ table, eventType, row, old }) => {
      if (table === "assets") {
        // Asset rows change in sets (a new version swaps all of them): refetch that item's rows once, debounced.
        const itemId = row?.content_item_id || old?.content_item_id;
        if (itemId) refreshAssets(itemId);
        else if (eventType === "DELETE" && old?.id) setData((d) => ({ ...d, assets: d.assets.filter((a) => a.id !== old.id) }));
        setLastSync(new Date());
        return;
      }
      const key = TABLE_KEY[table];
      if (!key) return;
      if (table === "content_items" && row && row.type === "video" && row.status === "pending_review" && itemsRef.current.get(row.id) === "awaiting_voiceover") {
        toast({ tone: "ok", title: "Your reel is ready", description: "Rendered with your voice. It's back in review." });
      }
      setData((d) => {
        if (eventType === "DELETE") return { ...d, [key]: d[key].filter((r) => r.id !== old?.id) };
        if (!row) return d;
        if (key === "items" && pending.current.get(row.id)) return d;
        return { ...d, [key]: upsert(d[key], row, key) };
      });
      if (table === "content_items" && row) refreshAssets(row.id);
      setLastSync(new Date());
    }, setLive);
    const poll = setInterval(() => { if (document.visibilityState === "visible") load({ silent: true }); }, POLL_MS);
    const onFocus = () => load({ silent: true });
    window.addEventListener("focus", onFocus);
    return () => { unsub?.(); clearInterval(poll); window.removeEventListener("focus", onFocus); };
  }, [backend, load, toast]);

  // ---- low-level mutators -------------------------------------------------------------------------
  const setItemLocal = useCallback((id, patch) =>
    setData((d) => ({ ...d, items: d.items.map((r) => (r.id === id ? { ...r, ...patch } : r)) })), []);

  const writeItem = useCallback(async (item, patch) => {
    pending.current.set(item.id, (pending.current.get(item.id) || 0) + 1);
    setItemLocal(item.id, patch);
    try {
      const row = await backend.updateItem(item.id, patch);
      setItemLocal(item.id, row);
      return row;
    } finally {
      const n = (pending.current.get(item.id) || 1) - 1;
      n ? pending.current.set(item.id, n) : pending.current.delete(item.id);
    }
  }, [backend, setItemLocal]);

  /** Optimistic update with automatic revert on failure. */
  const mutateItem = useCallback(async (item, patch, { errorTitle = "Couldn't save" } = {}) => {
    const prev = Object.fromEntries(Object.keys(patch).map((k) => [k, item[k] ?? null]));
    try {
      return await writeItem(item, patch);
    } catch (e) {
      setItemLocal(item.id, prev);
      toast({ tone: "danger", title: errorTitle, description: e.message });
      throw e;
    }
  }, [writeItem, setItemLocal, toast]);

  const insertJob = useCallback(async (kind, payload) => {
    const row = await backend.insertJob(kind, payload, email);
    setData((d) => ({ ...d, jobs: upsert(d.jobs, row, "jobs") }));
    return row;
  }, [backend, email]);

  // ---- actions ---------------------------------------------------------------------------------------
  const undoable = useCallback((item, patch, toastOpts) => {
    const prev = Object.fromEntries(Object.keys(patch).map((k) => [k, item[k] ?? null]));
    const p = mutateItem(item, patch).catch(() => null);
    toast({
      ...toastOpts,
      duration: UNDO_MS,
      action: {
        label: "Undo",
        onClick: async () => {
          await p;
          await mutateItem({ ...item, ...patch }, prev, { errorTitle: "Couldn't undo" }).catch(() => {});
          toast({ title: "Undone", tone: "neutral", duration: 2200 });
        },
      },
    });
    return p;
  }, [mutateItem, toast]);

  const actions = useMemo(() => ({
    reload: () => load(),

    approve(item, { scheduledFor } = {}) {
      const patch = { status: "approved", approved_at: new Date().toISOString(), approved_by: email };
      if (item.type === "blog" && scheduledFor !== undefined) patch.scheduled_for = scheduledFor;
      const when = item.type === "blog" ? (patch.scheduled_for ?? item.scheduled_for) : null;
      return undoable(item, patch, {
        tone: "ok",
        title: `${TYPE_META[item.type]?.label || "Item"} approved`,
        description: item.type === "blog" ? (when ? `Publishes ${formatDateTime(when)} IST` : "Publishes at the next publish slot") : "Moved to Ready to post",
      });
    },

    async unapprove(item) {
      await mutateItem(item, { status: "pending_review", approved_at: null, approved_by: null });
      toast({ tone: "neutral", title: "Moved back to review", duration: 2600 });
    },

    reject(item) {
      return undoable(item, { status: "rejected" }, { tone: "neutral", title: `${TYPE_META[item.type]?.label || "Item"} rejected`, description: "It won't be published or posted." });
    },

    async requestChanges(item, feedback) {
      const text = feedback.trim();
      await mutateItem(item, { status: "changes_requested", feedback: text });
      try {
        await insertJob("regenerate", { content_item_id: item.id, feedback: text });
        toast({ tone: "warn", title: "Sent back for changes", description: "The next revision run rewrites it with your notes." });
      } catch (e) {
        toast({ tone: "danger", title: "Feedback saved, but the revision job failed", description: e.message });
      }
    },

    async publishNow(item) {
      if (item.status !== "approved" && item.status !== "published") {
        await mutateItem(item, { status: "approved", approved_at: new Date().toISOString(), approved_by: email, scheduled_for: new Date().toISOString() });
      }
      try {
        await insertJob("publish_now", { content_item_id: item.id });
        toast({ tone: "ok", title: "Publishing now", description: "The publisher picks this up within about 30 minutes." });
      } catch (e) {
        toast({ tone: "danger", title: "Couldn't queue publishing", description: e.message });
      }
    },

    async saveBlog(item, { title, description, markdown, wordCount }) {
      const body = item.body || {};
      const patch = {
        title,
        // The engine's check result described the old text; mark it stale so the viewer re-checks the edit itself.
        body: {
          ...body, markdown, word_count: wordCount, frontmatter: { ...(body.frontmatter || {}), title, description },
          checks: { ...(body.checks || {}), stale: true, edited_at: new Date().toISOString() },
        },
      };
      await mutateItem(item, patch);
      toast({ tone: "ok", title: "Changes saved", duration: 2400 });
    },

    async reschedule(item, scheduledFor) {
      await mutateItem(item, { scheduled_for: scheduledFor });
      toast({ tone: "ok", title: "Rescheduled", description: `Publishes ${formatDateTime(scheduledFor)} IST`, duration: 3000 });
    },

    markPosted(item, url) {
      const patch = { status: "published", published_at: new Date().toISOString(), published_url: url?.trim() || null };
      return undoable(item, patch, { tone: "info", title: "Marked as posted", description: "Moved to Published." });
    },

    async skipTopic(topic) {
      const prev = topic.status;
      const apply = (status) => setData((d) => ({ ...d, topics: d.topics.map((t) => (t.id === topic.id ? { ...t, status } : t)) }));
      apply("skipped");
      try {
        await backend.updateTopic(topic.id, { status: "skipped" });
      } catch (e) {
        apply(prev);
        toast({ tone: "danger", title: "Couldn't skip topic", description: e.message });
        return;
      }
      toast({
        tone: "neutral", title: "Topic skipped", description: topic.title, duration: UNDO_MS,
        action: { label: "Undo", onClick: async () => { apply(prev); await backend.updateTopic(topic.id, { status: prev }).catch(() => {}); } },
      });
    },

    async restoreTopic(topic, status = "planned") {
      const prev = topic.status;
      const apply = (s) => setData((d) => ({ ...d, topics: d.topics.map((t) => (t.id === topic.id ? { ...t, status: s } : t)) }));
      apply(status);
      try {
        await backend.updateTopic(topic.id, { status });
        toast({ tone: "ok", title: "Topic restored", description: topic.title, duration: 2600 });
      } catch (e) {
        apply(prev);
        toast({ tone: "danger", title: "Couldn't restore topic", description: e.message });
      }
    },

    async runWeekly() {
      try {
        await insertJob("run_weekly", { source: "dashboard" });
        toast({ tone: "ok", title: "Weekly run queued", description: "Research, topics and drafts arrive here as they're made." });
      } catch (e) {
        toast({ tone: "danger", title: "Couldn't queue the run", description: e.message });
      }
    },

    async saveSettings(changes) {
      const next = { ...data.settings, ...changes };
      const prev = data.settings;
      setData((d) => ({ ...d, settings: next }));
      try {
        const row = await backend.updateSettings(next);
        setData((d) => ({ ...d, settings: row.data }));
        toast({ tone: "ok", title: "Settings saved", description: "The next weekly run uses them.", duration: 2600 });
      } catch (e) {
        setData((d) => ({ ...d, settings: prev }));
        toast({ tone: "danger", title: "Couldn't save settings", description: e.message });
        throw e;
      }
    },

    fetchRunLog: (id) => backend.fetchRunLog(id),

    /** Upload one file to library/<uuid>/<file> and create its library_assets row. opts.onProgress(0..1). */
    async uploadLibrary(file, { kind, mime, title, notes = "", tags = [], contentItemId = null, onProgress, signal } = {}) {
      const type = mime || file.type || "application/octet-stream";
      const path = await backend.uploadLibraryFile(file, { mime: type, onProgress, signal });
      let row;
      try {
        row = await backend.insertLibrary({
          kind, storage_path: path, mime: type, title: (title || file.name).slice(0, 200), notes, tags,
          content_item_id: contentItemId, uploaded_by: email,
        });
      } catch (e) {
        // The file is stored but has no row: remove it so the bucket never collects orphans.
        await backend.removeLibraryFile?.(path).catch(() => {});
        throw e;
      }
      setData((d) => ({ ...d, library: upsert(d.library, row, "library") }));
      return row;
    },

    async updateLibrary(row, patch) {
      setData((d) => ({ ...d, library: d.library.map((r) => (r.id === row.id ? { ...r, ...patch } : r)) }));
      try {
        const fresh = await backend.updateLibrary(row.id, patch);
        setData((d) => ({ ...d, library: upsert(d.library, fresh, "library") }));
        return fresh;
      } catch (e) {
        setData((d) => ({ ...d, library: upsert(d.library, row, "library") }));
        toast({ tone: "danger", title: "Couldn't save", description: e.message });
        throw e;
      }
    },

    /** Queue the reel re-render with a voiceover that is already in the library (render_video job). */
    async renderWithVoiceover(item, libraryRow) {
      const busy = data.jobs.find((j) => j.kind === "render_video" && j.payload?.content_item_id === item.id && (j.status === "queued" || j.status === "running"));
      if (busy) throw new Error("A render with your voice is already in progress for this reel.");
      if (item.status !== "awaiting_voiceover") throw new Error("This reel isn't waiting for a voiceover any more.");
      const job = await insertJob("render_video", { content_item_id: item.id, library_asset_id: libraryRow.id });
      toast({ tone: "ok", title: "Rendering with your voice", description: "The reel is re-timed to your recording and comes back here for review." });
      return job;
    },

    /** Upload a recording for a reel (library row kind voiceover, linked to the item), then queue the render. */
    async uploadVoiceover(item, file, { mime, title, onProgress } = {}) {
      const row = await actions.uploadLibrary(file, {
        kind: "voiceover", mime, title: title || file.name.replace(/\.[^.]+$/, ""), contentItemId: item.id, tags: ["voiceover"], onProgress,
      });
      await actions.renderWithVoiceover(item, row);
      return row;
    },

    async deleteLibrary(row) {
      const rendering = data.jobs.some((j) => j.kind === "render_video" && j.payload?.library_asset_id === row.id && (j.status === "queued" || j.status === "running"));
      if (rendering) {
        toast({ tone: "warn", title: "This voiceover is being rendered", description: "Delete it after the reel is back in review." });
        return;
      }
      setData((d) => ({ ...d, library: d.library.filter((r) => r.id !== row.id) }));
      try {
        await backend.deleteLibrary(row);
        toast({ tone: "neutral", title: "Removed from library", duration: 2400 });
      } catch (e) {
        setData((d) => ({ ...d, library: upsert(d.library, row, "library") }));
        toast({ tone: "danger", title: "Couldn't remove", description: e.message });
      }
    },
  }), [backend, data.settings, data.jobs, email, insertJob, load, mutateItem, toast, undoable]);

  useEffect(() => { itemsRef.current = new Map(data.items.map((i) => [i.id, i.status])); }, [data.items]);

  // ---- derived ------------------------------------------------------------------------------------------
  const derived = useMemo(() => {
    const topicById = new Map(data.topics.map((t) => [t.id, t]));
    const itemById = new Map(data.items.map((i) => [i.id, i]));
    const reviewCount = data.items.filter((i) => i.status === "pending_review" || i.status === "awaiting_voiceover").length;
    const readyCount = data.items.filter((i) => i.type !== "blog" && i.status === "approved").length;
    const activeJobs = data.jobs.filter((j) => j.status === "queued" || j.status === "running");
    return { topicById, itemById, reviewCount, readyCount, activeJobs, jobLabel: (k) => JOB_KIND[k] || k };
  }, [data]);

  const value = useMemo(() => ({ ...data, ...derived, status, error, live, lastSync, actions, user, backend }),
    [data, derived, status, error, live, lastSync, actions, user, backend]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
