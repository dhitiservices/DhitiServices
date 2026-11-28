import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check, MessageSquareWarning, X, ChevronUp, ChevronDown, ChevronLeft, MoreHorizontal, Rocket, Pencil, Undo2, ExternalLink,
  Inbox, Sparkles, AlertTriangle, Send, RotateCcw, PartyPopper, Mic,
} from "lucide-react";
import { useData } from "../lib/store.jsx";
import { navigate, useLocation } from "../lib/router.jsx";
import { useHotkeys } from "../lib/hotkeys.js";
import { TYPE_META, ITEM_STATUS, byType, itemTitle, blogUrl, graphicKind } from "../lib/model.js";
import { formatDate, dateOnly, relative } from "../lib/format.js";
import { spring, softSpring } from "../lib/motion.js";
import { Button, IconButton, Segmented, StatusChip, Skeleton, EmptyState, Kbd, Chip, cx } from "../components/ui.jsx";
import { Menu } from "../components/Menu.jsx";
import { Confirm } from "../components/Sheet.jsx";
import { ItemThumb } from "../components/ItemBits.jsx";
import { ApproveSheet, ChangesSheet, PostedSheet } from "../components/ReviewSheets.jsx";
import { BlogArticle, BlogMeta } from "../components/viewers/BlogViewer.jsx";
import { CarouselStage, CarouselMeta } from "../components/viewers/CarouselViewer.jsx";
import { GraphicStage, GraphicMeta, useGraphicVariant } from "../components/viewers/GraphicViewer.jsx";
import { VideoStage, VideoMeta, voiceoverState, voiceoverChip, requestVoiceoverUpload } from "../components/viewers/VideoViewer.jsx";
import { MetaSection } from "../components/viewers/Meta.jsx";
import { openSafe } from "../lib/safe.js";
import { useToast } from "../components/Toast.jsx";
import { fromISTInput, addDays, todayIST } from "../lib/format.js";

const FILTERS = {
  review: { label: "For you", test: (i) => i.status === "pending_review" || i.status === "awaiting_voiceover" },
  changes: { label: "Sent back", test: (i) => i.status === "changes_requested" || i.status === "generating" || i.status === "failed" },
  approved: { label: "Approved", test: (i) => i.status === "approved" },
  all: { label: "All", test: (i) => i.status !== "rejected" },
};
const ALIAS = { voice: "review" };

function useIsDesktop(q = "(min-width: 1024px)") {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [q]);
  return m;
}

