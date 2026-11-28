// Headless Chromium rendering shared by carousel, graphic and video overlays.
//
// - One browser per process (lazy), one context+page per render batch.
// - Fonts: the bundled Inter variable font (templates/fonts, SIL OFL) is embedded as a data URI so renders are
//   identical on a laptop, in a Claude cloud session and in GitHub Actions, with no network. If the file is
//   missing we fall back to the Google Fonts stylesheet, then to system-ui.
// - Every render waits for document.fonts.ready and for every <img> to decode, then runs the auto-fit pass
//   (shrinks text inside [data-fit-box] until nothing overflows) before taking the screenshot.
// - Photos are local stock files; they are downscaled with sharp (max 2160px long edge) before embedding.
import fs from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { config } from '../config.js';
import { log } from '../log.js';
import { escapeHtml } from '../util.js';

export const FONT_FAMILY = 'DhitiInter';
export const FONT_STACK = `'${FONT_FAMILY}', 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;
/** Inter stylistic sets used for the SF-like look (open digits + single-storey a). One place to change it. */
export const FONT_FEATURES = `'ss01', 'cv11', 'kern', 'calt'`;

const TEMPLATES_DIR = config.templatesDir;
const FONT_FILE = path.join(TEMPLATES_DIR, 'fonts', 'InterVariable.woff2');
const GOOGLE_FONTS_CSS = 'https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400..800&display=block';

// ---------------------------------------------------------------------------------------------
// Brand
// ---------------------------------------------------------------------------------------------

export const DEFAULT_COLORS = Object.freeze({
  red: '#EE0800',
  redDeep: '#C20600',
  redBright: '#FF3322',
  ink: '#15161A',
  inkSoft: '#3a3d45',
  inkMute: '#6b6f7a',
  white: '#FFFFFF',
  paper: '#FAF7F2',
});

const COLOR_ALIASES = {
  red: ['red', 'brand', 'brandRed', 'brand_red', 'primary', 'accent'],
  redDeep: ['redDeep', 'red_deep', 'deep', 'brandDeep', 'red-deep'],
  redBright: ['redBright', 'red_bright', 'bright', 'brandBright', 'red-bright'],
  ink: ['ink', 'text', 'dark', 'black'],
  inkSoft: ['inkSoft', 'ink_soft', 'soft', 'ink-soft'],
  inkMute: ['inkMute', 'ink_mute', 'mute', 'muted', 'ink-mute'],
  white: ['white'],
  paper: ['paper', 'offWhite', 'off_white', 'offwhite', 'warm', 'warmWhite', 'background', 'off-white'],
};

const isHex = (v) => typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v.trim());

/** Accepts brand.colors in any reasonable shape (flat or nested {red:{base,deep,bright}}) and fills gaps from the contract. */
export function normalizeColors(colors = {}) {
  const out = { ...DEFAULT_COLORS };
  const flat = {};
  for (const [k, v] of Object.entries(colors || {})) {
    if (isHex(v)) flat[k] = v.trim();
    else if (v && typeof v === 'object') {
      for (const [k2, v2] of Object.entries(v)) {
        if (!isHex(v2)) continue;
        const sub = k2 === 'base' || k2 === 'DEFAULT' || k2 === 'main' ? k : `${k}${k2[0].toUpperCase()}${k2.slice(1)}`;
        flat[sub] = v2.trim();
      }
    }
  }
  for (const [key, aliases] of Object.entries(COLOR_ALIASES)) {
    const hit = aliases.find((a) => flat[a]);
    if (hit) out[key] = flat[hit];
  }
  return out;
}

const dataUriToBuffer = (uri) => {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(String(uri || ''));
  if (!m) return null;
  return m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]), 'utf8');
};

const pngUri = (buf) => `data:image/png;base64,${buf.toString('base64')}`;

/**
 * Recolours a logo raster.
 *  mode 'reverse': dark (non-red) pixels become white, red stays red (for dark/photo backgrounds).
 *  mode 'white'  : everything white (for brand-red backgrounds).
 *  mode 'color'  : unchanged colours.
 * White backgrounds without alpha (the mark file) are keyed out to transparency first.
 */
async function recolorLogo(input, mode) {
  const img = sharp(input, { failOn: 'none' }).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const px = Buffer.from(data);
  // Detect an opaque white background (corners all near white and opaque).
  const at = (x, y) => (y * info.width + x) * 4;
  const corners = [at(0, 0), at(info.width - 1, 0), at(0, info.height - 1), at(info.width - 1, info.height - 1)];
  const whiteBg = corners.every((i) => px[i + 3] > 250 && px[i] > 240 && px[i + 1] > 240 && px[i + 2] > 240);
  for (let i = 0; i < px.length; i += 4) {
    let r = px[i], g = px[i + 1], b = px[i + 2], a = px[i + 3];
    if (whiteBg) {
      // Unblend from white: alpha = distance from white, colour = un-premultiplied.
      const na = 255 - Math.min(r, g, b);
      if (na <= 0) {
        px[i + 3] = 0;
        continue;
      }
      const un = (c) => Math.max(0, Math.min(255, Math.round(((c - (255 - na)) / na) * 255)));
      r = un(r); g = un(g); b = un(b);
      a = Math.round((na * a) / 255);
    }
    if (mode === 'white') {
      r = g = b = 255;
    } else if (mode === 'reverse') {
      const isRed = r > g + 70 && r > b + 70;
      if (!isRed) r = g = b = 255;
    }
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
  }
  return sharp(px, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

const brandCache = new WeakMap();

/**
 * Resolves the brand object passed by callers ({colors, logoDataUri, markDataUri}) into render-ready assets:
 * { colors, logo: {color, reverse, white}, mark: {color, reverse, white} } (all PNG data URIs, transparent).
 * Missing logos fall back to the repo files in src/assets/logos.
 */
export async function resolveBrand(brand = {}) {
  if (brand && typeof brand === 'object' && brandCache.has(brand)) return brandCache.get(brand);
  const load = async (uri, file) => {
    const fromUri = uri ? dataUriToBuffer(uri) : null;
    if (fromUri?.length) return fromUri;
    const p = path.join(config.logosDir, file);
    return existsSync(p) ? fs.readFile(p) : null;
  };
  const [logoBuf, markBuf] = await Promise.all([load(brand?.logoDataUri, 'dhiti-logo.webp'), load(brand?.markDataUri, 'dhiti-mark.webp')]);
  const variants = async (buf) => {
    if (!buf) return { color: '', reverse: '', white: '' };
    const [color, reverse, white] = await Promise.all(['color', 'reverse', 'white'].map((m) => recolorLogo(buf, m)));
    return { color: pngUri(color), reverse: pngUri(reverse), white: pngUri(white) };
  };
  const resolved = { colors: normalizeColors(brand?.colors), logo: await variants(logoBuf), mark: await variants(markBuf) };
  if (brand && typeof brand === 'object') brandCache.set(brand, resolved);
  return resolved;
}

// ---------------------------------------------------------------------------------------------
// Fonts, CSS, photos
// ---------------------------------------------------------------------------------------------

let fontCssCache;
/** <style>/<link> that provides the Inter font to every template. */
export function fontHead() {
  if (fontCssCache !== undefined) return fontCssCache;
  if (existsSync(FONT_FILE)) {
    const b64 = readFileSync(FONT_FILE).toString('base64');
    fontCssCache = `<style>@font-face{font-family:'${FONT_FAMILY}';src:url(data:font/woff2;base64,${b64}) format('woff2');font-weight:100 900;font-style:normal;font-display:block;}</style>`;
  } else {
    log.warn(`render: ${FONT_FILE} missing, falling back to Google Fonts (needs network)`);
    fontCssCache =
      `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${GOOGLE_FONTS_CSS}">` +
      `<style>@font-face{font-family:'${FONT_FAMILY}';src:local('Inter Variable'),local('Inter');font-weight:100 900;}</style>`;
  }
  return fontCssCache;
}

