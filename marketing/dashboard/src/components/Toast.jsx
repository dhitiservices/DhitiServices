import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, Info, XCircle, MinusCircle, X } from "lucide-react";
import { spring } from "../lib/motion.js";

const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

// Toasts are always dark, so their icons use fixed colours that keep 3:1+ contrast on #1f1918 in both themes.
const TONE = {
  ok: { icon: CheckCircle2, cls: "text-[#3DD68C]" },
  warn: { icon: AlertTriangle, cls: "text-[#FFB340]" },
  danger: { icon: XCircle, cls: "text-[#FF6A55]" },
  info: { icon: Info, cls: "text-[#6AA8FF]" },
  neutral: { icon: MinusCircle, cls: "text-white/60" },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current.get(id)?.handle);
    timers.current.delete(id);
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const start = useCallback((id, ms) => {
    timers.current.set(id, { handle: setTimeout(() => dismiss(id), ms), started: Date.now(), remaining: ms });
  }, [dismiss]);
  // WCAG 2.2.1: the timer (and the Undo it carries) pauses while the pointer or keyboard focus is on the toast.
  const pause = useCallback((id) => {
    const t = timers.current.get(id);
    if (!t || t.paused) return;
    clearTimeout(t.handle);
    timers.current.set(id, { ...t, paused: true, remaining: Math.max(1200, t.remaining - (Date.now() - t.started)) });
  }, []);
  const resume = useCallback((id) => {
    const t = timers.current.get(id);
    if (t?.paused) start(id, t.remaining);
  }, [start]);

  const toast = useCallback((opts) => {
    const id = Math.random().toString(36).slice(2);
    const t = { id, tone: "neutral", duration: 4200, ...opts };
    setToasts((list) => [...list.slice(-2), t]);
    start(id, t.duration);
    return id;
  }, [start]);

  const value = useMemo(() => toast, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 z-[80] flex flex-col items-center gap-2 px-4 bottom-[calc(88px+var(--safe-bottom))] lg:bottom-6"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const { icon: Icon, cls } = TONE[t.tone] || TONE.neutral;
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 24, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.97, transition: { duration: 0.16 } }}
                transition={spring}
                className="pointer-events-auto flex w-full max-w-[440px] items-start gap-3 rounded-2xl bg-[#1f1918]/95 px-4 py-3 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_16px_40px_-12px_rgba(0,0,0,0.5)] backdrop-blur-xl dark:bg-[#2c2423]/95"
                role="status"
                onPointerEnter={() => pause(t.id)}
                onPointerLeave={() => resume(t.id)}
                onFocus={() => pause(t.id)}
                onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) resume(t.id); }}
              >
                <Icon className={`mt-px h-[18px] w-[18px] shrink-0 ${cls}`} strokeWidth={2.2} />
                <div className="min-w-0 flex-1">
                  <div className="text-callout font-semibold">{t.title}</div>
                  {t.description && <div className="mt-0.5 text-callout text-white/65 line-clamp-2">{t.description}</div>}
                </div>
                {t.action && (
                  <button
                    onClick={() => { dismiss(t.id); t.action.onClick(); }}
                    className="-my-1 shrink-0 rounded-lg px-2.5 py-1 text-callout font-semibold text-[#FF5C48] transition-colors hover:bg-white/10"
                  >
                    {t.action.label}
                  </button>
                )}
                <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="-my-0.5 -mr-1 shrink-0 rounded-md p-1 text-white/40 transition-colors hover:text-white/80">
                  <X className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
