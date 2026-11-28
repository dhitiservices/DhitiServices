// Blog validation for ONE post, mirroring the website's own rules exactly:
//
//   scripts/blog-data.mjs  loadPosts(): required frontmatter keys, quoted YYYY-MM-DD date, no raw HTML,
//                          word count, TOC from marked's <h2> output (ids via the site's slugify).
//   scripts/check-blog.mjs: >= 1000 words, >= 5 sections, no em dash, description <= 160, >= 1 "](https:" source.
//
// The same libraries are used (gray-matter + marked 15.0.12). When the website's node_modules exist under
// REPO_ROOT they are preferred, so the result is byte-for-byte what `node scripts/check-blog.mjs` computes.
//
// Extra checks (the site build/QA would fail later or the brand forbids it): frontmatter types, category in the
// allowed set, image == "<slug>.webp", date quoted and a real calendar date, kebab-case slug not colliding with an
// existing content/blog/*.md, exactly 8 "##" sections and no "#" H1 (scripts/verify-built-blog.mjs asserts both),
// internal links (/blog/<slug>/, #anchors, site pages) resolve, no em dashes in frontmatter text either.
// Link safety: every link token marked produces (inline, reference-style, autolinks, nested in lists/tables) must be
// https:, http: (warning), mailto:, #anchor or relative; reference definitions are rejected outright, because the site
// renders posts with marked and no sanitiser (a javascript: href would reach www.dhitiservices.com).
//
// API:
//   checkBlogText(text, opts)  -> { passed, messages, warnings, words, sections, minutes, slug, frontmatter, toc, markdown }
//   checkBlogFile(file, opts)  -> same (reads the file; slug defaults from frontmatter.slug / image / file name)
//   listExistingPosts(opts)    -> [{ slug, title, description, category, date, order, image, words, file }] (tolerant)
//   siteSlugify(text)          -> the website's slug rule (heading ids)
//   hrefScheme(href)           -> lowercase scheme a browser sees ('' relative, '//' protocol-relative)
//   renderFrontmatter(fm)      -> YAML frontmatter block in the house format (quoted strings, int order)
// opts: { repoRoot, slug, allowExisting: bool | 'same-content', existingSlugs }
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { config, BLOG_CATEGORIES } from './config.js';

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------------------------
// Libraries: prefer the website's own copies (exact versions), fall back to the engine's.
// ---------------------------------------------------------------------------------------------

const libCache = new Map();
async function loadLib(name, repoRoot) {
  const key = `${name}@${repoRoot}`;
  if (libCache.has(key)) return libCache.get(key);
  let resolved;
  try {
    resolved = require.resolve(name, { paths: [repoRoot] });
  } catch {
    resolved = require.resolve(name);
  }
  const mod = await import(pathToFileURL(resolved).href);
  libCache.set(key, mod);
  return mod;
}
async function libs(repoRoot) {
  const [gm, mk] = await Promise.all([loadLib('gray-matter', repoRoot), loadLib('marked', repoRoot)]);
  const matter = gm.default || gm;
  const marked = mk.marked || mk.default?.marked || mk.default;
  if (typeof matter !== 'function' || typeof marked?.parse !== 'function') throw new Error('blogcheck: could not load gray-matter / marked');
  return { matter, marked };
}

// ---------------------------------------------------------------------------------------------
// Exact copies of the website's rules (scripts/blog-data.mjs, scripts/check-blog.mjs)
// ---------------------------------------------------------------------------------------------

/** scripts/blog-data.mjs slugify (used for heading ids). */
export const siteSlugify = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const REQUIRED_KEYS = ['title', 'description', 'category', 'image', 'imageAlt', 'order', 'date'];
const RAW_HTML = /<\/?[a-z][^>]*>/i;

