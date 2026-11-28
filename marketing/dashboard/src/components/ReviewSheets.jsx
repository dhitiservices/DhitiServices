import { useEffect, useRef, useState } from "react";
import { Check, Send } from "lucide-react";
import { Sheet } from "./Sheet.jsx";
import { Button, Kbd, cx } from "./ui.jsx";
import { MOD } from "../lib/hotkeys.js";
import { toISTInput, fromISTInput, formatDateTime, addDays, todayIST } from "../lib/format.js";
import { useData } from "../lib/store.jsx";
import { PublishTimePicker } from "./PublishTimePicker.jsx";

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
  const { settings } = useData();
  const iso = fromISTInput(value);
  const past = iso && new Date(iso) < new Date(Date.now() - 60000);

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
      {/* Enter approves from anywhere in the sheet (the footer shows ↵); Space picks a day or time. */}
      <form
        onSubmit={(e) => { e.preventDefault(); if (iso) submit(); }}
        onKeyDown={(e) => { if (e.key === "Enter" && e.target.tagName !== "SELECT" && iso) { e.preventDefault(); submit(); } }}
      >
        <PublishTimePicker
          value={value}
          onChange={setValue}
          publishDays={settings?.publish_days || []}
          plannedDay={topic?.planned_publish_date}
          idPrefix="approve"
          autoFocus
        />
        <div className={cx("mt-4 rounded-xl px-3.5 py-3 text-callout", past ? "bg-warn/10 text-warn" : "bg-ink/[0.04] text-ink-soft")}>
          {iso ? (past ? "That time has passed, so it publishes on the next publisher run." : <>Goes live <span className="font-semibold text-ink">{formatDateTime(iso)} IST</span>.</>) : "Pick a day and time."}
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
