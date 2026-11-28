// Data access. One API, two backends:
//   - Supabase (service role) in production
//   - DRY_RUN: out/db.json + files under out/storage/
// Rows are returned as plain objects. Insert/update functions return the stored row.
// Any argument that expects an id also accepts a row object ({ id }).
//
// listItems(filter) filter values: scalar => equals, array => IN, null => IS NULL,
// or an operator object { eq|neq|lt|lte|gt|gte|in|is: value }.
// Options: listItems(filter, { order: 'created_at', ascending: false, limit }).
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { config, isDryRun, DEFAULT_SETTINGS, requireEnv } from './config.js';
import { getLogText } from './log.js';
import { retry, isTransientError, weekStart, addDays, todayIST, ensureDir, writeFileEnsured } from './util.js';

const nowISO = () => new Date().toISOString();
const idOf = (x) => (x && typeof x === 'object' ? x.id : x);

/** Normalises foreign keys passed as row objects ({run_id: run} -> run.id). */
function normalizeRow(obj = {}) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    out[k] = k.endsWith('_id') && v && typeof v === 'object' && !Array.isArray(v) && 'id' in v ? v.id : v;
  }
  return out;
}

function mergeSettings(data) {
  const merged = { ...DEFAULT_SETTINGS };
  for (const [k, v] of Object.entries(data || {})) if (v !== null && v !== undefined && v !== '') merged[k] = v;
  return merged;
}

function storagePathSafe(p) {
  const clean = String(p || '').replace(/^\/+/, '');
  if (!clean || clean.split('/').some((s) => s === '..' || s === '')) throw new Error(`Invalid storage path: "${p}"`);
  return clean;
}

// =====================================================================
// Filtering (shared semantics for both backends)
// =====================================================================

