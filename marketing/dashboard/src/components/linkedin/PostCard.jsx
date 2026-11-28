import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Globe2, ThumbsUp, MessageCircle, Repeat2, Send, ChevronLeft, ChevronRight, Check, X, AlertTriangle, ExternalLink,
  RotateCcw, Sparkles, Link2, Pause, Unplug, Rocket, Undo2, FileText,
} from "lucide-react";
import { useData } from "../../lib/store.jsx";
import { navigate } from "../../lib/router.jsx";
import { safeHref } from "../../lib/safe.js";
import { relative } from "../../lib/format.js";
import {
  FORMAT_LABEL, FORMAT_HINT, captionChecks, commentChecks, blocking, seeMoreCut, commentLink, formatOptions, socialStatus, editable,
  markPageSeen, unseenPages, onSeenChange, pagesWords,
} from "../../lib/linkedin.js";
import { SignedImage, SignedVideo } from "../Media.jsx";
import { slidesOf } from "../viewers/CarouselViewer.jsx";
import { graphicVariants } from "../viewers/GraphicViewer.jsx";
import { videoAssets } from "../viewers/VideoViewer.jsx";
import { Confirm } from "../Sheet.jsx";
import { Button, Chip, cx } from "../ui.jsx";

/* ------------------------------------------------------------------ draft (survives J/K and reloads, this tab only) */
const key = (post) => `dhiti.li.${post.id}`;
export function readSocialDraft(post) {
  if (!post) return null;
  try { return JSON.parse(sessionStorage.getItem(key(post)) || "null"); } catch { return null; }
}
function writeSocialDraft(post, draft) {
  try { draft ? sessionStorage.setItem(key(post), JSON.stringify(draft)) : sessionStorage.removeItem(key(post)); } catch { /* private */ }
}
/** The values to approve with: the unsaved draft if there is one, else the stored row. */
export function socialValues(post) {
  const d = readSocialDraft(post);
  return { format: d?.format || post.format, caption: d?.caption ?? post.caption, first_comment: d?.first_comment ?? post.first_comment };
}

/* ------------------------------------------------------------------ small pieces */
/** Carousel pages of `item` the owner has not looked at yet in this tab (0-based), live. */
export function useUnseenPages(item) {
  const { assets } = useData();
  const total = item && item.type === "carousel" ? slidesOf(assets, item).length : 0;
  const key = useSyncExternalStore(onSeenChange, () => (item ? unseenPages(item.id, total).join(",") : ""));
  return useMemo(() => (key ? key.split(",").map(Number) : []), [key]);
}

/** One line for an approval that also approves a carousel or graphic: what it approves, and what is not seen yet. */
export function creativeLine(opt, unseen) {
  if (!opt?.item || opt.item.status !== "pending_review") return null;
  const what = FORMAT_LABEL[opt.format].toLowerCase();
  if (unseen.length) return { ok: false, text: `Look at every page of the ${what} first. You have not looked at ${pagesWords(unseen)}.` };
  return { ok: true, text: `This also approves the ${what}. We check facts in the blog only, so check that its numbers match the blog.` };
}

function AutoText({ value, onChange, className, ...rest }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return <textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} className={cx("resize-none overflow-hidden", className)} {...rest} />;
}

