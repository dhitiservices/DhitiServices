import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Globe2, ArrowUpRight } from "lucide-react";
import { useData } from "../lib/store.jsx";
import { navigate } from "../lib/router.jsx";
import { PageHeader } from "../components/Shell.jsx";
import { Segmented, Skeleton, EmptyState, Card } from "../components/ui.jsx";
import { ItemThumb } from "../components/ItemBits.jsx";
import { TYPE_META, itemTitle, blogUrl } from "../lib/model.js";
import { formatDate, hostOf } from "../lib/format.js";
import { list, listItem } from "../lib/motion.js";
import { safeHref } from "../lib/safe.js";

export default function Published() {
  const d = useData();
  const loading = d.status === "loading";
  const [tab, setTab] = useState("blog");
  const rows = useMemo(() => d.items
    .filter((i) => i.status === "published" && (tab === "blog" ? i.type === "blog" : i.type !== "blog"))
    .sort((a, b) => (b.published_at || "").localeCompare(a.published_at || "")), [d.items, tab]);
  const counts = { blog: d.items.filter((i) => i.status === "published" && i.type === "blog").length, social: d.items.filter((i) => i.status === "published" && i.type !== "blog").length };

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-8 lg:py-10">
      <PageHeader
        title="Live"
        subtitle="Everything that is live on dhitiservices.com or posted on social media."
        actions={<Segmented value={tab} onChange={setTab} layoutId="pub-tab" options={[{ value: "blog", label: "Blogs", count: counts.blog }, { value: "social", label: "Social posts", count: counts.social }]} />}
      />
      {loading ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
      ) : !rows.length ? (
        <Card><EmptyState icon={Globe2} title={tab === "blog" ? "No blogs live yet" : "Nothing posted yet"}>{tab === "blog" ? "Approved blogs go live on their own at the time you picked." : "Tap I posted it in Ready to post."}</EmptyState></Card>
      ) : (
        <motion.div key={tab} variants={list} initial="initial" animate="animate" className="card divide-y divide-[color:var(--hairline)] overflow-hidden">
          {rows.map((i) => {
            const topic = d.topicById.get(i.topic_id);
            const url = i.type === "blog" ? blogUrl(i) : i.published_url;
            return (
              <motion.div key={i.id} variants={listItem} className="group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-ink/[0.02] sm:px-5">
                <button onClick={() => navigate(`/review/${i.id}?filter=all`)} className="shrink-0" aria-label={`Open ${TYPE_META[i.type].label.toLowerCase()}: ${i.type === "blog" ? itemTitle(i, topic) : topic?.title || ""}`} tabIndex={-1}>
                  <ItemThumb item={i} className={i.type === "blog" ? "h-14 w-[96px]" : "h-14 w-14"} />
                </button>
                <button onClick={() => navigate(`/review/${i.id}?filter=all`)} className="min-w-0 flex-1 text-left">
                  <div className="truncate text-body font-semibold text-ink">{i.type === "blog" ? itemTitle(i, topic) : `${TYPE_META[i.type].label} · ${topic?.title || ""}`}</div>
                  <div className="mt-0.5 truncate text-[12.5px] text-ink-mute">
                    {formatDate(i.published_at, { day: "numeric", month: "short", year: "numeric" })}
                    {i.type === "blog" && i.body?.frontmatter?.category ? ` · ${i.body.frontmatter.category}` : ""}
                  </div>
                </button>
                {url ? (
                  <a href={safeHref(url)} target="_blank" rel="noopener noreferrer" aria-label={`See it live on ${hostOf(url)} (new tab)`} className="flex shrink-0 items-center gap-1 rounded-full bg-ink/[0.05] px-3 py-1.5 text-[12.5px] font-semibold text-ink-soft transition-colors hover:bg-info/10 hover:text-info">
                    <span className="hidden sm:inline">{hostOf(url)}</span><ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                ) : <span className="text-[12px] text-ink-faint">No link</span>}
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
