import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MotionConfig, motion } from "framer-motion";
import { ToastProvider, useToast } from "./components/Toast.jsx";
import { IdleLock } from "./components/IdleLock.jsx";
import { Sidebar, TabBar, MobileHeader, NAV, isActive } from "./components/Shell.jsx";
import { CommandPalette } from "./components/CommandPalette.jsx";
import { ErrorBoundary } from "./components/ErrorBoundary.jsx";
import { CloudOff, RotateCw, LogOut } from "lucide-react";
import { AppMark, Button } from "./components/ui.jsx";
import { DataProvider, useData } from "./lib/store.jsx";
import { createSupabaseBackend } from "./lib/backend.js";
import { setMediaBackend } from "./lib/media.js";
import { useHotkeys } from "./lib/hotkeys.js";
import { useLocation, match, navigate } from "./lib/router.jsx";
import { demoRequested, setDemo } from "./lib/config.js";
import { page } from "./lib/motion.js";
import { Login, AuroraBackdrop } from "./pages/Auth.jsx";
import { AuthContext } from "./lib/auth.js";
import {
  staleReason, markActive, lastActive, clearActivity, clearPending, REASON_TEXT, urlErrorText,
} from "./lib/session.js";
import Overview from "./pages/Overview.jsx";
import Review from "./pages/Review.jsx";

const Calendar = lazy(() => import("./pages/Calendar.jsx"));
const Research = lazy(() => import("./pages/Research.jsx"));
const Ready = lazy(() => import("./pages/Ready.jsx"));
const Published = lazy(() => import("./pages/Published.jsx"));
const Library = lazy(() => import("./pages/Library.jsx"));
const Settings = lazy(() => import("./pages/Settings.jsx"));

/* global __DEMO__ */
async function makeBackend() {
  if (__DEMO__ && demoRequested()) {
    const { createDemoBackend } = await import("./demo/backend.js");
    return createDemoBackend();
  }
  return createSupabaseBackend();
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <Root />
      </ToastProvider>
    </MotionConfig>
  );
}

/** Waits (briefly) for SF Pro Display so the first painted screen never swaps fonts. */
function fontsReady(timeout = 900) {
  if (!document.fonts?.load) return Promise.resolve();
  const load = Promise.all(["400 15px", "500 15px", "700 15px"].map((w) => document.fonts.load(`${w} "SF Pro Display"`))).catch(() => {});
  return Promise.race([load, new Promise((r) => setTimeout(r, timeout))]);
}

function Splash({ error, onRetry, onSignOut }) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6" aria-busy={!error} aria-live="polite">
      <AuroraBackdrop />
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }} className="relative">
        <span className="splash-halo absolute -inset-8 rounded-[36px]" aria-hidden />
        <AppMark size={64} className="relative shadow-lift" />
      </motion.div>
      {error ? (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="glass-card relative mt-8 max-w-[340px] rounded-[22px] px-6 py-5 text-center">
          <div className="text-headline font-semibold text-ink">Couldn't reach Studio</div>
          <p className="mt-1 text-callout text-ink-mute">Check your internet. Nothing shows until we know it's you.</p>
          <div className="mt-5 flex justify-center gap-2">
            <Button variant="ghost" onClick={onSignOut}>Sign out</Button>
            <Button variant="primary" onClick={onRetry}>Try again</Button>
          </div>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5, duration: 0.4 }} className="relative mt-9 h-[3px] w-28 overflow-hidden rounded-full bg-ink/[0.08]">
          <div className="progress-indeterminate h-full w-1/3 rounded-full bg-gradient-to-r from-brand-bright to-brand-deep" />
        </motion.div>
      )}
      <span className="sr-only">{error ? "Connection problem" : "Checking your access"}</span>
    </div>
  );
}

/**
 * The gate. Nothing of the app renders until a session exists AND public.is_allowlisted() said yes.
 * states: boot (splash) | signed_out (login) | verifying (login, busy) | checking (splash) | error (splash + retry) | ready
 */
