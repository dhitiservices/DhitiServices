import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, CalendarDays, MoreHorizontal, SkipForward, FileText, Target, Undo2 } from "lucide-react";
import { useData } from "../lib/store.jsx";
import { navigate } from "../lib/router.jsx";
import { PageHeader } from "../components/Shell.jsx";
import { Button, IconButton, StatusChip, Skeleton, EmptyState, cx } from "../components/ui.jsx";
import { Menu } from "../components/Menu.jsx";
import { Confirm } from "../components/Sheet.jsx";
import { ContentChips } from "../components/ItemBits.jsx";
import { TOPIC_STATUS, ITEM_STATUS } from "../lib/model.js";
import { weekStartIST, addDays, dateOnly, formatDate, todayIST, formatTime } from "../lib/format.js";
import { spring } from "../lib/motion.js";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function Calendar() {
  const d = useData();
  const loading = d.status === "loading";
  const initial = useMemo(() => {
    const thisWeek = weekStartIST();
    const blogOf = (t) => d.items.find((i) => i.topic_id === t.id && i.type === "blog");
    const open = d.topics
      .filter((t) => t.week_start >= thisWeek && t.status !== "skipped" && blogOf(t)?.status !== "published")
      .map((t) => t.week_start)
      .sort()[0];
    return open || thisWeek;
  }, [d.status]); // eslint-disable-line react-hooks/exhaustive-deps
  const [week, setWeek] = useState(null);
  const ws = week || initial;
  const [dir, setDir] = useState(0);
  const [skip, setSkip] = useState(null);
  const today = todayIST();
  const publishDays = d.settings.publish_days || [];

  const days = DAYS.map((name, i) => ({ name, ymd: addDays(ws, i) }));
  const weekTopics = d.topics.filter((t) => t.week_start === ws || (t.planned_publish_date >= ws && t.planned_publish_date <= addDays(ws, 6)));
  const unscheduled = weekTopics.filter((t) => !t.planned_publish_date);
  const emptyWeek = !loading && weekTopics.length === 0;
  // The week after, as a compact strip under the grid (fills the space short columns leave, one click to open it).
  const nextWs = addDays(ws, 7);
  const nextTopics = d.topics
    .filter((t) => t.status !== "skipped" && (t.week_start === nextWs || (t.planned_publish_date >= nextWs && t.planned_publish_date <= addDays(nextWs, 6))))
    .sort((a, b) => String(a.planned_publish_date || "9").localeCompare(String(b.planned_publish_date || "9")));
  const move = (n) => { setDir(n); setWeek(addDays(ws, n * 7)); };

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-8 lg:py-10">
      <PageHeader
        title="Calendar"
        subtitle={`${weekTopics.filter((t) => t.status !== "skipped").length} blogs planned · they go live on ${publishDays.map((p) => p.slice(0, 3)).join(", ") || "no days yet"}`}
        actions={
          <div className="flex items-center gap-1.5">
            <Button variant="secondary" size="sm" onClick={() => { setDir(0); setWeek(weekStartIST()); }}>This week</Button>
            <div className="flex items-center rounded-xl bg-surface shadow-[0_0_0_1px_var(--hairline-strong)]">
              <IconButton icon={ChevronLeft} label="Previous week" size="sm" onClick={() => move(-1)} />
              <span className="tnum min-w-[140px] text-center text-callout font-semibold">{formatDate(dateOnly(ws), { day: "numeric", month: "short" })} – {formatDate(dateOnly(addDays(ws, 6)), { day: "numeric", month: "short" })}</span>
              <IconButton icon={ChevronRight} label="Next week" size="sm" onClick={() => move(1)} />
            </div>
          </div>
        }
      />

      <AnimatePresence mode="wait" initial={false} custom={dir}>
        <motion.div
          key={ws}
          custom={dir}
          initial={{ opacity: 0, x: dir * 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: dir * -24, transition: { duration: 0.12 } }}
          transition={spring}
          className="grid gap-2.5 md:grid-cols-[repeat(5,minmax(0,1fr))_repeat(2,minmax(0,0.5fr))]"
        >
          {days.map((day) => {
            const topics = weekTopics.filter((t) => t.planned_publish_date === day.ymd);
            const isToday = day.ymd === today;
            const isPublish = publishDays.includes(day.name);
            const past = day.ymd < today;
            return (
              <div key={day.ymd} className={cx("flex flex-col rounded-2xl p-2", !emptyWeek && "md:min-h-[220px]", isPublish ? "bg-surface/70 shadow-[0_0_0_1px_var(--hairline)]" : "bg-ink/[0.02]", !loading && !topics.length && !isPublish && !isToday && "max-md:hidden")}>
                <div className="flex items-center gap-2 px-1.5 pb-2 pt-1">
                  <span className={cx("text-[12px] font-semibold uppercase tracking-[0.06em]", isToday ? "text-brand-ink" : past ? "text-ink-faint" : "text-ink-mute")}>{day.name.slice(0, 3)}</span>
                  <span className={cx("tnum flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-[15px] font-bold", isToday ? "bg-brand-deep text-white" : past ? "text-ink-faint" : "text-ink")}>
                    {Number(day.ymd.slice(8))}
                  </span>
                  {isPublish && <span className="ml-auto rounded-md bg-ok/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ok">Go live</span>}
                </div>
                <div className={cx("flex flex-1 flex-col gap-2", emptyWeek && "hidden")}>
                  {loading ? (
                    isPublish && <Skeleton className="h-32 rounded-xl" />
                  ) : topics.length ? (
                    topics.map((t) => <TopicCard key={t.id} topic={t} onSkip={() => setSkip(t)} />)
                  ) : (
                    <div className="hidden flex-1 items-center justify-center text-[12px] text-ink-faint md:flex">{isPublish && !past ? "Free" : ""}</div>
                  )}
                </div>
              </div>
            );
          })}
        </motion.div>
      </AnimatePresence>

      {!loading && unscheduled.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-headline font-semibold">No date yet</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{unscheduled.map((t) => <TopicCard key={t.id} topic={t} onSkip={() => setSkip(t)} />)}</div>
        </div>
      )}

      {!loading && nextTopics.length > 0 && (
        <section className="mt-8" aria-labelledby="cal-next">
          <div className="mb-3 flex items-end justify-between gap-3">
            <h2 id="cal-next" className="text-headline font-semibold">Next week</h2>
            <button type="button" onClick={() => move(1)} className="text-callout font-semibold text-brand-ink hover:underline">Open week of {formatDate(dateOnly(nextWs), { day: "numeric", month: "short" })}</button>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {nextTopics.slice(0, 6).map((t) => {
              const blog = d.items.find((i) => i.topic_id === t.id && i.type === "blog");
              return (
                <button key={t.id} type="button" onClick={() => (blog ? navigate(`/review/${blog.id}`) : move(1))} className="card flex items-center gap-3 p-3 text-left transition-shadow hover:card-lift">
                  <span className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-ink/[0.05] text-ink">
                    <span className="text-[9.5px] font-bold uppercase leading-3 tracking-wider">{t.planned_publish_date ? formatDate(dateOnly(t.planned_publish_date), { weekday: "short" }) : "TBD"}</span>
                    <span className="tnum text-[15px] font-bold leading-5">{t.planned_publish_date ? Number(t.planned_publish_date.slice(8)) : "–"}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-callout font-semibold text-ink">{t.title}</span>
                    <span className="block truncate text-[12px] text-ink-mute">{t.category || "Blog idea"}</span>
                  </span>
                  {blog ? <StatusChip map={ITEM_STATUS} status={blog.status} size="sm" /> : <StatusChip map={TOPIC_STATUS} status={t.status} size="sm" />}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {emptyWeek && (
        <div className="card mt-6">
          <EmptyState icon={CalendarDays} title="Nothing planned this week" action={<Button variant="secondary" onClick={() => d.actions.runWeekly()}>Make this week's blogs now</Button>}>
            New blog ideas show up here after Monday morning.
          </EmptyState>
        </div>
      )}

      <Confirm
        open={!!skip}
        onClose={() => setSkip(null)}
        title="Skip this blog idea?"
        description="It won't be made or go live. Anything already made stays in Review."
        confirmLabel="Skip it"
        tone="danger"
        onConfirm={() => d.actions.skipTopic(skip)}
      >
        <div className="rounded-xl bg-ink/[0.04] p-3 text-callout font-semibold">{skip?.title}</div>
      </Confirm>
    </div>
  );
}

function TopicCard({ topic, onSkip }) {
  const d = useData();
  const items = d.items.filter((i) => i.topic_id === topic.id && i.status !== "rejected");
  const blog = items.find((i) => i.type === "blog");
  const skipped = topic.status === "skipped";
  return (
    <motion.div
      layout
      transition={spring}
      className={cx("card group relative p-3 transition-shadow hover:card-lift", skipped && "opacity-55")}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate pr-5 text-[11.5px] font-semibold tracking-[-0.003em] text-brand-ink" title={topic.category || undefined}>{topic.category || "Blog idea"}</div>
          <button
            onClick={() => blog && navigate(`/review/${blog.id}`)}
            className={cx("mt-1 text-left text-[13.5px] font-semibold leading-[18px] tracking-[-0.008em] text-ink", blog && "hover:underline", skipped && "line-through")}
          >
            {blog?.body?.frontmatter?.title || topic.title}
          </button>
        </div>
        <div className="absolute right-1.5 top-1.5">
        {!skipped ? (
          <Menu
            items={[
              blog && { label: "Open blog", icon: FileText, onClick: () => navigate(`/review/${blog.id}`) },
              { label: "Skip this idea", icon: SkipForward, danger: true, onClick: onSkip },
            ]}
            trigger={({ toggle, open, triggerProps }) => <IconButton icon={MoreHorizontal} label="More" size="sm" onClick={toggle} active={open} {...triggerProps} className="h-7 w-7 opacity-60 group-hover:opacity-100 focus-visible:opacity-100" />}
          />
        ) : (
          <IconButton icon={Undo2} label="Bring it back" size="sm" className="h-7 w-7" onClick={() => d.actions.restoreTopic(topic)} />
        )}
        </div>
      </div>
      {topic.primary_keyword && (
        <div className="mt-2 flex items-center gap-1 text-[11.5px] text-ink-mute"><Target className="h-3 w-3 shrink-0" /><span className="truncate">{topic.primary_keyword}</span></div>
      )}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {blog ? <StatusChip map={ITEM_STATUS} status={blog.status} size="sm" /> : <StatusChip map={TOPIC_STATUS} status={topic.status} size="sm" />}
        {blog?.scheduled_for && blog.status === "approved" && <span className="tnum text-[11px] font-medium text-ink-mute">{formatTime(blog.scheduled_for)}</span>}
      </div>
      {items.length > 0 && <div className="mt-2.5"><ContentChips items={items} size="sm" compact onOpen={(i) => navigate(`/review/${i.id}`)} /></div>}
    </motion.div>
  );
}
