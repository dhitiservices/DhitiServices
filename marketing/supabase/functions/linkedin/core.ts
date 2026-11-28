// Dhiti Marketing: LinkedIn company-page publisher (Supabase Edge Function "linkedin"), core logic.
//
// Contract: marketing/LINKEDIN.md (v1). This module has no npm imports: index.ts wires it to Supabase, the test
// harness wires it to an in-memory database and a mock LinkedIn server. Every database access goes through the
// Db interface, every outbound HTTP request through deps.fetch.
//
// Never-post-twice rule: every step is written to the row BEFORE the LinkedIn call that depends on it, all row
// writes are conditional on the state we expect (status/stage/comment_status), and a lost create response is
// reconciled by reading LinkedIn back (posts by author finder, comments list) before anything is sent again.

import {
  blogUrlOk,
  buildCommentary,
  buildCommentText,
  captionError,
  encodeUrn,
  firstCommentError,
} from "./validate.ts";

export const VERSION = "1.1.0";
export const LINKEDIN_VERSION = "202611";
export const API_VERSION_SUNSET = "2027-11-16";
export const API_VERSION_AGING_AFTER = "2027-08-16";
export const PROD_SUPABASE_URL = "https://yexxrcgxhwsopssfyylo.supabase.co";
export const REDIRECT_URI = `${PROD_SUPABASE_URL}/functions/v1/linkedin/oauth/callback`;
export const SCOPES = [
  "rw_organization_admin",
  "w_organization_social",
  "r_organization_social",
  "w_organization_social_feed",
  "r_organization_social_feed",
] as const;

const DEFAULT_API_BASE = "https://api.linkedin.com";
const DEFAULT_OAUTH_BASE = "https://www.linkedin.com/oauth/v2";
const UPLOAD_HOST = "www.linkedin.com";

const SECRET = {
  client: "linkedin_client_secret",
  access: "linkedin_access_token",
  refresh: "linkedin_refresh_token",
  cron: "linkedin_cron_secret",
} as const;

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const LEASE_SECONDS = 300;
const RUN_BUDGET_MS = 50_000;
const POSTS_PER_RUN = 2;
const MAX_POST_ATTEMPTS = 3;
const MAX_COMMENT_ATTEMPTS = 5;
const MAX_CLAIMS = 60;
const RECONCILE_GRACE_MS = 5 * MIN;
// A post stuck in post_requested, or a first comment still pending/requested, gives up after this long (and
// LinkedIn is asked at most once an hour after the first hour), so one stuck row cannot use up the daily quota.
const PHASE_LIMIT_MS = 24 * HOUR;
const SLOW_AFTER_MS = HOUR;
const SLOW_WAIT_MS = HOUR;
const VIDEO_PROCESSING_LIMIT_MS = 60 * MIN;
const MAX_VIDEO_BYTES = 150 * 1024 * 1024; // Edge Function memory bound; LinkedIn allows 500 MB
const MIN_VIDEO_BYTES = 75 * 1024;
const MAX_DOC_BYTES = 100 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 36_152_320;

// ---------------------------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------------------------

export type Obj = Record<string, unknown>;

export type Conn = {
  id: number;
  status: "not_configured" | "app_saved" | "choose_org" | "connected" | "expired" | "revoked" | "error";
  paused: boolean;
  client_id: string | null;
  app_saved_at: string | null;
  app_saved_by: string | null;
  member_urn: string | null;
  org_urn: string | null;
  org_id: number | null;
  org_name: string | null;
  org_vanity: string | null;
  org_logo_url: string | null;
  org_logo_url_expires_at: string | null;
  org_data_fetched_at: string | null;
  org_candidates: { org_urn: string; org_name: string }[];
  scopes: string[];
  access_token_expires_at: string | null;
  refresh_token_expires_at: string | null;
  has_refresh_token: boolean;
  last_refreshed_at: string | null;
  last_refresh_attempt_at: string | null;
  last_refresh_error: string | null;
  last_checked_at: string | null;
  last_check_attempt_at: string | null;
  last_check_active: boolean | null;
  last_429_at: string | null;
  rate_limited_until: string | null;
  last_error: string | null;
  connected_by: string | null;
  connected_at: string | null;
  updated_at: string;
};

export type Post = {
  id: string;
  blog_item_id: string;
  source_item_id: string | null;
  platform: string;
  recommended_format: string | null;
  recommendation_reason: string | null;
  format: "carousel" | "video" | "graphic";
  caption: string;
  first_comment: string;
  status: "draft" | "pending_review" | "approved" | "publishing" | "published" | "failed" | "cancelled";
  stage: null | "media_uploading" | "media_processing" | "media_ready" | "post_requested" | "post_created";
  stage_changed_at: string | null;
  comment_status: "none" | "pending" | "requested" | "posted" | "failed";
  approved_at: string | null;
  approved_by: string | null;
  scheduled_for: string | null;
  media_urn: string | null;
  media_status: string | null;
  thumbnail_urn_uploaded: boolean;
  post_urn: string | null;
  post_url: string | null;
  comment_id: string | null;
  comment_urn: string | null;
  comment_text_sent: string | null;
  comment_requested_at: string | null;
  attempts: number;
  post_attempts: number;
  comment_attempts: number;
  next_attempt_at: string | null;
  lock_until: string | null;
  last_error: string | null;
  published_at: string | null;
};

export type Item = {
  id: string;
  parent_id: string | null;
  type: string;
  title: string | null;
  status: string;
  body: Obj | null;
  published_url: string | null;
};

export type Asset = {
  id: string;
  content_item_id: string;
  kind: string;
  storage_path: string;
  mime: string | null;
  width: number | null;
  height: number | null;
  position: number | null;
  created_at?: string;
};

export type PostExpect = { status?: Post["status"]; stage?: Post["stage"]; comment_status?: Post["comment_status"]; lock_until?: string | null };

export interface Db {
  /** Verifies the user's access token and runs is_team() as that user. */
  authTeam(jwt: string): Promise<{ id: string; email: string } | null>;
  getConnection(): Promise<Conn>;
  updateConnection(patch: Partial<Conn>): Promise<Conn>;
  secretGet(name: string): Promise<string | null>;
  secretExists(name: string): Promise<boolean>;
  secretSet(name: string, value: string): Promise<void>;
  secretDelete(name: string): Promise<void>;
  /** Deletes earlier unused states, inserts this one, returns its expires_at (ISO). */
  stateCreate(hash: string, userId: string, email: string): Promise<string>;
  /** Consumes the state (single use, not expired) and re-checks the owner. */
  stateConsume(hash: string): Promise<{ user_id: string; user_email: string; owner_ok: boolean } | null>;
  duePosts(limit: number): Promise<string[]>;
  getPost(id: string): Promise<Post | null>;
  claimPost(id: string, leaseSeconds: number): Promise<Post | null>;
  /** Conditional update: applies only when the row still matches `expect`. Returns the new row or null. */
  updatePost(id: string, expect: PostExpect, patch: Partial<Post>): Promise<Post | null>;
  getItem(id: string): Promise<Item | null>;
  listAssets(itemId: string): Promise<Asset[]>;
  download(path: string): Promise<Uint8Array>;
  countProblems(): Promise<{ failed_posts: number; failed_comments: number }>;
}

export type Config = {
  supabaseUrl: string;
  dashboardOrigin: string | null;
  apiBase: string;
  oauthBase: string;
  uploadHosts: string[];
  allowHttpUploadHosts: string[];
  testMode: boolean;
};

export type Deps = {
  db: Db;
  config: Config;
  fetch: typeof fetch;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  log: (line: string) => void;
  randomBytes: (n: number) => Uint8Array;
};

// ---------------------------------------------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------------------------------------------

function trimSlash(s: string) {
  return s.replace(/\/+$/, "");
}

function baseUrl(v: string, name: string): string {
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    throw new Error(`${name} is not a URL`);
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`${name} must be http(s)`);
  if (u.search || u.hash || u.username || u.password) throw new Error(`${name} must be a plain base URL`);
  return trimSlash(u.toString());
}

/**
 * Reads the function's settings. LINKEDIN_API_BASE / LINKEDIN_OAUTH_BASE (or LINKEDIN_MOCK_BASE for both) exist only
 * for tests against a mock server and are refused against the production project, so tokens can never be sent to a
 * host other than LinkedIn's in production.
 */
export function loadConfig(env: (k: string) => string | undefined): Config {
  const supabaseUrl = trimSlash(env("SUPABASE_URL") ?? "");
  if (!supabaseUrl) throw new Error("SUPABASE_URL is not set");
  const mock = env("LINKEDIN_MOCK_BASE");
  let apiBase = env("LINKEDIN_API_BASE") ?? (mock ? mock : undefined);
  let oauthBase = env("LINKEDIN_OAUTH_BASE") ?? (mock ? `${trimSlash(mock)}/oauth/v2` : undefined);
  const testMode = apiBase !== undefined || oauthBase !== undefined;
  if (testMode && supabaseUrl === PROD_SUPABASE_URL) {
    throw new Error("refusing to start: LinkedIn base URL overrides are not allowed on the production project");
  }
  apiBase = apiBase ? baseUrl(apiBase, "LINKEDIN_API_BASE") : DEFAULT_API_BASE;
  oauthBase = oauthBase ? baseUrl(oauthBase, "LINKEDIN_OAUTH_BASE") : DEFAULT_OAUTH_BASE;
  const uploadHosts = [UPLOAD_HOST];
  const allowHttpUploadHosts: string[] = [];
  if (testMode) {
    const h = new URL(apiBase).host;
    uploadHosts.push(h);
    if (new URL(apiBase).protocol === "http:") allowHttpUploadHosts.push(h);
  }
  let dashboardOrigin: string | null = null;
  const d = env("DASHBOARD_ORIGIN");
  if (d) {
    try {
      const u = new URL(d);
      if (u.protocol === "https:" || (testMode && u.protocol === "http:")) dashboardOrigin = u.origin;
    } catch {
      dashboardOrigin = null;
    }
  }
  return { supabaseUrl, dashboardOrigin, apiBase, oauthBase, uploadHosts, allowHttpUploadHosts, testMode };
}

// ---------------------------------------------------------------------------------------------------------------
// Errors, responses, logging
// ---------------------------------------------------------------------------------------------------------------

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Network-level failure talking to LinkedIn (no HTTP response). Always retryable. */
class NetError extends Error {}
/** LinkedIn 429 on a non-comment call: stop this run, back off globally. */
class RateLimited extends Error {}
/** Out of time for this invocation; state is saved, the next run continues. */
class OutOfTime extends Error {}

type Ctx = {
  route: string;
  li: { op: string; status: number; x_li_uuid: string | null }[];
  secrets: string[];
  saw401: boolean;
  deadline: number;
};

const TOKENISH = /[A-Za-z0-9_\-.~+/=]{32,}/g;

