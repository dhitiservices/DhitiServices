import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check, MessageSquareWarning, X, ChevronUp, ChevronDown, ChevronLeft, MoreHorizontal, Rocket, Pencil, Undo2, ExternalLink,
  Inbox, Sparkles, AlertTriangle, Send, RotateCcw, PartyPopper, Mic,
} from "lucide-react";
import { useData } from "../lib/store.jsx";
import { navigate, useLocation } from "../lib/router.jsx";
import { useHotkeys } from "../lib/hotkeys.js";
import { TYPE_META, ITEM_STATUS, byType, itemTitle, blogUrl } from "../lib/model.js";
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
import { VideoStage, VideoMeta } from "../components/viewers/VideoViewer.jsx";
import { MetaSection } from "../components/viewers/Meta.jsx";

const FILTERS = {
  review: { label: "To review", test: (i) => i.status === "pending_review" || i.status === "awaiting_voiceover" },
  changes: { label: "Changes", test: (i) => i.status === "changes_requested" || i.status === "generating" || i.status === "failed" },
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
      .sort((a, b) => String(a.topic?.planned_publish_date || "9").localeCompare(String(b.topic?.planned_publish_date || "9")));
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

  const act = {
    approve: (item = sel) => {
      if (!item || !canApprove(item)) return;
      if (item.type === "blog") return setApproveOpen(true);
      advanceFrom(item, "approved");
      d.actions.approve(item);
    },
    approveBlog: (iso) => { advanceFrom(sel, "approved"); d.actions.approve(sel, { scheduledFor: iso }); },
    reject: (item = sel) => { if (!item) return; advanceFrom(item, "rejected"); d.actions.reject(item); },
    changes: () => sel && canChange(sel) && setChangesOpen(true),
    submitChanges: async (text) => { const item = sel; await d.actions.requestChanges(item, text); advanceFrom(item, "changes_requested"); },
  };

  useHotkeys(
    {
      j: () => step(1),
      k: () => step(-1),
      arrowdown: () => (desktop ? step(1) : false),
      arrowup: () => (desktop ? step(-1) : false),
      a: () => act.approve(),
      r: () => act.changes(),
      e: () => (sel?.type === "blog" && !editing ? setEditing(true) : false),
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
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-28 sm:px-3 lg:pb-6">
        {loading ? (
          <div className="space-y-2 px-1.5 pt-2">{Array.from({ length: 6 }, (_, i) => <div key={i} className="flex gap-3 p-2"><Skeleton className="h-12 w-12 shrink-0" /><div className="flex-1 space-y-2 pt-1"><Skeleton className="h-3.5 w-4/5" /><Skeleton className="h-3 w-1/3" /></div></div>)}</div>
        ) : flat.length === 0 ? (
          <EmptyState
            icon={filter === "review" ? PartyPopper : Inbox}
            tone={filter === "review" ? "brand" : "neutral"}
            title={filter === "review" ? "Inbox zero" : "Nothing here"}
          >
            {filter === "review" ? "Everything has been reviewed. New drafts land here after the weekly run." : "No items match this filter right now."}
          </EmptyState>
        ) : (
          groups.map((g) => (
            <div key={g.key} className="mb-3">
              <div className="sticky top-0 z-[1] -mx-0.5 flex items-center gap-2 bg-canvas/90 px-3 pb-1.5 pt-3 backdrop-blur-md lg:bg-transparent lg:backdrop-blur-none">
                <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-ink-soft">{g.topic?.title || "Other"}</span>
                {g.topic?.planned_publish_date && <span className="tnum shrink-0 text-[11.5px] text-ink-faint">{formatDate(dateOnly(g.topic.planned_publish_date), { weekday: "short", day: "numeric", month: "short" })}</span>}
              </div>
              {g.items.map((it) => <QueueRow key={it.id} item={it} topic={g.topic} active={it.id === sel?.id && desktop} onClick={() => open(it)} />)}
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
        <EmptyState icon={Sparkles} title="This item no longer exists">It may have been replaced by a newer version.</EmptyState>
      ) : flat.length ? (
        <EmptyState icon={Sparkles} title="Pick something to review">Select an item on the left, or press J.</EmptyState>
      ) : (
        <EmptyState icon={PartyPopper} tone="brand" title="All caught up">Nothing is waiting for you. Drafts from the next run land here, and you'll see them live.</EmptyState>
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
            title="Publish this blog now?"
            description="It is approved (if it isn't already) and committed to dhitiservices.com on the next publisher run, usually within 30 minutes."
            confirmLabel="Publish now"
            onConfirm={() => d.actions.publishNow(sel)}
          />
        </>
      )}
    </>
  );
}

const canApprove = (i) => i.status === "pending_review" || i.status === "changes_requested";
const canChange = (i) => ["pending_review", "awaiting_voiceover", "changes_requested", "failed", "approved"].includes(i.status);

function QueueRow({ item, topic, active, onClick }) {
  const T = TYPE_META[item.type];
  return (
    <button onClick={onClick} className="group relative flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left">
      {active && (
        <motion.span
          layoutId="queue-active"
          transition={spring}
          className="absolute inset-0 rounded-xl bg-surface shadow-[0_0_0_1px_var(--hairline),0_1px_2px_rgb(var(--shadow)/0.05),0_4px_14px_-6px_rgb(var(--shadow)/0.12)] dark:bg-white/[0.07]"
        />
      )}
      {!active && <span className="absolute inset-0 rounded-xl transition-colors group-hover:bg-ink/[0.035]" />}
      <ItemThumb item={item} className={cx("relative", item.type === "graphic" ? "h-12 w-12" : item.type === "blog" ? "h-12 w-[68px]" : "h-[54px] w-[44px]")} />
      <div className="relative min-w-0 flex-1">
        <div className="line-clamp-2 text-[13.5px] font-semibold leading-[18px] tracking-[-0.006em] text-ink">{T.label === "Blog" ? itemTitle(item, topic) : `${T.label}${item.body?.kind ? ` · ${item.body.kind}` : ""}`}</div>
        <div className="mt-1 flex items-center gap-1.5">
          <StatusChip map={ITEM_STATUS} status={item.status} size="sm" />
          {item.version > 1 && <span className="text-[11px] font-semibold text-ink-faint">v{item.version}</span>}
          <span className="ml-auto text-[11px] text-ink-faint">{relative(item.updated_at || item.created_at)}</span>
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
        <EmptyState icon={Sparkles} tone="brand" title="Being made right now">This piece appears here as soon as it's rendered. Live updates are on.</EmptyState>
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
        <div className="text-callout font-semibold text-ink">Waiting for revision</div>
        <p className="mt-0.5 whitespace-pre-wrap text-callout text-ink-soft">{item.feedback}</p>
      </div>
    </div>
  ) : item.status === "failed" && item.error ? (
    <div className="mx-auto mb-6 flex max-w-[720px] gap-3 rounded-2xl bg-brand/[0.07] p-4">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
      <div className="text-callout text-ink-soft"><span className="font-semibold text-ink">This piece failed. </span>{item.error}</div>
    </div>
  ) : null;

  const actions = <ActionBar item={item} act={act} onPublish={onPublish} onPosted={onPosted} setEditing={setEditing} compact={!desktop} />;

  return (
    <div className="flex h-full flex-col">
      {/* toolbar */}
      <div className={cx("glass hairline-b z-20 flex shrink-0 items-center gap-2", desktop ? "h-[60px] px-4 xl:px-6" : "h-[52px] px-2 pt-[env(safe-area-inset-top)]")}>
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
            <span className="truncate text-[14.5px] font-semibold tracking-[-0.01em]">{T.label}{item.body?.kind && item.type === "graphic" ? ` · ${item.body.kind}` : ""}</span>
            <span className="hidden shrink-0 sm:inline"><StatusChip map={ITEM_STATUS} status={item.status} size="sm" /></span>
          </div>
          <div className="tnum truncate text-[11.5px] text-ink-faint">
            {topic?.title || itemTitle(parentBlog) || ""}
            {desktop && total > 0 && index >= 0 ? ` · ${index + 1} of ${total}` : ""}
            {item.version > 1 ? ` · v${item.version}` : ""}
          </div>
        </div>
        {desktop && actions}
        {!desktop && <span className="sm:hidden"><StatusChip map={ITEM_STATUS} status={item.status} size="sm" /></span>}
      </div>

      {/* body */}
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto">
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
                    {item.approved_at && <div>Approved {relative(item.approved_at)}{item.approved_by ? ` by ${item.approved_by.split("@")[0]}` : ""}</div>}
                    {item.published_at && <div>Published {relative(item.published_at)}</div>}
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
    item.type === "blog" && s !== "published" && { label: "Edit article", icon: Pencil, onClick: () => setEditing(true), kbd: "E" },
    item.type === "blog" && s !== "published" && { label: "Publish now", icon: Rocket, onClick: onPublish },
    item.type !== "blog" && s === "approved" && { label: "Mark as posted", icon: Send, onClick: onPosted },
    (s === "approved" || s === "rejected") && { label: "Move back to review", icon: RotateCcw, onClick: () => d.actions.unapprove(item) },
    item.published_url && { label: "Open live post", icon: ExternalLink, onClick: () => window.open(item.published_url || blogUrl(item), "_blank", "noopener") },
    "divider",
    s !== "rejected" && s !== "published" && { label: "Reject", icon: X, danger: true, onClick: () => act.reject(item) },
  ].filter(Boolean);
  const cleanMore = more.filter((m, i, arr) => !(m === "divider" && (i === 0 || i === arr.length - 1)));

  const primary = (() => {
    if (s === "pending_review" || s === "changes_requested") {
      return (
        <>
          <Button size={compact ? "lg" : "md"} variant="secondary" icon={MessageSquareWarning} onClick={act.changes} kbd={compact ? null : "R"} className={compact ? "flex-1" : ""}>
            {compact ? "Changes" : "Request changes"}
          </Button>
          <Button size={compact ? "lg" : "md"} variant="primary" icon={Check} onClick={() => act.approve(item)} kbd={compact ? null : "A"} className={compact ? "flex-1" : ""}>
            {s === "changes_requested" ? "Approve anyway" : "Approve"}
          </Button>
        </>
      );
    }
    if (s === "awaiting_voiceover") {
      return (
        <Button size={compact ? "lg" : "md"} variant="secondary" icon={MessageSquareWarning} onClick={act.changes} kbd={compact ? null : "R"} className={compact ? "flex-1" : ""}>
          Request changes
        </Button>
      );
    }
    if (s === "approved" && item.type === "blog") return <Button size={compact ? "lg" : "md"} variant="dark" icon={Rocket} onClick={onPublish} className={compact ? "flex-1" : ""}>Publish now</Button>;
    if (s === "approved") return <Button size={compact ? "lg" : "md"} variant="primary" icon={Send} onClick={onPosted} className={compact ? "flex-1" : ""}>Mark as posted</Button>;
    if (s === "rejected") return <Button size={compact ? "lg" : "md"} variant="secondary" icon={Undo2} onClick={() => d.actions.unapprove(item)} className={compact ? "flex-1" : ""}>Restore to review</Button>;
    if (s === "published" && (item.published_url || item.type === "blog")) return <Button size={compact ? "lg" : "md"} variant="secondary" icon={ExternalLink} onClick={() => window.open(item.published_url || blogUrl(item), "_blank", "noopener")} className={compact ? "flex-1" : ""}>View live</Button>;
    if (s === "failed") return <Button size={compact ? "lg" : "md"} variant="secondary" icon={RotateCcw} onClick={act.changes} className={compact ? "flex-1" : ""}>Retry with notes</Button>;
    return null;
  })();

  return (
    <div className="flex items-center gap-2">
      {s === "awaiting_voiceover" && !compact && <Chip tone="violet" className="mr-1"><Mic className="h-3 w-3" /> Upload voiceover in the panel</Chip>}
      {primary}
      {cleanMore.length > 0 && (
        <Menu
          items={cleanMore}
          side={compact ? "top" : "bottom"}
          trigger={({ toggle, open }) => (
            <IconButton icon={MoreHorizontal} label="More actions" onClick={toggle} active={open} className={compact ? "h-11 w-11 bg-ink/[0.05]" : ""} />
          )}
          className="shrink-0"
        />
      )}
    </div>
  );
}
