// LinkedIn company page helpers (contract: marketing/LINKEDIN.md sections 2.4 to 2.6, 3, 4.4 and 5).
// Pure functions only: caption checks, the "see more" cut, status words, warnings and the first-comment link.

export const FORMATS = ["carousel", "video", "graphic"];
export const FORMAT_LABEL = { carousel: "Carousel", video: "Reel", graphic: "Graphic" };
export const FORMAT_HINT = { carousel: "Shows as swipe pages", video: "Shows as a video", graphic: "Shows as one picture" };

const CAPTION_MAX = 3000;
const COMMENT_MAX = 300;
const TAG_LINE = /^(#[A-Za-z][A-Za-z0-9]{1,49})( #[A-Za-z][A-Za-z0-9]{1,49}){0,2}$/;
const ANY_TAG = /#[A-Za-z0-9]+/g;
const URLISH = /(https?:\/\/|www\.)/i;
const DOMAIN = /\b[a-z0-9-]+\.(com|in|co|io|net|org|ai)\b/i;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0009\u000B-\u001F\u007F]/;

const norm = (s) => String(s || "").replace(/\r\n?/g, "\n");

/** Hashtags in a caption, and whether they all sit on the last line (house rule 5.2.5). */
export function hashtagInfo(caption) {
  const text = norm(caption).trim();
  const lines = text.split("\n");
  const last = lines[lines.length - 1] || "";
  const all = text.match(ANY_TAG) || [];
  const onLast = TAG_LINE.test(last.trim());
  const elsewhere = (onLast ? lines.slice(0, -1).join("\n") : text).match(ANY_TAG) || [];
  return { count: all.length, onLast, elsewhere: elsewhere.length };
}

/**
 * Live checks for the caption, in plain words. Mirrors the validator in LINKEDIN.md 5.3, so what passes here passes
 * the database trigger too. Each check: { id, ok, text, tone } where tone "warn" is advice and "bad" blocks approval.
 */
export function captionChecks(caption) {
  const text = norm(caption).trim();
  const n = text.length;
  const tags = hashtagInfo(text);
  const first = text.slice(0, 200);
  const hasHookEnd = /[.!?](\s|$)/.test(first) || first.includes("\n");
  const checks = [
    { id: "length", ok: n >= 1 && n <= CAPTION_MAX, tone: "bad", text: n ? `${n.toLocaleString("en-IN")} of ${CAPTION_MAX.toLocaleString("en-IN")} letters` : "Write the post text" },
    { id: "link", ok: !URLISH.test(text) && !DOMAIN.test(text), tone: "bad", text: URLISH.test(text) || DOMAIN.test(text) ? "Remove the link. The link goes in the first comment." : "No link in the post (the link goes in the comment)" },
    { id: "tags", ok: tags.count <= 3 && tags.elsewhere === 0, tone: "bad", text: tags.count > 3 ? `${tags.count} hashtags. Use 3 or fewer.` : tags.elsewhere ? "Put hashtags only on the last line" : `${tags.count} of 3 hashtags` },
    { id: "dash", ok: !/—/.test(text), tone: "bad", text: /—/.test(text) ? "Remove the long dash (—)" : "No long dashes" },
    { id: "hook", ok: !n || hasHookEnd, tone: "bad", text: hasHookEnd || !n ? "First line is a full sentence" : "End the first sentence within the first 200 letters" },
    { id: "control", ok: !CONTROL.test(text), tone: "bad", text: "No hidden characters" },
  ];
  if (n >= 1 && (n < 700 || n > 1300)) checks.push({ id: "ideal", ok: false, tone: "warn", text: n < 700 ? "A bit short. 700 to 1,300 letters works best." : "A bit long. 700 to 1,300 letters works best." });
  return checks.filter((c) => c.id !== "control" || !c.ok);
}

