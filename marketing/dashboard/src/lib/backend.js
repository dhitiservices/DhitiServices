import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, STORAGE_BUCKET } from "./config.js";
import { slugifyFile, uuid } from "./format.js";
import { freshSignIn } from "./session.js";

/** What an emailed sign-in link put in the URL (implicit flow: `#access_token=...` or `#error=...`). */
function readLanding() {
  const out = { signedIn: false, error: null, dirty: false };
  try {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const query = new URLSearchParams(window.location.search);
    if (hash.get("access_token")) out.signedIn = out.dirty = true;
    const code = hash.get("error_code") || hash.get("error") || query.get("error_code") || query.get("error");
    if (code) out.error = { code, description: hash.get("error_description") || query.get("error_description") || "" };
    if (code) out.dirty = true;
  } catch { /* no URL access */ }
  return out;
}

function cleanLandingUrl(landing) {
  if (!landing.dirty) return;
  landing.dirty = false;
  try {
    const q = new URLSearchParams(window.location.search);
    ["error", "error_code", "error_description"].forEach((k) => q.delete(k));
    const search = q.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${search ? `?${search}` : ""}`);
  } catch { /* ignore */ }
}

/**
 * Supabase backend. Everything the dashboard does goes through RLS as the signed-in team member:
 * reads on all marketing tables; writes limited to settings/topics/content_items UPDATE, jobs INSERT (queued),
 * library_assets INSERT/DELETE and storage uploads under `library/`.
 * The demo backend (src/demo/backend.js) implements the same interface.
 */
export function createSupabaseBackend() {
  // An emailed sign-in link lands here with the session (or an error) in the URL hash. Read it before the client
  // consumes it: a fresh sign-in resets the idle clock, and a link error is shown on the login screen.
  const landing = readLanding();
  if (landing.signedIn) freshSignIn();

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    // Implicit flow: the emailed link carries the session in the hash, so it also works when opened on another
    // device (PKCE would need the verifier stored in the browser that asked for the code).
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" },
    realtime: { params: { eventsPerSecond: 5 } },
  });

  const must = ({ data, error }) => {
    if (error) throw Object.assign(new Error(error.message || "Request failed"), { code: error.code, details: error.details, status: error.status });
    return data;
  };
  const authMust = ({ data, error }) => {
    if (error) throw error; // keep status/code/name for the login screen's error mapping
    return data;
  };

  // LinkedIn tables (migration linkedin_core) may not exist yet: their reads fall back quietly, so the rest of the
  // studio keeps working while LinkedIn is dormant.
  const optional = async (q, fallback) => {
    try {
      const { data, error } = await q;
      return error ? fallback : data ?? fallback;
    } catch { return fallback; }
  };

  const ITEM_COLS = "id,topic_id,parent_id,type,title,status,body,feedback,version,scheduled_for,approved_at,approved_by,published_at,published_url,error,created_at,updated_at";
  const RUN_COLS = "id,kind,status,started_at,finished_at,usage,error";

  return {
    kind: "supabase",
    client: sb,

    auth: {
      /** Resolves once the client has read any session from the URL; then the hash is removed from the address bar. */
      async getSession() {
        const { data } = await sb.auth.getSession();
        cleanLandingUrl(landing);
        return data.session ?? null;
      },
      /** Error carried by an emailed link (expired, already used), or null. Read once. */
      takeUrlError() {
        const e = landing.error;
        landing.error = null;
        return e;
      },
      onChange(cb) {
        // Never call Supabase from inside this callback synchronously (it holds the auth lock): defer.
        const { data } = sb.auth.onAuthStateChange((event, session) => setTimeout(() => cb(session ?? null, event), 0));
        return () => data.subscription.unsubscribe();
      },
      /** Sends the 6-digit code (and link). shouldCreateUser: the database rejects any address not on the allowlist. */
      async sendCode(email) {
        authMust(await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: window.location.origin } }));
      },
      async verifyCode(email, token) {
        freshSignIn();
        const data = authMust(await sb.auth.verifyOtp({ email, token, type: "email" }));
        return data.session;
      },
      async signInWithPassword(email, password) {
        freshSignIn();
        const data = authMust(await sb.auth.signInWithPassword({ email, password }));
        return data.session;
      },
      async setPassword(password) {
        authMust(await sb.auth.updateUser({ password }));
      },
      /** Sign in with the link copied from the email (works even when the link would open the wrong page). */
      async verifyLink(link) {
        let u;
        try { u = new URL(String(link).trim()); } catch { throw new Error("That does not look like the sign-in link. Copy the whole link from the email."); }
        const expected = new URL(SUPABASE_URL).host;
        const tokenHash = u.searchParams.get("token") || u.searchParams.get("token_hash");
        const type = u.searchParams.get("type") || "magiclink";
        if (u.host !== expected || !tokenHash || !["magiclink", "signup", "email", "invite"].includes(type)) {
          throw new Error("That does not look like the sign-in link. Copy the whole link from the email.");
        }
        freshSignIn();
        const data = authMust(await sb.auth.verifyOtp({ token_hash: tokenHash, type: type === "signup" ? "signup" : "email" }));
        return data.session;
      },
      /** scope: 'local' (this browser) or 'global' (every device: revokes all refresh tokens). */
      async signOut(scope = "local") {
        const { error } = await sb.auth.signOut({ scope });
        // A global sign-out that fails (offline) must still end this browser's session.
        if (error && scope !== "local") await sb.auth.signOut({ scope: "local" });
        if (error && scope === "global") throw error;
      },
      async isAllowlisted() {
        return must(await sb.rpc("is_allowlisted")) === true;
      },
      async accessToken() {
        const { data } = await sb.auth.getSession();
        return data.session?.access_token || null;
      },
    },

    /** Everything the app shows. `withAssets: false` skips the asset rows (polls while realtime keeps them fresh). */
    async fetchAll({ withAssets = true } = {}) {
      const extra = Promise.all([
        optional(sb.from("social_posts").select("*").order("created_at", { ascending: false }).limit(200), []),
        optional(sb.from("linkedin_connection").select("*").eq("id", 1).maybeSingle(), null),
      ]);
      const [settings, runs, briefs, topics, items, assets, jobs, library] = await Promise.all([
        sb.from("settings").select("data,updated_at").eq("id", 1).maybeSingle().then(must),
        sb.from("runs").select(RUN_COLS).order("started_at", { ascending: false }).limit(40).then(must),
        sb.from("research_briefs").select("*").order("week_start", { ascending: false }).order("created_at", { ascending: false }).limit(12).then(must),
        sb.from("topics").select("*").order("week_start", { ascending: false }).order("priority", { ascending: true }).limit(240).then(must),
        sb.from("content_items").select(ITEM_COLS).order("created_at", { ascending: false }).limit(400).then(must),
        withAssets ? sb.from("assets").select("*").order("created_at", { ascending: false }).limit(5000).then(must) : Promise.resolve(undefined),
        sb.from("jobs").select("*").order("created_at", { ascending: false }).limit(60).then(must),
        sb.from("library_assets").select("*").order("created_at", { ascending: false }).limit(400).then(must),
      ]);
      const [socialPosts, linkedin] = await extra;
      return { settings: settings?.data ?? {}, settingsUpdatedAt: settings?.updated_at ?? null, runs, briefs, topics, items, assets, jobs, library, socialPosts, linkedin };
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

    /** RLS update of a social post (columns: caption, first_comment, format, status, scheduled_for; LINKEDIN.md 2.4). */
    async updateSocialPost(id, patch) {
      return must(await sb.from("social_posts").update(patch).eq("id", id).select("*").single());
    },
    /** The owner's kill switch (the only column the team may write on linkedin_connection). */
    async setLinkedinPaused(paused) {
      return must(await sb.from("linkedin_connection").update({ paused }).eq("id", 1).select("*").single());
    },

    /**
     * Calls a route of the `linkedin` Edge Function as the signed-in owner (team JWT). Secrets go only in the POST
     * body of save_app and are never kept, logged or returned. Throws Error with `.code` (the function's code, or
     * UNAVAILABLE while the function is not deployed, or NETWORK).
     */
    async linkedin(route, { method = "POST", body } = {}) {
      const token = (await sb.auth.getSession()).data.session?.access_token;
      if (!token) throw Object.assign(new Error("Your sign-in has ended. Sign in again."), { code: "UNAUTHORIZED" });
      let res;
      try {
        res = await fetch(`${SUPABASE_URL}/functions/v1/linkedin/${route}`, {
          method,
          headers: { authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY, ...(body ? { "content-type": "application/json" } : {}) },
          body: body ? JSON.stringify(body) : undefined,
          cache: "no-store",
          credentials: "omit",
          referrerPolicy: "no-referrer",
        });
      } catch {
        throw Object.assign(new Error("Couldn't reach LinkedIn setup. Check your connection and try again."), { code: "NETWORK" });
      }
      let j = null;
      try { j = await res.json(); } catch { /* not JSON */ }
      if (res.status === 404 && (!j || j.code === "NOT_FOUND" || /function was not found/i.test(j?.message || ""))) {
        throw Object.assign(new Error("LinkedIn posting is not switched on yet on the server."), { code: "UNAVAILABLE", status: 404 });
      }
      if (!res.ok || !j?.ok) throw Object.assign(new Error(j?.error || `Request failed (${res.status})`), { code: j?.code, status: res.status });
      return j.data;
    },

    async signUrls(paths, expiresIn) {
      const data = must(await sb.storage.from(STORAGE_BUCKET).createSignedUrls(paths, expiresIn));
      return data.map((d) => ({ path: d.path, signedUrl: d.signedUrl, error: d.error }));
    },

    /**
     * Upload to `library/<uuid>/<file>` with progress (XHR to the Storage REST API as the signed-in user; RLS allows
     * team inserts under library/ only). onProgress(0..1). Resolves with the storage path.
     */
    async uploadLibraryFile(file, { mime, onProgress, signal } = {}) {
      const path = `library/${uuid()}/${slugifyFile(file.name)}`;
      const token = (await sb.auth.getSession()).data.session?.access_token;
      if (!token) throw new Error("Your session has ended. Sign in again.");
      const url = `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", url);
        xhr.setRequestHeader("authorization", `Bearer ${token}`);
        xhr.setRequestHeader("apikey", SUPABASE_ANON_KEY);
        xhr.setRequestHeader("content-type", mime || file.type || "application/octet-stream");
        xhr.setRequestHeader("cache-control", "max-age=31536000");
        xhr.setRequestHeader("x-upsert", "false");
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) { onProgress?.(1); return resolve(); }
          let m = `Upload failed (${xhr.status})`;
          try { const j = JSON.parse(xhr.responseText); m = j.message || j.error || m; } catch { /* not JSON */ }
          if (xhr.status === 413 || /maximum allowed size|too large/i.test(m)) m = "The file is larger than storage allows.";
          if (xhr.status === 401 || xhr.status === 403) m = "Upload not allowed. Sign in again and retry.";
          reject(new Error(m));
        };
        xhr.onerror = () => reject(new Error("Network error while uploading. Check your connection and retry."));
        xhr.onabort = () => reject(Object.assign(new Error("Upload cancelled"), { name: "AbortError" }));
        signal?.addEventListener("abort", () => xhr.abort(), { once: true });
        xhr.send(file);
      });
      return path;
    },
    async insertLibrary(row) {
      return must(await sb.from("library_assets").insert(row).select("*").single());
    },
    async updateLibrary(id, patch) {
      return must(await sb.from("library_assets").update(patch).eq("id", id).select("*").single());
    },
    /** Row first (so the app never points at a missing file), then the object; both errors surface. */
    async deleteLibrary(row) {
      must(await sb.from("library_assets").delete().eq("id", row.id));
      if (row.storage_path?.startsWith("library/")) must(await sb.storage.from(STORAGE_BUCKET).remove([row.storage_path]));
    },
    async removeLibraryFile(path) {
      if (path?.startsWith("library/")) must(await sb.storage.from(STORAGE_BUCKET).remove([path]));
    },

    /**
     * Realtime row changes (tables are in the supabase_realtime publication; RLS applies per event). Returns an
     * unsubscribe function. `onStatus(true|false)` reports liveness: true only once the server has acknowledged the
     * postgres_changes subscription (SUBSCRIBED), false on CHANNEL_ERROR / TIMED_OUT / CLOSED.
     */
    subscribe(onChange, onStatus) {
      const ch = sb.channel("dashboard-live");
      for (const table of ["content_items", "jobs", "runs", "topics", "library_assets", "assets"]) {
        ch.on("postgres_changes", { event: "*", schema: "public", table }, (p) =>
          onChange({ table, eventType: p.eventType, row: p.new && Object.keys(p.new).length ? p.new : null, old: p.old }));
      }
      ch.subscribe((status, err) => {
        if (err) console.warn("realtime:", status, err.message || err);
        onStatus?.(status === "SUBSCRIBED");
      });
      // LinkedIn tables on their own channel: while they don't exist yet, a failure here must not mark the studio
      // offline. The 30 s poll keeps them fresh either way.
      const li = sb.channel("dashboard-linkedin");
      for (const table of ["social_posts", "linkedin_connection"]) {
        li.on("postgres_changes", { event: "*", schema: "public", table }, (p) =>
          onChange({ table, eventType: p.eventType, row: p.new && Object.keys(p.new).length ? p.new : null, old: p.old }));
      }
      li.subscribe(() => {});
      return () => { sb.removeChannel(ch); sb.removeChannel(li); };
    },
  };
}
