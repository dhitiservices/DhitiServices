# Planning: choose this week's topics

Goal: exactly `settings.blogs_per_week` topics (3 unless settings say otherwise) that solve a real operational
problem for a Dhiti buyer, can be found in search, and lead naturally to a conversation with Dhiti.
Output: `$WORK/topics.json`, saved with `node src/cli.js save-topics`.

## 1. Generate candidates

Write 8 to 10 candidate topics from the brief's opportunities and pain points, plus durable how-to questions buyers
search all year. For each candidate draft: working title, primary keyword, reader, funnel stage, service line,
supporting brief items.

## 2. Hard filters (a candidate failing any one is dropped)

1. **No duplication.** Not the same reader question as any existing post (`ctx.json` existing posts), any
   `recent_topics` entry (last 8 weeks, any status) or `settings.avoid_topics`. A neighbouring subject is fine only
   if the primary keyword **and** the reader's question are clearly different. Check slugs too: the slug you will
   use must not exist. When in doubt, choose something else.
2. **Service fit.** The fix involves steady, rule-based, checkable work Dhiti does (see `quality-bar.md` section 1).
   The closing CTA must feel like the obvious next step, not a bolt-on.
3. **Evidence.** At least two credible, recent sources exist for the problem (from the brief or one quick search).
4. **Searchable.** The primary keyword is a phrase a real buyer types (2 to 5 words, lowercase, no brand names),
   and what ranks for it today is beatable (thin vendor pages, old listicles), not government or airline pages the
   reader needs instead of us. Not a pure news query that will be stale in a month.

## 3. Score the survivors (1 to 5 each, total out of 30)

| Criterion | 5 looks like |
|---|---|
| Buyer intent | The reader is close to a decision or feels the pain weekly ("adm dispute process", "hotel commission recovery") |
| Pain severity | Costs money, cash or clients, with evidence |
| Service fit | Directly maps to one Dhiti service line and a pilot Dhiti could run |
| Timeliness | A deadline, season, regulation or report makes it relevant in the next 4 weeks, or it is a durable evergreen how-to |
| Differentiation | Competitors and top results are generic; we can be far more specific |
| Search demand | The phrase is used widely (suggestions, related searches, multiple ranking pages) |

## 4. Pick the set

Choose exactly `blogs_per_week` topics from the top scorers, with this mix (for 3 topics):

1. **Problem-aware**: the reader feels a symptom and does not yet see the process cause (for example "why
   corporate clients pay late").
2. **Solution-aware**: the reader knows the problem and wants a method (for example "how to run a daily rate parity
   check").
3. **Decision / ROI or operational how-to**: the reader is weighing whether and how to change who does the work (for
   example "what to test in an operations pilot", "cost of handling refunds in-house versus a trained team").

Also balance the set: different buyer types (not all hotel, not all TMC), different service lines, at most two
topics in the same category, and no two topics that would compete for the same keyword. If `blogs_per_week` is not
3, keep the same principles: at least one problem-aware and one decision-stage topic.

## 5. Publish dates and order

- `planned_publish_date`: the next `blogs_per_week` dates that fall on `settings.publish_days` (default Monday,
  Wednesday, Friday), strictly after today (IST), skipping any date that already has a blog in `recent_topics` with
  status `planned`, `producing` or `ready`. Compute them, do not guess:
  ```bash
  source ~/dhiti-work/env.sh && cd "$ENGINE" && node --input-type=module -e "import {nextPublishDates, addDays, todayIST} from './src/util.js'; console.log(JSON.stringify(nextPublishDates(6, JSON.parse(process.argv[1]), addDays(todayIST(), 1))))" "$(jq -c '.settings.publish_days' "$WORK/ctx.json")"
  ```
  then drop dates already taken and keep the first `blogs_per_week`.
- `week_start`: the Monday (YYYY-MM-DD) of the week containing the first planned date.
- `priority`: 1 = strongest topic, published first. Give the earliest date to priority 1. Use each number once.

## 6. topics.json shape (an array, exactly)

```json
[
  {
    "brief_id": "<BRIEF_ID or omit if the brief failed to save>",
    "week_start": "YYYY-MM-DD",
    "title": "working headline in house style, 50 to 80 characters",
    "angle": "2 to 3 sentences: the specific argument, the scenario the post opens with, the non-obvious insight it will defend",
    "primary_keyword": "lowercase phrase",
    "secondary_keywords": ["3 to 6 related phrases"],
    "audience": "the specific reader, e.g. 'finance leads at mid-sized Indian TMCs'",
    "category": "one of: Travel operations | Hotel operations | Operations | Customer support | Quality | People & careers",
    "rationale": "Funnel: problem-aware|solution-aware|decision. Score: 26/30. Why this week, which brief items support it (cite their URLs), which Dhiti service line it leads to and how the CTA will work.",
    "priority": 1,
    "planned_publish_date": "YYYY-MM-DD",
    "status": "planned"
  }
]
```

**Titles: house style.** Plain and specific; often names the problem and the outcome, or states a truth the reader
recognises. Sentence case. No clickbait, no stacked colons, no question mark unless it is a real question, no
banned phrases. See the good/bad table in `quality-bar.md`.

## 7. Save

```bash
source ~/dhiti-work/env.sh && cd "$ENGINE" && jq empty "$WORK/topics.json" && node src/cli.js save-topics "$WORK/topics.json" | tee "$WORK/topics.saved.json"
```

Record each returned `{id, title}` in `$WORK/state.json` alongside its planned date and slug.
