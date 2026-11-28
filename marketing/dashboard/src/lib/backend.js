import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, STORAGE_BUCKET } from "./config.js";
import { slugifyFile, uuid } from "./format.js";

/**
 * Supabase backend. Everything the dashboard does goes through RLS as the signed-in team member:
 * reads on all marketing tables; writes limited to settings/topics/content_items UPDATE, jobs INSERT (queued),
 * library_assets INSERT/DELETE and storage uploads under `library/`.
 * The demo backend (src/demo/backend.js) implements the same interface.
 */
export function createSupabaseBackend() {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" },
    realtime: { params: { eventsPerSecond: 5 } },
  });

  const must = ({ data, error }) => {
    if (error) throw Object.assign(new Error(error.message || "Request failed"), { code: error.code, details: error.details });
    return data;
  };

  const ITEM_COLS = "id,topic_id,parent_id,type,title,status,body,feedback,version,scheduled_for,approved_at,approved_by,published_at,published_url,error,created_at,updated_at";
  const RUN_COLS = "id,kind,status,started_at,finished_at,usage,error";

  return {
    kind: "supabase",
    client: sb,

    auth: {
      async getSession() {
        const { data } = await sb.auth.getSession();
        return data.session ?? null;
      },
      onChange(cb) {
        const { data } = sb.auth.onAuthStateChange((_event, session) => cb(session ?? null));
        return () => data.subscription.unsubscribe();
      },
      async signInWithOtp(email) {
        must(await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } }));
      },
      async signInWithPassword(email, password) {
        must(await sb.auth.signInWithPassword({ email, password }));
      },
      async signOut() {
        await sb.auth.signOut();
      },
      async isTeam() {
        return must(await sb.rpc("is_team")) === true;
      },
    },

    async fetchAll() {
      const [settings, runs, briefs, topics, items, assets, jobs, library] = await Promise.all([
        sb.from("settings").select("data,updated_at").eq("id", 1).maybeSingle().then(must),
        sb.from("runs").select(RUN_COLS).order("started_at", { ascending: false }).limit(40).then(must),
        sb.from("research_briefs").select("*").order("week_start", { ascending: false }).order("created_at", { ascending: false }).limit(12).then(must),
        sb.from("topics").select("*").order("week_start", { ascending: false }).order("priority", { ascending: true }).limit(240).then(must),
        sb.from("content_items").select(ITEM_COLS).order("created_at", { ascending: false }).limit(400).then(must),
        sb.from("assets").select("*").order("created_at", { ascending: false }).limit(5000).then(must),
        sb.from("jobs").select("*").order("created_at", { ascending: false }).limit(60).then(must),
        sb.from("library_assets").select("*").order("created_at", { ascending: false }).limit(400).then(must),
      ]);
      return { settings: settings?.data ?? {}, settingsUpdatedAt: settings?.updated_at ?? null, runs, briefs, topics, items, assets, jobs, library };
    },

    async fetchItem(id) {
      return must(await sb.from("content_items").select(ITEM_COLS).eq("id", id).maybeSingle());
    },
    async fetchAssets(itemId) {
      return must(await sb.from("assets").select("*").eq("content_item_id", itemId).order("position"));
    },
    async fetchRunLog(id) {
      const row = must(await sb.from("runs").select("log").eq("id", id).maybeSingle());
      return row?.log ?? "";
    },

    async updateItem(id, patch) {
      return must(await sb.from("content_items").update(patch).eq("id", id).select(ITEM_COLS).single());
    },
    async updateTopic(id, patch) {
      return must(await sb.from("topics").update(patch).eq("id", id).select("*").single());
    },
    async updateSettings(data) {
      return must(await sb.from("settings").update({ data }).eq("id", 1).select("data,updated_at").single());
    },
    async insertJob(kind, payload, requestedBy) {
      return must(await sb.from("jobs").insert({ kind, payload, status: "queued", requested_by: requestedBy }).select("*").single());
    },

    async signUrls(paths, expiresIn) {
      const data = must(await sb.storage.from(STORAGE_BUCKET).createSignedUrls(paths, expiresIn));
      return data.map((d) => ({ path: d.path, signedUrl: d.signedUrl, error: d.error }));
    },

    async uploadLibraryFile(file) {
      const path = `library/${uuid()}/${slugifyFile(file.name)}`;
      must(await sb.storage.from(STORAGE_BUCKET).upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false, cacheControl: "31536000" }));
      return path;
    },
    async insertLibrary(row) {
      return must(await sb.from("library_assets").insert(row).select("*").single());
    },
    async updateLibrary(id, patch) {
      return must(await sb.from("library_assets").update(patch).eq("id", id).select("*").single());
    },
    async deleteLibrary(row) {
      if (row.storage_path?.startsWith("library/")) await sb.storage.from(STORAGE_BUCKET).remove([row.storage_path]);
      must(await sb.from("library_assets").delete().eq("id", row.id));
    },

    /** Realtime row changes. Returns an unsubscribe function. `onStatus(true|false)` reports liveness. */
    subscribe(onChange, onStatus) {
      const ch = sb.channel("dashboard-live");
      for (const table of ["content_items", "jobs", "runs", "topics", "library_assets"]) {
        ch.on("postgres_changes", { event: "*", schema: "public", table }, (p) =>
          onChange({ table, eventType: p.eventType, row: p.new && Object.keys(p.new).length ? p.new : null, old: p.old }));
      }
      ch.subscribe((status) => onStatus?.(status === "SUBSCRIBED"));
      return () => { sb.removeChannel(ch); };
    },
  };
}
