import { useEffect, useRef, useState } from "react";
import { CalendarClock, Check, Send } from "lucide-react";
import { Sheet } from "./Sheet.jsx";
import { Button, Kbd, cx } from "./ui.jsx";
import { MOD } from "../lib/hotkeys.js";
import { toISTInput, fromISTInput, formatDateTime, dateOnly, addDays, todayIST } from "../lib/format.js";

function defaultSlot(item, topic) {
  if (item.scheduled_for && new Date(item.scheduled_for) > new Date()) return item.scheduled_for;
  if (topic?.planned_publish_date && topic.planned_publish_date >= todayIST()) return new Date(`${topic.planned_publish_date}T10:00:00+05:30`).toISOString();
  return new Date(`${addDays(todayIST(), 1)}T10:00:00+05:30`).toISOString();
}

/** Approve a blog with an optional publish datetime (IST). */
export function ApproveSheet({ open, onClose, item, topic, onApprove }) {
  const [value, setValue] = useState("");
  // Reset only when the sheet opens or moves to another item. Polls, focus refetches and realtime events create a
  // new `item` object every few seconds; resetting on those would silently undo the time the owner picked.
  const latest = useRef({ item, topic });
  latest.current = { item, topic };
  useEffect(() => {
    if (open && latest.current.item) setValue(toISTInput(defaultSlot(latest.current.item, latest.current.topic)));
  }, [open, item?.id]);
  const iso = fromISTInput(value);
  const past = iso && new Date(iso) < new Date(Date.now() - 60000);
  const presets = [
    topic?.planned_publish_date && { label: "Planned slot", v: `${topic.planned_publish_date}T10:00` },
    { label: "Tomorrow 10:00", v: `${addDays(todayIST(), 1)}T10:00` },
    { label: "Next Monday", v: (() => { const t = new Date(dateOnly(todayIST())); const add = ((8 - t.getUTCDay()) % 7) || 7; return `${addDays(todayIST(), add)}T10:00`; })() },
  ].filter(Boolean);

  const submit = () => { onApprove(iso); onClose(); };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Approve and schedule"
      description="The publisher commits the post to dhitiservices.com at this time. It checks every 30 minutes."
      width={460}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Check} onClick={submit} disabled={!iso} kbd="↵">Approve</Button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <label className="block">
          <span className="mb-1.5 flex items-center gap-1.5 text-callout font-semibold text-ink-soft"><CalendarClock className="h-4 w-4" /> Publish at (IST)</span>
          <input data-autofocus type="datetime-local" className="input tnum h-11" value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button type="button" key={p.label} onClick={() => setValue(p.v)} className={cx("h-7 rounded-full px-3 text-[12.5px] font-semibold transition-colors", value === p.v ? "bg-ink text-canvas" : "bg-ink/[0.05] text-ink-soft hover:bg-ink/[0.09]")}>
              {p.label}
            </button>
          ))}
        </div>
        <div className={cx("mt-4 rounded-xl px-3.5 py-3 text-callout", past ? "bg-warn/10 text-warn" : "bg-ink/[0.04] text-ink-soft")}>
          {iso ? (past ? "That time has passed, so it publishes on the next publisher run." : `Goes live ${formatDateTime(iso)} IST.`) : "Pick a date and time."}
        </div>
        <button type="submit" className="hidden" />
      </form>
    </Sheet>
  );
}

const SUGGESTIONS = [
  "Make the opening more specific",
  "Tighten it: cut 20%",
  "Use a different photo",
  "Tone down the claims",
  "Add a real external source",
  "Headline is too generic",
];

export function ChangesSheet({ open, onClose, item, onSubmit }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  // Same rule as ApproveSheet: a refetch must never wipe feedback that is being typed.
  const feedbackRef = useRef(item?.feedback);
  feedbackRef.current = item?.feedback;
  useEffect(() => { if (open) setText(feedbackRef.current || ""); }, [open, item?.id]);
  const ok = text.trim().length >= 3;
  const submit = async () => {
    if (!ok || busy) return;
    setBusy(true);
    try { await onSubmit(text); onClose(); } finally { setBusy(false); }
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Request changes"
      description="Be specific. The revision run rewrites this piece with your notes and sends it back for review."
      width={540}
      footer={
        <>
          <span className="mr-auto hidden items-center gap-1 text-[12px] text-ink-mute sm:flex"><Kbd>{MOD}</Kbd><Kbd>↵</Kbd> to send</span>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="dark" icon={Send} onClick={submit} disabled={!ok} loading={busy}>Send feedback</Button>
        </>
      }
    >
      <textarea
        data-autofocus
        rows={6}
        className="input min-h-[150px] resize-y leading-[22px]"
        placeholder="What should change? e.g. Open with the Friday-evening ADM scenario and cite IATA's BSP page."
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); submit(); } }}
      />
      <div className="mt-3 flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setText((t) => (t.trim() ? `${t.trim()}\n${s}.` : `${s}.`))}
            className="h-7 rounded-full bg-ink/[0.05] px-3 text-[12.5px] font-medium text-ink-soft transition-colors hover:bg-ink/[0.09] hover:text-ink"
          >
            + {s}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

export function PostedSheet({ open, onClose, item, onSubmit }) {
  const [url, setUrl] = useState("");
  useEffect(() => { if (open) setUrl(""); }, [open]);
  const valid = !url.trim() || /^https?:\/\/\S+$/i.test(url.trim());
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Mark as posted"
      description="Optional: paste the link to the live post so the team can find it later."
      width={460}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Check} disabled={!valid} onClick={() => { onSubmit(url); onClose(); }}>Mark as posted</Button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); if (valid) { onSubmit(url); onClose(); } }}>
        <input data-autofocus type="url" inputMode="url" placeholder="https://www.linkedin.com/posts/…" className="input h-11" value={url} onChange={(e) => setUrl(e.target.value)} />
        {!valid && <div className="mt-2 text-[12.5px] font-medium text-brand-ink">Enter a full link starting with https://</div>}
        <div className="mt-3 text-[12.5px] text-ink-mute">{item?.title}</div>
      </form>
    </Sheet>
  );
}