/** scripts/blog-data.mjs word count, verbatim. */
function siteWords(content) {
  const plain = content.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[#*`>|]/g, '');
  return plain.trim().split(/\s+/).length;
}

/** scripts/blog-data.mjs TOC, verbatim (marked output, <h2> regex, site slugify of tag-stripped text). */
function siteToc(content, marked) {
  const toc = [];
  marked.parse(content).replace(/<h2>(.*?)<\/h2>/g, (_, text) => {
    const id = siteSlugify(text.replace(/<[^>]*>/g, ''));
    toc.push({ id, text });
    return `<h2 id="${id}">${text}</h2>`;
  });
  return toc;
}

// ---------------------------------------------------------------------------------------------
// Existing posts
// ---------------------------------------------------------------------------------------------

/** Every content/blog/*.md (tolerant: a broken file is reported with `error`, never thrown). */
export async function listExistingPosts({ repoRoot = config.repoRoot } = {}) {
  const dir = path.join(repoRoot, 'content', 'blog');
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  } catch {
    return [];
  }
  const { matter } = await libs(repoRoot);
  return files.map((file) => {
    const slug = file.replace(/\.md$/, '');
    const full = path.join(dir, file);
    try {
      const raw = fs.readFileSync(full, 'utf8');
      const { data, content } = matter(raw);
      return {
        slug,
        title: data.title ?? '',
        description: data.description ?? '',
        category: data.category ?? '',
        date: typeof data.date === 'string' ? data.date : data.date instanceof Date ? data.date.toISOString().slice(0, 10) : '',
        order: data.order ?? null,
        image: data.image ?? '',
        imageAlt: data.imageAlt ?? '',
        words: siteWords(content),
        file: full,
        raw,
        content,
      };
    } catch (err) {
      return { slug, file: full, error: err.message };
    }
  }).sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')) || (a.order ?? 0) - (b.order ?? 0));
}

// ---------------------------------------------------------------------------------------------
// Site pages that internal links may target (static routes of scripts/build-site.mjs + blog).
// ---------------------------------------------------------------------------------------------

function sitePages(repoRoot) {
  const pages = new Set(['/', '/blog/', '/privacy/']);
  try {
    const src = fs.readFileSync(path.join(repoRoot, 'scripts', 'build-site.mjs'), 'utf8');
    for (const m of src.matchAll(/save\(\s*'([a-z0-9/-]*)'/g)) if (m[1] && !m[1].endsWith('/')) pages.add(`/${m[1]}/`);
    for (const m of src.matchAll(/slug\s*:\s*'([a-z0-9-]+)'/g)) pages.add(`/services/${m[1]}/`);
  } catch {
    /* optional */
  }
  try {
    for (const d of fs.readdirSync(path.join(repoRoot, 'public'), { withFileTypes: true })) {
      pages.add(d.isDirectory() ? `/${d.name}/` : `/${d.name}`);
    }
  } catch {
    /* optional */
  }
  return pages;
}

// ---------------------------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------------------------

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Decodes the HTML character references a browser would decode inside an href attribute. */
function decodeEntities(s) {
  const named = { colon: ':', tab: '\t', newline: '\n', sol: '/', amp: '&', lpar: '(', rpar: ')', period: '.', quot: '"', apos: "'" };
  return String(s)
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCodePoint(Number.parseInt(h, 16) || 0))
    .replace(/&#(\d+);?/g, (_, d) => String.fromCodePoint(Number(d) || 0))
    .replace(/&([a-z]+);/gi, (m, n) => named[n.toLowerCase()] ?? m);
}

/**
 * Scheme of an href exactly as a browser would see it (entities decoded, whitespace/control chars removed), or ''
 * for relative links. Protocol-relative "//host" links return '//'.
 */
export function hrefScheme(href) {
  // eslint-disable-next-line no-control-regex
  const clean = decodeEntities(href).replace(/[\u0000-\u0020\u007f-\u009f]+/g, '').replace(/\\/g, '/');
  if (clean.startsWith('//')) return '//';
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(clean);
  return m ? m[1].toLowerCase() : '';
}

/**
 * Every link and image token marked produces (inline, reference-style, autolinks, GFM bare URLs, in lists, tables,
 * blockquotes...), plus the reference definitions. Code is excluded because marked never makes links inside it.
 * Returns { links: [{text, href, image, raw}], definitions: [{label, href}] }.
 */
function markdownLinks(content, marked) {
  const tokens = marked.lexer(String(content ?? ''));
  const links = [];
  const seen = new Set();
  const walk = (node) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const n of node) walk(n);
      return;
    }
    if (node.type === 'link' || node.type === 'image') links.push({ text: node.text ?? '', href: String(node.href ?? ''), image: node.type === 'image', raw: node.raw ?? '' });
    for (const [k, v] of Object.entries(node)) if (k !== 'raw' && v && typeof v === 'object') walk(v);
  };
  walk(tokens);
  const definitions = Object.entries(tokens.links || {}).map(([label, v]) => ({ label, href: String(v?.href ?? '') }));
  return { links, definitions };
}

