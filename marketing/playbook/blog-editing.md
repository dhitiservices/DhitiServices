# Blog editing: the managing editor's pass

A draft never goes to `save-blog` straight from the writer. You now switch roles: you are the managing editor,
demanding, precise and fair. Every post goes out under Dhiti's name to sceptical operations leaders. Make the
draft as good as the best published posts (`hotel-rate-parity`, `corporate-client-collections`,
`agency-debit-memos`).

## Step 1: score the draft (write the scores into `$WORK/<slug>/edit-notes.md`)

Score each criterion 1 to 5 with one specific note. Be honest; 5 means nothing important could be improved.

1. **Specificity.** Real documents, fields, systems, deadlines, roles. No generalities a reader could find anywhere.
2. **Original insight.** The bold sentence reframes the problem. The method contains at least one non-obvious point.
3. **Opening.** Starts inside a concrete moment, not a definition, statistic, question or thesis. Paid off at the end.
4. **Structure.** Exactly 8 `##` sections in sentence case, FAQ is section 7, CTA section last. Short paragraphs,
   bold lead-ins, numbered routines, one blockquote artefact. No walls of text.
5. **Evidence.** 3+ distinct credible https sources inline on descriptive anchors, each supporting the exact claim
   next to it. Every number traceable to `sources.json`. Illustrations labelled.
6. **SEO.** Primary keyword in title, first 100 words and one `##` heading, all natural. Secondary keywords used
   where natural. Description 130 to 155 characters and specific. FAQ questions match real searches.
7. **Internal links.** 2 or 3, house form `../<slug>/`, existing slugs only, genuinely useful.
8. **CTA.** Ownership argument, scene payoff, two-sentence Dhiti paragraph in house form. Natural, never pushy.
   No Dhiti claims beyond `quality-bar.md` section 1.
9. **Voice and hygiene.** Plain British/Indian English, calm, practical. No em dashes, banned phrases, hype,
   exclamation marks, filler, repetition or fabricated facts.
10. **Length.** 1,300 to 1,900 words (ideal 1,450 to 1,750).
11. **Currency and accuracy.** Score 5 only when every item of `blog-writing.md` section 1, points 6 to 10, was done
    and noted: the superseded-rule search for each rule (with what it found), conditions counted exactly, the
    scenario's causes walked through the system, every deadline computed against `planned_publish_date` (and the
    publish-day case stated with its year), descriptors quoted exactly. A finance reader who knows the law must
    find nothing out of date. Any score below 5 here blocks saving.

## Step 2: rewrite

Fix every criterion below 4. Rewrite weak sentences rather than patching words; cut what does not earn its place.
Rules while editing:

- No new statistics, sources or quotes unless you fetch them now with `fetch-source` and add them to
  `claims.json`. Remove or soften any claim whose source does not support it exactly. Every edit to a factual
  sentence means editing its `claim_text` too.
- Keep the slug. You may improve title, description and imageAlt.
- Remove em dashes by rewriting the sentence, not by swapping in a hyphen.
- Read the opening and the last section aloud in your head. If either sounds like a template, rewrite it.

## Step 3: mechanical checks (all must pass)

Run as one Bash call:

```bash
# Lint must print "lint: clean"; check-blog must return "passed": true and claims.passed true (fix every message,
# then read the warnings and fix those that apply).
source ~/dhiti-work/env.sh && D="$WORK/<slug>/<slug>.md" && bash ~/dhiti-work/bin/lint.sh "$D"; cd "$ENGINE" && node src/cli.js check-blog "$D" --claims "$WORK/<slug>/claims.json" --meta "$WORK/<slug>/meta.json"
```

Claims messages and what to do:
- `claim_text not found in the post`: copy the sentence again from the draft (markdown removed).
- `quote is not in the fetched text`: the quote is not verbatim, or it is from another page. Open the `text_file`
  that `fetch-source` printed and copy the passage exactly. Never "fix" a quote to match your sentence.
- `number "x" (a percentage) not in the quote`: quote the passage that states it in the same form, add
  `derived.steps` that compute it (`blog-writing.md` 1b), or change the sentence to what the source says.
- `is in the quote, but in another context`: the quote uses that number for something else. Quote the passage that
  says this about it.
- `comes from a quote that does not name section ...`: start the quote at the sub-section's label ("(4)A registered
  person ...") or cite the passage that names it.
- `the claim says "..." where its quote says "..."`: the claim flips or drops a "not", "unless", "only if" or
  "even when". Write it in the same sense as the source.
- `superseded` / `is the OLD value`: the source still carries old law or an old rate. Cite the current rule.
- `sentence with ... has no claim`: add a claim (sourced, `illustrative` with its label at the start of the
  paragraph, or `advice` with a note), or cut the sentence. `(the part outside the claim changes its meaning)`:
  the claim must cover the "but ..." or "unless ..." too.
- `advice cannot state rules` / `advice cannot carry facts`: split the fact into a sourced claim, or rephrase it as a
  recommendation without numbers.
