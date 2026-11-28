import { useEffect, useRef } from "react";

const typing = (el) =>
  el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

/**
 * useHotkeys({ j: fn, k: fn, "mod+k": fn, escape: fn }, { enabled, allowInInputs: ["escape","mod+k"] })
 * Keys are lower-case `event.key` names; "mod" is ⌘ on Apple, Ctrl elsewhere; "shift+a" for Shift with a letter
 * (a plain "a" binding never fires for Shift+A or Alt+A).
 */
export function useHotkeys(map, { enabled = true, allowInInputs = ["escape", "mod+k", "mod+enter", "mod+s"] } = {}) {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e) => {
      if (e.isComposing) return;
      const key = (e.key || "").toLowerCase();
      const mod = e.metaKey || e.ctrlKey;
      const letter = /^[a-z]$/.test(key);
      const combo = mod ? `mod+${key}` : e.altKey ? null : e.shiftKey ? (letter ? `shift+${key}` : key.length > 1 ? null : key) : key;
      if (!combo) return;
      if (typing(document.activeElement) && !allowInInputs.includes(combo)) return;
      const fn = ref.current[combo];
      if (fn) {
        const r = fn(e);
        if (r !== false) e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, allowInInputs.join("|")]);
}

export const isApple = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const MOD = isApple ? "⌘" : "Ctrl";