function Checks({ list, id }) {
  return (
    <ul id={id} className="mt-2 flex flex-wrap gap-x-4 gap-y-1" aria-live="polite">
      {list.map((c) => (
        <li key={c.id} className={cx("flex items-center gap-1.5 text-[12px] font-medium", c.ok ? "text-ink-mute" : c.tone === "warn" ? "text-warn" : "text-brand-ink")}>
          {c.ok ? <Check className="h-3.5 w-3.5 text-ok" strokeWidth={2.6} /> : c.tone === "warn" ? <AlertTriangle className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" strokeWidth={2.6} />}
          {c.text}
        </li>
      ))}
    </ul>
  );
}

/** Caption text with hashtags in LinkedIn blue. */
function Rich({ text }) {
  const parts = String(text || "").split(/(#[A-Za-z][A-Za-z0-9]*)/g);
  return parts.map((p, i) => (p.startsWith("#") ? <span key={i} className="font-semibold text-info">{p}</span> : <span key={i}>{p}</span>));
}

function PageLogo({ url, size = 48 }) {
  const [bad, setBad] = useState(false);
  const ok = url && !bad && (/^\/(?!\/)/.test(url) || /^https:\/\/media\.licdn\.com\//.test(url));
  return (
    <span className="relative inline-flex shrink-0 overflow-hidden rounded-[6px] bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.08)]" style={{ width: size, height: size }}>
      <img src={ok ? url : "/brand/dhiti-mark.webp"} onError={() => setBad(true)} alt="" className="h-full w-full scale-[1.12] object-cover" draggable={false} referrerPolicy="no-referrer" />
    </span>
  );
}

/* ------------------------------------------------------------------ the feed preview */
export function DocumentPages({ item, title }) {
  const { assets } = useData();
  const slides = slidesOf(assets, item);
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [item.id]);
  const n = Math.min(i, Math.max(0, slides.length - 1));
  useEffect(() => { if (slides.length) markPageSeen(item.id, n); }, [item.id, n, slides.length]);
  if (!slides.length) return <div className="flex aspect-[4/5] items-center justify-center bg-ink/[0.04] text-callout text-ink-mute">No pages yet</div>;
  return (
    <div className="relative bg-[#1d2226]">
      <div className="flex items-center gap-2 bg-black/80 px-3 py-2 text-[12px] font-semibold text-white">
        <FileText className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{title}</span>
        <span className="tnum shrink-0 text-white/70">{slides.length} pages</span>
      </div>
      <div className="relative aspect-[4/5] w-full overflow-hidden">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div key={n} initial={{ opacity: 0.4, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }} className="absolute inset-0">
            <SignedImage path={slides[n].storage_path} alt={`Page ${n + 1} of ${slides.length}`} className="h-full w-full" />
          </motion.div>
        </AnimatePresence>
        <button type="button" onClick={() => setI(Math.max(0, n - 1))} disabled={n === 0} aria-label="Previous page" className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition-opacity disabled:opacity-0">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button type="button" onClick={() => setI(Math.min(slides.length - 1, n + 1))} disabled={n >= slides.length - 1} aria-label="Next page" className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition-opacity disabled:opacity-0">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
      <div className="flex items-center justify-center gap-2 bg-black/80 py-1.5 text-[11.5px] font-semibold text-white/85">
        <span className="tnum">{n + 1} / {slides.length}</span>
      </div>
    </div>
  );
}

function PostMedia({ format, item, title }) {
  const { assets } = useData();
  if (!item) return null;
  if (format === "carousel") return <DocumentPages item={item} title={title} />;
  if (format === "video") {
    const { video, poster } = videoAssets(assets, item);
    if (!video) return null;
    return (
      <div className="flex justify-center bg-black">
        <SignedVideo path={video.storage_path} posterPath={poster?.storage_path} className="aspect-[9/16] max-h-[560px] w-full max-w-[315px]" aria-label="Reel preview" />
      </div>
    );
  }
  const v = graphicVariants(assets, item);
  const a = v.landscape || v.square;
  if (!a) return null;
  return <SignedImage path={a.storage_path} alt="Graphic" className={cx("w-full", a === v.landscape ? "aspect-[1200/627]" : "aspect-square")} />;
}

export function LinkedInPreview({ caption, comment, link, format, item, title, orgName, logoUrl }) {
  const [more, setMore] = useState(false);
  const { head, tail } = useMemo(() => seeMoreCut(caption), [caption]);
  return (
    <div className="mx-auto w-full max-w-[555px] overflow-hidden rounded-[10px] bg-surface-raised text-[14px] leading-[20px] text-ink shadow-[0_0_0_1px_var(--hairline-strong),0_1px_2px_rgb(var(--shadow)/0.06),0_14px_36px_-18px_rgb(var(--shadow)/0.3)] dark:bg-[#1d2226]" data-testid="li-preview">
      <div className="flex items-start gap-2.5 px-4 pb-2 pt-3">
        <PageLogo url={logoUrl} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold leading-[18px] text-ink">{orgName}</div>
          <div className="truncate text-[12px] leading-4 text-ink-mute">Company page</div>
          <div className="flex items-center gap-1 text-[12px] leading-4 text-ink-mute">Now · <Globe2 className="h-3 w-3" aria-label="Public" /></div>
        </div>
      </div>
      <div className="whitespace-pre-wrap break-words px-4 pb-2 text-[14px] leading-[20px] text-ink">
        {caption?.trim() ? (
          <>
            <Rich text={more || !tail ? `${head}${tail}` : head} />
            {tail && !more && <>{/[.!?:]$/.test(head) ? " …" : "…"}<button type="button" onClick={() => setMore(true)} className="ml-1 font-semibold text-ink-mute hover:text-info hover:underline">see more</button></>}
            {tail && more && <button type="button" onClick={() => setMore(false)} className="mt-1 block font-semibold text-ink-mute hover:text-info hover:underline">show less</button>}
          </>
        ) : <span className="text-ink-faint">No text yet</span>}
      </div>
      <PostMedia format={format} item={item} title={title} />
      <div className="mx-4 flex items-center justify-between border-b border-[color:var(--hairline)] py-2 text-[12px] text-ink-mute" aria-hidden>
        <span>Preview</span><span>1 comment</span>
      </div>
      <div className="flex px-2 py-1 text-[13px] font-semibold text-ink-mute" aria-hidden>
        {[[ThumbsUp, "Like"], [MessageCircle, "Comment"], [Repeat2, "Repost"], [Send, "Send"]].map(([I, l]) => (
          <span key={l} className="flex flex-1 items-center justify-center gap-1.5 rounded-md py-2.5"><I className="h-[18px] w-[18px]" strokeWidth={1.9} /><span className="hidden xs:inline">{l}</span></span>
        ))}
      </div>
      <div className="flex gap-2 px-4 pb-4 pt-1" data-testid="li-comment-preview">
        <PageLogo url={logoUrl} size={32} />
        <div className="min-w-0 flex-1 rounded-[10px] rounded-tl-none bg-ink/[0.045] px-3 py-2 dark:bg-white/[0.06]">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[12.5px] font-semibold text-ink">{orgName}</span>
            <span className="rounded-[4px] bg-ink/[0.07] px-1 text-[10.5px] font-semibold text-ink-soft">Author</span>
          </div>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-[18px] text-ink-soft">
            {comment?.trim() || <span className="text-ink-faint">No comment text yet</span>}
            {"\n"}
            <span className="break-all font-semibold text-info">{link || "Blog link added when it goes live"}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ the card in the blog review */
export function LinkedInPostCard({ blog }) {
  const d = useData();
  const post = d.socialByBlog.get(blog.id);
  if (!post) return null;
  return <Card post={post} blog={blog} />;
}

function Card({ post, blog }) {
  const d = useData();
  const conn = d.linkedin;
  const options = useMemo(() => formatOptions(blog, d.items), [blog, d.items]);
  const canEdit = editable(post);
  const stored = { format: post.format, caption: post.caption || "", first_comment: post.first_comment || "" };
  const [draft, setDraft] = useState(() => ({ ...stored, ...(readSocialDraft(post) || {}) }));
  // Another post, or the stored row changed and there is no local edit: start from the stored values.
  useEffect(() => { setDraft({ ...stored, ...(readSocialDraft(post) || {}) }); }, [post.id, post.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = canEdit && (draft.format !== stored.format || draft.caption !== stored.caption || draft.first_comment !== stored.first_comment);
  useEffect(() => { if (canEdit) writeSocialDraft(post, dirty ? draft : null); }, [draft, dirty, canEdit]); // eslint-disable-line react-hooks/exhaustive-deps
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null); // "post" | "cancel"

  const view = canEdit ? draft : stored;
  const opt = options.find((o) => o.format === view.format) || null;
  const recommended = post.recommended_format;
  const cap = captionChecks(view.caption);
  const com = commentChecks(view.first_comment);
  const unseen = useUnseenPages(canEdit && opt?.item?.status === "pending_review" ? opt.item : null);
  const also = canEdit ? creativeLine(opt, unseen) : null;
  const bad = blocking(cap) || blocking(com) || !opt?.ok || (also && !also.ok);
  const status = socialStatus(post, blog);
  const link = commentLink(blog);
  const orgName = conn?.org_name || "Dhiti Services";
  const blogApproved = ["approved", "published"].includes(blog.status);
  const notConnected = !conn || conn.status !== "connected";

  const save = async () => {
    setSaving(true);
    try {
      const patch = {};
      if (draft.format !== stored.format) patch.format = draft.format;
      if (draft.caption !== stored.caption) patch.caption = draft.caption;
      if (draft.first_comment !== stored.first_comment) patch.first_comment = draft.first_comment;
      await d.actions.saveSocial(post, patch);
      writeSocialDraft(post, null);
    } catch { /* toast shown */ } finally { setSaving(false); }
  };
  const approve = async () => {
    setSaving(true);
    try {
      await d.actions.approveSocial(post, { ...draft, creativeId: opt?.item?.id });
      writeSocialDraft(post, null);
    } catch { /* toast shown */ } finally { setSaving(false); }
  };

  let actions = null;
  if (canEdit) {
    actions = (
      <>
        <Button variant="ghost" icon={X} onClick={() => setConfirm("cancel")}>Don't post on LinkedIn</Button>
        <span className="flex-1" />
        {dirty && <Button variant={blogApproved || post.status === "failed" ? "secondary" : "primary"} icon={Check} onClick={save} loading={saving} disabled={blocking(cap) || blocking(com)}>Save changes</Button>}
        {post.status === "failed" ? (
          <Button variant="primary" icon={RotateCcw} onClick={approve} loading={saving} disabled={bad}>Try again</Button>
        ) : post.status === "draft" ? (
          <span className="text-[12.5px] text-ink-mute">Still a draft. It is ready for you soon.</span>
        ) : blogApproved ? (
          <Button variant="primary" icon={Check} onClick={approve} loading={saving} disabled={bad}>Approve LinkedIn post</Button>
        ) : !dirty ? (
          <span className="text-[12.5px] text-ink-mute">You approve this together with the blog.</span>
        ) : null}
      </>
    );
  } else if (post.status === "approved") {
    actions = (
      <>
        <Button variant="ghost" icon={Undo2} onClick={() => d.actions.unapproveSocial(post).catch(() => {})}>Don't post yet</Button>
        <span className="flex-1" />
        {blog.status === "published" && <Button variant="primary" icon={Rocket} onClick={() => setConfirm("post")}>Post now</Button>}
      </>
    );
  } else if (post.status === "published") {
    const href = safeHref(post.post_url);
    actions = (
      <>
        {href && <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-2 rounded-xl px-3.5 text-callout font-semibold text-info transition-colors hover:bg-info/[0.08]"><ExternalLink className="h-4 w-4" /> See it on LinkedIn</a>}
        <span className="flex-1" />
        {post.comment_status === "failed" && <Button variant="primary" icon={RotateCcw} onClick={() => d.actions.retryComment(post)}>Try again</Button>}
      </>
    );
  }

  return (
    <section className="card mt-10 overflow-hidden" aria-labelledby={`li-${post.id}`} data-testid="li-card">
      <div className="relative px-5 pb-4 pt-5 sm:px-6">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-info/[0.06] to-transparent" aria-hidden />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="eyebrow !text-info">LinkedIn post</div>
            <h2 id={`li-${post.id}`} className="mt-1 text-title-2 font-bold text-ink">How it looks on LinkedIn</h2>
          </div>
          <span data-testid="li-status"><Chip tone={status.tone} pulse={status.pulse}>{status.label}</Chip></span>
        </div>
        <p className="relative mt-1.5 text-callout text-ink-mute">{status.text}{post.status === "published" && post.published_at ? ` Posted ${relative(post.published_at)}.` : ""}</p>
        {post.status === "failed" && post.last_error && (
          <div className="relative mt-3 flex items-start gap-2 rounded-xl bg-brand/[0.07] px-3.5 py-2.5 text-[12.5px] font-medium text-brand-deep dark:text-brand-bright" role="alert"><AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />{post.last_error}</div>
        )}
        {post.status === "published" && post.comment_status === "failed" && (
          <div className="relative mt-3 flex items-start gap-2 rounded-xl bg-warn/[0.1] px-3.5 py-2.5 text-[12.5px] font-medium text-warn" role="alert"><AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />{post.last_error || "The comment with the blog link did not go out."} Tap Try again to send it.</div>
        )}
        {notConnected && !["published", "cancelled"].includes(post.status) && (
          <button type="button" onClick={() => navigate("/settings#linkedin")} className="relative mt-3 flex w-full items-center gap-2.5 rounded-xl bg-ink/[0.045] px-3.5 py-2.5 text-left text-[12.5px] font-medium text-ink-soft transition-colors hover:bg-ink/[0.07]">
            <Unplug className="h-4 w-4 shrink-0" /><span className="flex-1">LinkedIn is not connected yet. Approved posts wait until you connect.</span><span className="font-semibold text-brand-ink">Connect</span>
          </button>
        )}
        {!notConnected && conn?.paused && post.status === "approved" && (
          <div className="relative mt-3 flex items-center gap-2.5 rounded-xl bg-ink/[0.045] px-3.5 py-2.5 text-[12.5px] font-medium text-ink-soft"><Pause className="h-4 w-4 shrink-0" />LinkedIn posting is paused in Settings. This waits until you turn it back on.</div>
        )}
      </div>

      <div className="bg-ink/[0.025] px-3 py-6 sm:px-6">
        <LinkedInPreview caption={view.caption} comment={view.first_comment} link={link} format={view.format} item={opt?.item} title={blog.body?.frontmatter?.title || blog.title} orgName={orgName} logoUrl={conn?.org_logo_url} />
      </div>

      <div className="space-y-5 px-5 py-5 sm:px-6">
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span id={`li-fmt-${post.id}`} className="text-callout font-semibold text-ink-soft">Post as</span>
          </div>
          <div role="radiogroup" aria-labelledby={`li-fmt-${post.id}`} className="grid gap-2 sm:grid-cols-3">
            {options.map((o) => {
              const on = view.format === o.format;
              return (
                <button
                  key={o.format}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={!canEdit || !o.ok}
                  onClick={() => setDraft((x) => ({ ...x, format: o.format }))}
                  className={cx(
                    "relative flex flex-col items-start rounded-xl px-3.5 py-2.5 text-left transition-[box-shadow,background-color]",
                    on ? "bg-surface shadow-[0_0_0_1.5px_rgb(var(--brand)/0.75),0_0_0_4px_rgb(var(--brand)/0.1)] dark:bg-surface-raised" : "bg-ink/[0.04] hover:bg-ink/[0.07]",
                    (!canEdit || !o.ok) && !on && "cursor-not-allowed opacity-60 hover:bg-ink/[0.04]",
                  )}
                >
                  <span className="flex w-full items-center gap-1.5">
                    <span className="text-callout font-semibold text-ink">{FORMAT_LABEL[o.format]}</span>
                    {recommended === o.format && <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-ok/10 px-1.5 py-0.5 text-[10.5px] font-semibold text-ok"><Sparkles className="h-2.5 w-2.5" />Best</span>}
                  </span>
                  <span className="mt-0.5 text-[11.5px] text-ink-mute">{o.ok ? FORMAT_HINT[o.format] : o.why}</span>
                </button>
              );
            })}
          </div>
          {recommended && post.recommendation_reason && (
            <p className="mt-2 text-[12.5px] text-ink-mute"><span className="font-semibold text-ink-soft">Why {FORMAT_LABEL[recommended].toLowerCase()} is best: </span>{post.recommendation_reason}</p>
          )}
          {opt && !opt.ok && <p className="mt-2 text-[12.5px] font-medium text-warn">{FORMAT_LABEL[opt.format]}: {opt.why}. Pick another, or wait.</p>}
          {opt?.ok && also && <p className={cx("mt-2 text-[12.5px]", also.ok ? "text-ink-mute" : "font-medium text-warn")} data-testid="li-also">{also.text}</p>}
        </div>

        {canEdit ? (
          <>
            <label className="block">
              <span className="mb-1.5 block text-callout font-semibold text-ink-soft">Post text</span>
              <AutoText rows={6} className="input min-h-[140px] text-[14px] leading-[21px]" value={draft.caption} onChange={(v) => setDraft((x) => ({ ...x, caption: v }))} aria-describedby={`li-cap-checks-${post.id}`} spellCheck />
              <Checks list={cap} id={`li-cap-checks-${post.id}`} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-callout font-semibold text-ink-soft">First comment</span>
              {/* One line of text, but it wraps so the whole line can be read on a phone. Enter never adds a line. */}
              <AutoText rows={1} className="input min-h-[44px] py-[11px] text-[14px] leading-[21px]" value={draft.first_comment} maxLength={320} onChange={(v) => setDraft((x) => ({ ...x, first_comment: v.replace(/\r?\n/g, " ") }))} onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} aria-describedby={`li-com-checks-${post.id}`} data-testid="li-first-comment" />
              <span className="mt-2 flex items-center gap-1.5 text-[12px] text-ink-mute"><Link2 className="h-3.5 w-3.5 shrink-0" /> <span className="shrink-0 whitespace-nowrap">Then the blog link:</span> <span className="min-w-0 truncate font-medium text-info">{link ? link.replace(/^https:\/\//, "") : "added when it goes live"}</span></span>
              <Checks list={com} id={`li-com-checks-${post.id}`} />
            </label>
          </>
        ) : null}

        {actions && <div className="flex flex-wrap items-center gap-2 border-t border-[color:var(--hairline)] pt-4">{actions}</div>}
      </div>

      <Confirm
        open={confirm === "post"}
        onClose={() => setConfirm(null)}
        title="Post on LinkedIn now?"
        description="This will post to LinkedIn now, on the Dhiti Services page, with the blog link in the first comment."
        confirmLabel="Post now"
        onConfirm={() => d.actions.publishSocialNow(post)}
      />
      <Confirm
        open={confirm === "cancel"}
        onClose={() => setConfirm(null)}
        title="Don't post this on LinkedIn?"
        description="The blog still goes live as planned. This LinkedIn post is dropped and can't be brought back here."
        confirmLabel="Don't post"
        tone="danger"
        onConfirm={() => { writeSocialDraft(post, null); return d.actions.cancelSocial(post).catch(() => {}); }}
      />
    </section>
  );
}
