import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, ShieldCheck, Lock, Check, X, Sun, Moon, Monitor, Plus, LogOut, MonitorSmartphone, Mail, Timer } from "lucide-react";
import { useAuth } from "../lib/auth.js";
import { Confirm } from "../components/Sheet.jsx";
import { useData } from "../lib/store.jsx";
import { PageHeader, useTheme } from "../components/Shell.jsx";
import { Button, Card, Field, Stepper, StatusChip, Skeleton, Segmented, EmptyState, Avatar, cx } from "../components/ui.jsx";
import { RUN_STATUS, RUN_KIND } from "../lib/model.js";
import { formatDateTime, duration, relative } from "../lib/format.js";
import { spring } from "../lib/motion.js";
import { useHotkeys, MOD } from "../lib/hotkeys.js";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const FIELDS = ["blogs_per_week", "carousels_per_blog", "graphics_per_blog", "videos_per_blog", "publish_days", "audience", "avoid_topics", "extra_guidance"];
const DEFAULTS = { blogs_per_week: 3, carousels_per_blog: 1, graphics_per_blog: 2, videos_per_blog: 1, publish_days: ["Monday", "Wednesday", "Friday"], audience: "", avoid_topics: [], extra_guidance: "" };

const pick = (s) => Object.fromEntries(FIELDS.map((k) => [k, s?.[k] ?? DEFAULTS[k]]));

function Row({ label, hint, children }) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="text-body font-semibold text-ink">{label}</div>
        {hint && <div className="mt-0.5 text-[12.5px] text-ink-mute">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function TokenInput({ value, onChange, placeholder }) {
  const [text, setText] = useState("");
  const add = () => {
    const t = text.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setText("");
  };
  return (
    <div className="input flex min-h-[44px] flex-wrap items-center gap-1.5 !py-1.5">
      <AnimatePresence initial={false}>
        {value.map((v) => (
          <motion.span key={v} layout initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={spring} className="inline-flex h-7 items-center gap-1 rounded-lg bg-ink/[0.06] pl-2.5 pr-1 text-callout font-medium text-ink">
            {v}
            <button onClick={() => onChange(value.filter((x) => x !== v))} className="rounded-md p-0.5 text-ink-mute hover:bg-ink/10 hover:text-ink" aria-label={`Remove ${v}`}><X className="h-3.5 w-3.5" /></button>
          </motion.span>
        ))}
      </AnimatePresence>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); }
          else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={add}
        placeholder={value.length ? "Add another…" : placeholder}
        className="min-w-[160px] flex-1 bg-transparent py-1 text-body outline-none placeholder:text-ink-faint"
      />
      {text.trim() && <button onClick={add} className="rounded-md p-1 text-ink-mute hover:text-ink" aria-label="Add"><Plus className="h-4 w-4" /></button>}
    </div>
  );
}

