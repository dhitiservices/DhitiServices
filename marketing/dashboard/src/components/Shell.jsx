import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutGrid, Inbox, CalendarDays, Telescope, Send, Globe2, FolderOpen, Settings2, Search, MoreHorizontal,
  Sun, Moon, Monitor, LogOut,
} from "lucide-react";
import { Link, navigate, useLocation } from "../lib/router.jsx";
import { useData } from "../lib/store.jsx";
import { spring } from "../lib/motion.js";
import { relative } from "../lib/format.js";
import { MOD } from "../lib/hotkeys.js";
import { cx, Kbd, Avatar, Logo, AppMark, Segmented } from "./ui.jsx";
import { Sheet } from "./Sheet.jsx";

export const NAV = [
  { to: "/", label: "Home", icon: LayoutGrid, group: "Work" },
  { to: "/review", label: "Review", icon: Inbox, group: "Work", badge: "reviewCount" },
  { to: "/calendar", label: "Calendar", icon: CalendarDays, group: "Work" },
  { to: "/ready", label: "Ready to post", short: "Ready", icon: Send, group: "Work", badge: "readyCount" },
  { to: "/published", label: "Live", icon: Globe2, group: "Work" },
  { to: "/research", label: "Research", icon: Telescope, group: "Your input" },
  { to: "/library", label: "Library", icon: FolderOpen, group: "Your input" },
  { to: "/settings", label: "Settings", icon: Settings2, group: "Your input" },
];

