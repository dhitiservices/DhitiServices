// Data access for the engine. One API, two backends (ARCHITECTURE.md v2, "Engine modules" / "Auth model"):
//
//   - live:    the Supabase Edge Function `engine` (POST {action, payload}, header x-engine-token = ENGINE_TOKEN).
//              No service key ever lives in the engine; the function authenticates the token itself.
//   - DRY_RUN: a local JSON "server" (out/db.json + files under out/storage/) that implements the same actions with
//              the same validation, defaults and errors, so a dry run exercises exactly the code paths of a live run.
//
// Every public function goes through call(action, payload), so both backends share one code path.
// Any argument that expects an id also accepts a row object ({ id }).
//
// Env: ENGINE_TOKEN (required unless DRY_RUN), ENGINE_URL (default below), DRY_RUN=1, OUT_DIR,
//      ENGINE_PUBLISHABLE_KEY (optional override of the public key), DRY_RUN_KIND = any | session | publisher
//      (DRY_RUN only; default "any" = union of session + publisher rights, so approval/publish can be simulated).
// HTTPS_PROXY / NO_PROXY are honoured for every request (needed in Claude Code cloud sessions).
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as cfg from './config.js';
import * as logmod from './log.js';

// =====================================================================================================================
// Configuration
// =====================================================================================================================

export const DEFAULT_ENGINE_URL = 'https://yexxrcgxhwsopssfyylo.supabase.co/functions/v1/engine';
// Publishable key: public by design (ARCHITECTURE.md). Sent as apikey / Authorization for the API gateway.
const DEFAULT_PUBLISHABLE_KEY = 'sb_publishable_eggopcLFltAS1Q3nTmGecQ_dUMTCIhR';

/** Settings defaults from the contract. Stored values override these key by key. */
export const CONTRACT_SETTINGS = Object.freeze({
  blogs_per_week: 3,
  carousels_per_blog: 1,
  graphics_per_blog: 2,
  videos_per_blog: 1,
  publish_days: ['Monday', 'Wednesday', 'Friday'],
  audience:
    'Founders and operations heads at travel agencies, tour operators, TMCs, OTAs, travel-tech companies and hotels in India and abroad who need reliable back-office, data, support and operations work done.',
  avoid_topics: [],
  extra_guidance: '',
});

const env = (name, fallback = '') => {
  const v = process.env[name];
  return v === undefined || String(v).trim() === '' ? fallback : String(v).trim();
};
const flag = (name) => /^(1|true|yes|on)$/i.test(env(name));

/** True when the JSON-file backend is active (read at call time so tests and CLIs can toggle it). */
const isDryRun = () => flag('DRY_RUN');
export const backendName = () => (isDryRun() ? 'dry-run' : 'edge');

const engineUrl = () => env('ENGINE_URL', DEFAULT_ENGINE_URL);
const publishableKey = () => env('ENGINE_PUBLISHABLE_KEY', DEFAULT_PUBLISHABLE_KEY);
const engineRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = () => path.resolve(env('OUT_DIR', cfg.config?.outDir || path.join(engineRoot, 'out')));

const warn = (...a) => (typeof logmod.warn === 'function' ? logmod.warn(...a) : console.error(...a));
const logText = () => (typeof logmod.getLogText === 'function' ? logmod.getLogText() : '');

const nowISO = () => new Date().toISOString();
const idOf = (x) => (x && typeof x === 'object' ? x.id : x);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clone = (v) => (v === undefined ? v : structuredClone(v));

// IST (UTC+05:30, no DST) calendar helpers, identical to the edge function.
const istToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
function addDaysYmd(ymd, n) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function weekStartIST() {
  const t = istToday();
  return addDaysYmd(t, -((new Date(`${t}T00:00:00Z`).getUTCDay() + 6) % 7));
}

// =====================================================================================================================
// Errors
// =====================================================================================================================

export class EngineError extends Error {
  constructor(action, status, message, { retryable = false, retryAfterMs, cause } = {}) {
    super(`engine.${action}: ${message}${status ? ` (HTTP ${status})` : ''}`, cause ? { cause } : undefined);
    this.name = 'EngineError';
    this.action = action;
    this.status = status;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }
}
/** Backwards-compatible alias (older modules caught StoreError). */
export const StoreError = EngineError;

// =====================================================================================================================
// HTTP (node:https, proxy-aware, no dependencies)
// =====================================================================================================================

function proxyFor(url) {
  const u = new URL(url);
  if (u.protocol !== 'https:') return null;
  const proxy = env('HTTPS_PROXY') || env('https_proxy');
  if (!proxy) return null;
  const host = u.hostname.toLowerCase();
  const noProxy = (env('NO_PROXY') || env('no_proxy')).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  for (const np of noProxy) {
    if (np === '*') return null;
    const bare = np.replace(/^\*?\./, '').replace(/:\d+$/, '');
    if (host === bare || host.endsWith(`.${bare}`)) return null;
  }
  return new URL(proxy);
}

/** https.Agent that tunnels through an HTTP proxy with CONNECT (keeps TLS end-to-end). */
class TunnelAgent extends https.Agent {
  constructor(proxyUrl) {
    super({ keepAlive: true, maxSockets: 8 });
    this.proxyUrl = proxyUrl;
  }
  createConnection(options, callback) {
    const p = this.proxyUrl;
    const target = `${options.host}:${options.port || 443}`;
    const headers = { host: target };
    if (p.username) headers['proxy-authorization'] = `Basic ${Buffer.from(`${decodeURIComponent(p.username)}:${decodeURIComponent(p.password)}`).toString('base64')}`;
    const req = (p.protocol === 'https:' ? https : http).request({
      host: p.hostname,
      port: p.port || (p.protocol === 'https:' ? 443 : 80),
      method: 'CONNECT',
      path: target,
      headers,
      agent: false,
    });
    req.once('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        const err = new Error(`proxy CONNECT ${target} failed: ${res.statusCode} ${res.statusMessage || ''}`.trim());
        err.code = 'EPROXYCONNECT';
        err.proxyStatus = res.statusCode;
        callback(err);
        return;
      }
      const tlsSocket = tls.connect({ ...options, socket, servername: options.servername || options.host });
      callback(null, tlsSocket);
    });
    req.once('error', (err) => {
      err.code ||= 'EPROXYCONNECT';
      callback(err);
    });
    req.end();
  }
}

