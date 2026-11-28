import { useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Telescope, TrendingUp, Users, Swords, Lightbulb, BookOpen, ArrowUpRight, CalendarDays } from "lucide-react";
import { useData } from "../lib/store.jsx";
import { navigate } from "../lib/router.jsx";
import { PageHeader } from "../components/Shell.jsx";
import { Card, Chip, Skeleton, EmptyState, StatusChip, cx } from "../components/ui.jsx";
import { TOPIC_STATUS } from "../lib/model.js";
import { formatDate, dateOnly, relative, hostOf, plural } from "../lib/format.js";
import { list, listItem, spring } from "../lib/motion.js";
import { safeHref } from "../lib/safe.js";

function SourceLinks({ urls = [] }) {
  if (!urls?.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {urls.map((u) => (
        <a key={u} href={safeHref(u)} target="_blank" rel="noopener noreferrer" className="inline-flex h-6 items-center gap-1 rounded-full bg-ink/[0.05] px-2 text-[11.5px] font-medium text-ink-soft transition-colors hover:bg-info/10 hover:text-info">
          {hostOf(u) || "source"} <ArrowUpRight className="h-3 w-3" />
        </a>
      ))}
    </div>
  );
}

function Section({ icon: Icon, title, count, tone, children }) {
  const tones = { brand: "bg-brand/10 text-brand-ink", info: "bg-info/10 text-info", violet: "bg-ink/[0.06] text-ink-soft", ok: "bg-ok/10 text-ok", warn: "bg-warn/10 text-warn" };
  return (
    <section className="mt-10">
      <div className="mb-4 flex items-center gap-2.5">
        <span className={cx("flex h-8 w-8 items-center justify-center rounded-[10px]", tones[tone])}><Icon className="h-4 w-4" strokeWidth={2.2} /></span>
        <h2 className="text-title-2 font-bold">{title}</h2>
        {count != null && <span className="tnum mt-0.5 text-body font-semibold text-ink-faint">{count}</span>}
      </div>
      {children}
    </section>
  );
}

