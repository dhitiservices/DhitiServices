// Claims ledger: the mechanical accuracy gate for blogs (ARCHITECTURE.md v4 "Claims ledger").
//
// A blog is saved only with a claims.json in which every factual sentence of the post is mapped to a verbatim quote
// from a source that THIS ENGINE fetched (`cli.js fetch-source <url>`), so a wrong number, a made-up quote, a quote
// from another page or an uncited stat can never reach the owner unflagged.
//
//   claims.json  = [{ id, kind, claim_text, source_url, source_title, quote, fetched_at?, derived?, extra_quotes?, note? }]
//   kind         = fact | law | stat | date | quote      (sourced: need source_url + quote)
//                | illustrative                         (no source; must sit in a paragraph run marked "For example" /
//                                                        "Illustrative" / "Example")
//                | advice                               (no source; Dhiti's own recommendation or a process step;
//                                                        needs a `note`, and may not carry %, money, years, law
//                                                        references, document ids or numbers above 100)
//   derived      = { arithmetic: "30 November 2026 = 30 November after FY 2025-26 ends on 31 March 2026", from?: [ids] }
//                  tokens of claim_text that are not in the quote must appear in the arithmetic
//   extra_quotes = [{ source_url, quote, source_title? }]   (a claim that combines two sources)
//
// Checks (any failure = the blog is refused, there is no override):
//   1. claim_text appears in the post body (markdown stripped, whitespace / quotes / dashes normalised)
//   2. the source was fetched by the engine: an entry in <sources dir>/manifest.json whose raw file still has the
//      recorded sha256 (and whose extracted text has its recorded sha256)
//   3. the quote (8 to 60 words) is in the fetched text after normalisation (case, whitespace, smart quotes,
//      hyphens, HTML entities; PDFs go through unpdf text extraction); a looser letters-and-digits-only comparison
//      absorbs PDF line-break hyphenation
//   4. every number / date / financial year / section / document-id token of claim_text is in the quote(s), or the
//      claim is `derived` and the arithmetic shows it
//   5. a detector finds factual-looking sentences (digits, %, ₹, dates, Section, Rule, Circular, Notification, GSTR,
//      IMS, CBIC, RBI, DGCA, must, mandatory, deadline, Act, survey, quotes ...) that no claim covers
//   plus: law claims cite a primary (government) source; no relative dates ("recently", "this year"); numbers in the
//   title, description, imageAlt and FAQ must appear in a sourced claim.
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';

const require = createRequire(import.meta.url);

export const SOURCED_KINDS = ['fact', 'law', 'stat', 'date', 'quote'];
export const CLAIM_KINDS = [...SOURCED_KINDS, 'illustrative', 'advice'];
export const QUOTE_MIN_WORDS = 8;
export const QUOTE_MAX_WORDS = 60;

/** Hosts that count as primary sources for `law` claims (government, regulators, official gazettes). */
export const PRIMARY_HOST = /(^|\.)(gov\.in|nic\.in|rbi\.org\.in|sebi\.gov\.in|gov|gov\.uk|europa\.eu|legislation\.gov\.uk|federalregister\.gov|icao\.int)$/i;

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

// =====================================================================================================================
// Normalisation
// =====================================================================================================================

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ensp: ' ', emsp: ' ', thinsp: ' ', ndash: '-', mdash: '-',
  lsquo: "'", rsquo: "'", sbquo: "'", ldquo: '"', rdquo: '"', bdquo: '"', hellip: '...', middot: '·', bull: '•',
  copy: '©', reg: '®', trade: '™', deg: '°', times: '×', divide: '÷', rupee: '₹', inr: '₹', shy: '', zwj: '', zwnj: '',
  laquo: '"', raquo: '"', prime: "'", Prime: '"', minus: '-', frac12: '1/2', frac14: '1/4', frac34: '3/4', sect: '§', para: '¶',
};

export function decodeEntities(s) {
  return String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);?/gi, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try {
        return Number.isFinite(cp) && cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : m;
      } catch {
        return m;
      }
    }
    return Object.hasOwn(NAMED_ENTITIES, e) ? NAMED_ENTITIES[e] : Object.hasOwn(NAMED_ENTITIES, e.toLowerCase()) ? NAMED_ENTITIES[e.toLowerCase()] : m;
  });
}

/**
 * Character-level normalisation that keeps case and length-independent structure: NFKC, entities, smart quotes to
 * ASCII, every dash/hyphen variant to "-", soft hyphens and zero-width characters removed, whitespace collapsed.
 */