/** Link definition lines ("[label]: url") outside fenced code; the house style only uses inline links. */
const REF_DEFINITION = /^ {0,3}\[[^\]]+\]:\s*\S+/m;

function deriveSlug(data, file, repoRoot) {
  // A file already in content/blog is identified by its file name (that is its URL).
  if (file && path.resolve(path.dirname(file)) === path.join(repoRoot, 'content', 'blog')) return path.basename(file).replace(/\.md$/i, '');
  if (typeof data?.slug === 'string' && data.slug.trim()) return data.slug.trim();
  if (typeof data?.image === 'string' && /\.webp$/i.test(data.image)) return data.image.replace(/\.webp$/i, '');
  return file ? path.basename(file).replace(/\.(md|markdown)$/i, '') : '';
}

/** Frontmatter block in the house format (same key order and quoting as content/blog/*.md). */
export function renderFrontmatter(fm) {
  const q = (v) => JSON.stringify(String(v ?? ''));
  return [
    '---',
    `title: ${q(fm.title)}`,
    `description: ${q(fm.description)}`,
    `category: ${q(fm.category)}`,
    `image: ${q(fm.image)}`,
    `imageAlt: ${q(fm.imageAlt)}`,
    `order: ${Number.parseInt(fm.order, 10)}`,
    `date: ${q(fm.date)}`,
    '---',
    '',
  ].join('\n');
}

/**
 * Validates a complete markdown file (frontmatter + body).
 * Returns { passed, messages (errors), warnings, words, sections, minutes, slug, frontmatter, toc, markdown }.
 */
