#!/usr/bin/env node
// Dhiti marketing engine CLI (ARCHITECTURE.md "Engine CLI"). Called by the scheduled Claude Code session (which does
// the research, planning and writing itself) and by the GitHub Actions publisher. No AI API is ever called here, and
// every image/video is a licensed Magnific stock file that the session downloaded with `fetch`.
//
// Every command prints ONE JSON value to stdout; logs go to stderr. Exit codes: 0 ok, 1 error, 2 check failed
// (check-blog only; JSON is still printed). Errors print {"ok":false,"error":"..."}.
//
// Env: ENGINE_TOKEN (unless DRY_RUN), ENGINE_URL, DRY_RUN=1, CHROMIUM_PATH, REPO_ROOT, GIT_PUSH=0, OUT_DIR.
// Run `node src/cli.js help` for the command list.
import fs from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import matter from 'gray-matter';
import { config, requireEnv, BLOG_CATEGORIES } from './config.js';
import { log } from './log.js';
import { retry, istToUTC, todayIST, addDays, nextPublishDates, mimeFromPath, extFromMime, errorMessage } from './util.js';
import * as store from './store.js';
import { checkBlogText, checkBlogFile } from './blogcheck.js';
import { getBrandContext } from './brand.js';

const HELP = `Dhiti marketing engine

  context                                   settings, brand, recent topics, pending jobs, revisions
  fetch <url|library/<uuid>/<file>> --out <file>   download a stock file now (Magnific URLs expire in minutes)
  run start --kind weekly|jobs|publish|manual
  run finish --id <id> --status succeeded|failed [--log <file>] [--error <msg>] [--usage <json|file>]
  save-brief <brief.json> [--run <runId>]   insert research brief -> {id}
  save-topics <topics.json>                 insert topics -> [{id,title,planned_publish_date}]
  check-blog <draft.md> [--slug <slug>]     site rules for one post -> {passed,messages,words,sections}
  save-blog --topic <id> --md <draft.md> --cover <photo> --stock <stock.json> [--item <id>] [--focus x,y]
  make-carousel --parent <blogId> --spec <carousel.json> [--item <id>]
  make-graphic  --parent <blogId> --spec <graphic.json>  [--item <id>]
  make-video    --parent <blogId> --spec <video.json>    [--item <id>] [--voiceover <file>] [--voiceover-asset <id>]
  make-video    --item <id> --voiceover <file> [--voiceover-asset <id>]   re-render from stored sources
  preview carousel|graphic|video --spec <file> --out <dir> [--voiceover <file>]
  preview cover --cover <photo> --out <dir> [--focus x,y]
  topic --id <id> --status planned|producing|ready|skipped|failed [--error <msg>]
  job claim [--kinds regenerate,run_weekly] [--limit 5]
  job finish --id <id> --status done|failed|queued [--error <msg>]
  item --id <id>                            item + assets
  publish [--dry-list]                      publish approved blogs that are due (or have a publish_now job)
`;

// =====================================================================================================================
// Args
// =====================================================================================================================

const BOOL_FLAGS = new Set(['dry-list', 'help', 'keep-work', 'force-new']);

/** Minimal parser: positionals, --key value, --key=value, boolean --flags. Repeated keys become arrays. */
export function parseArgs(argv) {
  const pos = [];
  const opts = {};
  const set = (k, v) => {
    if (k in opts) opts[k] = [].concat(opts[k], v);
    else opts[k] = v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') {
      pos.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith('--') && a.length > 2) {
      const eq = a.indexOf('=');
      if (eq > 0) {
        set(a.slice(2, eq), a.slice(eq + 1));
        continue;
      }
      const key = a.slice(2);
      const next = argv[i + 1];
      if (BOOL_FLAGS.has(key) || next === undefined || (next.startsWith('--') && next.length > 2)) set(key, true);
      else {
        set(key, next);
        i += 1;
      }
    } else pos.push(a);
  }
  return { pos, opts };
}

class UsageError extends Error {}
const need = (opts, key, hint = '') => {
  const v = opts[key];
  if (v === undefined || v === true || v === '') throw new UsageError(`missing --${key}${hint ? ` (${hint})` : ''}`);
  if (Array.isArray(v)) throw new UsageError(`--${key} given more than once`);
  return String(v);
};
const optStr = (opts, key) => (opts[key] === undefined || opts[key] === true ? undefined : String([].concat(opts[key]).pop()));

// =====================================================================================================================
// Small helpers
// =====================================================================================================================