export function commentChecks(comment) {
  const t = norm(comment);
  const one = t.trim();
  return [
    { id: "length", ok: one.length >= 1 && one.length <= COMMENT_MAX, tone: "bad", text: one.length ? `${one.length} of ${COMMENT_MAX} letters` : "Write a short line before the link" },
    { id: "line", ok: !t.trim().includes("\n"), tone: "bad", text: "One line only" },
    { id: "link", ok: !URLISH.test(one) && !DOMAIN.test(one), tone: "bad", text: URLISH.test(one) || DOMAIN.test(one) ? "Don't type a link. We add the blog link for you." : "We add the blog link for you" },
    { id: "tags", ok: !one.includes("#"), tone: "bad", text: "No hashtags in the comment" },
    { id: "dash", ok: !/—/.test(one), tone: "bad", text: "No long dashes" },
  ].filter((c) => !c.ok || c.id === "length" || c.id === "link");
}

export const blocking = (checks) => checks.some((c) => !c.ok && c.tone === "bad");

/**
 * Where the feed cuts the caption behind "...see more". LinkedIn does not document it (UNVERIFIED in 5.2); the feed
 * shows about three lines, roughly 210 characters on desktop. We cut at the third line break or ~200 characters, on a
 * word boundary, whichever comes first.
 */
export function seeMoreCut(caption, { chars = 200, lines = 3 } = {}) {
  const text = norm(caption).trim();
  let cut = text.length;
  let breaks = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n" && ++breaks >= lines) { cut = i; break; }
  }
  if (cut > chars) {
    const space = text.lastIndexOf(" ", chars);
    cut = space > chars * 0.6 ? space : chars;
  }
  return cut >= text.length ? { head: text, tail: "" } : { head: text.slice(0, cut).replace(/\s+$/, ""), tail: text.slice(cut) };
}

/** The blog link the function appends to the first comment (5.4). Shown read-only. */
export function commentLink(blog) {
  const slug = blog?.body?.slug;
  const base = blog?.published_url || (slug ? `https://www.dhitiservices.com/blog/${slug}/` : null);
  if (!base) return null;
  try {
    const u = new URL(base);
    u.searchParams.set("utm_source", "linkedin");
    u.searchParams.set("utm_medium", "social");
    if (slug) u.searchParams.set("utm_campaign", slug);
    return u.toString();
  } catch { return null; }
}

/** The creative (child item) each format would post, and whether it can be used. */
export function formatOptions(blog, items) {
  const kids = items.filter((i) => i.parent_id === blog.id);
  return FORMATS.map((f) => {
    const list = kids.filter((i) => i.type === f && !["rejected", "failed"].includes(i.status)).sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    const item = list.find((i) => ["approved", "published"].includes(i.status)) || list[0] || null;
    let why = null;
    if (!item) why = "Not made for this blog";
    else if (item.status === "generating") why = "Still being made";
    else if (item.status === "awaiting_voiceover") why = "Needs your voice first";
    else if (item.status === "changes_requested") why = "Sent back for fixes";
    return { format: f, item, ok: !!item && !why, why };
  }).filter((o) => o.item);
}

/** One plain-English status for a social post row. */
export function socialStatus(post, blog) {
  if (!post) return null;
  const live = blog?.status === "published";
  switch (post.status) {
    case "draft":
    case "pending_review": return { label: "Ready for you", tone: "brand", text: "Check the post, then approve it with the blog." };
    case "approved": return live
      ? { label: "Posting soon", tone: "active", pulse: true, text: "The blog is live, so this goes out in the next few minutes." }
      : { label: "Will post after the blog is live", tone: "ok", text: "It goes out on LinkedIn a few minutes after the blog is live." };
    case "publishing": return { label: "Posting now", tone: "active", pulse: true, text: "Sending it to LinkedIn." };
    case "published":
      if (post.comment_status === "failed") return { label: "Posted, comment failed", tone: "warn", text: "The post is live, but the comment with the link did not go out." };
      if (post.comment_status === "posted") return { label: "Posted", tone: "info", text: "Live on the Dhiti Services page, with the link in the first comment." };
      return { label: "Posted", tone: "info", text: "Live on LinkedIn. Adding the comment with the link now." };
    case "failed": return { label: "Didn't post", tone: "danger", text: "LinkedIn did not take this post. Check it and try again." };
    case "cancelled": return { label: "Not posting", tone: "neutral", text: "You chose not to post this blog on LinkedIn." };
    default: return { label: "Unknown", tone: "neutral", text: "" };
  }
}

export const editable = (post) => !!post && ["draft", "pending_review", "failed"].includes(post.status);

