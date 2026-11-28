// Dhiti Marketing Engine API (Supabase Edge Function "engine").
//
// Contract: marketing/ARCHITECTURE.md (v2), section "Edge function actions".
//   POST { action, payload }  ->  200 { ok: true, data }  |  4xx/5xx { ok: false, error }
//
// Auth: header `x-engine-token: <plaintext token>`. The function hashes it (sha256 hex) and looks it up in
// public.engine_tokens (not revoked, not expired). Deployed with verify_jwt = false because it authenticates
// itself; the database is reached with the auto-provided service-role key, which never leaves this function.
//
// Guards beyond the table (see marketing/supabase/README.md):
//   - publisher tokens may only call PUBLISHER_ACTIONS;
//   - insert/patch fields are whitelisted per table (ids, created_at, updated_at are never writable);
//   - human-only transitions: session tokens cannot approve/reject/publish content or edit approved/published items;
//   - storage paths must live under items/<uuid>/ in bucket `marketing` (sign_download may also read the
//     owner library, library/<uuid>/<file>, which the dashboard uploads to);
//   - claim_jobs is race-safe (conditional UPDATE ... WHERE status = 'queued' RETURNING).

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.49.4";

const VERSION = "2.3.0";
const BUCKET = "marketing";

// ---------------------------------------------------------------------------------------------------------------
// Errors and responses
// ---------------------------------------------------------------------------------------------------------------

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
const bad = (msg: string) => new ApiError(400, msg);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-engine-token",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** Maps a PostgREST / Postgres / Storage error to an ApiError with a sensible HTTP status. */
type DbErr = { code?: string; message?: string; details?: string; hint?: string; status?: number; statusCode?: string | number };
function dbError(label: string, err: DbErr | null) {
  const code = String(err?.code ?? "");
  const msg = [err?.message, err?.details, err?.hint].filter(Boolean).join(" | ") || "database error";
  let status = 500;
  if (code === "PGRST116") status = 404;
  else if (code === "23505") status = 409; // unique violation
  else if (/^(22|23)/.test(code) || code === "PGRST204" || code === "42703") status = 400; // data / constraint / unknown column
  else if (!code) {
    // Storage errors carry an HTTP status (storage-js StorageApiError.status), not a SQLSTATE.
    const sc = Number(err?.statusCode ?? err?.status);
    if (sc === 404 || /not.?found/i.test(msg)) status = 404;
    else if (sc === 413 || /exceeded the maximum allowed size/i.test(msg)) status = 413;
    else if (sc >= 400 && sc < 500) status = 400;
  }
  return new ApiError(status, `${label}: ${msg}`);
}

// ---------------------------------------------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------------------------------------------

type Obj = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

function obj(v: unknown, name = "payload"): Obj {
  if (v === undefined || v === null) return {};
  if (!isObj(v)) throw bad(`${name} must be an object`);
  return v;
}

function uuid(v: unknown, name = "id"): string {
  if (typeof v !== "string" || !UUID.test(v)) throw bad(`${name} must be a uuid`);
  return v.toLowerCase();
}

function optUuid(v: unknown, name: string): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return uuid(v, name);
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], name: string): T {
  if (typeof v !== "string" || !(allowed as readonly string[]).includes(v)) {
    throw bad(`${name} must be one of: ${allowed.join(", ")}`);
  }
  return v as T;
}

function int(v: unknown, name: string, { min = 1, max = 1000, dflt }: { min?: number; max?: number; dflt: number }): number {
  if (v === undefined || v === null) return dflt;
  const n = Number(v);
  if (!Number.isInteger(n)) throw bad(`${name} must be an integer`);
  return Math.min(max, Math.max(min, n));
}