export function normText(s) {
  return decodeEntities(String(s ?? ''))
    .normalize('NFKC')
    .replace(/[­​-‍⁠﻿]/g, '')
    .replace(/[‘’‚‛′ʼ`´]/g, "'")
    .replace(/[“”„‟″«»]/g, '"')
    .replace(/[‐-―−﹘﹣－]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strict comparison form: normText, lowercase, spaces around hyphens and before punctuation removed. */
export const strictForm = (s) => normText(s).toLowerCase().replace(/\s*-\s*/g, '-').replace(/\s+([,.;:!?)\]])/g, '$1').replace(/([(\[])\s+/g, '$1');
/** Loose comparison form: letters and digits only (absorbs PDF line-break hyphenation and spacing differences). */
export const looseForm = (s) => normText(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

export const wordCount = (s) => normText(s).split(' ').filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/** Strips inline markdown: [text](url) -> text, **b** / *i* / _i_ / `code` -> content. */
export function stripInlineMarkdown(s) {
  return String(s ?? '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\((?:[^()\s]|\([^)]*\))+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(^|[^\w*])\*([^*\n]+)\*(?=[^\w*]|$)/g, '$1$2')
    .replace(/(^|[^\w])_([^_\n]+)_(?=[^\w]|$)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1');
}

// =====================================================================================================================
// Source text extraction (HTML, PDF, plain text)
// =====================================================================================================================

/** HTML to readable text: drops script/style/nav chrome, block tags become line breaks, entities decoded. */
export function htmlToText(html) {
  let s = String(html ?? '');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1\s*>/gi, ' ');
  s = s.replace(/<(br|hr)\b[^>]*>/gi, '\n');
  s = s.replace(/<\/?(p|div|section|article|header|footer|main|aside|nav|li|ul|ol|dl|dt|dd|h[1-6]|tr|table|thead|tbody|tfoot|blockquote|pre|figure|figcaption|form|fieldset|legend|caption|address|details|summary)\b[^>]*>/gi, '\n');
  s = s.replace(/<\/?(td|th)\b[^>]*>/gi, ' \t ');
  s = s.replace(/<[^>]+>/g, '');
  s = decodeEntities(s);
  return s
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .filter((l, i, arr) => l || (i > 0 && arr[i - 1]))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function htmlTitle(html) {
  const m = String(html ?? '').match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return m ? normText(m[1]).slice(0, 300) : '';
}

let unpdfMod = null;
async function loadUnpdf() {
  if (unpdfMod) return unpdfMod;
  const resolved = require.resolve('unpdf');
  unpdfMod = await import(pathToFileURL(resolved).href);
  return unpdfMod;
}

/** PDF to text with unpdf (pdf.js). Returns { text, pages, title }. */
export async function pdfToText(buffer) {
  const { extractText, getDocumentProxy, getMeta } = await loadUnpdf();
  const origWarn = console.warn;
  const origLog = console.log;
  console.warn = () => {}; // pdf.js prints font warnings to the console; stdout must stay one JSON value
  console.log = () => {};
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    let title = '';
    try {
      const meta = typeof getMeta === 'function' ? await getMeta(pdf) : null;
      title = normText(meta?.info?.Title || '').slice(0, 300);
    } catch {
      /* no metadata */
    }
    const pages = Array.isArray(text) ? text : [String(text)];
    return { text: pages.map((p, i) => `[page ${i + 1}]\n${String(p).trim()}`).join('\n\n'), pages: totalPages, title };
  } finally {
    console.warn = origWarn;
    console.log = origLog;
  }
}

export const isPdf = (buf, mime = '') => /pdf/i.test(mime) || (buf?.length > 4 && buf.subarray(0, 5).toString('latin1') === '%PDF-');
const isHtml = (buf, mime = '') => /html|xml/i.test(mime) || /^\s*(<!doctype html|<html|<\?xml|<head|<body)/i.test(buf.subarray(0, 512).toString('utf8'));

/** Extracts text from a fetched source. Returns { text, kind: 'pdf'|'html'|'text', title, pages? }. */
export async function extractSourceText(buffer, mime = '') {
  if (isPdf(buffer, mime)) {
    const r = await pdfToText(buffer);
    return { text: r.text, kind: 'pdf', title: r.title, pages: r.pages };
  }
  const str = buffer.toString('utf8');
  if (isHtml(buffer, mime)) return { text: htmlToText(str), kind: 'html', title: htmlTitle(str) };
  return { text: str.replace(/\r\n?/g, '\n').trim(), kind: 'text', title: '' };
}

// =====================================================================================================================
// Source manifest (what the engine itself fetched)
// =====================================================================================================================

/** Where fetched sources live: SOURCES_DIR, else $WORK/sources, else <OUT_DIR>/work/sources. */
export function defaultSourcesDir() {
  const env = (n) => (process.env[n] && String(process.env[n]).trim()) || '';
  if (env('SOURCES_DIR')) return path.resolve(env('SOURCES_DIR'));
  if (env('WORK')) return path.resolve(env('WORK'), 'sources');
  return path.join(config.outDir, 'work', 'sources');
}

const manifestFile = (dir) => path.join(dir, 'manifest.json');

export async function loadManifest(dir) {
  try {
    const m = JSON.parse(await fs.readFile(manifestFile(dir), 'utf8'));
    return { version: 1, sources: Array.isArray(m.sources) ? m.sources : [] };
  } catch (err) {
    if (err.code === 'ENOENT') return { version: 1, sources: [] };
    throw new Error(`cannot read ${manifestFile(dir)}: ${err.message}`);
  }
}

async function saveManifest(dir, m) {
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${manifestFile(dir)}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(m, null, 2));
  await fs.rename(tmp, manifestFile(dir));
}

/** URL identity for lookups: lowercase scheme/host, no fragment, no trailing slash on the path. */
export function urlKey(u) {
  try {
    const x = new URL(String(u).trim());
    x.hash = '';
    x.hostname = x.hostname.toLowerCase();
    let s = x.href;
    if (s.endsWith('/') && x.pathname !== '/') s = s.slice(0, -1);
    return s;
  } catch {
    return String(u ?? '').trim();
  }
}

/**
 * Records a fetched source: raw bytes at <dir>/<sha>.<ext>, extracted text at <dir>/<sha>.txt, one manifest entry.
 * `origin` is 'fetch' (downloaded now) or 'stored:<storage path>' (restored from an earlier verified version).
 */
export async function recordSource(dir, { url, finalUrl, buffer, mime, origin = 'fetch', fetchedAt, text: knownText, title: knownTitle, sha: knownSha }) {
  await fs.mkdir(dir, { recursive: true });
  // identity: sha256 of the bytes the engine downloaded (a restored text keeps the sha of its original download)
  const sha = knownSha || sha256(buffer);
  const pdf = isPdf(buffer, mime);
  const ext = knownText !== undefined ? '.txt' : pdf ? '.pdf' : isHtml(buffer, mime) ? '.html' : '.txt';
  const rawName = knownText !== undefined ? `${sha}.raw.txt` : `${sha}${ext}`;
  await fs.writeFile(path.join(dir, rawName), buffer);
  const ex = knownText !== undefined ? { text: knownText, kind: 'text', title: knownTitle || '' } : await extractSourceText(buffer, mime);
  const text = ex.text;
  const textName = `${sha}.txt`;
  await fs.writeFile(path.join(dir, textName), text);
  const entry = {
    url: String(url),
    final_url: finalUrl && finalUrl !== url ? String(finalUrl) : undefined,
    sha256: sha,
    mime: mime || (pdf ? 'application/pdf' : 'text/html'),
    kind: ex.kind,
    bytes: buffer.length,
    raw_file: rawName,
    raw_file_sha256: sha256(buffer),
    text_file: textName,
    text_sha256: sha256(Buffer.from(text, 'utf8')),
    text_chars: text.length,
    pages: ex.pages,
    title: (knownTitle || ex.title || '').slice(0, 300),
    fetched_at: fetchedAt || new Date().toISOString(),
    origin,
  };
  const m = await loadManifest(dir);
  m.sources = m.sources.filter((s) => !(urlKey(s.url) === urlKey(entry.url) && s.sha256 === entry.sha256));
  m.sources.push(entry);
  await saveManifest(dir, m);
  return entry;
}

/** The newest manifest entry for a URL (or the one with `sha`), checked against its files' hashes. */
export async function resolveSource(dir, url, { sha } = {}) {
  const m = await loadManifest(dir);
  const key = urlKey(url);
  const hits = m.sources.filter((s) => (urlKey(s.url) === key || (s.final_url && urlKey(s.final_url) === key)) && (!sha || s.sha256 === sha));
  if (!hits.length) return { error: `not fetched by the engine (no entry in ${manifestFile(dir)}); run: node src/cli.js fetch-source "${url}"` };
  hits.sort((a, b) => String(b.fetched_at).localeCompare(String(a.fetched_at)));
  const e = hits[0];
  let raw;
  let text;
  try {
    raw = await fs.readFile(path.join(dir, e.raw_file));
    text = await fs.readFile(path.join(dir, e.text_file), 'utf8');
  } catch (err) {
    return { error: `fetched file missing in ${dir} (${err.code || err.message}); fetch it again` };
  }
  if (sha256(raw) !== (e.raw_file_sha256 || e.sha256)) return { error: `fetched file ${e.raw_file} was changed after the engine fetched it (sha256 mismatch); fetch it again` };
  if (sha256(Buffer.from(text, 'utf8')) !== e.text_sha256) return { error: `extracted text ${e.text_file} was changed after the engine fetched it (sha256 mismatch); fetch it again` };
  return { entry: e, text, textPath: path.join(dir, e.text_file) };
}

// =====================================================================================================================
// Tokens: numbers, dates, financial years, law references, document ids
// =====================================================================================================================

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH_RE = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
const monthNo = (s) => {
  const k = String(s).toLowerCase().slice(0, 3);
  const i = MONTHS.findIndex((m) => m.startsWith(k));
  return i >= 0 ? i + 1 : null;
};
const UNITS = { zero: 0, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const ORD_UNITS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20, thirtieth: 30 };
const ORD_WORD = '(?:(?:twenty|thirty)[- ](?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|thirtieth)';
function ordWordValue(w) {
  const s = w.toLowerCase().replace(' ', '-');
  if (ORD_UNITS[s]) return ORD_UNITS[s];
  const [t, u] = s.split('-');
  return (TENS[t] || 0) + (ORD_UNITS[u] || 0);
}
const NUM_WORD = new RegExp(`\\b(?:(${Object.keys(TENS).join('|')})(?:-(${['one', ...Object.keys(UNITS).filter((k) => UNITS[k] < 10 && UNITS[k] > 0)].join('|')}))?|(${Object.keys(UNITS).join('|')})|(hundred|thousand))\\b`, 'gi');

const normNum = (s) => {
  const t = String(s).replace(/,/g, '');
  const n = Number(t);
  if (!Number.isFinite(n)) return t;
  return String(n);
};

/**
 * Extracts fact tokens from text. Returns [{type:'num'|'date'|'fy'|'law'|'id', key, raw, start, end, ...}].
 * Positions are offsets into normText(text) (the caller passes already-normalised text when it needs offsets).
 * Form names such as GSTR-2B, GSTR-3B or IFF are identifiers, not tokens.
 */
export function extractTokens(input, { quoteMode = false } = {}) {
  const text = String(input ?? '');
  const work = text.split('');
  const tokens = [];
  const mask = (s, e) => {
    for (let i = s; i < e; i++) work[i] = ' ';
  };
  const scan = (re, fn) => {
    const cur = work.join('');
    for (const m of cur.matchAll(re)) {
      const r = fn(m);
      if (r === false) continue;
      mask(m.index, m.index + m[0].length);
    }
  };

  // 1. identifiers that contain digits but are names: GSTR-2B, GSTR-3B, ITC-04, Form GST REG-01, URLs.
  scan(/https?:\/\/\S+/g, () => true);
  scan(/\b[A-Z]{2,}(?:-[A-Z]+)*-?\d+[A-Z]{0,3}\b/g, () => true);
  scan(/\b[A-Z]\d{1,3}\b/g, () => true); // Q24, A1

  // 2. document ids: 193/05/2023-GST, 18/2022, 01/2017-Central Tax
  scan(/\b(\d{1,4})\/(\d{1,4})\/(\d{4})(?:-[A-Za-z()]+(?: [A-Z][a-z]+)?)?\b/g, (m) => {
    const a = +m[1];
    const b = +m[2];
    const pre = text.slice(Math.max(0, m.index - 30), m.index);
    if (a <= 31 && b <= 12 && !/(circular|notification|no\.?|order|instruction)\s*$/i.test(pre)) return false; // a date
    tokens.push({ type: 'id', key: `${a}/${b}/${m[3]}`, raw: m[0], start: m.index, end: m.index + m[0].length });
  });
  scan(/\b(\d{1,4})\/(\d{4})(?:-[A-Za-z()]+)?\b/g, (m) => {
    tokens.push({ type: 'id', key: `${+m[1]}/${m[2]}`, raw: m[0], start: m.index, end: m.index + m[0].length });
  });

  // 3. financial years: 2025-26, FY 2025-26, 2025-2026
  scan(/\b(?:FY\s?)?((?:19|20)\d{2})[-/]((?:19|20)?\d{2})\b/gi, (m) => {
    const y = +m[1];
    const e = m[2].length === 2 ? +m[2] : +m[2].slice(2);
    if ((y + 1) % 100 !== e) return false;
    tokens.push({ type: 'fy', key: String(y), raw: m[0], start: m.index, end: m.index + m[0].length });
  });

  // 4. law references: section 16(2)(aa), sections 16, 37 and 39, rule 60(6A), sub-section (2), clause (aa), s.17(5)
  const LAW = /\b(sections?|sub-sections?|rules?|sub-rules?|clauses?|articles?|paragraphs?|paras?|regulations?|ss?\.)\s*((?:\d+[A-Z]{0,2})?(?:\s?\([0-9a-zA-Z]{1,5}\))*)((?:\s*(?:,|and|or|to)\s*\d+[A-Z]{0,2}(?:\([0-9a-zA-Z]{1,5}\))*)*)/gi;
  scan(LAW, (m) => {
    const first = (m[2] || '').replace(/\s+/g, '');
    if (!first) return false;
    const pushLaw = (ref, start) => {
      const main = (ref.match(/^\d+[A-Z]{0,2}/i) || [''])[0];
      const comps = [...ref.matchAll(/\(([0-9a-zA-Z]{1,5})\)/g)].map((x) => x[1].toLowerCase());
      tokens.push({ type: 'law', key: `${main.toLowerCase()}${comps.map((c) => `(${c})`).join('')}`, main: main.toLowerCase(), comps, raw: ref, start, end: start + ref.length, word: m[1].toLowerCase() });
    };
    const off = m.index + m[0].indexOf(m[2]);
    pushLaw(first, off);
    const tailStart = m.index + m[0].length - (m[3] || '').length;
    if (m[3]) for (const x of m[3].matchAll(/\d+[A-Z]{0,2}(?:\([0-9a-zA-Z]{1,5}\))*/gi)) pushLaw(x[0], tailStart + x.index);
  });

  // 5. dates
  const pushDate = (m, d, mo, y) => tokens.push({ type: 'date', key: [y ?? '', mo ?? '', d ?? ''].join('-'), y: y ?? null, m: mo ?? null, d: d ?? null, raw: m[0], start: m.index, end: m.index + m[0].length });
  scan(/\b((?:19|20)\d{2})-(\d{2})-(\d{2})\b/g, (m) => pushDate(m, +m[3], +m[2], +m[1]));
  scan(/\b(\d{1,2})[./-](\d{1,2})[./-]((?:19|20)\d{2})\b/g, (m) => {
    if (+m[2] > 12 || +m[1] > 31) return false;
    pushDate(m, +m[1], +m[2], +m[3]);
  });
  scan(new RegExp(`\\b(?:the\\s+)?(${ORD_WORD})\\s+day\\s+of\\s+(${MONTH_RE})\\b(?:,?\\s+((?:19|20)\\d{2})\\b)?`, 'gi'), (m) => pushDate(m, ordWordValue(m[1]), monthNo(m[2]), m[3] ? +m[3] : null));
  scan(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:day\\s+)?(?:of\\s+)?(${MONTH_RE})\\.?\\b(?:,?\\s+((?:19|20)\\d{2})\\b)?`, 'gi'), (m) => {
    if (+m[1] < 1 || +m[1] > 31) return false;
    if (/^may$/i.test(m[2]) && !m[3] && !/^\d/.test(m[0])) return false;
    pushDate(m, +m[1], monthNo(m[2]), m[3] ? +m[3] : null);
  });
  scan(new RegExp(`\\b(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+((?:19|20)\\d{2})\\b`, 'gi'), (m) => pushDate(m, +m[2], monthNo(m[1]), +m[3]));
  scan(new RegExp(`\\b(${MONTH_RE})\\.?,?\\s+((?:19|20)\\d{2})\\b`, 'gi'), (m) => pushDate(m, null, monthNo(m[1]), +m[2]));
  // bare month names (capitalised; "May" never bare, it is a verb too) are date tokens in claims; quotes are lenient
  scan(new RegExp(`\\b(January|February|March|April|June|July|August|September|October|November|December)\\b`, quoteMode ? 'gi' : 'g'), (m) => pushDate(m, null, monthNo(m[1]), null));

  // 6. plain numbers (ordinals and %, commas, decimals) and number words
  scan(/(?<![\w.])(\d{1,3}(?:,\d{2,3})+|\d+)(?:\.(\d+))?(?:st|nd|rd|th)?(?![\w])/g, (m) => {
    tokens.push({ type: 'num', key: normNum(m[2] ? `${m[1]}.${m[2]}` : m[1]), raw: m[0], start: m.index, end: m.index + m[0].length });
  });
  scan(NUM_WORD, (m) => {
    let v;
    if (m[1]) v = TENS[m[1].toLowerCase()] + (m[2] ? (m[2].toLowerCase() === 'one' ? 1 : UNITS[m[2].toLowerCase()]) : 0);
    else if (m[3]) v = UNITS[m[3].toLowerCase()];
    else v = m[4].toLowerCase() === 'hundred' ? 100 : 1000;
    tokens.push({ type: 'num', key: String(v), raw: m[0], start: m.index, end: m.index + m[0].length, word: true });
  });
  return tokens.sort((a, b) => a.start - b.start);
}

