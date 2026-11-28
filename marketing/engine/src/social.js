// LinkedIn post rules for the engine (LINKEDIN.md sections 5.1 to 5.5).
//
// validateCaption / validateFirstComment are the shared validator of section 5.3 (the engine function, the
// social_posts trigger and the linkedin function apply the same rules; the first failing rule is reported).
// captionHouseChecks adds the editorial policy of section 5.2 that only the engine checks (emoji, @mentions,
// length aim, the "first comment" pointer, copying the blog's opening). socialClaimsErrors is the claims rule
// (claims-core.js derivedTextErrors, which the engine function runs too): every fact in the caption, the first
// comment and the format reason must be backed by a verified claim of the blog, number by number, in context.
import { normText, looseForm, derivedTextErrors, socialTextGroups } from './claims-core.js';

export const SOCIAL_FORMATS = ['carousel', 'video', 'graphic'];
export const CAPTION_MAX = 3000;
export const FIRST_COMMENT_MAX = 300;
export const REASON_MAX = 500;
export const TAG_LINE = /^(#[A-Za-z][A-Za-z0-9]{1,49})( #[A-Za-z][A-Za-z0-9]{1,49}){0,2}$/;
const URLISH = /https?:\/\/|www\./i;
const BARE_DOMAIN = /\b[a-z0-9-]+\.(com|in|co|io|net|org|ai)\b/i;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0009\u000B-\u001F\u007F]/;

export const normaliseCaption = (s) => String(s ?? '').replace(/\r\n?/g, '\n').trim();

/** LINKEDIN.md 5.3, caption. Returns the first failing rule, or null. */
export function validateCaption(caption) {
  const t = normaliseCaption(caption);
  if (t.length < 1 || t.length > CAPTION_MAX) return `caption must be 1 to ${CAPTION_MAX} characters (got ${t.length})`;
  if (URLISH.test(t)) return 'caption must not contain a link (http://, https:// or www.); the blog link goes in the first comment';
  const dom = t.match(BARE_DOMAIN);
  if (dom) return `caption must not contain a domain name ("${dom[0]}"); the blog link goes in the first comment`;
  if (t.includes('—')) return 'caption must not contain an em dash (—)';
  if (CONTROL.test(t)) return 'caption must not contain control characters (tabs included); use plain line breaks';
  const lines = t.split('\n');
  const last = lines[lines.length - 1];
  const body = lines.slice(0, -1).join('\n');
  if (last.includes('#')) {
    if (!TAG_LINE.test(last)) return 'the last line must be 1 to 3 hashtags like "#TravelOperations #HotelOperations" (letters and digits, separated by single spaces)';
    if (body.includes('#')) return '"#" may appear only in the final hashtag line';
  } else if (t.includes('#')) return '"#" may appear only in a final line of at most 3 hashtags';
  if (TAG_LINE.test(last) && !body.trim()) return 'the caption needs text before the hashtags';
  const first200 = t.slice(0, 200);
  if (!(t.length <= 200 || first200.includes('\n') || /[.!?](\s|$)/.test(first200))) return 'the first 200 characters must contain at least one full sentence or line (the hook, before "...see more")';
  return null;
}

/** LINKEDIN.md 5.3, first comment (the line before the link; the function appends the link). */
export function validateFirstComment(s) {
  const t = String(s ?? '').replace(/\r\n?/g, '\n').trim();
  if (t.includes('\n')) return 'first comment must be one line';
  if (t.length < 1 || t.length > FIRST_COMMENT_MAX) return `first comment must be 1 to ${FIRST_COMMENT_MAX} characters (got ${t.length})`;
  if (URLISH.test(t) || BARE_DOMAIN.test(t)) return 'first comment must not contain a link: the blog link with UTM tags is added automatically';
  if (t.includes('#')) return 'first comment must not contain "#"';
  if (t.includes('—')) return 'first comment must not contain an em dash (—)';
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(t)) return 'first comment must not contain control characters';
  return null;
}

/** The link the linkedin function appends (LINKEDIN.md 5.4). */
export function commentLink(slug) {
  const u = new URL(`https://www.dhitiservices.com/blog/${slug}/`);
  u.searchParams.set('utm_source', 'linkedin');
  u.searchParams.set('utm_medium', 'social');
  u.searchParams.set('utm_campaign', slug);
  return u.href;
}
export const commentText = (firstComment, slug) => `${String(firstComment).trim()}\n${commentLink(slug)}`;