/** Keeps only whitelisted keys. Unknown keys are an error (silently dropping data hides bugs). */
function pick(input: Obj, allowed: readonly string[], label: string, ignore: readonly string[] = ["updated_at"]): Obj {
  const out: Obj = {};
  const unknown: string[] = [];
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined || ignore.includes(k)) continue;
    if (allowed.includes(k)) out[k] = v;
    else unknown.push(k);
  }
  if (unknown.length) throw bad(`${label}: field(s) not allowed: ${unknown.join(", ")}. Allowed: ${allowed.join(", ")}`);
  return out;
}

function nonEmpty(o: Obj, label: string): Obj {
  if (!Object.keys(o).length) throw bad(`${label}: nothing to update`);
  return o;
}

function storagePath(v: unknown, { library = false } = {}): string {
  if (typeof v !== "string") throw bad("path must be a string");
  const p = v.replace(/^\/+/, "");
  if (p.length > 512 || p.split("/").some((s) => s === "" || s === "." || s === "..")) throw bad(`invalid storage path "${v}"`);
  // Owner library media (read only): library/<uuid>/<file>, uploaded by the dashboard.
  if (library && /^library\/[0-9a-f-]{36}\/[^/]+$/i.test(p) && UUID.test(p.split("/")[1])) return p;
  if (!/^items\/[0-9a-f-]{36}\/[\w.\-/]+$/i.test(p) || !UUID.test(p.split("/")[1])) {
    throw bad(`storage path must look like items/<content_item_id>/v<version>/<file> (got "${v}")`);
  }
  return p;
}

const truncateTail = (s: unknown, max: number) => {
  const t = typeof s === "string" ? s : s == null ? "" : JSON.stringify(s);
  return t.length > max ? t.slice(t.length - max) : t;
};

// Dates in Asia/Kolkata (UTC+05:30, no DST).
const istToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
function addDays(ymd: string, n: number) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function weekStartIST() {
  const t = istToday();
  const dow = new Date(`${t}T00:00:00Z`).getUTCDay();
  return addDays(t, -((dow + 6) % 7));
}

// ---------------------------------------------------------------------------------------------------------------
// Whitelists and enums (mirror the CHECK constraints of the schema)
// ---------------------------------------------------------------------------------------------------------------

const RUN_KINDS = ["weekly", "jobs", "publish", "manual"] as const;
const RUN_FINISH = ["succeeded", "failed", "running"] as const;
const ITEM_TYPES = ["blog", "carousel", "graphic", "video"] as const;
const JOB_KINDS = ["run_weekly", "regenerate", "publish_now", "render_video"] as const;
const JOB_STATUSES = ["queued", "running", "done", "failed"] as const;
const JOB_FINISH = ["done", "failed", "queued"] as const;

const BRIEF_FIELDS = ["run_id", "week_start", "summary", "trends", "pain_points", "competitor_notes", "opportunities", "sources"];
const TOPIC_FIELDS = [
  "brief_id", "week_start", "title", "angle", "primary_keyword", "secondary_keywords", "audience", "category",
  "rationale", "priority", "planned_publish_date", "status", "error",
];
const ITEM_INSERT_FIELDS = ["topic_id", "parent_id", "type", "title", "status", "body", "feedback", "version", "scheduled_for", "error"];
const ITEM_PATCH_SESSION = ["title", "status", "body", "feedback", "version", "scheduled_for", "error"];
const ITEM_PATCH_PUBLISHER = ["status", "published_at", "published_url", "error"];
const ASSET_FIELDS = ["content_item_id", "kind", "storage_path", "mime", "width", "height", "position", "meta"];

/** Statuses an engine session may set. approved / rejected / changes_requested / published are human or publisher only. */
const SESSION_ITEM_STATUSES = ["generating", "awaiting_voiceover", "pending_review", "failed"] as const;
const PUBLISHER_ITEM_STATUSES = ["published", "failed"] as const;
/** Items a session may no longer touch, and the only items a publisher may touch. */
const LOCKED_FOR_SESSION = ["approved", "published"];

const PUBLISHER_ACTIONS = new Set([
  "get_settings", "list_items", "get_item", "list_assets", "sign_download", "update_item",
  "create_run", "finish_run", "claim_jobs", "finish_job", "list_jobs",
]);