async function readJsonFile(file, label = 'JSON') {
  const full = path.resolve(file);
  let text;
  try {
    text = await fs.readFile(full, 'utf8');
  } catch (err) {
    throw new UsageError(`cannot read ${label} file ${full}: ${err.code || err.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new UsageError(`${full} is not valid JSON: ${err.message}`);
  }
}

/** JSON value given inline or as a file path. */
async function jsonArg(v, label) {
  if (v === undefined) return undefined;
  const s = String(v).trim();
  if (s.startsWith('{') || s.startsWith('[')) return JSON.parse(s);
  return readJsonFile(s, label);
}

const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
function needUuid(opts, key) {
  const v = need(opts, key);
  if (!isUuid(v)) throw new UsageError(`--${key} must be a uuid (got "${v}")`);
  return v.toLowerCase();
}

function ensureAuth() {
  if (!config.isDryRun) requireEnv('ENGINE_TOKEN');
}

/** Safe storage file name: [A-Za-z0-9._-], keeps the extension. */
function safeName(name, fallback = 'file') {
  const ext = path.extname(name).toLowerCase().replace(/[^a-z0-9.]/g, '');
  const base = path.basename(name, path.extname(name)).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || fallback;
  return `${base}${ext}`;
}

const workRoot = async () => {
  const dir = path.join(config.outDir, 'work');
  await fs.mkdir(dir, { recursive: true });
  return dir;
};

// ---------------------------------------------------------------------------------------------
// Stock licence metadata
// ---------------------------------------------------------------------------------------------

/**
 * Normalises stock metadata to [{provider, id, title, url_preview, url?, author?, license?, type?}].
 * Accepts an object, an array, or {stock:[...]}. Refuses anything marked AI-generated (hard constraint).
 */
export function normalizeStock(input, label = 'stock') {
  if (input === undefined || input === null || input === '') return [];
  let arr = Array.isArray(input) ? input : Array.isArray(input?.stock) ? input.stock : [input];
  arr = arr.filter((x) => x !== null && x !== undefined);
  return arr.map((s, i) => {
    if (typeof s !== 'object') throw new UsageError(`${label}[${i}] must be an object like {"id":"...","title":"...","url_preview":"..."}`);
    const id = s.id ?? s.resource_id ?? s.stock_id ?? s.library_asset_id; // owner library: {provider:'library', library_asset_id}
    if (id === undefined || id === null || String(id).trim() === '') throw new UsageError(`${label}[${i}]: id is required (the Magnific stock id, or library_asset_id for owner media)`);
    const ai = s.ai_generated ?? s.is_ai_generated ?? s.aiGenerated;
    if (ai === true || /^(true|yes|1|only|included)$/i.test(String(ai ?? '')) || /ai[-_ ]?generated/i.test(String(s.type ?? ''))) {
      throw new UsageError(`${label}[${i}] (${id}) is AI-generated; only real licensed stock is allowed (search with ai_generated: "excluded")`);
    }
    const out = {
      provider: String(s.provider || 'magnific').toLowerCase(),
      id: String(id).trim(),
      title: String(s.title ?? s.name ?? '').trim(),
      url_preview: String(s.url_preview ?? s.preview ?? s.preview_url ?? s.thumbnail ?? s.thumbnail_url ?? '').trim(),
    };
    for (const k of ['url', 'author', 'license', 'type', 'width', 'height', 'duration', 'library_asset_id', 'credit_cost']) if (s[k] !== undefined && s[k] !== null && s[k] !== '') out[k] = s[k];
    return out;
  });
}

const stockKey = (s) => `${s.provider}:${s.id}`;
const uniqStock = (list) => {
  const seen = new Set();
  return list.filter((s) => (seen.has(stockKey(s)) ? false : (seen.add(stockKey(s)), true)));
};

// ---------------------------------------------------------------------------------------------
// Items: create or start a new version
// ---------------------------------------------------------------------------------------------

/**
 * Returns { item, version, isNew }. With itemId: loads it, checks type, bumps version. Otherwise inserts a new
 * item with status 'generating'.
 */
async function openItem({ itemId, type, topicId, parentId, title }) {
  if (itemId) {
    const item = await store.getItem(itemId);
    if (!item) throw new Error(`item ${itemId} not found`);
    if (item.type !== type) throw new UsageError(`item ${itemId} is a ${item.type}, not a ${type}`);
    if (['approved', 'published'].includes(item.status)) throw new UsageError(`item ${itemId} is ${item.status}; it can no longer be revised`);
    return { item, version: (Number(item.version) || 1) + 1, isNew: false };
  }
  const item = await store.insertItem({ type, topic_id: topicId ?? null, parent_id: parentId ?? null, title: title || '', status: 'generating', body: {}, version: 1 });
  return { item, version: 1, isNew: true };
}

/** Marks a half-made item failed (new items) or records the error (revisions keep their previous content). */
async function failItem(ctx, err) {
  if (!ctx?.item) return;
  try {
    if (ctx.isNew) await store.updateItem(ctx.item.id, { status: 'failed', error: errorMessage(err) });
    else await store.updateItem(ctx.item.id, { error: `revision v${ctx.version} failed: ${errorMessage(err)}` });
  } catch (e) {
    log.warn(`could not record the failure on item ${ctx.item.id}: ${e.message}`);
  }
}

/** Uploads buffers and replaces the item's asset rows. files: [{name, buffer, mime, kind, width, height, position, meta}] */
async function replaceAssets(itemId, version, files) {
  const uploaded = [];
  for (const f of files) {
    const storagePath = `items/${itemId}/v${version}/${f.name}`;
    await store.uploadFile(storagePath, f.buffer, f.mime);
    uploaded.push({ ...f, storagePath });
    log(`uploaded ${storagePath} (${(f.buffer.length / 1e6).toFixed(2)} MB)`);
  }
  await store.deleteAssets(itemId);
  const rows = [];
  for (const f of uploaded) {
    rows.push(
      await store.insertAsset({
        content_item_id: itemId,
        kind: f.kind,
        storage_path: f.storagePath,
        mime: f.mime,
        width: f.width ?? null,
        height: f.height ?? null,
        position: f.position ?? 0,
        meta: f.meta ?? {},
      }),
    );
  }
  return rows;
}

const assetSummary = (rows) => rows.map((a) => ({ id: a.id, kind: a.kind, path: a.storage_path, position: a.position, width: a.width, height: a.height }));

// ---------------------------------------------------------------------------------------------
// Source media (stock files used by creatives) -> items/<id>/src/ so they can be re-rendered later
// ---------------------------------------------------------------------------------------------

const MAX_UPLOAD = 45 * 1024 * 1024; // stay under Supabase's default 50 MB object limit

/** Photo for storage: <= 2560 px long edge JPEG (renders never need more for 1080-wide output). */
async function storablePhoto(file) {
  const buf = await sharp(file, { failOn: 'none', limitInputPixels: false })
    .rotate()
    .resize({ width: 2560, height: 2560, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: '4:4:4' })
    .toBuffer();
  return { buffer: buf, mime: 'image/jpeg', ext: '.jpg' };
}

/** Clip for storage: as-is when small, else re-encoded to <= 1920 px H.264 (no audio). */
async function storableClip(file) {
  const size = statSync(file).size;
  if (size <= MAX_UPLOAD) return { buffer: await fs.readFile(file), mime: mimeFromPath(file) === 'application/octet-stream' ? 'video/mp4' : mimeFromPath(file), ext: path.extname(file).toLowerCase() || '.mp4' };
  const { runFfmpeg } = await import('./render/video.js');
  const out = path.join(await workRoot(), `src-${process.pid}-${Date.now()}.mp4`);
  try {
    for (const crf of [21, 25, 29]) {
      await runFfmpeg(['-y', '-loglevel', 'error', '-i', file, '-an', '-vf', "scale='if(gt(iw,ih),min(1920,iw),-2)':'if(gt(iw,ih),-2,min(1920,ih))':flags=lanczos", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { label: 'source clip re-encode' });
      const buf = await fs.readFile(out);
      if (buf.length <= MAX_UPLOAD) return { buffer: buf, mime: 'video/mp4', ext: '.mp4' };
    }
    throw new Error(`clip ${file} is still larger than ${MAX_UPLOAD / 1e6} MB after re-encoding; trim it first`);
  } finally {
    await fs.rm(out, { force: true }).catch(() => {});
  }
}

async function uploadSource(itemId, name, file, kind) {
  const prepared = kind === 'clip' ? await storableClip(file) : await storablePhoto(file);
  const storagePath = `items/${itemId}/src/${safeName(name)}${prepared.ext}`;
  await store.uploadFile(storagePath, prepared.buffer, prepared.mime);
  log(`stored source ${storagePath} (${(prepared.buffer.length / 1e6).toFixed(2)} MB)`);
  return storagePath;
}

/** Downloads a stored source to the work dir; returns the local path. */
async function downloadSource(storagePath, dir) {
  const local = path.join(dir, path.basename(storagePath));
  if (!existsSync(local)) await fs.writeFile(local, await store.downloadFile(storagePath));
  return local;
}

/** Resolves a spec's local file reference relative to the spec file. Throws if missing. */
function resolveLocal(ref, specDir, label) {
  if (ref === undefined || ref === null || ref === '') return null;
  if (typeof ref !== 'string') throw new UsageError(`${label} must be a file path string`);
  const p = path.resolve(specDir, ref.startsWith('file://') ? fileURLToPath(ref) : ref);
  if (!existsSync(p)) throw new UsageError(`${label}: file not found: ${p}`);
  return p;
}

// =====================================================================================================================
// Commands
// =====================================================================================================================

async function cmdContext() {
  ensureAuth();
  const [ctx, brand] = await Promise.all([store.context({ weeks: 8 }), getBrandContext()]);
  const { logoDataUri, markDataUri, ...brandOut } = brand;
  const settings = ctx.settings || {};
  const from = addDays(todayIST(), 1);
  return {
    today_ist: todayIST(),
    week_start: ctx.week_start ?? store.weekStartIST?.(),
    settings,
    suggested_publish_dates: nextPublishDates(Number(settings.blogs_per_week) || 3, settings.publish_days, from),
    brand: { ...brandOut, logo: 'src/assets/logos/dhiti-logo.webp', mark: 'src/assets/logos/dhiti-mark.webp' },
    recent_topics: ctx.recent_topics ?? [],
    pending_jobs: ctx.pending_jobs ?? [],
    revisions: ctx.revisions ?? [],
    backend: store.backendName?.() ?? (config.isDryRun ? 'dry-run' : 'edge'),
  };
}

async function cmdFetch({ pos, opts }) {
  const url = pos[0] || optStr(opts, 'url');
  if (!url) throw new UsageError('usage: fetch <url> --out <file>');
  let out = path.resolve(need(opts, 'out'));
  await fs.mkdir(path.dirname(out), { recursive: true });

  let buffer;
  let mime;
  if (/^(library|items)\/[0-9a-f-]{36}\//i.test(url) && !existsSync(url)) {
    // Owner library media (or a stored item file) from the marketing bucket.
    ensureAuth();
    buffer = await store.downloadFile(url);
    mime = mimeFromPath(url);
  } else if (/^file:\/\//.test(url) || (!/^[a-z]+:\/\//i.test(url) && existsSync(url))) {
    const src = url.startsWith('file://') ? fileURLToPath(url) : path.resolve(url);
    buffer = await fs.readFile(src);
    mime = mimeFromPath(src);
  } else {
    if (!/^https?:\/\//i.test(url)) throw new UsageError(`fetch: unsupported URL ${url}`);
    const res = await retry(
      async () => {
        let r;
        try {
          r = await store.httpRequest(url, { method: 'GET', timeoutMs: 600_000, maxRedirects: 8, headers: { 'user-agent': 'dhiti-engine/1.0', accept: '*/*' } });
        } catch (err) {
          throw Object.assign(new Error(`network error: ${err.message}`), { retryable: true });
        }
        if (r.status !== 200) {
          const text = r.body.toString('utf8').slice(0, 300);
          const hint = r.status === 403 || r.status === 410 || /expired|signature/i.test(text) ? ' (download links expire after ~5-15 minutes: call stock_download again and fetch immediately)' : '';
          throw Object.assign(new Error(`HTTP ${r.status}${hint}: ${text}`), { status: r.status, retryable: r.status === 429 || r.status >= 500 });
        }
        return r;
      },
      { retries: 4, baseMs: 1500, label: 'fetch', shouldRetry: (e) => e.retryable === true },
    );
    buffer = res.body;
    const h = res.headers?.['content-type'] ?? res.headers?.get?.('content-type') ?? '';
    mime = String(Array.isArray(h) ? h[0] : h).split(';')[0].trim().toLowerCase() || 'application/octet-stream';
  }
  if (!buffer?.length) throw new Error('fetch: empty response');
  const head = buffer.subarray(0, 64).toString('utf8').trimStart().toLowerCase();
  if (/^(<!doctype|<html|<\?xml|<error|\{"error|\{"message)/.test(head) || /^text\/html|application\/(xml|json)/.test(mime)) {
    throw new Error(`fetch: got ${mime || 'text'} instead of a media file (expired or invalid link?): ${buffer.subarray(0, 200).toString('utf8')}`);
  }
  // Sniff the real type (CDNs often say octet-stream).
  if (mime === 'application/octet-stream' || !mime) {
    const sig = buffer.subarray(0, 12);
    if (sig[0] === 0xff && sig[1] === 0xd8) mime = 'image/jpeg';
    else if (sig.subarray(0, 4).toString('hex') === '89504e47') mime = 'image/png';
    else if (sig.subarray(0, 4).toString() === 'RIFF' && sig.subarray(8, 12).toString() === 'WEBP') mime = 'image/webp';
    else if (sig.subarray(4, 8).toString() === 'ftyp') mime = 'video/mp4';
    else mime = mimeFromPath(out);
  }
  if (!path.extname(out)) out += extFromMime(mime);
  const tmp = `${out}.part-${process.pid}`;
  await fs.writeFile(tmp, buffer);
  await fs.rename(tmp, out);
  const result = { path: out, bytes: buffer.length, mime };
  if (mime.startsWith('image/')) {
    try {
      const m = await sharp(buffer, { failOn: 'none', limitInputPixels: false }).metadata();
      Object.assign(result, { width: m.width, height: m.height });
    } catch {
      /* not decodable by sharp */
    }
  }
  log(`fetched ${result.bytes} bytes -> ${out}`);
  return result;
}

async function cmdRun({ pos, opts }) {
  ensureAuth();
  const sub = pos[0];
  if (sub === 'start') {
    const kind = optStr(opts, 'kind') || 'weekly';
    const row = await store.createRun(kind);
    return { id: row.id, kind: row.kind, status: row.status, started_at: row.started_at };
  }
  if (sub === 'finish') {
    const id = needUuid(opts, 'id');
    const status = optStr(opts, 'status') || 'succeeded';
    const logFile = optStr(opts, 'log');
    const logText = logFile ? await fs.readFile(path.resolve(logFile), 'utf8') : undefined;
    const usage = await jsonArg(optStr(opts, 'usage'), 'usage');
    const row = await store.finishRun(id, { status, error: optStr(opts, 'error'), usage, log: logText ?? '' });
    return { id: row.id, status: row.status, finished_at: row.finished_at };
  }
  throw new UsageError('usage: run start --kind weekly | run finish --id <id> --status succeeded [--log file]');
}

async function cmdSaveBrief({ pos, opts }) {
  ensureAuth();
  const file = pos[0] || optStr(opts, 'brief');
  if (!file) throw new UsageError('usage: save-brief <brief.json>');
  const brief = await readJsonFile(file, 'brief');
  if (!brief || typeof brief !== 'object' || Array.isArray(brief)) throw new UsageError('brief must be a JSON object');
  if (optStr(opts, 'run')) brief.run_id = optStr(opts, 'run');
  const row = await store.insertBrief(brief);
  return { id: row.id, week_start: row.week_start };
}

async function cmdSaveTopics({ pos, opts }) {
  ensureAuth();
  const file = pos[0] || optStr(opts, 'topics');
  if (!file) throw new UsageError('usage: save-topics <topics.json>');
  const json = await readJsonFile(file, 'topics');
  const topics = Array.isArray(json) ? json : json?.topics;
  if (!Array.isArray(topics) || !topics.length) throw new UsageError('topics file must be a non-empty array (or {topics:[...]})');
  topics.forEach((t, i) => {
    if (!t?.title) throw new UsageError(`topics[${i}]: title is required`);
    if (t.category && !BLOG_CATEGORIES.includes(t.category)) throw new UsageError(`topics[${i}]: category "${t.category}" is not one of ${BLOG_CATEGORIES.join(', ')}`);
    if (t.planned_publish_date && !/^\d{4}-\d{2}-\d{2}$/.test(t.planned_publish_date)) throw new UsageError(`topics[${i}]: planned_publish_date must be YYYY-MM-DD`);
    if (!t.planned_publish_date) log.warn(`topics[${i}] "${t.title}" has no planned_publish_date; its blog will publish as soon as it is approved`);
  });
  const rows = await store.insertTopics(topics);
  return rows.map((r) => ({ id: r.id, title: r.title, planned_publish_date: r.planned_publish_date ?? null, priority: r.priority ?? null }));
}

async function cmdCheckBlog({ pos, opts }) {
  const file = pos[0] || optStr(opts, 'md');
  if (!file) throw new UsageError('usage: check-blog <draft.md>');
  if (!existsSync(file)) throw new UsageError(`file not found: ${path.resolve(file)}`);
  const r = await checkBlogFile(file, { slug: optStr(opts, 'slug') });
  const out = { passed: r.passed, messages: r.messages, warnings: r.warnings, words: r.words, sections: r.sections, minutes: r.minutes, slug: r.slug, toc: r.toc.map((t) => t.text) };
  return { result: out, exitCode: r.passed ? 0 : 2 };
}

/** Sources = unique external https links in the post, in order of appearance. */
function extractSources(markdown) {
  const seen = new Set();
  const out = [];
  for (const m of String(markdown).matchAll(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g)) {
    const url = m[2];
    if (/dhitiservices\.com/i.test(url) || seen.has(url)) continue;
    seen.add(url);
    out.push({ title: m[1].replace(/[*_`]/g, '').trim(), url });
  }
  return out;
}

