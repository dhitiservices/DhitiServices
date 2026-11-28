// Fact list of a blog (body.claims, written by the engine): [{id, claim_text, source_url, source_title, quote, kind, verified}].
// "Examples" (made-up scenarios labelled in the blog) are not facts and are shown apart.

const EXAMPLE = /illustrat|example|hypothet|scenario/i;
export const isExample = (c) => EXAMPLE.test(String(c?.kind || ""));

/** Optional date of the source or of the check, if the engine sent one. */
export function claimDate(c) {
  return c?.source_date || c?.published || c?.date || c?.checked_at || c?.accessed_at || null;
}

/**
 * Summary of body.claims. null when the blog has no fact list at all (older drafts).
 * { total, facts, examples, checked, unchecked: [claims], allChecked }
 */
export function claimSummary(body) {
  const list = Array.isArray(body?.claims) ? body.claims.filter(Boolean) : null;
  if (!list) return null;
  const facts = list.filter((c) => !isExample(c));
  const examples = list.filter(isExample);
  const unchecked = facts.filter((c) => c.verified !== true || !c.source_url || !String(c.quote || "").trim());
  return {
    list,
    total: list.length,
    facts: facts.length,
    examples: examples.length,
    checked: facts.length - unchecked.length,
    unchecked,
    allChecked: unchecked.length === 0,
  };
}

export function summaryLine(s) {
  if (!s) return null;
  if (!s.facts && s.examples) return `No facts to check. ${s.examples === 1 ? "1 example is" : `${s.examples} examples are`} marked as examples.`;
  if (s.allChecked) return `All ${s.facts} ${s.facts === 1 ? "fact" : "facts"} checked against the source`;
  const n = s.unchecked.length;
  return `${n} ${n === 1 ? "fact is" : "facts are"} not checked. Don't approve until ${n === 1 ? "it is" : "they are"} fixed.`;
}
