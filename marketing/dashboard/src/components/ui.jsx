import { forwardRef, useId, useState } from "react";
import { motion } from "framer-motion";
import { Check, Copy, Minus, Plus } from "lucide-react";
import { spring, snappy } from "../lib/motion.js";
import { copyText } from "../lib/media.js";

export const cx = (...a) => a.filter(Boolean).join(" ");

/* ---------------------------------------------------------------- Button */
const VARIANTS = {
  primary:
    "text-white bg-gradient-to-b from-[#E30700] to-[#C20600] shadow-glow hover:from-[#EE0800] hover:to-[#CC0700] active:from-[#C20600] active:to-[#A80500] disabled:opacity-50",
  dark: "text-white bg-ink dark:text-[#161110] hover:bg-ink/90 shadow-[0_1px_2px_rgb(0_0_0/0.2),0_4px_12px_-4px_rgb(0_0_0/0.3)] disabled:opacity-50",
  secondary:
    "text-ink bg-surface shadow-[0_0_0_1px_var(--hairline-strong),0_1px_2px_rgb(var(--shadow)/0.06)] hover:bg-surface-sunken disabled:opacity-50",
  ghost: "text-ink-soft hover:text-ink hover:bg-ink/[0.05] disabled:opacity-40",
  tinted: "text-brand-ink bg-brand/[0.09] hover:bg-brand/[0.14] disabled:opacity-50",
  danger: "text-brand-ink bg-surface shadow-[0_0_0_1px_var(--hairline-strong)] hover:bg-brand/[0.06] disabled:opacity-50",
};
const SIZES = {
  sm: "h-8 px-3 text-callout gap-1.5 rounded-[10px]",
  md: "h-9 px-3.5 text-callout gap-2 rounded-xl",
  lg: "h-11 px-5 text-body gap-2 rounded-xl",
};

export const Button = forwardRef(function Button(
  { variant = "secondary", size = "md", icon: Icon, iconRight: IconRight, className, children, loading, kbd, ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      whileTap={rest.disabled ? undefined : { scale: 0.97 }}
      transition={snappy}
      className={cx(
        "relative inline-flex select-none items-center justify-center whitespace-nowrap font-semibold transition-[background-color,box-shadow,color,opacity] duration-150 disabled:cursor-not-allowed",
        VARIANTS[variant], SIZES[size], className,
      )}
      {...rest}
    >
      {loading ? <Spinner className={size === "lg" ? "h-4 w-4" : "h-3.5 w-3.5"} /> : Icon && <Icon className={size === "lg" ? "h-[18px] w-[18px]" : "h-4 w-4"} strokeWidth={2.1} />}
      {children}
      {IconRight && <IconRight className="h-4 w-4 opacity-70" strokeWidth={2.1} />}
      {kbd && <Kbd className="ml-1 hidden sm:inline-flex" inverted={variant === "primary" || variant === "dark"}>{kbd}</Kbd>}
    </motion.button>
  );
});

export function IconButton({ icon: Icon, label, className, size = "md", active, ...rest }) {
  return (
    <motion.button
      whileTap={{ scale: 0.92 }}
      transition={snappy}
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-xl text-ink-mute transition-colors hover:bg-ink/[0.06] hover:text-ink disabled:opacity-40",
        size === "sm" ? "h-8 w-8" : "h-9 w-9",
        active && "bg-ink/[0.06] text-ink",
        className,
      )}
      {...rest}
    >
      <Icon className={size === "sm" ? "h-4 w-4" : "h-[18px] w-[18px]"} strokeWidth={2} />
    </motion.button>
  );
}