/** Removes known secrets, URLs and anything token-shaped, and caps the length (for last_error and responses). */
function scrub(ctx: Ctx | null, s: unknown, max = 300): string {
  let out = typeof s === "string" ? s : JSON.stringify(s ?? "");
  for (const sec of ctx?.secrets ?? []) {
    if (sec && sec.length >= 6) out = out.split(sec).join("[redacted]");
  }
  out = out.replace(/https?:\/\/\S+/g, "[url]").replace(TOKENISH, "[redacted]");
  return out.length > max ? out.slice(0, max - 1) + "..." : out;
}

// ---------------------------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORG_URN = /^urn:li:organization:([0-9]+)$/;

function iso(ms: number) {
  return new Date(ms).toISOString();
}
function ms(v: string | null | undefined): number | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}
function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export async function sha256Hex(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return [...d].map((b) => b.toString(16).padStart(2, "0")).join("");
}
/** Constant-time comparison of two strings (compares their SHA-256 digests byte by byte). */
async function safeEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}
function nextUtcMidnight(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}
function sameUtcDay(a: number, b: number) {
  return new Date(a).toISOString().slice(0, 10) === new Date(b).toISOString().slice(0, 10);
}
function splitScopes(s: unknown): string[] {
  if (typeof s !== "string") return [];
  return s.split(/%20|[\s,]+/).map((x) => x.trim()).filter(Boolean);
}
function orgIdOf(urn: string): number {
  const m = ORG_URN.exec(urn);
  if (!m) throw new ApiError(400, "BAD_REQUEST", "invalid organization urn");
  return Number(m[1]);
}
function postUrl(urn: string) {
  return `https://www.linkedin.com/feed/update/${urn}/`;
}

const CONNECTION_RESET: Partial<Conn> = {
  member_urn: null,
  org_urn: null,
  org_id: null,
  org_name: null,
  org_vanity: null,
  org_logo_url: null,
  org_logo_url_expires_at: null,
  org_data_fetched_at: null,
  org_candidates: [],
  scopes: [],
  access_token_expires_at: null,
  refresh_token_expires_at: null,
  has_refresh_token: false,
  last_refreshed_at: null,
  last_refresh_attempt_at: null,
  last_refresh_error: null,
  last_checked_at: null,
  last_check_attempt_at: null,
  last_check_active: null,
  last_429_at: null,
  rate_limited_until: null,
  last_error: null,
  connected_by: null,
  connected_at: null,
};

// ---------------------------------------------------------------------------------------------------------------
// LinkedIn HTTP client
// ---------------------------------------------------------------------------------------------------------------

type LiRes = { status: number; headers: Headers; json: Obj | null; text: string };

class LinkedIn {
  deps: Deps;
  ctx: Ctx;
  token: string | null;
  constructor(deps: Deps, ctx: Ctx, token: string | null) {
    this.deps = deps;
    this.ctx = ctx;
    this.token = token;
    if (token) ctx.secrets.push(token);
  }

  async raw(op: string, url: string, init: RequestInit, timeoutMs = 25_000): Promise<LiRes> {
    const left = this.ctx.deadline - this.deps.now();
    if (left < 2_000) throw new OutOfTime(op);
    let res: Response;
    try {
      res = await this.deps.fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(Math.min(timeoutMs, left)) });
    } catch (_e) {
      this.ctx.li.push({ op, status: 0, x_li_uuid: null });
      throw new NetError(`${op}: network error`);
    }
    const text = await res.text().catch(() => "");
    let json: Obj | null = null;
    try {
      const j = text ? JSON.parse(text) : null;
      json = j && typeof j === "object" && !Array.isArray(j) ? (j as Obj) : null;
    } catch {
      json = null;
    }
    this.ctx.li.push({ op, status: res.status, x_li_uuid: res.headers.get("x-li-uuid") });
    if (res.status === 401) this.ctx.saw401 = true;
    return { status: res.status, headers: res.headers, json, text };
  }

  /** A call to the versioned REST API (https://api.linkedin.com/rest/...). */
  rest(op: string, method: string, pathAndQuery: string, opts: { body?: unknown; finder?: boolean } = {}): Promise<LiRes> {
    if (!this.token) throw new ApiError(409, "NOT_CONNECTED", "LinkedIn is not connected");
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      "Linkedin-Version": LINKEDIN_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    };
    if (opts.finder) headers["X-RestLi-Method"] = "FINDER";
    let body: string | undefined;
    if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.body);
    }
    return this.raw(op, `${this.deps.config.apiBase}/rest${pathAndQuery}`, { method, headers, body });
  }

  /** Form-encoded POST to the OAuth host (token exchange, refresh, introspection). Secrets go in the body only. */
  oauthForm(op: string, path: string, fields: Record<string, string>): Promise<LiRes> {
    const body = new URLSearchParams(fields).toString();
    return this.raw(op, `${this.deps.config.oauthBase}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  }

  /** PUT to an upload URL returned by LinkedIn. Only https://www.linkedin.com (plus the mock host in tests). */
  upload(op: string, uploadUrl: unknown, bytes: Uint8Array, headers: Record<string, string>, withToken: boolean): Promise<LiRes> {
    let u: URL;
    try {
      u = new URL(String(uploadUrl));
    } catch {
      throw new ApiError(502, "UPLOAD_HOST_REJECTED", "LinkedIn returned an invalid upload URL");
    }
    const cfg = this.deps.config;
    const hostOk = cfg.uploadHosts.includes(u.host);
    const protoOk = u.protocol === "https:" || (u.protocol === "http:" && cfg.allowHttpUploadHosts.includes(u.host));
    if (!hostOk || !protoOk || u.username || u.password) {
      throw new ApiError(502, "UPLOAD_HOST_REJECTED", "LinkedIn returned an upload URL on an unexpected host");
    }
    const h: Record<string, string> = { ...headers };
    if (withToken) h.Authorization = `Bearer ${this.token}`;
    return this.raw(op, u.toString(), { method: "PUT", headers: h, body: bytes as unknown as BodyInit }, 120_000);
  }
}

function liErr(ctx: Ctx, r: LiRes): string {
  const j = r.json ?? {};
  const parts = { status: r.status, serviceErrorCode: j.serviceErrorCode ?? null, message: j.message ?? j.error_description ?? j.error ?? null };
  return scrub(ctx, JSON.stringify(parts));
}

const ok2xx = (s: number) => s >= 200 && s < 300;
/** A definite refusal (not worth retrying): 4xx other than 401 (token check), 408, 409 (documented retry), 426, 429. */
const final4xx = (s: number) => s >= 400 && s < 500 && ![401, 408, 409, 426, 429].includes(s);

/** ETag header value -> part id: LinkedIn's finalize wants the ids without the quotes (VIDEOS schema). */
export function etagToPartId(etag: string): string {
  return etag.trim().replace(/^W\//, "").replace(/^"(.*)"$/, "$1");
}

// ---------------------------------------------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------------------------------------------

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const started = deps.now();
    const url = new URL(req.url);
    const route = routeOf(url.pathname);
    const ctx: Ctx = { route, li: [], secrets: [], saw401: false, deadline: started + RUN_BUDGET_MS };
    let res: Response;
    try {
      res = await dispatch(deps, ctx, req, url, route);
    } catch (e) {
      if (e instanceof ApiError) {
        res = jsonRes(deps, req, e.status, { ok: false, error: scrub(ctx, e.message), code: e.code }, route);
      } else {
        res = jsonRes(deps, req, 500, { ok: false, error: "internal error", code: "INTERNAL" }, route);
        deps.log(JSON.stringify({ fn: "linkedin", route, error: scrub(ctx, String((e as Error)?.message ?? e), 200) }));
      }
    }
    deps.log(JSON.stringify({ fn: "linkedin", route, status: res.status, ms: deps.now() - started, li: ctx.li }));
    return res;
  };
}

function routeOf(pathname: string): string {
  const i = pathname.lastIndexOf("/linkedin/");
  if (i >= 0) return pathname.slice(i + "/linkedin/".length).replace(/\/+$/, "");
  return "";
}

function corsHeaders(deps: Deps, req: Request, route: string): Record<string, string> {
  if (route === "publish_due" || route === "oauth/callback") return {};
  const origin = req.headers.get("origin");
  const allowed = deps.config.dashboardOrigin;
  if (!allowed || origin !== allowed) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

function jsonRes(deps: Deps, req: Request, status: number, body: unknown, route: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(deps, req, route),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function readBody(req: Request): Promise<Obj> {
  const text = await req.text();
  if (text.length > 10_000) throw new ApiError(413, "TOO_LARGE", "request body too large");
  if (!text.trim()) return {};
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    throw new ApiError(400, "BAD_REQUEST", "body must be JSON");
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new ApiError(400, "BAD_REQUEST", "body must be a JSON object");
  return v as Obj;
}

async function requireTeam(deps: Deps, req: Request): Promise<{ id: string; email: string }> {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+([A-Za-z0-9._~+/=-]{20,4096})$/.exec(h.trim());
  if (!m) throw new ApiError(401, "UNAUTHORIZED", "sign in required");
  let user: { id: string; email: string } | null = null;
  try {
    user = await deps.db.authTeam(m[1]);
  } catch {
    user = null;
  }
  if (!user) throw new ApiError(401, "UNAUTHORIZED", "sign in required");
  return user;
}

async function dispatch(deps: Deps, ctx: Ctx, req: Request, url: URL, route: string): Promise<Response> {
  const method = req.method.toUpperCase();
  const ok = (data: unknown) => jsonRes(deps, req, 200, { ok: true, data }, route);

  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(deps, req, route) });
  }
  if (method === "GET" && (route === "" || route === "health")) {
    return ok({ service: "dhiti-linkedin", version: VERSION, api_version: LINKEDIN_VERSION });
  }
  if (route === "oauth/callback") {
    if (method !== "GET") throw new ApiError(405, "METHOD_NOT_ALLOWED", "use GET");
    return await oauthCallback(deps, ctx, url);
  }
  if (route === "publish_due") {
    if (method !== "POST") throw new ApiError(405, "METHOD_NOT_ALLOWED", "use POST");
    return ok(await publishDue(deps, ctx, req));
  }

  const routes: Record<string, string> = {
    save_app: "POST",
    "oauth/start": "POST",
    select_org: "POST",
    status: "GET",
    disconnect: "POST",
    publish_now: "POST",
    retry_comment: "POST",
  };
  const want = routes[route];
  if (!want) throw new ApiError(404, "NOT_FOUND", "unknown route");
  // Authenticate before anything else, so an unauthenticated caller learns nothing (not even method errors).
  const user = await requireTeam(deps, req);
  if (method !== want) throw new ApiError(405, "METHOD_NOT_ALLOWED", `use ${want}`);
  const body = method === "POST" ? await readBody(req) : {};

  switch (route) {
    case "save_app":
      return ok(await saveApp(deps, user, body));
    case "oauth/start":
      return ok(await oauthStart(deps, user));
    case "select_org":
      return ok(await selectOrg(deps, ctx, body));
    case "status":
      return ok(await status(deps, ctx, true));
    case "disconnect":
      return ok(await disconnect(deps, body));
    case "publish_now":
      return ok(await publishNow(deps, ctx, body));
    case "retry_comment":
      return ok(await retryComment(deps, ctx, body));
  }
  throw new ApiError(404, "NOT_FOUND", "unknown route");
}

// ---------------------------------------------------------------------------------------------------------------
// save_app, oauth/start, oauth/callback, select_org, disconnect
// ---------------------------------------------------------------------------------------------------------------

async function saveApp(deps: Deps, user: { email: string }, body: Obj) {
  const clientId = body.client_id;
  const clientSecret = body.client_secret;
  if (typeof clientId !== "string" || !/^[A-Za-z0-9_-]{6,64}$/.test(clientId)) {
    throw new ApiError(400, "BAD_REQUEST", "client_id must be 6 to 64 letters, digits, - or _");
  }
  if (typeof clientSecret !== "string" || !/^[\x21-\x7E]{8,256}$/.test(clientSecret)) {
    throw new ApiError(400, "BAD_REQUEST", "client_secret must be 8 to 256 printable characters with no spaces");
  }
  const conn = await deps.db.getConnection();
  await deps.db.secretSet(SECRET.client, clientSecret);
  const changed = conn.client_id !== clientId;
  const base = { client_id: clientId, app_saved_at: iso(deps.now()), app_saved_by: user.email };
  let next: Conn;
  if (changed) {
    await deps.db.secretDelete(SECRET.access);
    await deps.db.secretDelete(SECRET.refresh);
    next = await deps.db.updateConnection({ ...CONNECTION_RESET, ...base, status: "app_saved" });
  } else {
    next = await deps.db.updateConnection({ ...base, status: conn.status === "not_configured" ? "app_saved" : conn.status });
  }
  return { client_id: next.client_id, secret_saved: true, redirect_uri: REDIRECT_URI, status: next.status };
}

async function oauthStart(deps: Deps, user: { id: string; email: string }) {
  const conn = await deps.db.getConnection();
  if (!conn.client_id || !(await deps.db.secretExists(SECRET.client))) {
    throw new ApiError(409, "APP_NOT_SAVED", "save the LinkedIn app (Client ID and Client Secret) first");
  }
  const state = b64url(deps.randomBytes(32));
  const expiresAt = await deps.db.stateCreate(await sha256Hex(state), user.id, user.email);
  const q = [
    ["response_type", "code"],
    ["client_id", conn.client_id],
    ["redirect_uri", REDIRECT_URI],
    ["state", state],
    ["scope", SCOPES.join(" ")],
  ].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  return { authorize_url: `${deps.config.oauthBase}/authorization?${q}`, expires_at: expiresAt };
}

function callbackResponse(deps: Deps, result: "connected" | "choose_org" | "error", reason?: string): Response {
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
  const q = result === "error" ? `linkedin=error&reason=${encodeURIComponent(reason ?? "unknown")}` : `linkedin=${result}`;
  const origin = deps.config.dashboardOrigin;
  if (origin) {
    return new Response(null, { status: 302, headers: { ...headers, Location: `${origin}/settings?${q}` } });
  }
  // DASHBOARD_ORIGIN is not set yet: show a minimal page instead of redirecting to an unknown place.
  const msg = result === "error" ? `LinkedIn connection failed (${reason ?? "unknown"}).` : "LinkedIn is connected. You can close this tab.";
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>LinkedIn</title><p>${msg.replace(/[<>&"]/g, "")}</p>`,
    { status: 200, headers: { ...headers, "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'" } },
  );
}

