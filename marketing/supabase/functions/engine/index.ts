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
//   - the approval gate also covers files: sign_upload / insert_asset / delete_assets refuse (409) for items that are
//     approved or published, exactly like update_item and delete_files;
//   - claim_jobs is race-safe (conditional UPDATE ... WHERE status = 'queued' RETURNING) and re-claims jobs whose
//     worker died (status running longer than the kind's lease, JOB_LEASE_MIN);
//   - jobs and runs belong to a token kind: the publisher owns publish_now jobs and 'publish' runs, sessions own
//     the rest; finish_job / finish_run only finish rows that are still running.
//   - v2.5.0: LinkedIn posts (marketing/LINKEDIN.md 2.5). Sessions may insert a social_posts row as draft or
//     pending_review and edit it while it is draft / pending_review / failed; they can never approve, publish or touch
//     the publish fields (only the owner approves in the dashboard; the `linkedin` function publishes). The caption and
//     first comment are checked with the shared validator of LINKEDIN.md 5.3. list_runs is a read-only run lookup
//     the engine's generating clean-up uses so it never fails items that a live run is still making.
//   - v2.6.0 (accuracy gate, ARCHITECTURE.md v4.1): the server fetches every cited source itself (fetch_source;
//     bytes, sha256 and text under storage sources/<sha256>/, where no session can write) and re-runs the claims
//     ledger (claims-core.js, the same file the engine CLI runs) on every session write that puts a blog in front of
//     the owner; it stores its own verified flags and a stamp (body.claims_check.server) and refuses (400) on any
//     failure. Creatives entering review and LinkedIn posts are checked against the blog's verified claims.
//     update_item takes expect_status (conditional write for the engine's sweep).

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.49.4";
import { marked } from "npm:marked@15.0.12";
import { getDocumentProxy } from "npm:unpdf@1.9.1";
import * as core from "./claims-core.js";

const VERSION = "2.6.0";
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

