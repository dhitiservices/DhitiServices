import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ExternalLink, AlertTriangle, CheckCircle2, Link2, Pencil, X, Download } from "lucide-react";
import { renderMarkdown } from "../../lib/markdown.js";
import { countWords, readMinutes, formatLongDay, dateOnly, hostOf, formatDateTime, toISTInput, fromISTInput } from "../../lib/format.js";
import { coverOf, blogUrl } from "../../lib/model.js";
import { downloadPath, downloadName } from "../../lib/media.js";
import { useHotkeys, MOD } from "../../lib/hotkeys.js";
import { useData } from "../../lib/store.jsx";
import { SignedImage } from "../Media.jsx";
import { Button, Counter, Field, Kbd, cx } from "../ui.jsx";
import { MetaSection, MetaRow } from "./Meta.jsx";
import { safeHref } from "../../lib/safe.js";

function AutoTextarea({ value, onChange, className, ...rest }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return <textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} className={cx("resize-none overflow-hidden", className)} {...rest} />;
}

/** Unsaved article edits survive J/K, a click on another row, a route change or a reload (this tab only). */
const draftKey = (item) => `dhiti.draft.${item.id}.v${item.version || 1}`;
function readDraft(item) {
  try { return JSON.parse(sessionStorage.getItem(draftKey(item)) || "null"); } catch { return null; }
}
function writeDraft(item, draft) {
  try { draft ? sessionStorage.setItem(draftKey(item), JSON.stringify(draft)) : sessionStorage.removeItem(draftKey(item)); } catch { /* storage unavailable */ }
}
export const hasDraft = (item) => !!item && !!readDraft(item);

/**
 * The website's checks (scripts/check-blog.mjs), computed in the browser for an edited article: the engine's stored
 * result describes the text it saved, not the owner's edit.
 */