const agents = new Map();
function agentFor(url) {
  const proxy = proxyFor(url);
  const key = proxy ? proxy.href : 'direct';
  if (!agents.has(key)) agents.set(key, proxy ? new TunnelAgent(proxy) : new https.Agent({ keepAlive: true, maxSockets: 8 }));
  return agents.get(key);
}

/** Connection-phase failures: the request never reached the server, so retrying is always safe. */
const CONNECT_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EPROXYCONNECT', 'UND_ERR_CONNECT_TIMEOUT', 'ECONNECT_TIMEOUT']);
const NETWORK_CODES = new Set([...CONNECT_CODES, 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ESOCKETTIMEDOUT', 'UND_ERR_SOCKET', 'ERR_STREAM_PREMATURE_CLOSE']);

/**
 * Minimal proxy-aware HTTP(S) client. Resolves { status, headers, body: Buffer } for any status; rejects on
 * network errors (err.code set; err.connectPhase = true when nothing was sent). Follows up to 5 redirects for GET.
 * Exported so other engine modules (e.g. `cli.js fetch`) can download through the same proxy logic.
 */
export function httpRequest(url, { method = 'GET', headers = {}, body, timeoutMs = 60_000, maxRedirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'http:' ? http : https;
    const payload = body === undefined || body === null ? null : Buffer.isBuffer(body) ? body : body instanceof Uint8Array ? Buffer.from(body.buffer, body.byteOffset, body.byteLength) : Buffer.from(String(body));
    const h = { 'user-agent': 'dhiti-marketing-engine', ...headers };
    if (payload) h['content-length'] = String(payload.length);
    let connected = false;
    const req = lib.request(u, { method, headers: h, agent: u.protocol === 'https:' ? agentFor(url) : undefined }, (res) => {
      const status = res.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status) && res.headers.location && maxRedirects > 0 && (method === 'GET' || method === 'HEAD')) {
        res.resume();
        resolve(httpRequest(new URL(res.headers.location, u).href, { method, headers, timeoutMs, maxRedirects: maxRedirects - 1 }));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.on('socket', (s) => {
      if (!s.connecting) connected = true;
      else s.once(s.encrypted !== undefined ? 'secureConnect' : 'connect', () => (connected = true));
    });
    req.setTimeout(timeoutMs, () => {
      const err = new Error(`${method} ${u.host}${u.pathname} timed out after ${Math.round(timeoutMs / 1000)}s`);
      err.code = connected ? 'ETIMEDOUT' : 'ECONNECT_TIMEOUT';
      req.destroy(err);
    });
    req.on('error', (err) => {
      if (!connected || CONNECT_CODES.has(err.code)) err.connectPhase = true;
      reject(err);
    });
    if (payload) req.write(payload);
    req.end();
  });
}

function retryAfter(headers) {
  const v = headers?.['retry-after'];
  if (!v) return undefined;
  const s = Number(v);
  if (Number.isFinite(s)) return s * 1000;
  const at = Date.parse(v);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined;
}

async function withRetry(label, fn, { retries = 4, baseMs = 800, maxMs = 15_000, shouldRetry }) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (attempt >= retries || !shouldRetry(err)) throw err;
      const backoff = Math.min(maxMs, baseMs * 2 ** attempt);
      const wait = Math.max(err.retryAfterMs ?? 0, Math.round(backoff / 2 + Math.random() * (backoff / 2)));
      warn(`${label} failed (attempt ${attempt + 1}/${retries + 1}): ${err.message}. Retrying in ${(wait / 1000).toFixed(1)}s`);
      await sleep(wait);
    }
  }
}

// =====================================================================================================================
// Live backend: the edge function
// =====================================================================================================================

/** Safe to repeat after an ambiguous failure (the server may or may not have applied the first attempt). */
const IDEMPOTENT = new Set([
  'get_settings', 'context', 'get_brief', 'get_topic', 'list_topics', 'get_item', 'list_items', 'list_assets',
  'sign_upload', 'sign_download', 'update_topic', 'update_item', 'finish_run', 'finish_job', 'delete_assets', 'delete_files',
]);
const RETRY_STATUS_ANY = new Set([408, 425, 429, 500, 502, 503, 504, 546]);
const RETRY_STATUS_UNSENT = new Set([429, 503]); // the gateway refused before the function ran

function engineToken() {
  const t = env('ENGINE_TOKEN');
  if (!t) {
    throw new EngineError('auth', 0, 'ENGINE_TOKEN is not set. Get one with the Supabase connector: ' +
      "select public.issue_engine_token('session', 8, 'weekly run'); or run with DRY_RUN=1.");
  }
  return t;
}

async function remoteCall(action, payload) {
  const token = engineToken();
  const url = engineUrl();
  const body = JSON.stringify({ action, payload: payload ?? {} });
  const idempotent = IDEMPOTENT.has(action);
  return withRetry(`engine.${action}`, async () => {
    let res;
    try {
      res = await httpRequest(url, {
        method: 'POST',
        timeoutMs: 90_000,
        body,
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          apikey: publishableKey(),
          authorization: `Bearer ${publishableKey()}`,
          'x-engine-token': token,
          'x-client-info': 'dhiti-marketing-engine/2',
        },
      });
    } catch (err) {
      throw new EngineError(action, 0, `network error: ${err.message}`, {
        cause: err,
        retryable: err.connectPhase === true || (idempotent && NETWORK_CODES.has(err.code)),
      });
    }
    let json = null;
    try {
      json = JSON.parse(res.body.toString('utf8'));
    } catch {
      /* non-JSON (gateway error page) */
    }
    if (res.status >= 200 && res.status < 300 && json?.ok === true) return json.data;
    const message = json?.error || json?.message || res.body.toString('utf8').slice(0, 300) || 'request failed';
    throw new EngineError(action, res.status, message, {
      retryable: (idempotent ? RETRY_STATUS_ANY : RETRY_STATUS_UNSENT).has(res.status),
      retryAfterMs: retryAfter(res.headers),
    });
  }, { shouldRetry: (e) => e.retryable === true });
}

