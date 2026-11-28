// Claims ledger core: the accuracy rules, shared byte-for-byte by the engine CLI (Node, engine/src/claims.js) and
// the engine Edge Function (Deno, supabase/functions/engine/claims-core.js is an exact copy; a test compares them).
// Pure JavaScript: no imports, no I/O. The callers pass the markdown lexer and the source texts.
//
// ARCHITECTURE.md v4 "Claims ledger" and v4.1 "Accuracy gate" describe the rules. In short, a blog is accepted only
// when every factual sentence of the post (and of its title, description, image alt text and FAQ) is mapped to a
// claim, and every sourced claim:
//   1. appears word for word in the post,
//   2. quotes 8 to 60 words that are in the text of a source the SERVER fetched (sha256-bound),
//   3. has every number, date, financial year, section and document id matched by a token of the SAME type and unit
//      in its quotes (18% only by a percent 18, "30 days" only by a 30-day duration, "section 16(6)" only by a parsed
//      16(6) reference; never by digits inside form names, labels or ids), or produced by a machine-checked
//      derivation (derived.steps),
//   4. uses each number in the same context as the quote (a shared word near it), and in the same sense
//      (negation parity), and not a superseded value,
//   5. cites a primary (government) source when it carries law or document-id tokens or names an Act, Rule,
//      Circular or Notification, whatever its kind,
//   6. carries a stored verdict from the independent fact-checker, bound to the exact claim (claim_hash).

export const CORE_VERSION = '4.1.0';
export const SOURCED_KINDS = ['fact', 'law', 'stat', 'date', 'quote'];
export const CLAIM_KINDS = [...SOURCED_KINDS, 'dhiti', 'illustrative', 'advice'];
export const QUOTE_MIN_WORDS = 8;
export const QUOTE_MAX_WORDS = 60;

/**
 * Dhiti's own proof points, as the owner published them (playbook/quality-bar.md section 1). A `dhiti` claim must
 * contain one of these phrases, and every number in it must come from that phrase.
 */
export const DHITI_FACTS = Object.freeze([
  'more than 200 trained specialists',
  'more than 200 people trained and working',
  'four service lines',
  'more than 25 brands',
]);

/** Hosts that count as primary sources (government, regulators, official gazettes). */
export const PRIMARY_HOST = /(^|\.)(gov\.in|nic\.in|rbi\.org\.in|sebi\.gov\.in|gov|gov\.uk|europa\.eu|legislation\.gov\.uk|federalregister\.gov|icao\.int)$/i;

/**
 * Known superseded provisions and rates. A claim whose quote matches `quote` (strict form) may use it only to say
 * what the old rule WAS (the claim needs a past marker such as "was", "before", "replaced", "until").
 * Add a row whenever a fact-checker finds old law that a source still carries.
 */
export const SUPERSEDED = Object.freeze([
  {
    id: 'cgst-16-4-september-return',
    quote: /return under section 39 for the month of september following the end of financial year/,
    message: 'this is the old text of section 16(4) of the CGST Act. Since 1 October 2022 (Finance Act 2022) credit ends on the thirtieth day of November following the end of the financial year, or the annual return if earlier. Quote the current text (for example CBIC Circular 237/31/2024-GST)',
  },
  {
    id: 'air-travel-other-than-economy-12',
    quote: /other than economy class\s*12%/,
    tokens: [{ type: 'num', key: '12', unit: '%' }],
    message: 'GST on air travel in classes other than economy is 18% from 22 September 2025 (56th GST Council); 12% is the old rate',
  },
]);
const PAST_MARKER = /\b(replaced|replacing|was|were|earlier|previously|until|till|before|old|older|used to|up from|down from|superseded|no longer|formerly|prior to)\b/i;

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

const ND = /\p{Nd}/u;
/** Any Unicode decimal digit (Devanagari १२, Arabic-Indic ...) to its ASCII digit. */
function asciiDigits(s) {
  return s.replace(/\p{Nd}/gu, (ch) => {
    const cp = ch.codePointAt(0);
    if (cp >= 48 && cp <= 57) return ch;
    let first = cp;
    while (first > 0 && ND.test(String.fromCodePoint(first - 1))) first -= 1;
    return String((cp - first) % 10);
  });
}

/**
 * Character-level normalisation: entities, HTML comments and every format character (zero-width, soft hyphen,
 * invisible separators, bidi marks) removed, NFKC, non-ASCII digits to ASCII, smart quotes to ASCII, every dash to
 * "-", whitespace collapsed.
 */