function Root() {
  const [backend, setBackend] = useState(null);
  const [auth, setAuth] = useState({ state: "boot", user: null, notice: null });
  const current = useRef(null); // user id whose access was checked (token refreshes for the same person are ignored)
  const toast = useToast();

  useEffect(() => {
    let alive = true;
    Promise.all([makeBackend(), fontsReady()]).then(([b]) => { if (alive) { setMediaBackend(b); setBackend(b); } });
    return () => { alive = false; };
  }, []);

  const endSession = useCallback(async (reason, scope = "local") => {
    current.current = null;
    clearActivity();
    clearPending();
    setAuth({ state: "signed_out", user: null, notice: REASON_TEXT[reason] || null });
    try { await backend?.auth.signOut(scope); }
    catch {
      if (scope === "global") toast({ tone: "danger", title: "Couldn't reach every device", description: "This browser is signed out. Sign in and try again when you're online to end the other sessions." });
    }
  }, [backend, toast]);

  const check = useCallback(async (session) => {
    const stale = staleReason();
    if (stale) return endSession(stale);
    setAuth((a) => ({ ...a, state: a.state === "signed_out" || a.state === "verifying" ? "verifying" : "checking", user: session.user }));
    try {
      const ok = await backend.auth.isAllowlisted();
      if (!ok) return endSession("denied");
      if (!lastActive()) markActive();
      clearPending();
      setAuth({ state: "ready", user: session.user, notice: null });
    } catch {
      setAuth({ state: "error", user: session.user, notice: null });
    }
  }, [backend, endSession]);

  useEffect(() => {
    if (!backend) return;
    let alive = true;
    const handle = (session) => {
      if (!alive) return;
      if (!session) {
        current.current = null;
        setAuth((a) => (a.state === "signed_out" ? a : { state: "signed_out", user: null, notice: null }));
        return;
      }
      const id = session.user?.id || null;
      if (id && id === current.current) return;
      current.current = id;
      check(session);
    };
    backend.auth.getSession().then((s) => {
      if (!alive) return;
      const urlError = backend.auth.takeUrlError?.();
      if (!s) {
        setAuth({ state: "signed_out", user: null, notice: urlError ? urlErrorText(urlError.code, urlError.description) : null });
        return;
      }
      handle(s);
    });
    const off = backend.auth.onChange((s) => handle(s));
    return () => { alive = false; off?.(); };
  }, [backend, check]);

  const signOut = useCallback((scope = "local") => endSession(scope === "global" ? "global" : null, scope), [endSession]);
  const authValue = useMemo(() => ({ user: auth.user, signOut, demo: backend?.kind === "demo" }), [auth.user, signOut, backend]);

  const enterDemo = useCallback(() => {
    setDemo(true);
    window.location.assign("/?demo=1");
  }, []);
  const leaveDemo = useCallback(() => {
    setDemo(false);
    window.location.assign("/?demo=0");
  }, []);

  if (!backend || auth.state === "boot" || auth.state === "checking") return <Splash />;
  if (auth.state === "error") return <Splash error onRetry={() => { current.current = null; backend.auth.getSession().then((s) => (s ? check(s) : endSession(null))); }} onSignOut={() => endSession(null)} />;
  if (auth.state === "signed_out" || auth.state === "verifying") {
    return <Login backend={backend} notice={auth.notice} verifying={auth.state === "verifying"} onDemo={enterDemo} onLeaveDemo={backend.kind === "demo" ? leaveDemo : null} />;
  }

  return (
    <AuthContext.Provider value={authValue}>
      <DataProvider backend={backend} user={auth.user}>
        <Shell onSignOut={() => signOut()} demo={backend.kind === "demo"} />
        <IdleLock onExpire={(reason) => endSession(reason)} />
      </DataProvider>
    </AuthContext.Provider>
  );
}

const ROUTES = [
  { path: "/", el: () => <Overview /> },
  { path: "/review", el: () => <Review /> },
  { path: "/review/:id", el: (p) => <Review id={p.id} /> },
  { path: "/calendar", el: () => <Calendar /> },
  { path: "/research", el: () => <Research /> },
  { path: "/research/:id", el: (p) => <Research id={p.id} /> },
  { path: "/ready", el: () => <Ready /> },
  { path: "/published", el: () => <Published /> },
  { path: "/library", el: () => <Library /> },
  { path: "/settings", el: () => <Settings /> },
];