type OrgInfo = { urn: string; id: number; name: string | null; vanity: string | null; logoUrl: string | null; logoExpiresAt: string | null };

async function readOrg(deps: Deps, li: LinkedIn, urn: string): Promise<OrgInfo | null> {
  const id = orgIdOf(urn);
  const r = await li.rest("org_get", "GET", `/organizations/${id}`);
  if (r.status !== 200 || !r.json) return null;
  const j = r.json;
  const info: OrgInfo = {
    urn,
    id,
    name: typeof j.localizedName === "string" ? j.localizedName.slice(0, 200) : null,
    vanity: typeof j.vanityName === "string" ? j.vanityName.slice(0, 200) : null,
    logoUrl: null,
    logoExpiresAt: null,
  };
  // Logo, best effort (UNVERIFIED path, LINKEDIN.md 3.3.7): logoV2.cropped digitalmediaAsset -> urn:li:image -> downloadUrl.
  try {
    const cropped = (j.logoV2 as Obj | undefined)?.cropped;
    const m = typeof cropped === "string" ? /^urn:li:digitalmediaAsset:([A-Za-z0-9_-]+)$/.exec(cropped) : null;
    if (m) {
      const ir = await li.rest("org_logo", "GET", `/images/${encodeUrn(`urn:li:image:${m[1]}`)}`);
      const dl = ir.json?.downloadUrl;
      if (ir.status === 200 && typeof dl === "string" && /^https:\/\//.test(dl) && dl.length < 2000) {
        info.logoUrl = dl;
        const exp = Number(ir.json?.downloadUrlExpiresAt);
        info.logoExpiresAt = Number.isFinite(exp) && exp > 0 ? iso(exp) : null;
      }
    }
  } catch (e) {
    if (e instanceof OutOfTime) throw e;
  }
  return info;
}

function orgFields(deps: Deps, o: OrgInfo): Partial<Conn> {
  return {
    org_urn: o.urn,
    org_id: o.id,
    org_name: o.name ?? `Organization ${o.id}`,
    org_vanity: o.vanity,
    org_logo_url: o.logoUrl,
    org_logo_url_expires_at: o.logoExpiresAt,
    org_data_fetched_at: iso(deps.now()),
  };
}

async function listAdminOrgs(li: LinkedIn): Promise<{ orgs: string[]; member: string | null } | null> {
  const orgs: string[] = [];
  let member: string | null = null;
  let path: string | null = "/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=100&start=0";
  for (let page = 0; path && page < 5; page++) {
    const r: LiRes = await li.rest("acls", "GET", path);
    if (r.status !== 200 || !r.json) return null;
    const els = Array.isArray(r.json.elements) ? (r.json.elements as Obj[]) : [];
    for (const el of els) {
      const org = (el.organization ?? el.organizationTarget) as unknown;
      if (el.role !== "ADMINISTRATOR" || el.state !== "APPROVED") continue;
      if (typeof org === "string" && ORG_URN.test(org) && !orgs.includes(org)) orgs.push(org);
      if (!member && typeof el.roleAssignee === "string" && /^urn:li:person:[A-Za-z0-9_-]+$/.test(el.roleAssignee)) member = el.roleAssignee;
    }
    const links = ((r.json.paging as Obj | undefined)?.links ?? []) as Obj[];
    const next = Array.isArray(links) ? links.find((l) => l?.rel === "next") : undefined;
    const href = typeof next?.href === "string" ? next.href : null;
    path = href && href.startsWith("/rest/organizationAcls?") && els.length > 0 ? href.slice("/rest".length) : null;
  }
  return { orgs, member };
}

async function oauthCallback(deps: Deps, ctx: Ctx, url: URL): Promise<Response> {
  const p = url.searchParams;
  const state = p.get("state") ?? "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(state)) return callbackResponse(deps, "error", "state_invalid");
  const consumed = await deps.db.stateConsume(await sha256Hex(state));
  if (!consumed || !consumed.owner_ok) return callbackResponse(deps, "error", "state_invalid");

  const err = p.get("error");
  if (err) return callbackResponse(deps, "error", /^[a-z_]{1,64}$/.test(err) ? err : "oauth_error");
  const code = p.get("code") ?? "";
  if (!/^[\x21-\x7E]{1,2048}$/.test(code)) return callbackResponse(deps, "error", "missing_code");
  ctx.secrets.push(code);

  const conn = await deps.db.getConnection();
  const secret = await deps.db.secretGet(SECRET.client);
  if (!conn.client_id || !secret) return callbackResponse(deps, "error", "app_not_saved");
  ctx.secrets.push(secret);

  const oauth = new LinkedIn(deps, ctx, null);
  let tr: LiRes;
  try {
    tr = await oauth.oauthForm("token_exchange", "/accessToken", {
      grant_type: "authorization_code",
      code,
      client_id: conn.client_id,
      client_secret: secret,
      redirect_uri: REDIRECT_URI,
    });
  } catch (e) {
    if (e instanceof NetError || e instanceof OutOfTime) return callbackResponse(deps, "error", "token_exchange_failed");
    throw e;
  }
  const tj = tr.json ?? {};
  const access = typeof tj.access_token === "string" ? tj.access_token : null;
  const expiresIn = Number(tj.expires_in);
  if (tr.status !== 200 || !access || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    await deps.db.updateConnection({ last_error: `token exchange failed: ${liErr(ctx, tr)}` });
    return callbackResponse(deps, "error", "token_exchange_failed");
  }
  ctx.secrets.push(access);
  const refresh = typeof tj.refresh_token === "string" && tj.refresh_token ? tj.refresh_token : null;
  if (refresh) ctx.secrets.push(refresh);
  const refreshIn = Number(tj.refresh_token_expires_in);
  const li = new LinkedIn(deps, ctx, access);

  let scopes = splitScopes(tj.scope);
  if (!scopes.length) {
    // The token response documents `scope`; if it is missing, ask introspection rather than guess.
    const ir = await introspectRaw(deps, li, conn.client_id, secret, access).catch(() => null);
    scopes = splitScopes(ir?.json?.scope);
  }
  const missing = SCOPES.filter((s) => !scopes.includes(s));
  const now = deps.now();
  const fail = async (reason: string, lastError: string) => {
    await deps.db.secretDelete(SECRET.access);
    await deps.db.secretDelete(SECRET.refresh);
    await deps.db.updateConnection({ ...CONNECTION_RESET, status: "error", last_error: lastError });
    return callbackResponse(deps, "error", reason);
  };
  if (missing.length) return await fail("missing_scope", `missing scope: ${missing.join(", ")}`);

  await deps.db.secretSet(SECRET.access, access);
  if (refresh) await deps.db.secretSet(SECRET.refresh, refresh);
  else await deps.db.secretDelete(SECRET.refresh);

  let admin: { orgs: string[]; member: string | null } | null = null;
  try {
    admin = await listAdminOrgs(li);
  } catch (e) {
    if (!(e instanceof NetError || e instanceof OutOfTime)) throw e;
  }
  if (!admin) return await fail("org_lookup_failed", "could not list the pages this LinkedIn account administers");
  if (admin.orgs.length === 0) return await fail("not_admin", "this LinkedIn account is not an admin of any LinkedIn page");

  const tokenFields: Partial<Conn> = {
    member_urn: admin.member,
    scopes,
    access_token_expires_at: iso(now + expiresIn * 1000),
    refresh_token_expires_at: refresh && Number.isFinite(refreshIn) && refreshIn > 0 ? iso(now + refreshIn * 1000) : null,
    has_refresh_token: !!refresh,
    last_refreshed_at: null,
    last_refresh_attempt_at: null,
    last_refresh_error: null,
    last_checked_at: null,
    last_check_attempt_at: null,
    last_check_active: null,
    last_429_at: null,
    rate_limited_until: null,
    last_error: null,
    connected_by: consumed.user_email,
    connected_at: iso(now),
  };

  if (admin.orgs.length === 1) {
    const info = (await readOrg(deps, li, admin.orgs[0]).catch(() => null)) ??
      { urn: admin.orgs[0], id: orgIdOf(admin.orgs[0]), name: null, vanity: null, logoUrl: null, logoExpiresAt: null };
    await deps.db.updateConnection({ ...tokenFields, ...orgFields(deps, info), org_candidates: [], status: "connected" });
    return callbackResponse(deps, "connected");
  }
  const candidates: { org_urn: string; org_name: string }[] = [];
  for (const urn of admin.orgs.slice(0, 20)) {
    const info = await readOrg(deps, li, urn).catch(() => null);
    candidates.push({ org_urn: urn, org_name: info?.name ?? `Organization ${orgIdOf(urn)}` });
  }
  await deps.db.updateConnection({
    ...tokenFields,
    org_urn: null,
    org_id: null,
    org_name: null,
    org_vanity: null,
    org_logo_url: null,
    org_logo_url_expires_at: null,
    org_data_fetched_at: null,
    org_candidates: candidates,
    status: "choose_org",
  });
  return callbackResponse(deps, "choose_org");
}