/** Everything a quote can vouch for: its tokens plus every raw number inside them (date parts, ids, sections). */
export function quoteEvidence(texts) {
  const all = [];
  const nums = new Set();
  const lowers = [];
  for (const t of texts) {
    const n = normText(t);
    lowers.push(n.toLowerCase());
    const toks = extractTokens(n, { quoteMode: true });
    all.push(...toks);
    for (const tok of toks) {
      if (tok.type === 'num') nums.add(tok.key);
      for (const x of String(tok.raw).matchAll(/\d+(?:\.\d+)?/g)) nums.add(normNum(x[0]));
      if (tok.type === 'date') {
        if (tok.y) nums.add(String(tok.y));
        if (tok.d) nums.add(String(tok.d));
      }
      if (tok.type === 'fy') nums.add(String(tok.key));
    }
    for (const x of n.matchAll(/\d+(?:\.\d+)?/g)) nums.add(normNum(x[0]));
  }
  return { tokens: all, nums, text: lowers.join('\n') };
}

/** Is a claim token vouched for by the evidence? */
export function tokenCovered(tok, ev) {
  switch (tok.type) {
    case 'num':
      return ev.nums.has(tok.key);
    case 'date':
      return ev.tokens.some((q) => q.type === 'date' && (tok.y == null || q.y === tok.y) && (tok.m == null || q.m === tok.m) && (tok.d == null || q.d === tok.d))
        || (tok.m == null && tok.d == null && tok.y != null && ev.nums.has(String(tok.y)));
    case 'fy':
      return ev.tokens.some((q) => q.type === 'fy' && q.key === tok.key);
    case 'id':
      return ev.tokens.some((q) => q.type === 'id' && q.key === tok.key);
    case 'law': {
      if (ev.tokens.some((q) => q.type === 'law' && q.key === tok.key)) return true;
      const mainOk = !tok.main || ev.nums.has(normNum(tok.main)) || ev.tokens.some((q) => q.type === 'law' && q.main === tok.main);
      const compsOk = tok.comps.every((c) => ev.text.includes(`(${c})`));
      return mainOk && compsOk;
    }
    default:
      return false;
  }
}