// =====================================================================================================================
// DRY_RUN backend: a local mirror of the edge function
// =====================================================================================================================

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENUMS = {
  runKind: ['weekly', 'jobs', 'publish', 'manual'],
  runFinish: ['succeeded', 'failed', 'running'],
  itemType: ['blog', 'carousel', 'graphic', 'video'],
  itemStatus: ['generating', 'pending_review', 'changes_requested', 'approved', 'rejected', 'published', 'failed'],
  topicStatus: ['planned', 'producing', 'ready', 'skipped', 'failed'],
  assetKind: ['blog_cover', 'carousel_slide', 'carousel_pdf', 'graphic', 'video', 'video_poster'],
  jobKind: ['run_weekly', 'regenerate', 'publish_now'],
  jobStatus: ['queued', 'running', 'done', 'failed'],
  jobFinish: ['done', 'failed', 'queued'],
};
const FIELDS = {
  brief: ['run_id', 'week_start', 'summary', 'trends', 'pain_points', 'competitor_notes', 'opportunities', 'sources'],
  topic: ['brief_id', 'week_start', 'title', 'angle', 'primary_keyword', 'secondary_keywords', 'audience', 'category', 'rationale', 'priority', 'planned_publish_date', 'status', 'error'],
  itemInsert: ['topic_id', 'parent_id', 'type', 'title', 'status', 'body', 'feedback', 'version', 'scheduled_for', 'error'],
  itemPatchSession: ['title', 'status', 'body', 'feedback', 'version', 'scheduled_for', 'error'],
  itemPatchPublisher: ['status', 'published_at', 'published_url', 'error'],
  asset: ['content_item_id', 'kind', 'storage_path', 'mime', 'width', 'height', 'position', 'meta'],
};
const SESSION_ITEM_STATUSES = ['generating', 'pending_review', 'failed'];
const PUBLISHER_ITEM_STATUSES = ['published', 'failed'];
const LOCKED_FOR_SESSION = ['approved', 'published'];
const PUBLISHER_ACTIONS = new Set(['get_settings', 'list_items', 'get_item', 'list_assets', 'sign_download', 'update_item', 'create_run', 'finish_run', 'claim_jobs', 'finish_job']);

const TABLE_DEFAULTS = {
  runs: () => ({ status: 'running', started_at: nowISO(), finished_at: null, log: '', usage: {}, error: null }),
  research_briefs: () => ({ run_id: null, trends: [], pain_points: [], competitor_notes: [], opportunities: [], sources: [], created_at: nowISO() }),
  topics: () => ({ brief_id: null, angle: '', primary_keyword: '', secondary_keywords: [], audience: '', category: '', rationale: '', priority: 0, planned_publish_date: null, status: 'planned', error: null, created_at: nowISO() }),
  content_items: () => ({ topic_id: null, parent_id: null, title: '', status: 'generating', body: {}, feedback: null, version: 1, scheduled_for: null, approved_at: null, approved_by: null, published_at: null, published_url: null, error: null, created_at: nowISO(), updated_at: nowISO() }),
  assets: () => ({ width: null, height: null, position: 0, meta: {}, created_at: nowISO() }),
  jobs: () => ({ payload: {}, status: 'queued', requested_by: null, error: null, created_at: nowISO(), started_at: null, finished_at: null }),
};
const TABLES = ['settings', ...Object.keys(TABLE_DEFAULTS)];

const fail = (status, msg) => {
  throw Object.assign(new Error(msg), { httpStatus: status });
};
const bad = (msg) => fail(400, msg);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const obj = (v, name = 'payload') => (v == null ? {} : isObj(v) ? v : bad(`${name} must be an object`));
const uuid = (v, name = 'id') => (typeof v === 'string' && UUID.test(v) ? v.toLowerCase() : bad(`${name} must be a uuid`));
const optUuid = (v, name) => (v === undefined ? undefined : v === null ? null : uuid(v, name));
const oneOf = (v, allowed, name) => (typeof v === 'string' && allowed.includes(v) ? v : bad(`${name} must be one of: ${allowed.join(', ')}`));
function int(v, name, { min = 1, max = 1000, dflt }) {
  if (v === undefined || v === null) return dflt;
  const n = Number(v);
  if (!Number.isInteger(n)) bad(`${name} must be an integer`);
  return Math.min(max, Math.max(min, n));
}
function pick(input, allowed, label) {
  const out = {};
  const unknown = [];
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined || k === 'updated_at') continue;
    if (allowed.includes(k)) out[k] = v;
    else unknown.push(k);
  }
  if (unknown.length) bad(`${label}: field(s) not allowed: ${unknown.join(', ')}. Allowed: ${allowed.join(', ')}`);
  return out;
}
const nonEmpty = (o, label) => (Object.keys(o).length ? o : bad(`${label}: nothing to update`));
function storagePathOf(v) {
  if (typeof v !== 'string') bad('path must be a string');
  const p = v.replace(/^\/+/, '');
  if (p.length > 512 || p.split('/').some((s) => s === '' || s === '.' || s === '..')) bad(`invalid storage path "${v}"`);
  if (!/^items\/[0-9a-f-]{36}\/[\w.\-/]+$/i.test(p) || !UUID.test(p.split('/')[1])) bad(`storage path must look like items/<content_item_id>/v<version>/<file> (got "${v}")`);
  return p;
}
const truncateTail = (s, max) => {
  const t = typeof s === 'string' ? s : s == null ? '' : JSON.stringify(s);
  return t.length > max ? t.slice(t.length - max) : t;
};
const ymdOk = (v, name) => (v == null || /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? v : bad(`${name}: invalid date "${v}" (YYYY-MM-DD)`));
function inList(v, allowed, name) {
  if (v === undefined || v === null) return undefined;
  const arr = Array.isArray(v) ? v : [v];
  if (!arr.length) return undefined;
  for (const x of arr) if (typeof x !== 'string' || (allowed && !allowed.includes(x))) bad(`${name} has an invalid value: ${x}`);
  return arr;
}
const byCreated = (asc) => (a, b) => (asc ? 1 : -1) * String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''));
const sortAssets = (rows) => rows.sort((a, b) => a.position - b.position || String(a.created_at).localeCompare(String(b.created_at)));

