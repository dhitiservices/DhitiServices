import { useCallback, useEffect, useRef, useState } from "react";
import { SIGNED_URL_TTL } from "./config.js";

/**
 * Signed URL cache for the private `marketing` bucket.
 * - Requests made in the same tick are batched into one createSignedUrls call.
 * - URLs are reused until 5 minutes before expiry, then transparently refreshed (hooks re-render with the new URL).
 */
let backend = null;
const cache = new Map(); // path -> { url, exp }
const waiting = new Map(); // path -> [{resolve, reject}]
let timer = null;
const REFRESH_MARGIN = 5 * 60 * 1000;

export function setMediaBackend(b) {
  backend = b;
  cache.clear();
}

function fresh(path) {
  const hit = cache.get(path);
  return hit && hit.exp - Date.now() > REFRESH_MARGIN ? hit : null;
}

async function flush() {
  timer = null;
  const batch = new Map(waiting);
  waiting.clear();
  const paths = [...batch.keys()];
  if (!paths.length) return;
  try {
    if (!backend) throw new Error("No backend");
    const res = await backend.signUrls(paths, SIGNED_URL_TTL);
    const exp = Date.now() + SIGNED_URL_TTL * 1000;
    const byPath = new Map(res.map((r) => [r.path, r]));
    for (const p of paths) {
      const r = byPath.get(p);
      const waiters = batch.get(p) || [];
      if (r?.signedUrl) {
        cache.set(p, { url: r.signedUrl, exp });
        waiters.forEach((w) => w.resolve(r.signedUrl));
      } else {
        waiters.forEach((w) => w.reject(new Error(r?.error || "Could not sign URL")));
      }
    }
  } catch (err) {
    for (const waiters of batch.values()) waiters.forEach((w) => w.reject(err));
  }
}

export function signedUrl(path) {
  if (!path) return Promise.resolve(null);
  const hit = fresh(path);
  if (hit) return Promise.resolve(hit.url);
  return new Promise((resolve, reject) => {
    if (!waiting.has(path)) waiting.set(path, []);
    waiting.get(path).push({ resolve, reject });
    if (!timer) timer = setTimeout(flush, 0);
  });
}

/** Synchronous peek (used to avoid a skeleton flash when the URL is already cached). */
export function peekSignedUrl(path) {
  return path ? fresh(path)?.url ?? null : null;
}

/** Forgets a cached URL (expired after sleep, or the element failed to load it) so the next call re-signs. */
export function invalidateSignedUrl(path) {
  if (path) cache.delete(path);
}

/**
 * { url, error, retry } for a storage path. The URL is kept for as long as the element uses it: it is never swapped
 * on a timer (that remounted playing videos and re-faded loaded images). Elements call `retry()` once when a load
 * fails (typically an expired URL after the laptop slept), which re-signs and swaps the URL.
 */
export function useSignedUrl(path) {
  const [state, setState] = useState(() => ({ path, url: peekSignedUrl(path), error: null }));
  const attempts = useRef({ path, n: 0 });
  useEffect(() => {
    let alive = true;
    attempts.current = { path, n: 0 };
    if (!path) {
      setState({ path, url: null, error: null });
      return () => { alive = false; };
    }
    signedUrl(path)
      .then((url) => alive && setState({ path, url, error: null }))
      .catch((error) => alive && setState({ path, url: null, error }));
    return () => { alive = false; };
  }, [path]);
  /** Re-signs after a failed load. At most twice per path; returns false when the element should give up. */
  const retry = useCallback(() => {
    if (!path || attempts.current.path !== path || attempts.current.n >= 2) return false;
    attempts.current.n += 1;
    invalidateSignedUrl(path);
    signedUrl(path)
      .then((url) => setState((s) => (s.path === path ? { path, url, error: null } : s)))
      .catch((error) => setState((s) => (s.path === path ? { path, url: null, error } : s)));
    return true;
  }, [path]);
  // Never return a URL that belongs to a previous path.
  const cur = state.path === path ? state : { path, url: peekSignedUrl(path), error: null };
  return { url: cur.url, error: cur.error, retry };
}

// Re-check after the tab comes back (sleep, long background): drop cache entries that are already expired so
// anything rendered from now on gets a fresh URL.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    const now = Date.now();
    for (const [p, v] of cache) if (v.exp - now <= REFRESH_MARGIN) cache.delete(p);
  });
}

const extOf = (mime = "", path = "") => {
  const fromPath = path.split("?")[0].split(".").pop();
  if (fromPath && fromPath.length <= 5 && fromPath !== path) return fromPath.toLowerCase();
  return { "image/png": "png", "image/webp": "webp", "image/jpeg": "jpg", "video/mp4": "mp4", "application/pdf": "pdf", "audio/mpeg": "mp3" }[mime] || "bin";
};

export function downloadName(base, asset, suffix = "") {
  const safe = String(base || "dhiti").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "dhiti";
  return `${safe}${suffix ? `-${suffix}` : ""}.${extOf(asset?.mime, asset?.storage_path)}`;
}

let onDownloadError = null;
/** The app registers a toast here; downloads then never throw into click handlers. */
export function setDownloadErrorHandler(fn) {
  onDownloadError = fn;
}

async function downloadOne(path, filename) {
  const url = await signedUrl(path);
  if (!url) throw new Error("File unavailable");
  const isRemote = /^https?:/i.test(url) && !url.startsWith(window.location.origin);
  const href = isRemote ? `${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(filename)}` : url;
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Download a storage object with a proper filename (Supabase honours ?download=<name>). Resolves true/false. */
export async function downloadPath(path, filename) {
  try {
    await downloadOne(path, filename);
    return true;
  } catch (err) {
    invalidateSignedUrl(path);
    onDownloadError?.(err, filename);
    return false;
  }
}

/**
 * Several files, one after another. Browsers ask once to "allow multiple downloads" for the site; after that the
 * rest arrive. Resolves with the number that started.
 */
export async function downloadMany(files, { gap = 450 } = {}) {
  let ok = 0;
  for (const f of files) {
    try {
      await downloadOne(f.path, f.name);
      ok += 1;
    } catch (err) {
      invalidateSignedUrl(f.path);
      onDownloadError?.(err, f.name);
      break;
    }
    await new Promise((r) => setTimeout(r, gap));
  }
  return ok;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}