export function Spinner({ className = "h-4 w-4" }) {
  return (
    <svg className={cx("animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Kbd({ children, className, inverted }) {
  return (
    <kbd
      className={cx(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] px-1 text-[10.5px] font-semibold leading-none tracking-normal",
        inverted ? "bg-white/20 text-white/90" : "bg-ink/[0.06] text-ink-mute shadow-[inset_0_-1px_0_rgb(var(--ink)/0.08)]",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/* ---------------------------------------------------------------- Status chip */
const TONES = {
  brand: "bg-brand/[0.09] text-brand-ink dark:bg-brand/[0.16]",
  ok: "bg-ok/[0.1] text-ok dark:bg-ok/[0.16]",
  warn: "bg-warn/[0.12] text-warn dark:bg-warn/[0.16]",
  danger: "bg-brand/[0.1] text-brand-deep dark:text-brand-bright",
  info: "bg-info/[0.1] text-info dark:bg-info/[0.16]",
  // In progress: neutral ink with a live red dot (one accent family, no extra hue).
  active: "bg-ink/[0.07] text-ink-soft",
  neutral: "bg-ink/[0.06] text-ink-mute",
};
const DOT = { brand: "bg-brand", ok: "bg-ok", warn: "bg-warn", danger: "bg-brand-deep", info: "bg-info", active: "bg-brand", neutral: "bg-ink-faint" };

export function Chip({ tone = "neutral", pulse, children, className, dot = true, size = "md" }) {
  return (
    <span className={cx(
      "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full font-semibold",
      size === "sm" ? "h-5 px-2 text-[11px]" : "h-6 px-2.5 text-[12px]",
      TONES[tone], className,
    )}>
      {dot && (
        <span className="relative flex h-1.5 w-1.5">
          {pulse && <span className={cx("absolute inset-0 animate-ping rounded-full opacity-60 motion-reduce:hidden", DOT[tone])} />}
          <span className={cx("relative h-1.5 w-1.5 rounded-full", DOT[tone])} />
        </span>
      )}
      {children}
    </span>
  );
}

export function StatusChip({ map, status, size }) {
  const m = map[status] || { label: status || "Unknown", tone: "neutral" };
  return <Chip tone={m.tone} pulse={m.pulse} size={size}>{m.label}</Chip>;
}

/* ---------------------------------------------------------------- Skeleton */
export function Skeleton({ className, style }) {
  return <div className={cx("skeleton", className)} style={style} aria-hidden />;
}

/* ---------------------------------------------------------------- Empty state */
export function EmptyState({ icon: Icon, title, children, action, className, tone = "neutral" }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className={cx("flex flex-col items-center px-6 py-14 text-center", className)}
    >
      {Icon && (
        <div className={cx(
          "relative mb-5 flex h-14 w-14 items-center justify-center rounded-2xl",
          tone === "brand" ? "bg-gradient-to-b from-brand/15 to-brand/5 text-brand-ink" : "bg-gradient-to-b from-ink/[0.07] to-ink/[0.03] text-ink-soft",
        )}>
          <Icon className="h-6 w-6" strokeWidth={1.8} />
          <div className="absolute inset-0 rounded-2xl shadow-[inset_0_0_0_1px_var(--hairline)]" />
        </div>
      )}
      <div className="text-headline font-semibold text-ink">{title}</div>
      {children && <div className="mt-1.5 max-w-sm text-body text-ink-mute">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </motion.div>
  );
}

/* ---------------------------------------------------------------- Segmented control (shared layout pill) */
export function Segmented({ value, onChange, options, className, size = "md", layoutId, label }) {
  const id = useId();
  // A single-choice control: radiogroup semantics with roving focus (arrow keys move and select).
  const onKeyDown = (e) => {
    const i = options.findIndex((o) => o.value === value);
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = options[(i + step + options.length) % options.length];
    onChange(next.value);
    requestAnimationFrame(() => e.currentTarget?.querySelector('[aria-checked="true"]')?.focus());
  };
  return (
    <div className={cx("inline-flex rounded-[11px] bg-ink/[0.055] p-[3px]", className)} role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.label ? undefined : o.ariaLabel || o.title || String(o.value)}
            title={o.label ? undefined : o.ariaLabel || o.title}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cx(
              "relative flex items-center gap-1.5 whitespace-nowrap rounded-[8px] font-semibold transition-colors",
              size === "sm" ? "h-7 px-2.5 text-[12.5px]" : "h-8 px-3 text-callout",
              active ? "text-ink" : "text-ink-mute hover:text-ink-soft",
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId || `seg-${id}`}
                transition={spring}
                className="absolute inset-0 rounded-[8px] bg-surface-raised shadow-[0_0_0_0.5px_rgb(0_0_0/0.06),0_1px_3px_rgb(0_0_0/0.1),0_2px_6px_-2px_rgb(0_0_0/0.06)] dark:bg-[#3b3331]"
              />
            )}
            <span className="relative z-[1] flex items-center gap-1.5">
              {o.icon && <o.icon className="h-3.5 w-3.5" strokeWidth={2.2} />}
              {o.label}
              {o.count != null && o.count > 0 && <span className={cx("tnum text-[11px]", active ? "text-ink-mute" : "text-ink-faint")}>{o.count}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- Card + section */
export function Card({ className, children, as: As = "div", ...rest }) {
  return <As className={cx("card", className)} {...rest}>{children}</As>;
}

export function SectionTitle({ children, action, className }) {
  return (
    <div className={cx("mb-3 flex items-end justify-between gap-3", className)}>
      <h2 className="text-headline font-semibold text-ink">{children}</h2>
      {action}
    </div>
  );
}

/* ---------------------------------------------------------------- Form */
/**
 * Labelled form row. Wraps a single control in <label> by default; pass as="div" for composite controls (token
 * inputs, button groups), which would otherwise turn a click on the label into a click on their first button.
 */
export function Field({ label, hint, counter, children, className, as = "label" }) {
  const id = useId();
  const Tag = as === "div" ? "div" : "label";
  return (
    <Tag className={cx("block", className)} {...(Tag === "div" ? { role: "group", "aria-labelledby": `${id}-l` } : {})}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span id={`${id}-l`} className="text-callout font-semibold text-ink-soft">{label}</span>
        {counter}
      </div>
      {children}
      {hint && <div className="mt-1.5 text-[12.5px] leading-[17px] text-ink-mute">{hint}</div>}
    </Tag>
  );
}

export function Counter({ value, max }) {
  const n = value?.length || 0;
  const over = n > max;
  const near = !over && n > max * 0.9;
  return (
    <span className={cx("tnum text-[12px] font-semibold transition-colors", over ? "text-brand-ink" : near ? "text-warn" : "text-ink-faint")}>
      {n}/{max}
    </span>
  );
}

export function Switch({ checked, onChange, label }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx("relative h-[26px] w-[44px] shrink-0 rounded-full p-[2px] transition-colors duration-200", checked ? "bg-ok" : "bg-ink/[0.16]")}
    >
      <motion.span
        layout
        transition={spring}
        className={cx("block h-[22px] w-[22px] rounded-full bg-white shadow-[0_2px_4px_rgb(0_0_0/0.2),0_0_0_0.5px_rgb(0_0_0/0.04)]", checked && "ml-auto")}
      />
    </button>
  );
}

export function Stepper({ value, onChange, min = 0, max = 10, label = "" }) {
  return (
    <div className="inline-flex h-9 items-center rounded-xl bg-surface shadow-[0_0_0_1px_var(--hairline-strong)]">
      <button className="flex h-full w-9 items-center justify-center rounded-l-xl text-ink-mute transition-colors hover:bg-ink/[0.04] hover:text-ink disabled:opacity-30" disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} aria-label={`Decrease ${label}`.trim()}><Minus className="h-3.5 w-3.5" strokeWidth={2.4} /></button>
      <motion.span key={value} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="tnum w-8 text-center text-body font-semibold">{value}</motion.span>
      <button className="flex h-full w-9 items-center justify-center rounded-r-xl text-ink-mute transition-colors hover:bg-ink/[0.04] hover:text-ink disabled:opacity-30" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} aria-label={`Increase ${label}`.trim()}><Plus className="h-3.5 w-3.5" strokeWidth={2.4} /></button>
    </div>
  );
}

/* ---------------------------------------------------------------- Copy button */
export function CopyButton({ text, label = "Copy", copiedLabel = "Copied", variant = "secondary", size = "sm", className }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      icon={done ? Check : Copy}
      disabled={!text}
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        }
      }}
    >
      {done ? copiedLabel : label}
    </Button>
  );
}

export function Avatar({ email = "", size = 28 }) {
  const initial = (email[0] || "D").toUpperCase();
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#FF5A3C] to-[#C20600] font-semibold text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.2)]"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initial}
    </span>
  );
}

export function Logo({ className = "h-6" }) {
  return (
    <>
      <img src="/brand/dhiti-logo.webp" alt="Dhiti" className={cx(className, "w-auto dark:hidden")} draggable={false} />
      <img src="/brand/dhiti-logo-dark.webp" alt="Dhiti" className={cx(className, "hidden w-auto dark:block")} draggable={false} />
    </>
  );
}

export function AppMark({ size = 32, className }) {
  return (
    <span className={cx("relative inline-flex shrink-0 overflow-hidden bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_1px_2px_rgb(0_0_0/0.08)]", className)} style={{ width: size, height: size, borderRadius: size * 0.26 }}>
      <img src="/brand/dhiti-mark.webp" alt="" className="h-full w-full scale-[1.12] object-cover" draggable={false} />
    </span>
  );
}
