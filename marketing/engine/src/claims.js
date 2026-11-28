// Claims ledger for the engine CLI (Node): the shared rules of claims-core.js plus the local source cache.
//
// The rules themselves live in claims-core.js, which the engine Edge Function runs too (an exact copy at
// supabase/functions/engine/claims-core.js), so the server re-checks every blog with the same code before the owner
// sees it. This file adds what only the CLI needs: PDF text extraction with unpdf, the local manifest of sources
// (<sources dir>/manifest.json), and verifyClaims() over that manifest.
//
// Sources: `cli.js fetch-source <url>` asks the engine server to fetch the URL (it keeps the bytes, sha256 and text
// under sources/<sha256>/ in storage, where a session cannot write), then downloads those exact bytes into the local
// manifest. Only server-fetched sources pass the server's check; local-only entries (origin "fetch") exist for
// DRY_RUN tests.
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import * as core from './claims-core.js';

export * from './claims-core.js';
const { normText, htmlToText, htmlTitle, pdfText, splitPdfText, urlKey, pdfPageText } = core;

const require = createRequire(import.meta.url);
export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

// =====================================================================================================================
// Source text extraction (HTML, PDF, plain text)
// =====================================================================================================================

let unpdfMod = null;
let markedMod = null;
async function loadUnpdf() {
  if (unpdfMod) return unpdfMod;
  unpdfMod = await import(pathToFileURL(require.resolve('unpdf')).href);
  return unpdfMod;
}
export async function markedLexer() {
  if (!markedMod) {
    const mk = await import(pathToFileURL(require.resolve('marked')).href);
    markedMod = mk.marked || mk.default?.marked || mk.default;
  }
  return (src) => markedMod.lexer(src);
}

async function quietly(fn) {
  const origWarn = console.warn;
  const origLog = console.log;
  console.warn = () => {}; // pdf.js prints font warnings to the console; stdout must stay one JSON value
  console.log = () => {};
  try {
    return await fn();
  } finally {
    console.warn = origWarn;
    console.log = origLog;
  }
}

/** PDF page texts (sparse array, index = page - 1) for the given 1-based pages, or all pages. Same text as the server. */
export async function pdfPages(buffer, pages = null) {
  const { getDocumentProxy } = await loadUnpdf();
  return quietly(async () => {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const out = [];
    const want = pages && pages.length ? pages : Array.from({ length: pdf.numPages }, (_, i) => i + 1);
    for (const n of want) {
      if (!Number.isInteger(n) || n < 1 || n > pdf.numPages) continue;
      const tc = await (await pdf.getPage(n)).getTextContent();
      out[n - 1] = pdfPageText(tc.items);
    }
    return { pages: out, total: pdf.numPages };
  });
}

/** PDF to text: { text ("[page N]" blocks), pages (count), title }. */
export async function pdfToText(buffer) {
  const { getDocumentProxy, getMeta } = await loadUnpdf();
  const { pages, total } = await pdfPages(buffer);
  let title = '';
  try {
    await quietly(async () => {
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const meta = typeof getMeta === 'function' ? await getMeta(pdf) : null;
      title = normText(meta?.info?.Title || '').slice(0, 300);
    });
  } catch {
    /* no metadata */
  }
  return { text: pdfText(pages), pages: total, title };
}

export const isPdf = (buf, mime = '') => /pdf/i.test(mime) || (buf?.length > 4 && buf.subarray(0, 5).toString('latin1') === '%PDF-');
const isHtml = (buf, mime = '') => /html|xml/i.test(mime) || /^\s*(<!doctype html|<html|<\?xml|<head|<body)/i.test(buf.subarray(0, 512).toString('utf8'));
export const sourceKind = (buf, mime = '') => (isPdf(buf, mime) ? 'pdf' : isHtml(buf, mime) ? 'html' : 'text');

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
// Source manifest (what the engine fetched)
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

export { urlKey };

/**
 * Records a fetched source: raw bytes at <dir>/<sha>.<ext>, extracted text at <dir>/<sha>.txt, one manifest entry.
 * origin: 'server' (the engine server fetched it; `server` holds its meta and storage paths) or 'fetch' (local only,
 * DRY_RUN tests).
 */
