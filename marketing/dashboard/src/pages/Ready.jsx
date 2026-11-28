import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Send, Download, Eye, PackageOpen, Linkedin, Info } from "lucide-react";
import { useData } from "../lib/store.jsx";
import { navigate } from "../lib/router.jsx";
import { PageHeader } from "../components/Shell.jsx";
import { Button, CopyButton, Skeleton, EmptyState, Card, Chip, cx } from "../components/ui.jsx";
import { PostedSheet } from "../components/ReviewSheets.jsx";
import { ItemThumb } from "../components/ItemBits.jsx";
import { TYPE_META, assetsFor, captionOf, byType, graphicKind } from "../lib/model.js";
import { downloadMany, downloadName } from "../lib/media.js";
import { formatDate, dateOnly, relative } from "../lib/format.js";
import { autoPostOf, otherPostOf, socialStatus, FORMAT_LABEL } from "../lib/linkedin.js";
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
  const approved = useMemo(() => d.items.filter((i) => i.type !== "blog" && i.status === "approved").sort(byType), [d.items]);
  // LinkedIn posts these by itself after the blog is live: never offer them for posting by hand (no double posts).
  const auto = useMemo(() => approved.filter((i) => autoPostOf(i, d.socialByBlog, d.items)), [approved, d.socialByBlog, d.items]);
  const items = useMemo(() => approved.filter((i) => !auto.includes(i)), [approved, auto]);
  const groups = useMemo(() => {
    const m = new Map();
    for (const i of items) { if (!m.has(i.topic_id)) m.set(i.topic_id, []); m.get(i.topic_id).push(i); }
    return [...m.entries()].map(([tid, list]) => ({ topic: d.topicById.get(tid), list }));
  }, [items, d.topicById]);

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-8 lg:py-10">
      <PageHeader title="Ready to post" subtitle="Approved pictures and reels to post by hand. Download them, copy the text, post them, then tap I posted it." />
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[340px] rounded-2xl" />)}</div>
      ) : !items.length ? (
        <Card><EmptyState icon={PackageOpen} title="Nothing to post by hand right now">Approve a carousel, graphic or reel in Review and it shows up here, ready to download.{auto.length ? " LinkedIn posts are below: they go out by themselves." : ""}</EmptyState></Card>
      ) : (
        groups.map(({ topic, list }) => (
          <section key={topic?.id || "x"} className="mb-10">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="text-headline font-semibold">{topic?.title || "Other"}</h2>
              {topic?.planned_publish_date && <span className="text-callout text-ink-mute">Blog goes live {formatDate(dateOnly(topic.planned_publish_date), { weekday: "short", day: "numeric", month: "short" })}</span>}
            </div>
            <motion.div layout className="grid gap-4 sm:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
              <AnimatePresence>
                {list.map((item) => {
                  const base = item.body?.slug || topic?.primary_keyword || topic?.title || item.type;
                  const T = TYPE_META[item.type];
                  const files = filesFor(d.assets, item, base);
                  return (
                    <motion.div key={item.id} layout initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={spring} className="card flex flex-col overflow-hidden">
                      <button onClick={() => navigate(`/review/${item.id}?filter=approved`)} aria-label={`Open ${T.label.toLowerCase()} for ${topic?.title || "this topic"}`} className="group relative block bg-ink/[0.03] p-4">
                        <ItemThumb item={item} className={cx("mx-auto shadow-lift", item.type === "graphic" ? "aspect-square w-[62%]" : "aspect-[4/5] w-[52%]")} />
                        <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-[11px] font-semibold text-white opacity-0 backdrop-blur-md transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"><Eye className="h-3 w-3" /> Open</span>
                      </button>
                      <div className="flex flex-1 flex-col p-4">
                        <div className="flex items-center gap-2">
                          <T.icon className="h-4 w-4 text-ink-mute" />
                          <span className="text-callout font-semibold">{T.label}{item.type === "graphic" && item.body?.kind ? ` · ${graphicKind(item.body.kind)}` : ""}</span>
                          <span className="ml-auto text-[11.5px] text-ink-faint">Approved {relative(item.approved_at)}</span>
                        </div>
                        <p className="mt-2 line-clamp-3 flex-1 text-[13px] leading-[19px] text-ink-soft">{item.body?.caption_linkedin || item.body?.caption || "No text yet"}</p>
                        {otherPostOf(item, d.socialByBlog, d.items) && (
                          <p className="mt-2 flex items-start gap-1.5 text-[12px] text-ink-mute"><Info className="mt-px h-3.5 w-3.5 shrink-0" />This blog already posts on LinkedIn as a {FORMAT_LABEL[otherPostOf(item, d.socialByBlog, d.items).format].toLowerCase()}. Post this one only if you want a second post.</p>
                        )}
                        <div className="mt-4 grid grid-cols-2 gap-2">
                          <Button size="sm" icon={Download} onClick={() => downloadMany(files)} disabled={!files.length}>Download{files.length > 1 ? ` ${files.length}` : ""}</Button>
                          <CopyButton text={captionOf(item)} label="Copy text" />
                        </div>
                        <Button size="sm" variant="tinted" icon={Send} className="mt-2 w-full" onClick={() => setPosting(item)}>I posted it</Button>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          </section>
        ))
      )}
      {!loading && auto.length > 0 && (
        <section className="mb-10" data-testid="ready-auto">
          <h2 className="text-headline font-semibold">Posts on LinkedIn by itself</h2>
          <p className="mt-1 text-callout text-ink-mute">You don't need to do anything. These go out on the Dhiti Services page after their blog is live.</p>
          <Card className="mt-3 divide-y divide-[color:var(--hairline)]">
            {auto.map((item) => {
              const post = autoPostOf(item, d.socialByBlog, d.items);
              const blog = d.itemById.get(item.parent_id);
              const st = socialStatus(post, blog);
              const T = TYPE_META[item.type];
              return (
                <button key={item.id} type="button" onClick={() => navigate(`/review/${item.id}?filter=approved`)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-ink/[0.03]">
                  <ItemThumb item={item} className={item.type === "graphic" ? "h-11 w-11" : "h-[52px] w-[42px]"} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-callout font-semibold text-ink"><Linkedin className="h-3.5 w-3.5 text-info" />{T.label}{item.type === "graphic" && item.body?.kind ? ` · ${graphicKind(item.body.kind)}` : ""}</span>
                    <span className="block truncate text-[12.5px] text-ink-mute">{d.topicById.get(item.topic_id)?.title || ""}</span>
                  </span>
                  <Chip tone={st.tone} pulse={st.pulse} size="sm">{post.status === "pending_review" ? "Waiting for your OK" : st.label}</Chip>
                </button>
              );
            })}
          </Card>
        </section>
      )}
      <PostedSheet open={!!posting} onClose={() => setPosting(null)} item={posting} onSubmit={(url) => d.actions.markPosted(posting, url)} />
    </div>
  );
}
