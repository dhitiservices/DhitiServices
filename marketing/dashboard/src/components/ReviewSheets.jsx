import { useEffect, useRef, useState } from "react";
import { Check, Send } from "lucide-react";
import { Sheet } from "./Sheet.jsx";
import { Button, Kbd, Switch, cx } from "./ui.jsx";
import { socialValues } from "./linkedin/PostCard.jsx";
import { formatOptions, captionChecks, commentChecks, blocking, FORMAT_LABEL } from "../lib/linkedin.js";
import { claimSummary } from "../lib/claims.js";
import { MOD } from "../lib/hotkeys.js";
import { toISTInput, fromISTInput, formatDateTime, addDays, todayIST } from "../lib/format.js";
import { useData } from "../lib/store.jsx";
import { PublishTimePicker } from "./PublishTimePicker.jsx";

function defaultSlot(item, topic) {
  if (item.scheduled_for && new Date(item.scheduled_for) > new Date()) return item.scheduled_for;
  if (topic?.planned_publish_date && topic.planned_publish_date >= todayIST()) return new Date(`${topic.planned_publish_date}T10:00:00+05:30`).toISOString();
  return new Date(`${addDays(todayIST(), 1)}T10:00:00+05:30`).toISOString();
}

/**
 * Approve a blog: the go-live time (IST), one simple LinkedIn question when the blog has a LinkedIn post, and a red
 * check box when any fact is not checked against its source.
 */
export function ApproveSheet({ open, onClose, item, topic, onApprove }) {
  const [value, setValue] = useState("");
  const [postLi, setPostLi] = useState(true);
  const [factsOk, setFactsOk] = useState(false);
  // Reset only when the sheet opens or moves to another item. Polls, focus refetches and realtime events create a
  // new `item` object every few seconds; resetting on those would silently undo the time the owner picked.
  const latest = useRef({ item, topic });
  latest.current = { item, topic };
  useEffect(() => {
    if (open && latest.current.item) setValue(toISTInput(defaultSlot(latest.current.item, latest.current.topic)));
    if (open) { setPostLi(true); setFactsOk(false); }
  }, [open, item?.id]);
  const { settings, socialByBlog, items, linkedin } = useData();
  const iso = fromISTInput(value);
  const past = iso && new Date(iso) < new Date(Date.now() - 60000);

  // LinkedIn: only a post that is waiting for review can be approved here (LINKEDIN.md 2.4 guard).
  const post = item ? socialByBlog.get(item.id) : null;
  const askLi = post && post.status === "pending_review";
  const values = askLi ? socialValues(post) : null;
  const opt = askLi ? formatOptions(item, items).find((o) => o.format === values.format) : null;
  const liBlocked = askLi && (!opt?.ok || blocking(captionChecks(values.caption)) || blocking(commentChecks(values.first_comment)));
  const facts = claimSummary(item?.body);
  const factsBad = facts && !facts.allChecked;
  const canSubmit = !!iso && (!factsBad || factsOk);

  const submit = () => {
    if (!canSubmit) return;
    onApprove(iso, askLi && postLi && !liBlocked ? { post, ...values } : null);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Approve this blog"
      description="Pick when it goes live on dhitiservices.com."
      width={480}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Check} onClick={submit} disabled={!canSubmit} kbd="↵">{factsBad ? "Approve anyway" : "Approve"}</Button>
        </>
      }
    >
      {/* Enter approves from anywhere in the sheet (the footer shows ↵); Space picks a day or time. */}
      <form
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        onKeyDown={(e) => { if (e.key === "Enter" && !["SELECT", "BUTTON", "INPUT"].includes(e.target.tagName) && canSubmit) { e.preventDefault(); submit(); } }}
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
          {iso ? (past ? "That time has passed, so it goes live in about 30 minutes." : <>Goes live <span className="font-semibold text-ink">{formatDateTime(iso)} IST</span>.</>) : "Pick a day and time."}
        </div>

        {askLi && (
          <div className="mt-4 rounded-2xl bg-surface p-4 shadow-[0_0_0_1px_var(--hairline-strong)]" data-testid="approve-linkedin">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div id="approve-li-q" className="text-body font-semibold text-ink">Also post on LinkedIn after the blog is live?</div>
                <div className="mt-0.5 text-[12.5px] text-ink-mute">
                  {liBlocked
                    ? (opt && !opt.ok ? `The ${FORMAT_LABEL[values.format].toLowerCase()} can't be posted yet: ${opt.why.toLowerCase()}.` : "Fix the LinkedIn post text first (see the LinkedIn card).")
                    : `As a ${FORMAT_LABEL[values.format].toLowerCase()}, with the blog link in the first comment.${opt?.item?.status === "pending_review" ? ` This also approves the ${FORMAT_LABEL[values.format].toLowerCase()}.` : ""}`}
                </div>
              </div>
              <Switch checked={postLi && !liBlocked} onChange={(v) => !liBlocked && setPostLi(v)} label="Also post on LinkedIn after the blog is live" />
            </div>
            {postLi && !liBlocked && linkedin?.status !== "connected" && (
              <div className="mt-3 rounded-xl bg-ink/[0.045] px-3 py-2 text-[12.5px] text-ink-soft">LinkedIn is not connected yet. The post waits until you connect it in Settings.</div>
            )}
          </div>
        )}

        {factsBad && (
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl bg-brand/[0.07] p-4 shadow-[inset_0_0_0_1px_rgb(var(--brand)/0.2)]" data-testid="approve-facts">
            <input type="checkbox" checked={factsOk} onChange={(e) => setFactsOk(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#C20600]" />
            <span className="min-w-0 text-callout text-ink-soft">
              <span className="block font-semibold text-brand-ink">{facts.unchecked.length === 1 ? "1 fact is not checked" : `${facts.unchecked.length} facts are not checked`}</span>
              I checked {facts.unchecked.length === 1 ? "it" : "them"} myself and {facts.unchecked.length === 1 ? "it is" : "they are"} right.
            </span>
          </label>
        )}
        <button type="submit" className="hidden" />
      </form>
    </Sheet>
  );
}

const SUGGESTIONS = [
  "Make the opening more specific",
  "Make it shorter",
  "Use a different photo",
  "Make the claims softer",
  "Add a real source",
  "Make the title more specific",
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
      title="Ask for changes"
      description="Say what to change. We fix it and send it back to you, usually within a day."
      width={540}
      footer={
        <>
          <span className="mr-auto hidden items-center gap-1 text-[12px] text-ink-mute sm:flex"><Kbd>{MOD}</Kbd><Kbd>↵</Kbd> to send</span>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="dark" icon={Send} onClick={submit} disabled={!ok} loading={busy}>Send</Button>
        </>
      }
    >
      <textarea
        data-autofocus
        aria-label="What should change"
        rows={6}
        className="input min-h-[150px] resize-y leading-[22px]"
        placeholder="What should change? For example: start with a real story, and add one more source."
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
      title="I posted it"
      description="If you like, paste the link to the post so you can find it later."
      width={460}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Check} disabled={!valid} onClick={() => { onSubmit(url); onClose(); }}>Done</Button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); if (valid) { onSubmit(url); onClose(); } }}>
        <input data-autofocus aria-label="Link to the post" type="url" inputMode="url" placeholder="https://www.linkedin.com/posts/…" className="input h-11" value={url} onChange={(e) => setUrl(e.target.value)} />
        {!valid && <div className="mt-2 text-[12.5px] font-medium text-brand-ink">Enter a full link starting with https://</div>}
        <div className="mt-3 text-[12.5px] text-ink-mute">{item?.title}</div>
      </form>
    </Sheet>
  );
}