/** 1600x900 WebP q82 cover, attention crop (or --focus). Returns { buffer, source: {width,height,format} }. */
async function makeCover(photo, focus) {
  const meta = await sharp(photo, { failOn: 'none', limitInputPixels: false }).metadata();
  if (!meta.width || !meta.height) throw new UsageError(`cover ${photo} is not a readable image`);
  const w = meta.orientation >= 5 ? meta.height : meta.width;
  const h = meta.orientation >= 5 ? meta.width : meta.height;
  if (w < 1200 || h < 675) throw new UsageError(`cover ${photo} is only ${w}x${h}; download the full-resolution stock file (>= 1600x900)`);
  if (w < 1600 || h < 900) log.warn(`cover ${photo} is ${w}x${h}; it will be upscaled to 1600x900`);
  let pipeline;
  if (focus) {
    renderersLoaded = true;
    const { loadPhoto } = await import('./render/browser.js');
    pipeline = await loadPhoto(photo, { width: 1600, height: 900, focus });
  } else {
    pipeline = sharp(photo, { failOn: 'none', limitInputPixels: false }).rotate().resize({ width: 1600, height: 900, fit: 'cover', position: sharp.strategy.attention });
  }
  const buffer = await pipeline.webp({ quality: 82, effort: 5, smartSubsample: true }).toBuffer();
  return { buffer, source: { width: w, height: h, format: meta.format } };
}

