import { useMemo } from "react";
import { motion } from "framer-motion";
import { Play, ArrowRight, Telescope, Mic, CheckCircle2, CalendarClock, Clock3, AlertCircle, Sparkles, Linkedin, FileText, ChevronRight } from "lucide-react";
import { useData } from "../lib/store.jsx";
import { navigate, Link } from "../lib/router.jsx";
import { PageHeader } from "../components/Shell.jsx";
import { Button, Card, Chip, StatusChip, Skeleton, EmptyState, SectionTitle, cx } from "../components/ui.jsx";
import { ContentChips, ItemThumb } from "../components/ItemBits.jsx";
import { ITEM_STATUS, RUN_KIND, JOB_KIND, itemTitle } from "../lib/model.js";
import { voiceoverState } from "../components/viewers/VideoViewer.jsx";
import { greeting, formatLongDay, formatDate, formatTime, dateOnly, relative, addDays, todayIST } from "../lib/format.js";
import { list, listItem, spring } from "../lib/motion.js";

const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
const time24 = (d) => formatDate(d, { hour: "2-digit", minute: "2-digit", hour12: false });

/** "Monday at 10:00", or "Monday 7 Dec at 10:00" when it is more than six days away. */
function whenWords(d) {
  const far = new Date(d).getTime() - Date.now() > 6 * 86400000;
  return `${formatDate(d, far ? { weekday: "long", day: "numeric", month: "short" } : { weekday: "long" })} at ${time24(d)}`;
}

/**
 * The one thing to do next, in order: blogs to review, reels that need the owner's voice, social posts to review,
 * LinkedIn posts that need a look, then anything that went wrong. The rest is listed under "Also waiting".
 */
function useNextSteps(d) {
  return useMemo(() => {
    const blogs = d.items.filter((i) => i.type === "blog" && i.status === "pending_review");
    const voice = d.items.filter((i) => i.status === "awaiting_voiceover" && voiceoverState(i, d.jobs).state !== "rendering");
    const posts = d.items.filter((i) => i.type !== "blog" && i.status === "pending_review");
    const liReady = d.socialPosts.filter((p) => p.status === "pending_review" && ["approved", "published"].includes(d.itemById.get(p.blog_item_id)?.status));
    const liBad = d.socialPosts.filter((p) => p.status === "failed" || (p.status === "published" && p.comment_status === "failed"));
    const failed = d.items.filter((i) => i.status === "failed");
    const steps = [];
    if (blogs.length) steps.push({ key: "blogs", icon: FileText, title: `${n(blogs.length, "blog is", "blogs are")} ready for you`, text: "Read it, check the facts, then approve. About five minutes each.", cta: "Review now", to: `/review/${blogs[0].id}`, items: blogs, short: n(blogs.length, "blog to review", "blogs to review") });
    if (voice.length) steps.push({ key: "voice", icon: Mic, title: `${n(voice.length, "reel needs", "reels need")} your voice`, text: "Read the script out loud and upload the recording.", cta: "Record now", to: `/review/${voice[0].id}`, items: voice, short: n(voice.length, "reel needs your voice", "reels need your voice") });
    if (posts.length) steps.push({ key: "posts", icon: Sparkles, title: `${n(posts.length, "post is", "posts are")} ready for you`, text: "Carousels, graphics and reels for social media.", cta: "Review now", to: `/review/${posts[0].id}`, items: posts, short: n(posts.length, "post to review", "posts to review") });
    if (liReady.length) steps.push({ key: "li", icon: Linkedin, title: `${n(liReady.length, "LinkedIn post is", "LinkedIn posts are")} ready for you`, text: "Check how it looks, then approve it.", cta: "Open it", to: `/review/${liReady[0].blog_item_id}`, items: [], short: n(liReady.length, "LinkedIn post to approve", "LinkedIn posts to approve") });
    if (liBad.length) steps.push({ key: "libad", icon: Linkedin, tone: "warn", title: liBad[0].status === "failed" ? "A LinkedIn post did not go out" : "A LinkedIn comment did not go out", text: "Open it and tap Try again.", cta: "Open it", to: `/review/${liBad[0].blog_item_id}`, items: [], short: "LinkedIn needs a look" });
    if (failed.length) steps.push({ key: "failed", icon: AlertCircle, tone: "warn", title: `Something went wrong with ${n(failed.length, "piece", "pieces")}`, text: "Open it and say what to change. We try again.", cta: "Open it", to: `/review/${failed[0].id}`, items: failed, short: n(failed.length, "thing went wrong", "things went wrong") });
    return steps;
  }, [d.items, d.jobs, d.socialPosts, d.itemById]);
}

