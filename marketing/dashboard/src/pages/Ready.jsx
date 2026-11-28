import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Send, Download, Check, Eye, PackageOpen } from "lucide-react";
import { useData } from "../lib/store.jsx";
import { navigate } from "../lib/router.jsx";
import { PageHeader } from "../components/Shell.jsx";
import { Button, CopyButton, Skeleton, EmptyState, Card, cx } from "../components/ui.jsx";
import { PostedSheet } from "../components/ReviewSheets.jsx";
import { ItemThumb } from "../components/ItemBits.jsx";
import { TYPE_META, assetsFor, captionOf, byType } from "../lib/model.js";
import { downloadMany, downloadName } from "../lib/media.js";
import { formatDate, dateOnly, relative } from "../lib/format.js";
import { spring } from "../lib/motion.js";

function filesFor(assets, item, base) {
  const list = assetsFor(assets, item.id);
  return list.map((a, i) => {
    const suffix = a.kind === "carousel_slide" ? `slide-${(a.position ?? i) + 1}` : a.kind === "carousel_pdf" ? "carousel" : a.kind === "graphic" ? (a.width && a.height && a.width > a.height ? "landscape" : "square") : a.kind === "video" ? "reel" : a.kind === "video_poster" ? "reel-cover" : a.kind;
    return { path: a.storage_path, name: downloadName(base, a, suffix) };
  });
}

export default function Ready() {
  const d = useData();
  const loading = d.status === "loading";
  const [posting, setPosting] = useState(null);
  const items = useMemo(() => d.items.filter((i) => i.type !== "blog" && i.status === "approved").sort(byType), [d.items]);
  const groups = useMemo(() => {
    const m = new Map();
    for (const i of items) { if (!m.has(i.topic_id)) m.set(i.topic_id, []); m.get(i.topic_id).push(i); }
    return [...m.entries()].map(([tid, list]) => ({ topic: d.topicById.get(tid), list }));
  }, [items, d.topicById]);

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-8 lg:py-10">
      <PageHeader title="Ready to post" subtitle="Approved social pieces. Download, copy the caption, post, then mark it as posted." />
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[340px] rounded-2xl" />)}</div>
      ) : !items.length ? (
        <Card><EmptyState icon={PackageOpen} title="Nothing waiting to be posted">Approve a carousel, graphic or reel in Review and it shows up here, ready to download.</EmptyState></Card>
      ) : (
        groups.map(({ topic, list }) => (
          <section key={topic?.id || "x"} className="mb-10">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="text-headline font-semibold">{topic?.title || "Other"}</h2>
              {topic?.planned_publish_date && <span className="text-callout text-ink-mute">Blog {formatDate(dateOnly(topic.planned_publish_date), { weekday: "short", day: "numeric", month: "short" })}</span>}
            </div>
            <motion.div layout className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <AnimatePresence>
                {list.map((item) => {
                  const base = item.body?.slug || topic?.primary_keyword || topic?.title || item.type;
                  const T = TYPE_META[item.type];
                  const files = filesFor(d.assets, item, base);
                  return (
                    <motion.div key={item.id} layout initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={spring} className="card flex flex-col overflow-hidden">
                      <button onClick={() => navigate(`/review/${item.id}?filter=approved`)} aria-label={`Open ${T.label.toLowerCase()} for ${topic?.title || "this topic"}`} className="group relative block bg-ink/[0.03] p-4">
                        <ItemThumb item={item} className={cx("mx-auto shadow-lift", item.type === "graphic" ? "aspect-square w-[62%]" : "aspect-[4/5] w-[52%]")} />
                        <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black/45 px-2 py-1 text-[11px] font-semibold text-white opacity-0 backdrop-blur-md transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"><Eye className="h-3 w-3" /> Open</span>
                      </button>
                      <div className="flex flex-1 flex-col p-4">
                        <div className="flex items-center gap-2">
                          <T.icon className="h-4 w-4 text-ink-mute" />
                          <span className="text-callout font-semibold">{T.label}{item.body?.kind ? ` · ${item.body.kind}` : ""}</span>
                          <span className="ml-auto text-[11.5px] text-ink-faint">Approved {relative(item.approved_at)}</span>
                        </div>
                        <p className="mt-2 line-clamp-3 flex-1 text-[13px] leading-[19px] text-ink-soft">{item.body?.caption_linkedin || item.body?.caption || "No caption"}</p>
                        <div className="mt-4 grid grid-cols-2 gap-2">
                          <Button size="sm" icon={Download} onClick={() => downloadMany(files)} disabled={!files.length}>Download{files.length > 1 ? ` ${files.length}` : ""}</Button>
                          <CopyButton text={captionOf(item)} label="Caption" />
                        </div>
                        <Button size="sm" variant="tinted" icon={Send} className="mt-2 w-full" onClick={() => setPosting(item)}>Mark as posted</Button>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          </section>
        ))
      )}
      <PostedSheet open={!!posting} onClose={() => setPosting(null)} item={posting} onSubmit={(url) => d.actions.markPosted(posting, url)} />
    </div>
  );
}