export const isActive = (to, pathname) => (to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`));

/* ------------------------------------------------------------------ theme (one shared store) */
const themeListeners = new Set();
let themeValue = (() => { try { return localStorage.getItem("dhiti.theme") || "system"; } catch { return "system"; } })();
const darkMq = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
function applyTheme() {
  const dark = themeValue === "dark" || (themeValue === "system" && darkMq?.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", dark ? "#100C0C" : "#FAF7F2"));
}
darkMq?.addEventListener("change", applyTheme);
function setThemeValue(t) {
  themeValue = t;
  try { localStorage.setItem("dhiti.theme", t); } catch { /* private mode */ }
  applyTheme();
  themeListeners.forEach((l) => l());
}
export function useTheme() {
  const t = useSyncExternalStore((cb) => { themeListeners.add(cb); return () => themeListeners.delete(cb); }, () => themeValue, () => "system");
  return [t, setThemeValue];
}

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Auto", icon: Monitor },
];

/** "just now" | "4 min ago" | "2 h ago" | "3 d ago": short enough for the sidebar footer. */
function ago(d) {
  const m = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
}

function SyncBadge() {
  const { live, lastSync, status, syncError } = useData();
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30_000); return () => clearInterval(t); }, []);
  // A failed load or refresh always wins over the Live dot: the data on screen may be stale.
  if (status === "error" || syncError) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full bg-warn/[0.12] px-2 py-0.5 text-[11.5px] font-medium text-warn"
        title="We couldn't get the newest data. Trying again every 30 seconds."
        role="status"
        data-testid="sync-offline"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-warn" />
        {lastSync ? `Offline · updated ${ago(lastSync)}` : "Offline"}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink-mute" title={live ? "Updates show up by themselves" : "Checking for updates every 30 seconds"}>
      <span className={cx("h-1.5 w-1.5 rounded-full", live ? "bg-ok shadow-[0_0_0_3px_rgb(var(--ok)/0.18)]" : "bg-ink-faint")} />
      {live ? "Up to date" : lastSync ? `Updated ${relative(lastSync)}` : "Updating"}
    </span>
  );
}

/* ------------------------------------------------------------------ sidebar (desktop) */
export function Sidebar({ onSearch, onSignOut, demo }) {
  const { pathname } = useLocation();
  const data = useData();
  const [theme, setTheme] = useTheme();
  const groups = [...new Set(NAV.map((n) => n.group))];

  return (
    <aside className="glass hairline-r sticky top-0 z-30 hidden h-dvh w-[252px] shrink-0 flex-col lg:flex">
      <div className="flex items-center gap-2.5 px-5 pb-4 pt-5">
        <Logo className="h-[22px]" />
        <span className="mt-[3px] text-[13px] font-semibold tracking-[-0.01em] text-ink-mute">Studio</span>
        {demo && <span className="ml-auto mt-0.5 rounded-md bg-ink/[0.06] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-mute">Demo</span>}
      </div>

      <div className="px-3">
        <button
          onClick={onSearch}
          className="flex h-9 w-full items-center gap-2 rounded-xl bg-ink/[0.045] px-3 text-callout text-ink-mute transition-colors hover:bg-ink/[0.07]"
        >
          <Search className="h-4 w-4" strokeWidth={2} />
          <span className="flex-1 text-left">Search</span>
          <Kbd>{MOD === "⌘" ? "⌘K" : "Ctrl K"}</Kbd>
        </button>
      </div>

      <nav className="mt-4 flex-1 overflow-y-auto px-3 pb-4">
        {groups.map((g) => (
          <div key={g} className="mb-5">
            <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">{g}</div>
            {NAV.filter((n) => n.group === g).map((n) => {
              const active = isActive(n.to, pathname);
              const count = n.badge ? data[n.badge] : 0;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "group relative flex h-[34px] items-center gap-2.5 rounded-[10px] px-3 text-[14px] font-medium tracking-[-0.008em] transition-colors",
                    active ? "text-ink" : "text-ink-soft hover:text-ink",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-active"
                      transition={spring}
                      className="absolute inset-0 rounded-[10px] bg-surface shadow-[0_0_0_1px_var(--hairline),0_1px_2px_rgb(var(--shadow)/0.06),0_2px_8px_-2px_rgb(var(--shadow)/0.08)] dark:bg-white/[0.07]"
                    />
                  )}
                  {!active && <span className="absolute inset-0 rounded-[10px] bg-ink/0 transition-colors group-hover:bg-ink/[0.04]" />}
                  <n.icon className={cx("relative h-[17px] w-[17px] transition-colors", active ? "text-brand-ink" : "text-ink-mute group-hover:text-ink-soft")} strokeWidth={2} />
                  <span className="relative flex-1">{n.label}</span>
                  <AnimatePresence>
                    {count > 0 && (
                      <motion.span
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.5, opacity: 0 }}
                        transition={spring}
                        className={cx(
                          "tnum relative min-w-[20px] rounded-full px-1.5 text-center text-[11px] font-bold leading-5",
                          n.badge === "reviewCount" ? "bg-brand-deep text-white" : "bg-ink/[0.07] text-ink-soft",
                        )}
                      >
                        {count}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="hairline-t space-y-3 px-4 py-4">
        <div className="flex items-center justify-between">
          <SyncBadge />
          <Segmented size="sm" value={theme} onChange={setTheme} layoutId="theme-seg" label="Theme" options={THEME_OPTIONS.map((o) => ({ value: o.value, icon: o.icon, label: "", ariaLabel: `${o.label} theme` }))} />
        </div>
        <div className="flex items-center gap-2.5">
          <Avatar email={data.user?.email} size={30} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-callout font-semibold text-ink">{data.user?.email?.split("@")[0] || "Team"}</div>
            <div className="truncate text-[11.5px] text-ink-mute">{data.user?.email}</div>
          </div>
          <button onClick={onSignOut} title={demo ? "Sign out of demo" : "Sign out"} aria-label="Sign out" className="rounded-lg p-1.5 text-ink-mute transition-colors hover:bg-ink/[0.06] hover:text-ink">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ mobile chrome */
const TABS = ["/", "/review", "/calendar", "/ready"];

export function MobileHeader({ title, onSearch }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 44);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={cx("glass glass-strong sticky top-0 z-30 flex h-[calc(52px+env(safe-area-inset-top))] items-center gap-3 px-4 pt-[env(safe-area-inset-top)] transition-[box-shadow] lg:hidden", scrolled && "shadow-[0_1px_0_var(--hairline)]")}>
      <AppMark size={28} />
      <motion.span
        key={title}
        initial={false}
        animate={{ opacity: scrolled ? 1 : 0, y: scrolled ? 0 : 6 }}
        transition={{ duration: 0.2 }}
        className="flex-1 truncate text-center text-headline font-semibold"
        aria-hidden={!scrolled}
      >
        {title}
      </motion.span>
      <button onClick={onSearch} aria-label="Search" className="flex h-9 w-9 items-center justify-center rounded-full bg-ink/[0.05] text-ink-soft active:bg-ink/10">
        <Search className="h-[18px] w-[18px]" strokeWidth={2} />
      </button>
    </header>
  );
}

function Item({ active, icon: Icon, label, count, urgent, onClick, to }) {
  const inner = (
    <>
      <span className="relative">
        {active && <motion.span layoutId="tab-active" transition={spring} className="absolute -inset-x-3.5 -inset-y-1 rounded-full bg-brand/[0.1]" />}
        <Icon className={cx("relative h-[22px] w-[22px] transition-colors", active ? "text-brand-ink" : "text-ink-mute")} strokeWidth={active ? 2.3 : 2} />
        {count > 0 && <span className={cx("tnum absolute -right-2.5 -top-1.5 min-w-[17px] rounded-full px-1 text-center text-[10px] font-bold leading-[17px] ring-2 ring-canvas", urgent ? "bg-brand-deep text-white" : "bg-ink text-canvas")}>{count}</span>}
      </span>
      <span className={cx("mt-1 text-[10.5px] font-semibold tracking-[-0.005em]", active ? "text-brand-ink" : "text-ink-mute")}>{label}</span>
    </>
  );
  const cls = "flex flex-1 flex-col items-center justify-center pt-2 pb-1 active:opacity-70";
  return to ? <Link to={to} className={cls} aria-current={active ? "page" : undefined}>{inner}</Link> : <button onClick={onClick} className={cls} aria-expanded={active || undefined}>{inner}</button>;
}


export function TabBar({ onSignOut, demo }) {
  const { pathname } = useLocation();
  const data = useData();
  const [more, setMore] = useState(false);
  const [theme, setTheme] = useTheme();
  const tabs = NAV.filter((n) => TABS.includes(n.to));
  const inMore = !tabs.some((t) => isActive(t.to, pathname));

  return (
    <>
      <nav className="glass glass-strong fixed inset-x-0 bottom-0 z-40 flex shadow-[0_-1px_0_var(--hairline)] pb-[var(--safe-bottom)] lg:hidden">
        {tabs.map((t) => (
          <Item key={t.to} to={t.to} icon={t.icon} label={t.short || t.label} active={isActive(t.to, pathname)} count={t.badge ? data[t.badge] : 0} urgent={t.badge === "reviewCount"} />
        ))}
        <Item icon={MoreHorizontal} label="More" active={inMore} onClick={() => setMore(true)} />
      </nav>
      <Sheet open={more} onClose={() => setMore(false)} side="bottom" title="More">
        <div className="overflow-hidden rounded-2xl bg-surface shadow-[0_0_0_1px_var(--hairline)]">
          {NAV.filter((n) => !TABS.includes(n.to)).map((n, i) => (
            <button
              key={n.to}
              onClick={() => { setMore(false); navigate(n.to); }}
              className={cx("flex w-full items-center gap-3 px-4 py-3.5 text-left text-body font-medium active:bg-ink/[0.04]", i > 0 && "hairline-t")}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-ink/[0.05]"><n.icon className="h-[17px] w-[17px] text-ink-soft" /></span>
              <span className="flex-1">{n.label}</span>
              {isActive(n.to, pathname) && <span className="h-2 w-2 rounded-full bg-brand" />}
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-callout font-semibold text-ink-soft">Appearance</span>
          <Segmented size="sm" value={theme} onChange={setTheme} layoutId="theme-seg-m" label="Theme" options={THEME_OPTIONS} />
        </div>
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-[0_0_0_1px_var(--hairline)]">
          <Avatar email={data.user?.email} size={34} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-callout font-semibold">{data.user?.email}</div>
            <SyncBadge />
          </div>
          <button onClick={onSignOut} className="rounded-xl bg-ink/[0.05] px-3 py-2 text-callout font-semibold text-ink-soft">Sign out</button>
        </div>
      </Sheet>
    </>
  );
}

/* ------------------------------------------------------------------ page header */
export function PageHeader({ title, subtitle, eyebrow, actions, className }) {
  // Phone: the large title fades out as it slides under the compact top bar (which then shows the title).
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !window.matchMedia?.("(max-width: 1023px)").matches) return undefined;
    const on = () => { el.style.opacity = String(Math.max(0, 1 - window.scrollY / 56)); };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <div className={cx("mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0" ref={ref}>
        {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
        <h1 className="text-title-1 font-bold text-ink sm:text-title-l">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-body text-ink-mute">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
