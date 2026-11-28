import { CheckCircle2, XCircle, Lightbulb, ShieldCheck, ShieldAlert, ExternalLink, ChevronDown } from "lucide-react";
import { claimSummary, summaryLine, isExample, claimDate } from "../../lib/claims.js";
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
          {good ? "Each one has the exact words from its source." : `${s.checked} of ${s.facts} checked.`}
          {s.examples ? ` ${s.examples === 1 ? "1 example is" : `${s.examples} examples are`} labelled as examples.` : ""}
        </span>
      </span>
      <ChevronDown className="h-4 w-4 shrink-0 text-ink-faint" />
    </a>
  );
}

function Claim({ c, i }) {
  const example = isExample(c);
  const ok = !example && c.verified === true && c.source_url && String(c.quote || "").trim();
  const href = safeHref(c.source_url);
  const when = dateText(claimDate(c));
  return (
    <li className="flex gap-3 py-3.5" data-testid="fact">
      <span className="mt-0.5 shrink-0" aria-hidden>
        {example ? <Lightbulb className="h-5 w-5 text-ink-mute" /> : ok ? <CheckCircle2 className="h-5 w-5 text-ok" /> : <XCircle className="h-5 w-5 text-brand-ink" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] leading-[22px] text-ink">
          <span className="sr-only">{example ? "Example. " : ok ? "Checked. " : "Not checked. "}</span>
          {c.claim_text || <span className="text-ink-faint">No sentence given</span>}
        </p>
        {example ? (
          <p className="mt-1 text-[12.5px] text-ink-mute"><span className="mr-1.5 inline-flex rounded-md bg-ink/[0.06] px-1.5 py-0.5 text-[11px] font-semibold text-ink-soft">Example</span>Made-up example, labelled as one in the blog. Not a fact.</p>
        ) : (
          <>
            <p className="mt-1 text-[12.5px] text-ink-mute">
              {!ok && <span className="mr-1.5 inline-flex rounded-md bg-brand/[0.1] px-1.5 py-0.5 text-[11px] font-semibold text-brand-ink">Not checked</span>}
              {c.source_title || hostOf(c.source_url) || "No source"}{when ? ` · ${when}` : ""}
            </p>
            {(c.quote || href) && (
              <details className="group mt-1.5 [&_summary::-webkit-details-marker]:hidden">
                <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md text-[12.5px] font-semibold text-ink-soft hover:text-ink">
                  <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" /> {c.quote ? "Show the exact words" : "Show source"}
                </summary>
                <div className="mt-2 rounded-xl bg-ink/[0.035] p-3">
                  {c.quote ? <blockquote className="border-l-2 border-ok/50 pl-3 text-[13.5px] italic leading-[20px] text-ink-soft">“{c.quote}”</blockquote> : <p className="text-[12.5px] text-brand-ink">No quote from the source yet.</p>}
                  {href && (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-semibold text-info hover:underline">
                      Open source <span className="text-ink-faint">({hostOf(href)})</span> <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
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
  const order = [...s.unchecked, ...s.list.filter((c) => !isExample(c) && !s.unchecked.includes(c)), ...s.list.filter(isExample)];
  return (
    <section id="facts" className="card mt-12 scroll-mt-6 overflow-hidden" aria-labelledby="facts-title" data-testid="facts-panel">
      <div className="px-5 pt-5 sm:px-6">
        <div className={cx("eyebrow", s.allChecked ? "!text-ok" : "!text-brand-ink")}>Facts checked</div>
        <h2 id="facts-title" className="mt-1 text-title-2 font-bold text-ink">{s.allChecked ? `${s.facts} of ${s.facts} match the source` : `${s.checked} of ${s.facts} checked`}</h2>
        <p className="mt-1 text-callout text-ink-mute">Each fact in the blog, where it came from, and the exact words in the source.</p>
      </div>
      <ol className="mt-2 divide-y divide-[color:var(--hairline)] px-5 sm:px-6">
        {order.map((c, i) => <Claim key={c.id || i} c={c} i={i} />)}
      </ol>
    </section>
  );
}
