// Sign-in helpers shared by the Supabase and demo backends, the login screen and the idle lock.
// Login is an emailed 6-digit code (or the link in the same email). No passwords, no authenticator apps.

export const CODE_LENGTH = 6;
export const RESEND_SECONDS = 60;
export const IDLE_MS = 30 * 60 * 1000; // sign out after 30 min without pointer, key, touch or scroll input
export const IDLE_WARN_MS = 60 * 1000; // ...with a 60 s countdown first
export const HIDDEN_MS = 12 * 60 * 60 * 1000; // tab hidden for more than 12 h: sign out on return

/** The one message every email gets, allowed or not. */
export const NEUTRAL_SENT = "If this email has access, a code is on its way.";
/** Shown when a signed-in account is not allowlisted. Says nothing about which emails are allowed. */
export const NEUTRAL_DENIED = "We couldn't sign you in with that email. If you should have access, ask the Studio owner.";

const ACTIVE_KEY = "dhiti.lastActive";
const HIDDEN_KEY = "dhiti.hiddenAt";
const PENDING_KEY = "dhiti.login";
const REASON_KEY = "dhiti.signoutReason";

const read = (store, key) => { try { return store.getItem(key); } catch { return null; } };
const write = (store, key, v) => { try { v == null ? store.removeItem(key) : store.setItem(key, v); } catch { /* private mode */ } };

/* ---- activity (shared across tabs through localStorage, so one active tab keeps the others signed in) ---- */
export function markActive(now = Date.now()) { write(localStorage, ACTIVE_KEY, String(now)); }
/** A new sign-in (code or link): the idle and background clocks start over. */
export function freshSignIn(now = Date.now()) { markActive(now); write(localStorage, HIDDEN_KEY, null); }
export function clearHidden() { write(localStorage, HIDDEN_KEY, null); }
export function lastActive() { const n = Number(read(localStorage, ACTIVE_KEY)); return Number.isFinite(n) && n > 0 ? n : null; }
export function markHidden(now = Date.now()) { write(localStorage, HIDDEN_KEY, String(now)); }
export function hiddenSince() { const n = Number(read(localStorage, HIDDEN_KEY)); return Number.isFinite(n) && n > 0 ? n : null; }
export function clearActivity() { write(localStorage, ACTIVE_KEY, null); write(localStorage, HIDDEN_KEY, null); }

/**
 * Why a stored session must not be resumed: the browser was closed or left idle past the lock, or the tab was
 * hidden for more than 12 hours. Returns null when the session may continue.
 */
export function staleReason(now = Date.now()) {
  const h = hiddenSince();
  const a = lastActive();
  if (h && (!a || h >= a) && document.visibilityState !== "hidden" && now - h > HIDDEN_MS) return "hidden";
  if (a && now - a > IDLE_MS) return "idle";
  return null;
}

/* ---- why the person was signed out (shown once on the login screen) ---- */
export const REASON_TEXT = {
  idle: "You were signed out after 30 minutes without activity.",
  hidden: "You were signed out because Studio was in the background for more than 12 hours.",
  global: "You signed out on every device.",
  denied: NEUTRAL_DENIED,
};

/* ---- the code step survives a reload (email + when the last code was requested) ---- */
export function savePending(email, sentAt) { write(sessionStorage, PENDING_KEY, JSON.stringify({ email, sentAt })); }
export function loadPending() {
  try {
    const p = JSON.parse(read(sessionStorage, PENDING_KEY) || "null");
    // A code is valid for at most an hour; after that start from the email step.
    return p?.email && Date.now() - p.sentAt < 60 * 60 * 1000 ? p : null;
  } catch { return null; }
}
export function clearPending() { write(sessionStorage, PENDING_KEY, null); }

export const validEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);

/* ---- error mapping: never reveals whether an email is allowed ---- */
const status = (e) => Number(e?.status) || 0;
const msg = (e) => String(e?.message || "");
// No HTTP response at all (offline, DNS, blocked). supabase-js reports it as AuthRetryableFetchError with status 0.
const isNetwork = (e) => !status(e) && (e?.name === "AuthRetryableFetchError" || /fetch|network|load failed/i.test(msg(e)));
// The gateway in front of Supabase Auth is down (same for every address, so safe to say).
const isOutage = (e) => status(e) >= 502 && status(e) <= 599;

/**
 * Outcome of signInWithOtp. Anything that is not a network problem, a gateway outage, a malformed address or a rate
 * limit counts as "sent": a stranger's sign-up is rejected inside the database (HTTP 500 "Database error saving new
 * user"; 422 once sign-ups are turned off), and that must look exactly like success.
 *  -> { kind: 'sent' } | { kind: 'sent', wait } (a code was requested for this address moments ago)
 *   | { kind: 'rate', text } | { kind: 'network', text } | { kind: 'invalid', text }
 */
export function classifySendError(e) {
  if (!e) return { kind: "sent" };
  if (isNetwork(e)) return { kind: "network", text: "Couldn't reach the sign-in service. Check your connection and try again." };
  if (isOutage(e)) return { kind: "network", text: "The sign-in service is busy. Try again in a minute." };
  const m = msg(e);
  const after = m.match(/after (\d+) seconds?/i);
  if (after) return { kind: "sent", wait: Math.max(1, Number(after[1])) };
  if (status(e) === 429 || /rate limit|too many/i.test(m) || /rate_limit/.test(e?.code || "")) {
    return { kind: "rate", text: "Too many sign-in requests right now. Wait a few minutes, then try again." };
  }
  if (status(e) === 400 && /email/i.test(m) && /invalid|format|valid/i.test(m)) return { kind: "invalid", text: "Enter a valid email address." };
  return { kind: "sent" };
}

export function verifyErrorText(e) {
  if (isNetwork(e)) return "Couldn't reach the sign-in service. Check your connection and try again.";
  if (isOutage(e)) return "The sign-in service is busy. Try the code again in a minute.";
  if (status(e) === 429 || /rate limit|too many/i.test(msg(e))) return "Too many attempts. Wait a minute, then try the code again.";
  return "That code is incorrect or has expired. Check the latest email, or send a new code.";
}

/** Errors Supabase puts in the URL when an emailed link is used twice or has expired. */
export function urlErrorText(code, description) {
  const s = `${code} ${description}`;
  if (/expired|otp_expired|invalid/i.test(s)) return "That sign-in link has expired or was already used. Request a new code below.";
  if (/access_denied/i.test(s)) return "That sign-in link can't be used. Request a new code below.";
  return "Sign-in didn't complete. Request a new code below.";
}
