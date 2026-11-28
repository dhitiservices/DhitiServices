// Shared helpers. Small, dependency-light, used by every pipeline stage.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { config } from './config.js';
import { log } from './log.js';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Same rule the website uses (scripts/blog-data.mjs), so slugs always match URLs. */
export function slugify(value = '', maxLength = 80) {
  const s = String(value)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (s.length <= maxLength) return s;
  return s.slice(0, maxLength).replace(/-[^-]*$/, '') || s.slice(0, maxLength);
}

/** Error carrying an HTTP status (used by the REST clients). */
export class HttpError extends Error {
  constructor(message, { status, body, retryAfterMs } = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
    this.retryAfterMs = retryAfterMs;
  }
}

export const isRetryableStatus = (status) => status === 408 || status === 409 || status === 425 || status === 429 || (status >= 500 && status <= 599);

/** Parses a Retry-After header (seconds or HTTP date) into milliseconds. */
export function retryAfterMs(headers) {
  const v = headers?.get?.('retry-after');
  if (!v) return undefined;
  const secs = Number(v);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(v);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined;
}

/** Default retry policy: network failures and retryable HTTP statuses. */
export function isTransientError(err) {
  if (!err) return false;
  if (err.retryable === false) return false;
  if (err.retryable === true) return true;
  const status = err.status ?? err.statusCode;
  if (typeof status === 'number') return isRetryableStatus(status);
  const code = err.code || err.cause?.code;
  if (['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND', 'EPIPE', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT'].includes(code)) return true;
  if (err.name === 'TimeoutError' || err.name === 'AbortError') return true;
  return /fetch failed|network|socket hang up|terminated/i.test(err.message || '');
}

/**
 * Runs fn(attempt) with exponential backoff and full jitter.
 * Honours err.retryAfterMs when present. Rethrows the last error.
 */
export async function retry(fn, { retries = 4, baseMs = 1000, maxMs = 60_000, shouldRetry = isTransientError, label = 'operation', onRetry } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (attempt >= retries || !shouldRetry(err, attempt)) throw err;
      const backoff = Math.min(maxMs, baseMs * 2 ** attempt);
      const wait = Math.max(err?.retryAfterMs ?? 0, Math.round(backoff / 2 + Math.random() * (backoff / 2)));
      log.warn(`${label} failed (attempt ${attempt + 1}/${retries + 1}): ${err?.message || err}. Retrying in ${(wait / 1000).toFixed(1)}s`);
      await onRetry?.(err, attempt);
      await sleep(wait);
      attempt += 1;
    }
  }
}

/** fetch with a timeout and a clear error on non-2xx. Returns the Response. */
export async function fetchOk(url, { timeoutMs = 60_000, label, ...init } = {}) {
  const res = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new HttpError(`${label || 'HTTP request'} failed: ${res.status} ${res.statusText} ${body.slice(0, 500)}`.trim(), {
      status: res.status,
      body,
      retryAfterMs: retryAfterMs(res.headers),
    });
  }
  return res;
}

// ---------- Dates (Asia/Kolkata) ----------

const ymdFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Calendar date (YYYY-MM-DD) of `date` as seen in Asia/Kolkata. */
export function toISTDate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${date}`);
  return ymdFormatter.format(d); // en-CA => YYYY-MM-DD
}

export const todayIST = () => toISTDate(new Date());

const ymdToUTC = (ymd) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) throw new Error(`Expected YYYY-MM-DD, got ${ymd}`);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
};

/** Adds n days to a YYYY-MM-DD string. */
export function addDays(ymd, n) {
  const d = ymdToUTC(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Weekday name ("Monday"...) of a YYYY-MM-DD string. */
export const dayName = (ymd) => DAY_NAMES[ymdToUTC(ymd).getUTCDay()];

/**
 * Monday (YYYY-MM-DD) of the week containing `date`, in Asia/Kolkata.
 * Accepts a Date, a timestamp, or a YYYY-MM-DD string (treated as a calendar date).
 */
export function weekStart(date = new Date()) {
  const ymd = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : toISTDate(date);
  const dow = ymdToUTC(ymd).getUTCDay(); // 0 = Sunday
  return addDays(ymd, -((dow + 6) % 7));
}

/**
 * Upcoming publish dates for a week: the given weekday names on/after `fromYmd`
 * (defaults to today IST), returning `count` dates, cycling into later weeks if needed.
 */
export function nextPublishDates(count, days = ['Tuesday', 'Thursday'], fromYmd = todayIST()) {
  const wanted = new Set((days?.length ? days : ['Tuesday', 'Thursday']).map((d) => String(d).toLowerCase()));
  const out = [];
  for (let i = 0; out.length < count && i < 400; i++) {
    const d = addDays(fromYmd, i);
    if (wanted.has(dayName(d).toLowerCase())) out.push(d);
  }
  return out;
}

// ---------- Text ----------

/** Word count using the same rule as scripts/blog-data.mjs. */
export function wordCount(markdown = '') {
  const plain = String(markdown).replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[#*`>|]/g, '');
  const t = plain.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Trims to max characters at a word boundary, adding an ellipsis only if cut. */
export function truncate(text = '', max = 160) {
  const s = String(text).replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1).replace(/\s+\S*$/, '').replace(/[,;:.\s]+$/, '');
  return `${cut}…`;
}

/** Replaces em dashes (banned by the brand) with a comma-style pause. */
export const removeEmDashes = (s = '') => String(s).replace(/\s*—\s*/g, ', ');

/** Small stable hash (FNV-1a) for deterministic choices. */
export function hashString(s = '') {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ---------- Files and images ----------

export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/** Writes a file, creating parent directories. Returns the path. */
export async function writeFileEnsured(file, data) {
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, data);
  return file;
}

export async function readJSON(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT' && fallback !== undefined) return fallback;
    throw err;
  }
}

/**
 * Converts any image buffer to WebP. With width+height it cover-crops to exactly that size
 * (attention-based crop keeps the subject). Returns a Buffer.
 */
export async function toWebp(input, { width, height, quality = 82, fit = 'cover' } = {}) {
  let img = sharp(input, { failOn: 'none' }).rotate();
  if (width || height) img = img.resize({ width, height, fit, position: fit === 'cover' ? sharp.strategy.attention : 'centre', withoutEnlargement: false });
  return img.webp({ quality, effort: 5, smartSubsample: true }).toBuffer();
}

/** Converts any image buffer to PNG (optionally resized/cropped). */
export async function toPng(input, { width, height, fit = 'cover' } = {}) {
  let img = sharp(input, { failOn: 'none' }).rotate();
  if (width || height) img = img.resize({ width, height, fit, position: fit === 'cover' ? sharp.strategy.attention : 'centre' });
  return img.png({ compressionLevel: 9 }).toBuffer();
}

/** { width, height, format } of an image buffer. */
export async function imageSize(input) {
  const m = await sharp(input).metadata();
  return { width: m.width, height: m.height, format: m.format };
}

/** Escapes text for safe inclusion in HTML/SVG templates. */
export const escapeHtml = (value = '') =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Deep-ish error message including causes, for logs and DB error columns. */
export function errorMessage(err) {
  if (!err) return 'Unknown error';
  const parts = [err.message || String(err)];
  let c = err.cause;
  while (c && parts.length < 4) {
    parts.push(c.message || String(c));
    c = c.cause;
  }
  return parts.join(' <- ').slice(0, 4000);
}
