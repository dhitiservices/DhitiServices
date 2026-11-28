import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { MotionConfig, motion } from "framer-motion";
import { ToastProvider } from "./components/Toast.jsx";
import { Sidebar, TabBar, MobileHeader, NAV, isActive } from "./components/Shell.jsx";
import { CommandPalette } from "./components/CommandPalette.jsx";
import { ErrorBoundary } from "./components/ErrorBoundary.jsx";
import { AppMark } from "./components/ui.jsx";
import { DataProvider, useData } from "./lib/store.jsx";
import { createSupabaseBackend } from "./lib/backend.js";
import { setMediaBackend } from "./lib/media.js";
import { useHotkeys } from "./lib/hotkeys.js";
import { useLocation, match, navigate } from "./lib/router.jsx";
import { demoRequested, setDemo } from "./lib/config.js";
import { page } from "./lib/motion.js";
import { Login, NotAuthorised } from "./pages/Auth.jsx";
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

function Splash() {
  return (
    <div className="aurora flex min-h-dvh items-center justify-center">
      <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}>
        <AppMark size={56} />
      </motion.div>
    </div>
  );
}

function Root() {
  const [backend, setBackend] = useState(null);
  const [auth, setAuth] = useState({ state: "checking", user: null });

  useEffect(() => {
    let alive = true;
    makeBackend().then((b) => { if (alive) { setMediaBackend(b); setBackend(b); } });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!backend) return;
    let alive = true;
    const check = async (session) => {
      if (!alive) return;
      if (!session) return setAuth({ state: "signed_out", user: null });
      try {
        const team = await backend.auth.isTeam();
        if (alive) setAuth({ state: team ? "ready" : "not_team", user: session.user });
      } catch {
        if (alive) setAuth({ state: "not_team", user: session.user, error: true });
      }
    };
    let current = null;
    const handle = (session) => {
      const id = session?.user?.id || null;
      if (id === current && id !== null) return; // token refresh for the same person
      current = id;
      check(session);
    };
    backend.auth.getSession().then(handle);
    const off = backend.auth.onChange((s) => {
      if (!s) { current = null; setAuth({ state: "signed_out", user: null }); }
      else handle(s);
    });
    return () => { alive = false; off?.(); };
  }, [backend]);

  const signOut = useCallback(async () => {
    if (backend?.kind === "demo") {
      setDemo(false);
      window.location.assign("/");
      return;
    }
    await backend?.auth.signOut();
  }, [backend]);

  const enterDemo = useCallback(() => {
    setDemo(true);
    window.location.assign("/?demo=1");
  }, []);

  if (!backend || auth.state === "checking") return <Splash />;
  if (auth.state === "signed_out") return <Login backend={backend} onDemo={enterDemo} />;
  if (auth.state === "not_team") return <NotAuthorised email={auth.user?.email} onSignOut={signOut} />;

  return (
    <DataProvider backend={backend} user={auth.user}>
      <Shell onSignOut={signOut} demo={backend.kind === "demo"} />
    </DataProvider>
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
              <Suspense fallback={<PageFallback />}>{route ? route.r.el(route.p) : null}</Suspense>
            </ErrorBoundary>
          </motion.div>
        </main>
      </div>
      <TabBar onSignOut={onSignOut} demo={demo} />
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  );
}