export default function Overview() {
  const d = useData();
  const loading = d.status === "loading";
  const now = new Date();
  const steps = useNextSteps(d);
  const making = d.items.filter((i) => i.status === "generating").length;

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
    return rows.sort((a, b) => a.when - b.when).slice(0, 5);
  }, [d.topics, d.items]);

  // The next approved blog that is due: "Next blog posts Monday at 10:00."
  const nextLive = useMemo(() => d.items
    .filter((i) => i.type === "blog" && i.status === "approved" && i.scheduled_for && new Date(i.scheduled_for) > now)
    .sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for))[0] || null, [d.items]); // eslint-disable-line react-hooks/exhaustive-deps

  const weeklyJob = d.jobs.find((j) => j.kind === "run_weekly");
  const weeklyActive = weeklyJob && (weeklyJob.status === "queued" || weeklyJob.status === "running");
  const brief = d.briefs[0];

  return (
    <div className="mx-auto max-w-[1120px] px-4 py-6 sm:px-8 lg:py-10">
      <PageHeader eyebrow={formatLongDay(now)} title={greeting(now)} />

      {loading ? (
        <Skeleton className="h-[220px] rounded-[22px]" />
      ) : (
        <NextStep steps={steps} nextLive={nextLive} making={making} weeklyActive={weeklyActive} />
      )}

      <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-5">
        <section className="min-w-0 lg:col-span-3">
          <SectionTitle action={<Link to="/calendar" className="text-callout font-semibold text-brand-ink hover:underline">Calendar</Link>}>Coming up</SectionTitle>
          <Card className="p-2">
            {loading ? (
              <div className="space-y-2 p-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
            ) : timeline.length ? (
              <motion.ol variants={list} initial="initial" animate="animate">
                {timeline.map((row, i) => <TimelineRow key={row.topic.id} row={row} last={i === timeline.length - 1} />)}
              </motion.ol>
            ) : (
              <EmptyState icon={CalendarClock} title="Nothing planned for the next two weeks">New blog ideas are planned every Monday morning.</EmptyState>
            )}
          </Card>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1">
            <span className="text-[12.5px] text-ink-mute">New blogs are made every Monday morning.</span>
            <Button variant="ghost" size="sm" icon={Play} disabled={weeklyActive || loading} onClick={() => d.actions.runWeekly()}>
              {weeklyActive ? "Making this week's blogs…" : "Make this week's blogs now"}
            </Button>
          </div>
        </section>

        <section className="min-w-0 space-y-8 lg:col-span-2">
          <div>
            <SectionTitle>This week's research</SectionTitle>
            <ResearchCard loading={loading} brief={brief} />
          </div>
          <div>
            <SectionTitle action={<Link to="/settings#runs" className="text-callout font-semibold text-brand-ink hover:underline">See all</Link>}>Recently</SectionTitle>
            <Activity loading={loading} />
          </div>
        </section>
      </div>
    </div>
  );
}

