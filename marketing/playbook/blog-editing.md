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

## Step 2: rewrite

Fix every criterion below 4. Rewrite weak sentences rather than patching words; cut what does not earn its place.
Rules while editing:

- No new statistics, sources or quotes unless you fetch and verify them now (and add them to `sources.json`).
  Remove or soften any claim whose source does not support it exactly.
- Keep the slug. You may improve title, description and imageAlt.
- Remove em dashes by rewriting the sentence, not by swapping in a hyphen.
- Read the opening and the last section aloud in your head. If either sounds like a template, rewrite it.

## Step 3: mechanical checks (all must pass)

Run as one Bash call:

```bash
# Lint must print "lint: clean"; check-blog must return "passed": true (fix every message, then read the warnings
# and fix those that apply).
source ~/dhiti-work/env.sh && D="$WORK/<slug>/<slug>.md" && bash ~/dhiti-work/bin/lint.sh "$D"; cd "$ENGINE" && node src/cli.js check-blog "$D"
```

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