const SOURCE_FILE = /^sources\/[0-9a-f]{64}\/(meta\.txt|raw\.pdf|raw\.html|raw\.txt|text\.txt)$/;
function storagePath(v: unknown, { library = false } = {}): string {
  if (typeof v !== "string") throw bad("path must be a string");
  const p = v.replace(/^\/+/, "");
  if (p.length > 512 || p.split("/").some((s) => s === "" || s === "." || s === "..")) throw bad(`invalid storage path "${v}"`);
  // Owner library media (read only): library/<uuid>/<file>, uploaded by the dashboard.
  if (library && /^library\/[0-9a-f-]{36}\/[^/]+$/i.test(p) && UUID.test(p.split("/")[1])) return p;
  // Sources the server fetched (read only; only this function writes them): sources/<sha256>/<file>.
  if (library && SOURCE_FILE.test(p)) return p;
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

/**
 * Statuses an engine session may set. approved / rejected / published are human or publisher only.
 * changes_requested is allowed so a failed revision can put the item back where the human left it.
 */
const SESSION_ITEM_STATUSES = ["generating", "awaiting_voiceover", "pending_review", "changes_requested", "failed"] as const;
const PUBLISHER_ITEM_STATUSES = ["published", "failed"] as const;
/** Items a session may no longer touch, and the only items a publisher may touch. */
const LOCKED_FOR_SESSION = ["approved", "published"];

/** Minutes a claimed job may stay `running` before another worker may re-claim it (its worker is presumed dead). */
const JOB_LEASE_MIN: Record<string, number> = { publish_now: 30, regenerate: 180, render_video: 180, run_weekly: 600 };
const SESSION_JOB_KINDS = ["run_weekly", "regenerate", "render_video"] as const;
const PUBLISHER_JOB_KINDS = ["publish_now"] as const;

const RUN_STATUSES = ["running", "succeeded", "failed"] as const;

// ---- social posts (LINKEDIN.md 2.4 / 2.5 / 5.3) ----
const SOCIAL_FORMATS = ["carousel", "video", "graphic"] as const;
const SOCIAL_STATUSES = ["draft", "pending_review", "approved", "publishing", "published", "failed", "cancelled"] as const;
const SOCIAL_INSERT_FIELDS = ["blog_item_id", "format", "recommended_format", "recommendation_reason", "caption", "first_comment", "scheduled_for", "status", "source_item_id"];
const SOCIAL_PATCH_FIELDS = ["caption", "first_comment", "format", "recommended_format", "recommendation_reason", "scheduled_for", "status"];
/** Rows a session can no longer change (failed stays editable so a session can fix it; only the owner re-approves). */
const SOCIAL_LOCKED = ["approved", "publishing", "published", "cancelled"];
const TAG_LINE = /^(#[A-Za-z][A-Za-z0-9]{1,49})( #[A-Za-z][A-Za-z0-9]{1,49}){0,2}$/;
const URLISH = /https?:\/\/|www\./i;
const BARE_DOMAIN = /\b[a-z0-9-]+\.(com|in|co|io|net|org|ai)\b/i;
// deno-lint-ignore no-control-regex
const CONTROL = /[\u0000-\u0009\u000B-\u001F\u007F]/;

/** LINKEDIN.md 5.3 caption rules; returns the first failing rule or null. */
function captionError(raw: unknown): string | null {
  if (typeof raw !== "string") return "caption must be a string";
  const t = raw.replace(/\r\n?/g, "\n").trim();
  if (t.length < 1 || t.length > 3000) return `caption must be 1 to 3000 characters (got ${t.length})`;
  if (URLISH.test(t)) return "caption must not contain a link (http://, https:// or www.); the blog link goes in the first comment";
  const dom = t.match(BARE_DOMAIN);
  if (dom) return `caption must not contain a domain name ("${dom[0]}"); the blog link goes in the first comment`;
  if (t.includes("—")) return "caption must not contain an em dash";
  if (CONTROL.test(t)) return "caption must not contain control characters (tabs included); use plain line breaks";
  const lines = t.split("\n");
  const last = lines[lines.length - 1];
  const body = lines.slice(0, -1).join("\n");
  if (last.includes("#")) {
    if (!TAG_LINE.test(last)) return 'the last line must be 1 to 3 hashtags like "#TravelOperations #HotelOperations" (letters and digits, separated by single spaces)';
    if (body.includes("#")) return '"#" may appear only in the final hashtag line';
  } else if (t.includes("#")) return '"#" may appear only in a final line of at most 3 hashtags';
  if (TAG_LINE.test(last) && !body.trim()) return "the caption needs text before the hashtags";
  const first200 = t.slice(0, 200);
  if (!(t.length <= 200 || first200.includes("\n") || /[.!?](\s|$)/.test(first200))) return "the first 200 characters must contain at least one full sentence or line";
  return null;
}

/** LINKEDIN.md 5.3 first-comment rules (the line before the link; the linkedin function appends the link). */
function firstCommentError(raw: unknown): string | null {
  if (typeof raw !== "string") return "first_comment must be a string";
  const t = raw.replace(/\r\n?/g, "\n").trim();
  if (t.includes("\n")) return "first comment must be one line";
  if (t.length < 1 || t.length > 300) return `first comment must be 1 to 300 characters (got ${t.length})`;
  if (URLISH.test(t) || BARE_DOMAIN.test(t)) return "first comment must not contain a link: the blog link with UTM tags is added automatically";
  if (t.includes("#")) return 'first comment must not contain "#"';
  if (t.includes("—")) return "first comment must not contain an em dash";
  // deno-lint-ignore no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(t)) return "first comment must not contain control characters";
  return null;
}

/** Validates and normalises the text fields of a social_posts insert/patch in place (400 on failure). */
function socialTextChecks(row: Obj) {
  if (row.caption !== undefined) {
    const e = captionError(row.caption);
    if (e) throw bad(e);
    row.caption = (row.caption as string).replace(/\r\n?/g, "\n").trim();
  }
  if (row.first_comment !== undefined) {
    const e = firstCommentError(row.first_comment);
    if (e) throw bad(e);
    row.first_comment = (row.first_comment as string).trim();
  }
  if (row.format !== undefined) oneOf(row.format, SOCIAL_FORMATS, "format");
  if (row.recommended_format !== undefined && row.recommended_format !== null) oneOf(row.recommended_format, SOCIAL_FORMATS, "recommended_format");
  if (row.recommendation_reason !== undefined && row.recommendation_reason !== null) {
    if (typeof row.recommendation_reason !== "string" || row.recommendation_reason.length > 500 || row.recommendation_reason.includes("\n")) {
      throw bad("recommendation_reason must be one line of at most 500 characters");
    }
  }
  if (row.scheduled_for !== undefined && row.scheduled_for !== null && (typeof row.scheduled_for !== "string" || Number.isNaN(Date.parse(row.scheduled_for)))) {
    throw bad("scheduled_for must be an ISO timestamp or null");
  }
}

/** Newest child of a blog with this type, in any status (LINKEDIN.md 2.5), or null. */
async function newestChild(blogId: string, type: string): Promise<string | null> {
  const row = await run("social.source", db().from("content_items").select("id").eq("parent_id", blogId).eq("type", type)
    .order("created_at", { ascending: false }).limit(1).maybeSingle());
  return row?.id ?? null;
}

// ---------------------------------------------------------------------------------------------------------------
// The accuracy gate (claims-core.js is an exact copy of marketing/engine/src/claims-core.js)
// ---------------------------------------------------------------------------------------------------------------

async function shaBytes(b: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", b);
  return Array.from(new Uint8Array(buf), (x) => x.toString(16).padStart(2, "0")).join("");
}
async function readStorage(path: string): Promise<Uint8Array | null> {
  const { data, error } = await db().storage.from(BUCKET).download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}
async function writeStorage(path: string, bytes: Uint8Array, contentType: string) {
  const { error } = await db().storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true });
  if (error) throw dbError(`store ${path}`, error as never);
}
async function pdfPages(bytes: Uint8Array, pages: number[]): Promise<string[]> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const out: string[] = [];
  for (const n of pages) {
    if (!Number.isInteger(n) || n < 1 || n > pdf.numPages) continue;
    const tc = await (await pdf.getPage(n)).getTextContent();
    // deno-lint-ignore no-explicit-any
    out[n - 1] = core.pdfPageText(tc.items as any);
  }
  return out;
}
const lexer = (src: string) => marked.lexer(src);
const sourceLoader = () => core.storedSourceLoader({ read: readStorage, sha: shaBytes, pdfPages });
const fail409 = (m: string) => new ApiError(409, m);
const summarise = (label: string, msgs: string[]) => `${label} (${msgs.length} problem(s)): ${msgs.slice(0, 4).join(" | ")}${msgs.length > 4 ? " | ..." : ""}`;