export const tokenLabel = (t) => (t.type === 'law' ? `section/rule ${t.raw}` : t.type === 'id' ? `document no. ${t.raw}` : t.type === 'fy' ? `year ${t.raw}` : t.type === 'date' ? `date "${t.raw}"` : `number "${t.raw}"`);

// =====================================================================================================================
// The post as plain text (paragraph units with offsets) and its sentences
// =====================================================================================================================

/**
 * Splits markdown into plain-text units: [{kind:'p'|'li'|'heading'|'quote', text, section, start, end}] and the
 * joined plain text ("\n\n" between units). Uses marked's lexer (the website's markdown library).
 */
export async function postUnits(markdown) {
  const markedPath = require.resolve('marked');
  const mk = await import(pathToFileURL(markedPath).href);
  const marked = mk.marked || mk.default?.marked || mk.default;
  const tokens = marked.lexer(String(markdown ?? ''));
  const units = [];
  let section = 0;
  const inline = (raw) => normText(stripInlineMarkdown(String(raw ?? '').replace(/\n/g, ' ')));
  const walk = (toks, ctx) => {
    for (const t of toks) {
      if (t.type === 'heading') {
        if (t.depth === 2) section += 1;
        units.push({ kind: 'heading', text: inline(t.text), section });
      } else if (t.type === 'paragraph' || t.type === 'text') {
        if (t.tokens && t.type === 'text' && t.tokens.some((x) => x.type === 'paragraph')) walk(t.tokens, ctx);
        else units.push({ kind: ctx, text: inline(t.text ?? t.raw), section });
      } else if (t.type === 'list') {
        for (const it of t.items) walk(it.tokens || [{ type: 'text', text: it.text }], 'li');
      } else if (t.type === 'blockquote') {
        walk(t.tokens || [], 'quote');
      } else if (t.type === 'code') {
        units.push({ kind: ctx, text: normText(t.text), section });
      } else if (t.type === 'table') {
        for (const row of [t.header, ...(t.rows || [])]) units.push({ kind: 'p', text: inline(row.map((c) => c.text).join(' | ')), section });
      }
    }
  };
  walk(tokens, 'p');
  // Bold FAQ questions are their own paragraphs in the source ("**Q?**\nAnswer"): split a leading bold question.
  const out = [];
  for (const u of units.filter((x) => x.text)) out.push(u);
  let plain = '';
  for (const u of out) {
    if (plain) plain += '\n\n';
    u.start = plain.length;
    plain += u.text;
    u.end = plain.length;
  }
  return { units: out, plain };
}

