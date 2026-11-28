import { useEffect, useState } from "react";
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

export function useSignedUrl(path) {
  const [state, setState] = useState(() => ({ path, url: peekSignedUrl(path), error: null }));
  useEffect(() => {
    let alive = true;
    let refresh;
    const load = () => {
      signedUrl(path)
        .then((url) => {
          if (!alive) return;
          setState({ path, url, error: null });
          const hit = cache.get(path);
          if (hit) refresh = setTimeout(load, Math.max(10_000, hit.exp - Date.now() - REFRESH_MARGIN + 1000));
        })
        .catch((error) => alive && setState({ path, url: null, error }));
    };
    if (path) load();
    else setState({ path, url: null, error: null });
    return () => { alive = false; clearTimeout(refresh); };
  }, [path]);
  // Never return a URL that belongs to a previous path.
  return state.path === path ? state : { path, url: peekSignedUrl(path), error: null };
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

/** Download a storage object with a proper filename (Supabase honours ?download=<name>). */
export async function downloadPath(path, filename) {
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

export async function downloadMany(files, { gap = 450 } = {}) {
  for (const f of files) {
    await downloadPath(f.path, f.name);
    await new Promise((r) => setTimeout(r, gap));
  }
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