function PageFallback() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 lg:py-10">
      <div className="skeleton mb-3 h-4 w-24" />
      <div className="skeleton mb-8 h-9 w-64" />
      <div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-40 rounded-2xl" />)}</div>
    </div>
  );
}

/**
 * The first data load failed: say so plainly. Never show empty states ("all caught up", zero counts) for data that
 * was never loaded.
 */
function LoadError({ error, onRetry, onSignOut }) {
  const [busy, setBusy] = useState(false);
  const retry = async () => { setBusy(true); try { await onRetry(); } finally { setBusy(false); } };
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  return (
    <div className="flex min-h-[calc(100dvh-140px)] items-center justify-center px-4 py-10 lg:min-h-dvh" role="alert" aria-live="assertive" data-testid="load-error">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }} className="card w-full max-w-[440px] p-7 text-center sm:p-8">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-warn/[0.12] text-warn shadow-[inset_0_0_0_1px_rgb(var(--warn)/0.18)]">
          <CloudOff className="h-6 w-6" strokeWidth={1.9} />
        </span>
        <h1 className="mt-5 text-title-2 font-bold text-ink">Couldn't load your work</h1>
        <p className="mt-2 text-body text-ink-mute">
          {offline ? "You're offline. Connect to the internet, then try again." : "Nothing came through, so we show nothing instead of an empty page. Your work is safe."}
        </p>
        {error?.message && (
          <p className="tnum mx-auto mt-4 max-w-full break-words rounded-xl bg-ink/[0.04] px-3.5 py-2.5 text-left text-[12.5px] leading-[18px] text-ink-soft">
            <span className="font-semibold text-ink">Details: </span>{error.message}
          </p>
        )}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
          <Button variant="ghost" icon={LogOut} onClick={onSignOut}>Sign out</Button>
          <Button variant="primary" icon={RotateCw} onClick={retry} loading={busy} disabled={busy}>{busy ? "Trying again…" : "Try again"}</Button>
        </div>
      </motion.div>
    </div>
  );
}

function Shell({ onSignOut, demo }) {
  const { pathname } = useLocation();
  const [palette, setPalette] = useState(false);
  const data = useData();

  useHotkeys({
    "mod+k": () => setPalette((v) => !v),
    "/": () => setPalette(true),
  });

  const route = useMemo(() => {
    for (const r of ROUTES) {
      const p = match(r.path, pathname);
      if (p) return { r, p };
    }
    return null;
  }, [pathname]);

  useEffect(() => {
    if (!route) navigate("/", { replace: true });
  }, [route]);

  const section = "/" + (pathname.split("/")[1] || "");
  // New section: start at the top, unless the URL targets an anchor (for example /settings#runs), which the page
  // scrolls to itself.
  useEffect(() => { if (!window.location.hash) window.scrollTo({ top: 0 }); }, [section]);

  const title = NAV.find((n) => isActive(n.to, pathname))?.label || "Studio";
  useEffect(() => {
    const n = data.reviewCount;
    document.title = `${n ? `(${n}) ` : ""}${title} · Dhiti Studio`;
  }, [title, data.reviewCount]);

  return (
    <div className="relative flex min-h-dvh">
      <div className="aurora pointer-events-none fixed inset-0 -z-0" aria-hidden />
      <Sidebar onSearch={() => setPalette(true)} onSignOut={onSignOut} demo={demo} />
      <div className="relative min-w-0 flex-1">
        <MobileHeader title={title} onSearch={() => setPalette(true)} />
        <main className="pb-[calc(84px+var(--safe-bottom))] lg:pb-0">
          {/* Enter-only page transition: a keyed remount fades/slides the new page in. No exit wait, so a
              slow or interrupted exit can never leave the screen blank. */}
          <motion.div key={section} variants={page} initial="initial" animate="animate">
            <ErrorBoundary resetKey={pathname}>
              {data.status === "error" ? (
                <LoadError error={data.error} onRetry={data.actions.reload} onSignOut={onSignOut} />
              ) : (
                <Suspense fallback={<PageFallback />}>{route ? route.r.el(route.p) : null}</Suspense>
              )}
            </ErrorBoundary>
          </motion.div>
        </main>
      </div>
      <TabBar onSignOut={onSignOut} demo={demo} />
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  );
}
