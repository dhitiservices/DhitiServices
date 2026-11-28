import { useMemo } from "react";
import { Segmented, cx } from "./ui.jsx";
import { addDays, dateOnly, formatDate, todayIST } from "../lib/format.js";

/**
 * Publish date and time in IST, in the app's own format (no native US-format datetime picker).
 * value / onChange: "YYYY-MM-DDTHH:MM" read as IST (same as toISTInput / fromISTInput).
 * Days: the next 14 days from today; publish days (settings.publish_days) are marked, the topic's planned day is
 * labelled. Time: 9:00 / 10:00 / 12:00 or Other (hour and minute).
 */
const PRESET_TIMES = ["09:00", "10:00", "12:00"];
const pad = (n) => String(n).padStart(2, "0");
const timeLabel = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  const h12 = h % 12 || 12;
  return `${h12}:${pad(m)} ${h < 12 ? "am" : "pm"}`;
};

export function PublishTimePicker({ value, onChange, publishDays = [], plannedDay, compact = false, idPrefix = "pub", autoFocus = false }) {
  const [day = "", time = "10:00"] = (value || "").split("T");
  const today = todayIST();
  const days = useMemo(() => {
    const list = Array.from({ length: 14 }, (_, i) => addDays(today, i));
    if (day && !list.includes(day)) list.push(day);
    return list.sort();
  }, [today, day]);
  const preset = PRESET_TIMES.includes(time) ? time : "other";
  const [hh, mm] = time.split(":");
  const minutes = useMemo(() => [...new Set(["00", "15", "30", "45", mm].filter(Boolean))].sort(), [mm]);
  const set = (d, t) => onChange(`${d || today}T${t || time}`);

  return (
    <div className={cx("space-y-4", compact && "space-y-3")}>
      <div>
        <div id={`${idPrefix}-day-label`} className="mb-2 flex items-center justify-between text-callout font-semibold text-ink-soft">
          <span>Day</span>
          <span className="flex items-center gap-3 text-[11.5px] font-medium text-ink-mute">
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-ok" aria-hidden /> Go-live day</span>
            {plannedDay && <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden /> Planned</span>}
          </span>
        </div>
        <div className="grid grid-cols-7 gap-1" role="group" aria-labelledby={`${idPrefix}-day-label`}>
          {days.map((d, i) => {
            const date = dateOnly(d);
            const weekday = formatDate(date, { weekday: "long" });
            const isPublish = publishDays.includes(weekday);
            const isPlanned = plannedDay === d;
            const active = d === day;
            const showMonth = i === 0 || d.slice(8) === "01";
            const label = `${formatDate(date, { weekday: "short", day: "numeric", month: "short" })}${d === today ? ", today" : ""}${isPublish ? ", go-live day" : ""}${isPlanned ? ", planned day" : ""}`;
            return (
              <button
                key={d}
                type="button"
                aria-pressed={active}
                aria-label={label}
                data-autofocus={autoFocus && active ? "" : undefined}
                onClick={() => set(d, time)}
                className={cx(
                  "relative flex flex-col items-center rounded-xl pb-1.5 pt-1 transition-colors",
                  compact ? "min-h-[50px]" : "min-h-[58px]",
                  active ? "bg-ink text-canvas shadow-[0_1px_2px_rgb(var(--shadow)/0.2)]" : "text-ink hover:bg-ink/[0.05]",
                )}
              >
                <span className={cx("text-[10px] font-semibold uppercase tracking-[0.04em]", active ? "text-canvas/75" : d === today ? "text-brand-ink" : "text-ink-mute")}>
                  {showMonth ? formatDate(date, { month: "short" }) : formatDate(date, { weekday: "narrow" })}
                </span>
                <span className={cx("tnum font-bold leading-6", compact ? "text-[15px]" : "text-[17px]")}>{Number(d.slice(8))}</span>
                <span className="flex h-3 items-center gap-0.5" aria-hidden>
                  {isPublish && <span className={cx("h-1.5 w-1.5 rounded-full", active ? "bg-canvas" : "bg-ok")} />}
                  {isPlanned && <span className={cx("h-1.5 w-1.5 rounded-full", active ? "bg-canvas/80" : "bg-brand")} />}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-2 text-callout font-semibold text-ink-soft">Time (IST)</div>
        <Segmented
          size="sm"
          className="w-full [&>button]:flex-1 [&>button]:justify-center"
          label="Go-live time (IST)"
          layoutId={`${idPrefix}-time`}
          value={preset}
          onChange={(v) => set(day, v === "other" ? (PRESET_TIMES.includes(time) ? "14:00" : time) : v)}
          options={[...PRESET_TIMES.map((t) => ({ value: t, label: timeLabel(t) })), { value: "other", label: preset === "other" ? timeLabel(time) : "Other" }]}
        />
        {preset === "other" && (
          <div className="mt-2.5 flex items-center gap-2">
            <label className="sr-only" htmlFor={`${idPrefix}-hour`}>Hour (24-hour, IST)</label>
            <select id={`${idPrefix}-hour`} className="input tnum h-10 w-auto flex-1 py-0" value={hh} onChange={(e) => set(day, `${e.target.value}:${mm}`)}>
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={pad(h)}>{timeLabel(`${pad(h)}:00`).replace(":00", "")}</option>)}
            </select>
            <span className="text-ink-mute" aria-hidden>:</span>
            <label className="sr-only" htmlFor={`${idPrefix}-minute`}>Minute</label>
            <select id={`${idPrefix}-minute`} className="input tnum h-10 w-auto flex-1 py-0" value={mm} onChange={(e) => set(day, `${hh}:${e.target.value}`)}>
              {minutes.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