const OPS = ['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'in', 'is'];
const isOpObject = (v) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0 && Object.keys(v).every((k) => OPS.includes(k));

function toConditions(filter = {}) {
  const conds = [];
  for (const [col, v] of Object.entries(filter || {})) {
    if (v === undefined) continue;
    if (v === null) conds.push([col, 'is', null]);
    else if (Array.isArray(v)) conds.push([col, 'in', v]);
    else if (isOpObject(v)) for (const [op, val] of Object.entries(v)) conds.push([col, op, idOf(val)]);
    else conds.push([col, 'eq', idOf(v)]);
  }
  return conds;
}

function matchLocal(row, conds) {
  return conds.every(([col, op, val]) => {
    const x = row[col];
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

function sortLocal(rows, order, ascending) {
  if (!order) return rows;
  return rows.sort((a, b) => {
    const x = a[order] ?? '';
    const y = b[order] ?? '';
    const c = x < y ? -1 : x > y ? 1 : 0;
    return ascending ? c : -c;
  });
}

// =====================================================================
// DRY_RUN backend: JSON file
// =====================================================================

const TABLES = ['settings', 'runs', 'research_briefs', 'topics', 'content_items', 'assets', 'jobs'];
const dbFile = () => path.join(config.outDir, 'db.json');
const storageRoot = () => path.join(config.outDir, 'storage');
let localCache = null;
let writeChain = Promise.resolve();

async function loadLocal() {
  if (localCache) return localCache;
  let db = {};
  try {
    db = JSON.parse(await fs.readFile(dbFile(), 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw new Error(`Cannot read ${dbFile()}: ${err.message}`);
  }
  for (const t of TABLES) if (!Array.isArray(db[t])) db[t] = [];
  localCache = db;
  return db;
}

/** Serialises mutations and writes the file atomically (tmp + rename). */
function mutateLocal(fn) {
  const run = writeChain.then(async () => {
    const db = await loadLocal();
    const result = await fn(db);
    await ensureDir(config.outDir);
    const tmp = `${dbFile()}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(db, null, 2));
    await fs.rename(tmp, dbFile());
    return structuredClone(result);
  });
  writeChain = run.catch(() => {});
  return run;
}

const local = {
  async getSettings() {
    const db = await loadLocal();
    return mergeSettings(db.settings.find((r) => r.id === 1)?.data);
  },
  insert(table, rows, defaults = {}) {
    return mutateLocal((db) =>
      rows.map((r) => {
        const row = { id: randomUUID(), created_at: nowISO(), ...defaults, ...normalizeRow(r) };
        db[table].push(row);
        return row;
      }),
    );
  },
  update(table, id, patch) {
    return mutateLocal((db) => {
      const row = db[table].find((r) => r.id === id);
      if (!row) throw new Error(`${table} ${id} not found`);
      Object.assign(row, normalizeRow(patch));
      return row;
    });
  },
  async get(table, id) {
    const db = await loadLocal();
    const row = db[table].find((r) => r.id === id);
    return row ? structuredClone(row) : null;
  },
  async list(table, filter, { order = 'created_at', ascending = false, limit } = {}) {
    const db = await loadLocal();
    const conds = toConditions(filter);
    const rows = sortLocal(db[table].filter((r) => matchLocal(r, conds)).map((r) => structuredClone(r)), order, ascending);
    return limit ? rows.slice(0, limit) : rows;
  },
  remove(table, filter) {
    return mutateLocal((db) => {
      const conds = toConditions(filter);
      const removed = db[table].filter((r) => matchLocal(r, conds));
      db[table] = db[table].filter((r) => !matchLocal(r, conds));
      return removed.length;
    });
  },
  claimJobs(limit) {
    return mutateLocal((db) => {
      const queued = db.jobs.filter((j) => j.status === 'queued').sort((a, b) => (a.created_at < b.created_at ? -1 : 1)).slice(0, limit);
      for (const j of queued) Object.assign(j, { status: 'running', started_at: nowISO() });
      return queued;
    });
  },
  async upload(p, buffer) {
    await writeFileEnsured(path.join(storageRoot(), p), buffer);
    return p;
  },
  async download(p) {
    try {
      return await fs.readFile(path.join(storageRoot(), p));
    } catch (err) {
      throw new Error(`downloadFile: ${p} not found in ${storageRoot()} (${err.code || err.message})`);
    }
  },
};

// =====================================================================
// Supabase backend
// =====================================================================

let sb = null;
function supabase() {
  if (!sb) {
    sb = createClient(config.supabaseUrl || requireEnv('SUPABASE_URL'), config.supabaseServiceRoleKey || requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { 'x-client-info': 'dhiti-marketing-engine' } },
    });
  }
  return sb;
}

class StoreError extends Error {
  constructor(label, error) {
    super(`store.${label}: ${error?.message || error}${error?.details ? ` (${error.details})` : ''}${error?.hint ? ` Hint: ${error.hint}` : ''}`);
    this.name = 'StoreError';
    this.code = error?.code;
    const status = Number(error?.status ?? error?.statusCode);
    this.status = Number.isFinite(status) ? status : undefined;
    // PostgREST errors carry a SQLSTATE code: those are not transient.
    this.retryable = error?.code && /^[0-9A-Z]{5}$/.test(error.code) ? false : isTransientError(error) || (this.status ? this.status >= 500 : /fetch failed|network|timeout/i.test(error?.message || ''));
  }
}

/** Runs a supabase-js query builder factory with retries; returns data. */
function q(label, build) {
  return retry(
    async () => {
      let res;
      try {
        res = await build(supabase());
      } catch (err) {
        throw new StoreError(label, err);
      }
      if (res.error) throw new StoreError(label, res.error);
      return res.data;
    },
    { retries: 3, baseMs: 800, label: `store.${label}`, shouldRetry: (e) => e.retryable === true },
  );
}

function applyConds(query, conds) {
  for (const [col, op, val] of conds) query = op === 'in' ? query.in(col, val) : query[op](col, val);
  return query;
}

const remote = {
  async getSettings() {
    const data = await q('getSettings', (c) => c.from('settings').select('data').eq('id', 1).maybeSingle());
    return mergeSettings(data?.data);
  },
  insert(table, rows, defaults = {}) {
    return q(`insert(${table})`, (c) => c.from(table).insert(rows.map((r) => ({ ...defaults, ...normalizeRow(r) })), { defaultToNull: false }).select());
  },
  async update(table, id, patch) {
    const data = await q(`update(${table})`, (c) => c.from(table).update(normalizeRow(patch)).eq('id', id).select().maybeSingle());
    if (!data) throw new Error(`store.update(${table}): row ${id} not found`);
    return data;
  },
  get(table, id) {
    return q(`get(${table})`, (c) => c.from(table).select('*').eq('id', id).maybeSingle());
  },
  list(table, filter, { order = 'created_at', ascending = false, limit } = {}) {
    return q(`list(${table})`, (c) => {
      let query = applyConds(c.from(table).select('*'), toConditions(filter));
      if (order) query = query.order(order, { ascending, nullsFirst: false });
      return limit ? query.limit(limit) : query;
    });
  },
  async remove(table, filter) {
    const data = await q(`delete(${table})`, (c) => applyConds(c.from(table).delete(), toConditions(filter)).select('id'));
    return data?.length ?? 0;
  },
  async claimJobs(limit) {
    const candidates = await q('claimJobs.select', (c) => c.from('jobs').select('id').eq('status', 'queued').order('created_at', { ascending: true }).limit(limit));
    if (!candidates?.length) return [];
    // Conditional update: only rows still 'queued' flip to 'running', so two
    // concurrent workers can never both claim the same job.
    const claimed = await q('claimJobs.update', (c) =>
      c.from('jobs').update({ status: 'running', started_at: nowISO() }).in('id', candidates.map((r) => r.id)).eq('status', 'queued').select(),
    );
    return (claimed || []).sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  },
  async upload(p, buffer, mime) {
    await q('uploadFile', (c) => c.storage.from(config.storageBucket).upload(p, buffer, { contentType: mime || 'application/octet-stream', upsert: true, cacheControl: '3600' }));
    return p;
  },
  async download(p) {
    const blob = await q('downloadFile', (c) => c.storage.from(config.storageBucket).download(p));
    return Buffer.from(await blob.arrayBuffer());
  },
};

const db = () => (isDryRun ? local : remote);
const one = async (p) => (await p)[0];

// =====================================================================
// Public API (contract)
// =====================================================================

/** settings row merged over DEFAULT_SETTINGS. */
export const getSettings = () => db().getSettings();

/** Creates a runs row with status 'running'. Returns the row ({ id, ... }). */
export function createRun(kind) {
  if (!['weekly', 'jobs', 'publish', 'manual'].includes(kind)) throw new Error(`createRun: invalid kind "${kind}"`);
  return one(db().insert('runs', [{ kind, status: 'running', started_at: nowISO() }]));
}

/** Closes a run. The process log buffer is saved into runs.log unless `log` is given. */
export function finishRun(id, { status = 'succeeded', error = null, usage = null, log } = {}) {
  return db().update('runs', idOf(id), {
    status,
    error: error ? String(error.message || error).slice(0, 8000) : null,
    usage,
    log: log ?? getLogText(),
    finished_at: nowISO(),
  });
}

export const insertBrief = (obj) => one(db().insert('research_briefs', [obj], { week_start: weekStart() }));
export const getBrief = (id) => db().get('research_briefs', idOf(id));

/** Inserts topic rows; returns them in the same order. */
export async function insertTopics(arr) {
  if (!arr?.length) return [];
  return db().insert('topics', arr, { status: 'planned', week_start: weekStart() });
}

export const updateTopic = (id, patch) => db().update('topics', idOf(id), patch);
export const getTopic = (id) => db().get('topics', idOf(id));
export const listTopics = (filter = {}, opts) => db().list('topics', filter, opts);

/** Topics whose week_start is within the last `weeks` weeks (newest first). */
export function listRecentTopics(weeks = 8) {
  return db().list('topics', { week_start: { gte: addDays(weekStart(todayIST()), -7 * weeks) } }, { order: 'week_start', ascending: false });
}

export const insertItem = (obj) => one(db().insert('content_items', [obj], { status: 'generating', version: 1, updated_at: nowISO() }));
export const updateItem = (id, patch) => db().update('content_items', idOf(id), { ...patch, updated_at: nowISO() });
export const getItem = (id) => db().get('content_items', idOf(id));
export const listItems = (filter = {}, opts) => db().list('content_items', filter, opts);

export const insertAsset = (obj) => one(db().insert('assets', [obj], { position: 0, meta: {} }));
export const listAssets = (itemId) => db().list('assets', { content_item_id: idOf(itemId) }, { order: 'position', ascending: true });
/** Deletes asset rows of an item (storage files are kept; new versions use new paths). Returns count. */
export const deleteAssets = (itemId) => db().remove('assets', { content_item_id: idOf(itemId) });

/** Uploads to bucket `marketing` (upsert). Returns the storage path. */
export function uploadFile(storagePath, buffer, mime) {
  if (!Buffer.isBuffer(buffer) && !(buffer instanceof Uint8Array)) throw new Error(`uploadFile(${storagePath}): expected a Buffer`);
  return db().upload(storagePathSafe(storagePath), buffer, mime);
}

/** Returns the file at storagePath as a Buffer. */
export const downloadFile = (storagePath) => db().download(storagePathSafe(storagePath));

/** Atomically moves up to `limit` queued jobs to running and returns them (oldest first). */
export const claimJobs = (limit = 5) => db().claimJobs(Math.max(1, limit));

export function finishJob(id, { status = 'done', error = null } = {}) {
  return db().update('jobs', idOf(id), { status, error: error ? String(error.message || error).slice(0, 8000) : null, finished_at: nowISO() });
}

/** Queues a job (used by CLI/dev tooling; the dashboard inserts jobs directly). */
export const insertJob = (kind, payload = {}, requestedBy = 'engine') =>
  one(db().insert('jobs', [{ kind, payload, status: 'queued', requested_by: requestedBy }]));
