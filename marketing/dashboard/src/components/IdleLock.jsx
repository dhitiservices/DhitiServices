import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Lock } from "lucide-react";
import { IDLE_MS, IDLE_WARN_MS, HIDDEN_MS, markActive, lastActive, markHidden, hiddenSince, clearHidden } from "../lib/session.js";
import { spring } from "../lib/motion.js";

const EVENTS = ["pointerdown", "pointermove", "keydown", "touchstart", "wheel", "scroll"];
const WRITE_EVERY = 5000; // activity is written to localStorage at most every 5 s (shared by every open tab)

/**
 * Idle lock. 30 minutes without pointer, key, touch or scroll input signs out, after a 60 s countdown that any
 * input (or "Stay signed in") cancels. A tab hidden for more than 12 hours signs out when it comes back. The clock
 * uses wall time, so a laptop that slept through the deadline signs out as soon as it wakes.
 */
export function IdleLock({ onExpire }) {
  const [left, setLeft] = useState(null); // seconds remaining while warning, else null
  const lastWrite = useRef(0);
  const done = useRef(false);
  const expire = useRef(onExpire);
  expire.current = onExpire;

  useEffect(() => {
    const now = Date.now();
    if (!lastActive()) markActive(now);
    clearHidden();

    const fire = (reason) => {
      if (done.current) return;
      done.current = true;
      setLeft(null);
      expire.current(reason);
    };
    const activity = () => {
      const t = Date.now();
      if (t - lastWrite.current < WRITE_EVERY) return;
      // Input after the deadline (for example the first keypress after waking the laptop) must not revive it.
      const a = lastActive();
      if (a && t - a >= IDLE_MS) return fire("idle");
      lastWrite.current = t;
      markActive(t);
      setLeft(null);
    };
    const tick = () => {
      if (done.current) return;
      const a = lastActive() ?? Date.now();
      const idle = Date.now() - a;
      if (idle >= IDLE_MS) return fire("idle");
      if (idle >= IDLE_MS - IDLE_WARN_MS) setLeft(Math.max(1, Math.ceil((IDLE_MS - idle) / 1000)));
      else setLeft((v) => (v === null ? v : null));
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") return markHidden();
      const h = hiddenSince();
      clearHidden();
      if (h && Date.now() - h > HIDDEN_MS) return fire("hidden");
      tick();
    };

    EVENTS.forEach((e) => window.addEventListener(e, activity, { passive: true, capture: true }));
    document.addEventListener("visibilitychange", visibility);
    const id = setInterval(tick, 1000);
    return () => {
      EVENTS.forEach((e) => window.removeEventListener(e, activity, { capture: true }));
      document.removeEventListener("visibilitychange", visibility);
      clearInterval(id);
    };
  }, []);

  const stay = () => { lastWrite.current = Date.now(); markActive(); setLeft(null); };

  return (
    <AnimatePresence>
      {left !== null && (
        <motion.div
          key="idle"
          role="alertdialog"
          aria-live="assertive"
          aria-label="Signing out soon"
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.97, transition: { duration: 0.16 } }}
          transition={spring}
          className="fixed inset-x-0 z-[90] mx-auto flex w-[calc(100%-32px)] max-w-[440px] items-center gap-3 rounded-2xl bg-[#1d1e23]/95 px-4 py-3 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_16px_40px_-12px_rgba(0,0,0,0.5)] backdrop-blur-xl bottom-[calc(88px+var(--safe-bottom))] lg:bottom-6 dark:bg-[#2a2b31]/95"
        >
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center">
            <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90" aria-hidden>
              <circle cx="20" cy="20" r="17" fill="none" stroke="rgb(255 255 255 / 0.12)" strokeWidth="3" />
              <circle cx="20" cy="20" r="17" fill="none" stroke="#FF5C48" strokeWidth="3" strokeLinecap="round" strokeDasharray={2 * Math.PI * 17} strokeDashoffset={2 * Math.PI * 17 * (1 - left / 60)} style={{ transition: "stroke-dashoffset 1s linear" }} />
            </svg>
            <Lock className="h-4 w-4 text-white/80" strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-callout font-semibold">Signing out in <span className="tnum">{left}</span> s</div>
            <div className="mt-0.5 text-callout text-white/65">No activity for 29 minutes.</div>
          </div>
          <button onClick={stay} className="-my-1 shrink-0 rounded-lg px-2.5 py-1.5 text-callout font-semibold text-[#FF5C48] transition-colors hover:bg-white/10">
            Stay signed in
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