// ---------------------------------------------------------------------------------------------------------------
// Clients and auth
// ---------------------------------------------------------------------------------------------------------------

let client: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (client) return client;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new ApiError(500, "function misconfigured: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "x-client-info": `dhiti-engine-fn/${VERSION}` } },
  });
  return client;
}

type Kind = "session" | "publisher";
interface Caller { kind: Kind; tokenId: string; label: string }

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function authenticate(req: Request): Promise<Caller> {
  const token = (req.headers.get("x-engine-token") ?? "").trim();
  if (!token) throw new ApiError(401, "missing x-engine-token header");
  if (!/^[A-Za-z0-9_-]{16,256}$/.test(token)) throw new ApiError(401, "invalid engine token");
  const { data, error } = await db()
    .from("engine_tokens")
    .select("id, kind, label")
    .eq("token_hash", await sha256Hex(token))
    .eq("revoked", false)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw dbError("auth", error);
  if (!data) throw new ApiError(401, "invalid, expired or revoked engine token");
  return { kind: data.kind as Kind, tokenId: data.id, label: data.label };
}

// ---------------------------------------------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
type Res = PromiseLike<{ data: any; error: any }>;

// deno-lint-ignore no-explicit-any
async function run<T = any>(label: string, q: Res): Promise<T> {
  const { data, error } = await q;
  if (error) throw dbError(label, error);
  return data as T;
}

// deno-lint-ignore no-explicit-any
async function single<T = any>(label: string, q: Res, notFound: string): Promise<T> {
  const data = await run<T>(label, q);
  if (data === null || data === undefined) throw new ApiError(404, notFound);
  return data;
}

// deno-lint-ignore no-explicit-any
const sortAssets = (row: any) => {
  if (row && Array.isArray(row.assets)) {
    row.assets.sort((a: Obj, b: Obj) => (Number(a.position) - Number(b.position)) || String(a.created_at).localeCompare(String(b.created_at)));
  }
  return row;
};

function inList(v: unknown, allowed: readonly string[] | null, name: string): string[] | undefined {
  if (v === undefined || v === null) return undefined;
  const arr = Array.isArray(v) ? v : [v];
  if (!arr.length) return undefined;
  if (arr.length > 20) throw bad(`${name}: too many values`);
  for (const x of arr) if (typeof x !== "string" || (allowed && !allowed.includes(x))) throw bad(`${name} has an invalid value: ${x}`);
  return arr as string[];
}

const ITEM_STATUSES = ["generating", "awaiting_voiceover", "pending_review", "changes_requested", "approved", "rejected", "published", "failed"];
const TOPIC_STATUSES = ["planned", "producing", "ready", "skipped", "failed"];

// ---------------------------------------------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------------------------------------------

type Handler = (p: Obj, caller: Caller) => Promise<unknown>;

async function getSettings(): Promise<Obj> {
  const row = await run("get_settings", db().from("settings").select("data").eq("id", 1).maybeSingle());
  return (row?.data as Obj) ?? {};
}