/** Re-verifies a blog body; returns the server-stamped body, or throws 400 (refuse) / returns a stripped body. */
async function gateBlog(nextBody: unknown, patchBody: unknown, refuse: boolean): Promise<Obj | undefined> {
  const body = core.withoutStamp(isObj(nextBody) ? nextBody : {}) as Obj;
  if (!refuse && !(Array.isArray(body.claims) && body.claims.length)) return patchBody === undefined ? undefined : body;
  const r = await core.serverVerifyBlog(body, { lexer, hash: sha256Hex, getSource: sourceLoader() });
  if (r.passed) return r.body as Obj;
  if (refuse) throw bad(summarise("claims check failed on the server", r.messages));
  return patchBody === undefined ? body : body;
}

async function gateCreative(type: string, body: unknown, parentId: unknown) {
  if (typeof parentId !== "string") throw bad("a creative needs its parent blog (parent_id)");
  const parent = await run("gate.parent", db().from("content_items").select("id, type, body").eq("id", parentId).maybeSingle());
  if (!parent || parent.type !== "blog") throw bad("a creative needs its parent blog (parent_id)");
  if (!(await core.stampValid(parent.body, sha256Hex, { markdown: false }))) throw fail409(`the parent blog ${parent.id} has no fact list verified by the engine server; save the blog again with save-blog first`);
  const errs = core.derivedTextErrors(core.creativeTextGroups(type, body), parent.body.claims, { what: type });
  if (errs.length) throw bad(summarise("facts check failed on the server", errs));
}

