// Formatting helpers. All calendar maths is done in IST (Asia/Kolkata), the team's time zone.
export const TZ = "Asia/Kolkata";
const IST_OFFSET_MIN = 330;

const fmtCache = new Map();
function fmt(opts) {
  const key = JSON.stringify(opts);
  if (!fmtCache.has(key)) fmtCache.set(key, new Intl.DateTimeFormat("en-IN", { timeZone: TZ, ...opts }));
  return fmtCache.get(key);
}

const toDate = (v) => (v instanceof Date ? v : v ? new Date(v) : null);
const valid = (d) => d && !Number.isNaN(d.getTime());

export function formatDate(v, opts = { day: "numeric", month: "short" }) {
  const d = toDate(v);
  return valid(d) ? fmt(opts).format(d) : "";
}
export const formatDay = (v) => formatDate(v, { weekday: "short", day: "numeric", month: "short" });
export const formatLongDay = (v) => formatDate(v, { weekday: "long", day: "numeric", month: "long" });
export const formatTime = (v) => formatDate(v, { hour: "numeric", minute: "2-digit", hour12: true }).replace(" ", " ");
export const formatDateTime = (v) => {
  const d = toDate(v);
  return valid(d) ? `${formatDay(d)}, ${formatTime(d)}` : "";
};

/** A plain YYYY-MM-DD date (topics.planned_publish_date) at noon IST, so formatting never slips a day. */
export function dateOnly(s) {
  if (!s) return null;
  return new Date(`${String(s).slice(0, 10)}T12:00:00+05:30`);
}

/** Today's date in IST as YYYY-MM-DD. */
export function todayIST(now = new Date()) {
  return new Date(now.getTime() + IST_OFFSET_MIN * 60000).toISOString().slice(0, 10);
}

/** Monday (YYYY-MM-DD, IST) of the week containing `v`. */
export function weekStartIST(v = new Date()) {
  const d = new Date(toDate(v).getTime() + IST_OFFSET_MIN * 60000);
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export function addDays(ymd, n) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** ISO instant -> value for <input type="datetime-local"> expressed in IST. */
export function toISTInput(iso) {
  const d = toDate(iso);
  if (!valid(d)) return "";
  return new Date(d.getTime() + IST_OFFSET_MIN * 60000).toISOString().slice(0, 16);
}
/** <input type="datetime-local"> value (read as IST) -> ISO instant. */
export function fromISTInput(v) {
  if (!v) return null;
  const d = new Date(`${v}:00+05:30`);
  return valid(d) ? d.toISOString() : null;
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
export function relative(v, now = Date.now()) {
  const d = toDate(v);
  if (!valid(d)) return "";
  const s = Math.round((d.getTime() - now) / 1000);
  const a = Math.abs(s);
  if (a < 45) return s <= 0 ? "just now" : "in a moment";
  if (a < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (a < 86400) return rtf.format(Math.round(s / 3600), "hour");
  if (a < 86400 * 7) return rtf.format(Math.round(s / 86400), "day");
  return formatDate(d, { day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

export function duration(start, end) {
  const a = toDate(start), b = toDate(end);
  if (!valid(a) || !valid(b)) return "";
  const s = Math.max(0, Math.round((b - a) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

export function greeting(now = new Date()) {
  const h = Number(fmt({ hour: "numeric", hour12: false }).format(now));
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** Word count that mirrors the website check (markdown syntax stripped). */
export function countWords(md = "") {
  const text = String(md)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`|~-]/g, " ");
  return (text.match(/[A-Za-z0-9À-ɏऀ-ॿ]+(?:['’][A-Za-z]+)?/g) || []).length;
}

export const readMinutes = (words) => Math.max(1, Math.round((words || 0) / 230));

export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function bytes(n) {
  if (!Number.isFinite(n)) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}

export function seconds(n) {
  if (!Number.isFinite(n)) return "";
  const s = Math.round(n);
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${s}s`;
}

export function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

export function slugifyFile(name) {
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name).normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "file";
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  return ext ? `${base}.${ext}` : base;
}

export function uuid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));
}
