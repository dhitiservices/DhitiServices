import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { POLL_MS, UNDO_MS } from "./config.js";
import { useToast } from "../components/Toast.jsx";
import { formatDateTime } from "./format.js";
import { setDownloadErrorHandler } from "./media.js";
import { TYPE_META, JOB_KIND } from "./model.js";
import { friendlyError, FORMAT_LABEL, formatOptions, autoPostOf } from "./linkedin.js";
import { factsClear } from "./claims.js";

const DataContext = createContext(null);
export const useData = () => useContext(DataContext);

const EMPTY = { settings: {}, runs: [], briefs: [], topics: [], items: [], assets: [], jobs: [], library: [], socialPosts: [], linkedin: null };
const TABLE_KEY = { content_items: "items", jobs: "jobs", runs: "runs", topics: "topics", library_assets: "library", social_posts: "socialPosts" };
const SORTS = {
  items: (a, b) => (b.created_at || "").localeCompare(a.created_at || ""),
  jobs: (a, b) => (b.created_at || "").localeCompare(a.created_at || ""),
  runs: (a, b) => (b.started_at || "").localeCompare(a.started_at || ""),
  topics: (a, b) => (b.week_start || "").localeCompare(a.week_start || "") || (a.priority ?? 0) - (b.priority ?? 0),
  library: (a, b) => (b.created_at || "").localeCompare(a.created_at || ""),
  socialPosts: (a, b) => (b.created_at || "").localeCompare(a.created_at || ""),
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
  // A background refresh that failed after the first successful load: { at: Date, message }. Cleared by the next
  // successful load. The shell shows "Offline · last synced …" instead of the green Live dot while it is set.
  const [syncError, setSyncError] = useState(null);
  const pending = useRef(new Map()); // item id -> in-flight mutation count
  const pendingSocial = useRef(new Map()); // social post id -> in-flight write count
  const assetTimers = useRef(new Map());
  const email = user?.email || "team";

  const itemsRef = useRef(new Map()); // item id -> last known status (to notice a reel coming back from rendering)
  const liveRef = useRef(false);
  liveRef.current = live;
  const statusRef = useRef(status);
  statusRef.current = status;
  const load = useCallback(async ({ silent } = {}) => {
    try {
      // While realtime is connected it keeps asset rows fresh, so silent polls skip the (large) asset table.
      const fresh = await backend.fetchAll({ withAssets: !(silent && liveRef.current) });
      setData((prev) => {
        // Keep optimistic local copies of rows that still have a mutation in flight.
        const items = fresh.items.map((r) => (pending.current.get(r.id) ? prev.items.find((p) => p.id === r.id) || r : r));
        return { ...fresh, assets: fresh.assets ?? prev.assets, items, socialPosts: fresh.socialPosts ?? [], linkedin: fresh.linkedin ?? null };
      });
      setStatus("ready");
      setError(null);
      setSyncError(null);
      setLastSync(new Date());
    } catch (e) {
      const failure = { at: new Date(), message: e?.message || "Request failed" };
      if (silent) { setSyncError(failure); return; }
      setError(e);
      // After the first load the data on screen is still valid (just stale): keep it, flag the shell as offline.
      if (statusRef.current === "ready") setSyncError(failure);
      else setStatus("error");
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
      if (table === "linkedin_connection") {
        if (row) setData((d) => ({ ...d, linkedin: { ...(d.linkedin || {}), ...row } }));
        setLastSync(new Date());
        return;
      }
      const key = TABLE_KEY[table];
      if (!key) return;
      if (table === "content_items" && row && row.type === "video" && row.status === "pending_review" && itemsRef.current.get(row.id) === "awaiting_voiceover") {
        toast({ tone: "ok", title: "Your reel is ready", description: "Your voice is on it. Take a look." });
      }
      setData((d) => {
        if (eventType === "DELETE") return { ...d, [key]: d[key].filter((r) => r.id !== old?.id) };
        if (!row) return d;
        if (key === "items" && pending.current.get(row.id)) return d;
        if (key === "socialPosts" && pendingSocial.current.get(row.id)) return d;
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

  /** Optimistic social_posts update (RLS + the guard trigger); reverts and explains on failure. */
  const socialRef = useRef([]);
  socialRef.current = data.socialPosts;
  const writeSocial = useCallback(async (post, patch, { errorTitle = "Couldn't save the LinkedIn post", quiet } = {}) => {
    const setLocal = (p) => setData((d) => ({ ...d, socialPosts: d.socialPosts.map((r) => (r.id === post.id ? { ...r, ...p } : r)) }));
    const prev = Object.fromEntries(Object.keys(patch).map((k) => [k, post[k] ?? null]));
    pendingSocial.current.set(post.id, (pendingSocial.current.get(post.id) || 0) + 1);
    setLocal(patch);
    try {
      const row = await backend.updateSocialPost(post.id, patch);
      setLocal(row);
      return row;
    } catch (e) {
      setLocal(prev);
      const m = String(e?.message || "");
      const first = m.match(/approve the (\w+) first/i);
      if (!quiet) toast({ tone: "danger", title: errorTitle, description: first ? `Approve the ${FORMAT_LABEL[first[1]]?.toLowerCase() || first[1]} first.` : m || "Try again." });
      throw e;
    } finally {
      const n = (pendingSocial.current.get(post.id) || 1) - 1;
      n ? pendingSocial.current.set(post.id, n) : pendingSocial.current.delete(post.id);
    }
  }, [backend, toast]);

  // ---- actions ---------------------------------------------------------------------------------------
  const undoable = useCallback((item, patch, toastOpts, { after, onUndo } = {}) => {
    const prev = Object.fromEntries(Object.keys(patch).map((k) => [k, item[k] ?? null]));
    const p = mutateItem(item, patch).then((row) => (row && after ? after(row).then(() => row) : row)).catch(() => null);
    toast({
      ...toastOpts,
      duration: UNDO_MS,
      action: {
        label: "Undo",
        onClick: async () => {
          await p;
          await mutateItem({ ...item, ...patch }, prev, { errorTitle: "Couldn't undo" }).catch(() => {});
          if (onUndo) await onUndo().catch(() => {});
          toast({ title: "Undone", tone: "neutral", duration: 2200 });
        },
      },
    });
    return p;
  }, [mutateItem, toast]);

  const actions = useMemo(() => ({
    /** Full reload; from the error screen it shows the loading skeletons again until it settles. */
    reload: async () => {
      setStatus((s) => (s === "error" ? "loading" : s));
      await load();
    },

    /**
     * Approve. For a blog: optional publish time, and `social` = {post, format, caption, first_comment, creativeId} to
     * also approve its LinkedIn post (a carousel or graphic it posts is approved too: the owner looked at every page of
     * it in the post preview). Undo puts back the blog, the LinkedIn post and that creative.
     */
    approve(item, { scheduledFor, social } = {}) {
      const patch = { status: "approved", approved_at: new Date().toISOString(), approved_by: email };
      if (item.type === "blog" && scheduledFor !== undefined) patch.scheduled_for = scheduledFor;
      const when = item.type === "blog" ? (patch.scheduled_for ?? item.scheduled_for) : null;
      const label = TYPE_META[item.type]?.label || "It";
      let socialDone = null;
      const after = social?.post ? async () => {
        try {
          socialDone = await actions.approveSocial(social.post, social, { quiet: false });
        } catch { /* toast shown */ }
      } : undefined;
      const onUndo = social?.post ? async () => {
        if (!socialDone) return;
        await writeSocial(socialDone.row, { status: "pending_review" }, { quiet: true });
        if (socialDone.creative) await mutateItem(socialDone.creative, { status: "pending_review", approved_at: null, approved_by: null }, { errorTitle: "Couldn't undo" });
      } : undefined;
      return undoable(item, patch, {
        tone: "ok",
        title: `${label} approved`,
        description: item.type === "blog"
          ? `${when ? `Goes live ${formatDateTime(when)}` : "Goes live at the next slot"}${social?.post ? ". Then it posts on LinkedIn." : "."}`
          : "It's in Ready to post.",
      }, { after, onUndo });
    },

    /**
     * Approve the LinkedIn post of a blog. A carousel or graphic it posts that still waits for review is approved too
     * (the same item the preview showed: `creativeId`, else the formatOptions pick). A reel is never approved here.
     * The caption, first comment and format are always sent exactly as shown, so the database approves what the
     * owner saw even if the row changed since the screen loaded. Returns { row, creative } (creative = the item this
     * call approved, or null).
     */
    async approveSocial(post, { format, caption, first_comment, creativeId } = {}, opts = {}) {
      const fmt = format || post.format;
      const blog = itemsRef.list.find((i) => i.id === post.blog_item_id);
      const pick = creativeId ? itemsRef.list.find((i) => i.id === creativeId) : blog ? formatOptions(blog, itemsRef.list).find((o) => o.format === fmt)?.item : null;
      let creative = null;
      if (pick && pick.type === fmt && fmt !== "video" && pick.status === "pending_review") {
        await mutateItem(pick, { status: "approved", approved_at: new Date().toISOString(), approved_by: email });
        creative = { ...pick, status: "approved" };
      }
      const patch = { status: "approved", format: fmt, caption: caption ?? post.caption, first_comment: first_comment ?? post.first_comment };
      try {
        const row = await writeSocial(post, patch, { errorTitle: "Couldn't approve the LinkedIn post", ...opts });
        return { row, creative };
      } catch (e) {
        if (creative) await mutateItem(creative, { status: "pending_review", approved_at: null, approved_by: null }).catch(() => {});
        throw e;
      }
    },

    async unapprove(item) {
      await mutateItem(item, { status: "pending_review", approved_at: null, approved_by: null });
      toast({ tone: "neutral", title: "Approval undone", description: "It's back in Review.", duration: 2600 });
    },

    reject(item) {
      return undoable(item, { status: "rejected" }, { tone: "neutral", title: "Not used", description: "It won't go live or be posted." });
    },

    async requestChanges(item, feedback) {
      const text = feedback.trim();
      await mutateItem(item, { status: "changes_requested", feedback: text });
      try {
        await insertJob("regenerate", { content_item_id: item.id, feedback: text });
        toast({ tone: "warn", title: "Sent back", description: "We fix it with your notes and send it back, usually within a day." });
      } catch (e) {
        toast({ tone: "danger", title: "Your note is saved, but the fix didn't start", description: e.message });
      }
    },

    async publishNow(item) {
      // Same gate as Approve: only a blog waiting for review with every fact checked can be approved this way.
      if (item.status !== "approved" && item.status !== "published" && (item.status !== "pending_review" || !factsClear(item.body))) {
        toast({ tone: "neutral", title: "Not yet", description: "Approve it first, so you can check the facts." });
        return;
      }
      if (item.status !== "approved" && item.status !== "published") {
        await mutateItem(item, { status: "approved", approved_at: new Date().toISOString(), approved_by: email, scheduled_for: new Date().toISOString() });
      }
      try {
        await insertJob("publish_now", { content_item_id: item.id });
        toast({ tone: "ok", title: "Going live soon", description: "It goes live on the website within about 30 minutes." });
      } catch (e) {
        toast({ tone: "danger", title: "Couldn't put it live", description: e.message });
      }
    },

    /* ---- LinkedIn posts ---- */
    async saveSocial(post, patch) {
      await writeSocial(post, patch);
      toast({ tone: "ok", title: "LinkedIn post saved", duration: 2200 });
    },
    async unapproveSocial(post) {
      await writeSocial(post, { status: "pending_review" });
      toast({ tone: "neutral", title: "Won't post yet", description: "Approve it again when you're ready.", duration: 2600 });
    },
    async cancelSocial(post) {
      await writeSocial(post, { status: "cancelled" });
      toast({ tone: "neutral", title: "Won't post on LinkedIn", description: "The blog still goes live as planned.", duration: 2800 });
    },
    async retrySocial(post) {
      await writeSocial(post, { status: "approved" });
      toast({ tone: "ok", title: "Trying again", description: "It goes out on LinkedIn in a few minutes.", duration: 2800 });
    },
    async publishSocialNow(post) {
      try {
        const r = await backend.linkedin("publish_now", { body: { social_post_id: post.id } });
        setData((d) => ({ ...d, socialPosts: d.socialPosts.map((x) => (x.id === post.id ? { ...x, ...r } : x)) }));
        toast({ tone: "ok", title: "Posting on LinkedIn now", description: "It shows up on the Dhiti Services page in a minute or two." });
      } catch (e) {
        toast({ tone: e?.code === "BLOG_NOT_LIVE" ? "neutral" : "danger", title: e?.code === "BLOG_NOT_LIVE" ? "Not yet" : "Couldn't post", description: friendlyError(e) });
      }
    },
    async retryComment(post) {
      try {
        const r = await backend.linkedin("retry_comment", { body: { social_post_id: post.id } });
        setData((d) => ({ ...d, socialPosts: d.socialPosts.map((x) => (x.id === post.id ? { ...x, ...r } : x)) }));
        toast({ tone: "ok", title: "Sending the comment again", duration: 2600 });
      } catch (e) {
        toast({ tone: "danger", title: "Couldn't send the comment", description: friendlyError(e) });
      }
    },

    /* ---- LinkedIn connection (Settings) ---- */
    linkedinStatus: () => backend.linkedin("status", { method: "GET" }),
    /** Sends the keys straight to the linkedin function. The caller clears its fields right after. */
    linkedinSaveApp: (clientId, clientSecret) => backend.linkedin("save_app", { body: { client_id: clientId, client_secret: clientSecret } }),
    async linkedinConnect() {
      const r = await backend.linkedin("oauth/start", { body: {} });
      const url = String(r?.authorize_url || "");
      // Top-level navigation only to LinkedIn's consent page (or the demo's own callback).
      if (!/^https:\/\/www\.linkedin\.com\/oauth\/v2\/authorization\?/.test(url) && !(backend.kind === "demo" && url.startsWith(window.location.origin))) {
        throw Object.assign(new Error("LinkedIn sent back an unexpected link. Nothing was opened."), { code: "BAD_URL" });
      }
      window.location.assign(url);
    },
    linkedinSelectOrg: (orgUrn) => backend.linkedin("select_org", { body: { org_urn: orgUrn } }),
    linkedinDisconnect: (forgetApp) => backend.linkedin("disconnect", { body: forgetApp ? { forget_app: true } : {} }),
    async linkedinPause(paused) {
      const row = await backend.setLinkedinPaused(paused);
      setData((d) => ({ ...d, linkedin: { ...(d.linkedin || {}), ...row } }));
      toast({ tone: "neutral", title: paused ? "LinkedIn posting paused" : "LinkedIn posting is on again", duration: 2400 });
      return row;
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
      toast({ tone: "ok", title: "New time saved", description: `Goes live ${formatDateTime(scheduledFor)}`, duration: 3000 });
    },

    markPosted(item, url) {
      const patch = { status: "published", published_at: new Date().toISOString(), published_url: url?.trim() || null };
      return undoable(item, patch, { tone: "info", title: "Marked as posted", description: "You'll find it in Live." });
    },

    async skipTopic(topic) {
      const prev = topic.status;
      const apply = (status) => setData((d) => ({ ...d, topics: d.topics.map((t) => (t.id === topic.id ? { ...t, status } : t)) }));
      apply("skipped");
      try {
        await backend.updateTopic(topic.id, { status: "skipped" });
      } catch (e) {
        apply(prev);
        toast({ tone: "danger", title: "Couldn't skip it", description: e.message });
        return;
      }
      toast({
        tone: "neutral", title: "Skipped", description: topic.title, duration: UNDO_MS,
        action: { label: "Undo", onClick: async () => { apply(prev); await backend.updateTopic(topic.id, { status: prev }).catch(() => {}); } },
      });
    },

    async restoreTopic(topic, status = "planned") {
      const prev = topic.status;
      const apply = (s) => setData((d) => ({ ...d, topics: d.topics.map((t) => (t.id === topic.id ? { ...t, status: s } : t)) }));
      apply(status);
      try {
        await backend.updateTopic(topic.id, { status });
        toast({ tone: "ok", title: "Brought back", description: topic.title, duration: 2600 });
      } catch (e) {
        apply(prev);
        toast({ tone: "danger", title: "Couldn't bring it back", description: e.message });
      }
    },

    async runWeekly() {
      try {
        await insertJob("run_weekly", { source: "dashboard" });
        toast({ tone: "ok", title: "Making this week's blogs", description: "New blogs show up here as they're ready, in a few hours." });
      } catch (e) {
        toast({ tone: "danger", title: "Couldn't start", description: e.message });
      }
    },

    async saveSettings(changes) {
      const next = { ...data.settings, ...changes };
      const prev = data.settings;
      setData((d) => ({ ...d, settings: next }));
      try {
        const row = await backend.updateSettings(next);
        setData((d) => ({ ...d, settings: row.data }));
        toast({ tone: "ok", title: "Settings saved", description: "We use them from the next batch of blogs.", duration: 2600 });
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
      if (busy) throw new Error("Your voice is already being added to this reel.");
      if (item.status !== "awaiting_voiceover") throw new Error("This reel doesn't need your voice any more.");
      const job = await insertJob("render_video", { content_item_id: item.id, library_asset_id: libraryRow.id });
      toast({ tone: "ok", title: "Got your voice", description: "We time the reel to it and send it back to you, usually within a day." });
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
        toast({ tone: "warn", title: "This recording is in use right now", description: "Delete it after the reel is ready." });
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
  }), [backend, data.settings, data.jobs, email, insertJob, load, mutateItem, toast, undoable, writeSocial]);

  useEffect(() => { itemsRef.current = new Map(data.items.map((i) => [i.id, i.status])); }, [data.items]);
  itemsRef.list = data.items;

  // ---- derived ------------------------------------------------------------------------------------------
  const derived = useMemo(() => {
    const topicById = new Map(data.topics.map((t) => [t.id, t]));
    const itemById = new Map(data.items.map((i) => [i.id, i]));
    const reviewCount = data.items.filter((i) => i.status === "pending_review" || i.status === "awaiting_voiceover").length;
    const activeJobs = data.jobs.filter((j) => j.status === "queued" || j.status === "running");
    // The LinkedIn post of each blog: the newest row that is not cancelled (one active row per blog).
    const socialByBlog = new Map();
    for (const p of data.socialPosts) if (p.status !== "cancelled" && !socialByBlog.has(p.blog_item_id)) socialByBlog.set(p.blog_item_id, p);
    // Ready to post (by hand): approved creatives that LinkedIn does not post by itself.
    const readyCount = data.items.filter((i) => i.type !== "blog" && i.status === "approved" && !autoPostOf(i, socialByBlog, data.items)).length;
    return { topicById, itemById, reviewCount, readyCount, activeJobs, socialByBlog, jobLabel: (k) => JOB_KIND[k] || k };
  }, [data]);

  const value = useMemo(() => ({ ...data, ...derived, status, error, syncError, live, lastSync, actions, user, backend }),
    [data, derived, status, error, syncError, live, lastSync, actions, user, backend]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