const actions: Record<string, Handler> = {
  get_settings: () => getSettings(),

  async context(p) {
    const weeks = int(p.weeks, "weeks", { min: 1, max: 104, dflt: 8 });
    const since = addDays(weekStartIST(), -7 * weeks);
    const [settings, recent, jobs, revisions] = await Promise.all([
      getSettings(),
      run("context.topics", db().from("topics")
        .select("id, title, primary_keyword, secondary_keywords, category, week_start, planned_publish_date, status")
        .gte("week_start", since).order("week_start", { ascending: false }).order("priority", { ascending: true }).limit(500)),
      run("context.jobs", db().from("jobs").select("*").in("status", ["queued", "running"]).order("created_at", { ascending: true }).limit(100)),
      run("context.revisions", db().from("content_items").select("*, assets(*)").eq("status", "changes_requested")
        .order("updated_at", { ascending: true }).limit(50)),
    ]);
    return { settings, recent_topics: recent, pending_jobs: jobs, revisions: (revisions ?? []).map(sortAssets), since, week_start: weekStartIST() };
  },

  // ---- runs ----
  create_run(p) {
    const kind = oneOf(p.kind, RUN_KINDS, "kind");
    return run("create_run", db().from("runs").insert({ kind, status: "running" }).select().single());
  },

  finish_run(p) {
    const id = uuid(p.id);
    const status = oneOf(p.status ?? "succeeded", RUN_FINISH, "status");
    const patch: Obj = { status, finished_at: status === "running" ? null : new Date().toISOString() };
    if (p.error !== undefined) patch.error = p.error === null ? null : truncateTail(p.error, 8000);
    if (p.log !== undefined) patch.log = truncateTail(p.log, 1_000_000);
    if (p.usage !== undefined && p.usage !== null) patch.usage = isObj(p.usage) ? p.usage : { value: p.usage };
    return single("finish_run", db().from("runs").update(patch).eq("id", id).select().maybeSingle(), `run ${id} not found`);
  },

  // ---- research ----
  insert_brief(p) {
    const row = pick(p, BRIEF_FIELDS, "insert_brief");
    if (typeof row.summary !== "string" || !row.summary.trim()) throw bad("insert_brief: summary is required");
    for (const k of ["trends", "pain_points", "competitor_notes", "opportunities", "sources"]) {
      if (row[k] !== undefined && !Array.isArray(row[k])) throw bad(`insert_brief: ${k} must be an array`);
    }
    if (row.run_id !== undefined) row.run_id = optUuid(row.run_id, "run_id");
    row.week_start ??= weekStartIST();
    return run("insert_brief", db().from("research_briefs").insert(row).select().single());
  },

  get_brief(p) {
    const id = uuid(p.id);
    return single("get_brief", db().from("research_briefs").select("*").eq("id", id).maybeSingle(), `brief ${id} not found`);
  },

  // ---- topics ----
  async insert_topics(p) {
    if (!Array.isArray(p.topics) || !p.topics.length) throw bad("insert_topics: topics must be a non-empty array");
    if (p.topics.length > 30) throw bad("insert_topics: at most 30 topics per call");
    const ws = weekStartIST();
    const rows = p.topics.map((t, i) => {
      const row = pick(obj(t, `topics[${i}]`), TOPIC_FIELDS, `insert_topics[${i}]`);
      if (typeof row.title !== "string" || !row.title.trim()) throw bad(`insert_topics[${i}]: title is required`);
      if (row.brief_id !== undefined) row.brief_id = optUuid(row.brief_id, "brief_id");
      if (row.status !== undefined) oneOf(row.status, TOPIC_STATUSES, `topics[${i}].status`);
      row.week_start ??= ws;
      return row;
    });
    // defaultToNull:false -> keys missing from some rows get the column DEFAULT instead of NULL.
    // INSERT ... RETURNING preserves input order.
    return run<Obj[]>("insert_topics", db().from("topics").insert(rows, { defaultToNull: false }).select());
  },

  update_topic(p) {
    const id = uuid(p.id);
    const patch = nonEmpty(pick(obj(p.patch, "patch"), TOPIC_FIELDS, "update_topic"), "update_topic");
    if (patch.status !== undefined) oneOf(patch.status, TOPIC_STATUSES, "status");
    if (patch.brief_id !== undefined) patch.brief_id = optUuid(patch.brief_id, "brief_id");
    return single("update_topic", db().from("topics").update(patch).eq("id", id).select().maybeSingle(), `topic ${id} not found`);
  },

  get_topic(p) {
    const id = uuid(p.id);
    return single("get_topic", db().from("topics").select("*").eq("id", id).maybeSingle(), `topic ${id} not found`);
  },

  list_topics(p) {
    const limit = int(p.limit, "limit", { min: 1, max: 500, dflt: 100 });
    let q = db().from("topics").select("*");
    const status = inList(p.status, TOPIC_STATUSES, "status");
    if (status) q = q.in("status", status);
    if (p.brief_id !== undefined) q = q.eq("brief_id", uuid(p.brief_id, "brief_id"));
    if (p.week_start !== undefined) q = q.eq("week_start", String(p.week_start));
    if (p.since !== undefined) q = q.gte("week_start", String(p.since));
    return run("list_topics", q.order("week_start", { ascending: false }).order("priority", { ascending: true }).limit(limit));
  },

  // ---- content items ----
  insert_item(p) {
    const row = pick(p, ITEM_INSERT_FIELDS, "insert_item");
    oneOf(row.type, ITEM_TYPES, "type");
    if (row.status !== undefined) oneOf(row.status, SESSION_ITEM_STATUSES, "status");
    if (row.body !== undefined && !isObj(row.body)) throw bad("insert_item: body must be an object");
    if (row.topic_id !== undefined) row.topic_id = optUuid(row.topic_id, "topic_id");
    if (row.parent_id !== undefined) row.parent_id = optUuid(row.parent_id, "parent_id");
    return run("insert_item", db().from("content_items").insert(row).select().single());
  },

  async update_item(p, caller) {
    const id = uuid(p.id);
    const allowed = caller.kind === "publisher" ? ITEM_PATCH_PUBLISHER : ITEM_PATCH_SESSION;
    const patch = nonEmpty(pick(obj(p.patch, "patch"), allowed, `update_item (${caller.kind} token)`), "update_item");
    if (patch.status !== undefined) {
      oneOf(patch.status, caller.kind === "publisher" ? PUBLISHER_ITEM_STATUSES : SESSION_ITEM_STATUSES, `status (${caller.kind} token)`);
    }
    if (patch.body !== undefined && !isObj(patch.body)) throw bad("update_item: body must be an object");
    if (patch.version !== undefined && (!Number.isInteger(patch.version) || (patch.version as number) < 1)) throw bad("version must be a positive integer");
    let q = db().from("content_items").update(patch).eq("id", id);
    // Human approval is the gate: a session may not change an item once a person approved it (or it is live),
    // and the publisher may only touch items a person approved.
    if (caller.kind === "session") q = q.not("status", "in", `(${LOCKED_FOR_SESSION.join(",")})`);
    else q = q.in("status", LOCKED_FOR_SESSION);
    const row = await run("update_item", q.select().maybeSingle());
    if (row) return row;
    const exists = await run("update_item.check", db().from("content_items").select("id, status").eq("id", id).maybeSingle());
    if (!exists) throw new ApiError(404, `item ${id} not found`);
    throw new ApiError(409, caller.kind === "session"
      ? `item ${id} is ${exists.status}; session tokens cannot modify approved or published items`
      : `item ${id} is ${exists.status}; publisher tokens may only update approved or published items`);
  },

  async get_item(p) {
    const id = uuid(p.id);
    const row = await single("get_item", db().from("content_items").select("*, assets(*)").eq("id", id).maybeSingle(), `item ${id} not found`);
    return sortAssets(row);
  },

  list_items(p) {
    const limit = int(p.limit, "limit", { min: 1, max: 500, dflt: 100 });
    let q = db().from("content_items").select("*");
    const status = inList(p.status, ITEM_STATUSES, "status");
    if (status) q = q.in("status", status);
    const type = inList(p.type, ITEM_TYPES, "type");
    if (type) q = q.in("type", type);
    if (p.topic_id !== undefined) q = p.topic_id === null ? q.is("topic_id", null) : q.eq("topic_id", uuid(p.topic_id, "topic_id"));
    if (p.parent_id !== undefined) q = p.parent_id === null ? q.is("parent_id", null) : q.eq("parent_id", uuid(p.parent_id, "parent_id"));
    return run("list_items", q.order("created_at", { ascending: false }).limit(limit));
  },

  // ---- assets ----
  insert_asset(p) {
    const row = pick(p, ASSET_FIELDS, "insert_asset");
    row.content_item_id = uuid(row.content_item_id, "content_item_id");
    const path = storagePath(row.storage_path);
    if (path.split("/")[1].toLowerCase() !== row.content_item_id) throw bad("insert_asset: storage_path must be under items/<content_item_id>/");
    row.storage_path = path;
    if (typeof row.mime !== "string" || !row.mime) throw bad("insert_asset: mime is required");
    if (row.meta !== undefined && !isObj(row.meta)) throw bad("insert_asset: meta must be an object");
    return run("insert_asset", db().from("assets").insert(row).select().single());
  },

  list_assets(p) {
    const id = uuid(p.content_item_id, "content_item_id");
    return run("list_assets", db().from("assets").select("*").eq("content_item_id", id)
      .order("position", { ascending: true }).order("created_at", { ascending: true }));
  },

  async delete_assets(p) {
    const id = uuid(p.content_item_id, "content_item_id");
    const rows = await run<Obj[]>("delete_assets", db().from("assets").delete().eq("content_item_id", id).select("id"));
    return { deleted: rows?.length ?? 0 };
  },

  // ---- storage ----
  async sign_upload(p) {
    const path = storagePath(p.path);
    const { data, error } = await db().storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
    if (error || !data) throw dbError("sign_upload", error as never);
    return { signedUrl: data.signedUrl, token: data.token, path: data.path ?? path };
  },

  async sign_download(p) {
    const path = storagePath(p.path, { library: true });
    const expiresIn = int(p.expiresIn, "expiresIn", { min: 10, max: 7 * 24 * 3600, dflt: 600 });
    const { data, error } = await db().storage.from(BUCKET).createSignedUrl(path, expiresIn);
    if (error || !data) throw dbError("sign_download", error as never);
    return { signedUrl: data.signedUrl, path, expiresIn };
  },

  /**
   * Deletes stored files of an item: every object under items/<content_item_id>/, or only `paths` (each under that
   * prefix). Session tokens only. Refused while the item is approved or published (human-approved content is kept);
   * allowed for orphaned prefixes whose item row no longer exists. Returns { deleted: [paths] }.
   */
  async delete_files(p) {
    const id = uuid(p.content_item_id, "content_item_id");
    const item = await run("delete_files.item", db().from("content_items").select("id, status").eq("id", id).maybeSingle());
    if (item && LOCKED_FOR_SESSION.includes(item.status)) throw new ApiError(409, `item ${id} is ${item.status}; its files are kept`);
    const prefix = `items/${id}/`;
    let paths: string[];
    if (p.paths !== undefined) {
      if (!Array.isArray(p.paths) || p.paths.length > 500) throw bad("paths must be an array (max 500)");
      paths = p.paths.map((x) => storagePath(x));
      if (paths.some((x) => !x.toLowerCase().startsWith(prefix))) throw bad(`every path must be under ${prefix}`);
    } else {
      paths = [];
      const walk = async (dir: string, depth: number): Promise<void> => {
        for (let offset = 0; ; offset += 1000) {
          const { data, error } = await db().storage.from(BUCKET).list(dir, { limit: 1000, offset });
          if (error) throw dbError("delete_files.list", error as never);
          for (const e of data ?? []) {
            const full = `${dir}/${e.name}`;
            if (e.id) paths.push(full); // files have an id, folders do not
            else if (depth < 4) await walk(full, depth + 1);
          }
          if (!data || data.length < 1000) break;
        }
      };
      await walk(`items/${id}`, 0);
    }
    const deleted: string[] = [];
    for (let i = 0; i < paths.length; i += 100) {
      const { data, error } = await db().storage.from(BUCKET).remove(paths.slice(i, i + 100));
      if (error) throw dbError("delete_files", error as never);
      deleted.push(...(data ?? []).map((o) => o.name));
    }
    return { deleted };
  },

  // ---- jobs ----
  async claim_jobs(p, caller) {
    const limit = int(p.limit, "limit", { min: 1, max: 50, dflt: 5 });
    // Defaults keep each worker on its own queue: the publisher handles publish_now, sessions handle the rest.
    const dflt = caller.kind === "publisher" ? ["publish_now"] : ["run_weekly", "regenerate", "render_video"];
    const kinds = inList(p.kinds, JOB_KINDS, "kinds") ?? dflt;
    if (caller.kind === "publisher" && kinds.some((k) => k !== "publish_now")) throw new ApiError(403, "publisher tokens may only claim publish_now jobs");
    const candidates = await run<{ id: string }[]>("claim_jobs.select", db().from("jobs").select("id")
      .eq("status", "queued").in("kind", kinds).order("created_at", { ascending: true }).limit(limit));
    if (!candidates?.length) return [];
    // Race-safe: only rows that are still 'queued' flip to 'running'; concurrent claimers get disjoint sets.
    const claimed = await run<Obj[]>("claim_jobs.update", db().from("jobs")
      .update({ status: "running", started_at: new Date().toISOString(), finished_at: null, error: null })
      .in("id", candidates.map((c) => c.id)).eq("status", "queued").select());
    return (claimed ?? []).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  },

  /** Read-only job listing (lets the publisher see queued publish_now jobs without claiming them). */
  list_jobs(p, caller) {
    const limit = int(p.limit, "limit", { min: 1, max: 200, dflt: 50 });
    const kinds = inList(p.kind ?? p.kinds, JOB_KINDS, "kind");
    const statuses = inList(p.status, JOB_STATUSES, "status");
    if (caller.kind === "publisher" && (!kinds || kinds.some((k) => k !== "publish_now"))) {
      throw new ApiError(403, "publisher tokens may only list publish_now jobs (pass kind: 'publish_now')");
    }
    let q = db().from("jobs").select("*");
    if (kinds) q = q.in("kind", kinds);
    if (statuses) q = q.in("status", statuses);
    return run("list_jobs", q.order("created_at", { ascending: true }).limit(limit));
  },

  finish_job(p) {
    const id = uuid(p.id);
    const status = oneOf(p.status ?? "done", JOB_FINISH, "status");
    const patch: Obj = status === "queued"
      ? { status, started_at: null, finished_at: null, error: p.error == null ? null : truncateTail(p.error, 8000) }
      : { status, finished_at: new Date().toISOString(), error: p.error == null ? null : truncateTail(p.error, 8000) };
    return single("finish_job", db().from("jobs").update(patch).eq("id", id).select().maybeSingle(), `job ${id} not found`);
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  const started = performance.now();
  let action = "-";
  let kind = "-";
  let status = 200;
  try {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (req.method === "GET") return json(200, { ok: true, data: { service: "dhiti-engine", version: VERSION } });
    if (req.method !== "POST") throw new ApiError(405, "use POST { action, payload }");

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw bad("request body must be JSON: { action, payload }");
    }
    if (!isObj(body)) throw bad("request body must be an object: { action, payload }");
    action = typeof body.action === "string" ? body.action : "-";
    const handler = Object.hasOwn(actions, action) ? actions[action] : undefined;

    const caller = await authenticate(req); // 401 before revealing anything about actions
    kind = caller.kind;
    if (!handler) throw bad(`unknown action "${action}"`);
    if (caller.kind === "publisher" && !PUBLISHER_ACTIONS.has(action)) throw new ApiError(403, `publisher tokens may not call ${action}`);

    const data = await handler(obj(body.payload), caller);
    return json(200, { ok: true, data: data ?? null });
  } catch (err) {
    if (err instanceof ApiError) {
      status = err.status;
      return json(err.status, { ok: false, error: err.message });
    }
    status = 500;
    console.error(`engine ${action} unexpected error`, err);
    return json(500, { ok: false, error: `internal error: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    console.log(JSON.stringify({ fn: "engine", action, kind, status, ms: Math.round(performance.now() - started) }));
  }
});
