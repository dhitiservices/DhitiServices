// Fact list of a blog (body.claims, written by the engine's claims ledger, marketing/engine/src/claims.js):
// [{ id, kind, claim_text, source_url, source_title, quote, fetched_at, verified, extra_quotes?, derived?, note?, phrase? }]
//   kind fact | law | stat | date | quote  -> sourced: needs source_url + a quote from the source
//        dhiti                              -> one of the owner-approved Dhiti facts (no outside source)
//        illustrative                       -> a made-up example, labelled in the blog (not a fact)
//        advice                             -> Dhiti's own recommendation or a process step (not a fact)
//
// What the engine proves: the quoted words are in the source text it fetched, and every number in the claim is in
// the quote. It does NOT prove that the quote means the same as the claim, so the app never says "matches": it says
// each fact "has a quote from the source" and asks the owner to read the quotes.

export const SOURCED = ["fact", "law", "stat", "date", "quote"];
const kindOf = (c) => String(c?.kind || "").toLowerCase();
export const isExample = (c) => /illustrat|example|hypothet|scenario/.test(kindOf(c));
export const isAdvice = (c) => kindOf(c) === "advice";
export const isDhiti = (c) => kindOf(c) === "dhiti";
/** Not a fact at all: nothing to check against a source. */
export const isNotFact = (c) => isExample(c) || isAdvice(c);

/** When the engine fetched (read) the source. The publication date is in source_title, e.g. "(Feb 2026)". */
export function claimDate(c) {
  return c?.fetched_at || c?.checked_at || c?.source_date || null;
}

/** A fact passes only when the engine verified it, it was not changed by an edit, and a sourced fact has a quote. */
export function isChecked(c) {
  if (c?.verified !== true || c?.changed) return false;
  if (isDhiti(c)) return true;
  return !!c.source_url && !!String(c.quote || "").trim();
}

/* ---- the same text forms as the engine (claims.js normText / strictForm / stripInlineMarkdown) ---- */
const normText = (s) => String(s ?? "")
  .normalize("NFKC")
  .replace(/[­​-‍⁠﻿]/g, "")
  .replace(/[‘’‚‛′ʼ`´]/g, "'")
  .replace(/[“”„‟″«»]/g, '"')
  .replace(/[‐-―−﹘﹣－]/g, "-")
  .replace(/\s+/g, " ")
  .trim();
const strictForm = (s) => normText(s).toLowerCase().replace(/\s*-\s*/g, "-").replace(/\s+([,.;:!?)\]])/g, "$1").replace(/([(\[])\s+/g, "$1");
const stripInline = (s) => String(s ?? "")
  .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
  .replace(/\[([^\]]+)\]\((?:[^()\s]|\([^)]*\))+\)/g, "$1")
  .replace(/\*\*([^*]+)\*\*/g, "$1")
  .replace(/__([^_]+)__/g, "$1")
  .replace(/(^|[^\w*])\*([^*\n]+)\*(?=[^\w*]|$)/g, "$1$2")
  .replace(/(^|[^\w])_([^_\n]+)_(?=[^\w]|$)/g, "$1$2")
  .replace(/`([^`]+)`/g, "$1");

/** The blog as one plain line (markdown removed), in the strict form the engine compares claims with. */
export function plainPost(markdown) {
  const lines = String(markdown ?? "").split(/\r?\n/).map((l) => l.replace(/^\s{0,3}(#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s?)/, ""));
  return strictForm(stripInline(lines.join("\n")));
}

/** True when the owner edited the text after the engine checked the facts. */
export function editedAfterCheck(body) {
  if (!body?.checks?.stale) return false;
  const edited = Date.parse(body.checks.edited_at || "");
  const checked = Date.parse(body.claims_check?.checked_at || "");
  return !Number.isFinite(checked) || !Number.isFinite(edited) || edited > checked;
}

/**
 * Summary of body.claims. null when the blog has no fact list at all (older drafts).
 * { list, total, facts, examples, advice, checked, unchecked: [claims], changed: n, allChecked, edited }
 * After an edit, a fact whose sentence is no longer in the text is marked { changed: true } and counts as not checked.
 */
export function claimSummary(body) {
  const raw = Array.isArray(body?.claims) ? body.claims.filter(Boolean) : null;
  if (!raw) return null;
  const edited = editedAfterCheck(body);
  const plain = edited ? plainPost(body?.markdown) : "";
  const list = raw.map((c) => {
    if (!edited || isNotFact(c)) return c;
    const t = strictForm(stripInline(c.claim_text || ""));
    return t && plain.includes(t) ? c : { ...c, changed: true };
  });
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
    changed: unchecked.filter((c) => c.changed).length,
    allChecked: unchecked.length === 0,
    edited,
  };
}

const nFacts = (n) => `${n} ${n === 1 ? "fact" : "facts"}`;

export function summaryLine(s) {
  if (!s) return null;
  if (!s.facts) return "No facts to check in this blog";
  if (s.allChecked) return `${nFacts(s.facts)} ${s.facts === 1 ? "has" : "have"} a quote from the source`;
  const n = s.unchecked.length;
  if (s.changed === n) return `${n} ${n === 1 ? "fact" : "facts"} changed after your edit. Check ${n === 1 ? "it" : "them"} before you approve.`;
  return `${n} ${n === 1 ? "fact is" : "facts are"} not checked. Don't approve until ${n === 1 ? "it is" : "they are"} fixed.`;
}

/** "1 made-up example is marked as one. 2 tips are our own advice." */
export function extrasLine(s) {
  const out = [];
  if (s?.examples) out.push(s.examples === 1 ? "1 made-up example is marked as one." : `${s.examples} made-up examples are marked as examples.`);
  if (s?.advice) out.push(s.advice === 1 ? "1 tip is our own advice." : `${s.advice} tips are our own advice.`);
  return out.join(" ");
}

/** True when this blog may be approved without the owner's own "I checked them" tick. */
export const factsClear = (body) => {
  const s = claimSummary(body);
  return !!s && s.allChecked;
};