const ABBREV = new Set(['no', 'nos', 's', 'ss', 'e.g', 'i.e', 'rs', 'vs', 'etc', 'dr', 'mr', 'mrs', 'ms', 'st', 'pvt', 'co', 'inc', 'approx', 'cf', 'fig', 'art', 'para', 'sec', 'vol', 'p', 'pp', 'u.s', 'u.k', 'w.e.f', 'viz', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec']);

/** Sentences of one unit: [{text, start, end}] with offsets relative to the unit. */
export function splitSentences(text) {
  const out = [];
  let start = 0;
  const re = /[.?!]["')\]]*(\s+)(?=["'(\[]?[A-Z0-9₹])/g;
  for (const m of text.matchAll(re)) {
    const endPunct = m.index + m[0].length - m[1].length;
    const before = text.slice(start, m.index + 1);
    const lastWord = (before.match(/([A-Za-z][A-Za-z.]*)\.$/) || [])[1];
    if (lastWord && (ABBREV.has(lastWord.toLowerCase()) || /^[A-Z]$/.test(lastWord))) continue;
    if (/\d\.$/.test(before) && /^\s+\d/.test(text.slice(m.index + 1))) continue;
    out.push({ text: text.slice(start, endPunct).trim(), start, end: endPunct });
    start = m.index + m[0].length;
  }
  if (start < text.length) out.push({ text: text.slice(start).trim(), start, end: text.length });
  return out.filter((s) => s.text);
}

const TRIGGER_CI = /\b(sections?|sub-sections?|circulars?|notifications?|gstr|ims|cbic|cbdt|gstn|rbi|dgca|iata|sebi|must|mandatory|compulsory|deadlines?|according to|survey(?:ed)?|study|studies|report(?:ed|s)? that|per ?cent|percent|lakh|crore|million|billion|rs\.?|inr|statutory|penalt(?:y|ies)|fine[sd]?|interest at|gazette)\b/i;
const TRIGGER_CS = /\b(Act|Acts|Rules?|Ministry|Council|Court|Tribunal|Board)\b|[%₹$€£]|\d/;
const MONTH_WORD = /\b(January|February|March|April|June|July|August|September|October|November|December)\b|\bMay\s+\d|\d\s+May\b/;
const QUOTE_MARKS = /"[^"]{12,}"/;

/** Why a sentence looks factual (empty string = it does not). */
export function factualReason(sentence, { heading = false } = {}) {
  const s = sentence;
  const noIds = s.replace(/\b[A-Z]{2,}(?:-[A-Z]+)*-?\d+[A-Z]{0,3}\b/g, ' ');
  if (/\d/.test(heading ? noIds : s)) return 'number';
  if (/[%₹]/.test(s)) return 'percent/money';
  if (MONTH_WORD.test(s)) return 'date';
  if (heading) return '';
  if (QUOTE_MARKS.test(s)) return 'quotation';
  const m = s.match(TRIGGER_CI) || s.match(TRIGGER_CS);
  return m ? `"${m[0]}"` : '';
}

const ILLUSTRATIVE_MARKER = /\b(for example|for instance|illustrative|illustration|example:|hypothetical)/i;
const RELATIVE_TIME = /\b(recently|recent months|recent years|this year|last year|next year|this financial year|this fiscal|currently|at present|presently|nowadays|these days|as of now|as of today|so far this|this week|this month|in the coming (?:weeks|months)|upcoming|latest (?:rules?|changes?|circular|notification|update))\b/i;

// =====================================================================================================================
// Verification
// =====================================================================================================================

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v && Array.isArray(v.claims)) return v.claims;
  return null;
}

