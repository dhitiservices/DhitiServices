// Runtime configuration. The Supabase URL and publishable key are public by design:
// Row Level Security plus public.is_team() protect every row and storage object.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://yexxrcgxhwsopssfyylo.supabase.co";
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_eggopcLFltAS1Q3nTmGecQ_dUMTCIhR";
export const STORAGE_BUCKET = "marketing";
export const SITE_URL = "https://www.dhitiservices.com";
export const POLL_MS = 30_000;
export const SIGNED_URL_TTL = 3600; // seconds
export const UNDO_MS = 6000;

/* global __DEMO__ */
// Compile-time constant (vite.config.js): true only for `vite dev` or VITE_DEMO=1 builds.
export const DEMO_AVAILABLE = __DEMO__;

export function demoRequested() {
  if (!DEMO_AVAILABLE) return false;
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get("demo") === "0") { sessionStorage.removeItem("dhiti.demo"); return false; }
    if (q.get("demo") === "1") { sessionStorage.setItem("dhiti.demo", "1"); return true; }
    return sessionStorage.getItem("dhiti.demo") === "1";
  } catch {
    return false;
  }
}

export function setDemo(on) {
  if (!DEMO_AVAILABLE) return;
  try { on ? sessionStorage.setItem("dhiti.demo", "1") : sessionStorage.removeItem("dhiti.demo"); } catch { /* private mode */ }
}