export async function checkBlogText(text, opts = {}) {
  const repoRoot = path.resolve(opts.repoRoot || config.repoRoot);
  const { matter, marked } = await libs(repoRoot);
  const errors = [];
  const warnings = [];
  const raw = String(text ?? '').replace(/^﻿/, '');

  let data = {};
  let content = '';
  try {
    // matter(str, {}) bypasses gray-matter's string cache (same parse as the site, no shared state).
    ({ data, content } = matter(raw, {}));
  } catch (err) {
    errors.push(`frontmatter is not valid YAML: ${err.message.split('\n')[0]}`);
  }
  if (!/^---\r?\n/.test(raw)) errors.push('missing YAML frontmatter (the file must start with ---)');

  const slug = String(opts.slug || deriveSlug(data, opts.file, repoRoot) || '');
  const label = slug || '(no slug)';

  // ---- blog-data.mjs loadPosts() ----
  for (const key of REQUIRED_KEYS) if (!data[key]) errors.push(`${label}.md: missing ${key}`);
  if (data.date && !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) errors.push(`${label}.md: date must be a quoted YYYY-MM-DD value`);
  if (RAW_HTML.test(content)) {
    const m = content.match(RAW_HTML);
    errors.push(`${label}.md: raw HTML is not allowed (found ${JSON.stringify(m[0].slice(0, 40))})`);
  }
  const words = siteWords(content);
  let toc = [];
  try {
    toc = siteToc(content, marked);
  } catch (err) {
    errors.push(`markdown could not be parsed: ${err.message}`);
  }
  const minutes = Math.ceil(words / 220);

  // ---- check-blog.mjs ----
  if (words < 1000) errors.push(`${label}: only ${words} words`);
  if (toc.length < 5) errors.push(`${label}: add useful sections`);
  if (content.includes('—')) errors.push(`${label}: remove em dashes`);
  if (data.description != null && data.description.length > 160) errors.push(`${label}: description exceeds 160 characters`);
  if (!/\]\(https:/.test(content)) errors.push(`${label}: missing source reference`);

  // ---- extra checks ----
  for (const key of ['title', 'description', 'category', 'image', 'imageAlt']) {
    if (data[key] != null && typeof data[key] !== 'string') errors.push(`frontmatter ${key} must be a string`);
  }
  if (data.order != null && !(Number.isInteger(data.order) && data.order > 0)) errors.push('frontmatter order must be a positive integer');
  if (typeof data.category === 'string' && data.category && !BLOG_CATEGORIES.includes(data.category)) {
    errors.push(`category "${data.category}" is not allowed. Use one of: ${BLOG_CATEGORIES.join(', ')}`);
  }
  if (data.date instanceof Date) errors.push('date must be quoted, e.g. date: "2026-12-02" (unquoted YAML dates become Date objects)');
  if (typeof data.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
    const d = new Date(`${data.date}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== data.date) errors.push(`date ${data.date} is not a real calendar date`);
  }
  if (typeof data.description === 'string' && data.description.trim().length < 70) warnings.push(`description is short (${data.description.trim().length} chars); aim for 120-160`);
  if (typeof data.title === 'string') {
    if (data.title.length > 80) warnings.push(`title is ${data.title.length} chars; keep it under about 80`);
    if (/\n/.test(data.title)) errors.push('title must be a single line');
  }
  for (const key of ['title', 'description', 'imageAlt']) {
    if (typeof data[key] === 'string' && data[key].includes('—')) errors.push(`${key}: remove em dashes`);
  }

  if (!slug) errors.push('slug could not be determined (set frontmatter image to "<slug>.webp" or pass --slug)');
  else {
    if (!KEBAB.test(slug)) errors.push(`slug "${slug}" must be kebab-case (lowercase letters, digits, single hyphens)`);
    if (slug.length > 80) errors.push(`slug "${slug}" is longer than 80 characters`);
    if (typeof data.image === 'string' && data.image && data.image !== `${slug}.webp`) {
      // Legacy posts already in content/blog may share site photos; every new post must use its own <slug>.webp.
      const inRepo = opts.file && path.resolve(path.dirname(opts.file)) === path.join(repoRoot, 'content', 'blog');
      (inRepo ? warnings : errors).push(`image must be "${slug}.webp" (got "${data.image}")`);
    }
    const existingFile = path.join(repoRoot, 'content', 'blog', `${slug}.md`);
    const existingSlugs = opts.existingSlugs ? new Set(opts.existingSlugs) : null;
    const exists = existingSlugs ? existingSlugs.has(slug) : fs.existsSync(existingFile);
    const sameFile = opts.file && path.resolve(opts.file) === path.resolve(existingFile);
    if (exists && !sameFile) {
      let same = false;
      if (opts.allowExisting === 'same-content') {
        try {
          same = fs.readFileSync(existingFile, 'utf8') === raw;
        } catch {
          same = false;
        }
      }
      if (!(opts.allowExisting === true || same)) errors.push(`slug "${slug}" collides with existing content/blog/${slug}.md; choose a new slug`);
    }
    if (!exists && !opts.allowExisting && fs.existsSync(path.join(repoRoot, 'src', 'assets', 'photos', `${slug}.webp`))) {
      errors.push(`src/assets/photos/${slug}.webp already exists (used by the site); choose a new slug`);
    }
  }

  if (/^#\s/m.test(content.replace(/```[\s\S]*?```/g, ''))) errors.push('do not use a "# " H1 in the body; the page title is the only H1 (verify-built-blog.mjs)');
  if (toc.length >= 5 && toc.length !== 8) errors.push(`use exactly 8 "##" sections (found ${toc.length}); scripts/verify-built-blog.mjs asserts eight content sections`);
  const ids = toc.map((t) => t.id);
  const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupIds.length) errors.push(`duplicate section headings produce duplicate ids: ${[...new Set(dupIds)].join(', ')}`);
  if (ids.some((id) => !id)) errors.push('a "##" heading has no letters or digits, so it gets an empty id');

  // Links
  const pages = sitePages(repoRoot);
  const blogDir = path.join(repoRoot, 'content', 'blog');
  let externalHttps = 0;
  let parsedLinks = { links: [], definitions: [] };
  try {
    parsedLinks = markdownLinks(content, marked);
  } catch (err) {
    errors.push(`links could not be parsed: ${err.message}`);
  }
  for (const d of parsedLinks.definitions) {
    errors.push(`reference-style link definition "[${d.label}]: ${d.href.slice(0, 80)}" is not allowed; write the link inline as [text](https://...)`);
  }
  if (!parsedLinks.definitions.length && REF_DEFINITION.test(content.replace(/```[\s\S]*?```/g, '').replace(/~~~[\s\S]*?~~~/g, ''))) {
    errors.push('reference-style link definitions ("[label]: url") are not allowed; write links inline as [text](https://...)');
  }
  for (const { href, image } of parsedLinks.links) {
    const scheme = hrefScheme(href);
    if (scheme === '//') {
      errors.push(`protocol-relative link "${href.slice(0, 80)}" is not allowed; use https://`);
      continue;
    }
    if (scheme && !['https', 'http', 'mailto'].includes(scheme)) {
      errors.push(`link scheme "${scheme}:" is not allowed (${JSON.stringify(href.slice(0, 80))}); only https:, mailto:, #anchors and relative site links`);
      continue;
    }
    if (scheme && decodeEntities(href) !== href) {
      errors.push(`link "${href.slice(0, 80)}" contains HTML character references; write the URL plainly`);
      continue;
    }
    if (image) {
      errors.push(`inline images are not supported in posts (${href}); the cover comes from frontmatter image`);
      continue;
    }
    if (/^https:\/\//i.test(href)) {
      externalHttps += 1;
      if (/dhitiservices\.com\/blog\/([^/#?]+)/i.test(href)) {
        const s = href.match(/dhitiservices\.com\/blog\/([^/#?]+)/i)[1];
        if (s !== slug && !fs.existsSync(path.join(blogDir, `${s}.md`))) errors.push(`link to ${href} points to a post that does not exist`);
      }
      continue;
    }
    if (/^http:\/\//i.test(href)) {
      warnings.push(`use https for ${href}`);
      continue;
    }
    if (/^mailto:/i.test(href)) continue;
    if (href.startsWith('#')) {
      if (!ids.includes(href.slice(1))) errors.push(`anchor ${href} does not match any section id (${ids.join(', ')})`);
      continue;
    }
    // Local link: resolve it the way a browser does on /blog/<slug>/ (house style is ../<other-slug>/).
    let clean;
    try {
      clean = decodeURI(new URL(href, `https://site.invalid/blog/${slug || 'post'}/`).pathname);
    } catch {
      errors.push(`link "${href}" is not a valid URL`);
      continue;
    }
    const m = /^\/blog\/([^/]+)\/?$/.exec(clean);
    if (m) {
      if (!clean.endsWith('/')) warnings.push(`internal link ${href} should end with a slash`);
      if (m[1] === slug) warnings.push(`link ${href} points to this post itself`);
      else if (!fs.existsSync(path.join(blogDir, `${m[1]}.md`))) errors.push(`internal link ${href} points to a post that does not exist (/blog/${m[1]}/)`);
      continue;
    }
    if (!pages.has(clean)) errors.push(`internal link ${href} (resolves to ${clean}) does not match a site page`);
  }
  if (externalHttps < 2) warnings.push(`only ${externalHttps} external https source link(s); cite real sources inline where they help`);
  if (!/\*\*[^*\n]+\*\*/.test(content)) warnings.push('no bold key sentence (**...**) found; house style uses one');
  if (/–/.test(content)) warnings.push('en dash (–) found; prefer a hyphen or rewrite');
  if (words > 3000) warnings.push(`${words} words is long; 1200-2000 reads best`);

  const frontmatter = {};
  for (const key of REQUIRED_KEYS) if (data[key] !== undefined) frontmatter[key] = data[key] instanceof Date ? data[key].toISOString().slice(0, 10) : data[key];

  return {
    passed: errors.length === 0,
    messages: errors,
    warnings,
    words,
    sections: toc.length,
    minutes,
    slug,
    frontmatter,
    toc,
    markdown: content,
  };
}

/** Reads and validates a markdown file. */
export async function checkBlogFile(file, opts = {}) {
  const full = path.resolve(file);
  const text = fs.readFileSync(full, 'utf8');
  return checkBlogText(text, { ...opts, file: full });
}