/** LINKEDIN.md 5.5. */
const LITTLE_RESERVED = /[\\|{}@[\]()<>#*_~]/g;
export const escapeLittle = (s) => String(s).replace(LITTLE_RESERVED, (c) => `\\${c}`);
export function buildCommentary(caption) {
  const text = normaliseCaption(caption);
  const lines = text.split('\n');
  const last = lines[lines.length - 1];
  const tagLine = TAG_LINE.test(last) ? last : null;
  const body = (tagLine ? lines.slice(0, -1) : lines).join('\n');
  return escapeLittle(body) + (tagLine ? `\n${tagLine}` : '');
}

const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}]/u;

/**
 * Section 5.2 editorial rules plus the claims rule. Returns { errors, warnings }.
 * blogBody: the blog item's body (markdown, claims). Errors block saving; warnings are shown.
 */
export function captionHouseChecks(caption, { blogBody } = {}) {
  const errors = [];
  const warnings = [];
  const t = normaliseCaption(caption);
  if (EMOJI.test(t)) errors.push('no emojis in the caption (house rule)');
  if (/(^|[\s(])@[A-Za-z0-9_]/.test(t)) errors.push('no @mentions in the caption (house rule)');
  if (t.includes('!')) errors.push('no exclamation marks in the caption (house voice)');
  if (t.length < 700 || t.length > 1300) warnings.push(`caption is ${t.length} characters; aim for 700 to 1,300`);
  const lines = t.split('\n');
  const hasTags = TAG_LINE.test(lines[lines.length - 1]);
  const prose = (hasTags ? lines.slice(0, -1) : lines).join('\n').trim();
  const first = prose.split('\n')[0] || '';
  if (first.length > 200) warnings.push(`the first line is ${first.length} characters; keep the hook within the first 200 (before "...see more")`);
  if (/^(in today'?s|in an era|in the (fast|ever)|are you|have you ever)/i.test(first)) errors.push('the hook must state the reader\'s problem or a specific number, not a generic opener');
  for (const para of prose.split(/\n\s*\n/)) {
    if (/^\s*(\d{1,2}[.)]|[-*•])\s/m.test(para)) continue; // a list: one item per line is fine
    const n = (para.match(/[.?!](\s|$)/g) || []).length;
    if (n > 2) warnings.push(`paragraph "${para.slice(0, 50)}..." has ${n} sentences; keep 1 or 2 per paragraph`);
  }
  if (!/first comment/i.test(prose.split('\n').slice(-2).join(' '))) warnings.push('end the caption with a pointer such as "Full guide in the first comment."');
  if (!hasTags) warnings.push('add 1 to 3 CamelCase hashtags on the last line (for example #TravelOperations)');

  // claims rule (caption only here; save-social also checks the first comment and the reason)
  errors.push(...socialClaimsErrors({ caption: t }, blogBody));
  // do not copy the blog's opening word for word (12-word window)
  const md = String(blogBody?.markdown ?? '');
  const opening = md.split(/\n\s*\n/).find((p) => p.trim() && !p.startsWith('#')) || '';
  const ow = normText(opening).split(' ');
  const lt = looseForm(t);
  for (let i = 0; i + 12 <= ow.length; i++) {
    if (lt.includes(looseForm(ow.slice(i, i + 12).join(' ')))) {
      errors.push('the caption copies the blog\'s opening paragraph word for word; write a fresh hook');
      break;
    }
  }
  return { errors, warnings };
}

/**
 * The claims rule for a LinkedIn post: caption paragraphs, first comment and format reason. The blog must carry a
 * fact list verified by the engine server (claims_check.server); its verified claims are the only evidence.
 */
export function socialClaimsErrors({ caption = '', first_comment = '', recommendation_reason = '' } = {}, blogBody) {
  const claims = Array.isArray(blogBody?.claims) ? blogBody.claims : null;
  if (!claims || !claims.length) return ['the blog has no verified fact list yet (save it with save-blog --claims --factcheck first)'];
  return derivedTextErrors(socialTextGroups({ caption, first_comment, recommendation_reason }), claims, { what: 'LinkedIn post' });
}

/** One-line recommendation reason the owner sees (LINKEDIN.md 5.1). */
export function validateReason(reason) {
  const t = String(reason ?? '').trim();
  if (!t) return 'a one-line reason is required (for example "Carousel: the 5-step routine reads best as slides")';
  if (t.includes('\n')) return 'the reason must be one line';
  if (t.length > REASON_MAX) return `the reason must be at most ${REASON_MAX} characters`;
  if (t.includes('—')) return 'the reason must not contain an em dash (—)';
  return null;
}
