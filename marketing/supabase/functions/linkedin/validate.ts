// Caption / first-comment rules and LinkedIn text builders (LINKEDIN.md sections 5.3 to 5.5).
//
// This file has no imports so the same code runs in the Edge Function (Deno) and in the Node test harness.
// The SQL twins are public.linkedin_caption_error() and public.linkedin_first_comment_error() (migration
// linkedin_core). Keep the three in step: same rules, same order, same messages.

export const CAPTION_MAX = 3000;
export const FIRST_COMMENT_MAX = 300;
export const HOOK_WINDOW = 200;

const TAG_LINE = /^(#[A-Za-z][A-Za-z0-9]{1,49})( #[A-Za-z][A-Za-z0-9]{1,49}){0,2}$/;
const URL_RE = /(https?:\/\/|www\.)/i;
const DOMAIN_RE = /\b[a-z0-9-]+\.(com|in|co|io|net|org|ai)\b/i;
// Control characters other than \n. (\r is normalised away first.)
const CTRL_RE = /[\u0000-\u0009\u000B-\u001F\u007F]/;
const SENTENCE_END = /[.!?](\s|$)/;

/** Code-point length (Postgres char_length counts code points, JS .length counts UTF-16 units). */
export function cpLength(s: string): number {
  return [...s].length;
}

function cpLeft(s: string, n: number): string {
  return [...s].slice(0, n).join("");
}

/** \r\n and \r become \n; spaces, tabs and newlines are trimmed at both ends (same as the SQL btrim). */
export function normalizeText(s: unknown): string {
  return String(s ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/^[ \t\n]+|[ \t\n]+$/g, "");
}

/** Returns null when the caption passes, otherwise the first failing rule as a plain sentence. */
export function captionError(raw: unknown): string | null {
  const t = normalizeText(raw);
  const len = cpLength(t);
  if (len < 1) return "caption is empty";
  if (len > CAPTION_MAX) return `caption is longer than ${CAPTION_MAX} characters`;
  if (URL_RE.test(t) || DOMAIN_RE.test(t)) return "caption must not contain a link (the link goes in the first comment)";
  if (t.includes("—")) return "caption must not contain an em dash";
  if (CTRL_RE.test(t)) return "caption must not contain control characters";
  const lines = t.split("\n");
  const last = lines[lines.length - 1];
  const hasTagLine = TAG_LINE.test(last);
  const body = hasTagLine ? lines.slice(0, -1).join("\n") : t;
  if (body.includes("#")) return "hashtags are allowed only on the last line, at most 3, like #HotelOperations";
  if (normalizeText(body) === "") return "caption needs text before the hashtags";
  const hook = cpLeft(t, HOOK_WINDOW);
  if (!(len <= HOOK_WINDOW || hook.includes("\n") || SENTENCE_END.test(hook))) {
    return `the first ${HOOK_WINDOW} characters must contain a full sentence (the hook)`;
  }
  return null;
}

/** Returns null when the first-comment line passes, otherwise the first failing rule. */
export function firstCommentError(raw: unknown): string | null {
  const t = normalizeText(raw);
  const len = cpLength(t);
  if (len < 1) return "first comment is empty";
  if (len > FIRST_COMMENT_MAX) return `first comment is longer than ${FIRST_COMMENT_MAX} characters`;
  if (t.includes("\n")) return "first comment must be one line";
  if (URL_RE.test(t) || DOMAIN_RE.test(t)) return "first comment must not contain a link (the blog link is added automatically)";
  if (t.includes("#")) return "first comment must not contain hashtags";
  if (t.includes("—")) return "first comment must not contain an em dash";
  if (CTRL_RE.test(t)) return "first comment must not contain control characters";
  return null;
}

// Little text format (LITTLE): every reserved character is escaped with a backslash.
const LITTLE_RESERVED = /[\\|{}@\[\]()<>#*_~]/g;

export function escapeLittle(s: string): string {
  return s.replace(LITTLE_RESERVED, (c) => "\\" + c);
}

/** Post commentary: the body is little-escaped; the final hashtag line is kept as hashtags. */
export function buildCommentary(caption: string): string {
  const text = normalizeText(caption);
  const lines = text.split("\n");
  const last = lines[lines.length - 1];
  const tagLine = TAG_LINE.test(last) ? last : null;
  const body = (tagLine ? lines.slice(0, -1) : lines).join("\n");
  return escapeLittle(body) + (tagLine ? "\n" + tagLine : "");
}

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The blog URL must be exactly https://www.dhitiservices.com/blog/<slug>/ (trailing slash optional). */
export function blogUrlOk(url: unknown, slug: unknown): boolean {
  if (typeof url !== "string" || typeof slug !== "string" || !SLUG_RE.test(slug)) return false;
  return url === `https://www.dhitiservices.com/blog/${slug}/` || url === `https://www.dhitiservices.com/blog/${slug}`;
}

/** first_comment + "\n" + blog link with UTM tags. Comment text is plain (not little-escaped). */
export function buildCommentText(firstComment: string, publishedUrl: string, slug: string): string {
  const link = new URL(publishedUrl);
  link.searchParams.set("utm_source", "linkedin");
  link.searchParams.set("utm_medium", "social");
  link.searchParams.set("utm_campaign", slug);
  return normalizeText(firstComment) + "\n" + link.toString();
}

/** Encode a URN for use in a URL path or query value: encodeURIComponent plus ( and ). */
export function encodeUrn(urn: string): string {
  return encodeURIComponent(urn).replace(/\(/g, "%28").replace(/\)/g, "%29");
}