async function cmdSaveBlog({ opts }) {
  ensureAuth();
  const topicId = needUuid(opts, 'topic');
  const mdFile = path.resolve(need(opts, 'md'));
  const coverFile = path.resolve(need(opts, 'cover', 'a downloaded Magnific stock photo'));
  const stockFile = need(opts, 'stock', 'JSON with the Magnific id/title/url_preview of the cover');
  const itemId = optStr(opts, 'item') ? needUuid(opts, 'item') : undefined;
  if (!existsSync(mdFile)) throw new UsageError(`--md not found: ${mdFile}`);
  if (!existsSync(coverFile)) throw new UsageError(`--cover not found: ${coverFile}`);
  const stock = normalizeStock(await jsonArg(stockFile, 'stock'), 'stock');
  if (!stock.length) throw new UsageError('--stock must describe the cover photo ({"id","title","url_preview"})');

  const topic = await store.getTopic(topicId);
  if (!topic) throw new UsageError(`topic ${topicId} not found`);
  const text = await fs.readFile(mdFile, 'utf8');
  let extra = {};
  try {
    extra = matter(text, {}).data || {};
  } catch {
    /* reported by the check */
  }

  // A revision keeps its slug, so its own (unpublished) slug never counts as a collision.
  let prev = null;
  if (itemId) prev = await store.getItem(itemId);
  const slug = optStr(opts, 'slug') || (prev?.body?.slug && !extra.slug && extra.image === `${prev.body.slug}.webp` ? prev.body.slug : undefined);
  const check = await checkBlogText(text, { file: mdFile, slug });
  if (!check.passed) {
    const err = new Error(`blog check failed: ${check.messages.join('; ')}`);
    err.details = { passed: false, messages: check.messages, warnings: check.warnings, words: check.words, sections: check.sections, slug: check.slug };
    throw err;
  }
  if (topic.category && check.frontmatter.category !== topic.category) log.warn(`category "${check.frontmatter.category}" differs from the topic's "${topic.category}"`);

  // Other blog items (not yet published) must not already use this slug.
  const others = await store.listItems({ type: 'blog' }, { limit: 500 });
  const clash = others.find((i) => i.id !== itemId && i.body?.slug === check.slug && !['rejected', 'failed'].includes(i.status));
  if (clash) throw new UsageError(`slug "${check.slug}" is already used by blog item ${clash.id} (${clash.status}); pick another slug`);

  const cover = await makeCover(coverFile, optStr(opts, 'focus'));
  const planned = topic.planned_publish_date || null;
  const scheduledFor = planned ? istToUTC(planned, config.publishTimeIST) : null;
  const frontmatter = { ...check.frontmatter, image: `${check.slug}.webp`, ...(planned ? { date: planned } : {}) };
  const faq = Array.isArray(extra.faq) ? extra.faq.filter((f) => f && (f.q || f.question)).map((f) => ({ q: String(f.q ?? f.question), a: String(f.a ?? f.answer ?? '') })) : [];

  const ctx = await openItem({ itemId, type: 'blog', topicId, title: frontmatter.title });
  try {
    if (!ctx.isNew && ctx.item.topic_id && ctx.item.topic_id !== topicId) throw new UsageError(`item ${ctx.item.id} belongs to topic ${ctx.item.topic_id}, not ${topicId}`);
    const assets = await replaceAssets(ctx.item.id, ctx.version, [
      {
        name: 'cover.webp',
        buffer: cover.buffer,
        mime: 'image/webp',
        kind: 'blog_cover',
        width: 1600,
        height: 900,
        position: 0,
        meta: { stock, source: cover.source, alt: frontmatter.imageAlt },
      },
    ]);
    const body = {
      slug: check.slug,
      frontmatter,
      markdown: check.markdown,
      word_count: check.words,
      meta: {
        primary_keyword: extra.primary_keyword ?? topic.primary_keyword ?? '',
        secondary_keywords: Array.isArray(extra.secondary_keywords) ? extra.secondary_keywords : topic.secondary_keywords ?? [],
        faq,
      },
      sources: extractSources(check.markdown),
      checks: { passed: true, messages: [], warnings: check.warnings, sections: check.sections, minutes: check.minutes, checked_at: new Date().toISOString() },
      cover_stock: { id: stock[0].id, title: stock[0].title, provider: stock[0].provider, url_preview: stock[0].url_preview },
    };
    const item = await store.updateItem(ctx.item.id, {
      title: frontmatter.title,
      status: 'pending_review',
      body,
      version: ctx.version,
      scheduled_for: scheduledFor,
      feedback: null,
      error: null,
    });
    if (topic.status === 'planned') await store.updateTopic(topicId, { status: 'producing' }).catch((e) => log.warn(`topic status: ${e.message}`));
    return {
      id: item.id,
      version: item.version,
      status: item.status,
      slug: body.slug,
      title: item.title,
      scheduled_for: item.scheduled_for,
      words: check.words,
      sections: check.sections,
      warnings: check.warnings,
      assets: assetSummary(assets),
    };
  } catch (err) {
    await failItem(ctx, err);
    throw err;
  }
}