/** Session writes to content_items (insert or patch, merged with the current row). Mutates patch.body. */
async function gateItemWrite(cur: Obj | null, patch: Obj, insert: boolean) {
  const next = { ...(cur || {}), ...patch } as Obj;
  const touches = insert || patch.status !== undefined || patch.body !== undefined;
  if (!touches) return;
  if (next.type === "blog") {
    if (next.status === "pending_review") patch.body = await gateBlog(next.body, patch.body, true);
    else if (next.status === "changes_requested" && patch.body !== undefined) patch.body = await gateBlog(next.body, patch.body, false);
    else if (patch.body !== undefined) patch.body = core.withoutStamp(patch.body);
    if (patch.body === undefined) delete patch.body;
  } else if ((core.REVIEW_STATUSES as readonly unknown[]).includes(next.status)) {
    await gateCreative(String(next.type), next.body, next.parent_id);
  }
}

async function gateSocial(row: Obj) {
  const blog = await run("gate.blog", db().from("content_items").select("id, type, body").eq("id", row.blog_item_id as string).maybeSingle());
  if (!blog || !(await core.stampValid(blog.body, sha256Hex, { markdown: false }))) throw fail409(`the blog ${row.blog_item_id} has no fact list verified by the engine server; save the blog again with save-blog first`);
  const errs = core.derivedTextErrors(core.socialTextGroups({ caption: String(row.caption ?? ""), first_comment: String(row.first_comment ?? ""), recommendation_reason: String(row.recommendation_reason ?? "") }), blog.body.claims, { what: "LinkedIn post" });
  if (errs.length) throw bad(summarise("facts check failed on the server", errs));
}

/** GET a public https URL, re-checking every redirect hop; at most SOURCE_MAX_BYTES. */
async function fetchPublic(start: URL): Promise<{ bytes: Uint8Array; mime: string; finalUrl: string }> {
  let cur = start;
  for (let hop = 0; hop <= 8; hop++) {
    let res: Response;
    try {
      res = await fetch(cur.href, {
        redirect: "manual",
        headers: { "user-agent": core.SOURCE_UA, accept: "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8", "accept-language": "en-IN,en;q=0.9" },
        signal: AbortSignal.timeout(90_000),
      });
    } catch (e) {
      throw new ApiError(502, `fetch_source: ${cur.href} could not be reached (${e instanceof Error ? e.message : String(e)})`);
    }
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get("location");
      await res.body?.cancel();
      if (!loc) throw new ApiError(502, `fetch_source: redirect without a location from ${cur.href}`);
      const next = core.checkSourceUrl(new URL(loc, cur).href);
      if ("error" in next) throw bad(`fetch_source: redirect to a URL that cannot be fetched (${next.error})`);
      cur = next as URL;
      continue;
    }
    if (res.status !== 200) {
      await res.body?.cancel();
      throw new ApiError(502, `fetch_source: ${cur.href} answered HTTP ${res.status}`);
    }
    const reader = res.body!.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > core.SOURCE_MAX_BYTES) {
        await reader.cancel();
        throw new ApiError(413, "fetch_source: the source is larger than 30 MB");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      bytes.set(c, off);
      off += c.length;
    }
    return { bytes, mime: (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase(), finalUrl: cur.href };
  }
  throw new ApiError(502, "fetch_source: too many redirects");
}

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

/**
 * The approval gate for files: a session may only change the stored files / asset rows of an item that exists and
 * is not approved or published (a human approved exactly what is stored).
 */