/** Error codes from the linkedin function, in plain words. */
const CODE_TEXT = {
  NOT_CONFIGURED: "LinkedIn is not set up yet. Paste your keys first.",
  APP_NOT_SAVED: "Paste your Client ID and Client Secret first.",
  NOT_APPROVED: "Approve the post first.",
  BLOG_NOT_LIVE: "The blog is not live yet. The post goes out right after it is.",
  COMMENT_NOT_RETRYABLE: "The comment can't be sent again right now. Try in a few minutes.",
  UNAUTHORIZED: "Your sign-in has ended. Sign in again.",
  NOT_CONNECTED: "LinkedIn is not connected. Connect it in Settings.",
  RATE_LIMITED: "LinkedIn says to slow down. Try again in a few minutes.",
};
export function friendlyError(e) {
  return CODE_TEXT[e?.code] || e?.message || "Something went wrong. Try again.";
}

/** Reasons the OAuth callback sends back (?linkedin=error&reason=...). */
export const RETURN_REASON = {
  state_invalid: "That connect link was too old or already used. Tap Connect LinkedIn again.",
  user_cancelled_login: "You cancelled on LinkedIn. Tap Connect LinkedIn when you're ready.",
  user_cancelled_authorize: "You cancelled on LinkedIn. Tap Connect LinkedIn when you're ready.",
  missing_scope: "LinkedIn has not given your app page access yet. Check step 2, then connect again.",
  not_admin: "This LinkedIn account is not an admin of a company page. Sign in as the Dhiti Services page admin.",
};

/** Days until an ISO date (rounded down, never below 0). */
export function daysUntil(iso, now = Date.now()) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((t - now) / 86400000));
}

/** "Reconnect needed in 52 days" from the status payload. */
export function expiryWords(s) {
  if (!s) return null;
  const until = s.has_refresh_token ? s.refresh_token_expires_at : s.access_token_expires_at;
  const d = daysUntil(until);
  if (d == null) return null;
  if (d === 0) return "Reconnect needed today";
  return `Reconnect needed in ${d} ${d === 1 ? "day" : "days"}`;
}

/** Warning codes (4.4) as friendly banners. action: "reconnect" | "open_failed" | null. */
export function warningText(w) {
  const d = w.days_left;
  const days = d != null ? `${d} ${d === 1 ? "day" : "days"}` : "a few days";
  switch (w.code) {
    case "RECONNECT_REQUIRED": return { title: "Connect LinkedIn again", text: "LinkedIn ended the link to your page. Posts wait until you connect again.", action: "reconnect" };
    case "ACCESS_TOKEN_EXPIRING": return { title: `Connect again within ${days}`, text: "LinkedIn's link ends soon. Connecting again takes one tap.", action: "reconnect" };
    case "REFRESH_TOKEN_EXPIRING": return { title: `LinkedIn link ends in ${days}`, text: "Connect again any time to reset it for another year.", action: "reconnect" };
    case "REFRESH_FAILING": return { title: "LinkedIn could not renew the link", text: "Connect again soon so posts keep going out.", action: "reconnect" };
    case "HEARTBEAT_STALE": return { title: "Not checked for 2 days", text: "We could not check the LinkedIn link lately. It checks again on its own.", action: null };
    case "API_VERSION_AGING": return { title: "LinkedIn update needed soon", text: "The LinkedIn version we use ends on 16 Nov 2027. Ask your developer to update it before then.", action: null };
    case "POST_FAILED": return { title: "A LinkedIn post did not go out", text: "Open the blog to check it and try again.", action: "open_failed" };
    case "COMMENT_FAILED": return { title: "A link comment did not go out", text: "The post is live, but its first comment failed. Open the blog to try again.", action: "open_failed" };
    case "DEV_TIER_DEADLINE": return { title: "LinkedIn test access ends soon", text: "Apply for full access in the LinkedIn developer portal so posting keeps working.", action: null };
    default: return { title: "Check LinkedIn", text: "Something needs a look.", action: null };
  }
}

export const CLIENT_ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
export const CLIENT_SECRET_RE = /^[\x21-\x7E]{8,256}$/;
export const REDIRECT_URI = "https://yexxrcgxhwsopssfyylo.supabase.co/functions/v1/linkedin/oauth/callback";