// ---------------------------------------------------------------------------------------------
// Creatives
// ---------------------------------------------------------------------------------------------

const KIND_TYPE = { carousel: 'carousel', graphic: 'graphic', video: 'video' };

/**
 * Loads a creative spec. Local media paths are resolved relative to the spec file. Returns
 * { body, media: [{ref: {obj,key}, file, kind:'photo'|'clip', name, stock}] }.
 */
async function loadSpec(kind, specFile) {
  const full = path.resolve(specFile);
  const raw = await readJsonFile(full, `${kind} spec`);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new UsageError(`${kind} spec must be a JSON object`);
  const body = structuredClone(raw);
  const dir = path.dirname(full);
  const media = [];
  const add = (obj, key, mkind, name, label) => {
    const file = resolveLocal(obj[key], dir, label);
    if (!file) return;
    obj[key] = file;
    media.push({ obj, key, file, kind: mkind, name, stock: normalizeStock(obj.stock, `${label}.stock`) });
  };
  if (kind === 'carousel') {
    if (!Array.isArray(body.slides) || !body.slides.length) throw new UsageError('carousel spec needs slides[]');
    body.slides.forEach((s, i) => add(s, 'photo', 'photo', `slide-${String(i + 1).padStart(2, '0')}`, `slides[${i}].photo`));
  } else if (kind === 'graphic') {
    add(body, 'photo', 'photo', 'photo', 'photo');
  } else if (kind === 'video') {
    if (!Array.isArray(body.scenes) || !body.scenes.length) throw new UsageError('video spec needs scenes[]');
    body.scenes.forEach((s, i) => {
      const n = `scene-${String(i + 1).padStart(2, '0')}`;
      if (s.clip) add(s, 'clip', 'clip', n, `scenes[${i}].clip`);
      if (s.photo) add(s, 'photo', 'photo', `${n}-photo`, `scenes[${i}].photo`);
    });
    if (body.voiceover_path) body.voiceover_path = resolveLocal(body.voiceover_path, dir, 'voiceover_path');
  }
  // A top-level "stock" list may name each file ({file, provider, id, ...}): attach those entries to the media
  // that use the file, so every asset keeps its own licence trail (playbook spec shape).
  if (Array.isArray(raw.stock)) {
    raw.stock.forEach((entry, i) => {
      if (!entry || typeof entry !== 'object' || !entry.file) return;
      const file = resolveLocal(entry.file, dir, `stock[${i}].file`);
      for (const m of media) if (m.file === file && !m.stock.length) m.stock = normalizeStock(entry, `stock[${i}]`);
    });
  }
  if (body.stock !== undefined) body.stock = normalizeStock(body.stock, 'stock');
  return { body, media };
}

/** Rebuilds a spec from a stored item body, downloading its stored sources (for re-renders). */
async function specFromItem(kind, item, dir) {
  const body = structuredClone(item.body || {});
  const media = [];
  const restore = async (obj, key, mkind, name) => {
    const src = obj.source && obj.source_kind === mkind ? obj.source : null;
    if (!src) return;
    const file = await downloadSource(src, dir);
    obj[key] = file;
    media.push({ obj, key, file, kind: mkind, name, stock: normalizeStock(obj.stock, 'stock'), storedAt: src });
  };
  if (kind === 'carousel') for (const [i, s] of (body.slides || []).entries()) await restore(s, 'photo', 'photo', `slide-${String(i + 1).padStart(2, '0')}`);
  if (kind === 'graphic') await restore(body, 'photo', 'photo', 'photo');
  if (kind === 'video') {
    for (const [i, s] of (body.scenes || []).entries()) {
      const n = `scene-${String(i + 1).padStart(2, '0')}`;
      await restore(s, 'clip', 'clip', n);
      await restore(s, 'photo', 'photo', `${n}-photo`);
    }
  }
  if (!media.length) throw new UsageError(`item ${item.id} has no stored sources; pass --spec to re-render it`);
  return { body, media };
}

async function brandForRender() {
  const b = await getBrandContext({ voiceSamples: 0 });
  return { colors: b.colors, logoDataUri: b.logoDataUri, markDataUri: b.markDataUri };
}