async function selectOrg(deps: Deps, ctx: Ctx, body: Obj) {
  const urn = body.org_urn;
  if (typeof urn !== "string" || !ORG_URN.test(urn)) throw new ApiError(400, "BAD_REQUEST", "org_urn must look like urn:li:organization:123");
  const conn = await deps.db.getConnection();
  if (conn.status !== "choose_org") throw new ApiError(409, "NOT_CHOOSING", "there is no page to choose right now");
  if (!conn.org_candidates.some((c) => c.org_urn === urn)) throw new ApiError(400, "BAD_REQUEST", "that page is not in the list");
  const token = await deps.db.secretGet(SECRET.access);
  if (!token) throw new ApiError(409, "NOT_CONNECTED", "connect LinkedIn again");
  const li = new LinkedIn(deps, ctx, token);
  const info = (await readOrg(deps, li, urn).catch((e) => {
    if (e instanceof NetError) return null;
    throw e;
  })) ?? { urn, id: orgIdOf(urn), name: conn.org_candidates.find((c) => c.org_urn === urn)?.org_name ?? null, vanity: null, logoUrl: null, logoExpiresAt: null };
  await deps.db.updateConnection({ ...orgFields(deps, info), org_candidates: [], status: "connected", last_error: null });
  return await status(deps, ctx, false);
}

async function disconnect(deps: Deps, body: Obj) {
  const forget = body.forget_app === true;
  await deps.db.secretDelete(SECRET.access);
  await deps.db.secretDelete(SECRET.refresh);
  const conn = await deps.db.getConnection();
  let next: Conn;
  if (forget) {
    await deps.db.secretDelete(SECRET.client);
    next = await deps.db.updateConnection({ ...CONNECTION_RESET, client_id: null, app_saved_at: null, app_saved_by: null, status: "not_configured" });
  } else {
    next = await deps.db.updateConnection({ ...CONNECTION_RESET, status: conn.client_id ? "app_saved" : "not_configured" });
  }
  return { status: next.status };
}

// ---------------------------------------------------------------------------------------------------------------
// status + warnings
// ---------------------------------------------------------------------------------------------------------------

type Warning = { level: "amber" | "red"; code: string; days_left?: number; count?: number };

function daysLeft(now: number, v: string | null): number | null {
  const t = ms(v);
  return t === null ? null : Math.floor((t - now) / DAY);
}

export function computeWarnings(conn: Conn, now: number, problems: { failed_posts: number; failed_comments: number }): Warning[] {
  const w: Warning[] = [];
  const live = conn.status === "connected" || conn.status === "choose_org";
  if (["expired", "revoked", "error"].includes(conn.status) || conn.last_check_active === false) {
    w.push({ level: "red", code: "RECONNECT_REQUIRED" });
  }
  if (live) {
    const acc = daysLeft(now, conn.access_token_expires_at);
    if (!conn.has_refresh_token && acc !== null && acc <= 14) {
      w.push({ level: acc <= 3 ? "red" : "amber", code: "ACCESS_TOKEN_EXPIRING", days_left: acc });
    }
    const ref = daysLeft(now, conn.refresh_token_expires_at);
    if (conn.has_refresh_token && ref !== null && ref <= 30) {
      w.push({ level: ref <= 7 ? "red" : "amber", code: "REFRESH_TOKEN_EXPIRING", days_left: ref });
    }
    if (conn.has_refresh_token && conn.last_refresh_error && acc !== null && acc <= 3) {
      w.push({ level: "red", code: "REFRESH_FAILING", days_left: acc });
    }
    const checked = ms(conn.last_checked_at) ?? ms(conn.connected_at);
    if (conn.status === "connected" && checked !== null && now - checked > 48 * HOUR) w.push({ level: "amber", code: "HEARTBEAT_STALE" });
    const connectedAt = ms(conn.connected_at);
    if (connectedAt !== null && now > connectedAt + 335 * DAY) w.push({ level: "amber", code: "DEV_TIER_DEADLINE" });
  }
  if (now > Date.parse(`${API_VERSION_AGING_AFTER}T00:00:00Z`)) w.push({ level: "amber", code: "API_VERSION_AGING" });
  if (problems.failed_posts > 0) w.push({ level: "red", code: "POST_FAILED", count: problems.failed_posts });
  if (problems.failed_comments > 0) w.push({ level: "red", code: "COMMENT_FAILED", count: problems.failed_comments });
  return w;
}