export function clientChecks({ markdown = "", description = "", title = "" }) {
  const messages = [];
  const words = countWords(markdown);
  const sections = (markdown.match(/^##\s+\S/gm) || []).length;
  if (words < 1000) messages.push(`Only ${words} words; the site needs at least 1,000.`);
  if (sections !== 8) messages.push(`${sections} "##" sections; the site expects exactly 8.`);
  if (/\u2014/.test(markdown + description + title)) messages.push("Remove em dashes (\u2014).");
  if (description.length > 160) messages.push(`Description is ${description.length} characters; the limit is 160.`);
  if (!/\]\(https:/.test(markdown)) messages.push("Add at least one linked https source.");
  if (/<\/?[a-z][^>]*>/i.test(markdown)) messages.push("Raw HTML is not allowed.");
  if (/^ {0,3}\[[^\]]+\]:\s*\S+/m.test(markdown)) messages.push("Use inline links [text](https://...), not reference-style links.");
  return { passed: messages.length === 0, messages, words, sections };
}

export function BlogArticle({ item, editing, setEditing }) {
  const { assets, actions } = useData();
  const fm = item.body?.frontmatter || {};
  const cover = coverOf(assets, item);
  const [draft, setDraft] = useState(null);
  const [restored, setRestored] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      const saved = readDraft(item);
      setRestored(!!saved);
      setDraft(saved || { title: fm.title || item.title || "", description: fm.description || "", markdown: item.body?.markdown || "" });
    } else setDraft(null);
  }, [editing, item.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const html = useMemo(() => renderMarkdown(item.body?.markdown || ""), [item.body?.markdown]);
  const words = item.body?.word_count || countWords(item.body?.markdown);
  const draftWords = draft ? countWords(draft.markdown) : 0;
  const dirty = draft && (draft.title !== (fm.title || item.title || "") || draft.description !== (fm.description || "") || draft.markdown !== (item.body?.markdown || ""));
  // Keep the unsaved edit in sessionStorage while it differs from the stored article.
  useEffect(() => { if (editing && draft) writeDraft(item, dirty ? draft : null); }, [editing, draft, dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  const live = draft ? clientChecks(draft) : null;
  const discard = () => { writeDraft(item, null); setEditing(false); };

  const save = async () => {
    if (!draft || saving) return;
    setSaving(true);
    try {
      await actions.saveBlog(item, { ...draft, title: draft.title.trim(), description: draft.description.trim(), wordCount: draftWords });
      writeDraft(item, null);
      setEditing(false);
    } catch { /* toast shown */ } finally { setSaving(false); }
  };

  useHotkeys({ "mod+s": () => (editing ? save() : false), escape: () => (editing ? setEditing(false) : false) }, { enabled: editing });

  return (
    <article className="mx-auto w-full max-w-[720px] pb-16">
      {item.body?.owner_note && (
        <div className="mb-6 flex gap-3 rounded-2xl bg-warn/[0.09] p-4 shadow-[inset_0_0_0_1px_rgb(var(--warn)/0.2)]" role="note">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
          <div className="min-w-0 text-callout text-ink-soft"><span className="font-semibold text-ink">Check before approving. </span>{item.body.owner_note}</div>
        </div>
      )}
      <div className="relative">
        <SignedImage path={cover?.storage_path} alt={fm.imageAlt || ""} eager className="aspect-[16/9] w-full rounded-[18px] shadow-[0_0_0_1px_var(--hairline),0_20px_50px_-20px_rgb(var(--shadow)/0.35)]" />
        {cover && (
          <button
            onClick={() => downloadPath(cover.storage_path, downloadName(item.body?.slug, cover, "cover"))}
            aria-label="Download cover image"
            className="absolute right-3 top-3 flex h-8 items-center gap-1.5 rounded-full bg-black/40 px-3 text-[12px] font-semibold text-white backdrop-blur-md transition-opacity hover:bg-black/55 focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:[div:hover>&]:opacity-100"
          >
            <Download className="h-3.5 w-3.5" /> Cover
          </button>
        )}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {editing && draft ? (
          <motion.div key="edit" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="mt-8 space-y-5">
            <Field label="Title" counter={<Counter value={draft.title} max={70} />}>
              <AutoTextarea rows={1} aria-label="Title" className="input text-[22px] font-bold leading-7 tracking-[-0.02em]" value={draft.title} onChange={(v) => setDraft({ ...draft, title: v.replace(/\n/g, " ") })} />
            </Field>
            <Field label="Meta description" counter={<Counter value={draft.description} max={160} />} hint="Shown in Google results. Keep it under 160 characters.">
              <AutoTextarea rows={2} className="input leading-[22px]" value={draft.description} onChange={(v) => setDraft({ ...draft, description: v.replace(/\n/g, " ") })} />
            </Field>
            <Field
              label="Article (Markdown)"
              counter={<span className={cx("tnum text-[12px] font-semibold", draftWords < 1000 ? "text-warn" : "text-ink-faint")}>{draftWords.toLocaleString("en-IN")} words</span>}
              hint="Use ## for sections. No raw HTML and no em dashes; the site's checks run again before publishing."
            >
              <AutoTextarea rows={18} className="input min-h-[420px] text-[14.5px] leading-[23px] tracking-normal" value={draft.markdown} onChange={(v) => setDraft({ ...draft, markdown: v })} spellCheck />
            </Field>
            <div className="glass sticky bottom-3 z-10 flex items-center gap-2 rounded-2xl p-2 pl-4 shadow-pop">
              <span className="min-w-0 flex-1 text-callout text-ink-mute">
                {dirty ? (restored ? "Restored your unsaved edit" : "Unsaved changes, kept if you leave") : "No changes yet"}
                {dirty && live && !live.passed && <span className="block truncate text-[12px] text-warn">{live.messages[0]}</span>}
              </span>
              {dirty ? <Button variant="ghost" icon={X} onClick={discard}>Discard</Button> : <Button variant="ghost" icon={X} onClick={() => setEditing(false)}>Cancel</Button>}
              <Button variant="primary" icon={Check} onClick={save} loading={saving} disabled={!dirty || draft.description.length > 160 || !draft.title.trim()} kbd={`${MOD}S`}>Save</Button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="read" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <div className="mt-8 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-semibold">
              <span className="text-brand-ink">{fm.category || "Blog"}</span>
              <span className="text-ink-faint">·</span>
              <span className="text-ink-mute">{readMinutes(words)} min read</span>
            </div>
            <h1 className="mt-3 text-[30px] font-bold leading-[1.15] tracking-[-0.028em] text-ink sm:text-[36px]">{fm.title || item.title}</h1>
            {fm.description && <p className="mt-4 text-[19px] leading-[1.5] tracking-[-0.012em] text-ink-mute">{fm.description}</p>}
            <div className="mt-6 flex items-center gap-3 border-y border-[color:var(--hairline)] py-4">
              <img src="/brand/dhiti-mark.webp" alt="" className="h-9 w-9 rounded-full bg-white object-cover shadow-[0_0_0_1px_var(--hairline)]" />
              <div className="flex-1">
                <div className="text-callout font-semibold text-ink">Dhiti Services</div>
                <div className="text-[12.5px] text-ink-mute">{fm.date ? formatLongDay(dateOnly(fm.date)) : "Draft"}</div>
              </div>
              <button onClick={() => setEditing(true)} className="flex h-8 items-center gap-1.5 rounded-full bg-ink/[0.05] px-3 text-[12.5px] font-semibold text-ink-soft transition-colors hover:bg-ink/[0.09] hover:text-ink">
                <Pencil className="h-3.5 w-3.5" /> Edit <Kbd className="ml-0.5">E</Kbd>
              </button>
            </div>
            <div className="article mt-8" dangerouslySetInnerHTML={{ __html: html }} />
            {item.body?.meta?.faq?.length > 0 && (
              <section className="mt-12">
                <h2 className="text-[22px] font-bold tracking-[-0.02em] text-ink">Frequently asked</h2>
                <div className="mt-4 divide-y divide-[color:var(--hairline)] rounded-2xl bg-surface shadow-[0_0_0_1px_var(--hairline)]">
                  {item.body.meta.faq.map((f, i) => (
                    <details key={i} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-body font-semibold text-ink">
                        {f.q}
                        <span className="text-ink-faint transition-transform group-open:rotate-45">+</span>
                      </summary>
                      <p className="mt-2 text-body text-ink-soft">{f.a}</p>
                    </details>
                  ))}
                </div>
              </section>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  );
}

export function BlogMeta({ item, topic }) {
  const { actions } = useData();
  const b = item.body || {};
  const fm = b.frontmatter || {};
  const words = b.word_count || countWords(b.markdown);
  const desc = fm.description || "";
  // After an edit in the dashboard the stored result is stale: re-run the site's rules on the current text.
  const checks = b.checks?.stale ? { ...clientChecks({ markdown: b.markdown, description: desc, title: fm.title }), stale: true } : b.checks || {};
  const [when, setWhen] = useState(toISTInput(item.scheduled_for));
  useEffect(() => setWhen(toISTInput(item.scheduled_for)), [item.scheduled_for]);
  const changed = when && fromISTInput(when) !== (item.scheduled_for ? new Date(item.scheduled_for).toISOString() : null);
  const url = blogUrl(item);

  return (
    <>
      {(item.status === "approved" || item.status === "pending_review") && (
        <MetaSection title={item.status === "approved" ? "Scheduled" : "Planned publish"}>
          <input type="datetime-local" aria-label="Publish date and time (IST)" className="input tnum h-10 text-callout" value={when} onChange={(e) => setWhen(e.target.value)} />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[12px] text-ink-mute">{item.scheduled_for ? `${formatDateTime(item.scheduled_for)} IST` : "Not scheduled"}</span>
            <AnimatePresence>
              {changed && (
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
                  <Button size="sm" variant="tinted" onClick={() => actions.reschedule(item, fromISTInput(when))}>Save time</Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </MetaSection>
      )}

      {item.status === "published" && url && (
        <MetaSection title="Live">
          <a href={safeHref(url)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-callout font-semibold text-info hover:underline">
            <Link2 className="h-4 w-4" /> <span className="truncate">{url.replace(/^https?:\/\//, "")}</span>
          </a>
        </MetaSection>
      )}

      <MetaSection title="Search">
        <MetaRow label="Slug"><span className="truncate">/blog/{b.slug}/</span></MetaRow>
        <MetaRow label="Category">{fm.category}</MetaRow>
        <MetaRow label="Keyword">{b.meta?.primary_keyword || topic?.primary_keyword}</MetaRow>
        {b.meta?.secondary_keywords?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {b.meta.secondary_keywords.map((k) => <span key={k} className="rounded-md bg-ink/[0.05] px-1.5 py-0.5 text-[11.5px] font-medium text-ink-soft">{k}</span>)}
          </div>
        )}
        <div className="mt-3 rounded-xl bg-ink/[0.035] p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11.5px] font-semibold text-ink-mute">Description</span>
            <Counter value={desc} max={160} />
          </div>
          <p className="text-[12.5px] leading-[18px] text-ink-soft">{desc || "No description"}</p>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-ink/[0.06]">
            <motion.div className={cx("h-full rounded-full", desc.length > 160 ? "bg-brand" : desc.length > 144 ? "bg-warn" : "bg-ok")} initial={{ scaleX: 0 }} animate={{ scaleX: Math.min(1, desc.length / 160) }} style={{ transformOrigin: "left" }} transition={{ type: "spring", stiffness: 200, damping: 30 }} />
          </div>
        </div>
      </MetaSection>

      <MetaSection title="Quality">
        <MetaRow label="Words"><span className={cx("tnum", words < 1000 && "text-warn")}>{Number(words).toLocaleString("en-IN")}</span></MetaRow>
        <MetaRow label="Read time">{readMinutes(words)} min</MetaRow>
        <MetaRow label="Version">v{item.version || 1}</MetaRow>
        <div className={cx("mt-2 flex items-start gap-2 rounded-xl px-3 py-2.5 text-[12.5px] font-medium", checks.passed === false ? "bg-warn/10 text-warn" : "bg-ok/10 text-ok")}>
          {checks.passed === false ? <AlertTriangle className="mt-px h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-px h-4 w-4 shrink-0" />}
          <div>
            {checks.passed === false ? "Site checks need attention" : checks.stale ? "Your edit passes the website's checks" : "Passes the website's blog checks"}
            {checks.messages?.length > 0 && <ul className="mt-1 list-disc pl-4 font-normal">{checks.messages.map((m, i) => <li key={i}>{m}</li>)}</ul>}
          </div>
        </div>
      </MetaSection>

      {b.sources?.length > 0 && (
        <MetaSection title={`Sources · ${b.sources.length}`}>
          <ul className="space-y-1">
            {b.sources.map((s, i) => (
              <li key={i}>
                <a href={safeHref(s.url)} target="_blank" rel="noopener noreferrer" className="group flex items-start gap-2 rounded-lg p-1.5 -mx-1.5 transition-colors hover:bg-ink/[0.04]">
                  <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-ink/[0.05] text-[10px] font-bold uppercase text-ink-mute">{hostOf(s.url).charAt(0) || "?"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[12.5px] font-medium leading-[17px] text-ink-soft group-hover:text-ink">{s.title || s.url}</span>
                    <span className="text-[11.5px] text-ink-faint">{hostOf(s.url)}</span>
                  </span>
                  <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100" />
                </a>
              </li>
            ))}
          </ul>
        </MetaSection>
      )}

      {b.cover_stock?.title && (
        <MetaSection title="Cover licence">
          <p className="text-[12.5px] text-ink-soft">Magnific stock #{b.cover_stock.id}: {b.cover_stock.title}</p>
        </MetaSection>
      )}
    </>
  );
}