/** Renders a creative body. Returns { files: [{name, buffer, mime, kind, width, height, position, meta}], info }. */
async function renderCreative(kind, body, { brand, stockAll, keepWork }) {
  renderersLoaded = true;
  if (kind === 'carousel') {
    const { renderCarousel, CAROUSEL_SIZE } = await import('./render/carousel.js');
    const size = CAROUSEL_SIZE || { width: 1080, height: 1350 };
    const r = await renderCarousel(body, { brand });
    const files = r.slides.map((buf, i) => ({
      name: `slide-${String(i + 1).padStart(2, '0')}.png`,
      buffer: buf,
      mime: 'image/png',
      kind: 'carousel_slide',
      ...size,
      position: i,
      meta: { stock: normalizeStock(body.slides?.[i]?.stock) },
    }));
    files.push({ name: 'carousel.pdf', buffer: r.pdf, mime: 'application/pdf', kind: 'carousel_pdf', ...size, position: r.slides.length, meta: { pages: r.slides.length, stock: stockAll } });
    return { files, info: { slides: r.slides.length } };
  }
  if (kind === 'graphic') {
    const { renderGraphic, GRAPHIC_SIZES } = await import('./render/graphic.js');
    const sizes = GRAPHIC_SIZES || { square: { width: 1080, height: 1080 }, landscape: { width: 1200, height: 627 } };
    const r = await renderGraphic(body, { brand });
    return {
      files: [
        { name: 'square.png', buffer: r.square, mime: 'image/png', kind: 'graphic', ...sizes.square, position: 0, meta: { format: 'square', stock: stockAll } },
        { name: 'landscape.png', buffer: r.landscape, mime: 'image/png', kind: 'graphic', ...sizes.landscape, position: 1, meta: { format: 'landscape', stock: stockAll } },
      ],
      info: {},
    };
  }
  const { renderVideo, VIDEO_SIZE } = await import('./render/video.js');
  const size = VIDEO_SIZE || { width: 1080, height: 1920 };
  const r = await renderVideo(body, { brand, workDir: await workRoot(), keepWork });
  const posterMime = r.posterMime || 'image/jpeg';
  return {
    files: [
      { name: 'reel.mp4', buffer: r.mp4, mime: 'video/mp4', kind: 'video', width: r.width ?? size.width, height: r.height ?? size.height, position: 0, meta: { duration: r.duration, fps: r.fps, transition: r.transition, timeline: r.timeline, voiceover: Boolean(body.voiceover_path), stock: stockAll } },
      { name: `poster${extFromMime(posterMime) || '.jpg'}`, buffer: r.poster, mime: posterMime, kind: 'video_poster', ...size, position: 1, meta: { stock: stockAll } },
    ],
    info: { duration: r.duration, timeline: r.timeline, voiceover_duration: r.voiceover_duration ?? r.voiceoverDuration },
  };
}

/** Body as stored in the DB: local paths replaced by stock metadata (+ stored source path for re-renders). */
function storedBody(kind, body, media, sources) {
  const out = structuredClone(body);
  const strip = (obj, key, ref) => {
    const m = media.find((x) => x.obj === ref && x.key === key);
    if (!m) {
      if (obj[key] !== undefined) obj[key] = null;
      return;
    }
    obj[key] = null;
    if (m.stock.length) obj.stock = m.stock.length === 1 ? m.stock[0] : m.stock;
    else delete obj.stock;
    obj.source = sources.get(m) ?? m.storedAt ?? null;
    obj.source_kind = m.kind;
  };
  if (kind === 'carousel') (out.slides || []).forEach((s, i) => strip(s, 'photo', body.slides[i]));
  if (kind === 'graphic') strip(out, 'photo', body);
  if (kind === 'video') {
    (out.scenes || []).forEach((s, i) => {
      const ref = body.scenes[i];
      const clipM = media.find((x) => x.obj === ref && x.key === 'clip');
      const photoM = media.find((x) => x.obj === ref && x.key === 'photo');
      strip(s, 'clip', ref);
      if (clipM && photoM) {
        // Both given: the clip wins in the renderer; keep the photo source too.
        s.photo_source = sources.get(photoM) ?? photoM.storedAt ?? null;
        s.photo = null;
      } else strip(s, 'photo', ref);
    });
    delete out.voiceover_path;
  }
  return out;
}

async function cmdMake(kind, { opts }) {
  ensureAuth();
  const type = KIND_TYPE[kind];
  const itemId = optStr(opts, 'item') ? needUuid(opts, 'item') : undefined;
  const specFile = optStr(opts, 'spec');
  if (!specFile && !itemId) throw new UsageError(`usage: make-${kind} --parent <blogItemId> --spec <${kind}.json> [--item <id>]`);

  let parentId = optStr(opts, 'parent') ? needUuid(opts, 'parent') : undefined;
  let existing = null;
  if (itemId) {
    existing = await store.getItem(itemId);
    if (!existing) throw new UsageError(`item ${itemId} not found`);
    parentId = parentId || existing.parent_id;
  }
  if (!parentId) throw new UsageError('missing --parent <blogItemId>');
  const parent = await store.getItem(parentId);
  if (!parent) throw new UsageError(`parent item ${parentId} not found`);
  if (parent.type !== 'blog') throw new UsageError(`parent ${parentId} is a ${parent.type}; creatives hang off a blog item`);

  const dl = await fs.mkdtemp(path.join(await workRoot(), `${kind}-src-`));
  try {
    const spec = specFile ? await loadSpec(kind, specFile) : await specFromItem(kind, existing, dl);
    const { body, media } = spec;

    // Voiceover (v3): local file aligned by the renderer; library asset id recorded in the body.
    let voiceoverDuration = null;
    if (kind === 'video') {
      const vo = optStr(opts, 'voiceover');
      if (vo) body.voiceover_path = resolveLocal(vo, process.cwd(), '--voiceover');
      if (body.voiceover_path) {
        const { probeMedia } = await import('./render/video.js');
        voiceoverDuration = (await probeMedia(body.voiceover_path)).duration || null;
        if (!voiceoverDuration) throw new UsageError(`--voiceover ${body.voiceover_path} has no readable audio`);
      }
      const voAsset = optStr(opts, 'voiceover-asset');
      if (voAsset || body.voiceover_path) body.voiceover = { library_asset_id: voAsset ?? body.voiceover?.library_asset_id ?? null, duration: voiceoverDuration };
      else if (body.voiceover === undefined) body.voiceover = null;
    }

    const stockAll = uniqStock([...media.flatMap((m) => m.stock), ...normalizeStock(body.stock)]);
    const missingStock = media.filter((m) => !m.stock.length && !normalizeStock(body.stock).length);
    if (missingStock.length) log.warn(`${missingStock.length} media file(s) have no stock metadata (add "stock": {"id","title","url_preview"} next to each photo/clip for the licence trail)`);

    const title = body.title || existing?.title || `${kind[0].toUpperCase()}${kind.slice(1)}: ${parent.title || parent.body?.frontmatter?.title || ''}`.trim();
    const ctx = await openItem({ itemId, type, topicId: parent.topic_id, parentId, title });
    try {
      // Keep the source media so the item can be re-rendered later (download links expire).
      const sources = new Map();
      const srcCache = new Map();
      for (const m of media) {
        if (m.storedAt && m.storedAt.startsWith(`items/${ctx.item.id}/`)) {
          sources.set(m, m.storedAt);
          continue;
        }
        const key = `${m.kind}:${m.file}`;
        if (!srcCache.has(key)) srcCache.set(key, await uploadSource(ctx.item.id, m.name, m.file, m.kind));
        sources.set(m, srcCache.get(key));
      }

      const brand = await brandForRender();
      const { files, info } = await renderCreative(kind, body, { brand, stockAll, keepWork: Boolean(opts['keep-work']) });
      const assets = await replaceAssets(ctx.item.id, ctx.version, files);
      const saved = storedBody(kind, body, media, sources);
      if (kind === 'video' && info.duration) saved.duration = info.duration;
      if (stockAll.length) saved.stock = stockAll;

      let status = 'pending_review';
      if (kind === 'video' && String(body.voiceover_script || '').trim() && !body.voiceover_path) status = 'awaiting_voiceover';
      const patch = { title, status, body: saved, version: ctx.version, feedback: null, error: null };
      let item;
      try {
        item = await store.updateItem(ctx.item.id, patch);
      } catch (err) {
        if (status === 'awaiting_voiceover' && err.status === 400) {
          log.warn(`status awaiting_voiceover not accepted by the backend (${err.message}); using pending_review`);
          item = await store.updateItem(ctx.item.id, { ...patch, status: 'pending_review' });
        } else throw err;
      }
      return {
        id: item.id,
        type: item.type,
        version: item.version,
        status: item.status,
        parent_id: parentId,
        title: item.title,
        ...info,
        assets: assetSummary(assets),
        sources: [...new Set(sources.values())],
      };
    } catch (err) {
      await failItem(ctx, err);
      throw err;
    }
  } finally {
    await fs.rm(dl, { recursive: true, force: true }).catch(() => {});
  }
}

