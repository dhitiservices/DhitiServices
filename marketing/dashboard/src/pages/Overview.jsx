import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  Play, ArrowRight, Telescope, Inbox, Mic, MessageSquareWarning, CheckCircle2, CalendarClock, Globe2, Sparkles, Clock3, AlertCircle,
} from "lucide-react";
import { useData } from "../lib/store.jsx";
import { navigate, Link } from "../lib/router.jsx";
import { PageHeader } from "../components/Shell.jsx";
import { Button, Card, Chip, StatusChip, Skeleton, EmptyState, SectionTitle, cx } from "../components/ui.jsx";
import { ContentChips } from "../components/ItemBits.jsx";
import { ITEM_STATUS, JOB_STATUS, RUN_STATUS, RUN_KIND, JOB_KIND } from "../lib/model.js";
import {
  greeting, formatLongDay, formatDate, formatTime, dateOnly, relative, duration, weekStartIST, addDays, todayIST, plural,
} from "../lib/format.js";
import { list, listItem, spring } from "../lib/motion.js";

export default function Overview() {
  const d = useData();
  const loading = d.status === "loading";
  const now = new Date();

  const stats = useMemo(() => {
    const c = (fn) => d.items.filter(fn).length;
    const monthAgo = Date.now() - 30 * 86400000;
    return {
      review: c((i) => i.status === "pending_review"),
      voice: c((i) => i.status === "awaiting_voiceover"),
      changes: c((i) => i.status === "changes_requested"),
      approved: c((i) => i.status === "approved" && i.type !== "blog"),
      scheduled: c((i) => i.type === "blog" && i.status === "approved"),
      published: c((i) => i.status === "published" && new Date(i.published_at).getTime() > monthAgo),
      generating: c((i) => i.status === "generating"),
    };
  }, [d.items]);

  // Focus week = the newest planned week (usually next week, produced by the weekly run).
  const focusWeek = useMemo(() => {
    const weeks = [...new Set(d.topics.map((t) => t.week_start))].sort();
    const thisWeek = weekStartIST();
    return weeks.filter((w) => w >= thisWeek).pop() || weeks.pop() || thisWeek;
  }, [d.topics]);

  const weekTopics = d.topics.filter((t) => t.week_start === focusWeek && t.status !== "skipped");
  const weekItems = d.items.filter((i) => weekTopics.some((t) => t.id === i.topic_id));
  const brief = d.briefs.find((b) => b.week_start === focusWeek) || d.briefs[0];

  const timeline = useMemo(() => {
    const today = todayIST();
    const horizon = addDays(today, 14);
    const rows = [];
    for (const t of d.topics) {
      if (t.status === "skipped") continue;
      const blog = d.items.find((i) => i.topic_id === t.id && i.type === "blog");
      if (blog?.status === "published" || blog?.status === "rejected") continue;
      const when = blog?.scheduled_for ? new Date(blog.scheduled_for) : dateOnly(t.planned_publish_date);
      if (!when) continue;
      const ymd = new Date(when.getTime() + 330 * 60000).toISOString().slice(0, 10);
      if (ymd < today || ymd > horizon) continue;
      rows.push({ topic: t, blog, when, ymd, children: d.items.filter((i) => i.topic_id === t.id) });
    }
    return rows.sort((a, b) => a.when - b.when).slice(0, 6);
  }, [d.topics, d.items]);

  const weeklyJob = d.jobs.find((j) => j.kind === "run_weekly");
  const weeklyActive = weeklyJob && (weeklyJob.status === "queued" || weeklyJob.status === "running");
  const needs = stats.review + stats.voice;

  const subtitle = loading ? "Loading your week…" : needs
    ? `${plural(needs, "item")} ${needs === 1 ? "needs" : "need"} your eyes${timeline[0] ? ` · next blog ${formatDate(timeline[0].when, { weekday: "short", day: "numeric", month: "short" })}` : ""}`
    : "You're all caught up. New drafts appear here as soon as they're made.";

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-8 lg:py-10">
      <PageHeader
        eyebrow={formatLongDay(now)}
        title={greeting(now)}
        subtitle={subtitle}
        actions={
          <>
            {weeklyJob && (
              <motion.div initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={spring} className="hidden sm:block" title={`Last weekly run request ${relative(weeklyJob.created_at)}`}>
                <Chip tone={JOB_STATUS[weeklyJob.status]?.tone} pulse={JOB_STATUS[weeklyJob.status]?.pulse}>
                  {weeklyJob.status === "done" ? `Last run ${relative(weeklyJob.finished_at || weeklyJob.created_at)}` : weeklyJob.status === "failed" ? "Last run failed" : JOB_STATUS[weeklyJob.status]?.label}
                </Chip>
              </motion.div>
            )}
            <Button variant="secondary" icon={Play} disabled={weeklyActive} onClick={() => d.actions.runWeekly()}>
              {weeklyActive ? (weeklyJob.status === "running" ? "Weekly run in progress" : "Weekly run queued") : "Run weekly now"}
            </Button>
            <Button variant="primary" iconRight={ArrowRight} onClick={() => navigate("/review")} disabled={!needs && !loading}>
              Review{needs ? ` ${needs}` : ""}
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <WeekHero loading={loading} weekStart={focusWeek} topics={weekTopics} items={weekItems} className="lg:col-span-3" />
        <ResearchCard loading={loading} brief={brief} className="lg:col-span-2" />
      </div>

      <motion.div variants={list} initial="initial" animate="animate" className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Stat loading={loading} icon={Inbox} tone="brand" label="Needs review" value={stats.review} to="/review" />
        <Stat loading={loading} icon={Mic} tone="violet" label="Needs voiceover" value={stats.voice} to="/review?filter=voice" />
        <Stat loading={loading} icon={MessageSquareWarning} tone="warn" label="Changes requested" value={stats.changes} to="/review?filter=changes" />
        <Stat loading={loading} icon={CalendarClock} tone="ok" label="Blogs scheduled" value={stats.scheduled} to="/calendar" />
        <Stat loading={loading} icon={CheckCircle2} tone="ok" label="Ready to post" value={stats.approved} to="/ready" />
        <Stat loading={loading} icon={Globe2} tone="info" label="Published · 30 days" value={stats.published} to="/published" />
      </motion.div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-5">
        <section className="min-w-0 lg:col-span-3">
          <SectionTitle action={<Link to="/calendar" className="text-callout font-semibold text-brand-ink hover:underline">Calendar</Link>}>Upcoming publishes</SectionTitle>
          <Card className="p-2">
            {loading ? (
              <div className="space-y-2 p-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
            ) : timeline.length ? (
              <motion.ol variants={list} initial="initial" animate="animate">
                {timeline.map((row, i) => <TimelineRow key={row.topic.id} row={row} last={i === timeline.length - 1} />)}
              </motion.ol>
            ) : (
              <EmptyState icon={CalendarClock} title="Nothing scheduled in the next two weeks">
                Run the weekly pipeline to research and plan the next three blogs.
              </EmptyState>
            )}
          </Card>
        </section>

        <section className="min-w-0 lg:col-span-2">
          <SectionTitle action={<Link to="/settings#runs" className="text-callout font-semibold text-brand-ink hover:underline">All runs</Link>}>Recent activity</SectionTitle>
          <Card className="divide-y divide-[color:var(--hairline)]">
            {loading ? (
              <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>
            ) : (
              <>
                {d.activeJobs.slice(0, 3).map((j) => (
                  <div key={j.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-violet/10 text-violet"><Sparkles className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-callout font-semibold">{JOB_KIND[j.kind] || j.kind}</div>
                      <div className="text-[12px] text-ink-mute">Requested {relative(j.created_at)}{j.requested_by ? ` by ${j.requested_by.split("@")[0]}` : ""}</div>
                    </div>
                    <StatusChip map={JOB_STATUS} status={j.status} size="sm" />
                  </div>
                ))}
                {d.runs.slice(0, 5).map((r) => (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                    <span className={cx("flex h-8 w-8 items-center justify-center rounded-[9px]", r.status === "failed" ? "bg-brand/10 text-brand-ink" : "bg-ink/[0.05] text-ink-soft")}>
                      {r.status === "failed" ? <AlertCircle className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-callout font-semibold">{RUN_KIND[r.kind] || r.kind}</div>
                      <div className="truncate text-[12px] text-ink-mute">
                        {relative(r.started_at)}{r.finished_at ? ` · ${duration(r.started_at, r.finished_at)}` : ""}{r.error ? ` · ${r.error}` : ""}
                      </div>
                    </div>
                    <StatusChip map={RUN_STATUS} status={r.status} size="sm" />
                  </div>
                ))}
                {!d.runs.length && !d.activeJobs.length && (
                  <EmptyState icon={Clock3} title="No runs yet" className="!py-10">The weekly run starts automatically every Monday morning.</EmptyState>
                )}
              </>
            )}
          </Card>
        </section>
      </div>
    </div>
  );
}

function WeekHero({ loading, weekStart, topics, items, className }) {
  const counts = Object.fromEntries(Object.keys(ITEM_STATUS).map((k) => [k, items.filter((i) => i.status === k).length]));
  const total = items.length || 1;
  const order = ["published", "approved", "pending_review", "awaiting_voiceover", "changes_requested", "generating", "failed", "rejected"];
  const colors = { published: "#5AA2FF", approved: "#34C77B", pending_review: "#FF3322", awaiting_voiceover: "#A58CFF", changes_requested: "#FFB340", generating: "rgba(255,255,255,.35)", failed: "#C20600", rejected: "rgba(255,255,255,.18)" };
  const blogs = items.filter((i) => i.type === "blog");

  return (
    <div className={cx("mesh-ink grain relative overflow-hidden rounded-[22px] p-6 text-white shadow-lift sm:p-7", className)}>
      <span className="mesh-sheen" aria-hidden />
      <div className="relative z-[1]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="shrink-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/60">Week at a glance</div>
            <div className="mt-1 text-title-2 font-bold tracking-[-0.02em]">Week of {formatDate(dateOnly(weekStart), { day: "numeric", month: "long" })}</div>
          </div>
          <span className="mt-0.5 shrink-0 whitespace-nowrap rounded-full bg-white/10 px-2.5 py-1 text-[12px] font-semibold text-white/85 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12)] backdrop-blur-sm">
            {plural(topics.length, "topic")} · {plural(items.length, "piece")}
          </span>
        </div>

        <div className="mt-7 grid grid-cols-3 gap-4">
          {[
            ["To review", (counts.pending_review || 0) + (counts.awaiting_voiceover || 0)],
            ["Approved", counts.approved || 0],
            ["Blogs live", blogs.filter((b) => b.status === "published").length],
          ].map(([label, v]) => (
            <div key={label}>
              {loading ? <div className="h-10 w-12 rounded-lg bg-white/10" /> : (
                <motion.div key={v} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="tnum text-[40px] font-bold leading-[44px] tracking-[-0.035em]">{v}</motion.div>
              )}
              <div className="mt-1 text-callout text-white/55">{label}</div>
            </div>
          ))}
        </div>

        <div className="mt-7">
          <div className="flex h-2 w-full gap-[3px] overflow-hidden rounded-full">
            {!loading && order.map((k) => counts[k] ? (
              <motion.div key={k} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ ...spring, delay: 0.1 }} style={{ flexGrow: counts[k], flexBasis: 0, background: colors[k], transformOrigin: "left" }} className="h-full rounded-[2px] first:rounded-l-full last:rounded-r-full" />
            ) : null)}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {order.filter((k) => counts[k]).map((k) => (
              <span key={k} className="flex items-center gap-1.5 text-[12px] text-white/60">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: colors[k] }} />
                {ITEM_STATUS[k].label} <span className="tnum font-semibold text-white/85">{counts[k]}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ResearchCard({ loading, brief, className }) {
  if (loading) return <Card className={cx("p-6", className)}><Skeleton className="h-4 w-32" /><Skeleton className="mt-4 h-24" /><Skeleton className="mt-4 h-6 w-48" /></Card>;
  if (!brief) {
    return (
      <Card className={cx("flex", className)}>
        <EmptyState icon={Telescope} title="No research yet" className="m-auto !py-10">Each weekly run starts with a research brief on trends and buyer pain points.</EmptyState>
      </Card>
    );
  }
  return (
    <Card as="button" onClick={() => navigate(`/research/${brief.id}`)} className={cx("group flex flex-col p-6 text-left transition-shadow hover:card-lift", className)}>
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/10 text-brand-ink"><Telescope className="h-3.5 w-3.5" strokeWidth={2.2} /></span>
        <span className="eyebrow">Research · week of {formatDate(dateOnly(brief.week_start))}</span>
      </div>
      <p className="mt-4 line-clamp-5 text-body text-ink-soft">{brief.summary}</p>
      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-5">
        <Chip tone="neutral" dot={false}>{plural(brief.trends?.length || 0, "trend")}</Chip>
        <Chip tone="neutral" dot={false}>{plural(brief.pain_points?.length || 0, "pain point")}</Chip>
        <Chip tone="neutral" dot={false}>{plural(brief.opportunities?.length || 0, "opportunity", "opportunities")}</Chip>
        <ArrowRight className="ml-auto h-4 w-4 text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-brand-ink" />
      </div>
    </Card>
  );
}

const STAT_TONE = { brand: "text-brand-ink bg-brand/10", violet: "text-violet bg-violet/10", warn: "text-warn bg-warn/10", ok: "text-ok bg-ok/10", info: "text-info bg-info/10" };
function Stat({ loading, icon: Icon, tone, label, value, to }) {
  return (
    <motion.button variants={listItem} onClick={() => navigate(to)} whileTap={{ scale: 0.98 }} className="card group p-4 text-left transition-shadow hover:card-lift">
      <span className={cx("flex h-8 w-8 items-center justify-center rounded-[9px]", STAT_TONE[tone])}><Icon className="h-4 w-4" strokeWidth={2.2} /></span>
      {loading ? <Skeleton className="mt-3 h-7 w-10" /> : <div className="tnum mt-3 text-[26px] font-bold leading-8 tracking-[-0.03em] text-ink">{value}</div>}
      <div className="mt-0.5 text-[12.5px] font-medium text-ink-mute">{label}</div>
    </motion.button>
  );
}

function TimelineRow({ row, last }) {
  const { topic, blog, when, children } = row;
  const day = formatDate(when, { weekday: "short" });
  const date = formatDate(when, { day: "numeric" });
  const status = blog?.status;
  return (
    <motion.li variants={listItem} className="group/row relative">
      {/* Stretched button covers the row; the content chips sit above it, so no button is nested in another. */}
      <button
        onClick={() => navigate(blog ? `/review/${blog.id}` : "/calendar")}
        aria-label={`${blog?.body?.frontmatter?.title || topic.title}, ${day} ${date}`}
        className="absolute inset-0 rounded-xl transition-colors hover:bg-ink/[0.03]"
      />
      <div className="pointer-events-none relative flex w-full gap-4 rounded-xl p-3 text-left">
        <div className="relative flex w-11 shrink-0 flex-col items-center">
          <div className={cx("flex h-11 w-11 flex-col items-center justify-center rounded-xl", status === "approved" ? "bg-ok/10 text-ok" : "bg-ink/[0.05] text-ink")}>
            <span className="text-[10px] font-bold uppercase leading-3 tracking-wider">{day}</span>
            <span className="tnum text-[17px] font-bold leading-5">{date}</span>
          </div>
          {!last && <div className="absolute top-[52px] h-[calc(100%-36px)] w-px bg-ink/[0.08]" />}
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-start gap-2">
            <div className="line-clamp-2 min-w-0 flex-1 text-body font-semibold text-ink sm:line-clamp-1">{blog?.body?.frontmatter?.title || topic.title}</div>
            {blog ? <StatusChip map={ITEM_STATUS} status={blog.status} size="sm" /> : <Chip size="sm" tone="neutral">Planned</Chip>}
          </div>
          <div className="mt-0.5 text-[12.5px] text-ink-mute">
            {topic.category}{blog?.scheduled_for ? ` · ${formatTime(blog.scheduled_for)} IST` : ""}{topic.primary_keyword ? ` · “${topic.primary_keyword}”` : ""}
          </div>
          <div className="pointer-events-auto relative mt-2 w-fit max-w-full"><ContentChips items={children} size="sm" onOpen={(i) => navigate(`/review/${i.id}`)} /></div>
        </div>
      </div>
    </motion.li>
  );
}