export default function Review({ id }) {
  const d = useData();
  const { search } = useLocation();
  const desktop = useIsDesktop();
  const [filter, setFilterState] = useState(() => {
    const f = search.get("filter");
    return FILTERS[ALIAS[f] || f] ? ALIAS[f] || f : "review";
  });
  const setFilter = (f) => { setFilterState(f); navigate(`/review${id ? `/${id}` : ""}${f === "review" ? "" : `?filter=${f}`}`, { replace: true }); };

  const counts = useMemo(() => Object.fromEntries(Object.entries(FILTERS).map(([k, f]) => [k, d.items.filter(f.test).length])), [d.items]);

  const groups = useMemo(() => {
    const test = FILTERS[filter].test;
    const map = new Map();
    for (const it of d.items.filter(test)) {
      const key = it.topic_id || "none";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(it);
    }
    return [...map.entries()]
      .map(([key, items]) => ({ topic: d.topicById.get(key), key, items: items.sort(byType) }))
      // Topics with something waiting for review come first (matters in "All"), then by planned date.
      .sort((a, b) => Number(b.items.some(FILTERS.review.test)) - Number(a.items.some(FILTERS.review.test))
        || String(a.topic?.planned_publish_date || "9").localeCompare(String(b.topic?.planned_publish_date || "9")));
  }, [d.items, d.topicById, filter]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  const selected = id ? d.itemById.get(id) : null;
  const sel = selected;

  // Desktop: always show something in the viewer.
  useEffect(() => {
    if (d.status !== "ready" || !desktop) return;
    if (!id && flat[0]) navigate(`/review/${flat[0].id}${search.toString() ? `?${search}` : ""}`, { replace: true });
  }, [id, flat, desktop, d.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (item) => navigate(`/review/${item.id}${filter === "review" ? "" : `?filter=${filter}`}`);
  const step = (dir) => {
    if (!flat.length) return;
    const i = flat.findIndex((x) => x.id === sel?.id);
    const next = flat[i === -1 ? 0 : Math.max(0, Math.min(flat.length - 1, i + dir))];
    if (next && next.id !== sel?.id) navigate(`/review/${next.id}${filter === "review" ? "" : `?filter=${filter}`}`, { replace: true });
  };
  const nextAfter = (item) => {
    const i = flat.findIndex((x) => x.id === item.id);
    return flat[i + 1] || flat[i - 1] || null;
  };

  // Sheets
  const [approveOpen, setApproveOpen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const [postedOpen, setPostedOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  useEffect(() => setEditing(false), [id]);
  const sheetsOpen = approveOpen || changesOpen || postedOpen || publishOpen;

  const leaves = (item, nextStatus) => !FILTERS[filter].test({ ...item, status: nextStatus });
  const advanceFrom = (item, nextStatus) => {
    if (!leaves(item, nextStatus)) return;
    const n = nextAfter(item);
    navigate(n ? `/review/${n.id}${filter === "review" ? "" : `?filter=${filter}`}` : `/review${filter === "review" ? "" : `?filter=${filter}`}`, { replace: true });
  };

  const toast = useToast();
  const why = (item, verb) => toast({ tone: "neutral", title: `Can't ${verb} this ${TYPE_META[item.type]?.label.toLowerCase() || "one"}`, description: `It is ${ITEM_STATUS[item.status]?.label?.toLowerCase() || item.status}.`, duration: 2200 });
  const act = {
    approve: (item = sel) => {
      if (!item) return;
      if (!canApprove(item)) return why(item, "approve");
      if (item.type === "blog") return setApproveOpen(true);
      advanceFrom(item, "approved");
      d.actions.approve(item);
    },
    /** Shift+A: approve a blog at its default slot without opening the sheet. */
    quickApprove: (item = sel) => {
      if (!item) return;
      if (!canApprove(item)) return why(item, "approve");
      if (item.type !== "blog") return act.approve(item);
      const slot = defaultBlogSlot(item, d.topicById.get(item.topic_id));
      advanceFrom(item, "approved");
      d.actions.approve(item, { scheduledFor: slot });
    },
    approveBlog: (iso, social) => { advanceFrom(sel, "approved"); d.actions.approve(sel, { scheduledFor: iso, social }); },
    reject: (item = sel) => { if (!item) return; advanceFrom(item, "rejected"); d.actions.reject(item); },
    changes: () => { if (!sel) return; if (!canChange(sel)) return why(sel, "send back"); setChangesOpen(true); },
    // Close and move on at once; the write runs in the background (it toasts and reverts on failure).
    submitChanges: (text) => { const item = sel; advanceFrom(item, "changes_requested"); d.actions.requestChanges(item, text).catch(() => {}); },
  };

  useHotkeys(
    {
      j: () => step(1),
      k: () => step(-1),
      arrowdown: () => (desktop ? step(1) : false),
      arrowup: () => (desktop ? step(-1) : false),
      a: () => act.approve(),
      "shift+a": () => act.quickApprove(),
      r: () => act.changes(),
      u: () => {
        if (!sel || sel.status !== "awaiting_voiceover" || voiceoverState(sel, d.jobs).state === "rendering") return false;
        requestVoiceoverUpload();
      },
      e: () => {
        if (!sel || editing) return false;
        if (sel.type !== "blog" || ["published", "generating"].includes(sel.status)) return why(sel, "edit");
        setEditing(true);
      },
      escape: () => { if (editing) return false; if (!desktop && id) navigate(`/review${filter === "review" ? "" : `?filter=${filter}`}`); else return false; },
    },
    { enabled: !sheetsOpen && d.status === "ready" },
  );

  const loading = d.status === "loading";
  const index = flat.findIndex((x) => x.id === sel?.id);

  const queue = (
    <div className="flex h-full flex-col">
      <div className="px-4 pb-3 pt-6 sm:px-5 lg:pt-7">
        <div className="flex items-end justify-between">
          <h1 className="text-title-1 font-bold">Review</h1>
          <span className="hidden items-center gap-1 pb-1 text-[11.5px] text-ink-faint lg:flex"><Kbd>J</Kbd><Kbd>K</Kbd> move</span>
        </div>
        <Segmented
          className="mt-4 w-full [&>button]:flex-1 [&>button]:justify-center"
          size="sm"
          value={filter}
          onChange={setFilter}
          layoutId="review-filter"
          options={Object.entries(FILTERS).map(([value, f]) => ({ value, label: f.label, count: value === "all" ? null : counts[value] }))}
        />
      </div>
      {/* Only the desktop column scrolls itself; on phones the window scrolls, so the sticky group headers stick under the app header. */}
      <div className="min-h-0 flex-1 px-2.5 pb-28 sm:px-3 lg:overflow-y-auto lg:pb-6">
        {loading ? (
          <div className="space-y-2 px-1.5 pt-2">{Array.from({ length: 6 }, (_, i) => <div key={i} className="flex gap-3 p-2"><Skeleton className="h-12 w-12 shrink-0" /><div className="flex-1 space-y-2 pt-1"><Skeleton className="h-3.5 w-4/5" /><Skeleton className="h-3 w-1/3" /></div></div>)}</div>
        ) : flat.length === 0 && desktop ? null : flat.length === 0 ? (
          <EmptyState
            icon={filter === "review" ? PartyPopper : Inbox}
            tone={filter === "review" ? "brand" : "neutral"}
            title={filter === "review" ? "You're all caught up" : "Nothing here"}
          >
            {filter === "review" ? "New blogs show up here after Monday morning." : "Nothing to show here right now."}
          </EmptyState>
        ) : (
          groups.map((g) => (
            <div key={g.key} className="mb-3">
              <div className="sticky top-[calc(52px+env(safe-area-inset-top))] z-[1] -mx-2.5 flex items-center gap-2 bg-canvas/85 px-5 pb-1.5 pt-3 backdrop-blur-xl backdrop-saturate-150 sm:-mx-3 sm:px-6 lg:top-0 lg:mx-0 lg:bg-transparent lg:px-3 lg:backdrop-blur-none">
                {/* The blog row right below carries the title, so the header names the slot: date and category. */}
                <span className="tnum min-w-0 flex-1 truncate text-[12px] font-semibold text-ink-soft" title={g.topic?.title || undefined}>
                  {[g.topic?.planned_publish_date ? formatDate(dateOnly(g.topic.planned_publish_date), { weekday: "short", day: "numeric", month: "short" }) : null, g.topic?.category].filter(Boolean).join(" · ") || g.topic?.title || "Other"}
                </span>
                {!g.items.some((i) => i.type === "blog") && g.topic?.title && <span className="min-w-0 max-w-[45%] shrink truncate text-[11.5px] text-ink-faint">{g.topic.title}</span>}
              </div>
              {g.items.map((it) => <QueueRow key={it.id} item={it} topic={g.topic} jobs={d.jobs} active={it.id === sel?.id && desktop} onClick={() => open(it)} />)}
            </div>
          ))
        )}
      </div>
    </div>
  );

  const viewer = sel ? (
    <Viewer
      item={sel}
      topic={d.topicById.get(sel.topic_id)}
      desktop={desktop}
      index={index}
      total={flat.length}
      onStep={step}
      onBack={() => navigate(`/review${filter === "review" ? "" : `?filter=${filter}`}`)}
      editing={editing}
      setEditing={setEditing}
      act={act}
      onPublish={() => setPublishOpen(true)}
      onPosted={() => setPostedOpen(true)}
    />
  ) : desktop && !loading ? (
    <div className="flex h-full items-center justify-center">
      {id ? (
        <EmptyState icon={Sparkles} title="This is gone">It may have been replaced by a newer copy.</EmptyState>
      ) : flat.length ? (
        <EmptyState icon={Sparkles} title="Pick one on the left">Or press J to open the first one.</EmptyState>
      ) : filter === "review" ? (
        // The only empty state on screen: the queue column stays quiet so the two never repeat each other.
        <EmptyState icon={PartyPopper} tone="brand" title="You're all caught up">New blogs show up here after Monday morning. You'll see them the moment they're ready.</EmptyState>
      ) : (
        <EmptyState icon={Inbox} title="Nothing here">Nothing in “{FILTERS[filter].label}” right now.</EmptyState>
      )}
    </div>
  ) : desktop ? <ViewerSkeleton /> : null;

  return (
    <>
      {desktop ? (
        <div className="flex h-dvh">
          <div className="hairline-r w-[340px] shrink-0 xl:w-[360px]">{queue}</div>
          <div className="min-w-0 flex-1">{viewer}</div>
        </div>
      ) : (
        <>
          {queue}
          <AnimatePresence>
            {sel && (
              <motion.div
                key="mobile-viewer"
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={softSpring}
                className="fixed inset-0 z-50 bg-canvas"
              >
                {viewer}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {sel && (
        <>
          <ApproveSheet open={approveOpen} onClose={() => setApproveOpen(false)} item={sel} topic={d.topicById.get(sel.topic_id)} onApprove={act.approveBlog} />
          <ChangesSheet open={changesOpen} onClose={() => setChangesOpen(false)} item={sel} onSubmit={act.submitChanges} />
          <PostedSheet open={postedOpen} onClose={() => setPostedOpen(false)} item={sel} onSubmit={(url) => d.actions.markPosted(sel, url)} />
          <Confirm
            open={publishOpen}
            onClose={() => setPublishOpen(false)}
            title="Put this blog live now?"
            description="This puts it on dhitiservices.com within about 30 minutes. It is approved too, if it isn't yet."
            confirmLabel="Put it live"
            onConfirm={() => d.actions.publishNow(sel)}
          />
        </>
      )}
    </>
  );
}

const canApprove = (i) => i.status === "pending_review" || i.status === "changes_requested";

/** Same default as the approve sheet: a future scheduled_for, else the topic's planned date 10:00 IST, else tomorrow. */
function defaultBlogSlot(item, topic) {
  if (item.scheduled_for && new Date(item.scheduled_for) > new Date()) return item.scheduled_for;
  if (topic?.planned_publish_date && topic.planned_publish_date >= todayIST()) return fromISTInput(`${topic.planned_publish_date}T10:00`) || new Date(`${topic.planned_publish_date}T10:00:00+05:30`).toISOString();
  return new Date(`${addDays(todayIST(), 1)}T10:00:00+05:30`).toISOString();
}
const canChange = (i) => ["pending_review", "awaiting_voiceover", "changes_requested", "failed", "approved"].includes(i.status);

/** The item's status chip; a reel getting the owner's voice shows that state instead of "Needs your voice". */
function ItemStatus({ item, jobs, size = "sm" }) {
  const vo = voiceoverChip(item, jobs);
  return vo ? <Chip tone={vo.tone} pulse={vo.pulse} size={size}>{vo.label}</Chip> : <StatusChip map={ITEM_STATUS} status={item.status} size={size} />;
}

/** "now", "12m ago", "2h ago", "3d ago", then the date: compact enough for a queue row. */
function shortAgo(v) {
  const m = Math.max(0, Math.round((Date.now() - new Date(v).getTime()) / 60000));
  if (!Number.isFinite(m)) return "";
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  if (m < 1440 * 7) return `${Math.round(m / 1440)}d ago`;
  return formatDate(v, { day: "numeric", month: "short" });
}

function QueueRow({ item, topic, jobs, active, onClick }) {
  const T = TYPE_META[item.type];
  return (
    <button onClick={onClick} aria-current={active ? "true" : undefined} className="group relative flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left">
      {active && (
        <motion.span
          layoutId="queue-active"
          transition={spring}
          className="absolute inset-0 rounded-xl bg-surface shadow-[0_0_0_1px_var(--hairline),0_1px_2px_rgb(var(--shadow)/0.05),0_4px_14px_-6px_rgb(var(--shadow)/0.12)] dark:bg-white/[0.07]"
        />
      )}
      {!active && <span className="absolute inset-0 rounded-xl transition-colors group-hover:bg-ink/[0.035]" />}
      <span className="relative flex w-[68px] shrink-0 justify-center">
        <ItemThumb item={item} className={cx(item.type === "graphic" ? "h-12 w-12" : item.type === "blog" ? "h-12 w-[68px]" : "h-[54px] w-[44px]")} />
      </span>
      <div className="relative min-w-0 flex-1">
        <div className="line-clamp-2 text-[13.5px] font-semibold leading-[18px] tracking-[-0.006em] text-ink">{T.label === "Blog" ? itemTitle(item, topic) : `${T.label}${item.type === "graphic" && item.body?.kind ? ` · ${graphicKind(item.body.kind)}` : ""}`}</div>
        <div className="mt-1 flex items-center gap-1.5">
          <ItemStatus item={item} jobs={jobs} />
          <span className="ml-auto whitespace-nowrap text-[11px] text-ink-faint" title={item.updated_at ? `Updated ${new Date(item.updated_at).toLocaleString("en-IN")}` : undefined}>{item.updated_at ? "Updated " : "Created "}{shortAgo(item.updated_at || item.created_at)}</span>
        </div>
      </div>
    </button>
  );
}

function ViewerSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="hairline-b flex h-[60px] items-center gap-3 px-6"><Skeleton className="h-5 w-48" /><div className="flex-1" /><Skeleton className="h-9 w-28" /><Skeleton className="h-9 w-28" /></div>
      <div className="mx-auto w-full max-w-[720px] p-8"><Skeleton className="aspect-[16/9] w-full rounded-2xl" /><Skeleton className="mt-8 h-8 w-3/4" /><Skeleton className="mt-4 h-4 w-full" /><Skeleton className="mt-2 h-4 w-5/6" /></div>
    </div>
  );
}

function Viewer({ item, topic, desktop, index, total, onStep, onBack, editing, setEditing, act, onPublish, onPosted }) {
  const d = useData();
  const T = TYPE_META[item.type];
  const [variant, setVariant] = useGraphicVariant(item);
  const baseName = item.body?.slug || topic?.primary_keyword || topic?.title || item.type;
  const parentBlog = item.parent_id ? d.itemById.get(item.parent_id) : null;
  const wide = useIsDesktop("(min-width: 1280px)"); // meta panel as a side column (else inline under the stage)

  let stage, meta;
  if (item.status === "generating") {
    stage = (
      <div className="mx-auto max-w-[560px] pt-10">
        <EmptyState icon={Sparkles} tone="brand" title="Making it now">It shows up here as soon as it's ready.</EmptyState>
        <Skeleton className="mx-auto mt-2 aspect-[4/5] w-2/3 rounded-2xl" />
      </div>
    );
  } else if (item.type === "blog") {
    stage = <BlogArticle item={item} editing={editing} setEditing={setEditing} />;
    meta = <BlogMeta item={item} topic={topic} />;
  } else if (item.type === "carousel") {
    stage = <CarouselStage item={item} />;
    meta = <CarouselMeta item={item} baseName={baseName} />;
  } else if (item.type === "graphic") {
    stage = <GraphicStage item={item} variant={variant} setVariant={setVariant} />;
    meta = <GraphicMeta item={item} variant={variant} baseName={baseName} />;
  } else if (item.type === "video") {
    stage = <VideoStage item={item} />;
    meta = <VideoMeta item={item} baseName={baseName} />;
  }

  const banner = item.status === "changes_requested" && item.feedback ? (
    <div className="mx-auto mb-6 flex max-w-[720px] gap-3 rounded-2xl bg-warn/[0.09] p-4 shadow-[inset_0_0_0_1px_rgb(var(--warn)/0.18)]">
      <MessageSquareWarning className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
      <div className="min-w-0 flex-1">
        <div className="text-callout font-semibold text-ink">Sent back. We're fixing it.</div>
        <p className="mt-0.5 whitespace-pre-wrap text-callout text-ink-soft">{item.feedback}</p>
      </div>
    </div>
  ) : item.status === "failed" && item.error ? (
    <div className="mx-auto mb-6 flex max-w-[720px] gap-3 rounded-2xl bg-brand/[0.07] p-4">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-brand-ink" />
      <div className="text-callout text-ink-soft"><span className="font-semibold text-ink">Something went wrong. </span>{item.error} Tap Try again and say what to change.</div>
    </div>
  ) : null;

  const actions = <ActionBar item={item} act={act} onPublish={onPublish} onPosted={onPosted} setEditing={setEditing} compact={!desktop} />;

  return (
    <div className="flex h-full flex-col">
      {/* toolbar */}
      <div className={cx("glass hairline-b z-20 flex shrink-0 items-center gap-2", desktop ? "h-[60px] px-4 xl:px-6" : "h-[calc(52px+env(safe-area-inset-top))] px-2 pt-[env(safe-area-inset-top)]")}>
        {!desktop && <IconButton icon={ChevronLeft} label="Back" onClick={onBack} />}
        {desktop && (
          <div className="flex items-center">
            <IconButton icon={ChevronUp} label="Previous (K)" size="sm" onClick={() => onStep(-1)} disabled={index <= 0} />
            <IconButton icon={ChevronDown} label="Next (J)" size="sm" onClick={() => onStep(1)} disabled={index === -1 || index >= total - 1} />
          </div>
        )}
        <div className="min-w-0 flex-1 px-1">
          <div className="flex items-center gap-2">
            <T.icon className="h-4 w-4 shrink-0 text-ink-mute" strokeWidth={2} />
            <span className="truncate text-[14.5px] font-semibold tracking-[-0.01em]">{T.label}{item.body?.kind && item.type === "graphic" ? ` · ${graphicKind(item.body.kind)}` : ""}</span>
            <span className="hidden shrink-0 sm:inline"><ItemStatus item={item} jobs={d.jobs} /></span>
          </div>
          {/* Position first, so a long topic title is what truncates, never "5 of 9". */}
          <div className="tnum truncate text-[11.5px] text-ink-faint">
            {[desktop && total > 0 && index >= 0 ? `${index + 1} of ${total}` : "", topic?.title || itemTitle(parentBlog) || ""].filter(Boolean).join(" · ")}
          </div>
        </div>
        {desktop && actions}
        {!desktop && <span className="sm:hidden"><ItemStatus item={item} jobs={d.jobs} /></span>}
        {!desktop && total > 1 && (
          <div className="flex items-center">
            <IconButton icon={ChevronUp} label="Previous" size="sm" onClick={() => onStep(-1)} disabled={index <= 0} />
            <IconButton icon={ChevronDown} label="Next" size="sm" onClick={() => onStep(1)} disabled={index === -1 || index >= total - 1} />
          </div>
        )}
      </div>

      {/* body */}
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto focus-visible:outline-offset-[-2px]" tabIndex={0} role="region" aria-label={`${T.label} preview`}>
          <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
              className={cx("px-4 sm:px-8", desktop ? "py-8 xl:py-10" : "py-5 pb-36")}
            >
              {banner}
              {stage}
              {meta && !wide && (
                <div className="card mx-auto mt-8 max-w-[720px] overflow-hidden">{meta}</div>
              )}
          </motion.div>
        </div>
        {meta && wide && (
          <aside className="hairline-l w-[340px] shrink-0 overflow-y-auto bg-surface/50">
              <motion.div key={item.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>
                {meta}
                <MetaSection title="History">
                  <div className="space-y-1.5 text-[12.5px] text-ink-mute">
                    <div>Created {relative(item.created_at)}</div>
                    {item.updated_at && item.updated_at !== item.created_at && <div>Updated {relative(item.updated_at)}</div>}
                    {item.approved_at && <div>Approved {relative(item.approved_at)}{item.approved_by ? ` by ${item.approved_by.split("@")[0]}` : ""}</div>}
                    {item.published_at && <div>Went live {relative(item.published_at)}</div>}
                  </div>
                </MetaSection>
              </motion.div>
          </aside>
        )}
      </div>

      {!desktop && <div className="glass fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(10px+var(--safe-bottom))] pt-2.5 shadow-[0_-1px_0_var(--hairline)]">{actions}</div>}
    </div>
  );
}

function ActionBar({ item, act, onPublish, onPosted, setEditing, compact }) {
  const d = useData();
  const s = item.status;
  const more = [
    item.type === "blog" && !["published", "generating"].includes(s) && { label: "Edit blog", icon: Pencil, onClick: () => setEditing(true), kbd: "E" },
    // Never offered while a fix is being made (generating) or there is nothing to look at.
    item.type === "blog" && ["pending_review", "changes_requested", "approved"].includes(s) && { label: "Put live now", icon: Rocket, onClick: onPublish },
    item.type !== "blog" && s === "approved" && { label: "I posted it", icon: Send, onClick: onPosted },
    (s === "approved" || s === "rejected") && { label: s === "approved" ? "Undo approval" : "Bring it back", icon: RotateCcw, onClick: () => d.actions.unapprove(item) },
    item.published_url && { label: "See it live", icon: ExternalLink, onClick: () => openSafe(item.published_url || blogUrl(item)) },
    "divider",
    s !== "rejected" && s !== "published" && { label: "Don't use this", icon: X, danger: true, onClick: () => act.reject(item) },
  ].filter(Boolean);
  const cleanMore = more.filter((m, i, arr) => !(m === "divider" && (i === 0 || i === arr.length - 1)));

  const primary = (() => {
    if (s === "pending_review" || s === "changes_requested") {
      return (
        <>
          <Button size={compact ? "lg" : "md"} variant="secondary" icon={MessageSquareWarning} onClick={act.changes} kbd={compact ? null : "R"} className={compact ? "flex-1" : ""}>
            Ask for changes
          </Button>
          <Button size={compact ? "lg" : "md"} variant="primary" icon={Check} onClick={() => act.approve(item)} kbd={compact ? null : "A"} title={item.type === "blog" ? "A: pick the time · Shift+A: approve for the planned day" : "A"} className={compact ? "flex-1" : ""}>
            {s === "changes_requested" ? "Approve anyway" : "Approve"}
          </Button>
        </>
      );
    }
    if (s === "awaiting_voiceover") {
      // The owner's job here is the recording: that is the primary action, in the same slot as Approve.
      const rendering = voiceoverState(item, d.jobs).state === "rendering";
      return (
        <>
          <Button size={compact ? "lg" : "md"} variant="secondary" icon={MessageSquareWarning} onClick={act.changes} kbd={compact ? null : "R"} className={compact ? "flex-1" : ""}>
            Ask for changes
          </Button>
          {!rendering && (
            <Button size={compact ? "lg" : "md"} variant="primary" icon={Mic} onClick={() => requestVoiceoverUpload()} kbd={compact ? null : "U"} title="U: choose your recording" className={compact ? "flex-[1.4]" : ""} data-testid="vo-upload-action">
              Upload your voice
            </Button>
          )}
        </>
      );
    }
    if (s === "approved" && item.type === "blog") return <Button size={compact ? "lg" : "md"} variant="dark" icon={Rocket} onClick={onPublish} className={compact ? "flex-1" : ""}>Put live now</Button>;
    if (s === "approved") return <Button size={compact ? "lg" : "md"} variant="primary" icon={Send} onClick={onPosted} className={compact ? "flex-1" : ""}>I posted it</Button>;
    if (s === "rejected") return <Button size={compact ? "lg" : "md"} variant="secondary" icon={Undo2} onClick={() => d.actions.unapprove(item)} className={compact ? "flex-1" : ""}>Bring it back</Button>;
    if (s === "published" && (item.published_url || item.type === "blog")) return <Button size={compact ? "lg" : "md"} variant="secondary" icon={ExternalLink} onClick={() => openSafe(item.published_url || blogUrl(item))} className={compact ? "flex-1" : ""}>See it live</Button>;
    if (s === "failed") return <Button size={compact ? "lg" : "md"} variant="secondary" icon={RotateCcw} onClick={act.changes} className={compact ? "flex-1" : ""}>Try again</Button>;
    return null;
  })();

  return (
    <div className="flex items-center gap-2">
      {primary}
      {cleanMore.length > 0 && (
        <Menu
          items={cleanMore}
          side={compact ? "top" : "bottom"}
          trigger={({ toggle, open, triggerProps }) => (
            <IconButton icon={MoreHorizontal} label="More actions" onClick={toggle} active={open} {...triggerProps} className={compact ? "h-11 w-11 bg-ink/[0.05]" : ""} />
          )}
          className="shrink-0"
        />
      )}
    </div>
  );
}
