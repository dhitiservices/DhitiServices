// Dhiti Marketing: Supabase Edge Function "linkedin" (entry point).
//
// Contract: marketing/LINKEDIN.md. The logic lives in core.ts; this file wires it to Supabase:
//   - the service-role client (SUPABASE_SERVICE_ROLE_KEY, injected by Supabase, never leaves this function);
//   - team auth: auth.getUser(jwt) and then rpc('is_team') through a client that carries the user's JWT;
//   - secrets through the service-role-only SQL functions linkedin_secret_get/set/delete/exists (Supabase Vault).
//
// Deployed with verify_jwt = false (the OAuth callback is a browser redirect from LinkedIn and publish_due is called
// by pg_cron); every route authenticates itself in core.ts.

import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { type Conn, createHandler, type Db, loadConfig, type Post, type PostExpect } from "./core.ts";
import { linkedinFetch, WRITE_CLIENT_MODE } from "./http.ts";

// Public by design (ARCHITECTURE.md): used only to call is_team() as the signed-in user.
const PUBLISHABLE_KEY = "sb_publishable_eggopcLFltAS1Q3nTmGecQ_dUMTCIhR";
const BUCKET = "marketing";

const config = loadConfig((k) => Deno.env.get(k));
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

const admin = createClient(config.supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

type PgErr = { code?: string; message?: string } | null;
function check(label: string, error: PgErr) {
  // Never include values in errors: messages from PostgREST can echo input, so keep only code + label.
  if (error) throw new Error(`${label} failed (${error.code ?? "db"})`);
}

const POST_COLS = "*";

const db: Db = {
  async authTeam(jwt) {
    const { data, error } = await admin.auth.getUser(jwt);
    if (error || !data?.user?.id || !data.user.email) return null;
    const asUser = createClient(config.supabaseUrl, PUBLISHABLE_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const r = await asUser.rpc("is_team");
    if (r.error || r.data !== true) return null;
    return { id: data.user.id, email: data.user.email };
  },

  async getConnection() {
    const { data, error } = await admin.from("linkedin_connection").select("*").eq("id", 1).single();
    check("read connection", error);
    return data as Conn;
  },

  async updateConnection(patch) {
    const { data, error } = await admin.from("linkedin_connection").update(patch).eq("id", 1).select("*").single();
    check("update connection", error);
    return data as Conn;
  },

  async secretGet(name) {
    const { data, error } = await admin.rpc("linkedin_secret_get", { p_name: name });
    check("read secret", error);
    return typeof data === "string" && data ? data : null;
  },

  async secretExists(name) {
    const { data, error } = await admin.rpc("linkedin_secret_exists", { p_name: name });
    check("check secret", error);
    return data === true;
  },

  async secretSet(name, value) {
    const { error } = await admin.rpc("linkedin_secret_set", { p_name: name, p_value: value });
    check("save secret", error);
  },

  async secretDelete(name) {
    const { error } = await admin.rpc("linkedin_secret_delete", { p_name: name });
    check("delete secret", error);
  },

  async stateCreate(hash, userId, email) {
    const { data, error } = await admin.rpc("linkedin_oauth_state_create", { p_state_hash: hash, p_user_id: userId, p_user_email: email });
    check("create state", error);
    return String(data);
  },

  async stateConsume(hash) {
    const { data, error } = await admin.rpc("linkedin_oauth_state_consume", { p_state_hash: hash });
    check("consume state", error);
    const row = Array.isArray(data) ? data[0] : data;
    return row ? { user_id: row.user_id, user_email: row.user_email, owner_ok: row.owner_ok === true } : null;
  },

  async duePosts(limit) {
    const { data, error } = await admin.rpc("linkedin_due_posts", { p_limit: limit });
    check("list due posts", error);
    return ((data ?? []) as unknown[]).map((r) => (typeof r === "string" ? r : (r as { linkedin_due_posts?: string; id?: string }).linkedin_due_posts ?? (r as { id?: string }).id ?? "")).filter(Boolean);
  },

  async getPost(id) {
    const { data, error } = await admin.from("social_posts").select(POST_COLS).eq("id", id).maybeSingle();
    check("read post", error);
    return (data as Post) ?? null;
  },

  async claimPost(id, leaseSeconds) {
    const { data, error } = await admin.rpc("linkedin_claim_post", { p_id: id, p_lease_seconds: leaseSeconds });
    check("claim post", error);
    const row = Array.isArray(data) ? data[0] : data;
    return (row as Post) ?? null;
  },

  async updatePost(id, expect: PostExpect, patch: Partial<Post>) {
    let q = admin.from("social_posts").update(patch).eq("id", id);
    for (const k of ["status", "stage", "comment_status", "lock_until"] as const) {
      if (!(k in expect)) continue;
      const v = expect[k];
      q = v === null ? q.is(k, null) : q.eq(k, v as string);
    }
    const { data, error } = await q.select(POST_COLS);
    check("update post", error);
    return Array.isArray(data) && data.length === 1 ? (data[0] as Post) : null;
  },

  async getItem(id) {
    const { data, error } = await admin
      .from("content_items")
      .select("id, parent_id, type, title, status, body, published_url")
      .eq("id", id)
      .maybeSingle();
    check("read item", error);
    return data ?? null;
  },

  async listAssets(itemId) {
    const { data, error } = await admin
      .from("assets")
      .select("id, content_item_id, kind, storage_path, mime, width, height, position, created_at")
      .eq("content_item_id", itemId);
    check("list assets", error);
    return data ?? [];
  },

  async download(path) {
    if (!/^items\/[0-9a-f-]{36}\/[\w.\-/]+$/i.test(path) || path.split("/").some((s) => s === "" || s === "." || s === "..")) {
      throw new Error("invalid storage path");
    }
    const { data, error } = await admin.storage.from(BUCKET).download(path);
    if (error || !data) throw new Error("storage download failed");
    return new Uint8Array(await data.arrayBuffer());
  },

  async countProblems() {
    const a = await admin.from("social_posts").select("id", { count: "exact", head: true }).eq("status", "failed");
    check("count failed posts", a.error);
    const b = await admin.from("social_posts").select("id", { count: "exact", head: true }).eq("comment_status", "failed");
    check("count failed comments", b.error);
    return { failed_posts: a.count ?? 0, failed_comments: b.count ?? 0 };
  },
};

const handler = createHandler({
  db,
  config,
  // POST/PUT go over a client without connection reuse, so Deno never re-sends a create on its own (http.ts).
  fetch: (input, init) => linkedinFetch(input, init),
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  log: (line) => console.log(line),
  randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
});

// One non-secret line per cold start, so the logs show whether the no-reuse write client is active.
console.log(JSON.stringify({ fn: "linkedin", boot: true, write_client: WRITE_CLIENT_MODE }));

Deno.serve(handler);