async function assertItemWritable(id: string, label: string): Promise<void> {
  const item = await run(`${label}.item`, db().from("content_items").select("id, status").eq("id", id).maybeSingle());
  if (!item) throw new ApiError(404, `${label}: item ${id} not found`);
  if (LOCKED_FOR_SESSION.includes(item.status)) throw new ApiError(409, `${label}: item ${id} is ${item.status}; its files can no longer change`);
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
  create_run(p, caller) {
    const kind = oneOf(p.kind, RUN_KINDS, "kind");
    if (caller.kind === "publisher" && kind !== "publish") throw new ApiError(403, "publisher tokens may only create 'publish' runs");
    return run("create_run", db().from("runs").insert({ kind, status: "running" }).select().single());
  },

  async finish_run(p, caller) {
    const id = uuid(p.id);
    const status = oneOf(p.status ?? "succeeded", RUN_FINISH, "status");
    const patch: Obj = { status, finished_at: status === "running" ? null : new Date().toISOString() };
    if (p.error !== undefined) patch.error = p.error === null ? null : truncateTail(p.error, 8000);
    if (p.log !== undefined) patch.log = truncateTail(p.log, 1_000_000);
    if (p.usage !== undefined && p.usage !== null) patch.usage = isObj(p.usage) ? p.usage : { value: p.usage };
    // Only a running run can be finished, and only by the token kind that owns it (publisher: 'publish' runs).
    let q = db().from("runs").update(patch).eq("id", id).eq("status", "running");
    q = caller.kind === "publisher" ? q.eq("kind", "publish") : q.neq("kind", "publish");
    const row = await run("finish_run", q.select().maybeSingle());
    if (row) return row;
    const exists = await run("finish_run.check", db().from("runs").select("id, kind, status").eq("id", id).maybeSingle());
    if (!exists) throw new ApiError(404, `run ${id} not found`);
    if (exists.status !== "running") throw new ApiError(409, `run ${id} is already ${exists.status}`);
    throw new ApiError(403, `${caller.kind} tokens may not finish ${exists.kind} runs`);
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
  async insert_item(p) {
    const row = pick(p, ITEM_INSERT_FIELDS, "insert_item");
    oneOf(row.type, ITEM_TYPES, "type");
    if (row.status !== undefined) oneOf(row.status, SESSION_ITEM_STATUSES, "status");
    if (row.body !== undefined && !isObj(row.body)) throw bad("insert_item: body must be an object");
    if (row.topic_id !== undefined) row.topic_id = optUuid(row.topic_id, "topic_id");
    if (row.parent_id !== undefined) row.parent_id = optUuid(row.parent_id, "parent_id");
    await gateItemWrite({ status: "generating" }, row, true);
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
    const expect = p.expect_status === undefined ? undefined : oneOf(p.expect_status, ITEM_STATUSES, "expect_status");
    let curStatus: string | undefined;
    if (caller.kind === "session") {
      // The gate reads the current row, verifies, and the write is conditional on the status it read.
      const cur = await run("update_item.cur", db().from("content_items").select("id, type, status, body, parent_id").eq("id", id).maybeSingle());
      if (!cur) throw new ApiError(404, `item ${id} not found`);
      if (LOCKED_FOR_SESSION.includes(cur.status)) throw new ApiError(409, `item ${id} is ${cur.status}; session tokens cannot modify approved or published items`);
      if (expect && cur.status !== expect) throw new ApiError(409, `item ${id} is ${cur.status}, not ${expect}; it changed meanwhile`);
      await gateItemWrite(cur, patch, false);
      curStatus = cur.status;
    }
    let q = db().from("content_items").update(patch).eq("id", id);
    if (curStatus) q = q.eq("status", curStatus);
    else if (expect) q = q.eq("status", expect);
    // Human approval is the gate: a session may not change an item once a person approved it (or it is live),
    // and the publisher may only touch items a person approved.
    if (caller.kind === "session") q = q.not("status", "in", `(${LOCKED_FOR_SESSION.join(",")})`);
    else q = q.in("status", LOCKED_FOR_SESSION);
    const row = await run("update_item", q.select().maybeSingle());
    if (row) return row;
    const exists = await run("update_item.check", db().from("content_items").select("id, status").eq("id", id).maybeSingle());
    if (!exists) throw new ApiError(404, `item ${id} not found`);
    throw new ApiError(409, caller.kind === "session"
      ? `item ${id} is ${exists.status}; it changed meanwhile, or session tokens cannot modify approved or published items`
      : `item ${id} is ${exists.status}; publisher tokens may only update approved or published items`);
  },

  /** The server fetches a cited source itself and keeps it (sessions only). */
  async fetch_source(p, caller) {
    if (caller.kind !== "session") throw new ApiError(403, "only session tokens may call fetch_source");
    const u = core.checkSourceUrl(p.url);
    if ("error" in u) throw bad(`fetch_source: ${u.error}`);
    const url = (u as URL).href;
    const { bytes, mime, finalUrl } = await fetchPublic(u as URL);
    if (!bytes.length) throw new ApiError(502, `fetch_source: ${url} sent an empty response`);
    const head = new TextDecoder().decode(bytes.subarray(0, 512));
    const isPdf = /pdf/.test(mime) || head.startsWith("%PDF-");
    const isHtml = !isPdf && (/html|xml/.test(mime) || /^\s*(<!doctype html|<html|<\?xml|<head|<body)/i.test(head));
    if (!isPdf && !isHtml && !/^text\//.test(mime)) throw new ApiError(415, `fetch_source: ${url} is ${mime || "an unknown type"}; cite an HTML page, a PDF or a text file`);
    const kind = isPdf ? "pdf" : isHtml ? "html" : "text";
    const sha = await shaBytes(bytes);
    const paths = core.sourcePaths(sha, kind);
    let pages: number | null = null;
    let title = "";
    let textSha: string | null = null;
    if (kind === "pdf") {
      try {
        pages = (await getDocumentProxy(new Uint8Array(bytes))).numPages;
      } catch {
        throw new ApiError(415, `fetch_source: ${url} is not a readable PDF`);
      }
    } else {
      const str = new TextDecoder().decode(bytes);
      const text = core.sourceTextOf(str, kind);
      title = kind === "html" ? core.htmlTitle(str) : "";
      const tb = new TextEncoder().encode(text);
      textSha = await shaBytes(tb);
      await writeStorage(paths.text, tb, "text/plain");
    }
    await writeStorage(paths.raw, bytes, kind === "pdf" ? "application/pdf" : "text/plain");
    let prev: Obj | null = null;
    try {
      const pb = await readStorage(paths.meta);
      prev = pb ? JSON.parse(new TextDecoder().decode(pb)) : null;
    } catch {
      prev = null;
    }
    const now = new Date().toISOString();
    const urls = [...new Set([...((prev?.urls as string[]) ?? []), url, finalUrl])];
    const meta = {
      sha256: sha, url: (prev?.url as string) ?? url, final_url: finalUrl !== url ? finalUrl : (prev?.final_url ?? null), urls,
      mime: mime || (kind === "pdf" ? "application/pdf" : "text/html"), kind, bytes: bytes.length, pages, title, text_sha256: textSha,
      fetched_at: now, first_fetched_at: (prev?.first_fetched_at as string) ?? now, origin: "server", core_version: core.CORE_VERSION,
    };
    await writeStorage(paths.meta, new TextEncoder().encode(JSON.stringify(meta)), "text/plain");
    return { ...meta, raw_path: paths.raw, text_path: kind === "pdf" ? paths.raw : paths.text };
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
  async insert_asset(p) {
    const row = pick(p, ASSET_FIELDS, "insert_asset");
    row.content_item_id = uuid(row.content_item_id, "content_item_id");
    await assertItemWritable(row.content_item_id as string, "insert_asset");
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

  /** Deletes an item's asset rows: all of them, or only `ids` (so a new version's rows can be inserted first). */
  async delete_assets(p) {
    const id = uuid(p.content_item_id, "content_item_id");
    await assertItemWritable(id, "delete_assets");
    let q = db().from("assets").delete().eq("content_item_id", id);
    if (p.ids !== undefined) {
      if (!Array.isArray(p.ids) || p.ids.length > 500) throw bad("delete_assets: ids must be an array (max 500)");
      if (!p.ids.length) return { deleted: 0 };
      q = q.in("id", p.ids.map((x, i) => uuid(x, `ids[${i}]`)));
    }
    const rows = await run<Obj[]>("delete_assets", q.select("id"));
    return { deleted: rows?.length ?? 0 };
  },

  // ---- storage ----
  async sign_upload(p) {
    const path = storagePath(p.path);
    await assertItemWritable(path.split("/")[1].toLowerCase(), "sign_upload");
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
    // Each worker owns its queue: the publisher handles publish_now, sessions handle the rest (a session that
    // claimed a publish_now job could never mark the item published, so that "Publish now" would be lost).
    const own: readonly string[] = caller.kind === "publisher" ? PUBLISHER_JOB_KINDS : SESSION_JOB_KINDS;
    const kinds = inList(p.kinds, JOB_KINDS, "kinds") ?? [...own];
    if (kinds.some((k) => !own.includes(k))) {
      throw new ApiError(403, `${caller.kind} tokens may only claim ${own.join(", ")} jobs`);
    }
    const now = Date.now();
    const startedAt = new Date(now).toISOString();
    const claim = { status: "running", started_at: startedAt, finished_at: null, error: null };
    const claimed: Obj[] = [];

    // 1. Queued jobs, oldest first. Race-safe: only rows still 'queued' flip; concurrent claimers get disjoint sets.
    const queued = await run<{ id: string }[]>("claim_jobs.select", db().from("jobs").select("id")
      .eq("status", "queued").in("kind", kinds).order("created_at", { ascending: true }).limit(limit));
    if (queued?.length) {
      claimed.push(...(await run<Obj[]>("claim_jobs.update", db().from("jobs").update(claim)
        .in("id", queued.map((c) => c.id)).eq("status", "queued").select()) ?? []));
    }

    // 2. Jobs whose worker died (running past the kind's lease). The update re-checks started_at, so only one
    //    claimer wins each stale row.
    for (const kind of kinds) {
      if (claimed.length >= limit) break;
      const cutoff = new Date(now - (JOB_LEASE_MIN[kind] ?? 60) * 60_000).toISOString();
      const stale = await run<{ id: string }[]>("claim_jobs.stale", db().from("jobs").select("id")
        .eq("status", "running").eq("kind", kind).lt("started_at", cutoff).order("created_at", { ascending: true }).limit(limit - claimed.length));
      if (!stale?.length) continue;
      const rows = await run<Obj[]>("claim_jobs.reclaim", db().from("jobs")
        .update({ ...claim, error: `re-claimed: the previous worker did not finish within ${JOB_LEASE_MIN[kind] ?? 60} min` })
        .in("id", stale.map((c) => c.id)).eq("status", "running").lt("started_at", cutoff).select());
      claimed.push(...(rows ?? []));
    }
    return claimed.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
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

  // ---- runs (read only) ----
  list_runs(p, caller) {
    if (caller.kind !== "session") throw new ApiError(403, "only session tokens may call list_runs");
    const limit = int(p.limit, "limit", { min: 1, max: 200, dflt: 50 });
    let q = db().from("runs").select("id, kind, status, started_at, finished_at");
    if (p.ids !== undefined) {
      if (!Array.isArray(p.ids) || p.ids.length > 200) throw bad("ids must be an array (max 200)");
      q = q.in("id", p.ids.map((x, i) => uuid(x, `ids[${i}]`)));
    }
    const status = inList(p.status, RUN_STATUSES, "status");
    if (status) q = q.in("status", status);
    const kinds = inList(p.kind, RUN_KINDS, "kind");
    if (kinds) q = q.in("kind", kinds);
    return run("list_runs", q.order("started_at", { ascending: false }).limit(limit));
  },

  // ---- LinkedIn posts (LINKEDIN.md 2.5): sessions draft them, only the owner approves ----
  async insert_social_post(p, caller) {
    if (caller.kind !== "session") throw new ApiError(403, "only session tokens may call insert_social_post");
    const row = pick(p, SOCIAL_INSERT_FIELDS, "insert_social_post");
    row.blog_item_id = uuid(row.blog_item_id, "blog_item_id");
    oneOf(row.format, SOCIAL_FORMATS, "format");
    row.status = row.status === undefined ? "pending_review" : oneOf(row.status, ["draft", "pending_review"] as const, "status (session token)");
    if (row.caption === undefined) throw bad("insert_social_post: caption is required");
    if (row.first_comment === undefined) throw bad("insert_social_post: first_comment is required");
    socialTextChecks(row);
    const blog = await run("insert_social_post.blog", db().from("content_items").select("id, type").eq("id", row.blog_item_id).maybeSingle());
    if (!blog) throw new ApiError(404, `blog ${row.blog_item_id} not found`);
    if (blog.type !== "blog") throw bad(`item ${row.blog_item_id} is a ${blog.type}, not a blog`);
    const derived = await newestChild(row.blog_item_id as string, row.format as string);
    if (row.source_item_id !== undefined && row.source_item_id !== null && uuid(row.source_item_id, "source_item_id") !== derived) {
      throw new ApiError(409, `source_item_id ${row.source_item_id} is not the newest ${row.format} of this blog (${derived ?? "none"})`);
    }
    row.source_item_id = derived;
    await gateSocial(row);
    row.platform = "linkedin"; // created_by keeps its default 'engine'
    // One active row per blog: the partial unique index answers 23505 -> 409.
    return run("insert_social_post", db().from("social_posts").insert(row).select().single());
  },

  async update_social_post(p, caller) {
    if (caller.kind !== "session") throw new ApiError(403, "only session tokens may call update_social_post");
    const id = uuid(p.id);
    const patch = nonEmpty(pick(obj(p.patch, "patch"), SOCIAL_PATCH_FIELDS, "update_social_post"), "update_social_post");
    socialTextChecks(patch);
    const cur = await single("update_social_post.get", db().from("social_posts").select("id, status, format, blog_item_id, post_urn, caption, first_comment, recommendation_reason").eq("id", id).maybeSingle(), `social post ${id} not found`);
    if (SOCIAL_LOCKED.includes(cur.status)) throw new ApiError(409, `social post ${id} is ${cur.status}; a session can no longer change it`);
    if (cur.post_urn) throw new ApiError(409, `social post ${id} is already on LinkedIn; a session can no longer change it`);
    if (patch.status !== undefined) {
      oneOf(patch.status, ["draft", "pending_review"] as const, "status (session token)");
      if (patch.status !== cur.status && !(cur.status === "draft" && patch.status === "pending_review")) {
        throw new ApiError(409, `status may only go from draft to pending_review (it is ${cur.status})`);
      }
    }
    if (patch.format !== undefined && patch.format !== cur.format) {
      Object.assign(patch, { source_item_id: await newestChild(cur.blog_item_id, patch.format as string), media_urn: null, media_status: null });
    }
    if (patch.caption !== undefined || patch.first_comment !== undefined || patch.recommendation_reason !== undefined || patch.status !== undefined) {
      await gateSocial({ ...cur, ...patch });
    }
    // Conditional on the status read above, so an approval that lands in between is never overwritten.
    const row = await run("update_social_post", db().from("social_posts").update(patch).eq("id", id).eq("status", cur.status).select().maybeSingle());
    if (row) return row;
    throw new ApiError(409, `social post ${id} changed meanwhile (it is no longer ${cur.status}); read it again`);
  },

  get_social_post(p, caller) {
    if (caller.kind !== "session") throw new ApiError(403, "only session tokens may call get_social_post");
    const id = uuid(p.id);
    return single("get_social_post", db().from("social_posts").select("*").eq("id", id).maybeSingle(), `social post ${id} not found`);
  },

  list_social_posts(p, caller) {
    if (caller.kind !== "session") throw new ApiError(403, "only session tokens may call list_social_posts");
    const limit = int(p.limit, "limit", { min: 1, max: 200, dflt: 50 });
    let q = db().from("social_posts").select("*");
    if (p.blog_item_id !== undefined) q = q.eq("blog_item_id", uuid(p.blog_item_id, "blog_item_id"));
    const status = inList(p.status, SOCIAL_STATUSES, "status");
    if (status) q = q.in("status", status);
    return run("list_social_posts", q.order("created_at", { ascending: false }).limit(limit));
  },

  async finish_job(p, caller) {
    const id = uuid(p.id);
    const status = oneOf(p.status ?? "done", JOB_FINISH, "status");
    const error = p.error == null ? null : truncateTail(p.error, 8000);
    const patch: Obj = status === "queued"
      ? { status, started_at: null, finished_at: null, error }
      : { status, finished_at: new Date().toISOString(), error };
    const own: readonly string[] = caller.kind === "publisher" ? PUBLISHER_JOB_KINDS : SESSION_JOB_KINDS;
    // Only a claimed (running) job of the caller's own kinds can be finished or released.
    const row = await run("finish_job", db().from("jobs").update(patch).eq("id", id).eq("status", "running")
      .in("kind", [...own]).select().maybeSingle());
    if (row) return row;
    const exists = await run("finish_job.check", db().from("jobs").select("id, kind, status").eq("id", id).maybeSingle());
    if (!exists) throw new ApiError(404, `job ${id} not found`);
    if (!own.includes(exists.kind)) throw new ApiError(403, `${caller.kind} tokens may not finish ${exists.kind} jobs`);
    throw new ApiError(409, `job ${id} is ${exists.status}, not running; claim it first`);
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