async function status(deps: Deps, ctx: Ctx, sideEffects: boolean) {
  let conn = await deps.db.getConnection();
  const now = deps.now();
  if (sideEffects && conn.status === "connected" && conn.org_urn) {
    // Organization data may be kept 8 weeks (STORAGE): refresh after 7 weeks or when the logo URL expired.
    const fetched = ms(conn.org_data_fetched_at);
    const logoExp = ms(conn.org_logo_url_expires_at);
    const stale = fetched === null || now - fetched > 49 * DAY || (logoExp !== null && logoExp < now);
    if (stale) {
      const token = await deps.db.secretGet(SECRET.access);
      let info: OrgInfo | null = null;
      if (token) info = await readOrg(deps, new LinkedIn(deps, ctx, token), conn.org_urn).catch(() => null);
      if (info) conn = await deps.db.updateConnection(orgFields(deps, info));
      else if (fetched === null || now - fetched > 56 * DAY) {
        conn = await deps.db.updateConnection({ org_name: null, org_vanity: null, org_logo_url: null, org_logo_url_expires_at: null });
      }
    }
    const checked = ms(conn.last_checked_at);
    const attempted = ms(conn.last_check_attempt_at);
    if ((checked === null || now - checked > DAY) && (attempted === null || now - attempted > HOUR)) {
      await heartbeat(deps, ctx).catch(() => null);
      conn = await deps.db.getConnection();
    }
  }
  const secretSaved = await deps.db.secretExists(SECRET.client);
  const problems = await deps.db.countProblems();
  return {
    status: conn.status,
    paused: conn.paused,
    client_id: conn.client_id,
    secret_saved: secretSaved,
    org: conn.org_urn ? { urn: conn.org_urn, name: conn.org_name, vanity: conn.org_vanity, logo_url: conn.org_logo_url } : null,
    org_candidates: conn.status === "choose_org" ? conn.org_candidates : [],
    scopes: conn.scopes,
    access_token_expires_at: conn.access_token_expires_at,
    refresh_token_expires_at: conn.refresh_token_expires_at,
    has_refresh_token: conn.has_refresh_token,
    last_refreshed_at: conn.last_refreshed_at,
    last_checked_at: conn.last_checked_at,
    last_check_active: conn.last_check_active,
    last_error: conn.last_error,
    connected_by: conn.connected_by,
    connected_at: conn.connected_at,
    warnings: computeWarnings(conn, now, problems),
    api_version: LINKEDIN_VERSION,
    api_version_sunset: API_VERSION_SUNSET,
    redirect_uri: REDIRECT_URI,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Token lifecycle (LINKEDIN.md section 4)
// ---------------------------------------------------------------------------------------------------------------

function introspectRaw(deps: Deps, li: LinkedIn, clientId: string, secret: string, token: string) {
  return li.oauthForm("introspect", "/introspectToken", { client_id: clientId, client_secret: secret, token });
}

/** Introspects the access token. Returns false when LinkedIn says it is no longer active (status updated). */
async function heartbeat(deps: Deps, ctx: Ctx): Promise<boolean | null> {
  const conn = await deps.db.getConnection();
  const secret = await deps.db.secretGet(SECRET.client);
  const token = await deps.db.secretGet(SECRET.access);
  if (!conn.client_id || !secret || !token) return null;
  ctx.secrets.push(secret, token);
  const li = new LinkedIn(deps, ctx, token);
  const now = deps.now();
  await deps.db.updateConnection({ last_check_attempt_at: iso(now) });
  let r: LiRes;
  try {
    r = await introspectRaw(deps, li, conn.client_id, secret, token);
  } catch (e) {
    if (e instanceof NetError || e instanceof OutOfTime) return null;
    throw e;
  }
  if (r.status !== 200 || !r.json) {
    await deps.db.updateConnection({ last_error: `token check failed: ${liErr(ctx, r)}` });
    return null;
  }
  if (r.json.active === true) {
    const exp = Number(r.json.expires_at);
    await deps.db.updateConnection({
      last_checked_at: iso(now),
      last_check_active: true,
      ...(Number.isFinite(exp) && exp > 0 ? { access_token_expires_at: iso(exp * 1000) } : {}),
    });
    return true;
  }
  const st = r.json.status === "revoked" ? "revoked" : "expired";
  await deps.db.updateConnection({
    last_checked_at: iso(now),
    last_check_active: false,
    status: conn.status === "connected" || conn.status === "choose_org" ? st : conn.status,
    last_error: `LinkedIn says the connection is ${st}; reconnect`,
  });
  return false;
}

async function refreshTokens(deps: Deps, ctx: Ctx, conn: Conn): Promise<boolean> {
  const secret = await deps.db.secretGet(SECRET.client);
  const rt = await deps.db.secretGet(SECRET.refresh);
  if (!conn.client_id || !secret || !rt) return false;
  ctx.secrets.push(secret, rt);
  const now = deps.now();
  await deps.db.updateConnection({ last_refresh_attempt_at: iso(now) });
  const li = new LinkedIn(deps, ctx, null);
  let r: LiRes;
  try {
    // redirect_uri: the REFRESH error table calls it mandatory (its parameter table omits it); sending it is harmless.
    r = await li.oauthForm("refresh", "/accessToken", {
      grant_type: "refresh_token",
      refresh_token: rt,
      client_id: conn.client_id,
      client_secret: secret,
      redirect_uri: REDIRECT_URI,
    });
  } catch (e) {
    if (e instanceof NetError || e instanceof OutOfTime) {
      await deps.db.updateConnection({ last_refresh_error: "network error" });
      return false;
    }
    throw e;
  }
  const j = r.json ?? {};
  if (r.status === 200 && typeof j.access_token === "string" && Number(j.expires_in) > 0) {
    ctx.secrets.push(j.access_token);
    await deps.db.secretSet(SECRET.access, j.access_token);
    const patch: Partial<Conn> = {
      access_token_expires_at: iso(now + Number(j.expires_in) * 1000),
      last_refreshed_at: iso(now),
      last_refresh_error: null,
    };
    if (typeof j.refresh_token === "string" && j.refresh_token) {
      ctx.secrets.push(j.refresh_token);
      await deps.db.secretSet(SECRET.refresh, j.refresh_token);
      if (Number(j.refresh_token_expires_in) > 0) patch.refresh_token_expires_at = iso(now + Number(j.refresh_token_expires_in) * 1000);
    }
    const sc = splitScopes(j.scope);
    if (sc.length) patch.scopes = sc;
    await deps.db.updateConnection(patch);
    return true;
  }
  if (r.status === 400) {
    // The refresh token is unusable, but the access token may still be valid for days: keep publishing with it.
    // maintenance() marks the connection expired once the access token runs out, and ACCESS_TOKEN_EXPIRING warns
    // the owner to reconnect before that.
    const desc = String(j.error_description ?? "");
    if (/invalid, expired or revoked/i.test(desc)) await deps.db.secretDelete(SECRET.refresh);
    await deps.db.updateConnection({
      has_refresh_token: false,
      last_refresh_error: liErr(ctx, r),
      last_error: "LinkedIn refused to renew the connection; reconnect before the access token expires",
    });
    return false;
  }
  await deps.db.updateConnection({ last_refresh_error: liErr(ctx, r) });
  return false;
}

/** At most one maintenance step per publish_due call: refresh when due, else the daily heartbeat. */
async function maintenance(deps: Deps, ctx: Ctx): Promise<{ refreshed: boolean; introspected: boolean }> {
  const out = { refreshed: false, introspected: false };
  const conn = await deps.db.getConnection();
  if (conn.status !== "connected" && conn.status !== "choose_org") return out;
  const now = deps.now();
  const accExp = ms(conn.access_token_expires_at);
  const refExp = ms(conn.refresh_token_expires_at);
  const refreshUsable = conn.has_refresh_token && (refExp === null || refExp > now);
  if (accExp !== null && accExp <= now && !refreshUsable) {
    await deps.db.updateConnection({ status: "expired", last_error: "the LinkedIn connection expired; reconnect" });
    return out;
  }
  if (refreshUsable && accExp !== null && accExp - now < 7 * DAY) {
    const lastOk = ms(conn.last_refreshed_at);
    const lastTry = ms(conn.last_refresh_attempt_at);
    const recentlyOk = lastOk !== null && now - lastOk < DAY;
    const recentlyTried = lastTry !== null && now - lastTry < HOUR;
    if (!recentlyOk && !recentlyTried) {
      out.refreshed = await refreshTokens(deps, ctx, conn);
      return out;
    }
  }
  const checked = ms(conn.last_checked_at);
  const attempted = ms(conn.last_check_attempt_at);
  if ((checked === null || now - checked > DAY) && (attempted === null || now - attempted > HOUR)) {
    out.introspected = (await heartbeat(deps, ctx)) !== null;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// publish_due, publish_now, retry_comment
// ---------------------------------------------------------------------------------------------------------------

async function publishDue(deps: Deps, ctx: Ctx, req: Request) {
  const given = req.headers.get("x-cron-secret") ?? "";
  const expected = await deps.db.secretGet(SECRET.cron);
  if (!expected || !given || !(await safeEqual(given, expected))) throw new ApiError(401, "UNAUTHORIZED", "unauthorized");
  ctx.secrets.push(expected);

  let conn = await deps.db.getConnection();
  if (conn.status !== "connected" && conn.status !== "choose_org") {
    return { skipped: "not_connected", processed: [], maintenance: { refreshed: false, introspected: false } };
  }
  const m = await maintenance(deps, ctx);
  conn = await deps.db.getConnection();
  if (conn.status !== "connected" || !conn.org_urn) return { skipped: "not_connected", processed: [], maintenance: m };
  if (conn.paused) return { skipped: "paused", processed: [], maintenance: m };
  const rl = ms(conn.rate_limited_until);
  if (rl !== null && rl > deps.now()) return { skipped: "rate_limited", processed: [], maintenance: m };

  const processed: Obj[] = [];
  const ids = await deps.db.duePosts(POSTS_PER_RUN * 3);
  for (const id of ids) {
    if (processed.length >= POSTS_PER_RUN) break;
    if (ctx.deadline - deps.now() < 8_000) break;
    const r = await processPost(deps, ctx, id, { manual: false });
    if (r) processed.push(r);
    if (r?.stop) break;
  }
  return { processed: processed.map(({ stop: _s, ...rest }) => rest), maintenance: m };
}

function postSummary(p: Post) {
  return {
    id: p.id,
    status: p.status,
    stage: p.stage,
    comment_status: p.comment_status,
    post_url: p.post_url,
    last_error: p.last_error,
  };
}

async function requireConnected(deps: Deps): Promise<Conn> {
  const conn = await deps.db.getConnection();
  if (conn.status !== "connected" || !conn.org_urn) throw new ApiError(409, "NOT_CONNECTED", "LinkedIn is not connected");
  if (conn.paused) throw new ApiError(409, "PAUSED", "LinkedIn posting is paused");
  const rl = ms(conn.rate_limited_until);
  if (rl !== null && rl > deps.now()) throw new ApiError(429, "RATE_LIMITED", "LinkedIn asked us to slow down; it will continue later");
  return conn;
}

async function publishNow(deps: Deps, ctx: Ctx, body: Obj) {
  const id = body.social_post_id;
  if (typeof id !== "string" || !UUID.test(id)) throw new ApiError(400, "BAD_REQUEST", "social_post_id must be a uuid");
  const row = await deps.db.getPost(id.toLowerCase());
  if (!row) throw new ApiError(404, "NOT_FOUND", "post not found");
  if (row.status !== "approved") throw new ApiError(409, "NOT_APPROVED", "approve the LinkedIn post first");
  await requireConnected(deps);
  const blog = await deps.db.getItem(row.blog_item_id);
  const live = await blogLive(deps, blog);
  if (!live.ok) {
    await deps.db.updatePost(row.id, { status: "approved" }, { last_error: live.reason, next_attempt_at: iso(deps.now() + 10 * MIN) });
    throw new ApiError(409, "BLOG_NOT_LIVE", live.reason);
  }
  const r = await processPost(deps, ctx, row.id, { manual: true, blogChecked: true });
  if (!r) throw new ApiError(409, "BUSY", "this post is being published right now");
  const after = await deps.db.getPost(row.id);
  return postSummary(after ?? row);
}

async function retryComment(deps: Deps, ctx: Ctx, body: Obj) {
  const id = body.social_post_id;
  if (typeof id !== "string" || !UUID.test(id)) throw new ApiError(400, "BAD_REQUEST", "social_post_id must be a uuid");
  const row = await deps.db.getPost(id.toLowerCase());
  if (!row) throw new ApiError(404, "NOT_FOUND", "post not found");
  const lockFree = !row.lock_until || (ms(row.lock_until) ?? 0) < deps.now();
  const retryable = row.status === "published" && !!row.post_urn &&
    (row.comment_status === "failed" || ((row.comment_status === "pending" || row.comment_status === "requested") && lockFree));
  if (!retryable) throw new ApiError(409, "COMMENT_NOT_RETRYABLE", "the first comment cannot be retried right now");
  await requireConnected(deps);
  const reset = await deps.db.updatePost(row.id, { status: "published", comment_status: row.comment_status }, {
    comment_attempts: 0,
    // Restarts the 24-hour comment phase (stage stays post_created; stage_changed_at is the phase clock).
    stage_changed_at: iso(deps.now()),
    // If a comment was ever sent, reconcile first (it may exist); otherwise start from pending.
    comment_status: row.comment_text_sent ? "requested" : "pending",
    last_error: null,
    next_attempt_at: null,
  });
  if (!reset) throw new ApiError(409, "COMMENT_NOT_RETRYABLE", "the post changed; try again");
  const r = await processPost(deps, ctx, row.id, { manual: true, commentOnly: true });
  if (!r) throw new ApiError(409, "BUSY", "this post is being processed right now");
  const after = await deps.db.getPost(row.id);
  return postSummary(after ?? reset);
}

// ---------------------------------------------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------------------------------------------

async function blogLive(deps: Deps, blog: Item | null): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!blog || blog.type !== "blog") return { ok: false, reason: "blog not live yet (blog not found)" };
  const slug = (blog.body as Obj | null)?.slug;
  if (blog.status !== "published" || !blog.published_url) return { ok: false, reason: "blog not live yet (not published)" };
  if (!blogUrlOk(blog.published_url, slug)) return { ok: false, reason: "blog not live yet (unexpected blog URL)" };
  try {
    const r = await deps.fetch(blog.published_url, {
      method: "GET",
      redirect: "manual",
      credentials: "omit",
      headers: { "User-Agent": "DhitiMarketingBot/1.0 (+linkedin publisher)", Accept: "text/html" },
      signal: AbortSignal.timeout(10_000),
    });
    const type = r.headers.get("content-type") ?? "";
    await r.body?.cancel().catch(() => {});
    if (r.status !== 200) return { ok: false, reason: `blog not live yet (HTTP ${r.status})` };
    if (!/^text\/html\b/i.test(type)) return { ok: false, reason: "blog not live yet (not an HTML page)" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "blog not live yet (HTTP 0)" };
  }
}

type Media = { bytes: Uint8Array; mime: string; poster?: { bytes: Uint8Array; mime: string } | null; altText?: string };

/** Gates 2 to 4. Returns the error text for the first failing gate, or the media to post. */
async function sourceAndMedia(deps: Deps, row: Post, blog: Item, loadBytes: boolean): Promise<{ err: string } | { media: Media | null; source: Item }> {
  if (!row.source_item_id) return { err: `approve the ${row.format} first` };
  const src = await deps.db.getItem(row.source_item_id);
  if (!src || src.parent_id !== blog.id || src.type !== row.format || !["approved", "published"].includes(src.status)) {
    return { err: `the ${row.format} for this blog is not approved` };
  }
  const ce = captionError(row.caption);
  if (ce) return { err: ce };
  const fe = firstCommentError(row.first_comment);
  if (fe) return { err: fe };
  const assets = (await deps.db.listAssets(src.id)).slice().sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
  let pick: Asset | undefined;
  let poster: Asset | undefined;
  if (row.format === "carousel") {
    pick = assets.find((a) => a.kind === "carousel_pdf" && (a.mime ?? "application/pdf") === "application/pdf");
    if (!pick) return { err: "the carousel PDF is missing" };
  } else if (row.format === "graphic") {
    const imgs = assets.filter((a) => a.kind === "graphic" && /^image\/(png|jpeg|gif)$/.test(a.mime ?? "image/png"));
    pick = imgs.find((a) => a.width === 1080 && a.height === 1080) ?? imgs.find((a) => a.width === 1200 && a.height === 627);
    if (!pick) return { err: "the graphic image is missing" };
    if ((pick.width ?? 0) * (pick.height ?? 0) >= MAX_IMAGE_PIXELS) return { err: "the graphic image is too large" };
  } else {
    pick = assets.find((a) => a.kind === "video" && (a.mime ?? "video/mp4") === "video/mp4");
    if (!pick) return { err: "the reel video is missing" };
    poster = assets.find((a) => a.kind === "video_poster" && /^image\/(png|jpeg)$/.test(a.mime ?? "image/jpeg"));
  }
  if (!loadBytes) return { media: null, source: src };
  let bytes: Uint8Array;
  try {
    bytes = await deps.db.download(pick.storage_path);
  } catch {
    return { err: `could not read the ${row.format} file` };
  }
  if (row.format === "carousel") {
    if (bytes.length > MAX_DOC_BYTES) return { err: "the carousel PDF is larger than 100 MB" };
    if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) return { err: "the carousel file is not a PDF" };
    const pages = (new TextDecoder("latin1").decode(bytes).match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length;
    if (pages > 300) return { err: "the carousel PDF has more than 300 pages" };
  }
  if (row.format === "video" && (bytes.length < MIN_VIDEO_BYTES || bytes.length > MAX_VIDEO_BYTES)) {
    return { err: `the reel video must be between 75 KB and ${MAX_VIDEO_BYTES / 1024 / 1024} MB` };
  }
  let posterMedia: Media["poster"] = null;
  if (poster) {
    try {
      posterMedia = { bytes: await deps.db.download(poster.storage_path), mime: poster.mime ?? "image/jpeg" };
    } catch {
      posterMedia = null;
    }
  }
  const body = (src.body ?? {}) as Obj;
  const alt = String(body.headline ?? src.title ?? blog.title ?? "").replace(/\s+/g, " ").trim();
  return { media: { bytes, mime: pick.mime ?? "", poster: posterMedia, altText: [...alt].slice(0, 120).join("") }, source: src };
}

// ---------------------------------------------------------------------------------------------------------------
// The publish state machine (LINKEDIN.md 3.7.1)
// ---------------------------------------------------------------------------------------------------------------

type RunOut = { id: string; from: string; to: string; stage: string | null; comment_status: string; note: string; stop?: boolean };

class Runner {
  deps: Deps;
  ctx: Ctx;
  conn: Conn;
  li: LinkedIn;
  row: Post;
  lock: string | null;
  note = "";
  nextAt: number | null = null;
  constructor(deps: Deps, ctx: Ctx, conn: Conn, li: LinkedIn, row: Post) {
    this.deps = deps;
    this.ctx = ctx;
    this.conn = conn;
    this.li = li;
    this.row = row;
    this.lock = row.lock_until;
  }
  now() {
    return this.deps.now();
  }
  /** Conditional write. Throws when the row moved under us (someone else owns it now). */
  async write(expect: PostExpect, patch: Partial<Post>): Promise<Post> {
    const r = await this.deps.db.updatePost(this.row.id, { ...expect, lock_until: this.lock }, patch);
    if (!r) throw new ApiError(409, "CONFLICT", "the post changed while publishing; it will continue on the next run");
    this.row = r;
    return r;
  }
  async setStage(stage: Post["stage"], patch: Partial<Post> = {}) {
    return await this.write({ status: this.row.status, stage: this.row.stage }, { stage, stage_changed_at: iso(this.now()), ...patch });
  }
  async fail(msg: string, patch: Partial<Post> = {}) {
    this.note = msg;
    return await this.write({ status: this.row.status, stage: this.row.stage }, { status: "failed", last_error: scrub(this.ctx, msg), next_attempt_at: null, ...patch });
  }
  wait(msDelay: number, note: string, lastError?: string | null) {
    this.nextAt = this.now() + msDelay;
    this.note = note;
    if (lastError !== undefined) this.pendingError = lastError;
  }
  pendingError: string | null | undefined = undefined;

  /** Handles a non-2xx LinkedIn answer that does not prove anything either way: wait and retry. */
  async transient(r: LiRes | null, what: string) {
    if (r && r.status === 429) await this.rateLimited(what);
    if (r && r.status === 426) {
      await this.deps.db.updateConnection({ last_error: `LinkedIn API version ${LINKEDIN_VERSION} is no longer supported; update LINKEDIN_VERSION` });
      this.wait(HOUR, `${what}: API version not supported`, "LinkedIn API version is no longer supported");
      return;
    }
    if (r && r.status === 401) {
      this.wait(10 * MIN, `${what}: token rejected`, "LinkedIn rejected the token");
      return;
    }
    this.wait(this.backoff(2 * MIN), `${what}: ${r ? `HTTP ${r.status}` : "network error"}`, `${what}: ${r ? liErr(this.ctx, r) : "network error"}`);
  }

  /** How long the row has been in its current phase (stage_changed_at; retry_comment restarts it). */
  phaseAge(): number {
    const since = ms(this.row.stage_changed_at);
    return since === null ? 0 : this.now() - since;
  }
  /** After the first hour in a phase, LinkedIn is asked at most once an hour. */
  backoff(d: number): number {
    return this.phaseAge() > SLOW_AFTER_MS ? Math.max(d, SLOW_WAIT_MS) : d;
  }
  /** Marks the first comment failed (the post itself stays published). */
  async commentFail(msg: string) {
    await this.write({ status: "published", comment_status: this.row.comment_status }, {
      comment_status: "failed",
      last_error: scrub(this.ctx, msg),
      next_attempt_at: null,
    });
    this.note = msg;
  }
  /** Gives up on a post whose creation could not be confirmed. Never re-POSTs: the post may exist. */
  async failUnconfirmed(why: string) {
    await this.fail(`could not confirm the post on LinkedIn (${why}); check the company page before approving again`);
  }

  async rateLimited(what: string): Promise<never> {
    const now = this.now();
    const prev = ms(this.conn.last_429_at);
    const midnight = nextUtcMidnight(now);
    const until = prev !== null && sameUtcDay(prev, now) ? midnight : Math.min(now + 15 * MIN, midnight);
    this.conn = await this.deps.db.updateConnection({ last_429_at: iso(now), rate_limited_until: iso(until) });
    this.nextAt = until;
    this.note = `${what}: rate limited by LinkedIn`;
    this.pendingError = "LinkedIn rate limit reached; it will continue automatically";
    throw new RateLimited(what);
  }

  // ----- media -----

  async uploadMedia(media: Media) {
    const owner = this.conn.org_urn!;
    const kind = this.row.format === "graphic" ? "images" : this.row.format === "carousel" ? "documents" : "videos";
    const initBody: Obj = { initializeUploadRequest: { owner } };
    if (kind === "videos") {
      initBody.initializeUploadRequest = {
        owner,
        fileSizeBytes: media.bytes.length,
        uploadCaptions: false,
        uploadThumbnail: !!media.poster,
      };
    }
    const init = await this.li.rest(`${kind}_init`, "POST", `/${kind}?action=initializeUpload`, { body: initBody });
    if (!ok2xx(init.status) || !init.json) {
      if (init.status >= 400 && init.status < 500 && ![401, 409, 426, 429].includes(init.status)) {
        await this.fail(`LinkedIn refused the upload: ${liErr(this.ctx, init)}`);
        return;
      }
      await this.transient(init, "upload init");
      return;
    }
    const v = (init.json.value ?? {}) as Obj;
    const urn = kind === "images" ? v.image : kind === "documents" ? v.document : v.video;
    const prefix = kind === "images" ? "urn:li:image:" : kind === "documents" ? "urn:li:document:" : "urn:li:video:";
    if (typeof urn !== "string" || !urn.startsWith(prefix)) {
      await this.transient(null, "upload init returned no media id");
      return;
    }
    await this.setStage("media_uploading", { media_urn: urn, media_status: "WAITING_UPLOAD", thumbnail_urn_uploaded: false });

    if (kind !== "videos") {
      const put = await this.li.upload(`${kind}_put`, v.uploadUrl, media.bytes, { "Content-Type": kind === "documents" ? "application/pdf" : media.mime || "application/octet-stream" }, true);
      if (!ok2xx(put.status)) {
        await this.transient(put, "upload");
        return;
      }
      await this.setStage("media_processing", { media_status: "PROCESSING" });
      await this.pollMedia(3);
      return;
    }

    // Video: parts (no token), thumbnail (no token), finalize.
    const instr = Array.isArray(v.uploadInstructions) ? (v.uploadInstructions as Obj[]) : [];
    const size = media.bytes.length;
    let expectNext = 0;
    for (const p of instr) {
      const fb = Number(p.firstByte);
      const lb = Number(p.lastByte);
      if (!Number.isInteger(fb) || !Number.isInteger(lb) || fb !== expectNext || lb < fb || lb >= size) {
        await this.transient(null, "upload instructions do not cover the file");
        return;
      }
      expectNext = lb + 1;
    }
    if (!instr.length || expectNext !== size) {
      await this.transient(null, "upload instructions do not cover the file");
      return;
    }
    const etags: string[] = [];
    for (const p of instr) {
      const part = media.bytes.subarray(Number(p.firstByte), Number(p.lastByte) + 1);
      const put = await this.li.upload("video_part", p.uploadUrl, part, { "Content-Type": "application/octet-stream" }, false);
      const etag = put.headers.get("etag");
      if (!ok2xx(put.status) || !etag) {
        await this.transient(put, "video part upload");
        return;
      }
      const id = etagToPartId(etag);
      if (!id) {
        await this.transient(null, "video part upload returned an empty ETag");
        return;
      }
      etags.push(id);
    }
    if (media.poster) {
      const put = await this.li.upload("video_thumbnail", v.thumbnailUploadUrl, media.poster.bytes, { "media-type-family": "STILLIMAGE", "Content-Type": "application/octet-stream" }, false);
      if (!ok2xx(put.status)) {
        await this.transient(put, "thumbnail upload");
        return;
      }
      await this.write({ status: this.row.status, stage: this.row.stage }, { thumbnail_urn_uploaded: true });
    }
    const fin = await this.li.rest("videos_finalize", "POST", "/videos?action=finalizeUpload", {
      body: { finalizeUploadRequest: { video: urn, uploadToken: typeof v.uploadToken === "string" ? v.uploadToken : "", uploadedPartIds: etags } },
    });
    if (!ok2xx(fin.status)) {
      if (final4xx(fin.status)) {
        // A definite refusal: retrying would re-upload the whole video on every run.
        await this.fail(`LinkedIn refused the video finalize: ${liErr(this.ctx, fin)}`);
        return;
      }
      await this.transient(fin, "video finalize");
      return;
    }
    await this.setStage("media_processing", { media_status: "PROCESSING" });
    await this.pollMedia(1);
  }

  async pollMedia(times: number) {
    const kind = this.row.format === "graphic" ? "images" : this.row.format === "carousel" ? "documents" : "videos";
    for (let i = 0; i < times; i++) {
      if (i > 0) await this.deps.sleep(2_000);
      const r = await this.li.rest(`${kind}_status`, "GET", `/${kind}/${encodeUrn(this.row.media_urn!)}`);
      if (r.status !== 200 || !r.json) {
        await this.transient(r, "media status");
        return;
      }
      const st = String(r.json.status ?? "");
      if (st === "AVAILABLE") {
        await this.setStage("media_ready", { media_status: st });
        return;
      }
      if (st === "PROCESSING_FAILED") {
        const reason = typeof r.json.processingFailureReason === "string" ? r.json.processingFailureReason : "unknown reason";
        await this.fail(`LinkedIn could not process the ${this.row.format}: ${reason}`, { media_status: st });
        return;
      }
      if (st && st !== this.row.media_status) {
        await this.write({ status: this.row.status, stage: this.row.stage }, { media_status: st.slice(0, 40) });
      }
    }
    const since = ms(this.row.stage_changed_at) ?? this.now();
    if (this.now() - since > (this.row.format === "video" ? VIDEO_PROCESSING_LIMIT_MS : 30 * MIN)) {
      await this.fail(`LinkedIn took too long to process the ${this.row.format}`);
      return;
    }
    this.wait(2 * MIN, `${this.row.format} ${this.row.media_status ?? "PROCESSING"}`, null);
  }

  // ----- post -----

  postBody(blog: Item, media: { altText?: string }) {
    const fm = ((blog.body as Obj | null)?.frontmatter ?? {}) as Obj;
    const title = [...String(blog.title || fm.title || "").replace(/\s+/g, " ").trim()].slice(0, 200).join("");
    const m: Obj = { id: this.row.media_urn };
    if (this.row.format === "graphic") m.altText = media.altText || title.slice(0, 120);
    else m.title = title || "Dhiti Services";
    return {
      author: this.conn.org_urn,
      commentary: buildCommentary(this.row.caption),
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      content: { media: m },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    };
  }

  async adoptPost(urn: string) {
    const now = this.now();
    await this.write({ status: this.row.status, stage: "post_requested" }, {
      post_urn: urn,
      post_url: postUrl(urn),
      stage: "post_created",
      stage_changed_at: iso(now),
      status: "published",
      published_at: iso(now),
      comment_status: "pending",
      last_error: null,
      next_attempt_at: null,
    });
    this.note = "posted";
  }

  async createPost(blog: Item, media: { altText?: string }) {
    // Write the intent FIRST: if the response is lost, the next run reconciles instead of posting again.
    await this.write({ status: this.row.status, stage: this.row.stage }, {
      stage: "post_requested",
      stage_changed_at: iso(this.now()),
      post_attempts: this.row.post_attempts + 1,
    });
    let r: LiRes;
    try {
      r = await this.li.rest("post_create", "POST", "/posts", { body: this.postBody(blog, media) });
    } catch (e) {
      if (e instanceof NetError || e instanceof OutOfTime) {
        this.wait(RECONCILE_GRACE_MS, "post create: no response, will reconcile", "LinkedIn did not answer; checking before trying again");
        return;
      }
      throw e;
    }
    const id = r.headers.get("x-restli-id");
    if (ok2xx(r.status) && id && /^urn:li:(share|ugcPost):[0-9]+$/.test(id)) {
      await this.adoptPost(id);
      return;
    }
    if (ok2xx(r.status)) {
      this.wait(RECONCILE_GRACE_MS, "post create: no id in response, will reconcile", "LinkedIn did not return the post id; checking");
      return;
    }
    if (r.status >= 400 && r.status < 500 && ![401, 409, 426, 429].includes(r.status)) {
      // A definite refusal: no post exists. Media stays ready for a re-approval after a fix.
      await this.fail(`LinkedIn refused the post: ${liErr(this.ctx, r)}`, { stage: "media_ready" });
      return;
    }
    await this.transient(r, "post create");
    if (r.status !== 429 && this.nextAt !== null) this.nextAt = Math.max(this.nextAt, this.now() + RECONCILE_GRACE_MS);
  }

  /** Looks for our post among the page's recent posts (AUTHOR view shows posts still processing). */
  async findPost(): Promise<string | null | undefined> {
    const q = `/posts?author=${encodeUrn(this.conn.org_urn!)}&q=author&count=20&sortBy=CREATED&viewContext=AUTHOR`;
    const r = await this.li.rest("post_reconcile", "GET", q, { finder: true });
    if (r.status !== 200 || !r.json) {
      if (final4xx(r.status)) {
        await this.failUnconfirmed(r.status === 403 ? "LinkedIn denied access; reconnect" : liErr(this.ctx, r));
        return undefined;
      }
      if (r.status !== 429 && this.phaseAge() > PHASE_LIMIT_MS) {
        await this.failUnconfirmed("LinkedIn did not answer for 24 hours");
        return undefined;
      }
      await this.transient(r, "post reconcile");
      return undefined;
    }
    const els = Array.isArray(r.json.elements) ? (r.json.elements as Obj[]) : [];
    for (const el of els) {
      // The finder is already scoped to our page (author=<org urn>), and the media URN is unique to our upload, so
      // match on the media alone: LinkedIn samples return the author as urn:li:organization:<id> or
      // urn:li:company:<id>, and a missed match would mean a duplicate re-POST.
      const media = ((el.content as Obj | undefined)?.media as Obj | undefined)?.id;
      if (media === this.row.media_urn && typeof el.id === "string" && /^urn:li:(share|ugcPost):[0-9]+$/.test(el.id)) return el.id;
    }
    return null;
  }

  async reconcilePost(blog: Item, media: { altText?: string }, gateErr: string | null) {
    let found: string | null | undefined;
    try {
      found = await this.findPost();
    } catch (e) {
      if (e instanceof NetError) {
        if (this.phaseAge() > PHASE_LIMIT_MS) {
          await this.failUnconfirmed("LinkedIn could not be reached for 24 hours");
          return;
        }
        this.wait(this.backoff(2 * MIN), "post reconcile: network error");
        return;
      }
      throw e;
    }
    if (found === undefined) return;
    if (found) {
      await this.adoptPost(found);
      return;
    }
    const since = ms(this.row.stage_changed_at) ?? 0;
    if (this.now() - since < RECONCILE_GRACE_MS) {
      this.nextAt = since + RECONCILE_GRACE_MS;
      this.note = "post not visible yet; checking again shortly";
      return;
    }
    if (gateErr) {
      await this.fail(gateErr, { stage: "media_ready" });
      return;
    }
    if (this.row.post_attempts >= MAX_POST_ATTEMPTS) {
      await this.fail(`the post could not be confirmed after ${MAX_POST_ATTEMPTS} tries`, { stage: "media_ready" });
      return;
    }
    // Not on LinkedIn: re-post (the write of post_requested + post_attempts happens first, inside createPost).
    await this.createPost(blog, media);
  }

  // ----- first comment -----

  commentText(blog: Item): string {
    return buildCommentText(this.row.first_comment, blog.published_url!, String((blog.body as Obj).slug));
  }

  async checkPostState(): Promise<"go" | "wait" | "failed" | "error"> {
    const r = await this.li.rest("post_get", "GET", `/posts/${encodeUrn(this.row.post_urn!)}?viewContext=AUTHOR`);
    if (r.status !== 200 || !r.json) {
      if (final4xx(r.status)) {
        await this.commentFail(this.readRefusal(r));
        return "failed";
      }
      await this.transient(r, "post check");
      return "error";
    }
    const st = r.json.lifecycleState;
    if (st === "PUBLISHED") return "go";
    if (st === "DRAFT") {
      await this.commentFail("the post is a draft on LinkedIn; publish it there, then use Retry comment");
      return "failed";
    }
    if (st === "PUBLISH_FAILED") {
      await this.write({ status: "published", comment_status: this.row.comment_status }, {
        status: "failed",
        last_error: "LinkedIn could not publish the post (PUBLISH_FAILED)",
        next_attempt_at: null,
      });
      this.note = "post failed on LinkedIn";
      return "failed";
    }
    if (this.phaseAge() > PHASE_LIMIT_MS) {
      await this.commentFail(`the post is still ${String(st ?? "PROCESSING").replace(/[^A-Z_]/g, "").slice(0, 40)} on LinkedIn after 24 hours; use Retry comment once it is live`);
      return "failed";
    }
    const shown = String(st ?? "PROCESSING").replace(/[^A-Z_]/g, "").slice(0, 40) || "PROCESSING";
    this.wait(this.backoff(2 * MIN), `post ${shown}`, `LinkedIn shows the post as ${shown}; the first comment waits until it is PUBLISHED`);
    return "wait";
  }

  /** The error text for a definite refusal of a read about our post (GET post, comments list). */
  readRefusal(r: LiRes): string {
    if (r.status === 404 || r.status === 410) return "the post no longer exists on LinkedIn";
    if (r.status === 403) return "LinkedIn denied access to the post (page admin role lost?); reconnect, then use Retry comment";
    return `LinkedIn refused to read the post: ${liErr(this.ctx, r)}`;
  }

  async sendComment(blog: Item) {
    const fe = firstCommentError(this.row.first_comment);
    if (fe) {
      await this.write({ status: "published", comment_status: this.row.comment_status }, { comment_status: "failed", last_error: fe });
      this.note = fe;
      return;
    }
    const text = this.commentText(blog);
    // Write the intent FIRST (requested + attempt + exact text), then call LinkedIn.
    await this.write({ status: "published", comment_status: this.row.comment_status }, {
      comment_status: "requested",
      comment_attempts: this.row.comment_attempts + 1,
      comment_text_sent: text,
      comment_requested_at: iso(this.now()),
    });
    let r: LiRes;
    try {
      r = await this.li.rest("comment_create", "POST", `/socialActions/${encodeUrn(this.row.post_urn!)}/comments`, {
        body: { actor: this.conn.org_urn, object: this.row.post_urn, message: { text } },
      });
    } catch (e) {
      if (e instanceof NetError || e instanceof OutOfTime) {
        this.wait(2 * MIN, "comment: no response, will reconcile", "LinkedIn did not answer the comment; checking before trying again");
        return;
      }
      throw e;
    }
    if (ok2xx(r.status)) {
      const cid = r.headers.get("x-restli-id") ?? (typeof r.json?.id === "string" ? r.json.id : null);
      const curn = typeof r.json?.commentUrn === "string" ? r.json.commentUrn : null;
      if (!cid && !curn) {
        // Accepted but the response was cut: the comment exists; the next run finds it and stores its ids.
        this.wait(2 * MIN, "comment: no id in response, will reconcile", null);
        return;
      }
      await this.write({ status: "published", comment_status: "requested" }, {
        comment_id: cid ? cid.slice(0, 200) : null,
        comment_urn: curn ? curn.slice(0, 300) : null,
        comment_status: "posted",
        last_error: null,
        next_attempt_at: null,
      });
      this.note = "comment posted";
      return;
    }
    if (r.status === 429) {
      // Comments have their own 1-minute limit (COMMENTS): wait 2 minutes, no global back-off.
      this.wait(this.backoff(2 * MIN), "comment: throttled", "LinkedIn comment limit; trying again shortly");
      return;
    }
    if (r.status >= 400 && r.status < 500 && ![401, 409, 426].includes(r.status)) {
      await this.write({ status: "published", comment_status: "requested" }, { comment_status: "failed", last_error: `LinkedIn refused the first comment: ${liErr(this.ctx, r)}` });
      this.note = "comment refused";
      return;
    }
    await this.transient(r, "comment");
  }

  async findComment(): Promise<{ id: string | null; urn: string | null } | null | undefined> {
    const r = await this.li.rest("comment_reconcile", "GET", `/socialActions/${encodeUrn(this.row.post_urn!)}/comments?start=0&count=100`);
    if (r.status !== 200 || !r.json) {
      if (r.status === 429) {
        this.wait(this.backoff(2 * MIN), "comment reconcile: throttled");
        return undefined;
      }
      if (final4xx(r.status)) {
        await this.commentFail(this.readRefusal(r));
        return undefined;
      }
      await this.transient(r, "comment reconcile");
      return undefined;
    }
    const els = Array.isArray(r.json.elements) ? (r.json.elements as Obj[]) : [];
    const sent = this.row.comment_text_sent ?? "";
    const link = sent.split("\n").pop() ?? "";
    const firstLine = sent.split("\n")[0] ?? "";
    for (const el of els) {
      const text = String(((el.message as Obj | undefined)?.text ?? ""));
      // Our page as actor, in either URN form LinkedIn samples use.
      if (el.actor !== this.conn.org_urn && el.actor !== `urn:li:company:${orgIdOf(this.conn.org_urn!)}`) continue;
      if ((link && text.includes(link)) || (firstLine && text.trim().startsWith(firstLine))) {
        return { id: typeof el.id === "string" ? el.id : null, urn: typeof el.commentUrn === "string" ? el.commentUrn : null };
      }
    }
    return null;
  }

  async commentFlow(blog: Item | null) {
    if (!blog || !blog.published_url || !blogUrlOk(blog.published_url, (blog.body as Obj | null)?.slug)) {
      await this.write({ status: "published", comment_status: this.row.comment_status }, { comment_status: "failed", last_error: "the blog link is missing or not a Dhiti blog URL" });
      return;
    }
    if (this.phaseAge() > PHASE_LIMIT_MS) {
      await this.commentFail(`the first comment could not be posted within 24 hours (${(this.row.last_error ?? "no answer").slice(0, 120)}); use Retry comment`);
      return;
    }
    for (let step = 0; step < 4; step++) {
      if (this.row.comment_status === "pending") {
        const st = await this.checkPostState();
        if (st !== "go") return;
        await this.sendComment(blog);
        return;
      }
      if (this.row.comment_status === "requested") {
        let found: { id: string | null; urn: string | null } | null | undefined;
        try {
          found = await this.findComment();
        } catch (e) {
          if (e instanceof NetError) {
            this.wait(this.backoff(2 * MIN), "comment reconcile: network error");
            return;
          }
          throw e;
        }
        if (found === undefined) return;
        if (found) {
          await this.write({ status: "published", comment_status: "requested" }, {
            comment_id: found.id,
            comment_urn: found.urn,
            comment_status: "posted",
            last_error: null,
            next_attempt_at: null,
          });
          this.note = "comment found on LinkedIn";
          return;
        }
        if (this.row.comment_attempts >= MAX_COMMENT_ATTEMPTS) {
          await this.write({ status: "published", comment_status: "requested" }, { comment_status: "failed", last_error: `the first comment failed after ${MAX_COMMENT_ATTEMPTS} tries` });
          this.note = "comment failed";
          return;
        }
        await this.sendComment(blog);
        return;
      }
      return;
    }
  }
}

async function processPost(deps: Deps, ctx: Ctx, id: string, opts: { manual: boolean; blogChecked?: boolean; commentOnly?: boolean }): Promise<RunOut | null> {
  const conn = await deps.db.getConnection();
  if (conn.status !== "connected" || !conn.org_urn) return null;
  const before = await deps.db.getPost(id);
  if (!before) return null;
  const claimed = await deps.db.claimPost(id, LEASE_SECONDS);
  if (!claimed) return null;
  const from = before.status;
  const token = await deps.db.secretGet(SECRET.access);
  const li = new LinkedIn(deps, ctx, token);
  const run = new Runner(deps, ctx, conn, li, claimed);
  let stop = false;
  try {
    if (!token) {
      run.wait(10 * MIN, "no token");
    } else {
      await runMachine(deps, run, from, opts);
    }
  } catch (e) {
    if (e instanceof RateLimited) stop = true;
    else if (e instanceof OutOfTime) run.note = run.note || "out of time; continues next run";
    else if (e instanceof NetError) run.wait(2 * MIN, "network error", "LinkedIn could not be reached; trying again soon");
    else if (e instanceof ApiError && e.code === "CONFLICT") run.note = "row changed; skipped";
    else if (e instanceof ApiError && e.code === "UPLOAD_HOST_REJECTED") {
      await run.fail(e.message).catch(() => null);
    } else {
      run.note = "internal error";
      deps.log(JSON.stringify({ fn: "linkedin", route: ctx.route, post: id, error: scrub(ctx, String((e as Error)?.message ?? e), 200) }));
      run.wait(10 * MIN, "internal error", "unexpected error; trying again later");
    }
  }
  // 401 seen: one introspection decides whether the connection is gone.
  if (ctx.saw401) {
    ctx.saw401 = false;
    const active = await heartbeat(deps, ctx).catch(() => null);
    if (active === false) stop = true;
  }
  // Release the lease (and keep the row's place in the queue).
  const release: Partial<Post> = { lock_until: null };
  if (run.nextAt !== null) release.next_attempt_at = iso(run.nextAt);
  else if (run.row.status === "publishing" || (run.row.status === "published" && ["pending", "requested"].includes(run.row.comment_status))) {
    release.next_attempt_at = null;
  }
  if (run.pendingError !== undefined) release.last_error = run.pendingError === null ? null : scrub(ctx, run.pendingError);
  const released = await deps.db.updatePost(id, { lock_until: run.lock }, release).catch(() => null);
  const row = released ?? run.row;
  return { id, from, to: row.status, stage: row.stage, comment_status: row.comment_status, note: run.note, stop };
}

async function runMachine(deps: Deps, run: Runner, _from: string, opts: { manual: boolean; blogChecked?: boolean; commentOnly?: boolean }) {
  // Runs spent waiting for the blog do not count: only rows with media work in progress can give up here.
  if (run.row.attempts > MAX_CLAIMS && run.row.status === "publishing" && run.row.stage === "post_requested") {
    await run.failUnconfirmed(`gave up after ${MAX_CLAIMS} runs`);
    return;
  }
  if (run.row.attempts > MAX_CLAIMS && run.row.status === "publishing" && run.row.stage !== null) {
    await run.fail("gave up after too many tries");
    return;
  }
  const blog = await deps.db.getItem(run.row.blog_item_id);

  if (run.row.status === "publishing" && !opts.commentOnly) {
    if (!opts.blogChecked) {
      const live = await blogLive(deps, blog);
      if (!live.ok) {
        // Nothing was sent yet (stage null): hand the row back to "approved" so the owner can still change it.
        if (run.row.stage === null && !run.row.post_urn) {
          await run.write({ status: "publishing", stage: null }, { status: "approved", attempts: 0 });
        }
        run.wait(10 * MIN, live.reason, live.reason);
        return;
      }
    }
    for (let step = 0; step < 8 && run.row.status === "publishing"; step++) {
      if (run.nextAt !== null) return;
      const stage = run.row.stage;
      if (stage === "post_requested") {
        // A post may already exist: reconcile (read) before anything else. The media is already on LinkedIn.
        const g = await sourceAndMedia(deps, run.row, blog!, false);
        const gateErr = "err" in g ? g.err : null;
        await run.reconcilePost(blog!, { altText: await altTextFor(deps, run.row, blog!) }, gateErr);
        continue;
      }
      if (stage === "post_created") break; // status is published; fall through to the comment
      const loadBytes = stage === null || stage === "media_uploading" || (stage === "media_processing" && !run.row.media_urn);
      const g = await sourceAndMedia(deps, run.row, blog!, loadBytes);
      if ("err" in g) {
        await run.fail(g.err);
        return;
      }
      if (loadBytes) {
        await run.uploadMedia(g.media!);
        continue;
      }
      if (stage === "media_processing") {
        await run.pollMedia(run.row.format === "video" ? 1 : 3);
        continue;
      }
      if (stage === "media_ready") {
        await run.createPost(blog!, { altText: await altTextFor(deps, run.row, blog!) });
        continue;
      }
    }
  }
  if (run.nextAt !== null) return;
  if (run.row.status === "published" && run.row.post_urn && ["pending", "requested"].includes(run.row.comment_status)) {
    await run.commentFlow(blog);
  }
}

async function altTextFor(deps: Deps, row: Post, blog: Item): Promise<string> {
  if (row.format !== "graphic" || !row.source_item_id) return "";
  const src = await deps.db.getItem(row.source_item_id);
  const body = (src?.body ?? {}) as Obj;
  const alt = String(body.headline ?? src?.title ?? blog.title ?? "").replace(/\s+/g, " ").trim();
  return [...alt].slice(0, 120).join("");
}
