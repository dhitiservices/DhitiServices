// Fact list of a blog (body.claims, written by the engine's claims ledger, marketing/engine/src/claims.js):
// [{ id, kind, claim_text, source_url, source_title, quote, fetched_at, verified, extra_quotes?, derived?, note?, phrase? }]
//   kind fact | law | stat | date | quote  -> sourced: needs source_url + a verbatim quote
//        dhiti                              -> one of the owner-approved Dhiti facts (no outside source)
//        illustrative                       -> a made-up example, labelled in the blog (not a fact)
//        advice                             -> Dhiti's own recommendation or a process step (not a fact)

export const SOURCED = ["fact", "law", "stat", "date", "quote"];
const kindOf = (c) => String(c?.kind || "").toLowerCase();
export const isExample = (c) => /illustrat|example|hypothet|scenario/.test(kindOf(c));
export const isAdvice = (c) => kindOf(c) === "advice";
export const isDhiti = (c) => kindOf(c) === "dhiti";
/** Not a fact at all: nothing to check against a source. */
export const isNotFact = (c) => isExample(c) || isAdvice(c);

/** When the engine fetched the source (the check date). The publication date is in source_title, e.g. "(Feb 2026)". */
export function claimDate(c) {
  return c?.fetched_at || c?.checked_at || c?.source_date || null;
}

/** A fact passes only when the engine verified it, and a sourced fact also carries its source and exact quote. */
export function isChecked(c) {
  if (c?.verified !== true) return false;
  if (isDhiti(c)) return true;
  return !!c.source_url && !!String(c.quote || "").trim();
}

/**
 * Summary of body.claims. null when the blog has no fact list at all (older drafts).
 * { list, total, facts, examples, advice, checked, unchecked: [claims], allChecked }
 */
export function claimSummary(body) {
  const list = Array.isArray(body?.claims) ? body.claims.filter(Boolean) : null;
  if (!list) return null;
  const facts = list.filter((c) => !isNotFact(c));
  const unchecked = facts.filter((c) => !isChecked(c));
  return {
    list,
    total: list.length,
    facts: facts.length,
    examples: list.filter(isExample).length,
    advice: list.filter(isAdvice).length,
    checked: facts.length - unchecked.length,
    unchecked,
    allChecked: unchecked.length === 0,
  };
}

export function summaryLine(s) {
  if (!s) return null;
  if (!s.facts) return "No facts to check in this blog";
  if (s.allChecked) return `All ${s.facts} ${s.facts === 1 ? "fact" : "facts"} checked against the source`;
  const n = s.unchecked.length;
  return `${n} ${n === 1 ? "fact is" : "facts are"} not checked. Don't approve until ${n === 1 ? "it is" : "they are"} fixed.`;
}

/** "1 made-up example is marked as one. 2 tips are our own advice." */
export function extrasLine(s) {
  const out = [];
  if (s?.examples) out.push(s.examples === 1 ? "1 made-up example is marked as one." : `${s.examples} made-up examples are marked as examples.`);
  if (s?.advice) out.push(s.advice === 1 ? "1 tip is our own advice." : `${s.advice} tips are our own advice.`);
  return out.join(" ");
}
