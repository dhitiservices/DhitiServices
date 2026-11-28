import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { X } from "lucide-react";
import { spring, softSpring } from "../lib/motion.js";
import { cx, IconButton } from "./ui.jsx";

function useIsMobile() {
  const q = "(max-width: 639px)";
  const [m, setM] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return m;
}
export { useIsMobile };

let openCount = 0;
function useScrollLock(open) {
  useEffect(() => {
    if (!open) return;
    openCount++;
    document.documentElement.style.overflow = "hidden";
    return () => {
      openCount--;
      if (!openCount) document.documentElement.style.overflow = "";
    };
  }, [open]);
}

/**
 * Modal surface: a centred dialog on desktop, a bottom sheet (drag down to dismiss) on phones.
 * Esc closes; focus moves into the sheet and returns to the trigger afterwards.
 */
export function Sheet({ open, onClose, title, description, children, footer, width = 520, side = "auto", className }) {
  const mobile = useIsMobile();
  const asSheet = side === "bottom" || (side === "auto" && mobile);
  const panel = useRef(null);
  const drag = useDragControls();
  useScrollLock(open);
  // Callers pass inline arrows, so onClose changes on every parent render (every data poll). Keep the latest one in a
  // ref and run the focus effect only when `open` changes; otherwise each poll would blur the field being typed in.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); closeRef.current?.(); }
      if (e.key === "Tab" && panel.current) {
        const f = panel.current.querySelectorAll('a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey, true);
    const t = setTimeout(() => {
      const target = panel.current?.querySelector("[data-autofocus]") || panel.current?.querySelector("textarea,input");
      (target || panel.current)?.focus({ preventScroll: true });
    }, 60);
    const el = panel.current;
    return () => {
      window.removeEventListener("keydown", onKey, true);
      clearTimeout(t);
      // Release focus right away so shortcuts work during the exit animation.
      if (el?.contains(document.activeElement)) document.activeElement.blur();
      if (prev && prev !== document.body) prev.focus?.({ preventScroll: true });
    };
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[70]" initial="closed" animate="open" exit="closed">
          <motion.div
            className="absolute inset-0 bg-[#120d0c]/40 backdrop-blur-[3px] dark:bg-black/60"
            variants={{ open: { opacity: 1 }, closed: { opacity: 0 } }}
            transition={{ duration: 0.22 }}
            onClick={onClose}
          />
          <div className={cx("pointer-events-none absolute inset-0 flex", asSheet ? "items-end" : "items-center justify-center p-6")}>
            <motion.div
              ref={panel}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label={typeof title === "string" ? title : undefined}
              variants={asSheet
                ? { open: { y: 0 }, closed: { y: "100%" } }
                : { open: { opacity: 1, scale: 1, y: 0 }, closed: { opacity: 0, scale: 0.96, y: 8 } }}
              transition={asSheet ? softSpring : spring}
              drag={asSheet ? "y" : false}
              dragControls={drag}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={(_, info) => { if (info.offset.y > 110 || info.velocity.y > 600) onClose?.(); }}
              className={cx(
                "popover pointer-events-auto flex max-h-[calc(100dvh-48px)] w-full flex-col overflow-hidden outline-none",
                asSheet && "max-h-[92dvh] rounded-b-none rounded-t-[22px] pb-[var(--safe-bottom)]",
                className,
              )}
              style={asSheet ? undefined : { maxWidth: width }}
            >
              {asSheet && (
                <div className="flex cursor-grab touch-none justify-center pb-1 pt-2.5 active:cursor-grabbing" onPointerDown={(e) => drag.start(e)}>
                  <div className="h-[5px] w-9 rounded-full bg-ink/20" />
                </div>
              )}
              {(title || description) && (
                <div className={cx("flex items-start gap-3 px-5", asSheet ? "pb-3 pt-1" : "pb-3 pt-5")} onPointerDown={asSheet ? (e) => drag.start(e) : undefined}>
                  <div className="min-w-0 flex-1">
                    {title && <h2 className="text-[19px] font-bold leading-6 tracking-[-0.016em] text-ink">{title}</h2>}
                    {description && <p className="mt-1 text-callout text-ink-mute">{description}</p>}
                  </div>
                  {!asSheet && <IconButton icon={X} label="Close" size="sm" onClick={onClose} className="-mr-1.5 -mt-1" />}
                </div>
              )}
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
              {footer && <div className="hairline-t flex items-center justify-end gap-2 bg-surface-sunken/60 px-5 py-3.5">{footer}</div>}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Small confirm dialog. */
export function Confirm({ open, onClose, onConfirm, title, description, confirmLabel = "Confirm", tone = "primary", children }) {
  const [busy, setBusy] = useState(false);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      width={420}
      footer={
        <>
          <button className="h-9 rounded-xl px-3.5 text-callout font-semibold text-ink-soft hover:bg-ink/[0.05]" onClick={onClose}>Cancel</button>
          <button
            data-autofocus
            disabled={busy}
            className={cx(
              "h-9 rounded-xl px-4 text-callout font-semibold text-white transition-opacity disabled:opacity-60",
              tone === "danger" ? "bg-brand-deep hover:bg-brand" : "bg-gradient-to-b from-[#E30700] to-[#C20600] shadow-glow",
            )}
            onClick={async () => { setBusy(true); try { await onConfirm(); onClose(); } finally { setBusy(false); } }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </Sheet>
  );
}