export function normText(s) {
  return asciiDigits(
    decodeEntities(String(s ?? '').replace(/<!--[\s\S]*?(-->|$)/g, ''))
      .normalize('NFKC')
      .replace(/\p{Cf}/gu, ''),
  )
    .replace(/[‘’‚‛′ʼ`´]/g, "'")
    .replace(/[“”„‟″«»]/g, '"')
    .replace(/[‐-―−﹘﹣－]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strict comparison form: normText, lowercase, spaces around hyphens and before punctuation removed. */
export const strictForm = (s) => normText(s).toLowerCase().replace(/\s*-\s*/g, '-').replace(/\s+([,.;:!?)\]])/g, '$1').replace(/([(\[])\s+/g, '$1');

/**
 * Loose comparison form (absorbs PDF line-break hyphenation and spacing): letters and digits only, EXCEPT that a
 * separator between two digits is kept ("1.8", "10,000", "30.11.2026", "25,000/-"), and a space between two digits
 * becomes "_". So a loose match can never move a decimal point or re-group digits.
 */
export function looseForm(s) {
  const t = normText(s).toLowerCase();
  return t.replace(/[^\p{L}\p{N}]+/gu, (m, off, str) => {
    const before = str[off - 1] || '';
    const after = str[off + m.length] || '';
    if (/\d/.test(before) && /\d/.test(after)) {
      const sep = m.replace(/\s+/g, '');
      return sep || '_';
    }
    return '';
  });
}

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
// Source text extraction (HTML; PDF pages are extracted by the caller with unpdf and joined here)
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
  if (/<\/?[a-z][a-z0-9]*(\s[^>]*)?>/i.test(s)) s = s.replace(/<\/?(p|div|li|ul|ol|br|tr|h[1-6]|table)\b[^>]*>/gi, '\n').replace(/<\/?[a-z][a-z0-9]*(\s[^>]*)?>/gi, '');
  return s
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .filter((l, i, arr) => l || (i > 0 && arr[i - 1]))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function htmlTitle(html) {
  const m = String(html ?? '').match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return m ? normText(m[1]).slice(0, 300) : '';
}

/** One PDF page's text exactly as unpdf's extractText builds it (items joined, hasEOL as "\n"). */
export const pdfPageText = (items) => items.filter((it) => it.str != null).map((it) => it.str + (it.hasEOL ? '\n' : '')).join('');
/** The stored text of a PDF: "[page N]\n<text>" blocks joined by blank lines. `pages` is 1-based sparse or dense. */
export function pdfText(pages) {
  const out = [];
  for (let i = 0; i < pages.length; i++) if (typeof pages[i] === 'string') out.push(`[page ${i + 1}]\n${pages[i].trim()}`);
  return out.join('\n\n');
}
/** Splits a stored PDF text back into pages: returns a sparse array (index = page - 1). */
export function splitPdfText(text) {
  const pages = [];
  const re = /(?:^|\n\n)\[page (\d+)\]\n/g;
  const marks = [...String(text).matchAll(re)];
  for (let k = 0; k < marks.length; k++) {
    const start = marks[k].index + marks[k][0].length;
    const end = k + 1 < marks.length ? marks[k + 1].index : text.length;
    pages[Number(marks[k][1]) - 1] = text.slice(start, end);
  }
  return pages;
}

// =====================================================================================================================
// Tokens: numbers (with units), dates, financial years, law references, document ids
// =====================================================================================================================

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH_RE = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
export const monthNo = (s) => {
  const k = String(s).toLowerCase().slice(0, 3);
  const i = MONTHS.findIndex((m) => m.startsWith(k));
  return i >= 0 ? i + 1 : null;
};
const MONTH_NAME = (n) => MONTHS[n - 1][0].toUpperCase() + MONTHS[n - 1].slice(1);
const UNITS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const ORD_UNITS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20, thirtieth: 30 };
const ORD_WORD = '(?:(?:twenty|thirty)[- ](?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|thirtieth)';
function ordWordValue(w) {
  const s = w.toLowerCase().replace(' ', '-');
  if (ORD_UNITS[s]) return ORD_UNITS[s];
  const [t, u] = s.split('-');
  return (TENS[t] || 0) + (ORD_UNITS[u] || 0);
}
const SCALE = { hundred: 100, thousand: 1000, lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, crore: 1e7, crores: 1e7, million: 1e6, billion: 1e9 };
const SHORT_SCALE = { k: 1e3, l: 1e5, lakh: 1e5, lac: 1e5, cr: 1e7, crore: 1e7, mn: 1e6, m: 1e6, bn: 1e9 };
const UNIT_WORD = {
  day: 'day', days: 'day', 'working day': 'day', 'working days': 'day', month: 'month', months: 'month', year: 'year', years: 'year',
  week: 'week', weeks: 'week', hour: 'hour', hours: 'hour', minute: 'minute', minutes: 'minute', quarter: 'quarter', quarters: 'quarter',
};
const UNIT_AFTER = /^\s*(?:-\s*)?(%|per ?cent\b|percent\b|percentage points?\b|working days?\b|days?\b|months?\b|years?\b|weeks?\b|hours?\b|minutes?\b|rupees?\b|paise\b|times\b)/i;
const MONEY_BEFORE = /(?:₹|\brs\.?|\binr|\brupees?)\s*$/i;
const NUM_SPELL = `(?:(?:${Object.keys(TENS).join('|')})(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?|${Object.keys(UNITS).join('|')})`;

export const normNum = (s) => {
  const t = String(s).replace(/,/g, '');
  const n = Number(t);
  if (!Number.isFinite(n)) return t;
  return String(Math.round(n * 1e6) / 1e6);
};
function spellValue(w) {
  const s = w.toLowerCase().replace(/\s+/g, ' ').trim();
  if (Object.hasOwn(UNITS, s)) return UNITS[s];
  const [t, u] = s.split(/[- ]/);
  return (TENS[t] || 0) + (u ? UNITS[u] || 0 : 0);
}
function unitOf(raw) {
  const r = raw.toLowerCase().replace(/^-\s*/, '');
  if (r === '%' || /^per ?cent|^percent/.test(r)) return '%';
  if (/^percentage point/.test(r)) return 'pp';
  if (/^(rupees?|paise)/.test(r)) return 'money';
  if (r === 'times') return 'times';
  return UNIT_WORD[r] || UNIT_WORD[r.replace(/s$/, '')] || '';
}

/**
 * Extracts fact tokens from text. Returns [{type:'num'|'date'|'fy'|'law'|'id', key, raw, start, end, ...}].
 *   num:  {key (normalised value), unit: '' | '%' | 'pp' | 'money' | 'day' | 'month' | 'year' | 'week' | 'hour' | 'ord' | 'times'}
 *   date: {y, m, d} (any part may be null); a bare 4-digit year 1900-2099 is a date {y}
 *   law:  {sys: 's' (section family) | 'r' (rule family) | 'a' | 'p' | '?', main, comps: [], key}
 * Positions are offsets into the given (already normalised) text. Form names such as GSTR-2B, GSTR-3B, IFF-1 and
 * URLs are identifiers, never tokens.
 */
export function extractTokens(input, { quoteMode = false, ones = false } = {}) {
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
      if (Array.isArray(r)) mask(r[0], r[1]);
      else mask(m.index, m.index + m[0].length);
    }
  };

  // 1. identifiers that contain digits but are names: URLs, GSTR-2B, GSTR-3B, ITC-04, REG-01, Q24, A1, 2B, 3B
  scan(/https?:\/\/\S+/g, () => true);
  scan(/\b[A-Z]{2,}(?:-[A-Z]+)*-?\d+[A-Z]{0,3}(?:\/\d+[A-Z]{0,3})*\b/g, (m) => !/^FY\d/.test(m[0]));
  scan(/\bGSTR\s\d{1,2}[A-Z]{0,2}\b/g, () => true);
  scan(/\b[A-Z]\d{1,3}\b/g, () => true);

  // 2. document ids: 193/05/2023-GST, 18/2022, 01/2017-Central Tax
  scan(/\b(\d{1,4})\/(\d{1,4})\/(\d{4})(?:-[A-Za-z()]+(?: [A-Z][a-z]+)?)?\b/g, (m) => {
    const a = +m[1];
    const b = +m[2];
    const pre = text.slice(Math.max(0, m.index - 30), m.index);
    if (a <= 31 && b <= 12 && !/(circular|notification|no\.?|order|instruction)\s*$/i.test(pre)) return false; // a date
    tokens.push({ type: 'id', key: `${a}/${b}/${m[3]}`, raw: m[0], start: m.index, end: m.index + m[0].length });
  });
  scan(/\b(\d{1,4})\/((?:19|20)\d{2})(?:-[A-Za-z()]+)?\b/g, (m) => {
    tokens.push({ type: 'id', key: `${+m[1]}/${m[2]}`, raw: m[0], start: m.index, end: m.index + m[0].length });
  });

  // 3. financial years: 2025-26, FY 2025-26, 2025-2026
  scan(/\b(?:FY\s?)?((?:19|20)\d{2})[-/]((?:19|20)?\d{2})\b/gi, (m) => {
    const y = +m[1];
    const e = m[2].length === 2 ? +m[2] : +m[2].slice(2);
    if ((y + 1) % 100 !== e) return false;
    tokens.push({ type: 'fy', key: String(y), raw: m[0], start: m.index, end: m.index + m[0].length });
  });

  // 4. law references (parsed to full keys: "sub-section (6) of section 16" = 16(6))
  extractLaw(text, work, tokens);

  // 5. dates
  const pushDate = (m, d, mo, y) => tokens.push({ type: 'date', key: [y ?? '', mo ?? '', d ?? ''].join('-'), y: y ?? null, m: mo ?? null, d: d ?? null, raw: m[0], start: m.index, end: m.index + m[0].length });
  scan(/\b((?:19|20)\d{2})-(\d{2})-(\d{2})\b/g, (m) => pushDate(m, +m[3], +m[2], +m[1]));
  scan(/\b(\d{1,2})[./-](\d{1,2})[./-]((?:19|20)\d{2})\b/g, (m) => {
    if (+m[2] > 12 || +m[1] > 31 || +m[2] < 1 || +m[1] < 1) return false;
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

  // 6. numbers
  const unitAt = (end) => {
    const u = text.slice(end).match(UNIT_AFTER);
    return u ? { unit: unitOf(u[1]), len: u[0].length } : null;
  };
  const moneyBefore = (start) => MONEY_BEFORE.test(text.slice(Math.max(0, start - 8), start));
  const pushNum = (value, start, end, { unit = '', word = false, raw } = {}) => {
    let u = unit;
    let e = end;
    if (!u) {
      const ua = unitAt(end);
      if (ua) {
        u = ua.unit;
        e = end + ua.len;
      }
    }
    if (!u && moneyBefore(start)) u = 'money';
    tokens.push({ type: 'num', key: normNum(value), unit: u, raw: raw ?? text.slice(start, e), start, end: e, word });
    return [start, e];
  };
  // 6a. money and Indian shorthand: ₹50k, Rs50,000, Rs. 2 crore, ₹1.5L, 2cr
  scan(/(₹|\bRs\.?|\bINR)\s?(\d{1,3}(?:,\d{2,3})+|\d+)(?:\.(\d+))?\s?(k|cr|crores?|l|lakhs?|lacs?|mn|m|bn|million|billion)?(?![\p{L}\d])/giu, (m) => {
    const v = Number(normNum(m[3] ? `${m[2]}.${m[3]}` : m[2])) * (m[4] ? SHORT_SCALE[m[4].toLowerCase().replace(/s$/, '')] || SCALE[m[4].toLowerCase()] || 1 : 1);
    return pushNum(String(v), m.index, m.index + m[0].length, { unit: 'money' });
  });
  scan(/(?<![\w.])(\d{1,3}(?:,\d{2,3})+|\d+)(?:\.(\d+))?\s?(k|cr|crores?|lakhs?|lacs?|mn|bn|million|billion|thousand|hundred)(?![\p{L}\d])/giu, (m) => {
    const sc = m[3].toLowerCase();
    const v = Number(normNum(m[2] ? `${m[1]}.${m[2]}` : m[1])) * (SHORT_SCALE[sc.replace(/s$/, '')] || SCALE[sc] || 1);
    return pushNum(String(v), m.index, m.index + m[0].length);
  });
  // 6b. digits: ordinals, %, commas, decimals
  scan(/(?<![\w.])(\d{1,3}(?:,\d{2,3})+|\d+)(?:\.(\d+))?(st|nd|rd|th)?(?![\p{L}\d])/gu, (m) => {
    const value = m[2] ? `${m[1]}.${m[2]}` : m[1];
    if (m[3]) return pushNum(value, m.index, m.index + m[0].length, { unit: 'ord' });
    const ua = unitAt(m.index + m[0].length);
    if (!ua && !moneyBefore(m.index) && /^(19|20)\d{2}$/.test(m[1]) && !m[2]) {
      tokens.push({ type: 'date', key: `${m[1]}--`, y: +m[1], m: null, d: null, raw: m[0], start: m.index, end: m.index + m[0].length });
      return true;
    }
    return pushNum(value, m.index, m.index + m[0].length);
  });
  // 6c. number words: "fifty rupees", "three years", "one per cent", "two lakh", "one in three", "half of"
  scan(new RegExp(`\\b(${NUM_SPELL})(?:\\s+(hundred|thousand|lakhs?|lacs?|crores?|million|billion))?\\b`, 'gi'), (m) => {
    const base = spellValue(m[1]);
    const v = m[2] ? base * (SCALE[m[2].toLowerCase()] || 1) : base;
    const after = text.slice(m.index + m[0].length);
    if (!ones && /^one$/i.test(m[1]) && !m[2] && !UNIT_AFTER.test(after) && !/^\s+(in|of every|out of)\s/i.test(after)) return false; // "one" as a pronoun
    if (/^zero$/i.test(m[1]) && !UNIT_AFTER.test(after)) return false;
    return pushNum(String(v), m.index, m.index + m[0].length, { word: true });
  });
  scan(new RegExp(`\\b(${ORD_WORD})\\b`, 'gi'), (m) => {
    // "first" / "second" are ordinary words; only ordinal words that name a day or a count position are tokens
    const after = text.slice(m.index + m[0].length);
    if (/^(first|second|third)$/i.test(m[1]) && !/^\s+(day|month|year|week|quarter|of)\b/i.test(after)) return false;
    return pushNum(String(ordWordValue(m[1])), m.index, m.index + m[0].length, { unit: 'ord', word: true });
  });
  scan(/\b(half|a quarter|three quarters|a third|two thirds|double|twice|a dozen|dozens?)\b/gi, (m) => {
    const w = m[1].toLowerCase();
    const v = { half: 0.5, 'a quarter': 0.25, 'three quarters': 0.75, 'a third': 1 / 3, 'two thirds': 2 / 3, double: 2, twice: 2, 'a dozen': 12, dozen: 12, dozens: 12 }[w];
    return pushNum(String(v), m.index, m.index + m[0].length, { unit: /double|twice/.test(w) ? 'times' : '', word: true });
  });
  scan(/\b(hundreds|thousands|lakhs|crores|millions|billions)\s+of\b/gi, (m) => pushNum(String(SCALE[m[1].toLowerCase().replace(/s$/, '')] || 0), m.index, m.index + m[0].length, { word: true }));
  return tokens.sort((a, b) => a.start - b.start);
}

const LAW_WORD = {
  section: 's', sections: 's', 'sub-section': 's', 'sub-sections': 's', subsection: 's', subsections: 's', clause: 's', clauses: 's', 's.': 's', 'ss.': 's',
  rule: 'r', rules: 'r', 'sub-rule': 'r', 'sub-rules': 'r', article: 'a', articles: 'a', paragraph: 'p', paragraphs: 'p', para: 'p', paras: 'p', regulation: 'g', regulations: 'g',
};
const COMP = '\\(([0-9a-zA-Z]{1,5})\\)';

/** Law references with parsed full keys. Masks what it consumes in `work`. */
function extractLaw(text, work, tokens) {
  const push = (sys, main, comps, start, end, raw) => {
    const m = String(main || '').toLowerCase();
    const cs = comps.map((c) => String(c).toLowerCase());
    tokens.push({ type: 'law', sys, main: m, comps: cs, key: `${sys}:${m}${cs.map((c) => `(${c})`).join('')}`, raw: raw ?? text.slice(start, end), start, end });
  };
  const cur = () => work.join('');
  const maskW = (s, e) => {
    for (let i = s; i < e; i++) work[i] = ' ';
  };
  // (a) nested: "clause (aa) to/of sub-section (2) of section 16", "sub-rule (6A) in the rule 60",
  //     lists: "sub-section (4), sub-section (5) and sub-section (6) of section 16"
  const SUBW = '(?:sub-sections?|subsections?|clauses?|sub-rules?|paragraphs?|items?)';
  const SUBREF = `${SUBW}\\s*${COMP}`;
  const nested = new RegExp(`(${SUBREF}(?:\\s*(?:,|and|or|to|of|in)\\s*(?:the\\s+)?${SUBREF})*)\\s*(?:of|to|in|under)\\s+(?:the\\s+)?(sections?|rules?|articles?)\\s+(\\d+[A-Z]{0,2})((?:\\s?${COMP})*)`, 'gi');
  for (const m of cur().matchAll(nested)) {
    const mainWord = m[0].match(/(sections?|rules?|articles?)\s+(\d+[A-Z]{0,2})/i);
    const main = mainWord[2];
    const sysOf = LAW_WORD[mainWord[1].toLowerCase()] || 's';
    const tail = [...String(m[0].slice(m[0].indexOf(mainWord[0]) + mainWord[0].length)).matchAll(new RegExp(COMP, 'g'))].map((x) => x[1]);
    // the chain "clause (aa) to sub-section (2)" is innermost-first: comps = [ (2), (aa) ]; a list is siblings
    const chainPart = m[1];
    const refs = [...chainPart.matchAll(new RegExp(`(${SUBW})\\s*${COMP}`, 'gi'))].map((x) => ({ w: x[1].toLowerCase(), c: x[2], i: x.index }));
    const joiners = [];
    for (let k = 1; k < refs.length; k++) joiners.push(chainPart.slice(refs[k - 1].i, refs[k].i).replace(/^.*?\)/, '').trim().toLowerCase());
    // split into sibling groups at "," / "and" / "or"; inside a group "to/of/in" nests (outer last)
    const groups = [[refs[0]]];
    for (let k = 1; k < refs.length; k++) {
      if (/^(,|and|or|,\s*and|,\s*or)$/.test(joiners[k - 1])) groups.push([refs[k]]);
      else groups[groups.length - 1].push(refs[k]);
    }
    for (const g of groups) push(sysOf, main, [...tail, ...g.slice().reverse().map((r) => r.c)], m.index, m.index + m[0].length);
    maskW(m.index, m.index + m[0].length);
  }
  // (b) "N. Heading.- (x)" (an Act's own section heading followed by its sub-section number)
  for (const m of cur().matchAll(/(?:^|\s)(\d{1,3}[A-Z]?)\.\s+[A-Z][^.()]{3,120}\.\s?-\s*\(([0-9a-z]{1,4})\)/g)) {
    const s = m.index + m[0].indexOf(m[1]);
    push('s', m[1], [m[2]], s, m.index + m[0].length);
    maskW(s, m.index + m[0].length);
  }
  // (c) "section 16(2)(aa)", "sections 16, 37 and 39", "rule 36(4)", "s.17(5)"; amendment style "In section 16 ...,
  //     in sub-section (2)" attaches the sub-section to that section
  const LAW = new RegExp(`\\b(sections?|rules?|articles?|paragraphs?|paras?|regulations?|ss?\\.)\\s*(\\d+[A-Z]{0,2})((?:\\s?${COMP})*)((?:\\s*(?:,|and|or|to)\\s*\\d+[A-Z]{0,2}(?:${COMP})*)*)`, 'gi');
  for (const m of cur().matchAll(LAW)) {
    const sys = LAW_WORD[m[1].toLowerCase()] || 's';
    const comps = [...String(m[3] || '').matchAll(new RegExp(COMP, 'g'))].map((x) => x[1]);
    const start = m.index;
    let end = m.index + m[0].length - (m[5] || '').length;
    // amendment style: ", in sub-section (2)" within the next 40 characters
    const after = text.slice(end, end + 140);
    const amend = !comps.length && after.match(new RegExp(`^[^.;()]{0,90}?\\bin\\s+(?:sub-section|sub-rule)\\s*${COMP}`, 'i'));
    if (amend) {
      comps.push(amend[1]);
      maskW(end, end + amend[0].length);
    }
    push(sys, m[2], comps, start, end, m[0].slice(0, end - start));
    if (m[5]) {
      const tailStart = m.index + m[0].length - m[5].length;
      for (const x of m[5].matchAll(new RegExp(`(\\d+[A-Z]{0,2})((?:${COMP})*)`, 'gi'))) {
        push(sys, x[1], [...x[2].matchAll(new RegExp(COMP, 'g'))].map((y) => y[1]), tailStart + x.index, tailStart + x.index + x[0].length);
      }
      end = m.index + m[0].length;
    }
    maskW(start, end);
  }
  // (d) parentless parts: "clause (a)", "sub-section (2)", "sub-rule (6A)"
  for (const m of cur().matchAll(new RegExp(`\\b(sub-sections?|subsections?|clauses?|sub-rules?)\\s*${COMP}`, 'gi'))) {
    push(LAW_WORD[m[1].toLowerCase()] || 's', '', [m[2]], m.index, m.index + m[0].length);
    maskW(m.index, m.index + m[0].length);
  }
}

/** A quote that IS a clause / sub-section of a law starts with its label: "(aa) the details ..." or "(4) A registered ...". */
function leadingLabel(quote) {
  const m = normText(quote).match(/^["']?\(([0-9a-z]{1,4})\)\s?(?=["'\p{L}])/iu);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Everything a set of quotes can vouch for: their tokens (with units, positions and the quote index), the leading
 * clause labels, and the text. There is no "any digit anywhere" set: a number only counts in its own role.
 */
export function quoteEvidence(texts) {
  const tokens = [];
  const labels = [];
  const lowers = [];
  const norms = [];
  texts.forEach((t, qi) => {
    const n = normText(t);
    norms.push(n);
    lowers.push(n.toLowerCase());
    for (const tok of extractTokens(n, { quoteMode: true })) tokens.push({ ...tok, qi });
    const lab = leadingLabel(n);
    if (lab) labels.push({ comp: lab, qi });
  });
  markOldValues(norms, tokens);
  return { tokens, labels, norms, text: lowers.join('\n') };
}

/** Marks quote tokens that are the OLD value of a change: "from Rs. 25,000/- to Rs. 10,000/-", "from 12% to 18%". */
function markOldValues(norms, tokens) {
  for (const a of tokens) {
    if (a.type !== 'num') continue;
    const n = norms[a.qi];
    const before = n.slice(Math.max(0, a.start - 12), a.start);
    if (!/\bfrom\s*(?:rs\.?|₹|inr)?\s*$/i.test(before)) continue;
    const b = tokens.find((t) => t.qi === a.qi && t.type === 'num' && t.start >= a.end && t.unit === a.unit && /^\s*(?:\/-)?\s*to\s*(?:rs\.?|₹|inr)?\s*$/i.test(n.slice(a.end, t.start)));
    if (b) {
      a.old = true;
      a.newKey = b.key;
    }
  }
}

const sameNum = (t, q) => q.type === 'num' && q.key === t.key && q.unit === t.unit;
const lawCovers = (t, q) => q.type === 'law' && q.sys === t.sys && (!t.main || q.main === t.main) && t.comps.every((c, i) => (t.main ? q.comps[i] === c : q.comps[q.comps.length - t.comps.length + i] === c));

/** Is a claim token vouched for by the evidence? Same type, same unit, same parsed key. Returns the matching quote tokens. */
export function coveringTokens(tok, ev) {
  switch (tok.type) {
    case 'num':
      return ev.tokens.filter((q) => sameNum(tok, q));
    case 'date':
      return ev.tokens.filter((q) => q.type === 'date' && (tok.y == null || q.y === tok.y) && (tok.m == null || q.m === tok.m) && (tok.d == null || q.d === tok.d) && (tok.y != null || tok.m != null || tok.d != null));
    case 'fy':
      return ev.tokens.filter((q) => q.type === 'fy' && q.key === tok.key);
    case 'id':
      return ev.tokens.filter((q) => q.type === 'id' && q.key === tok.key);
    case 'law': {
      const hits = ev.tokens.filter((q) => lawCovers(tok, q));
      // a parentless "clause (aa)" is also vouched for by a quote that is that clause ("(aa) the details ...")
      if (!tok.main && tok.comps.length === 1) for (const l of ev.labels || []) if (l.comp === tok.comps[0]) hits.push({ type: 'label', qi: l.qi, start: 0, end: 4 });
      // "section 16(4)" is vouched for by a quote holding section 16 that IS sub-section (4) ("(4) A registered ...")
      if (tok.main && tok.comps.length === 1) {
        for (const l of ev.labels || []) {
          if (l.comp === tok.comps[0] && ev.tokens.some((q) => q.type === 'law' && q.sys === tok.sys && q.main === tok.main && !q.comps.length)) hits.push({ type: 'label', qi: l.qi, start: 0, end: 4 });
        }
      }
      return hits;
    }
    default:
      return [];
  }
}
export const tokenCovered = (tok, ev) => coveringTokens(tok, ev).length > 0;

export const tokenLabel = (t) => {
  if (t.type === 'law') return `section/rule ${t.raw}`;
  if (t.type === 'id') return `document no. ${t.raw}`;
  if (t.type === 'fy') return `year ${t.raw}`;
  if (t.type === 'date') return `date "${t.raw}"`;
  const u = { '%': ' (a percentage)', money: ' (an amount of money)', day: ' (days)', month: ' (months)', year: ' (years)', week: ' (weeks)', ord: ' (an ordinal, like "14th")', times: ' (times)', pp: ' (percentage points)' }[t.unit] || '';
  return `number "${t.raw}"${u}`;
};

// =====================================================================================================================
// Words: content stems (context checks) and negation parity (sense checks)
// =====================================================================================================================

const STOP = new Set(('the a an and or of to in on at by for from with as is are was were be been being it its this that these those which who whom whose what when where how than then so such any each every all some can may might must shall will would should could do does did done has have had not no nor never only also just into onto over under up down out off about after before between through during per via within without unless until till while if but yet there their them they he she his her him our your you we us one two three four five six seven eight nine ten first same other another more most less least many much very own both either neither even still now here get gets got make makes made use used using say says said there its it\'s let lets like well way case cases thing things part also said out new').split(' '));
const MONTH_WORDS = new Set(MONTHS);
const stem = (w) => w.replace(/'s$/, '').replace(/ies$/, 'y').replace(/(ing|ed|es|s)$/, '').slice(0, 6);
/** Content-word stems of a text (letters only; stop words, month names and words under 3 letters dropped). */
export function contentStems(text) {
  const out = new Set();
  for (const w of normText(text).toLowerCase().match(/\p{L}[\p{L}'-]*/gu) || []) {
    const ww = w.replace(/^'+|'+$/g, '');
    if (ww.length < 3 || STOP.has(ww) || MONTH_WORDS.has(ww)) continue;
    for (const part of ww.split('-')) if (part.length >= 3 && !STOP.has(part)) out.add(stem(part));
  }
  return out;
}

const NEG_WORDS = /\b(not|never|nor|neither|none|nothing|nobody|nowhere|without|unless|cannot|except|no)\b|n't\b|\b(block(?:s|ed|ing)?|bar(?:s|red|ring)?|den(?:y|ies|ied|ial)|lose|loses|losing|lost|lapse[sd]?|lapsing|forfeit(?:s|ed)?|disallow(?:s|ed)?|ineligible|prohibit(?:s|ed)?|restrict(?:s|ed|ions?)?|refus(?:e|es|ed)|reject(?:s|ed)?|miss(?:es|ed|ing)?|lack(?:s|ed|ing)?|absent|fails?|failed)\b/gi;
/** Number of negations in a text ("No." before a number is an abbreviation, not a negation). */
export function negations(text) {
  const t = normText(text).replace(/\bno\.?\s*(?=\d)/gi, ' ');
  return (t.match(NEG_WORDS) || []).length;
}

const SENSE_WORDS = /\b(allow(?:s|ed|able)?|permit(?:s|ted)?|entitle(?:s|d|ment)?|eligib(?:le|ility)|ineligible|available|availab(?:ility)|required?|requires|mandatory|compulsory|obligatory|deemed|valid|invalid|payable|chargeable|exempt(?:ed|ion)?|taxable|blocked|restricted|prohibited|barred)\b/gi;
const SENSE_STEM = (w) => {
  const x = w.toLowerCase();
  if (/^allow/.test(x) || /^permit/.test(x)) return 'allow';
  if (/^entitle/.test(x)) return 'entitle';
  if (/eligib/.test(x)) return 'eligible';
  if (/^availab/.test(x) || x === 'available') return 'available';
  if (/^requir|mandatory|compulsory|obligatory/.test(x)) return 'required';
  if (/valid/.test(x)) return 'valid';
  if (/^exempt/.test(x)) return 'exempt';
  if (/blocked|restricted|prohibited|barred/.test(x)) return 'blocked';
  return x;
};
/** States of each rule word in a text: "N" negated / "P" plain, "C" conditional, "E" concessive. */
export function senseStates(text) {
  // quoted labels ("No Action") and "No." before a number are not negations
  const t = normText(text).replace(/"[^"]{1,40}"/g, ' X ').replace(/\bno\.?\s*(?=\d)/gi, ' ');
  const out = new Map();
  for (const sent of splitSentences(t)) {
    const s = sent.text;
    const cond = /\b(unless|only (?:if|when|where|after|once|to the extent)|provided that|subject to|on condition|as long as|so long as)\b/i.test(s);
    const conc = /\b(even (?:if|when|though|where|after)|regardless|irrespective|whether or not|in any case|anyway)\b/i.test(s);
    for (const m of s.matchAll(SENSE_WORDS)) {
      const before = s.slice(Math.max(0, m.index - 60), m.index).split(/[,;:]/).pop();
      const words = before.trim().split(/\s+/).slice(-5).join(' ');
      let neg = /\b(not|no|never|cannot|nor|neither|none|nothing)\b|n't\b/i.test(words);
      if (/^(ineligible|invalid)$/i.test(m[0])) neg = !neg;
      const k = SENSE_STEM(m[0]);
      if (!out.has(k)) out.set(k, new Set());
      out.get(k).add(`${neg ? 'N' : 'P'}${cond ? 'C' : ''}${conc ? 'E' : ''}`);
    }
  }
  return out;
}
const describeState = (st, w) => `${st[0] === 'N' ? 'not ' : ''}${w}${st.includes('C') ? ' only on a condition' : ''}${st.includes('E') ? ' even when ...' : ''}`;
/** null, or {word, claim, quote} when the claim uses a rule word of its quotes in another sense. */
export function senseMismatch(claimText, quotes) {
  const cs = senseStates(claimText);
  for (const [w, states] of cs) {
    const qStates = new Set();
    for (const q of quotes) for (const st of senseStates(q).get(w) || []) qStates.add(st);
    if (!qStates.size) continue;
    const ok = [...states].some((st) => qStates.has(st));
    if (!ok) return { word: w, claim: describeState([...states][0], w), quote: describeState([...qStates][0], w) };
  }
  return null;
}

// =====================================================================================================================
// The post as plain text (paragraph units with offsets) and its sentences
// =====================================================================================================================

/**
 * Splits markdown into plain-text units [{kind:'p'|'li'|'heading'|'quote', text, section, start, end}] and the
 * joined plain text ("\n\n" between units). `lexer` is marked.lexer (the website's markdown library).
 */
export function postUnits(markdown, lexer) {
  const tokens = lexer(String(markdown ?? ''));
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
      } else if (t.type === 'html') {
        units.push({ kind: ctx, text: normText(t.text ?? t.raw), section });
      }
    }
  };
  walk(tokens, 'p');
  const out = units.filter((x) => x.text);
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
    const lastWord = (before.match(/(?:^|[\s(])([A-Za-z][A-Za-z.]*)\.$/) || [])[1];
    if (lastWord && (ABBREV.has(lastWord.toLowerCase()) || /^[A-Z]$/.test(lastWord))) continue;
    if (/\d\.$/.test(before) && /^\s+\d/.test(text.slice(m.index + 1))) continue;
    out.push({ text: text.slice(start, endPunct).trim(), start, end: endPunct });
    start = m.index + m[0].length;
  }
  if (start < text.length) out.push({ text: text.slice(start).trim(), start, end: text.length });
  return out.filter((s) => s.text);
}

const TRIGGER_CI = /\b(sections?|sub-sections?|clauses?|circulars?|notifications?|gstr|ims|cbic|cbdt|gstn|rbi|dgca|iata|sebi|must|mandatory|compulsory|obligatory|required|have to|has to|had to|need to|needs to|deadlines?|due dates?|cut-?off|time limit|according to|survey(?:ed)?|study|studies|report(?:ed|s)? that|per ?cent|percent|lakhs?|crores?|million|billion|rupees?|paise|rs\.?|inr|statutory|penalt(?:y|ies)|fines?|fined|late fees?|interest (?:at|of|rate)|gazette|laws?|rules?(?!-)|lapses?|lapsed|expires?|expired|(?:gst|tax) rates?|rates? of (?:gst|tax)|allowed|entitled|eligible|ineligible|cancel(?:s|led|lation)|tax office|regulators?|ministry|tribunal)\b/i;
/** The narrower trigger for titles, descriptions, image alt text and FAQ questions (summaries, not statements). */
const TRIGGER_SUMMARY = /\b(must|mandatory|compulsory|obligatory|required|have to|has to|need to|deadlines?|due dates?|lapses?|lapsed|expires?|penalt(?:y|ies)|fines?|late fees?|allowed|entitled|eligible|ineligible|laws?|sections?|circulars?|notifications?|survey|according to|per ?cent|percent|lakhs?|crores?|rupees?)\b/i;
const TRIGGER_CS = /\b(Act|Acts|Rules?|Ministry|Council|Court|Tribunal|Board)\b|[%₹$€£]|\d/;
const MONTH_WORD = /\b(January|February|March|April|June|July|August|September|October|November|December)\b|\bMay\s+\d|\d\s+May\b/;
const QUOTE_MARKS = /"[^"]{12,}"/;

/** Why a sentence looks factual (empty string = it does not). */
export function factualReason(sentence, { heading = false, summary = false } = {}) {
  const s = normText(sentence);
  const toks = extractTokens(s);
  if (toks.length && (!heading || toks.some((t) => t.type !== 'num' || t.unit))) return `${toks[0].type === 'num' ? 'number' : toks[0].type} "${toks[0].raw}"`;
  if (/[%₹]/.test(s)) return 'percent/money';
  if (MONTH_WORD.test(s)) return 'date';
  if (summary) {
    const m = s.match(TRIGGER_SUMMARY);
    return m ? `"${m[0]}"` : '';
  }
  if (heading) return '';
  if (QUOTE_MARKS.test(s)) return 'quotation';
  const m = s.match(TRIGGER_CI) || s.match(TRIGGER_CS);
  return m ? `"${m[0]}"` : '';
}

const ILLUSTRATIVE_START = /^(?:["'(]*)(for example|for instance|illustrative|illustration|example:|hypothetical|take an illustrative|in an illustrative|an illustrative|imagine|suppose|say)\b/i;
const RULE_WORDS = /\b(must|mandatory|compulsory|obligatory|required|deadlines?|due dates?|laws?|legally|statutory|sections?|circulars?|notifications?|penalt(?:y|ies)|fines?|late fees?|interest|rupees?|paise|lakhs?|crores?|entitled|eligible|lapses?|expires?)\b|\b(Act|Acts|Rules)\b/;
const RULE_WORDS_CI = new RegExp(RULE_WORDS.source.split('|\\b(Act')[0], 'i');
const RELATIVE_TIME = /\b(recently|recent months|recent years|this year|last year|next year|this financial year|this fiscal|currently|at present|presently|nowadays|these days|as of now|as of today|so far this|this week|this month|in the coming (?:weeks|months)|upcoming|latest (?:rules?|changes?|circular|notification|update))\b/i;
export const LAW_NAME = /\b(Act|Acts|Rules|Circulars?|Notifications?|Ordinance|Gazette|sections?|sub-sections?|rules?\s+\d|clauses?)\b/;

// =====================================================================================================================
// Quotes in sources
// =====================================================================================================================

/** Finds a quote in source text: 'exact' | 'loose' | null, plus the longest matching word prefix for diagnostics. */
export function findQuote(quote, text, forms = null) {
  const q = strictForm(quote);
  const t = forms?.strict ?? strictForm(text);
  if (q && t.includes(q)) return { match: 'exact' };
  const lq = looseForm(quote);
  const lt = forms?.loose ?? looseForm(text);
  if (lq && lt.includes(lq)) return { match: 'loose' };
  const words = normText(quote).split(' ');
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
 * Finds a quote in a source, page by page for PDFs. src = { kind, text?, pages? (sparse, index = page - 1) }.
 * Searches `onlyPages` when given (the server extracts only the pages a claim recorded). Returns
 * { match, pages? } where pages are the 1-based page numbers that hold the quote (one page or two adjacent ones).
 */
export function locateQuote(quote, src, onlyPages = null, cache = new Map()) {
  const formsOf = (key, text) => {
    if (!cache.has(key)) cache.set(key, { strict: strictForm(text), loose: looseForm(text) });
    return cache.get(key);
  };
  if (src.kind !== 'pdf' || !Array.isArray(src.pages)) {
    const r = findQuote(quote, src.text, formsOf('all', src.text));
    return r;
  }
  const pages = src.pages;
  const cand = onlyPages && onlyPages.length ? [onlyPages.map(Number)] : null;
  const tryRange = (a, b) => {
    const parts = [];
    for (let p = a; p <= b; p++) {
      if (typeof pages[p - 1] !== 'string') return null;
      parts[p - 1] = pages[p - 1];
    }
    const text = pdfText(parts);
    const r = findQuote(quote, text, formsOf(`${a}-${b}`, text));
    return r.match ? { match: r.match, pages: a === b ? [a] : [a, b] } : r;
  };
  if (cand) {
    const ps = cand[0];
    if (ps.length > 2 || ps.some((p) => !Number.isInteger(p) || p < 1) || (ps.length === 2 && ps[1] !== ps[0] + 1)) return { match: null, prefixWords: 0, prefix: '' };
    return tryRange(ps[0], ps[ps.length - 1]) || { match: null, prefixWords: 0, prefix: '' };
  }
  let bestMiss = { match: null, prefixWords: 0, prefix: '' };
  for (let p = 1; p <= pages.length; p++) {
    const r = tryRange(p, p);
    if (r?.match) return r;
    if (r && r.prefixWords > bestMiss.prefixWords) bestMiss = r;
  }
  for (let p = 1; p < pages.length; p++) {
    const r = tryRange(p, p + 1);
    if (r?.match) return r;
  }
  return bestMiss;
}

// =====================================================================================================================
// Derived claims: a machine-checked derivation (no free text)
// =====================================================================================================================

const dayOf = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const fmtDate = ({ y, m, d }) => [d, m ? MONTH_NAME(m) : null, y].filter((x) => x != null).join(' ');
const dateEq = (a, b) => a.y === b.y && a.m === b.m && a.d === b.d;
function parseOne(s, want) {
  const toks = extractTokens(normText(String(s ?? '')), { quoteMode: true });
  return toks.find((t) => t.type === want) || null;
}
function parseDateish(s) {
  const d = parseOne(s, 'date');
  return d ? { y: d.y, m: d.m, d: d.d } : null;
}
function shiftMonths({ y, m }, n) {
  const idx = (m - 1) + n;
  const mm = ((idx % 12) + 12) % 12 + 1;
  const yy = y == null ? null : y + Math.floor(idx / 12);
  return { y: yy, m: mm };
}

export const DERIVED_OPS = ['fy_end', 'after_fy', 'month_shift', 'add_days', 'within', 'arith', 'percent_of', 'count'];

/**
 * Evaluates derived.steps. Each step's inputs must come from the claim's quotes, from the claims named in
 * derived.from, from an earlier step's result, or (date and FY anchors only) from the claim itself as the premise of
 * a worked example. Every result is computed here; a step whose stated result differs is an error.
 * Returns { errors, results: [token], premises: [token], arithmetic: "human-readable working" }.
 *   {op:'fy_end', fy:'2025-26', result:'31 March 2026'}
 *   {op:'after_fy', fy:'2025-26', date:'30 November', result:'30 November 2026'}   (first such day after the FY ends)
 *   {op:'month_shift', from:'June 2026', months:1, day?:14, result:'14 July 2026'}  (|months| > 1 must be quoted)
 *   {op:'add_days', from:'1 July 2026', days:30, result:'31 July 2026'}
 *   {op:'within', date:'5 July', from:'12 June', to:'11 July'}                        (an assertion)
 *   {op:'arith', a:25000, operator:'-', b:10000, result:15000, unit?:'money'}
 *   {op:'percent_of', percent:18, of:1000, result:180}
 *   {op:'count', items:['clause (a)', 'clause (aa)'], result:'two'}                    (items in the quotes / from claims)
 */
export function evaluateDerived(derived, { quoteEv, fromEv, fromText = '', claimTokens }) {
  const errors = [];
  const results = [];
  const premises = [];
  const lines = [];
  const steps = derived?.steps;
  if (!Array.isArray(steps) || !steps.length || steps.length > 12) return { errors: ['derived.steps must be a list of 1 to 12 steps (see playbook/blog-writing.md 1b); free-text arithmetic is not accepted'], results, premises, arithmetic: '' };
  let quoteInputs = 0;
  const resultEv = { tokens: [], labels: [] };
  const avail = (tok) => tokenCovered(tok, quoteEv) ? 'quote' : fromEv && tokenCovered(tok, fromEv) ? 'from' : tokenCovered(tok, resultEv) ? 'step' : null;
  const anchor = (tok, label, si) => {
    if (!tok) {
      errors.push(`derived.steps[${si}].${label} is not a date or financial year the engine can read`);
      return null;
    }
    const a = avail(tok);
    if (a) {
      if (a !== 'step') quoteInputs += 1;
      return a;
    }
    if (claimTokens.some((c) => c.type === tok.type && (tok.type === 'fy' ? c.key === tok.key : (c.y ?? null) === (tok.y ?? null) && (c.m ?? null) === (tok.m ?? null) && (c.d ?? null) === (tok.d ?? null)))) {
      premises.push(tok);
      return 'premise';
    }
    errors.push(`derived.steps[${si}].${label} "${tok.raw}" is not in the quotes, in a claim named in derived.from, in an earlier step or in the claim`);
    return null;
  };
  const numberAvail = (n, units, si, label) => {
    const ok = [quoteEv, fromEv, resultEv].filter(Boolean).some((ev) => ev.tokens.some((q) => (q.type === 'num' && q.key === normNum(n) && units.includes(q.unit)) || (units.includes('day-of-month') && q.type === 'date' && q.d === Number(n))));
    if (!ok) errors.push(`derived.steps[${si}].${label} ${n} is not a number in the quotes (or in a claim named in derived.from); quote the passage that gives it`);
    else quoteInputs += 1;
    return ok;
  };
  const addResult = (tok, si, stated) => {
    const want = typeof stated === 'number' ? { type: 'num', key: normNum(stated) } : parseOne(stated, tok.type);
    const equal = want && (tok.type === 'date' ? dateEq({ y: want.y ?? null, m: want.m ?? null, d: want.d ?? null }, tok) : normNum(want.key) === normNum(tok.key));
    if (!equal) {
      errors.push(`derived.steps[${si}] works out to ${tok.type === 'date' ? fmtDate(tok) : tok.key}, not ${JSON.stringify(stated)}`);
      return;
    }
    const r = { ...tok, raw: String(stated), start: 0, end: 0 };
    results.push(r);
    resultEv.tokens.push(r);
  };
  for (const [si, st] of steps.entries()) {
    if (!st || typeof st !== 'object' || !DERIVED_OPS.includes(st.op)) {
      errors.push(`derived.steps[${si}].op must be one of ${DERIVED_OPS.join(', ')}`);
      continue;
    }
    try {
      if (st.op === 'fy_end' || st.op === 'after_fy') {
        const fy = parseOne(String(st.fy ?? '').replace(/^(?!FY)/i, 'FY '), 'fy');
        if (!anchor(fy, 'fy', si)) continue;
        const endY = Number(fy.key) + 1;
        if (st.op === 'fy_end') {
          addResult({ type: 'date', y: endY, m: 3, d: 31 }, si, st.result);
          lines.push(`FY ${fy.raw.replace(/^FY\s?/i, '')} ends on 31 March ${endY}`);
        } else {
          const d = parseDateish(st.date);
          if (!d || d.d == null || d.m == null || d.y != null) {
            errors.push(`derived.steps[${si}].date must be a day and month without a year, for example "30 November"`);
            continue;
          }
          if (!anchor({ type: 'date', ...d, raw: String(st.date) }, 'date', si)) continue;
          const y = d.m >= 4 ? endY : endY + 1;
          if (d.d > dayOf(y, d.m)) throw new Error(`${st.date} does not exist in ${y}`);
          addResult({ type: 'date', y, m: d.m, d: d.d }, si, st.result);
          lines.push(`the ${d.d} ${MONTH_NAME(d.m)} after FY ${fy.raw.replace(/^FY\s?/i, '')} ends (31 March ${endY}) is ${d.d} ${MONTH_NAME(d.m)} ${y}`);
        }
      } else if (st.op === 'month_shift') {
        const from = parseDateish(st.from);
        if (!from || from.m == null) {
          errors.push(`derived.steps[${si}].from must name a month ("June 2026", "30 November 2027", "June")`);
          continue;
        }
        if (!anchor({ type: 'date', ...from, raw: String(st.from) }, 'from', si)) continue;
        const n = Number(st.months);
        if (!Number.isInteger(n) || Math.abs(n) > 24) {
          errors.push(`derived.steps[${si}].months must be a whole number of months`);
          continue;
        }
        if (Math.abs(n) > 1 && !numberAvail(Math.abs(n), ['month', ''], si, 'months')) continue;
        const to = shiftMonths(from, n);
        let day = null;
        if (st.day !== undefined && st.day !== null) {
          day = Number(st.day);
          if (!Number.isInteger(day) || day < 1 || day > 31) throw new Error('day must be 1 to 31');
          if (!numberAvail(day, ['ord', '', 'day-of-month'], si, 'day')) continue;
          if (to.y != null && day > dayOf(to.y, to.m)) throw new Error(`${MONTH_NAME(to.m)} ${to.y} has no day ${day}`);
        }
        addResult({ type: 'date', y: to.y, m: to.m, d: day }, si, st.result);
        lines.push(`${day ? `the ${day}th of ` : ''}${n === 0 ? 'the same month as' : `${Math.abs(n)} month${Math.abs(n) > 1 ? 's' : ''} ${n > 0 ? 'after' : 'before'}`} ${fmtDate(from)} is ${fmtDate({ ...to, d: day })}`.replace(/\b(1|21|31)th\b/, '$1st').replace(/\b(2|22)th\b/, '$1nd').replace(/\b(3|23)th\b/, '$1rd'));
      } else if (st.op === 'add_days') {
        const from = parseDateish(st.from);
        if (!from || from.d == null || from.m == null || from.y == null) {
          errors.push(`derived.steps[${si}].from must be a full date ("1 July 2026")`);
          continue;
        }
        if (!anchor({ type: 'date', ...from, raw: String(st.from) }, 'from', si)) continue;
        const n = Number(st.days);
        if (!Number.isInteger(n) || n < -3660 || n > 3660 || !numberAvail(Math.abs(n), ['day'], si, 'days')) continue;
        const dt = new Date(Date.UTC(from.y, from.m - 1, from.d + n));
        addResult({ type: 'date', y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() }, si, st.result);
        lines.push(`${fmtDate(from)} ${n >= 0 ? 'plus' : 'minus'} ${Math.abs(n)} days is ${dt.getUTCDate()} ${MONTH_NAME(dt.getUTCMonth() + 1)} ${dt.getUTCFullYear()}`);
      } else if (st.op === 'within') {
        const d = parseDateish(st.date);
        const a = parseDateish(st.from);
        const b = parseDateish(st.to);
        if (![d, a, b].every((x) => x && x.m != null && x.d != null)) {
          errors.push(`derived.steps[${si}] (within) needs date, from and to as day and month`);
          continue;
        }
        if (!anchor({ type: 'date', ...d, raw: String(st.date) }, 'date', si) || !anchor({ type: 'date', ...a, raw: String(st.from) }, 'from', si) || !anchor({ type: 'date', ...b, raw: String(st.to) }, 'to', si)) continue;
        const key = (x) => (x.y ?? 0) * 10000 + x.m * 100 + x.d;
        const yearless = d.y == null || a.y == null || b.y == null;
        let inside;
        if (yearless) {
          const k = (x) => x.m * 100 + x.d;
          inside = k(a) <= k(b) ? k(a) <= k(d) && k(d) <= k(b) : k(d) >= k(a) || k(d) <= k(b);
        } else inside = key(a) <= key(d) && key(d) <= key(b);
        if (!inside) errors.push(`derived.steps[${si}]: ${fmtDate(d)} is not between ${fmtDate(a)} and ${fmtDate(b)}`);
        else lines.push(`${fmtDate(d)} falls between ${fmtDate(a)} and ${fmtDate(b)}`);
      } else if (st.op === 'arith' || st.op === 'percent_of') {
        const unit = typeof st.unit === 'string' ? st.unit : '';
        let v;
        if (st.op === 'arith') {
          const a = Number(st.a);
          const b = Number(st.b);
          if (!Number.isFinite(a) || !Number.isFinite(b) || !['+', '-', '*', '/'].includes(st.operator)) throw new Error('arith needs numbers a and b and operator + - * /');
          if (!numberAvail(a, [unit, ''], si, 'a') || !numberAvail(b, [unit, '', '%', 'times', 'day', 'month', 'year'], si, 'b')) continue;
          v = st.operator === '+' ? a + b : st.operator === '-' ? a - b : st.operator === '*' ? a * b : a / b;
          lines.push(`${a} ${st.operator === '*' ? '×' : st.operator === '/' ? '÷' : st.operator} ${b} = ${normNum(v)}`);
        } else {
          const p = Number(st.percent);
          const of = Number(st.of);
          if (!Number.isFinite(p) || !Number.isFinite(of)) throw new Error('percent_of needs numbers percent and of');
          if (!numberAvail(p, ['%'], si, 'percent') || !numberAvail(of, [unit, '', 'money'], si, 'of')) continue;
          v = (p / 100) * of;
          lines.push(`${p}% of ${of} = ${normNum(v)}`);
        }
        const stated = parseOne(String(st.result), 'num');
        if (!stated || Math.abs(Number(stated.key) - v) > 1e-6 * Math.max(1, Math.abs(v))) {
          errors.push(`derived.steps[${si}] works out to ${normNum(v)}, not ${JSON.stringify(st.result)}`);
          continue;
        }
        const r = { type: 'num', key: normNum(v), unit: stated.unit || unit, raw: String(st.result), start: 0, end: 0 };
        results.push(r);
        resultEv.tokens.push(r);
      } else if (st.op === 'count') {
        const items = Array.isArray(st.items) ? st.items.map((x) => strictForm(x)).filter(Boolean) : [];
        if (items.length < 2 || items.length > 30 || new Set(items).size !== items.length) throw new Error('count needs 2 to 30 different items');
        const hay = `${quoteEv.text}\n${strictForm(fromText)}`;
        const missingItems = items.filter((x) => !hay.includes(x));
        if (missingItems.length) {
          errors.push(`derived.steps[${si}]: ${missingItems.map((x) => `"${x}"`).join(', ')} not in the quotes or in the claims named in derived.from`);
          continue;
        }
        quoteInputs += 1;
        const stated = parseOne(String(st.result), 'num');
        if (!stated || Number(stated.key) !== items.length) {
          errors.push(`derived.steps[${si}] counts ${items.length} items, not ${JSON.stringify(st.result)}`);
          continue;
        }
        const r = { type: 'num', key: String(items.length), unit: '', raw: String(st.result), start: 0, end: 0 };
        results.push(r);
        resultEv.tokens.push(r);
        lines.push(`${items.length} = ${st.items.join(', ')}`);
      }
    } catch (e) {
      errors.push(`derived.steps[${si}]: ${e.message}`);
    }
  }
  if (!errors.length && !quoteInputs) errors.push('derived.steps must use at least one date or number from the quotes (a derivation from the claim alone proves nothing)');
  return { errors, results, premises, arithmetic: lines.join('; ') };
}

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

/** The exact content a fact-check verdict is bound to (callers hash it with sha256). */
export function claimFingerprint(c) {
  const qs = [{ source_url: c?.source_url, quote: c?.quote }, ...(Array.isArray(c?.extra_quotes) ? c.extra_quotes : [])].filter((q) => q && (q.source_url || q.quote)).map((q) => [String(q.source_url ?? '').trim(), normText(q.quote ?? '')]);
  return JSON.stringify(['claim-v1', String(c?.id ?? ''), String(c?.kind ?? ''), normText(stripInlineMarkdown(c?.claim_text ?? '')), qs, c?.derived?.steps ?? null, normText(c?.note ?? '')]);
}

export const FACTCHECK_VERDICTS = ['correct', 'wrong', 'unsure'];

/**
 * Verifies a claims ledger. All I/O is in the callbacks:
 *   lexer:          marked.lexer
 *   getSource(url, {sha, pages}) -> { error } | { entry: {sha256, text_sha256, fetched_at, title, kind, url, final_url}, kind, text?, pages? }
 *   hash(string) -> hex sha256 (sync or async)
 *   requireFactcheck: true = every claim needs factcheck {verdict:'correct', claim_hash} (law claims also current:true)
 * Returns { passed, messages, warnings, stats, claims: [verified claim with sources] }.
 */
export async function verifyLedger(claimsInput, { markdown, frontmatter = {}, faq = [], lexer, getSource, hash, requireFactcheck = true }) {
  const errors = [];
  const warnings = [];
  const claims = asArray(claimsInput);
  if (!claims) return { passed: false, messages: ['claims must be a JSON array (or {"claims": [...]})'], warnings, stats: {}, claims: [] };
  if (!claims.length) errors.push('claims is empty: every factual sentence of the post needs a claim');
  if (claims.length > 400) return { passed: false, messages: ['at most 400 claims per post'], warnings, stats: {}, claims: [] };

  const { units: bodyUnits, plain: bodyPlain } = postUnits(markdown, lexer);
  // The title, description, image alt text and FAQ answers are checked like body text: they are extra units after
  // the body, and a claim may point at them.
  const units = bodyUnits.map((u) => ({ ...u, field: 'body' }));
  let plain = bodyPlain;
  const extras = [['title', frontmatter.title], ['description', frontmatter.description], ['imageAlt', frontmatter.imageAlt]];
  for (const [n, f] of (Array.isArray(faq) ? faq : []).entries()) {
    extras.push([`faq[${n}].q`, f?.q ?? f?.question ?? '']);
    extras.push([`faq[${n}].a`, f?.a ?? f?.answer ?? '']);
  }
  for (const [field, value] of extras) {
    const t = normText(stripInlineMarkdown(String(value ?? '')));
    if (!t) continue;
    plain += '\n\n';
    const start = plain.length;
    plain += t;
    units.push({ kind: field.endsWith('.q') || field === 'title' ? 'heading' : 'p', text: t, section: -1, start, end: plain.length, field });
  }
  const lowerPlain = plain.toLowerCase();
  const verified = [];
  const intervals = []; // [start, end, claimIndex]
  const ids = new Set();
  const sourceCache = new Map();
  const formCache = new Map();
  const byId = new Map(claims.filter((c) => c && typeof c === 'object').map((c) => [String(c.id ?? ''), c]));

  const getSrc = async (url, sha, pages) => {
    const k = `${url}\n${sha ?? ''}\n${(pages || []).join(',')}`;
    if (!sourceCache.has(k)) sourceCache.set(k, await getSource(url, { sha, pages }));
    return sourceCache.get(k);
  };

  for (const [i, c] of claims.entries()) {
    const label = `claim ${c && c.id != null ? JSON.stringify(String(c.id)) : `#${i + 1}`}`;
    const before = errors.length;
    const err = (msg) => errors.push(`${label}: ${msg}`);
    const isOk = () => errors.length === before;
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

    // (1) claim_text is in the post (or in its title / description / image alt / FAQ)
    const needle = claimText.toLowerCase();
    const occ = [];
    for (let at = lowerPlain.indexOf(needle); at >= 0; at = lowerPlain.indexOf(needle, at + 1)) occ.push(at);
    if (!occ.length) err(`claim_text not found in the post: "${excerpt(claimText)}" (copy it exactly from the post, markdown removed)`);
    for (const at of occ) intervals.push([at, at + needle.length, i]);

    const out = { id, kind, claim_text: claimText };
    const claimTokens = extractTokens(claimText);
    const lawish = claimTokens.some((t) => t.type === 'law' || t.type === 'id') || LAW_NAME.test(claimText);

    // (6) fact-check verdict bound to this exact claim
    const fp = claimFingerprint(c);
    const claimHash = await hash(fp);
    out.claim_hash = claimHash;
    if (requireFactcheck) {
      const fc = c.factcheck;
      if (!fc || typeof fc !== 'object') err('no fact-check verdict: the independent fact-checker must record {verdict, note} for every claim (playbook/blog-editing.md step 4; cli.js factcheck-sheet)');
      else {
        if (fc.claim_hash !== claimHash) err('the fact-check verdict was given for a different version of this claim (claim_hash differs); check it again');
        if (fc.verdict !== 'correct') err(`the fact-checker's verdict is "${fc.verdict}"${fc.note ? ` (${excerpt(fc.note, 120)})` : ''}: fix or remove the sentence`);
        if (wordCount(fc.note ?? '') < 3) err('the fact-check verdict needs a short note saying what was checked');
        if ((kind === 'law' || lawish) && SOURCED_KINDS.includes(kind) && fc.current !== true) err('law claims need the fact-checker to confirm the rule is still current (factcheck.current: true, after searching for newer circulars, notifications and Finance Acts)');
      }
      if (fc && typeof fc === 'object') out.factcheck = { verdict: fc.verdict, note: normText(fc.note ?? '').slice(0, 500), current: fc.current === true, checked_at: fc.checked_at ?? null, claim_hash: fc.claim_hash ?? null };
    }

    if (kind === 'dhiti') {
      if (c.source_url || c.quote) err('dhiti claims use the owner-approved proof points, not a source_url or quote');
      const phrase = DHITI_FACTS.find((f) => needle.includes(f));
      if (!phrase) err(`dhiti claims must use one of the owner-approved proof points exactly: ${DHITI_FACTS.map((f) => `"${f}"`).join(', ')}`);
      else {
        const pev = quoteEvidence([phrase]);
        const miss = claimTokens.filter((t) => !tokenCovered(t, pev));
        if (miss.length) err(`${miss.map(tokenLabel).join(', ')} is not an owner-approved Dhiti number`);
      }
      out.phrase = phrase ?? null;
      out.verified = isOk();
      out.occurrences = occ;
      verified.push(out);
      continue;
    }

    if (kind === 'illustrative' || kind === 'advice') {
      if (c.source_url || c.quote) err(`${kind} claims have no source_url or quote (a sourced fact is kind fact, law, stat, date or quote)`);
      if (kind === 'advice') {
        const note = normText(c.note ?? '');
        if (wordCount(note) < 3) err('advice claims need a "note" saying why this is a recommendation or process step and not a fact');
        // advice may name a day of the month ("by the 15th") and nothing else that could be a fact
        const bad = claimTokens.filter((t) => !(t.type === 'num' && t.unit === 'ord' && Number(t.key) >= 1 && Number(t.key) <= 31));
        const rule = claimText.match(RULE_WORDS_CI) || claimText.match(RULE_WORDS);
        if (bad.length) err(`advice cannot carry facts (${bad.map((t) => t.raw).join(', ')}); split the sentence and cite the fact as a sourced claim`);
        if (rule) err(`advice cannot state rules ("${rule[0]}"); a rule is a sourced claim (kind law), and a recommendation is phrased as one ("we suggest", "set the field so ...")`);
        if (/[%₹]/.test(claimText)) err('advice cannot carry percentages or money');
        out.note = note;
      } else {
        const bad = claimTokens.filter((t) => t.type === 'law' || t.type === 'id' || t.type === 'fy' || (t.type === 'num' && ['%', 'money', 'pp'].includes(t.unit)));
        if (bad.length || /[%₹]/.test(claimText)) err(`an illustrative example cannot carry law references, document numbers, financial years, percentages or money (${bad.map((t) => t.raw).join(', ') || '%/₹'}); those are facts and need a source`);
        if (/\b(must|mandatory|law|section|rules?(?!-)|deadline|penalt)/i.test(claimText)) err('an illustrative example cannot state a rule ("must", "law", "section", "deadline"); cite the rule as a sourced claim');
      }
      out.verified = isOk();
      out.occurrences = occ;
      verified.push(out);
      continue;
    }

    // sourced kinds
    const quotes = [{ source_url: c.source_url, quote: c.quote, source_title: c.source_title, sha256: c.sha256, pages: c.pages }];
    if (c.extra_quotes !== undefined) {
      if (!Array.isArray(c.extra_quotes) || c.extra_quotes.length > 8) err('extra_quotes must be an array of at most 8 {source_url, quote}');
      else quotes.push(...c.extra_quotes);
    }
    if (!normText(c.source_title ?? '')) err('source_title is required ("Publisher: page title (Mon YYYY)")');
    const evidenceTexts = [];
    const sourcesOut = [];
    for (const [qi, q] of quotes.entries()) {
      const qlabel = qi === 0 ? '' : ` (extra_quotes[${qi - 1}])`;
      const url = String(q?.source_url ?? '').trim();
      if (!/^https:\/\/[^\s/]+\.[^\s/]+/i.test(url)) {
        err(`source_url${qlabel} must be an https URL`);
        continue;
      }
      const quote = normText(q?.quote ?? '');
      const wc = wordCount(quote);
      if (wc < QUOTE_MIN_WORDS || wc > QUOTE_MAX_WORDS) {
        err(`quote${qlabel} must be ${QUOTE_MIN_WORDS} to ${QUOTE_MAX_WORDS} words copied verbatim from the source (got ${wc})`);
        continue;
      }
      // (2) fetched by the engine (the server keeps the bytes, sha256-bound)
      const src = await getSrc(url, q.sha256 || undefined, Array.isArray(q.pages) ? q.pages : undefined);
      if (src.error) {
        err(`source ${url}${qlabel}: ${src.error}`);
        continue;
      }
      // (3) quote in the fetched text (PDFs page by page)
      const key = `${src.entry.sha256}`;
      if (!formCache.has(key)) formCache.set(key, new Map());
      const found = locateQuote(quote, src, Array.isArray(q.pages) && src.kind === 'pdf' ? q.pages : null, formCache.get(key));
      if (!found.match) {
        err(`quote${qlabel} is not in the fetched text of ${url} (sha256 ${src.entry.sha256.slice(0, 12)}${Array.isArray(q.pages) ? `, page ${q.pages.join('-')}` : ''})${found.prefixWords ? `; only the first ${found.prefixWords} words match ("${excerpt(found.prefix, 60)}")` : ''}. Copy the quote verbatim from that page, or cite the page that says it`);
        continue;
      }
      let host = '';
      try {
        host = new URL(url).hostname;
      } catch {
        /* checked above */
      }
      // (5) primary sources for anything that states law, whatever its kind
      if ((kind === 'law' || lawish) && qi === 0 && !PRIMARY_HOST.test(host)) err(`claims about law (sections, rules, circulars, notifications, Acts) must cite a primary source (a government, regulator or gazette site) first, not ${host}`);
      if (kind === 'stat' && qi === 0 && !PRIMARY_HOST.test(host)) warnings.push(`${label}: market stat from ${host}; the sentence must name who published it`);
      if ((kind === 'law' || lawish) && /amended[-_ ]?(?:up[-_ ]?to[-_ ]?)?(\d{2})[.\-_]?(\d{2})[.\-_]?((?:19|20)\d{2})/i.test(`${url} ${src.entry.title ?? ''} ${q.source_title ?? ''}`)) {
        warnings.push(`${label}: ${url} is a consolidated text "as amended" up to an old date; the fact-checker must confirm no later Finance Act changed the quoted words`);
      }
      evidenceTexts.push(quote);
      sourcesOut.push({
        source_url: url,
        source_title: normText(q.source_title ?? c.source_title ?? src.entry.title ?? ''),
        quote,
        fetched_at: src.entry.fetched_at,
        sha256: src.entry.sha256,
        text_sha256: src.entry.text_sha256 ?? null,
        source_text_path: src.entry.text_path ?? src.entry.raw_path ?? null,
        local_text: src.localText ?? null,
        match: found.match,
        ...(found.pages ? { pages: found.pages } : {}),
      });
    }

    if (evidenceTexts.length === quotes.length) {
      const ev = quoteEvidence(evidenceTexts);
      // superseded provisions
      for (const s of SUPERSEDED) {
        const hitQ = evidenceTexts.findIndex((q) => s.quote.test(strictForm(q)));
        if (hitQ < 0) continue;
        const uses = !s.tokens || claimTokens.some((t) => s.tokens.some((x) => x.type === t.type && x.key === t.key && (x.unit ?? t.unit) === t.unit));
        if (uses && !PAST_MARKER.test(claimText)) err(`superseded: ${s.message}`);
      }
      // (4) tokens: same type and unit in the quotes, or produced by derived.steps
      let missing = claimTokens.filter((t) => !tokenCovered(t, ev));
      if (c.derived !== undefined && c.derived !== null) {
        const fromIds = Array.isArray(c.derived.from) ? c.derived.from.map(String) : [];
        for (const f of fromIds) if (!byId.has(f) || f === id) err(`derived.from names unknown claim "${f}"`);
        const fromTexts = fromIds.filter((f) => byId.has(f) && f !== id).map((f) => normText(stripInlineMarkdown(byId.get(f).claim_text ?? '')));
        const fromEv = fromTexts.length ? quoteEvidence(fromTexts) : null;
        const d = evaluateDerived(c.derived, { quoteEv: ev, fromEv, fromText: fromTexts.join('\n'), claimTokens });
        for (const e of d.errors) err(e);
        const dev = { tokens: [...d.results, ...d.premises], labels: [] };
        if (!d.errors.length) {
          const unused = d.results.filter((r) => !claimTokens.some((t) => tokenCovered(t, { tokens: [r], labels: [] })) && !c.derived.steps.some((s) => Object.values(s).some((v) => typeof v === 'string' && normText(v) === normText(r.raw) && v !== s.result)));
          if (unused.length) err(`derived.steps produce ${unused.map((r) => `"${r.raw}"`).join(', ')}, which the claim does not use`);
        }
        missing = missing.filter((t) => !tokenCovered(t, dev));
        out.derived = { steps: c.derived.steps, from: fromIds, arithmetic: d.arithmetic };
      }
      if (missing.length) err(`${missing.map(tokenLabel).join(', ')} not in the quote${c.derived ? ' and not produced by derived.steps' : ''}; quote the passage that states it in the same form (a percentage by a percentage, days by days), or add derived.steps that compute it`);

      // context: each number and each full date is used with the words around it in the quote
      const claimStems = contentStems(claimText);
      for (const t of claimTokens) {
        if (missing.includes(t)) continue;
        if (!(t.type === 'num' || (t.type === 'date' && t.d != null) || t.type === 'law')) continue;
        const hits = coveringTokens(t, ev).filter((q) => q.type !== 'label');
        if (!hits.length) continue; // produced by derived.steps
        const ctxOk = hits.some((q) => {
          const n = ev.norms[q.qi];
          const win = contentStems(n.slice(Math.max(0, q.start - 200), Math.min(n.length, q.end + 200)));
          for (const s of win) if (claimStems.has(s)) return true;
          return false;
        });
        if (!ctxOk) err(`${tokenLabel(t)} is in the quote, but in another context (no word of the claim is near it in the quote); quote the passage that says this about it`);
        // old value of a change ("from 12% to 18%")
        if (t.type === 'num' && hits.every((q) => q.old) && !PAST_MARKER.test(claimText) && !claimTokens.some((x) => x.type === 'num' && x.key === hits[0].newKey)) err(`${tokenLabel(t)} is the OLD value in the quote ("from ${t.raw} to ..."); say it was replaced, or use the new value`);
      }
      // a specific sub-section binds: the quote that gives a claim's numbers and full dates must be about that sub-section
      const subLaws = claimTokens.filter((t) => t.type === 'law' && t.main && t.comps.length);
      if (subLaws.length) {
        for (const t of claimTokens) {
          if (!(t.type === 'num' && t.unit) && !(t.type === 'date' && t.d != null)) continue;
          const hits = coveringTokens(t, ev).filter((q) => q.type !== 'label');
          if (!hits.length) continue;
          const bound = hits.some((q) => subLaws.some((L) => ev.tokens.some((x) => x.qi === q.qi && x.type === 'law' && lawCovers(L, x)) || (ev.labels || []).some((l) => l.qi === q.qi && l.comp === L.comps[L.comps.length - 1])));
          if (!bound) err(`${tokenLabel(t)} comes from a quote that does not name ${subLaws.map((L) => L.raw).join(' / ')}; quote the passage of that sub-section (with its "(${subLaws[0].comps[subLaws[0].comps.length - 1]})" label) or name the sub-section the quote is from`);
        }
      }
      // sense: a rule word the claim shares with its quote ("allowed", "entitled", "required" ...) must be used the
      // same way: negated or not, conditional ("unless", "only if") or not, concessive ("even when") or not
      const sense = senseMismatch(claimText, evidenceTexts);
      if (sense) err(`the claim says "${sense.claim}" where its quote says "${sense.quote}" (${sense.word}); write the claim in the same sense as the quote`);
      if (kind === 'quote') {
        const inner = [...claimText.matchAll(/"([^"]{8,})"/g)].map((m) => m[1]);
        if (!inner.length) err('kind quote: claim_text must contain the quoted words in "double quotes"');
        for (const w of inner) if (!evidenceTexts.some((q) => findQuote(w, q).match === 'exact')) err(`quoted words "${excerpt(w, 60)}" are not in the source quote`);
      }
    } else if (c.derived) out.derived = { steps: c.derived.steps, from: Array.isArray(c.derived.from) ? c.derived.from.map(String) : [] };

    Object.assign(out, sourcesOut[0] || { source_url: c.source_url, source_title: c.source_title, quote: normText(c.quote ?? '') });
    if (sourcesOut.length > 1) out.extra_quotes = sourcesOut.slice(1);
    for (const s of sourcesOut) if (s.match === 'loose') warnings.push(`${label}: quote from ${s.source_url} matched only after removing spacing and line breaks; the fact-checker must compare it with the source`);
    out.verified = isOk();
    out.occurrences = occ;
    verified.push(out);
  }

  // illustrative claims must sit in a run of paragraphs that STARTS with an example label
  const unitOf = (pos) => units.findIndex((u) => pos >= u.start && pos < u.end + 1);
  const illusUnits = new Set();
  for (const [a, , ci] of intervals) if (claims[ci]?.kind === 'illustrative') illusUnits.add(unitOf(a));
  const inRun = new Set();
  for (let k = 0; k < units.length; k++) {
    if (!illusUnits.has(k) || !ILLUSTRATIVE_START.test(units[k].text)) continue;
    inRun.add(k);
    for (let j = k + 1; j < units.length && units[j].section === units[k].section && units[j].field === units[k].field && illusUnits.has(j); j++) inRun.add(j);
  }
  for (const [a, , ci] of intervals) {
    if (claims[ci]?.kind !== 'illustrative') continue;
    const k = unitOf(a);
    if (!inRun.has(k)) errors.push(`claim ${JSON.stringify(String(claims[ci].id))}: illustrative example is not labelled; START its paragraph with "For example" or "Take an illustrative case" (or put it right after such a paragraph)`);
  }

  // (5) detector: factual-looking sentences that no claim covers (every sentence of every unit, title and FAQ too)
  let factual = 0;
  let coveredCount = 0;
  const uncovered = [];
  for (const [k, u] of units.entries()) {
    if (!inRun.has(k) && RELATIVE_TIME.test(u.text)) errors.push(`relative date "${u.text.match(RELATIVE_TIME)[0]}" in ${u.field === 'body' ? '' : `${u.field} `}"${excerpt(u.text)}": write the absolute date ("As of 1 December 2026", "in 2026-27")`);
    for (const s of splitSentences(u.text)) {
      const gs = u.start + s.start;
      const ge = u.start + s.end;
      const heading = u.kind === 'heading';
      const isQuestion = /\?["')\]]*$/.test(s.text);
      const summary = ['title', 'description', 'imageAlt'].includes(u.field);
      const reason = factualReason(s.text, { heading: (heading || isQuestion) && !summary, summary });
      if (!reason) continue;
      factual += 1;
      const toks = extractTokens(s.text);
      const tokOk = toks.every((t) => intervals.some(([a, b]) => a <= gs + t.start && b >= gs + t.end));
      // every letter and digit of the sentence must sit inside claims, except a short lead-in or tail that holds
      // no negation, no rule word and no token
      let chars = 0;
      let cov = 0;
      let gapText = '';
      for (let p = gs; p < ge; p++) {
        const inside = intervals.some(([a, b]) => a <= p && p < b);
        if (!inside) gapText += plain[p];
        else gapText += ' ';
        if (!/[\p{L}\p{N}]/u.test(plain[p])) continue;
        chars += 1;
        if (inside) cov += 1;
      }
      const gap = normText(gapText);
      const gapDangerous = negations(gap) > 0 || RULE_WORDS_CI.test(gap) || RULE_WORDS.test(gap) || /\b(but|except|only|unless|however|although|though|instead|rather)\b/i.test(gap);
      const okShare = chars === 0 || cov / chars >= 0.95 || (cov / chars >= 0.8 && !gapDangerous);
      if (tokOk && okShare) coveredCount += 1;
      else uncovered.push(`${u.field === 'body' ? (heading ? 'heading' : 'sentence') : u.field} with ${reason} has no claim${!tokOk ? ` (uncovered: ${toks.filter((t) => !intervals.some(([a, b]) => a <= gs + t.start && b >= gs + t.end)).map((t) => t.raw).join(', ')})` : !okShare && gapDangerous ? ` (the part outside the claim changes its meaning: "${excerpt(gap, 60)}")` : ''}: "${excerpt(s.text, 120)}"`);
    }
  }
  for (const msg of uncovered) errors.push(msg);

  const stats = {
    claims: claims.length,
    sourced: verified.filter((v) => SOURCED_KINDS.includes(v.kind)).length,
    dhiti: verified.filter((v) => v.kind === 'dhiti').length,
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

/** Claims as stored in body.claims (no local paths). */
export function storedClaims(verified) {
  const clean = (q) => ({ source_url: q.source_url, source_title: q.source_title, quote: q.quote, fetched_at: q.fetched_at, sha256: q.sha256, text_sha256: q.text_sha256 ?? null, source_text_path: q.source_text_path ?? null, match: q.match, ...(q.pages ? { pages: q.pages } : {}) });
  return verified.map((v) => {
    const out = { id: v.id, kind: v.kind, claim_text: v.claim_text, verified: Boolean(v.verified), claim_hash: v.claim_hash };
    if (SOURCED_KINDS.includes(v.kind)) Object.assign(out, clean(v));
    if (v.extra_quotes) out.extra_quotes = v.extra_quotes.map(clean);
    if (v.derived) out.derived = v.derived;
    if (v.note) out.note = v.note;
    if (v.phrase) out.phrase = v.phrase;
    if (v.factcheck) out.factcheck = v.factcheck;
    return out;
  });
}

// =====================================================================================================================
// Derived texts (creatives, LinkedIn captions, first comments, reasons): backed by the blog's verified claims
// =====================================================================================================================

const NON_TEXT_KEYS = new Set(['stock', 'source', 'source_kind', 'photo', 'photo_source', 'clip', 'focus', 'subject', 'zoom', 'duration', 'clip_start', 'kind', 'transition', 'hashtags', 'voiceover', 'voiceover_path', 'timeline', 'generating', 'url', 'url_preview', 'note', 'title', 'id', 'provider', 'type', 'author', 'credit_cost', 'width', 'height', 'position', 'fps', 'logo', 'scrim', 'outro', 'fallback', 'index', 'hook']);

/** Visible text of a creative body, grouped per slide / scene (plus one group for the top-level fields). */
export function creativeTextGroups(type, body) {
  const groups = [];
  const collect = (obj, name) => {
    const fields = [];
    const walk = (v, k) => {
      if (typeof v === 'string') {
        if (!NON_TEXT_KEYS.has(k) && v.trim() && !/^(https?:|items\/|library\/)/.test(v)) fields.push({ field: k, text: v });
      } else if (Array.isArray(v)) v.forEach((x) => walk(x, k));
      else if (v && typeof v === 'object') for (const [kk, vv] of Object.entries(v)) if (!NON_TEXT_KEYS.has(kk) && kk !== 'slides' && kk !== 'scenes') walk(vv, kk);
    };
    walk(obj, '');
    if (fields.length) groups.push({ name, fields });
  };
  const b = body && typeof body === 'object' ? body : {};
  collect(b, type);
  (Array.isArray(b.slides) ? b.slides : []).forEach((s, i) => collect(s, `slide ${i + 1}`));
  (Array.isArray(b.scenes) ? b.scenes : []).forEach((s, i) => collect(s, `scene ${i + 1}`));
  return groups;
}

const EXAMPLE_LABEL = /^(?:["'(*]*)(for example|for instance|illustrative|an illustrative|example\b|hypothetical|say\b|imagine|suppose)/i;
const EXAMPLE_ANY = /\billustrative\b|\(an illustrative [a-z]+\.?\)|\bfor example\b/i;

/**
 * Checks that every factual sentence of derived text is backed by the blog's verified claims:
 *   - each number / date / FY / section / id token is matched (same type and unit) by ONE claim that also shares a
 *     content word with the sentence's group (so "14%" can never borrow the "14th" of another claim);
 *   - a factual sentence without tokens ("you must file before the deadline") needs a claim that shares at least
 *     half of its content words;
 *   - illustrative numbers are allowed only in a group labelled as an example, and only when the blog's own
 *     illustrative example has them; law, %, money, FY and ids always need a sourced claim.
 * groups: [{name, fields: [{field, text}]}]. claims: body.claims of the blog. Returns [error messages].
 */
export function derivedTextErrors(groups, claims, { what = 'text' } = {}) {
  const errors = [];
  const list = (Array.isArray(claims) ? claims : []).filter((c) => c && c.verified === true && typeof c.claim_text === 'string');
  const sourced = list.filter((c) => SOURCED_KINDS.includes(c.kind) || c.kind === 'dhiti');
  const illus = list.filter((c) => c.kind === 'illustrative');
  const advice = list.filter((c) => c.kind === 'advice');
  // the claims' own text is the evidence; "one" counts as 1 there, so a slide may write "1 not yet reported"
  const prep = (c) => {
    const n = normText(c.claim_text);
    return { c, ev: { tokens: extractTokens(n, { quoteMode: true, ones: true }).map((t) => ({ ...t, qi: 0 })), labels: [], norms: [n], text: n.toLowerCase() }, stems: contentStems(c.claim_text) };
  };
  const S = sourced.map(prep);
  const I = illus.map(prep);
  const A = advice.map(prep);
  for (const g of groups) {
    const groupText = g.fields.map((f) => f.text).join('. ');
    const groupStems = contentStems(groupText);
    const labelled = g.fields.some((f) => EXAMPLE_LABEL.test(normText(stripInlineMarkdown(f.text)))) || EXAMPLE_ANY.test(g.fields.find((f) => /eyebrow/.test(f.field))?.text ?? '');
    for (const f of g.fields) {
      const clean = normText(stripInlineMarkdown(f.text).replace(/^\s*\d{1,2}[.)]\s+/gm, ''));
      const fieldLabelled = labelled || EXAMPLE_ANY.test(clean);
      for (const s of splitSentences(clean)) {
        const reason = factualReason(s.text, { summary: true });
        if (!reason) continue;
        const toks = extractTokens(s.text);
        const where = `${g.name}${f.field ? ` ${f.field}` : ''}`;
        if (!toks.length) {
          const st = contentStems(s.text);
          if (!st.size) continue;
          const best = [...S, ...A].reduce((m, x) => Math.max(m, [...st].filter((w) => x.stems.has(w)).length / st.size), 0);
          if (best < 0.5) errors.push(`${what} ${where}: "${excerpt(s.text, 100)}" states a fact (${reason}) that no verified claim of the blog says; use the blog's own wording`);
          continue;
        }
        const close = [...S, ...A].filter((x) => [...contentStems(s.text)].some((w) => x.stems.has(w)));
        const sm = close.length && close.every((x) => senseMismatch(s.text, [x.c.claim_text]));
        if (sm) errors.push(`${what} ${where}: "${excerpt(s.text, 100)}" uses a rule word in another sense than the blog's claims`);
        for (const t of toks) {
          const strict = t.type === 'law' || t.type === 'id' || t.type === 'fy' || (t.type === 'num' && ['%', 'money', 'pp'].includes(t.unit));
          const pools = strict || !fieldLabelled ? [S] : [S, I];
          const ok = pools.some((P) => P.some((x) => tokenCovered(t, x.ev) && [...groupStems].some((w) => x.stems.has(w))));
          if (!ok) errors.push(`${what} ${where}: ${tokenLabel(t)} is not backed by a verified claim of the blog in this context${!strict && !fieldLabelled ? ' (an example number needs an "Illustrative" / "For example" label and must match the blog\'s own example)' : ''}`);
        }
      }
    }
  }
  return [...new Set(errors)];
}

/** LinkedIn caption, first comment and recommendation reason, grouped by paragraph (hashtag line and list markers are layout). */
export function socialTextGroups({ caption = '', first_comment = '', recommendation_reason = '' } = {}) {
  const groups = [];
  const lines = String(caption).replace(/\r\n?/g, '\n').trim().split('\n');
  const tagLine = /^(#[A-Za-z][A-Za-z0-9]{1,49})( #[A-Za-z][A-Za-z0-9]{1,49}){0,2}$/;
  const prose = (tagLine.test(lines[lines.length - 1] || '') ? lines.slice(0, -1) : lines).join('\n');
  prose.split(/\n\s*\n/).forEach((p, i) => {
    if (p.trim()) groups.push({ name: `caption paragraph ${i + 1}`, fields: [{ field: '', text: p }] });
  });
  if (String(first_comment).trim()) groups.push({ name: 'first comment', fields: [{ field: '', text: String(first_comment) }] });
  if (String(recommendation_reason).trim()) groups.push({ name: 'format reason', fields: [{ field: '', text: String(recommendation_reason) }] });
  return groups;
}


// =====================================================================================================================
// Server gate (the engine function and its DRY_RUN mirror): sources the server fetched, re-verification, the stamp
// =====================================================================================================================

/** URL identity for lookups: lowercase host, no fragment, no trailing slash on the path. */
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

/** Storage layout of a source the server fetched: sources/<sha256>/{meta.txt (JSON), raw.<pdf|html|txt>, text.txt}. */
export const SHA_RE = /^[0-9a-f]{64}$/;
export const sourcePaths = (sha, kind = 'html') => ({
  dir: `sources/${sha}`,
  meta: `sources/${sha}/meta.txt`,
  raw: `sources/${sha}/raw.${kind === 'pdf' ? 'pdf' : kind === 'html' ? 'html' : 'txt'}`,
  text: `sources/${sha}/text.txt`,
});

/**
 * A getSource for verifyLedger that reads ONLY what the server stored. io:
 *   read(path) -> Uint8Array | null       (storage download)
 *   sha(bytes) -> hex sha256 (sync or async)
 *   pdfPages(bytes, pages[]) -> sparse array of page texts (index = page - 1), via unpdf
 */
export function storedSourceLoader(io) {
  const metas = new Map();
  const dec = new TextDecoder();
  return async (url, { sha, pages } = {}) => {
    if (!sha || !SHA_RE.test(String(sha))) return { error: 'the stored claim has no sha256 of a server-fetched source; fetch it with cli.js fetch-source and save again' };
    if (!metas.has(sha)) {
      const raw = await io.read(sourcePaths(sha).meta);
      let m = null;
      try {
        m = raw ? JSON.parse(dec.decode(raw)) : null;
      } catch {
        m = null;
      }
      metas.set(sha, m);
    }
    const meta = metas.get(sha);
    if (!meta || meta.sha256 !== sha) return { error: `not fetched by the engine server (no sources/${sha.slice(0, 12)}...); run: node src/cli.js fetch-source "${url}"` };
    const keys = [meta.url, meta.final_url, ...(Array.isArray(meta.urls) ? meta.urls : [])].filter(Boolean).map(urlKey);
    if (!keys.includes(urlKey(url))) return { error: `the server fetched ${sha.slice(0, 12)}... from ${meta.url}, not from ${url}` };
    const p = sourcePaths(sha, meta.kind);
    const entry = { ...meta, raw_path: p.raw, text_path: meta.kind === 'pdf' ? p.raw : p.text };
    if (meta.kind === 'pdf') {
      if (!Array.isArray(pages) || !pages.length) return { error: 'a PDF quote needs the page number it is on (pages); save it again with the engine' };
      const bytes = await io.read(p.raw);
      if (!bytes || (await io.sha(bytes)) !== sha) return { error: `the stored PDF ${sha.slice(0, 12)}... is missing or changed` };
      return { entry, kind: 'pdf', pages: await io.pdfPages(bytes, pages.map(Number)) };
    }
    const tb = await io.read(p.text);
    if (!tb || (await io.sha(tb)) !== meta.text_sha256) return { error: `the stored text of ${sha.slice(0, 12)}... is missing or changed` };
    return { entry, kind: meta.kind, text: dec.decode(tb) };
  };
}

const FC_KEEP = ['verdict', 'note', 'current', 'checked_at', 'claim_hash'];
/** The ledger as the client sent it, back into verifyLedger input (stored claims keep sha256 / pages / factcheck). */
export function ledgerInput(storedList) {
  return (Array.isArray(storedList) ? storedList : []).map((c) => {
    if (!c || typeof c !== 'object') return c;
    const q = (x) => ({ source_url: x?.source_url, quote: x?.quote, source_title: x?.source_title, sha256: x?.sha256, pages: x?.pages });
    const out = { id: c.id, kind: c.kind, claim_text: c.claim_text };
    if (SOURCED_KINDS.includes(c.kind)) Object.assign(out, q(c));
    if (Array.isArray(c.extra_quotes)) out.extra_quotes = c.extra_quotes.map(q);
    if (c.derived && typeof c.derived === 'object') out.derived = { steps: c.derived.steps, from: c.derived.from };
    if (c.note !== undefined) out.note = c.note;
    if (c.factcheck && typeof c.factcheck === 'object') out.factcheck = Object.fromEntries(FC_KEEP.filter((k) => c.factcheck[k] !== undefined).map((k) => [k, c.factcheck[k]]));
    return out;
  });
}

/**
 * Re-verifies a blog body on the server and returns { passed, messages, body } where body carries the server's own
 * claims, claims_check and stamp (client-supplied verified flags and stamps are never kept).
 */
export async function serverVerifyBlog(body, { lexer, hash, getSource, now = new Date().toISOString() }) {
  const b = body && typeof body === 'object' ? body : {};
  if (!Array.isArray(b.claims) || !b.claims.length) return { passed: false, messages: ['the blog has no fact list (body.claims); save it with cli.js save-blog --claims --factcheck'] };
  if (typeof b.markdown !== 'string' || !b.markdown.trim()) return { passed: false, messages: ['the blog has no markdown'] };
  const faq = Array.isArray(b.meta?.faq) ? b.meta.faq : [];
  const r = await verifyLedger(ledgerInput(b.claims), { markdown: b.markdown, frontmatter: b.frontmatter || {}, faq, lexer, getSource, hash, requireFactcheck: true });
  if (!r.passed) return { passed: false, messages: r.messages, warnings: r.warnings };
  const claims = storedClaims(r.claims);
  const stamp = { passed: true, version: CORE_VERSION, checked_at: now, markdown_sha256: await hash(b.markdown), claims_sha256: await hash(JSON.stringify(claims)) };
  return { passed: true, messages: [], warnings: r.warnings, body: { ...b, claims, claims_check: { passed: true, stats: r.stats, warnings: r.warnings, checked_at: now, server: stamp } } };
}

/** Removes a stamp the client may have copied into a body (only the server's own verification sets it). */
export function withoutStamp(body) {
  if (!body || typeof body !== 'object' || !body.claims_check || typeof body.claims_check !== 'object') return body;
  const { server, ...rest } = body.claims_check;
  void server;
  return { ...body, claims_check: { ...rest, passed: false } };
}

/** The stamp is valid for this exact fact list (and, unless markdown:false, this exact text). */
export async function stampValid(body, hash, { markdown = true } = {}) {
  const s = body?.claims_check?.server;
  if (!s || s.passed !== true || !Array.isArray(body?.claims) || !body.claims.length) return false;
  if (s.claims_sha256 !== (await hash(JSON.stringify(body.claims)))) return false;
  return !markdown || s.markdown_sha256 === (await hash(String(body.markdown ?? '')));
}

/** The text the server and the CLI both store for a non-PDF source. */
export const sourceTextOf = (str, kind) => (kind === 'html' ? htmlToText(str) : String(str).replace(/\r\n?/g, '\n').trim());
export const SOURCE_UA = 'Mozilla/5.0 (compatible; DhitiMarketingEngine/1.0; source check)';
export const SOURCE_MAX_BYTES = 30 * 1024 * 1024;
/** Source URLs the server may fetch: https on port 443, a public DNS name (no IP literals, no internal names). */
export function checkSourceUrl(u) {
  let x;
  try {
    x = new URL(String(u ?? '').trim());
  } catch {
    return { error: 'url must be a valid https URL' };
  }
  if (x.protocol !== 'https:') return { error: 'only https sources can be cited' };
  if (x.username || x.password) return { error: 'source URLs may not carry credentials' };
  if (x.port && x.port !== '443') return { error: 'source URLs must use the default https port' };
  const h = x.hostname.toLowerCase().replace(/\.$/, '');
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h) || /^[\d.]+$/.test(h) || h.includes(':')) return { error: 'source URLs need a public host name (no IP addresses)' };
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp|svc|cluster\.local)$/.test(h) || /(^|\.)(supabase\.co|supabase\.in|supabase\.net|supabase\.com)$/.test(h)) return { error: `cannot fetch sources from ${h}` };
  x.hash = '';
  return x;
}

/** Creative statuses the owner reviews (the server checks the visible text before an item reaches them). */
export const REVIEW_STATUSES = ['pending_review', 'awaiting_voiceover'];
