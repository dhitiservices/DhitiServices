import { CheckCircle2, XCircle, Lightbulb, ShieldCheck, ShieldAlert, ExternalLink, ChevronDown } from "lucide-react";
import { claimSummary, summaryLine, extrasLine, isExample, isAdvice, isDhiti, isNotFact, isChecked, claimDate } from "../../lib/claims.js";
import { formatDate, hostOf } from "../../lib/format.js";
import { safeHref } from "../../lib/safe.js";
import { cx } from "../ui.jsx";

const dateText = (v) => {
  if (!v) return "";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? new Date(`${v}T12:00:00+05:30`) : new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : formatDate(d, { day: "numeric", month: "short", year: "numeric" });
};

/** The line at the top of a blog: green when every fact matches its source, red when any does not. */
export function FactsBanner({ body }) {
  const s = claimSummary(body);
  if (!s) {
    return (
      <div className="mb-6 flex items-start gap-3 rounded-2xl bg-ink/[0.045] p-4" role="note" data-testid="facts-banner">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-ink-mute" />
        <div className="min-w-0 text-callout text-ink-soft"><span className="font-semibold text-ink">No fact list for this blog. </span>Check the sources at the end before you approve.</div>
      </div>
    );
  }
  const good = s.allChecked;
  return (
    <a
      href="#facts"
      onClick={(e) => { e.preventDefault(); document.getElementById("facts")?.scrollIntoView({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); }}
      className={cx(
        "mb-6 flex items-center gap-3 rounded-2xl p-4 transition-colors",
        good ? "bg-ok/[0.08] shadow-[inset_0_0_0_1px_rgb(var(--ok)/0.16)] hover:bg-ok/[0.12]" : "bg-brand/[0.08] shadow-[inset_0_0_0_1px_rgb(var(--brand)/0.22)] hover:bg-brand/[0.11]",
      )}
      role={good ? undefined : "alert"}
      data-testid="facts-banner"
    >
      <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", good ? "bg-ok/[0.14] text-ok" : "bg-brand/[0.14] text-brand-ink")}>
        {good ? <ShieldCheck className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx("block text-callout font-semibold", good ? "text-ok" : "text-brand-ink")}>{summaryLine(s)}</span>
        <span className="block text-[12.5px] text-ink-mute">
          {good ? "Read each quote: does it say the same thing?" : `${s.checked} of ${s.facts} have a quote from the source.`}
          {extrasLine(s) ? ` ${extrasLine(s)}` : ""}
        </span>
      </span>
      <ChevronDown className="h-4 w-4 shrink-0 text-ink-faint" />
    </a>
  );
}

function Quote({ q }) {
  const href = safeHref(q.source_url);
  return (
    <div className="mt-2 first:mt-0">
      {q.quote ? <blockquote className="border-l-2 border-ok/50 pl-3 text-[13.5px] italic leading-[20px] text-ink-soft">“{q.quote}”</blockquote> : <p className="text-[12.5px] text-brand-ink">No quote from the source yet.</p>}
      {href && (
        <a href={href} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-[12.5px] font-semibold text-info hover:underline">
          Open the source <span className="text-ink-faint">({hostOf(href)})</span> <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

function Claim({ c, i }) {
  const example = isExample(c);
  const advice = isAdvice(c);
  const dhiti = isDhiti(c);
  const ok = !isNotFact(c) && isChecked(c);
  const when = dateText(claimDate(c));
  const extra = Array.isArray(c.extra_quotes) ? c.extra_quotes.filter(Boolean) : [];
  return (
    <li className="flex gap-3 py-3.5" data-testid="fact">
      <span className="mt-0.5 shrink-0" aria-hidden>
        {example || advice ? <Lightbulb className="h-5 w-5 text-ink-mute" /> : ok ? <CheckCircle2 className="h-5 w-5 text-ok" /> : <XCircle className="h-5 w-5 text-brand-ink" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] leading-[22px] text-ink">
          <span className="sr-only">{example ? "Example. " : advice ? "Our advice. " : ok ? "Has a quote. " : c.changed ? "Changed after the check. " : "Not checked. "}</span>
          {c.claim_text || <span className="text-ink-faint">No sentence given</span>}
        </p>
        {example || advice ? (
          <p className="mt-1 text-[12.5px] text-ink-mute">
            <span className="mr-1.5 inline-flex rounded-md bg-ink/[0.06] px-1.5 py-0.5 text-[11px] font-semibold text-ink-soft">{example ? "Example" : "Our advice"}</span>
            {example ? "Made-up example, labelled as one in the blog. Not a fact." : c.note || "Our own advice, not a fact."}
          </p>
        ) : dhiti ? (
          <p className="mt-1 text-[12.5px] text-ink-mute">
            {!ok && <span className="mr-1.5 inline-flex rounded-md bg-brand/[0.1] px-1.5 py-0.5 text-[11px] font-semibold text-brand-ink">{c.changed ? "Changed after the check" : "Not checked"}</span>}
            About Dhiti{c.phrase ? `: matches your approved fact “${c.phrase}”` : ""}
          </p>
        ) : (
          <>
            <p className="mt-1 text-[12.5px] text-ink-mute">
              {c.changed && <span className="mr-1.5 inline-flex rounded-md bg-brand/[0.1] px-1.5 py-0.5 text-[11px] font-semibold text-brand-ink">Changed after the check</span>}
              {!ok && !c.changed && <span className="mr-1.5 inline-flex rounded-md bg-brand/[0.1] px-1.5 py-0.5 text-[11px] font-semibold text-brand-ink">Not checked</span>}
              {c.source_title || hostOf(c.source_url) || "No source"}{ok && when ? ` · source read ${when}` : ""}
            </p>
            {(c.quote || c.source_url || extra.length > 0) && (
              <details className="group mt-1.5 [&_summary::-webkit-details-marker]:hidden">
                <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md text-[12.5px] font-semibold text-ink-soft hover:text-ink">
                  <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" /> {c.quote ? "Show the source's words" : "Show the source"}
                </summary>
                <div className="mt-2 rounded-xl bg-ink/[0.035] p-3">
                  <Quote q={c} />
                  {extra.map((q, k) => <Quote key={k} q={q} />)}
                  {c.derived?.arithmetic && <p className="mt-2 text-[12.5px] text-ink-soft"><span className="font-semibold text-ink">How the number was worked out: </span>{c.derived.arithmetic}</p>}
                </div>
              </details>
            )}
          </>
        )}
      </div>
      <span className="tnum shrink-0 pt-0.5 text-[11.5px] text-ink-faint" aria-hidden>{i + 1}</span>
    </li>
  );
}

/** Every claim of the blog with its source and exact quote. Not-checked facts first. */
export function FactsPanel({ body }) {
  const s = claimSummary(body);
  if (!s || !s.total) return null;
  // Not-checked facts first, then checked facts, then examples and advice.
  const order = [...s.unchecked, ...s.list.filter((c) => !isNotFact(c) && !s.unchecked.includes(c)), ...s.list.filter(isNotFact)];
  return (
    <section id="facts" className="card mt-12 scroll-mt-6 overflow-hidden" aria-labelledby="facts-title" data-testid="facts-panel">
      <div className="px-5 pt-5 sm:px-6">
        <div className={cx("eyebrow", s.allChecked ? "!text-ok" : "!text-brand-ink")}>Facts</div>
        <h2 id="facts-title" className="mt-1 text-title-2 font-bold text-ink">{`${s.checked} of ${s.facts} have a quote from the source`}</h2>
        <p className="mt-1 text-callout text-ink-mute">Each fact in the blog, its source, and the words we found there. We checked that the words are in the source. Read each quote: does it say the same thing as the blog? {extrasLine(s)}</p>
      </div>
      <ol className="mt-2 divide-y divide-[color:var(--hairline)] px-5 sm:px-6">
        {order.map((c, i) => <Claim key={c.id || i} c={c} i={i} />)}
      </ol>
    </section>
  );
}