export default function Research({ id }) {
  const d = useData();
  const loading = d.status === "loading";
  const brief = id ? d.briefs.find((b) => b.id === id) : d.briefs[0];
  useEffect(() => { if (!id && brief && d.status === "ready") navigate(`/research/${brief.id}`, { replace: true }); }, [id, brief, d.status]);
  const topics = useMemo(() => d.topics.filter((t) => t.brief_id === brief?.id), [d.topics, brief]);

  if (loading) {
    return (
      <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-8 lg:py-10">
        <Skeleton className="h-4 w-28" /><Skeleton className="mt-3 h-10 w-80" /><Skeleton className="mt-8 h-40 rounded-2xl" />
        <div className="mt-8 grid gap-3 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div>
      </div>
    );
  }
  if (!brief) {
    return (
      <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-8 lg:py-10">
        <PageHeader title="Research" />
        <Card><EmptyState icon={Telescope} title="No research briefs yet">Every weekly run starts by reading the news, forums and competitors, then writes a brief here before planning topics.</EmptyState></Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-8 lg:py-10">
      <PageHeader
        eyebrow={`Research brief · ${relative(brief.created_at)}`}
        title={`Week of ${formatDate(dateOnly(brief.week_start), { day: "numeric", month: "long" })}`}
        actions={
          d.briefs.length > 1 && (
            <div className="no-scrollbar -mx-1 flex max-w-[90vw] gap-1.5 overflow-x-auto px-1">
              {d.briefs.map((b) => (
                <button
                  key={b.id}
                  onClick={() => navigate(`/research/${b.id}`, { replace: true })}
                  className={cx("relative h-8 shrink-0 rounded-full px-3 text-callout font-semibold transition-colors", b.id === brief.id ? "text-canvas" : "text-ink-soft hover:bg-ink/[0.05]")}
                >
                  {b.id === brief.id && <motion.span layoutId="brief-pill" transition={spring} className="absolute inset-0 rounded-full bg-ink" />}
                  <span className="relative">{formatDate(dateOnly(b.week_start), { day: "numeric", month: "short" })}</span>
                </button>
              ))}
            </div>
          )
        }
      />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={brief.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
          <div className="mesh-ink grain relative overflow-hidden rounded-[22px] p-6 text-white shadow-lift sm:p-8">
            <span className="mesh-sheen" aria-hidden />
            <div className="relative z-[1]">
              <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/60">Summary</div>
              <p className="mt-3 max-w-3xl text-[19px] leading-[1.55] tracking-[-0.012em] text-white/90 sm:text-[21px]">{brief.summary}</p>
              <div className="mt-6 flex flex-wrap gap-2 text-[12.5px] text-white/60">
                <span>{plural(brief.trends?.length || 0, "trend")}</span><span>·</span>
                <span>{plural(brief.pain_points?.length || 0, "pain point")}</span><span>·</span>
                <span>{plural(brief.opportunities?.length || 0, "opportunity", "opportunities")}</span><span>·</span>
                <span>{plural(brief.sources?.length || 0, "source")}</span>
              </div>
            </div>
          </div>

          {topics.length > 0 && (
            <Section icon={CalendarDays} title="Topics planned from this brief" count={topics.length} tone="brand">
              <div className="grid gap-3 md:grid-cols-3">
                {topics.map((t) => (
                  <button key={t.id} onClick={() => navigate("/calendar")} className="card flex flex-col p-5 text-left transition-shadow hover:card-lift">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-brand-ink">{t.category}</span>
                      <StatusChip map={TOPIC_STATUS} status={t.status} size="sm" />
                    </div>
                    <div className="mt-2 text-body font-semibold leading-5">{t.title}</div>
                    {t.rationale && <p className="mt-1.5 line-clamp-2 text-[12.5px] text-ink-mute">{t.rationale}</p>}
                    <div className="mt-auto pt-3 text-[12px] font-medium text-ink-mute">{t.planned_publish_date ? formatDate(dateOnly(t.planned_publish_date), { weekday: "short", day: "numeric", month: "short" }) : "Unscheduled"}</div>
                  </button>
                ))}
              </div>
            </Section>
          )}

          {brief.trends?.length > 0 && (
            <Section icon={TrendingUp} title="Trends" count={brief.trends.length} tone="info">
              <motion.div variants={list} initial="initial" animate="animate" className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {brief.trends.map((t, i) => (
                  <motion.div key={i} variants={listItem} className="card p-5">
                    <div className="text-body font-semibold leading-5 text-ink">{t.title}</div>
                    <p className="mt-2 text-callout leading-[19px] text-ink-soft">{t.detail}</p>
                    <SourceLinks urls={t.source_urls} />
                  </motion.div>
                ))}
              </motion.div>
            </Section>
          )}

          {brief.pain_points?.length > 0 && (
            <Section icon={Users} title="Buyer pain points" count={brief.pain_points.length} tone="warn">
              <div className="card divide-y divide-[color:var(--hairline)]">
                {brief.pain_points.map((p, i) => (
                  <div key={i} className="grid gap-2 p-5 md:grid-cols-[180px_1fr]">
                    <div><Chip tone="neutral" dot={false}>{p.audience}</Chip></div>
                    <div>
                      <div className="text-body font-semibold text-ink">{p.pain}</div>
                      {p.evidence && <p className="mt-1 text-callout text-ink-mute">{p.evidence}</p>}
                      <SourceLinks urls={p.source_urls} />
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {brief.opportunities?.length > 0 && (
            <Section icon={Lightbulb} title="Opportunities" count={brief.opportunities.length} tone="ok">
              <div className="grid gap-3 md:grid-cols-2">
                {brief.opportunities.map((o, i) => (
                  <div key={i} className="card relative overflow-hidden p-5">
                    <div className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-ok to-ok/30" />
                    <div className="text-body font-semibold text-ink">{o.idea}</div>
                    {o.why_now && <p className="mt-1.5 text-callout text-ink-soft"><span className="font-semibold text-ink-mute">Why now: </span>{o.why_now}</p>}
                    <SourceLinks urls={o.source_urls} />
                  </div>
                ))}
              </div>
            </Section>
          )}

          {brief.competitor_notes?.length > 0 && (
            <Section icon={Swords} title="Competitors" count={brief.competitor_notes.length} tone="violet">
              <div className="card divide-y divide-[color:var(--hairline)]">
                {brief.competitor_notes.map((c, i) => (
                  <div key={i} className="flex gap-4 p-5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink/[0.05] text-callout font-bold text-ink-soft">{(c.competitor || "?")[0]}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-body font-semibold">{c.competitor}</span>
                        {c.url && <a href={safeHref(c.url)} target="_blank" rel="noopener noreferrer" className="text-[12px] font-medium text-info hover:underline">{hostOf(c.url)}</a>}
                      </div>
                      <p className="mt-1 text-callout text-ink-soft">{c.observation}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {brief.sources?.length > 0 && (
            <Section icon={BookOpen} title="Sources" count={brief.sources.length} tone="info">
              <div className="grid gap-2 sm:grid-cols-2">
                {brief.sources.map((s, i) => (
                  <a key={i} href={safeHref(s.url)} target="_blank" rel="noopener noreferrer" className="card group flex items-center gap-3 p-3.5 transition-shadow hover:card-lift">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink/[0.05] text-[12px] font-bold uppercase text-ink-mute">{hostOf(s.url)[0] || "?"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-callout font-semibold text-ink">{s.title || s.url}</span>
                      <span className="block truncate text-[12px] text-ink-mute">{hostOf(s.url)}</span>
                    </span>
                    <ArrowUpRight className="h-4 w-4 text-ink-faint transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-info" />
                  </a>
                ))}
              </div>
            </Section>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
