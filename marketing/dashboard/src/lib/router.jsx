import { useSyncExternalStore } from "react";

// A tiny history router: the dashboard has a handful of flat routes, so a dependency is not worth it.
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());
if (typeof window !== "undefined") window.addEventListener("popstate", emit);

function subscribe(cb) { listeners.add(cb); return () => listeners.delete(cb); }
const snapshot = () => window.location.pathname + window.location.search;

export function navigate(to, { replace = false } = {}) {
  if (to === snapshot()) return;
  window.history[replace ? "replaceState" : "pushState"]({}, "", to);
  emit();
}

export function useLocation() {
  const full = useSyncExternalStore(subscribe, snapshot, () => "/");
  const [pathname, search = ""] = full.split("?");
  return { pathname: pathname.replace(/\/+$/, "") || "/", search: new URLSearchParams(search) };
}

/** match("/review/:id", "/review/abc") -> {id:"abc"} | null */
export function match(pattern, pathname) {
  const p = pattern.split("/").filter(Boolean);
  const s = pathname.split("/").filter(Boolean);
  if (p.length !== s.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(":")) params[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return params;
}

export function Link({ to, children, className, onClick, ...rest }) {
  return (
    <a
      href={to}
      className={className}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