async function cmdPreview({ pos, opts }) {
  const kind = pos[0];
  const outDir = path.resolve(need(opts, 'out'));
  await fs.mkdir(outDir, { recursive: true });
  if (kind === 'cover' || kind === 'blog') {
    const photo = path.resolve(need(opts, 'cover'));
    const cover = await makeCover(photo, optStr(opts, 'focus'));
    const file = path.join(outDir, 'cover.webp');
    await fs.writeFile(file, cover.buffer);
    const result = { kind: 'cover', files: [file], source: cover.source };
    const md = optStr(opts, 'md');
    if (md) {
      const r = await checkBlogFile(md, { slug: optStr(opts, 'slug') });
      result.check = { passed: r.passed, messages: r.messages, warnings: r.warnings, words: r.words, sections: r.sections };
    }
    return result;
  }
  if (!KIND_TYPE[kind]) throw new UsageError('usage: preview carousel|graphic|video|cover --spec <file> --out <dir>');
  const { body, media } = await loadSpec(kind, need(opts, 'spec'));
  if (kind === 'video' && optStr(opts, 'voiceover')) body.voiceover_path = resolveLocal(optStr(opts, 'voiceover'), process.cwd(), '--voiceover');
  const stockAll = uniqStock([...media.flatMap((m) => m.stock), ...normalizeStock(body.stock)]);
  const { files, info } = await renderCreative(kind, body, { brand: await brandForRender(), stockAll, keepWork: Boolean(opts['keep-work']) });
  const written = [];
  for (const f of files) {
    const p = path.join(outDir, f.name);
    await fs.writeFile(p, f.buffer);
    written.push(p);
  }
  return { kind, files: written, ...info, media: media.map((m) => ({ file: m.file, kind: m.kind, stock: m.stock.map((s) => s.id) })) };
}

async function cmdTopic({ opts }) {
  ensureAuth();
  const id = needUuid(opts, 'id');
  const patch = {};
  if (optStr(opts, 'status')) patch.status = optStr(opts, 'status');
  if (opts.error !== undefined) patch.error = optStr(opts, 'error') ?? null;
  if (optStr(opts, 'planned-publish-date')) patch.planned_publish_date = optStr(opts, 'planned-publish-date');
  if (!Object.keys(patch).length) throw new UsageError('usage: topic --id <id> --status ready [--error msg]');
  const row = await store.updateTopic(id, patch);
  return { id: row.id, status: row.status, title: row.title, error: row.error ?? null };
}

async function cmdJob({ pos, opts }) {
  ensureAuth();
  const sub = pos[0];
  if (sub === 'finish') {
    const id = needUuid(opts, 'id');
    const row = await store.finishJob(id, { status: optStr(opts, 'status') || 'done', error: optStr(opts, 'error') });
    return { id: row.id, kind: row.kind, status: row.status, finished_at: row.finished_at ?? null };
  }
  if (sub === 'claim') {
    const kinds = optStr(opts, 'kinds')?.split(',').map((s) => s.trim()).filter(Boolean);
    const limit = Number(optStr(opts, 'limit') || 5);
    const rows = await store.claimJobs({ limit, kinds });
    return { jobs: rows };
  }
  throw new UsageError('usage: job finish --id <id> --status done | job claim [--kinds a,b] [--limit n]');
}

async function cmdItem({ opts, pos }) {
  ensureAuth();
  const id = optStr(opts, 'id') || pos[0];
  if (!isUuid(id)) throw new UsageError('usage: item --id <id>');
  return store.getItem(id);
}

// ---------------------------------------------------------------------------------------------
// publish
// ---------------------------------------------------------------------------------------------

const isDue = (item, now) => !item.scheduled_for || Date.parse(item.scheduled_for) <= now;