export default function Settings() {
  const d = useData();
  const loading = d.status === "loading";
  const saved = useMemo(() => pick(d.settings), [d.settings]);
  const [form, setForm] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useTheme();
  // Polls refresh d.settings every 30 s: only replace the form when the person has no unsaved edits.
  const savedKey = JSON.stringify(saved);
  const lastSaved = useRef(savedKey);
  useEffect(() => {
    setForm((f) => (JSON.stringify(f) === lastSaved.current ? JSON.parse(savedKey) : f));
    lastSaved.current = savedKey;
  }, [savedKey]);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!dirty || busy) return;
    setBusy(true);
    try { await d.actions.saveSettings(form); } catch { /* toast shown */ } finally { setBusy(false); }
  };
  useHotkeys({ "mod+s": () => (dirty ? save() : false) });
  // Closing or reloading the tab with unsaved settings asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (window.location.hash === "#runs" && !loading) requestAnimationFrame(() => document.getElementById("runs")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [loading]);

  const perWeek = form.blogs_per_week * (1 + form.carousels_per_blog + form.graphics_per_blog + form.videos_per_blog);
  const daysMismatch = form.publish_days.length !== form.blogs_per_week;

  return (
    <div className="mx-auto max-w-[924px] px-4 py-6 sm:px-8 lg:py-10">
      <PageHeader className="max-w-[860px]" title="Settings" subtitle="What the weekly run makes, who it writes for, and when blogs go live." />

      {loading ? (
        <div className="max-w-[860px] space-y-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div>
      ) : (
        <div className="max-w-[860px] space-y-8">
          <section>
            <h2 className="mb-3 text-headline font-semibold">Weekly output</h2>
            <Card className="divide-y divide-[color:var(--hairline)]">
              <Row label="Blogs per week" hint="Each blog gets its own carousel, graphics and reel."><Stepper label="blogs per week" value={form.blogs_per_week} onChange={set("blogs_per_week")} min={1} max={7} /></Row>
              <Row label="Carousels per blog"><Stepper label="carousels per blog" value={form.carousels_per_blog} onChange={set("carousels_per_blog")} min={0} max={3} /></Row>
              <Row label="Graphics per blog" hint="Square and landscape versions of each."><Stepper label="graphics per blog" value={form.graphics_per_blog} onChange={set("graphics_per_blog")} min={0} max={5} /></Row>
              <Row label="Reels per blog" hint="You record the voiceover; the reel is timed to it."><Stepper label="reels per blog" value={form.videos_per_blog} onChange={set("videos_per_blog")} min={0} max={2} /></Row>
              <div className="flex items-center justify-between bg-ink/[0.02] px-5 py-3 text-callout">
                <span className="text-ink-mute">Every week you review</span>
                <motion.span key={perWeek} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="tnum font-semibold text-ink">{perWeek} pieces</motion.span>
              </div>
            </Card>
          </section>

          <section>
            <h2 className="mb-3 text-headline font-semibold">Publish days</h2>
            <Card className="p-5">
              <div className="grid grid-cols-7 gap-1.5">
                {DAYS.map((day) => {
                  const on = form.publish_days.includes(day);
                  return (
                    <motion.button
                      key={day}
                      whileTap={{ scale: 0.94 }}
                      onClick={() => set("publish_days")(on ? form.publish_days.filter((x) => x !== day) : DAYS.filter((x) => x === day || form.publish_days.includes(x)))}
                      className={cx("relative flex h-14 flex-col items-center justify-center rounded-xl text-callout font-semibold transition-colors", on ? "text-ink" : "bg-ink/[0.04] text-ink-mute hover:bg-ink/[0.07]")}
                      aria-pressed={on}
                    >
                      {on && <motion.span layoutId={`day-${day}`} transition={spring} className="absolute inset-0 rounded-xl bg-surface shadow-[0_0_0_1.5px_rgb(var(--brand)/0.75),0_0_0_4px_rgb(var(--brand)/0.1),0_2px_8px_-2px_rgb(var(--shadow)/0.12)] dark:bg-surface-raised" />}
                      <span className="relative">{day.slice(0, 3)}</span>
                      {on ? <span className="relative mt-1 flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-b from-brand-bright to-brand-deep text-white"><Check className="h-2.5 w-2.5" strokeWidth={3.5} /></span> : <span className="relative mt-1 h-4 w-4 rounded-full shadow-[inset_0_0_0_1.5px_rgb(var(--ink)/0.18)]" />}
                    </motion.button>
                  );
                })}
              </div>
              <p className={cx("mt-3 text-[12.5px]", daysMismatch ? "text-warn" : "text-ink-mute")}>
                {daysMismatch ? `You picked ${form.publish_days.length} days for ${form.blogs_per_week} blogs. Extra blogs share a day; spare days stay empty.` : "Blogs go live at 10:00 IST on these days. You can change any single post's time when you approve it."}
              </p>
            </Card>
          </section>

          <section>
            <h2 className="mb-3 text-headline font-semibold">Audience and direction</h2>
            <Card className="space-y-5 p-5">
              <Field label="Audience" hint="Who every post is written for.">
                <textarea rows={3} className="input resize-y leading-[22px]" value={form.audience} onChange={(e) => set("audience")(e.target.value)} />
              </Field>
              <Field as="div" label="Avoid topics" hint="Press Enter to add. The planner never picks these.">
                <TokenInput value={form.avoid_topics} onChange={set("avoid_topics")} placeholder="e.g. Visa advice" />
              </Field>
              <Field label="Extra guidance" hint="Anything the writer should know this month: offers, events, tone.">
                <textarea rows={4} className="input resize-y leading-[22px]" value={form.extra_guidance} onChange={(e) => set("extra_guidance")(e.target.value)} placeholder="e.g. Mention our new Saswad centre in one post this month." />
              </Field>
            </Card>
          </section>

          <section>
            <h2 className="mb-3 text-headline font-semibold">Guardrails</h2>
            <Card className="divide-y divide-[color:var(--hairline)]">
              {[
                ["Licensed stock only", "Photos and footage come from Magnific stock or your library, with a licence trail on every file."],
                ["No AI-generated images, video or audio", "Generation tools are never used. Voiceovers are recorded by you."],
                ["Human approval required", "Nothing is published or posted until someone on the team approves it."],
              ].map(([t, h]) => (
                <div key={t} className="flex items-start gap-3 px-5 py-4">
                  <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg bg-ok/10 text-ok"><ShieldCheck className="h-4 w-4" /></span>
                  <div className="flex-1"><div className="text-body font-semibold">{t}</div><div className="text-[12.5px] text-ink-mute">{h}</div></div>
                  <Lock className="mt-1 h-3.5 w-3.5 text-ink-faint" />
                </div>
              ))}
            </Card>
          </section>

          <SecuritySection />

          <section>
            <h2 className="mb-3 text-headline font-semibold">Appearance</h2>
            <Card className="p-1">
              <Row label="Theme" hint="Auto follows your device.">
                <Segmented value={theme} onChange={setTheme} layoutId="theme-settings" options={[{ value: "light", label: "Light", icon: Sun }, { value: "dark", label: "Dark", icon: Moon }, { value: "system", label: "Auto", icon: Monitor }]} />
              </Row>
            </Card>
          </section>

          <RunsLog />
        </div>
      )}

      <AnimatePresence>
        {dirty && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={spring}
            className="glass fixed inset-x-3 bottom-[calc(84px+var(--safe-bottom))] z-40 mx-auto flex max-w-[560px] items-center gap-2 rounded-2xl p-2 pl-4 shadow-pop lg:bottom-6 lg:left-[252px]"
          >
            <span className="flex-1 text-callout font-medium text-ink-soft">Unsaved changes</span>
            <Button variant="ghost" onClick={() => setForm(saved)}>Discard</Button>
            <Button variant="primary" icon={Check} onClick={save} loading={busy} kbd={`${MOD}S`}>Save</Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RunsLog() {
  const d = useData();
  const [open, setOpen] = useState(null);
  const [logs, setLogs] = useState({});
  const toggle = async (r) => {
    setOpen((o) => (o === r.id ? null : r.id));
    if (logs[r.id] === undefined) {
      setLogs((l) => ({ ...l, [r.id]: null }));
      try {
        const text = await d.actions.fetchRunLog(r.id);
        setLogs((l) => ({ ...l, [r.id]: text || "No log captured for this run." }));
      } catch (e) {
        setLogs((l) => ({ ...l, [r.id]: `Couldn't load the log: ${e.message}` }));
      }
    }
  };
  return (
    <section id="runs" className="scroll-mt-20">
      <h2 className="mb-3 text-headline font-semibold">Runs</h2>
      <Card className="divide-y divide-[color:var(--hairline)] overflow-hidden">
        {!d.runs.length && <EmptyState title="No runs yet" className="!py-10">Runs appear here as the weekly session, revisions and publisher do their work.</EmptyState>}
        {d.runs.map((r) => {
          const isOpen = open === r.id;
          const usage = r.usage && Object.keys(r.usage).length ? Object.entries(r.usage).map(([k, v]) => `${k.replace(/_/g, " ")} ${typeof v === "object" ? JSON.stringify(v) : v}`).join(" · ") : "";
          return (
            <div key={r.id}>
              <button onClick={() => toggle(r)} className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-ink/[0.02]" aria-expanded={isOpen}>
                <motion.span animate={{ rotate: isOpen ? 90 : 0 }} transition={spring}><ChevronRight className="h-4 w-4 text-ink-faint" /></motion.span>
                <div className="min-w-0 flex-1">
                  <div className="text-callout font-semibold">{RUN_KIND[r.kind] || r.kind}</div>
                  <div className="truncate text-[12px] text-ink-mute">{formatDateTime(r.started_at)} IST{r.finished_at ? ` · ${duration(r.started_at, r.finished_at)}` : ` · started ${relative(r.started_at)}`}{usage ? ` · ${usage}` : ""}</div>
                </div>
                <StatusChip map={RUN_STATUS} status={r.status} size="sm" />
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }} className="overflow-hidden">
                    <div className="px-5 pb-4">
                      {r.error && <div className="mb-2 rounded-xl bg-brand/[0.07] px-3 py-2 text-[12.5px] font-medium text-brand-deep dark:text-brand-bright">{r.error}</div>}
                      {logs[r.id] == null ? (
                        <div className="space-y-1.5 rounded-xl bg-ink/[0.035] p-3"><Skeleton className="h-3 w-3/4" /><Skeleton className="h-3 w-2/3" /><Skeleton className="h-3 w-1/2" /></div>
                      ) : (
                        <pre className="tnum max-h-[360px] overflow-auto whitespace-pre-wrap rounded-xl bg-[#161110] p-4 font-sans text-[12px] leading-[19px] text-white/80 dark:bg-black/40">{logs[r.id]}</pre>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </Card>
    </section>
  );
}

/** Account and sessions: who is signed in, how sign-in works, sign out here or on every device. */
function SecuritySection() {
  const { user, signOut, demo } = useAuth();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(null);
  const run = async (scope) => { setBusy(scope); try { await signOut(scope); } finally { setBusy(null); } };
  return (
    <section id="security" className="scroll-mt-20">
      <h2 className="mb-3 text-headline font-semibold">Account and security</h2>
      <Card className="divide-y divide-[color:var(--hairline)]">
        <div className="flex items-center gap-3 px-5 py-4">
          <Avatar email={user?.email || ""} size={36} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-body font-semibold text-ink">{user?.email || "Signed in"}</div>
            <div className="text-[12.5px] text-ink-mute">{demo ? "Demo session (sample data)" : "Signed in with an emailed code"}</div>
          </div>
          <Button variant="secondary" icon={LogOut} onClick={() => run("local")} loading={busy === "local"}>Sign out</Button>
        </div>
        {[
          [Mail, "Email code sign-in", "A 6-digit code (or the link in the same email) each time. No password, no authenticator app."],
          [Timer, "Automatic lock", "Signs out after 30 minutes without activity, with a 60-second warning, and when Studio has been in the background for more than 12 hours."],
        ].map(([I, t, h]) => (
          <div key={t} className="flex items-start gap-3 px-5 py-4">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ink/[0.05] text-ink-soft"><I className="h-4 w-4" /></span>
            <div className="flex-1"><div className="text-body font-semibold">{t}</div><div className="text-[12.5px] text-ink-mute">{h}</div></div>
          </div>
        ))}
        <Row label="Sign out everywhere" hint="Ends every session on every device and browser, including this one.">
          <Button variant="danger" icon={MonitorSmartphone} onClick={() => setConfirm(true)} loading={busy === "global"}>Sign out everywhere</Button>
        </Row>
      </Card>
      <Confirm
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Sign out everywhere?"
        description="Every device signed in to Studio is signed out within an hour at most (immediately on this one). You'll need a new email code to come back."
        confirmLabel="Sign out everywhere"
        tone="danger"
        onConfirm={() => run("global")}
      />
    </section>
  );
}