- `not fetched by the engine` / `not fetched by the engine server`: run `fetch-source` for it; if the server cannot
  fetch it, find another primary source.

The lint script is written during setup (PLAYBOOK.md section 1). Lint notes: "journey" and "navigate" are fine only in their literal travel sense ("the traveller's journey from
Pune to Dubai" is acceptable; "the outsourcing journey" is not). Link URLs are ignored by the lint.

Then verify by hand:
- Every external link in the draft appears in `sources.json` and was fetched this run.
- `description` length: `grep '^description:' "$D" | sed 's/^description: "//; s/"$//' | tr -d '\n' | wc -m` is 130 to 155.
- Internal links point to existing files: for each `../x/`, `content/blog/x.md` exists.
- FAQ answers say nothing the body does not support.
- `meta.sources[].title` / `sources.json` titles follow "Publisher: page title (Mon YYYY)", not the anchor text.
- The reader is the travel business (planning filter 5), and the CTA names a buyer type from `quality-bar.md`
  section 1.
- No relative time ("has just closed", "this month") that stops being true after `planned_publish_date`.
- Frontmatter holds only the house keys (title, description, category, image, imageAlt, order, date); keywords
  and FAQ live in `sources.json` / `meta.json`, never as extra frontmatter keys.
- Every link is inline `[text](https://...)`: no reference-style `[text][1]` links or `[1]: url` lines
  (`check-blog` rejects them, along with any non-https scheme).

Repeat Steps 2 and 3 until `check-blog` passes and every rubric score is 4 or 5. If `check-blog` still fails after
three rounds, read its messages carefully: they are the site's exact rules. Do not save a failing blog.

## Step 4: independent fact-check (a fresh sub-agent that did not write the post)

The writer cannot check their own facts. First make the sheet the checker fills in:

```bash
source ~/dhiti-work/env.sh && cd "$ENGINE" && node src/cli.js factcheck-sheet --claims "$WORK/<slug>/claims.json" --md "$WORK/<slug>/<slug>.md" --meta "$WORK/<slug>/meta.json" --out "$WORK/<slug>/factcheck-sheet.json"
```

Each row has the claim, its quotes, the engine's worked dates (`derived_working`), any quote that matched only
loosely (`look_closely`) and a `claim_hash` that binds the verdict to exactly this claim: change the claim and the
verdict no longer counts.

Spawn a **new** general-purpose sub-agent with the Agent (Task) tool. Give it only the post, the sheet and the
fetched sources folder; not your notes, not the brief, not this conversation. Prompt (fill in the paths and the
planned publish date):

```text
You are a sceptical fact-checker for a B2B blog that finance and tax readers will scrutinise. You did not write it.
Files: the post <WORK>/<slug>/<slug>.md, the fact-check sheet <WORK>/<slug>/factcheck-sheet.json, and the source
texts the claims cite in <WORK>/sources/ (manifest.json maps each URL to its text_file). The post goes live on <date>
and must stay true for 12 months.
1. For EVERY row, try to refute the claim: read the quote in its source text and its surrounding paragraph. Does the
   source really say what the sentence says, with the same number, unit, sample, date, condition and scope? Is a
   recommendation or proposal written as if it were law? Is an exception or proviso missing? Is derived_working
   right, and does the claim follow from it? Compare every look_closely quote with the source character by character.
2. Check for missing or outdated law: for each rule, search the web for later circulars, notifications, GST Council
   decisions, Finance Acts, GSTN advisories, RBI or DGCA updates (search "<rule> circular <year>", the latest GST
   Council press release and newsletter). Report anything that changes or adds to a rule, with its URL.
3. Check the advice and illustrative rows: is any of them really a factual claim without a source? Is every example
   clearly an example?
4. Check for relative dates and for anything that depends on the day the post goes live.
Write <WORK>/<slug>/factcheck.json: a JSON array with one object per row:
  {"id": <row id>, "claim_hash": <row claim_hash, copied>, "verdict": "correct" | "wrong" | "unsure",
   "note": "<what you checked, or what is wrong, with the URL of any newer source>",
   "current": true   (only for law rows, and only after step 2 found nothing newer)}
Be strict: when in doubt, the verdict is "unsure". Also write a short summary in <WORK>/<slug>/factcheck.md.
```

Then, for every verdict that is not "correct": rewrite the sentence and its claim (fetch any newer source with
`fetch-source`, and cite the newer primary document), or drop the sentence. Never argue a finding away and never
edit `factcheck.json` yourself: a changed claim gets a new `claim_hash`, so run the sheet and the fact-check again
for the changed claims (the checker may keep its verdicts for unchanged rows). **Any claim without a "correct"
verdict means the post is not saved** (`save-blog` refuses it). Record in the run log: claims count, findings, what
changed.

If the session has no Agent tool, the post cannot be saved: mark the topic failed with the reason "no independent
fact-check available" (PLAYBOOK.md section F).
