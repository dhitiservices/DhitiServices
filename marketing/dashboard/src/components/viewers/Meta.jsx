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