function NextStep({ steps, nextLive, making, weeklyActive }) {
  const top = steps[0];
  if (!top) {
    const line = nextLive ? `Next blog posts ${whenWords(nextLive.scheduled_for)}.` : making || weeklyActive ? "We're making new blogs now. They show up here when they're ready." : "New blogs arrive on Monday morning.";
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="card relative overflow-hidden p-6 sm:p-8" data-testid="next-step" data-state="caught-up">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-ok/[0.08] blur-3xl" aria-hidden />
        <div className="relative flex items-start gap-4 sm:items-center sm:gap-5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-ok/[0.12] text-ok sm:h-14 sm:w-14"><CheckCircle2 className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={2} /></span>
          <div className="min-w-0">
            <h2 className="text-[24px] font-bold leading-[30px] tracking-[-0.025em] text-ink sm:text-[30px] sm:leading-[36px]">You're all caught up.</h2>
            <p className="mt-1 text-body text-ink-mute sm:text-[17px] sm:leading-6">{line}</p>
          </div>
        </div>
        {nextLive && (
          <button type="button" onClick={() => navigate(`/review/${nextLive.id}?filter=approved`)} className="relative mt-6 flex w-full items-center gap-3 rounded-2xl bg-ink/[0.035] p-3 text-left transition-colors hover:bg-ink/[0.06]">
            <ItemThumb item={nextLive} className="h-12 w-[68px]" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-callout font-semibold text-ink">{itemTitle(nextLive)}</span>
              <span className="block text-[12.5px] text-ink-mute">Goes live {formatDate(nextLive.scheduled_for, { weekday: "short", day: "numeric", month: "short" })} at {time24(nextLive.scheduled_for)}</span>
            </span>
            <ChevronRight className="h-4 w-4 text-ink-faint" />
          </button>
        )}
      </motion.div>
    );
  }
  const rest = steps.slice(1);
  const thumbs = top.items.slice(0, 3);
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="mesh-ink grain relative overflow-hidden rounded-[22px] p-6 text-white shadow-lift sm:p-8" data-testid="next-step" data-state={top.key}>
      <span className="mesh-sheen" aria-hidden />
      <div className="relative z-[1] flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-2.5 py-1 text-[12px] font-semibold text-white/85 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12)]">
            <top.icon className="h-3.5 w-3.5" strokeWidth={2.2} /> Your next step
          </div>
          <h2 className="mt-4 text-[28px] font-bold leading-[33px] tracking-[-0.03em] sm:text-[36px] sm:leading-[41px]">{top.title}</h2>
          <p className="mt-2 max-w-[460px] text-body text-white/70 sm:text-[17px] sm:leading-6">{top.text}</p>
          <Button variant="primary" size="lg" iconRight={ArrowRight} onClick={() => navigate(top.to)} className="mt-6 h-12 w-full rounded-[14px] px-6 text-[16px] sm:w-auto" data-testid="next-step-cta">
            {top.cta}
          </Button>
        </div>
        {thumbs.length > 0 && (
          <div className="relative hidden h-[150px] w-[250px] shrink-0 sm:block" aria-hidden>
            {thumbs.map((it, i) => (
              <div key={it.id} className="absolute rounded-[12px] shadow-[0_18px_40px_-12px_rgb(0_0_0/0.6)] ring-1 ring-white/10" style={{ right: i * 34, top: i * 18, zIndex: 3 - i, transform: `rotate(${(i - 1) * -4}deg)`, opacity: 1 - i * 0.18 }}>
                <ItemThumb item={it} className={it.type === "blog" ? "h-[108px] w-[176px] rounded-[12px]" : "h-[120px] w-[96px] rounded-[12px]"} />
              </div>
            ))}
          </div>
        )}
      </div>
      {rest.length > 0 && (
        <div className="relative z-[1] mt-6 flex flex-wrap gap-2 border-t border-white/10 pt-5">
          <span className="mr-1 self-center text-[12.5px] font-medium text-white/55">Also waiting:</span>
          {rest.map((s) => (
            <button key={s.key} type="button" onClick={() => navigate(s.to)} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white/10 px-3 text-[12.5px] font-semibold text-white/90 transition-colors hover:bg-white/[0.16]">
              <s.icon className="h-3.5 w-3.5" /> {s.short} <ChevronRight className="h-3.5 w-3.5 opacity-60" />
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function ResearchCard({ loading, brief }) {
  if (loading) return <Card className="p-5"><Skeleton className="h-4 w-32" /><Skeleton className="mt-4 h-16" /></Card>;
  if (!brief) return <Card><EmptyState icon={Telescope} title="No research yet" className="!py-10">Every Monday we read the news and forums, then write a short report here.</EmptyState></Card>;
  return (
    <Card as="button" onClick={() => navigate(`/research/${brief.id}`)} className="group flex w-full flex-col p-5 text-left transition-shadow hover:card-lift">
      <span className="flex items-center gap-2 text-[12.5px] font-semibold text-brand-ink">
        <Telescope className="h-3.5 w-3.5" strokeWidth={2.2} /> Week of {formatDate(dateOnly(brief.week_start), { day: "numeric", month: "long" })}
      </span>
      <span className="mt-2.5 line-clamp-3 text-callout leading-[19px] text-ink-soft">{brief.summary}</span>
      <span className="mt-3 inline-flex items-center gap-1 text-callout font-semibold text-ink">Read it <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></span>
    </Card>
  );
}

function Activity({ loading }) {
  const d = useData();
  if (loading) return <Card className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</Card>;
  const rows = [
    ...d.activeJobs.slice(0, 2).map((j) => ({ id: j.id, label: JOB_KIND[j.kind] || "Working on something", sub: `Started ${relative(j.created_at)}`, state: j.status === "running" ? "Working" : "Waiting", tone: "active", pulse: true })),
    ...d.runs.slice(0, 4).map((r) => ({
      id: r.id,
      label: RUN_KIND[r.kind] || "Work",
      sub: r.status === "failed" ? (r.kind === "publish" ? "Didn't work. It tries again on its own." : "Didn't work. We'll look at it.") : r.status === "running" ? `Started ${relative(r.started_at)}` : `Finished ${relative(r.finished_at || r.started_at)}`,
      state: r.status === "failed" ? "Didn't work" : r.status === "running" ? "Working" : "Done",
      tone: r.status === "failed" ? "danger" : r.status === "running" ? "active" : "ok",
      pulse: r.status === "running",
      bad: r.status === "failed",
    })),
  ].slice(0, 4);
  if (!rows.length) return <Card><EmptyState icon={Clock3} title="Nothing yet" className="!py-10">New blogs are made every Monday morning.</EmptyState></Card>;
  return (
    <Card className="divide-y divide-[color:var(--hairline)]">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-3 px-4 py-3">
          <span className={cx("flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]", r.bad ? "bg-brand/10 text-brand-ink" : "bg-ink/[0.05] text-ink-soft")}>
            {r.bad ? <AlertCircle className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-callout font-semibold">{r.label}</div>
            <div className="truncate text-[12px] text-ink-mute">{r.sub}</div>
          </div>
          <Chip tone={r.tone} pulse={r.pulse} size="sm">{r.state}</Chip>
        </div>
      ))}
    </Card>
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
            {topic.category}{blog?.scheduled_for ? ` · goes live at ${formatTime(blog.scheduled_for)}` : ""}
          </div>
          <div className="pointer-events-auto relative mt-2 w-fit max-w-full"><ContentChips items={children} size="sm" onOpen={(i) => navigate(`/review/${i.id}`)} /></div>
        </div>
      </div>
    </motion.li>
  );
}
