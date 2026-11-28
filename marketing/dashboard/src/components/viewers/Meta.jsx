import { Linkedin } from "lucide-react";
import { useData } from "../../lib/store.jsx";
import { navigate } from "../../lib/router.jsx";
import { autoPostOf, autoPostWords } from "../../lib/linkedin.js";
import { cx } from "../ui.jsx";

/** `aside`: a right-aligned value next to the title, in normal case (durations like "28 s" must not become "28 S"). */
export function MetaSection({ title, aside, children, className }) {
  return (
    <section className={cx("px-5 py-4 [&+&]:border-t [&+&]:border-[color:var(--hairline)]", className)}>
      {title && (
        <div className="mb-2.5 flex items-baseline justify-between gap-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">{title}</h3>
          {aside && <span className="tnum shrink-0 text-[11.5px] font-medium text-ink-mute">{aside}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

export function MetaRow({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1 text-callout">
      <span className="shrink-0 text-ink-mute">{label}</span>
      <span className="min-w-0 truncate text-right font-medium text-ink">{children || <span className="text-ink-faint">—</span>}</span>
    </div>
  );
}

export function CaptionBox({ text, className }) {
  return (
    <div className={cx("max-h-[260px] overflow-y-auto whitespace-pre-wrap rounded-xl bg-ink/[0.035] p-3 text-[13px] leading-[19px] text-ink-soft", className)}>
      {text || <span className="text-ink-faint">No caption</span>}
    </div>
  );
}

export function Hashtags({ tags = [] }) {
  if (!tags.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {tags.map((t) => (
        <span key={t} className="rounded-md bg-info/[0.08] px-1.5 py-0.5 text-[11.5px] font-medium text-info">#{t.replace(/^#/, "")}</span>
      ))}
    </div>
  );
}

/** The blog's LinkedIn post when it posts this creative by itself (see lib/linkedin.js autoPostOf), else null. */
export function useAutoPost(item) {
  const { socialByBlog, items } = useData();
  return autoPostOf(item, socialByBlog, items);
}

/** In place of a LinkedIn caption: the creative posts by itself, with the blog's LinkedIn post text. */
export function AutoPostNote({ item, post }) {
  const { itemById } = useData();
  const blog = itemById.get(item.parent_id);
  return (
    <MetaSection title="LinkedIn">
      <div className="rounded-xl bg-info/[0.07] px-3 py-2.5 text-[12.5px] text-ink-soft" data-testid="auto-post-note">
        <div className="flex items-start gap-1.5 font-semibold text-ink"><Linkedin className="mt-px h-3.5 w-3.5 shrink-0 text-info" />{autoPostWords(post)}.</div>
        <div className="mt-0.5">Its text is in the blog's LinkedIn post. Don't post it on LinkedIn by hand.</div>
        {blog && <button type="button" onClick={() => navigate(`/review/${blog.id}?filter=all`)} className="mt-1.5 font-semibold text-info hover:underline">Open the blog's LinkedIn post</button>}
      </div>
    </MetaSection>
  );
}
