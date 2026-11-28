import { TYPE_META, ITEM_STATUS, thumbOf, byType } from "../lib/model.js";
import { useData } from "../lib/store.jsx";
import { SignedImage } from "./Media.jsx";
import { cx } from "./ui.jsx";

const DOT = { brand: "bg-brand", ok: "bg-ok", warn: "bg-warn", danger: "bg-brand-deep", info: "bg-info", violet: "bg-violet", neutral: "bg-ink-faint" };
export const statusDot = (status) => DOT[ITEM_STATUS[status]?.tone || "neutral"];

export function TypeIcon({ type, className = "h-7 w-7", iconClass = "h-3.5 w-3.5" }) {
  const Icon = TYPE_META[type]?.icon;
  return (
    <span className={cx("inline-flex shrink-0 items-center justify-center rounded-lg bg-ink/[0.05] text-ink-soft", className)}>
      {Icon && <Icon className={iconClass} strokeWidth={2} />}
    </span>
  );
}

/** Thumbnail with the right aspect for the item type. */
export function ItemThumb({ item, className }) {
  const { assets } = useData();
  const a = thumbOf(assets, item);
  const Icon = TYPE_META[item.type]?.icon;
  return (
    <div className={cx("relative shrink-0 overflow-hidden rounded-[10px] bg-ink/[0.05] shadow-[inset_0_0_0_1px_var(--hairline)]", className)}>
      {a ? <SignedImage path={a.storage_path} className="absolute inset-0" /> : (
        <div className="absolute inset-0 flex items-center justify-center text-ink-faint">{Icon && <Icon className="h-4 w-4" />}</div>
      )}
      <div className="pointer-events-none absolute inset-0 rounded-[10px] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.06)]" />
    </div>
  );
}

/** One chip per derived item (blog, carousel, graphics, reel) with a status dot. */
export function ContentChips({ items, onOpen, size = "md", compact = false }) {
  const sorted = [...items].sort(byType);
  if (!sorted.length) return <span className="text-[12px] text-ink-faint">No content yet</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {sorted.map((i) => {
        const Icon = TYPE_META[i.type]?.icon;
        return (
          <button
            key={i.id}
            onClick={(e) => { e.stopPropagation(); onOpen?.(i); }}
            title={`${TYPE_META[i.type]?.label}: ${ITEM_STATUS[i.status]?.label || i.status}`}
            className={cx(
              "inline-flex items-center gap-1.5 rounded-full bg-surface font-medium text-ink-soft shadow-[0_0_0_1px_var(--hairline)] transition-colors hover:bg-surface-sunken",
              size === "sm" ? "h-6 px-2 text-[11.5px]" : "h-7 px-2.5 text-[12.5px]",
            )}
          >
            <span className={cx("h-1.5 w-1.5 rounded-full", statusDot(i.status))} />
            {Icon && <Icon className="h-3 w-3 text-ink-mute" strokeWidth={2.2} />}
            {!compact && TYPE_META[i.type]?.label}
          </button>
        );
      })}
    </div>
  );
}
