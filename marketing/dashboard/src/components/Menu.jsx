import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { spring } from "../lib/motion.js";
import { cx, Kbd } from "./ui.jsx";

/** Lightweight dropdown menu. items: [{label, icon, onClick, danger, kbd, disabled} | "divider"] */
export function Menu({ trigger, items, align = "right", side = "bottom", className }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("pointerdown", close);
    window.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("pointerdown", close); window.removeEventListener("keydown", key, true); };
  }, [open]);

  return (
    <div ref={ref} className={cx("relative", className)}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.1 } }}
            transition={spring}
            style={{ transformOrigin: `${side === "top" ? "bottom" : "top"} ${align === "right" ? "right" : "left"}` }}
            className={cx("popover absolute z-50 min-w-[220px] p-1.5", side === "top" ? "bottom-[calc(100%+8px)]" : "top-[calc(100%+6px)]", align === "right" ? "right-0" : "left-0")}
            role="menu"
          >
            {items.filter(Boolean).map((it, i) =>
              it === "divider" ? (
                <div key={i} className="mx-2 my-1 h-px bg-ink/[0.07]" />
              ) : (
                <button
                  key={it.label}
                  role="menuitem"
                  disabled={it.disabled}
                  onClick={() => { setOpen(false); it.onClick(); }}
                  className={cx(
                    "flex h-9 w-full items-center gap-2.5 rounded-[9px] px-2.5 text-left text-callout font-medium transition-colors disabled:opacity-40",
                    it.danger ? "text-brand hover:bg-brand/[0.07]" : "text-ink hover:bg-ink/[0.05]",
                  )}
                >
                  {it.icon && <it.icon className={cx("h-4 w-4", it.danger ? "" : "text-ink-mute")} strokeWidth={2} />}
                  <span className="flex-1">{it.label}</span>
                  {it.kbd && <Kbd>{it.kbd}</Kbd>}
                </button>
              ),
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
