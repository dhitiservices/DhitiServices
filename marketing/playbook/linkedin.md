# LinkedIn post: one post per blog, the owner approves it

Every saved blog gets **one** LinkedIn post on the Dhiti Services company page: one creative (carousel, reel or
graphic), a caption, and a first comment from the page that links to the blog. You only draft it. The owner reviews
it next to the blog in the dashboard, can switch the format, and approves it; the `linkedin` function posts it once
the blog is live. Contract: `marketing/LINKEDIN.md` (sections 2.5 and 5).

Make the post after the blog's creatives are made (PLAYBOOK step 5.5), so the creative you recommend exists.

## 1. Recommend ONE format, with a one-line reason the owner sees

| Recommend | When |
|---|---|
| `carousel` | The blog is a how-to, checklist, routine or framework with 5 or more scannable points, and the carousel exists. The default for most Dhiti guides. |
| `video` | The blog opens with a scene or story **and** the reel already has the owner's voiceover (`body.voiceover` set). The engine refuses a reel that is still waiting for its voiceover. |
| `graphic` | The blog has one standout statistic, quote or tip that works alone, or neither of the others fits. |

The reason is one plain sentence in the owner's language, starting with the format:
"Carousel: the 5-step monthly match reads best as slides". "Graphic: one clear number makes the point on its own".
"Video: the story opening works best told in your voice". At most about 120 characters, no jargon.

## 2. Caption (Dhiti's voice; LINKEDIN.md 5.2 and 5.3)

- **Hook first, within the first 200 characters** (what shows before "...see more"): the reader's problem or a
  specific, sourced number in plain words. Not a question, not "In today's...". Do not copy the blog's opening.
- Short paragraphs: 1 or 2 sentences, a blank line between them. A short numbered list is fine.
- 700 to 1,300 characters (hard limit 3,000).
- **No link, no domain name** anywhere in the caption. End with a pointer: "Full guide in the first comment."
- **At most 3 hashtags, all on the last line**, CamelCase letters and digits: `#TravelOperations #GST #CorporateTravel`.
  No `#` anywhere else.
- No em dashes, no emojis, no @mentions, no exclamation marks, no banned phrases (`quality-bar.md`), no hype.
- **The claims rule applies** to the caption, the first comment and the format reason (the CLI and the engine server
  both check it): every number, date, section or rule must be in a verified claim of the blog, in the same form and
  context (18% is backed by a claim with 18%, never by "the 14th" or by GSTR-2B), and a rule stated without numbers
  ("you have to file before the due date") must use the blog's own wording. An example number is allowed only in a
  paragraph labelled "For example" / "(An illustrative month.)" and must be the blog's own example; a percentage,
  money, a section or a financial year is never an example. Nothing that is not in the blog. If the blog was saved
  before the v4.1 gate, save the blog again first (`revisions.md` section 3, "Older blogs").
- The carousel's `caption_linkedin` is a starting point: remove its URL and fit it to these rules.

## 3. First comment

One line, at most 300 characters, no link, no `#`: the line that goes before the link, for example
"The full routine, with every rule and its source:". The engine shows the final comment in its output
(`first_comment_preview`): your line, a line break, then the blog URL with `utm_source=linkedin&utm_medium=social&
utm_campaign=<slug>`. The link is added automatically when the post goes out; never type it.

## 4. Save it

```bash
source ~/dhiti-work/env.sh && bash ~/dhiti-work/bin/lint.sh "$WORK/<slug>/linkedin-caption.txt"
source ~/dhiti-work/env.sh && cd "$ENGINE" && node src/cli.js save-social --blog "<blog item id>" --format carousel --source-item "<carousel item id>" --caption "$WORK/<slug>/linkedin-caption.txt" --first-comment "$WORK/<slug>/linkedin-comment.txt" --reason "Carousel: the 5-step monthly match reads best as slides" | tee "$WORK/<slug>/linkedin.saved.json"
```

- `--source-item` is the newest item of that format for this blog (the engine refuses an older or failed one).
- The row is saved as `pending_review` (`--draft` keeps it as a draft). Read `warnings` and fix what applies.
- A blog has one active LinkedIn post. To change it, add `--item <post id>` (`node src/cli.js social list --blog <id>`
  shows it). A session can change a post only while it is `draft`, `pending_review` or `failed`; it can never
  approve, publish or touch an approved post.
- Record the post id in `state.json` (`linkedin_post_id`) and in the run log.