async function cmdPublish({ opts }) {
  ensureAuth();
  const now = Date.now();
  const dryList = Boolean(opts['dry-list']);
  const approved = await store.listItems({ status: 'approved', type: 'blog' }, { limit: 200 });
  if (dryList) {
    return {
      approved: approved.map((i) => ({ id: i.id, title: i.title, scheduled_for: i.scheduled_for, due: isDue(i, now) })),
      due: approved.filter((i) => isDue(i, now)).length,
    };
  }

  const run = await store.createRun('publish').catch((e) => {
    log.warn(`could not create a run row: ${e.message}`);
    return null;
  });
  const result = { run_id: run?.id ?? null, published: [], skipped: [], failed: [], jobs: [] };
  let jobs = [];
  try {
    try {
      jobs = await store.claimJobs({ limit: 20, kinds: ['publish_now'] });
    } catch (err) {
      log.warn(`could not claim publish_now jobs (${err.message}); publishing due items only`);
    }
    // Jobs for items that are not approved can never be published by this worker.
    const jobItemIds = new Set(jobs.map((j) => j.payload?.content_item_id).filter(Boolean));
    const byId = new Map(approved.map((i) => [i.id, i]));
    const queue = approved.filter((i) => isDue(i, now) || jobItemIds.has(i.id));
    queue.sort((a, b) => String(a.scheduled_for ?? '').localeCompare(String(b.scheduled_for ?? '')));
    for (const i of approved) if (!queue.includes(i)) result.skipped.push({ id: i.id, title: i.title, scheduled_for: i.scheduled_for, reason: 'not due yet' });
    if (!queue.length && !jobs.length) log('publish: nothing is due');

    const { publishBlog } = await import('./publish/blog.js');
    const outcome = new Map(); // itemId -> {ok, error}
    for (const summary of queue) {
      try {
        const item = await store.getItem(summary.id);
        if (item.status !== 'approved') {
          result.skipped.push({ id: item.id, title: item.title, reason: `status is ${item.status}` });
          outcome.set(item.id, { ok: item.status === 'published', error: `status is ${item.status}` });
          continue;
        }
        const coverAsset = (item.assets || []).find((a) => a.kind === 'blog_cover');
        if (!coverAsset) throw Object.assign(new Error('no blog_cover asset'), { permanent: true });
        const cover = await store.downloadFile(coverAsset.storage_path);
        log(`publish: "${item.title}" (${item.id})`);
        const pub = await publishBlog({ item, cover });
        await retry(
          () => store.updateItem(item.id, { status: 'published', published_at: new Date().toISOString(), published_url: pub.url, error: null }),
          { retries: 4, baseMs: 2000, label: 'mark published' },
        );
        result.published.push({ id: item.id, title: pub.title, url: pub.url, commit: pub.commit, pushed: pub.pushed, date: pub.date, already: pub.alreadyPublished });
        outcome.set(item.id, { ok: true });
      } catch (err) {
        const msg = errorMessage(err);
        log.error(`publish failed for ${summary.id}: ${msg}`);
        result.failed.push({ id: summary.id, title: summary.title, error: msg, permanent: Boolean(err.permanent) });
        outcome.set(summary.id, { ok: false, error: msg });
        // Content problems need a human (status failed); transient problems keep it approved for the next run.
        const patch = err.permanent ? { status: 'failed', error: msg } : { error: `publish attempt failed (will retry): ${msg}` };
        await store.updateItem(summary.id, patch).catch((e) => log.warn(`could not record the failure: ${e.message}`));
      }
    }

    for (const job of jobs) {
      const id = job.payload?.content_item_id;
      let status = 'done';
      let error;
      if (!id) [status, error] = ['failed', 'payload.content_item_id is missing'];
      else if (outcome.has(id)) {
        const o = outcome.get(id);
        if (!o.ok) [status, error] = ['failed', o.error];
      } else if (!byId.has(id)) {
        const item = await store.getItem(id).catch(() => null);
        if (item?.status === 'published') status = 'done';
        else [status, error] = ['failed', item ? `item is ${item.status}, not approved` : 'item not found'];
      }
      await store.finishJob(job.id, { status, error }).catch((e) => log.warn(`finish_job ${job.id}: ${e.message}`));
      result.jobs.push({ id: job.id, content_item_id: id ?? null, status, error: error ?? null });
    }
  } catch (err) {
    // Release claimed jobs that were not finished so the next run picks them up.
    for (const job of jobs) {
      if (!result.jobs.find((j) => j.id === job.id)) await store.finishJob(job.id, { status: 'queued', error: errorMessage(err) }).catch(() => {});
    }
    if (run) await store.finishRun(run.id, { status: 'failed', error: errorMessage(err) }).catch(() => {});
    throw err;
  }
  if (run) {
    const status = result.failed.length ? 'failed' : 'succeeded';
    await store
      .finishRun(run.id, { status, error: result.failed.map((f) => `${f.title}: ${f.error}`).join('\n') || undefined, usage: { published: result.published.length, failed: result.failed.length } })
      .catch((e) => log.warn(`finish_run: ${e.message}`));
  }
  return { result, exitCode: result.failed.length ? 1 : 0 };
}

// =====================================================================================================================
// Main
// =====================================================================================================================

const COMMANDS = {
  context: cmdContext,
  fetch: cmdFetch,
  run: cmdRun,
  'save-brief': cmdSaveBrief,
  'save-topics': cmdSaveTopics,
  'check-blog': cmdCheckBlog,
  'save-blog': cmdSaveBlog,
  'make-carousel': (a) => cmdMake('carousel', a),
  'make-graphic': (a) => cmdMake('graphic', a),
  'make-video': (a) => cmdMake('video', a),
  preview: cmdPreview,
  topic: cmdTopic,
  job: cmdJob,
  item: cmdItem,
  publish: cmdPublish,
};

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

let renderersLoaded = false;
async function closeRenderers() {
  if (!renderersLoaded) return;
  try {
    const b = await import('./render/browser.js');
    await b.closeBrowser?.();
  } catch {
    /* not loaded or not installed */
  }
}

export async function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    process.stderr.write(HELP);
    print({ ok: true, commands: Object.keys(COMMANDS), help: HELP.split('\n').filter((l) => l.startsWith('  ')).map((l) => l.trim()) });
    return 0;
  }
  const fn = COMMANDS[command];
  if (!fn) {
    print({ ok: false, error: `unknown command "${command}". Run: node src/cli.js help` });
    return 1;
  }
  const args = parseArgs(rest);
  const started = Date.now();
  try {
    const out = await fn(args);
    const isWrapped = out && typeof out === 'object' && !Array.isArray(out) && 'exitCode' in out && 'result' in out && Object.keys(out).length === 2;
    print(isWrapped ? out.result : out);
    log(`${command} finished in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    return isWrapped ? out.exitCode : 0;
  } catch (err) {
    const usage = err instanceof UsageError;
    log.error(`${command} failed: ${usage ? err.message : err.stack || err.message}`);
    print({ ok: false, command, error: errorMessage(err), ...(err.details ? { details: err.details } : {}), ...(usage ? { usage: true } : {}) });
    return 1;
  } finally {
    await closeRenderers();
  }
}

const isEntry = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntry) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      process.stderr.write(`${err?.stack || err}\n`);
      process.exitCode = 1;
    },
  );
}