const dbFile = () => path.join(outDir(), 'db.json');
const storageRoot = () => path.join(outDir(), 'storage');
let chain = Promise.resolve();

async function loadDb() {
  let data = {};
  try {
    data = JSON.parse(await fs.readFile(dbFile(), 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw new Error(`Cannot read ${dbFile()}: ${err.message}`);
  }
  for (const t of TABLES) if (!Array.isArray(data[t])) data[t] = [];
  return data;
}

/** Runs fn(db) serialised; writes the file atomically (tmp + rename) when fn reports a change. */
function withDb(fn) {
  const run = chain.then(async () => {
    const data = await loadDb();
    const before = JSON.stringify(data);
    const result = await fn(data);
    if (JSON.stringify(data) !== before) {
      await fs.mkdir(outDir(), { recursive: true });
      const tmp = `${dbFile()}.${process.pid}.${Date.now()}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(data, null, 2));
      await fs.rename(tmp, dbFile());
    }
    return clone(result);
  });
  chain = run.catch(() => {});
  return run;
}

function insertRow(data, table, row) {
  const full = { id: randomUUID(), ...TABLE_DEFAULTS[table](), ...row };
  data[table].push(full);
  return full;
}
const findRow = (data, table, id) => data[table].find((r) => r.id === id) || null;
function requireFk(data, table, id, col) {
  if (id && !findRow(data, table, id)) bad(`${col}: no ${table} row ${id} (foreign key violation)`);
}
const settingsData = (data) => data.settings.find((r) => r.id === 1)?.data ?? { ...CONTRACT_SETTINGS };

const localActions = {
  get_settings: (p, k, data) => settingsData(data),

  context(p, k, data) {
    const weeks = int(p.weeks, 'weeks', { min: 1, max: 104, dflt: 8 });
    const since = addDaysYmd(weekStartIST(), -7 * weeks);
    const keys = ['id', 'title', 'primary_keyword', 'secondary_keywords', 'category', 'week_start', 'planned_publish_date', 'status'];
    const recent = data.topics
      .filter((t) => String(t.week_start) >= since)
      .sort((a, b) => String(b.week_start).localeCompare(String(a.week_start)) || a.priority - b.priority)
      .map((t) => Object.fromEntries(keys.map((x) => [x, t[x] ?? null])));
    const jobs = data.jobs.filter((j) => ['queued', 'running'].includes(j.status)).sort(byCreated(true));
    const revisions = data.content_items
      .filter((i) => i.status === 'changes_requested')
      .sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)))
      .map((i) => ({ ...i, assets: sortAssets(data.assets.filter((a) => a.content_item_id === i.id)) }));
    return { settings: settingsData(data), recent_topics: recent, pending_jobs: jobs, revisions, since, week_start: weekStartIST() };
  },

  create_run: (p, k, data) => insertRow(data, 'runs', { kind: oneOf(p.kind, ENUMS.runKind, 'kind'), status: 'running' }),

  finish_run(p, k, data) {
    const id = uuid(p.id);
    const status = oneOf(p.status ?? 'succeeded', ENUMS.runFinish, 'status');
    const row = findRow(data, 'runs', id) || fail(404, `run ${id} not found`);
    const patch = { status, finished_at: status === 'running' ? null : nowISO() };
    if (p.error !== undefined) patch.error = p.error === null ? null : truncateTail(p.error, 8000);
    if (p.log !== undefined) patch.log = truncateTail(p.log, 1_000_000);
    if (p.usage !== undefined && p.usage !== null) patch.usage = isObj(p.usage) ? p.usage : { value: p.usage };
    return Object.assign(row, patch);
  },

  insert_brief(p, k, data) {
    const row = pick(p, FIELDS.brief, 'insert_brief');
    if (typeof row.summary !== 'string' || !row.summary.trim()) bad('insert_brief: summary is required');
    for (const x of ['trends', 'pain_points', 'competitor_notes', 'opportunities', 'sources']) if (row[x] !== undefined && !Array.isArray(row[x])) bad(`insert_brief: ${x} must be an array`);
    if (row.run_id !== undefined) row.run_id = optUuid(row.run_id, 'run_id');
    requireFk(data, 'runs', row.run_id, 'run_id');
    row.week_start = ymdOk(row.week_start ?? weekStartIST(), 'week_start');
    return insertRow(data, 'research_briefs', row);
  },

  get_brief: (p, k, data) => findRow(data, 'research_briefs', uuid(p.id)) || fail(404, `brief ${p.id} not found`),

  insert_topics(p, k, data) {
    if (!Array.isArray(p.topics) || !p.topics.length) bad('insert_topics: topics must be a non-empty array');
    if (p.topics.length > 30) bad('insert_topics: at most 30 topics per call');
    const rows = p.topics.map((t, i) => {
      const row = pick(obj(t, `topics[${i}]`), FIELDS.topic, `insert_topics[${i}]`);
      if (typeof row.title !== 'string' || !row.title.trim()) bad(`insert_topics[${i}]: title is required`);
      if (row.brief_id !== undefined) row.brief_id = optUuid(row.brief_id, 'brief_id');
      requireFk(data, 'research_briefs', row.brief_id, 'brief_id');
      if (row.status !== undefined) oneOf(row.status, ENUMS.topicStatus, `topics[${i}].status`);
      if (row.secondary_keywords !== undefined && !Array.isArray(row.secondary_keywords)) bad(`topics[${i}].secondary_keywords must be an array`);
      row.week_start = ymdOk(row.week_start ?? weekStartIST(), 'week_start');
      ymdOk(row.planned_publish_date, 'planned_publish_date');
      return row;
    });
    return rows.map((r) => insertRow(data, 'topics', r));
  },

  update_topic(p, k, data) {
    const id = uuid(p.id);
    const patch = nonEmpty(pick(obj(p.patch, 'patch'), FIELDS.topic, 'update_topic'), 'update_topic');
    if (patch.status !== undefined) oneOf(patch.status, ENUMS.topicStatus, 'status');
    if (patch.brief_id !== undefined) patch.brief_id = optUuid(patch.brief_id, 'brief_id');
    ymdOk(patch.planned_publish_date, 'planned_publish_date');
    ymdOk(patch.week_start, 'week_start');
    const row = findRow(data, 'topics', id) || fail(404, `topic ${id} not found`);
    return Object.assign(row, patch);
  },

  get_topic: (p, k, data) => findRow(data, 'topics', uuid(p.id)) || fail(404, `topic ${p.id} not found`),

  list_topics(p, k, data) {
    const limit = int(p.limit, 'limit', { min: 1, max: 500, dflt: 100 });
    const status = inList(p.status, ENUMS.topicStatus, 'status');
    const brief = p.brief_id !== undefined ? uuid(p.brief_id, 'brief_id') : undefined;
    return data.topics
      .filter((t) => (!status || status.includes(t.status)) && (brief === undefined || t.brief_id === brief)
        && (p.week_start === undefined || t.week_start === String(p.week_start)) && (p.since === undefined || String(t.week_start) >= String(p.since)))
      .sort((a, b) => String(b.week_start).localeCompare(String(a.week_start)) || a.priority - b.priority)
      .slice(0, limit);
  },

  insert_item(p, kind, data) {
    const row = pick(p, FIELDS.itemInsert, 'insert_item');
    oneOf(row.type, ENUMS.itemType, 'type');
    if (row.status !== undefined) oneOf(row.status, kind === 'any' ? ENUMS.itemStatus : SESSION_ITEM_STATUSES, 'status');
    if (row.body !== undefined && !isObj(row.body)) bad('insert_item: body must be an object');
    if (row.topic_id !== undefined) row.topic_id = optUuid(row.topic_id, 'topic_id');
    if (row.parent_id !== undefined) row.parent_id = optUuid(row.parent_id, 'parent_id');
    requireFk(data, 'topics', row.topic_id, 'topic_id');
    requireFk(data, 'content_items', row.parent_id, 'parent_id');
    return insertRow(data, 'content_items', row);
  },

  update_item(p, kind, data) {
    const id = uuid(p.id);
    const allowed = kind === 'publisher' ? FIELDS.itemPatchPublisher : kind === 'session' ? FIELDS.itemPatchSession
      : [...new Set([...FIELDS.itemPatchSession, ...FIELDS.itemPatchPublisher, 'approved_at', 'approved_by'])];
    const patch = nonEmpty(pick(obj(p.patch, 'patch'), allowed, `update_item (${kind} token)`), 'update_item');
    if (patch.status !== undefined) {
      oneOf(patch.status, kind === 'publisher' ? PUBLISHER_ITEM_STATUSES : kind === 'session' ? SESSION_ITEM_STATUSES : ENUMS.itemStatus, `status (${kind} token)`);
    }
    if (patch.body !== undefined && !isObj(patch.body)) bad('update_item: body must be an object');
    if (patch.version !== undefined && (!Number.isInteger(patch.version) || patch.version < 1)) bad('version must be a positive integer');
    const row = findRow(data, 'content_items', id) || fail(404, `item ${id} not found`);
    if (kind === 'session' && LOCKED_FOR_SESSION.includes(row.status)) fail(409, `item ${id} is ${row.status}; session tokens cannot modify approved or published items`);
    if (kind === 'publisher' && !LOCKED_FOR_SESSION.includes(row.status)) fail(409, `item ${id} is ${row.status}; publisher tokens may only update approved or published items`);
    return Object.assign(row, patch, { updated_at: nowISO() });
  },

  get_item(p, k, data) {
    const id = uuid(p.id);
    const row = findRow(data, 'content_items', id) || fail(404, `item ${id} not found`);
    return { ...row, assets: sortAssets(data.assets.filter((a) => a.content_item_id === id)) };
  },

  list_items(p, k, data) {
    const limit = int(p.limit, 'limit', { min: 1, max: 500, dflt: 100 });
    const status = inList(p.status, ENUMS.itemStatus, 'status');
    const type = inList(p.type, ENUMS.itemType, 'type');
    const topic = p.topic_id === undefined ? undefined : p.topic_id === null ? null : uuid(p.topic_id, 'topic_id');
    const parent = p.parent_id === undefined ? undefined : p.parent_id === null ? null : uuid(p.parent_id, 'parent_id');
    return data.content_items
      .filter((i) => (!status || status.includes(i.status)) && (!type || type.includes(i.type))
        && (topic === undefined || i.topic_id === topic) && (parent === undefined || i.parent_id === parent))
      .sort(byCreated(false))
      .slice(0, limit);
  },

  insert_asset(p, k, data) {
    const row = pick(p, FIELDS.asset, 'insert_asset');
    row.content_item_id = uuid(row.content_item_id, 'content_item_id');
    const sp = storagePathOf(row.storage_path);
    if (sp.split('/')[1].toLowerCase() !== row.content_item_id) bad('insert_asset: storage_path must be under items/<content_item_id>/');
    row.storage_path = sp;
    oneOf(row.kind, ENUMS.assetKind, 'kind');
    if (typeof row.mime !== 'string' || !row.mime) bad('insert_asset: mime is required');
    if (row.meta !== undefined && !isObj(row.meta)) bad('insert_asset: meta must be an object');
    requireFk(data, 'content_items', row.content_item_id, 'content_item_id');
    return insertRow(data, 'assets', row);
  },

  list_assets(p, k, data) {
    const id = uuid(p.content_item_id, 'content_item_id');
    return sortAssets(data.assets.filter((a) => a.content_item_id === id));
  },

  delete_assets(p, k, data) {
    const id = uuid(p.content_item_id, 'content_item_id');
    const n = data.assets.filter((a) => a.content_item_id === id).length;
    data.assets = data.assets.filter((a) => a.content_item_id !== id);
    return { deleted: n };
  },

  sign_upload(p) {
    const sp = storagePathOf(p.path);
    return { signedUrl: pathToFileURL(path.join(storageRoot(), sp)).href, token: 'dry-run', path: sp };
  },

  async sign_download(p) {
    const sp = storagePathOf(p.path);
    const expiresIn = int(p.expiresIn, 'expiresIn', { min: 10, max: 7 * 24 * 3600, dflt: 600 });
    const file = path.join(storageRoot(), sp);
    if (!(await fs.stat(file).catch(() => null))?.isFile()) fail(404, `sign_download: Object not found (${sp})`);
    return { signedUrl: pathToFileURL(file).href, path: sp, expiresIn };
  },

  async delete_files(p, k, data) {
    const id = uuid(p.content_item_id, 'content_item_id');
    const item = findRow(data, 'content_items', id);
    if (item && LOCKED_FOR_SESSION.includes(item.status) && k !== 'any') fail(409, `item ${id} is ${item.status}; its files are kept`);
    const prefix = `items/${id}/`;
    let paths;
    if (p.paths !== undefined) {
      if (!Array.isArray(p.paths) || p.paths.length > 500) bad('paths must be an array (max 500)');
      paths = p.paths.map(storagePathOf);
      if (paths.some((x) => !x.toLowerCase().startsWith(prefix))) bad(`every path must be under ${prefix}`);
    } else {
      const dir = path.join(storageRoot(), 'items', id);
      const entries = await fs.readdir(dir, { recursive: true, withFileTypes: true }).catch(() => []);
      paths = entries.filter((e) => e.isFile()).map((e) => path.relative(storageRoot(), path.join(e.parentPath ?? e.path, e.name)).split(path.sep).join('/'));
    }
    const deleted = [];
    for (const sp of paths) {
      try {
        await fs.unlink(path.join(storageRoot(), sp));
        deleted.push(sp);
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
    }
    return { deleted };
  },

  claim_jobs(p, kind, data) {
    const limit = int(p.limit, 'limit', { min: 1, max: 50, dflt: 5 });
    const dflt = kind === 'publisher' ? ['publish_now'] : ['run_weekly', 'regenerate'];
    const kinds = inList(p.kinds, ENUMS.jobKind, 'kinds') ?? dflt;
    if (kind === 'publisher' && kinds.some((x) => x !== 'publish_now')) fail(403, 'publisher tokens may only claim publish_now jobs');
    const claimed = data.jobs.filter((j) => j.status === 'queued' && kinds.includes(j.kind)).sort(byCreated(true)).slice(0, limit);
    for (const j of claimed) Object.assign(j, { status: 'running', started_at: nowISO(), finished_at: null, error: null });
    return claimed;
  },

  finish_job(p, k, data) {
    const id = uuid(p.id);
    const status = oneOf(p.status ?? 'done', ENUMS.jobFinish, 'status');
    const row = findRow(data, 'jobs', id) || fail(404, `job ${id} not found`);
    const error = p.error == null ? null : truncateTail(p.error, 8000);
    return Object.assign(row, status === 'queued' ? { status, started_at: null, finished_at: null, error } : { status, finished_at: nowISO(), error });
  },

  // DRY_RUN only (the live API has no insert_job: the dashboard inserts jobs under RLS).
  insert_job(p, k, data) {
    const kindV = oneOf(p.kind, ENUMS.jobKind, 'kind');
    if (p.payload !== undefined && !isObj(p.payload)) bad('payload must be an object');
    return insertRow(data, 'jobs', { kind: kindV, payload: p.payload ?? {}, status: 'queued', requested_by: p.requested_by ?? 'engine' });
  },
};

async function localCall(action, payload) {
  const kind = ['session', 'publisher', 'any'].includes(env('DRY_RUN_KIND')) ? env('DRY_RUN_KIND') : 'any';
  const handler = Object.hasOwn(localActions, action) ? localActions[action] : null;
  try {
    if (!handler) bad(`unknown action "${action}"`);
    if (kind === 'publisher' && !PUBLISHER_ACTIONS.has(action)) fail(403, `publisher tokens may not call ${action}`);
    return await withDb((data) => handler(obj(clone(payload)), kind, data));
  } catch (err) {
    if (err.httpStatus) throw new EngineError(action, err.httpStatus, err.message);
    throw err;
  }
}

// =====================================================================================================================
// Low-level entry point
// =====================================================================================================================

/** Calls one edge-function action (or its DRY_RUN mirror) and returns `data`. Throws EngineError. */
export function engineCall(action, payload = {}) {
  return isDryRun() ? localCall(action, payload) : remoteCall(action, payload);
}

// =====================================================================================================================
// Client-side filtering for listItems / listTopics (keeps the old rich filter API)
// =====================================================================================================================

const OPS = ['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'in', 'is'];
const isOpObject = (v) => isObj(v) && Object.keys(v).length > 0 && Object.keys(v).every((k) => OPS.includes(k));

function toConditions(filter = {}) {
  const conds = [];
  for (const [col, v] of Object.entries(filter || {})) {
    if (v === undefined) continue;
    if (v === null) conds.push([col, 'is', null]);
    else if (Array.isArray(v)) conds.push([col, 'in', v.map(idOf)]);
    else if (isOpObject(v)) for (const [op, val] of Object.entries(v)) conds.push([col, op, Array.isArray(val) ? val.map(idOf) : idOf(val)]);
    else conds.push([col, 'eq', idOf(v)]);
  }
  return conds;
}

const ISO_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
/** Timestamps compare as instants ("...+00:00" from Postgres vs "...Z" from JS); everything else as-is. */
const comparable = (x, val) => (typeof x === 'string' && typeof val === 'string' && ISO_TS.test(x) && ISO_TS.test(val) ? [Date.parse(x), Date.parse(val)] : [x, val]);

function matches(row, conds) {
  return conds.every(([col, op, v]) => {
    const [x, val] = ['lt', 'lte', 'gt', 'gte'].includes(op) ? comparable(row[col], v) : [row[col], v];
    switch (op) {
      case 'eq': return x === val;
      case 'neq': return x !== val;
      case 'lt': return x != null && x < val;
      case 'lte': return x != null && x <= val;
      case 'gt': return x != null && x > val;
      case 'gte': return x != null && x >= val;
      case 'in': return val.includes(x);
      case 'is': return val === null ? x == null : x === val;
      default: return false;
    }
  });
}

/**
 * Splits a rich filter into the part the server understands (`server`) and conditions to apply locally.
 * `serverKeys` maps a filter column to a function(cond) => server payload fragment or undefined.
 */
function splitFilter(filter, serverKeys) {
  const server = {};
  const rest = [];
  for (const cond of toConditions(filter)) {
    const [col, op, val] = cond;
    const frag = serverKeys[col]?.(op, val);
    if (frag && !Object.keys(frag).some((k) => k in server)) Object.assign(server, frag);
    else rest.push(cond);
  }
  return { server, rest };
}

function finishList(rows, rest, { order, ascending = false, limit } = {}) {
  let out = rest.length ? rows.filter((r) => matches(r, rest)) : rows;
  if (order) {
    out = [...out].sort((a, b) => {
      const x = a[order] ?? '';
      const y = b[order] ?? '';
      const c = x < y ? -1 : x > y ? 1 : 0;
      return ascending ? c : -c;
    });
  }
  return limit ? out.slice(0, limit) : out;
}

/** The server may cut the list only when no client-side filter or re-ordering follows. */
const serverLimit = (rest, opts, serverOrder) =>
  !rest.length && opts.limit && (!opts.order || (opts.order === serverOrder && !opts.ascending)) ? Math.min(500, opts.limit) : 500;

const eqOrIn = (name) => (op, val) => (op === 'eq' ? { [name]: val } : op === 'in' ? { [name]: val } : undefined);
const eqOrNull = (name) => (op, val) => (op === 'eq' ? { [name]: val } : op === 'is' && val === null ? { [name]: null } : undefined);

// =====================================================================================================================
// Public API (contract)
// =====================================================================================================================

/** settings.data merged over the contract defaults. */
export async function getSettings() {
  const data = (await engineCall('get_settings', {})) || {};
  const merged = { ...CONTRACT_SETTINGS };
  for (const [k, v] of Object.entries(data)) if (v !== null && v !== undefined && v !== '') merged[k] = v;
  return merged;
}

/**
 * `{settings, recent_topics, pending_jobs, revisions, since, week_start}`. settings are merged over the contract
 * defaults. Accepts `context(8)` or `context({ weeks: 8 })`.
 */
export async function context(opts = {}) {
  const weeks = typeof opts === 'number' ? opts : opts?.weeks;
  const data = await engineCall('context', weeks ? { weeks } : {});
  const merged = { ...CONTRACT_SETTINGS };
  for (const [k, v] of Object.entries(data?.settings || {})) if (v !== null && v !== undefined && v !== '') merged[k] = v;
  return { ...data, settings: merged };
}

// ---- runs ----

/** Creates a runs row with status 'running'. Returns the row. */
export function createRun(kind) {
  return engineCall('create_run', { kind });
}

/** Closes a run. The process log buffer (log.js) is saved unless `log` is given. */
export function finishRun(id, { status = 'succeeded', error, usage, log } = {}) {
  const payload = { id: idOf(id), status, log: log ?? logText() };
  if (error !== undefined && error !== null) payload.error = String(error?.message || error).slice(0, 8000);
  if (usage !== undefined && usage !== null) payload.usage = usage;
  return engineCall('finish_run', payload);
}

// ---- research briefs ----

export const insertBrief = (brief) => engineCall('insert_brief', normalizeFks(brief));
export const getBrief = (id) => engineCall('get_brief', { id: idOf(id) });

// ---- topics ----

/** Inserts topic rows; returns them in the same order. */
export async function insertTopics(topics) {
  const arr = Array.isArray(topics) ? topics : topics?.topics;
  if (!arr?.length) return [];
  return engineCall('insert_topics', { topics: arr.map(normalizeFks) });
}
export const updateTopic = (id, patch) => engineCall('update_topic', { id: idOf(id), patch: normalizeFks(patch) });
export const getTopic = (id) => engineCall('get_topic', { id: idOf(id) });

const TOPIC_SERVER_KEYS = {
  status: eqOrIn('status'),
  brief_id: (op, val) => (op === 'eq' ? { brief_id: val } : undefined),
  week_start: (op, val) => (op === 'eq' ? { week_start: val } : op === 'gte' ? { since: val } : undefined),
};

/** listTopics(filter, { order, ascending, limit }) with the rich filter syntax (see listItems). */
export async function listTopics(filter = {}, opts = {}) {
  const { server, rest } = splitFilter(filter, TOPIC_SERVER_KEYS);
  const rows = await engineCall('list_topics', { ...server, limit: serverLimit(rest, opts, 'week_start') });
  return finishList(rows, rest, opts);
}

/** Topics whose week_start is within the last `weeks` weeks (newest first). */
export const listRecentTopics = (weeks = 8) => engineCall('list_topics', { since: addDaysYmd(weekStartIST(), -7 * weeks), limit: 500 });

// ---- content items ----

export const insertItem = (item) => engineCall('insert_item', normalizeFks(item));
export const updateItem = (id, patch) => engineCall('update_item', { id: idOf(id), patch: normalizeFks(patch) });
/** Item row plus `assets` (sorted by position). */
export const getItem = (id) => engineCall('get_item', { id: idOf(id) });

const ITEM_SERVER_KEYS = { status: eqOrIn('status'), type: eqOrIn('type'), topic_id: eqOrNull('topic_id'), parent_id: eqOrNull('parent_id') };

/**
 * listItems(filter, { order, ascending, limit }).
 * Filter values: scalar => equals, array => IN, null => IS NULL, or { eq|neq|lt|lte|gt|gte|in|is: value }.
 * status / type / topic_id / parent_id are filtered by the server; anything else (e.g. scheduled_for: { lte: now })
 * is applied here. Default order: created_at descending (server order).
 */
export async function listItems(filter = {}, opts = {}) {
  const { server, rest } = splitFilter(filter, ITEM_SERVER_KEYS);
  const rows = await engineCall('list_items', { ...server, limit: serverLimit(rest, opts, 'created_at') });
  return finishList(rows, rest, opts);
}

// ---- assets ----

export const insertAsset = (asset) => engineCall('insert_asset', normalizeFks(asset));
export const listAssets = (itemId) => engineCall('list_assets', { content_item_id: idOf(itemId) });
/** Deletes the asset rows of an item (files are kept; new versions use new paths). Returns the count. */
export async function deleteAssets(itemId) {
  const res = await engineCall('delete_assets', { content_item_id: idOf(itemId) });
  return res?.deleted ?? 0;
}

// ---- storage ----

/** `{ signedUrl, token, path }` for a PUT upload (bucket `marketing`, upsert). */
export const signUpload = (storagePath) => engineCall('sign_upload', { path: storagePath });
/** `{ signedUrl, path, expiresIn }` (default 600 s). */
export const signDownload = (storagePath, expiresIn) => engineCall('sign_download', expiresIn ? { path: storagePath, expiresIn } : { path: storagePath });

// Outer retry for transfers: engine calls inside already retry on their own, so only the PUT/GET is retried here.
const outerRetry = (e) => e.retryable === true && e.name !== 'EngineError';
const toBuffer = (b) => (Buffer.isBuffer(b) ? b : b instanceof Uint8Array ? Buffer.from(b.buffer, b.byteOffset, b.byteLength) : null);

/** Uploads a Buffer to `marketing/<storagePath>` (sign_upload, then PUT to the signed URL). Returns the path. */
export async function uploadFile(storagePath, buffer, mime = 'application/octet-stream') {
  const buf = toBuffer(buffer);
  if (!buf) throw new Error(`uploadFile(${storagePath}): expected a Buffer`);
  const timeoutMs = 60_000 + Math.ceil(buf.length / (256 * 1024)) * 1000; // >= 256 KB/s
  return withRetry(`uploadFile(${storagePath})`, async () => {
    const { signedUrl, path: p } = await signUpload(storagePath); // fresh URL per attempt
    if (signedUrl.startsWith('file:')) {
      const file = fileURLToPath(signedUrl);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, buf);
      return p;
    }
    let res;
    try {
      res = await httpRequest(signedUrl, { method: 'PUT', body: buf, timeoutMs, headers: { 'content-type': mime || 'application/octet-stream', 'x-upsert': 'true', 'cache-control': 'max-age=3600' } });
    } catch (err) {
      throw Object.assign(new Error(`upload network error: ${err.message}`, { cause: err }), { retryable: true });
    }
    if (res.status < 200 || res.status >= 300) {
      const text = res.body.toString('utf8').slice(0, 300);
      const err = new Error(`upload failed: HTTP ${res.status} ${text}`);
      err.status = res.status;
      err.retryable = RETRY_STATUS_ANY.has(res.status);
      err.retryAfterMs = retryAfter(res.headers);
      if (res.status === 413) err.message += ' (file exceeds the storage upload size limit)';
      throw err;
    }
    return p;
  }, { retries: 3, shouldRetry: outerRetry });
}

/** Returns the file at `marketing/<storagePath>` as a Buffer (sign_download, then GET). */
export async function downloadFile(storagePath) {
  return withRetry(`downloadFile(${storagePath})`, async () => {
    const { signedUrl } = await signDownload(storagePath, 900);
    if (signedUrl.startsWith('file:')) {
      try {
        return await fs.readFile(fileURLToPath(signedUrl));
      } catch (err) {
        throw new Error(`downloadFile: ${storagePath} not found in ${storageRoot()} (${err.code || err.message})`);
      }
    }
    let res;
    try {
      res = await httpRequest(signedUrl, { timeoutMs: 300_000 });
    } catch (err) {
      throw Object.assign(new Error(`download network error: ${err.message}`, { cause: err }), { retryable: true });
    }
    if (res.status !== 200) {
      const err = new Error(`download failed: HTTP ${res.status} ${res.body.toString('utf8').slice(0, 300)}`);
      err.status = res.status;
      err.retryable = RETRY_STATUS_ANY.has(res.status);
      throw err;
    }
    return res.body;
  }, { retries: 3, shouldRetry: outerRetry });
}

/**
 * Deletes stored files of an item (all under items/<id>/, or just `paths`). Refused (409) while the item is approved
 * or published. Returns the deleted paths.
 */
export async function deleteFiles(itemId, paths) {
  const res = await engineCall('delete_files', paths ? { content_item_id: idOf(itemId), paths } : { content_item_id: idOf(itemId) });
  return res?.deleted ?? [];
}

// ---- jobs ----

/**
 * Atomically moves up to `limit` queued jobs to running and returns them (oldest first).
 * claimJobs(5) / claimJobs(5, ['regenerate']) / claimJobs({ limit, kinds }).
 * Default kinds: session => run_weekly + regenerate; publisher => publish_now.
 */
export function claimJobs(limit = 5, kinds) {
  const o = isObj(limit) ? limit : { limit, kinds };
  const payload = { limit: Math.max(1, Number(o.limit) || 5) };
  if (o.kinds?.length) payload.kinds = o.kinds;
  return engineCall('claim_jobs', payload);
}

export function finishJob(id, { status = 'done', error } = {}) {
  const payload = { id: idOf(id), status };
  if (error !== undefined && error !== null) payload.error = String(error?.message || error).slice(0, 8000);
  return engineCall('finish_job', payload);
}

/** Queues a job. DRY_RUN only (live jobs come from the dashboard, or via SQL with the Supabase connector). */
export function insertJob(kind, payload = {}, requestedBy = 'engine') {
  if (!isDryRun()) {
    return Promise.reject(new EngineError('insert_job', 0, 'not available on the live API; the dashboard queues jobs (or insert via the Supabase connector)'));
  }
  return engineCall('insert_job', { kind, payload, requested_by: requestedBy });
}

// ---- helpers ----

/** Foreign keys passed as row objects ({ topic_id: topicRow }) become ids; undefined keys are dropped. */
function normalizeFks(row = {}) {
  const out = {};
  for (const [k, v] of Object.entries(row || {})) {
    if (v === undefined) continue;
    out[k] = k.endsWith('_id') && isObj(v) && 'id' in v ? v.id : v;
  }
  return out;
}