const cssCache = new Map();
/** Reads a stylesheet from templates/ (cached). */
export function templateCss(name) {
  if (!cssCache.has(name)) cssCache.set(name, readFileSync(path.join(TEMPLATES_DIR, name), 'utf8'));
  return cssCache.get(name);
}

/** :root custom properties for the brand colours. */
export function colorVars(colors) {
  const c = normalizeColors(colors);
  return `:root{--red:${c.red};--red-deep:${c.redDeep};--red-bright:${c.redBright};--ink:${c.ink};--ink-soft:${c.inkSoft};--ink-mute:${c.inkMute};--white:${c.white};--paper:${c.paper};--font:${FONT_STACK};--features:${FONT_FEATURES};}`;
}

/** Full HTML document for one frame. `css` = array of template stylesheet names. */
export function htmlDocument({ body, css = [], colors, width, height, extraCss = '', transparent = false }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">${fontHead()}<style>${colorVars(colors)}
html,body{margin:0;padding:0;width:${width}px;height:${height}px;overflow:hidden;${transparent ? 'background:transparent;' : ''}}
${css.map(templateCss).join('\n')}
${extraCss}</style></head><body>${body}</body></html>`;
}

const photoCache = new Map();
/**
 * Local photo file -> JPEG data URI, downscaled to `maxEdge` px on the long edge (default 2160) or cover-cropped
 * to {width,height} (attention crop) when both are given. Returns '' when the file is missing (callers degrade
 * to a photo-less layout).
 */
export async function photoDataUri(file, { maxEdge = 2160, width, height, quality = 86 } = {}) {
  if (!file) return '';
  const abs = path.resolve(String(file));
  let stat;
  try {
    stat = await fs.stat(abs);
  } catch {
    log.warn(`render: photo not found: ${abs}`);
    return '';
  }
  const key = `${abs}|${stat.mtimeMs}|${maxEdge}|${width}|${height}|${quality}`;
  if (!photoCache.has(key)) {
    const job = (async () => {
      let img = sharp(abs, { failOn: 'none', limitInputPixels: false }).rotate();
      img = width && height
        ? img.resize({ width, height, fit: 'cover', position: sharp.strategy.attention })
        : img.resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true });
      const buf = await img.jpeg({ quality, mozjpeg: true, chromaSubsampling: '4:4:4' }).toBuffer();
      return `data:image/jpeg;base64,${buf.toString('base64')}`;
    })();
    photoCache.set(key, job);
    job.catch(() => photoCache.delete(key));
  }
  try {
    return await photoCache.get(key);
  } catch (err) {
    log.warn(`render: could not read photo ${abs}: ${err.message}`);
    return '';
  }
}

// ---------------------------------------------------------------------------------------------
// Text helpers shared by the templates
// ---------------------------------------------------------------------------------------------

/** Plain text from model output: trims, removes em dashes (banned by the brand), collapses spaces. */
export function cleanText(value) {
  return String(value ?? '')
    .replace(/\r/g, '')
    .replace(/\s*—\s*/g, ', ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** Escaped HTML with **highlight** (or *highlight*) spans and line breaks preserved. */
export function richText(value, { highlightClass = 'hl' } = {}) {
  const esc = escapeHtml(cleanText(value));
  return esc
    .replace(/\*\*(.+?)\*\*/g, `<span class="${highlightClass}">$1</span>`)
    .replace(/(^|[^*])\*(?!\s)([^*]+?)\*(?!\*)/g, `$1<span class="${highlightClass}">$2</span>`)
    .replace(/\n+/g, '<br>');
}

/** Text with markdown emphasis markers removed (for measuring/alt text). */
export const plainText = (value) => cleanText(value).replace(/\*\*?/g, '');

/** Splits a stat like "15 to 25%" / "₹1 billion" / "3.4x" into {main, unit} for typographic treatment. */
export function splitStat(stat) {
  const s = cleanText(stat);
  const m = /^([^\d]*?)([\d][\d,.]*(?:\s*(?:to|-|–)\s*[\d][\d,.]*)?)(.*)$/.exec(s);
  if (!m) return { prefix: '', main: s, unit: '' };
  return { prefix: m[1].trim(), main: m[2].replace(/\s*(?:-|–)\s*/, '–').replace(/\s+to\s+/, '–'), unit: m[3].trim() };
}

export { escapeHtml };

// ---------------------------------------------------------------------------------------------
// Browser lifecycle
// ---------------------------------------------------------------------------------------------

let browserPromise = null;

async function launch() {
  const { chromium } = await import('playwright');
  const executablePath = config.chromiumPath || process.env.CHROMIUM_PATH || undefined;
  const args = ['--font-render-hinting=none', '--disable-lcd-text', '--force-color-profile=srgb', '--disable-dev-shm-usage', '--no-sandbox'];
  try {
    return await chromium.launch({ executablePath, args, headless: true });
  } catch (err) {
    if (!executablePath) throw err;
    log.warn(`render: Chromium at ${executablePath} failed (${err.message.split('\n')[0]}); trying Playwright's default`);
    return chromium.launch({ args, headless: true });
  }
}