export async function recordSource(dir, { url, finalUrl, buffer, mime, origin = 'fetch', fetchedAt, server = null }) {
  await fs.mkdir(dir, { recursive: true });
  const sha = sha256(buffer);
  const kind = sourceKind(buffer, mime);
  const rawName = `${sha}.${kind === 'pdf' ? 'pdf' : kind === 'html' ? 'html' : 'raw.txt'}`;
  await fs.writeFile(path.join(dir, rawName), buffer);
  const ex = await extractSourceText(buffer, mime);
  const text = ex.text;
  const textName = `${sha}.txt`;
  await fs.writeFile(path.join(dir, textName), text);
  const entry = {
    url: String(url),
    final_url: finalUrl && finalUrl !== url ? String(finalUrl) : undefined,
    sha256: sha,
    mime: mime || (kind === 'pdf' ? 'application/pdf' : 'text/html'),
    kind: ex.kind,
    bytes: buffer.length,
    raw_file: rawName,
    raw_file_sha256: sha,
    text_file: textName,
    text_sha256: sha256(Buffer.from(text, 'utf8')),
    text_chars: text.length,
    pages: ex.pages,
    title: (server?.title || ex.title || '').slice(0, 300),
    fetched_at: fetchedAt || new Date().toISOString(),
    origin,
    ...(server ? { raw_path: server.raw_path, text_path: server.text_path ?? null } : {}),
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
  const localText = path.join(dir, e.text_file);
  if (e.kind === 'pdf') return { entry: e, kind: 'pdf', text, pages: splitPdfText(text), localText };
  return { entry: e, kind: e.kind, text, localText };
}

/**
 * Verifies a claims ledger against a post using the local manifest (the server repeats this with its own copies).
 * opts: { markdown, frontmatter, faq, sourcesDir, requireFactcheck (default false: check-blog runs before the fact-check) }
 */
export async function verifyClaims(claimsInput, { markdown, frontmatter = {}, faq = [], sourcesDir = defaultSourcesDir(), requireFactcheck = false } = {}) {
  const lexer = await markedLexer();
  const getSource = (url, { sha } = {}) => resolveSource(sourcesDir, url, { sha });
  return core.verifyLedger(claimsInput, { markdown, frontmatter, faq, lexer, getSource, hash: (s) => sha256(s), requireFactcheck });
}

/** Merges fact-check verdicts ([{id, claim_hash, verdict, note, current?}]) into a claims list by id. */
export function mergeFactcheck(claims, verdicts) {
  const list = Array.isArray(verdicts) ? verdicts : Array.isArray(verdicts?.verdicts) ? verdicts.verdicts : null;
  if (!list) throw new Error('factcheck must be a JSON array of {id, claim_hash, verdict, note, current?}');
  const byId = new Map(list.filter((v) => v && v.id != null).map((v) => [String(v.id), v]));
  return claims.map((c) => {
    const v = byId.get(String(c?.id));
    if (!v) return c;
    return { ...c, factcheck: { verdict: v.verdict, note: v.note, current: v.current === true, claim_hash: v.claim_hash, checked_at: v.checked_at || new Date().toISOString() } };
  });
}

/** The sheet the independent fact-checker fills in: one row per claim with its hash and what to check. */
export function factcheckSheet(claims) {
  return claims.map((c) => ({
    id: c?.id,
    kind: c?.kind,
    claim_text: c?.claim_text,
    source_url: c?.source_url ?? null,
    quote: c?.quote ?? null,
    extra_quotes: c?.extra_quotes ?? undefined,
    derived: c?.derived ?? undefined,
    advice_note: c?.note ?? undefined,
    claim_hash: sha256(core.claimFingerprint(c)),
    verdict: '',
    note: '',
    current: SOURCED_KINDS_LAWISH(c) ? false : undefined,
  }));
}
const SOURCED_KINDS_LAWISH = (c) => core.SOURCED_KINDS.includes(c?.kind) && (c.kind === 'law' || core.LAW_NAME.test(String(c?.claim_text ?? '')) || core.extractTokens(normText(c?.claim_text ?? '')).some((t) => t.type === 'law' || t.type === 'id'));

export const sourcesDirExists = (dir) => existsSync(manifestFile(dir));