const excerpt = (s, n = 90) => {
  const t = normText(s);
  return t.length > n ? `${t.slice(0, n - 3)}...` : t;
};

/** Finds a quote in source text: 'exact' | 'loose' | null, plus the longest matching word prefix for diagnostics. */
export function findQuote(quote, text) {
  const q = strictForm(quote);
  const t = strictForm(text);
  if (q && t.includes(q)) return { match: 'exact' };
  const lq = looseForm(quote);
  if (lq && looseForm(text).includes(lq)) return { match: 'loose' };
  const words = normText(quote).split(' ');
  const lt = looseForm(text);
  let best = 0;
  for (let n = Math.min(words.length - 1, 40); n >= 3; n--) {
    if (lt.includes(looseForm(words.slice(0, n).join(' ')))) {
      best = n;
      break;
    }
  }
  return { match: null, prefixWords: best, prefix: words.slice(0, best).join(' ') };
}

/**
 * Verifies a claims ledger against a post. Returns
 * { passed, messages, warnings, stats, claims: [verified claim + sha256/text_sha256/text_file/match] }.
 * opts: { markdown, frontmatter, faq, sourcesDir, publishDate }
 */
export async function verifyClaims(claimsInput, { markdown, frontmatter = {}, faq = [], sourcesDir = defaultSourcesDir() } = {}) {
  const errors = [];
  const warnings = [];
  const claims = asArray(claimsInput);
  if (!claims) return { passed: false, messages: ['claims must be a JSON array (or {"claims": [...]})'], warnings, stats: {}, claims: [] };
  if (!claims.length) errors.push('claims is empty: every factual sentence of the post needs a claim');

  const { units, plain } = await postUnits(markdown);
  const lowerPlain = plain.toLowerCase();
  const verified = [];
  const intervals = []; // [start, end, claimIndex]
  const ids = new Set();
  const sourceCache = new Map();

  const getSource = async (url) => {
    if (!sourceCache.has(url)) sourceCache.set(url, await resolveSource(sourcesDir, url));
    return sourceCache.get(url);
  };

  for (const [i, c] of claims.entries()) {
    const label = `claim ${c && c.id != null ? JSON.stringify(String(c.id)) : `#${i + 1}`}`;
    const err = (msg) => errors.push(`${label}: ${msg}`);
    if (!c || typeof c !== 'object' || Array.isArray(c)) {
      err('must be an object');
      continue;
    }
    const id = String(c.id ?? '').trim();
    if (!id) err('id is required');
    else if (ids.has(id)) err('duplicate id');
    ids.add(id);
    const kind = String(c.kind ?? '').trim();
    if (!CLAIM_KINDS.includes(kind)) {
      err(`kind must be one of ${CLAIM_KINDS.join(', ')}`);
      continue;
    }
    const claimText = normText(stripInlineMarkdown(c.claim_text ?? ''));
    if (wordCount(claimText) < 2) {
      err('claim_text is required (the exact sentence or span from the post)');
      continue;
    }

    // (1) claim_text is in the post
    const needle = claimText.toLowerCase();
    const occ = [];
    for (let at = lowerPlain.indexOf(needle); at >= 0; at = lowerPlain.indexOf(needle, at + 1)) occ.push(at);
    if (!occ.length) err(`claim_text not found in the post: "${excerpt(claimText)}" (copy it exactly from the post, markdown removed)`);
    for (const at of occ) intervals.push([at, at + needle.length, i]);

    const out = { id, kind, claim_text: claimText };
    const claimTokens = extractTokens(claimText);

    if (kind === 'illustrative' || kind === 'advice') {
      if (c.source_url || c.quote) err(`${kind} claims have no source_url or quote (a sourced fact is kind fact, law, stat, date or quote)`);
      if (kind === 'advice') {
        const note = normText(c.note ?? '');
        if (wordCount(note) < 3) err('advice claims need a "note" saying why this is a recommendation or process step and not a fact');
        const bad = claimTokens.filter((t) => t.type === 'law' || t.type === 'id' || t.type === 'fy' || (t.type === 'date' && t.y != null) || (t.type === 'num' && Number(t.key) > 100));
        if (/[%₹]|\b(per ?cent|percent|rs\.?|inr|lakh|crore|million|billion)\b/i.test(claimText)) bad.push({ raw: '%/money', type: 'x' });
        if (bad.length) err(`advice cannot carry facts (${bad.map((t) => t.raw).join(', ')}); split the sentence and cite the fact as a sourced claim`);
        out.note = note;
      }
      out.verified = errors.every((e) => !e.startsWith(`${label}:`));
      out.occurrences = occ;
      verified.push(out);
      continue;
    }

    // sourced kinds
    const quotes = [{ source_url: c.source_url, quote: c.quote, source_title: c.source_title }];
    if (c.extra_quotes !== undefined) {
      if (!Array.isArray(c.extra_quotes)) err('extra_quotes must be an array of {source_url, quote}');
      else quotes.push(...c.extra_quotes);
    }
    if (!normText(c.source_title ?? '')) err('source_title is required ("Publisher: page title (Mon YYYY)")');
    const evidenceTexts = [];
    const sourcesOut = [];
    for (const [qi, q] of quotes.entries()) {
      const qlabel = qi === 0 ? '' : ` (extra_quotes[${qi - 1}])`;
      const url = String(q?.source_url ?? '').trim();
      if (!/^https:\/\//i.test(url)) {
        err(`source_url${qlabel} must be an https URL`);
        continue;
      }
      const quote = normText(q?.quote ?? '');
      const wc = wordCount(quote);
      if (wc < QUOTE_MIN_WORDS || wc > QUOTE_MAX_WORDS) {
        err(`quote${qlabel} must be ${QUOTE_MIN_WORDS} to ${QUOTE_MAX_WORDS} words copied verbatim from the source (got ${wc})`);
        continue;
      }
      // (2) fetched by the engine
      const src = await getSource(url);
      if (src.error) {
        err(`source ${url}${qlabel}: ${src.error}`);
        continue;
      }
      // (3) quote in the fetched text
      const found = findQuote(quote, src.text);
      if (!found.match) {
        err(`quote${qlabel} is not in the fetched text of ${url} (sha256 ${src.entry.sha256.slice(0, 12)})${found.prefixWords ? `; only the first ${found.prefixWords} words match ("${excerpt(found.prefix, 60)}")` : ''}. Copy the quote verbatim from that page, or cite the page that says it`);
        continue;
      }
      if (kind === 'law' && !PRIMARY_HOST.test(new URL(url).hostname)) err(`law claims must cite a primary source (a government, regulator or gazette site), not ${new URL(url).hostname}`);
      if (kind === 'stat' && !PRIMARY_HOST.test(new URL(url).hostname)) warnings.push(`${label}: market stat from ${new URL(url).hostname}; the sentence must name who published it`);
      evidenceTexts.push(quote);
      sourcesOut.push({
        source_url: url,
        source_title: normText(q.source_title ?? c.source_title ?? src.entry.title ?? ''),
        quote,
        fetched_at: src.entry.fetched_at,
        sha256: src.entry.sha256,
        text_sha256: src.entry.text_sha256,
        local_text: src.textPath,
        match: found.match,
      });
      if (qi === 0 && c.fetched_at && String(c.fetched_at).slice(0, 10) !== String(src.entry.fetched_at).slice(0, 10)) warnings.push(`${label}: fetched_at ${c.fetched_at} differs from the engine's fetch (${src.entry.fetched_at}); the engine's time is stored`);
    }

    // (4) tokens of the claim are in the quote(s), or derived with the arithmetic shown
    if (evidenceTexts.length === quotes.length) {
      const ev = quoteEvidence(evidenceTexts);
      const missing = claimTokens.filter((t) => !tokenCovered(t, ev));
      if (missing.length) {
        const arithmetic = normText(c.derived?.arithmetic ?? '');
        if (!c.derived) err(`${missing.map(tokenLabel).join(', ')} not in the quote; quote the passage that states it, or mark the claim "derived" with the arithmetic`);
        else if (wordCount(arithmetic) < 3) err('derived.arithmetic must show the working (for example "30 November 2026 = 30 November after FY 2025-26 ends")');
        else {
          const aev = quoteEvidence([arithmetic]);
          const still = missing.filter((t) => !tokenCovered(t, aev));
          if (still.length) err(`${still.map(tokenLabel).join(', ')} is neither in the quote nor in derived.arithmetic`);
          out.derived = { arithmetic, from: Array.isArray(c.derived.from) ? c.derived.from.map(String) : [] };
        }
      } else if (c.derived) out.derived = { arithmetic: normText(c.derived.arithmetic ?? ''), from: Array.isArray(c.derived.from) ? c.derived.from.map(String) : [] };
      if (kind === 'quote') {
        const inner = [...claimText.matchAll(/"([^"]{8,})"/g)].map((m) => m[1]);
        if (!inner.length) err('kind quote: claim_text must contain the quoted words in "double quotes"');
        for (const w of inner) if (!evidenceTexts.some((q) => findQuote(w, q).match)) err(`quoted words "${excerpt(w, 60)}" are not in the source quote`);
      }
    }
    if (c.derived && Array.isArray(c.derived.from)) for (const f of c.derived.from) if (!claims.some((x) => String(x?.id) === String(f))) err(`derived.from names unknown claim "${f}"`);

    Object.assign(out, sourcesOut[0] || { source_url: c.source_url, source_title: c.source_title, quote: normText(c.quote ?? '') });
    if (sourcesOut.length > 1) out.extra_quotes = sourcesOut.slice(1);
    out.verified = errors.every((e) => !e.startsWith(`${label}:`));
    out.occurrences = occ;
    verified.push(out);
  }

  // illustrative claims must sit in a marked run of paragraphs (marker paragraph, then the following paragraphs of
  // the same section that also hold illustrative claims)
  const unitOf = (pos) => units.findIndex((u) => pos >= u.start && pos < u.end + 1);
  const illusUnits = new Set();
  for (const [a, , ci] of intervals) if (claims[ci]?.kind === 'illustrative') illusUnits.add(unitOf(a));
  const inRun = new Set();
  for (let k = 0; k < units.length; k++) {
    if (!illusUnits.has(k) || !ILLUSTRATIVE_MARKER.test(units[k].text)) continue;
    inRun.add(k);
    for (let j = k + 1; j < units.length && units[j].section === units[k].section && illusUnits.has(j); j++) inRun.add(j);
  }
  for (const [a, , ci] of intervals) {
    if (claims[ci]?.kind !== 'illustrative') continue;
    const k = unitOf(a);
    if (!inRun.has(k)) errors.push(`claim ${JSON.stringify(String(claims[ci].id))}: illustrative example is not labelled; start its paragraph with "For example" or "Illustrative" (or put it right after such a paragraph)`);
  }

  // (5) detector: factual-looking sentences that no claim covers
  const covered = (s, e) => intervals.some(([a, b]) => a <= s && b >= e);
  let factual = 0;
  let coveredCount = 0;
  const uncovered = [];
  for (const [k, u] of units.entries()) {
    // relative time outside a labelled example
    if (!inRun.has(k) && RELATIVE_TIME.test(u.text)) errors.push(`relative date "${u.text.match(RELATIVE_TIME)[0]}" in "${excerpt(u.text)}": write the absolute date ("As of 1 December 2026", "in 2026-27")`);
    for (const s of splitSentences(u.text)) {
      const gs = u.start + s.start;
      const ge = u.start + s.end;
      const heading = u.kind === 'heading';
      const isQuestion = /\?["')\]]*$/.test(s.text);
      const reason = factualReason(s.text, { heading: heading || isQuestion });
      if (!reason) continue;
      factual += 1;
      const toks = extractTokens(normText(s.text));
      const tokOk = toks.every((t) => covered(gs + t.start, gs + t.end));
      let chars = 0;
      let cov = 0;
      for (let p = gs; p < ge; p++) {
        if (!/[\p{L}\p{N}]/u.test(plain[p])) continue;
        chars += 1;
        if (intervals.some(([a, b]) => a <= p && p < b)) cov += 1;
      }
      const okShare = chars === 0 || cov / chars >= 0.8;
      if (tokOk && okShare) coveredCount += 1;
      else uncovered.push(`${heading ? 'heading' : 'sentence'} with ${reason} has no claim${!tokOk ? ` (uncovered: ${toks.filter((t) => !covered(gs + t.start, gs + t.end)).map((t) => t.raw).join(', ')})` : ''}: "${excerpt(s.text, 120)}"`);
    }
  }
  for (const msg of uncovered) errors.push(msg);

  // numbers in the title / description / imageAlt / FAQ must be backed by a sourced claim
  const sourcedEvidence = quoteEvidence(verified.filter((v) => SOURCED_KINDS.includes(v.kind) && v.verified).map((v) => v.claim_text));
  const extra = [['title', frontmatter.title], ['description', frontmatter.description], ['imageAlt', frontmatter.imageAlt]];
  for (const [n, f] of (Array.isArray(faq) ? faq : []).entries()) extra.push([`faq[${n}]`, `${f?.q ?? f?.question ?? ''} ${f?.a ?? f?.answer ?? ''}`]);
  for (const [name, value] of extra) {
    if (!value) continue;
    const toks = extractTokens(normText(value));
    const miss = toks.filter((t) => !tokenCovered(t, sourcedEvidence));
    if (miss.length) errors.push(`${name}: ${miss.map(tokenLabel).join(', ')} is not backed by any sourced claim in the post`);
  }

  const stats = {
    claims: claims.length,
    sourced: verified.filter((v) => SOURCED_KINDS.includes(v.kind)).length,
    illustrative: verified.filter((v) => v.kind === 'illustrative').length,
    advice: verified.filter((v) => v.kind === 'advice').length,
    verified: verified.filter((v) => v.verified).length,
    factual_sentences: factual,
    covered_sentences: coveredCount,
    sources: new Set(verified.flatMap((v) => [v.source_url, ...(v.extra_quotes || []).map((x) => x.source_url)]).filter(Boolean)).size,
  };
  const passed = errors.length === 0;
  return { passed, messages: errors, warnings, stats, claims: verified };
}

/** Claims as stored in body.claims (no local paths). textPaths: Map sha256 -> storage path. */
export function storedClaims(verified, textPaths) {
  const clean = (q) => ({ source_url: q.source_url, source_title: q.source_title, quote: q.quote, fetched_at: q.fetched_at, sha256: q.sha256, text_sha256: q.text_sha256, source_text_path: textPaths.get(q.sha256) ?? null, match: q.match });
  return verified.map((v) => {
    const out = { id: v.id, kind: v.kind, claim_text: v.claim_text, verified: Boolean(v.verified) };
    if (SOURCED_KINDS.includes(v.kind)) Object.assign(out, clean(v));
    if (v.extra_quotes) out.extra_quotes = v.extra_quotes.map(clean);
    if (v.derived) out.derived = v.derived;
    if (v.note) out.note = v.note;
    return out;
  });
}

/** Every local source text a verified ledger relies on: [{sha256, local_text}] (unique). */
export function usedSources(verified) {
  const map = new Map();
  for (const v of verified) for (const q of [v, ...(v.extra_quotes || [])]) if (q.sha256 && q.local_text) map.set(q.sha256, q.local_text);
  return [...map].map(([sha, local]) => ({ sha256: sha, local_text: local }));
}

export const sourcesDirExists = (dir) => existsSync(manifestFile(dir));