export async function getBrowser() {
  if (!browserPromise) {
    browserPromise = launch().then((b) => {
      b.on('disconnected', () => { browserPromise = null; });
      return b;
    });
    browserPromise.catch(() => { browserPromise = null; });
  }
  return browserPromise;
}

export async function closeBrowser() {
  const p = browserPromise;
  browserPromise = null;
  if (p) await (await p.catch(() => null))?.close().catch(() => {});
}

// In-page: wait for fonts and images, then fit text. Returns a report of anything that still overflows.
const SETTLE_AND_FIT = async () => {
  await document.fonts.ready;
  const fam = getComputedStyle(document.documentElement).getPropertyValue('--font').split(',')[0].trim().replace(/['"]/g, '');
  await Promise.all([400, 500, 600, 700, 800].map((w) => document.fonts.load(`${w} 64px "${fam}"`).catch(() => null)));
  await Promise.all([...document.images].map((img) => (img.complete && img.naturalWidth ? img.decode().catch(() => null) : new Promise((r) => { img.onload = img.onerror = r; }).then(() => img.decode?.().catch(() => null)))));
  const report = { fonts: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family), overflow: [], fits: [] };
  const overflows = (box) => {
    if (box.dataset.fitAxis !== 'x' && box.scrollHeight > box.clientHeight + 1) return true;
    for (const el of box.querySelectorAll('[data-fit-line]')) if (el.scrollWidth > el.clientWidth + 1) return true;
    return box.scrollWidth > box.clientWidth + 1;
  };
  for (const box of document.querySelectorAll('[data-fit-box]')) {
    const min = Number(box.dataset.fitMin || 0.5);
    let scale = 1;
    box.style.setProperty('--fit', '1');
    let guard = 0;
    while (overflows(box) && scale > min && guard++ < 60) {
      scale = Math.max(min, +(scale - 0.03).toFixed(3));
      box.style.setProperty('--fit', String(scale));
    }
    report.fits.push({ box: box.dataset.fitBox || box.className, scale });
    if (overflows(box)) {
      // Last resort: allow long words to wrap so nothing is clipped, then record it.
      box.classList.add('fit-failed');
      report.overflow.push({ box: box.dataset.fitBox || box.className, scale });
    }
  }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return report;
};

/**
 * Opens a page of the given size and calls fn(render). render(html, {transparent, type, quality}) returns
 * {buffer, report}. Use one session for many frames of the same size (much faster than a page per frame).
 */
export async function withPage({ width, height }, fn) {
  const browser = await getBrowser();
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  const render = async (html, { transparent = false, type = 'png', quality } = {}) => {
    await page.setContent(html, { waitUntil: 'load', timeout: 60_000 });
    const report = await page.evaluate(SETTLE_AND_FIT);
    if (report.overflow.length) log.warn(`render: text still overflows after fitting: ${JSON.stringify(report.overflow)}`);
    const buffer = await page.screenshot({ type, quality: type === 'jpeg' ? quality ?? 92 : undefined, omitBackground: transparent, clip: { x: 0, y: 0, width, height }, animations: 'disabled', caret: 'hide', scale: 'css' });
    return { buffer, report };
  };
  try {
    return await fn(render, page);
  } finally {
    await context.close().catch(() => {});
  }
}

/** One-off render of a single HTML document to PNG. */
export async function renderHtml(html, { width, height, transparent = false } = {}) {
  return withPage({ width, height }, async (render) => (await render(html, { transparent })).buffer);
}

/**
 * Builds a PDF with one full-bleed page per image (pages sized to the image in CSS px).
 * Images are re-encoded as high quality JPEG so a document carousel stays small enough for LinkedIn (<100 MB).
 */
export async function imagesToPdf(images, { width, height, quality = 92 } = {}) {
  const jpgs = await Promise.all(images.map((buf) => sharp(buf).flatten({ background: '#ffffff' }).jpeg({ quality, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer()));
  const pages = jpgs.map((b) => `<div class="p"><img src="data:image/jpeg;base64,${b.toString('base64')}"></div>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:${width}px ${height}px;margin:0}html,body{margin:0;padding:0}.p{width:${width}px;height:${height}px;page-break-after:always;break-after:page;overflow:hidden}.p:last-child{page-break-after:auto;break-after:auto}img{display:block;width:${width}px;height:${height}px}</style></head><body>${pages}</body></html>`;
  const browser = await getBrowser();
  const context = await browser.newContext({ viewport: { width, height } });
  try {
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => null))));
    return await page.pdf({ width: `${width}px`, height: `${height}px`, printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 }, preferCSSPageSize: true });
  } finally {
    await context.close().catch(() => {});
  }
}
