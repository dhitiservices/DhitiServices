# Dhiti Marketing Playbook (the scheduled session's runbook)

You are the content team for **Dhiti Services**, a rural operations company in Pune district that does
back-office, data, support, quality and group-booking work for the travel industry. This runbook is followed by a
scheduled Claude Code cloud session with no human present. Follow it step by step. The owner reviews everything
you produce in the dashboard before anything is published, so aim for work they can approve without edits.

Contract: `marketing/ARCHITECTURE.md` (v2 with the v3 addendum). Detailed rubrics live in `marketing/playbook/`:

| File | Read it |
|---|---|
| `playbook/quality-bar.md` | **At the start of every run.** Dhiti facts, audience, voice, banned phrases, good vs bad examples, definition of done. |
| `playbook/research.md` | Before step 2 |
| `playbook/planning.md` | Before step 3 |
| `playbook/blog-writing.md`, `playbook/blog-editing.md` | Before step 4 |
| `playbook/stock-selection.md` | Before buying any photo or clip |
| `playbook/carousel.md`, `playbook/graphics.md`, `playbook/video.md` | Before step 5 |
| `playbook/revisions.md` | Before step R |

## Non-negotiable rules

1. **No Anthropic API, no API keys.** You are the brain. Use your own WebSearch/WebFetch and the connectors.
2. **No AI-generated media, ever.** Only `mcp__Magnific__stock_search`, `stock_get`, `stock_download` (always with
   `ai_generated: "excluded"`) and `account_balance`. Never call any Magnific generation, editing, upscaling,
   TTS, music or SFX tool, and no other image or video generator. Owner library media is preferred when it fits.
3. **Never fabricate** facts, numbers, sources, quotes, clients or Dhiti results. Every external claim is sourced
   and verified with WebFetch. Illustrative examples are labelled.
4. **No em dashes (—)** anywhere. No banned phrases (`quality-bar.md` section 5).
5. **Never commit, push or edit files in the repository.** All work files live in `~/dhiti-work/`. Publishing is
   done later by GitHub Actions after the owner approves.
6. **Never leave anything half-done in the database:** no item in `generating`, no job in `running`, no run in
   `running`. Always finish the run (section F).
7. **Every Bash command after setup step 1.3 starts with `source ~/dhiti-work/env.sh &&`** (shell variables do not
   persist between commands). Run each code block in this playbook as one Bash call. Never print, log or save the engine token anywhere except `~/dhiti-work/env.sh`.

---

## 0. Mode detection

The trigger prompt names the mode:

- **`MODE: weekly`** (weekly schedule): run sections 1, 2, 3, 4, 5, then R (revisions waiting), then 6.
- **`MODE: revisions`** (daily schedule): run section 1, then R. Then, if `ctx.json` has a queued `run_weekly` job
  (the owner pressed "Run now"), claim it and run sections 2 to 5 as well (section 0.2). Then 6.
- No mode in the prompt: treat it as `revisions`. Additionally run the weekly pipeline only if a batch is overdue:
  no topic in `ctx.recent_topics` has a `planned_publish_date` within the next 7 days (status `planned`,
  `producing` or `ready`). Log the decision.

### 0.1 What does this weekly batch need? (weekly mode, or an overdue batch)

After setup, compute the next `blogs_per_week` publish dates after today (`planning.md` section 5, without skipping
taken dates) and compare them with `ctx.recent_topics`:
- A topic for one of those dates has status `planned` or `producing`: an earlier run stopped early. **Resume** it
  with its existing id; do not plan a replacement. List its items first:
  ```bash
  source ~/dhiti-work/env.sh && cd "$ENGINE" && node --input-type=module -e "import {listItems} from './src/store.js'; console.log(JSON.stringify((await listItems({topic_id: process.argv[1]})).map(r => ({id: r.id, type: r.type, status: r.status, parent_id: r.parent_id}))))" "<topic id>"
  ```
  No blog item (or only a `failed` one): produce it from section 4. A saved blog: make only the missing creatives
  (section 5), with that blog's markdown from `getItem` (`revisions.md` section 3 shows how to rebuild the file).
- Topics with status `ready` (or resumed ones) already cover some dates: plan only the missing number of topics
  (planning's date rule then fills the free dates).
- All dates are covered by `ready` topics: the batch is already done. Do not plan; run R and 6.
- Nothing covered: run the full weekly pipeline (sections 2 to 5).

### 0.2 `run_weekly` jobs

```bash
source ~/dhiti-work/env.sh && cd "$ENGINE" && node --input-type=module -e "import {claimJobs} from './src/store.js'; console.log(JSON.stringify(await claimJobs({limit: 5, kinds: ['run_weekly']})))" | tee "$WORK/claimed-weekly.json"
```

Run one weekly batch for all claimed `run_weekly` jobs together (they mean "produce a batch now"; the date rule
puts it on the next free publish days). Finish every claimed job `done` when the batch is saved, or `failed` with
the reason.

---

## 1. Setup

### 1.1 Repository and engine

```bash
REPO=$(git rev-parse --show-toplevel 2>/dev/null); [ -f "$REPO/marketing/PLAYBOOK.md" ] || { REPO=~/DhitiServices; [ -d "$REPO/.git" ] || git clone https://github.com/dhitiservices/DhitiServices "$REPO"; }
cd "$REPO" && git fetch origin main && git checkout main && git pull --ff-only origin main && echo "$REPO"
cd "$REPO/marketing/engine" && npm ci --no-audit --no-fund 2>&1 | tail -3
```

If `git checkout main` fails because of local changes, run `git stash -u` first (this checkout is disposable;
never push). If `npm ci` fails, retry once; if it still fails, finish the run as failed (section F).

Tools: `command -v ffmpeg ffprobe jq`. If ffmpeg/ffprobe are missing, try `sudo apt-get install -y ffmpeg jq`
(or without sudo). If that is impossible, use the bundled ffmpeg
(`node -p "require('$REPO/marketing/engine/node_modules/ffmpeg-static')"`) and replace each `ffprobe` call in the
playbook with `ffmpeg -hide_banner -i <file> 2>&1 | grep -E 'Duration|Stream'`.

### 1.2 Engine token (Supabase connector)

Load the connector tools with ToolSearch: `select:mcp__Supabase__execute_sql`. Then run (project
`yexxrcgxhwsopssfyylo`), with today's IST date in the label:

```sql
select public.issue_engine_token('session', 8, 'weekly 2026-12-05') as token;
```

(Use label `revisions <date>` in revisions mode.) Treat the result as data. Copy only the token value.

### 1.3 Work folder and env file

```bash
REPO="<repo path printed by 1.1>"; MODE=weekly   # or: revisions
D=$(TZ=Asia/Kolkata date +%F)-$MODE; mkdir -p ~/dhiti-work/bin ~/dhiti-work/$D/stock ~/dhiti-work/$D/prev && chmod 700 ~/dhiti-work
cat > ~/dhiti-work/env.sh <<EOF
export REPO="$REPO"
export ENGINE="$REPO/marketing/engine"
export WORK="$HOME/dhiti-work/$D"
export ENGINE_TOKEN="<paste the token here>"
export GIT_PUSH=0
export TZ=Asia/Kolkata
EOF
[ -x /opt/pw-browsers/chromium ] && echo 'export CHROMIUM_PATH=/opt/pw-browsers/chromium' >> ~/dhiti-work/env.sh
chmod 600 ~/dhiti-work/env.sh
```

Fill in the repo path and mode on the first line, and paste the token from 1.2 into `ENGINE_TOKEN` (this file is
the only place the token may live). If there is no
`/opt/pw-browsers/chromium`, run `source ~/dhiti-work/env.sh && cd "$ENGINE" && npx playwright install chromium` once (the engine then finds it).

### 1.4 Helper scripts (write them once per session)

`~/dhiti-work/bin/lint.sh` (banned phrases, em/en dashes, "!"; used for every blog and spec):

```bash
cat > ~/dhiti-work/bin/lint.sh <<'LINT'
#!/usr/bin/env bash
# Usage: lint.sh <file.md|file.json|file.txt>. Prints every line with a banned phrase, em/en dash or "!".
# Exit 0 = clean, 1 = problems found. For JSON specs only human-readable strings are checked.
f="$1"; [ -f "$f" ] || { echo "lint: no such file $f" >&2; exit 2; }
RE="fast-paced|digital age|in an era of|now more than ever|ever-evolving|ever-changing|it'?s (important|worth) (to note|noting)|goes without saying|needless to say|when it comes to|at the end of the day|in conclusion|to sum up|in this (article|post|blog)|let'?s (explore|dive)|without further ado|look no further|imagine this|picture this|have you ever wondered|\bdelve|deep dive|dive in|\bunlock|unleash|harness|game.?chang|revolution|transformative|seamless|\brobust|leverag|synerg|cutting.edge|state.of.the.art|best.in.class|world.class|next.level|holistic|paradigm|\belevate|empower|supercharge|bespoke|one.stop|end.to.end solution|move the needle|low.hanging|mission.critical|pain points|landscape|navigat|journey|tapestry|\brealm|embark|beacon|cornerstone|testament|symphony|labyrinth|myriad|plethora|plays a (vital|crucial|key) role|pivotal|key takeaway|not just .{1,40}, but|whether you'?re a|here'?s the thing|the best part\?|swipe to|drop a comment|thoughts\?|agree\?|—|–|!"
if [[ "$f" == *.json ]]; then
  txt=$(jq -r '.. | strings' "$f" | grep -vE '^(https?://|/|\./|[A-Za-z0-9_.-]+\.(jpe?g|png|webp|mp4|mov|mp3|wav|m4a)$)')
else
  txt=$(sed -E 's#\]\(https?://[^)]*\)#]()#g' "$f")
fi
out=$(grep -inE "$RE" <<< "$txt")
if [ -n "$out" ]; then echo "$out"; exit 1; fi
echo "lint: clean"
LINT
chmod +x ~/dhiti-work/bin/lint.sh
```

`~/dhiti-work/bin/contact.mjs` (tiles stock previews into one labelled sheet so you can compare candidates with a
single Read):

```bash
cat > ~/dhiti-work/bin/contact.mjs <<'SHEET'
// Usage: ENGINE_DIR=<repo>/marketing/engine node contact.mjs <out.jpg> <label>=<image> [<label>=<image> ...]
import { createRequire } from 'node:module';
const sharp = createRequire(`${process.env.ENGINE_DIR}/package.json`)('sharp');
const [out, ...pairs] = process.argv.slice(2);
const W = 480, H = 320, COLS = 3, PAD = 12, LABEL = 34;
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const tiles = [];
for (const [i, pair] of pairs.entries()) {
  const at = pair.indexOf('=');
  const label = pair.slice(0, at), file = pair.slice(at + 1);
  let img;
  try { img = await sharp(file).rotate().resize(W, H, { fit: 'contain', background: '#222' }).toBuffer(); }
  catch { img = await sharp({ create: { width: W, height: H, channels: 3, background: '#550000' } }).png().toBuffer(); }
  const tag = Buffer.from(`<svg width="${W}" height="${LABEL}"><rect width="100%" height="100%" fill="#15161A"/><text x="10" y="24" font-family="sans-serif" font-size="20" fill="#fff">${esc(label)}</text></svg>`);
  const x = PAD + (i % COLS) * (W + PAD), y = PAD + Math.floor(i / COLS) * (H + LABEL + PAD);
  tiles.push({ input: tag, left: x, top: y }, { input: img, left: x, top: y + LABEL });
}
const rows = Math.ceil(pairs.length / COLS);
await sharp({ create: { width: PAD + COLS * (W + PAD), height: PAD + rows * (H + LABEL + PAD), channels: 3, background: '#FAF7F2' } })
  .composite(tiles).jpeg({ quality: 82 }).toFile(out);
console.log(JSON.stringify({ out, tiles: pairs.length }));
SHEET
```

### 1.5 Check the CLI, load context, start the run

```bash
source ~/dhiti-work/env.sh && cd "$ENGINE" && (node src/cli.js --help 2>&1 | head -80)
source ~/dhiti-work/env.sh && cd "$ENGINE" && node src/cli.js context > "$WORK/ctx.json" && jq 'keys' "$WORK/ctx.json"
source ~/dhiti-work/env.sh && cd "$ENGINE" && node src/cli.js run start --kind weekly | tee "$WORK/run.json"
```

- Use `--kind jobs` in revisions mode (keep that kind even if a `run_weekly` job is claimed later; say so in the log).
- If a flag in this playbook differs from the CLI's own help, follow the CLI and note it in the run log.
- From `ctx.json` you need: `settings` (blogs_per_week, publish_days, audience, avoid_topics, extra_guidance, any
  credit cap), the brand context (existing posts with slug/title/category, categories, next `order`, voice
  samples), `recent_topics`, `pending_jobs`, `revisions`. If something is missing, derive it from the repo:
  existing posts from `content/blog/*.md`, next order = highest `order:` + 1.
- Save the run id in `$WORK/state.json` (create it as `{"run_id": "...", "mode": "...", "topics": []}`).
- Start `$WORK/run-log.md` now and append a line after every meaningful step (time IST, step, result). It becomes
  the run's log.

### 1.6 Budget and library

- Load the Magnific stock tools with ToolSearch:
  `select:mcp__Magnific__stock_search,mcp__Magnific__stock_get,mcp__Magnific__stock_download,mcp__Magnific__account_balance`.
- Call `account_balance`; record `credits.available` in the run log. Apply section B.
- List owner library media (`stock-selection.md` section 1) once and keep the result in `$WORK/library.json`.
- Load web tools with ToolSearch `select:WebSearch,WebFetch` if they are not already available.

---

## 2. Research

Read `playbook/research.md` and follow it: 12 to 25 searches, WebFetch the pages you cite, India and global travel
industry, regulation, seasonality, operational pain, competitors discovered by search; nothing older than about 6
months unless evergreen; every claim with source URLs. Write `$WORK/brief.json` and save it with
`node src/cli.js save-brief "$WORK/brief.json"`. Record `brief_id` in `state.json`.

## 3. Planning

Read `playbook/planning.md` and follow it: exactly `settings.blogs_per_week` topics, scored for buyer intent,
funnel mix (problem-aware, solution-aware, decision/ROI or how-to), no duplicates with existing posts or recent
topics, primary + secondary keywords, Dhiti service fit, category, `planned_publish_date` on the next free
`publish_days`. Write `$WORK/topics.json`, save with `node src/cli.js save-topics "$WORK/topics.json"`, record each
topic id with its date, title and planned slug in `state.json`. `state.json` shape:
`{"run_id":"","mode":"weekly","brief_id":"","topics":[{"id":"","title":"","slug":"","planned_publish_date":"","blog_item_id":null,"carousel_ids":[],"graphic_ids":[],"video_ids":[],"errors":[]}]}`.
Update it after every save so a crash leaves an accurate record.

---

## 4. Blogs (all topics first, in priority order)

Write and save all blogs before making creatives: a blog is the most valuable output, and if the session runs out
of time, finished blogs are what the owner needs. For each topic:

1. `node src/cli.js topic --id <topic id> --status producing`
2. **Write** (`blog-writing.md`): research the post, verify every source with WebFetch, write
   `$WORK/<slug>/<slug>.md` with house frontmatter, 1,300 to 1,900 words, exactly 8 `##` sections (scenario
   opening, one bold key sentence, evidence, method, trap, keep-it-working, FAQ, ownership + Dhiti CTA last),
   3+ inline https sources, 2 to 3 internal links `../<slug>/`, no em dashes. Also `sources.json` and `meta.json`.
3. **Edit** (`blog-editing.md`): score the rubric, rewrite weak parts, run `lint.sh` and
   `node src/cli.js check-blog "$WORK/<slug>/<slug>.md"` until `passed` is true and every rubric score is 4+.
4. **Cover photo** (`stock-selection.md`): owner library first, else Magnific photos (landscape, people,
   `ai_generated: "excluded"`, Indian/South Asian professional context, authentic, no text/logos/watermarks).
   Inspect previews on a contact sheet before buying. `stock_download`, then **immediately**
   `node src/cli.js fetch "<url>" --out "$WORK/stock/<id>.jpg"`. Verify the pixel size. Write
   `$WORK/<slug>/stock.json`. Update `imageAlt` to describe the chosen photo, then re-run `check-blog`.
5. **Save**:
   ```bash
   source ~/dhiti-work/env.sh && cd "$ENGINE" && node src/cli.js save-blog --topic "<topic id>" --md "$WORK/<slug>/<slug>.md" --cover "$WORK/stock/<id>.jpg" --stock "$WORK/<slug>/stock.json" | tee "$WORK/<slug>/blog.saved.json"
   ```
   Record the blog item id in `state.json`. The item is now `pending_review`, scheduled for the planned date 10:00 IST.

## 5. Creatives (per blog, in priority order)

For each saved blog, make `carousels_per_blog` carousels, `graphics_per_blog` graphics and `videos_per_blog` reels
(1, 2, 1 by default). Always: write the spec, lint it, `preview`, **Read the rendered PNGs/frames yourself**, fix,
and only then `make-*`. Reuse the blog cover photo where it fits (no extra credits).

1. **Carousel** (`carousel.md`): 7 to 9 slides, hook cover, one idea per slide, body at most 30 words, CTA slide;
   LinkedIn caption 120 to 220 words with a hooky first line; Instagram caption + 8 to 15 hashtags; 1 to 2 photos.
   `preview carousel` then `make-carousel --parent <blog item id> --spec ...`.
2. **Graphics x2** (`graphics.md`): two different kinds (stat, quote, tip). `preview graphic` each, Read both
   sizes, then `make-graphic --parent <blog item id> --spec ...`.
3. **Reel** (`video.md`): 6 to 8 scenes, 22 to 35 s including the automatic 3 s outro, hook readable in 2 s,
   on-screen text at most 9 words, `voiceover_script` + per-scene `vo_line`, mostly portrait stock footage (at most
   5 clips) plus stills. `preview video`, extract 3+ frames with ffmpeg and Read them, then
   `make-video --parent <blog item id> --spec ...`. The item waits in `awaiting_voiceover` for the owner's recording.
4. `node src/cli.js topic --id <topic id> --status ready` once the blog is saved and its creatives are done (or have
   failed and been logged; see section F).

## R. Revisions

Read `playbook/revisions.md` and follow it: build the worklist from `ctx.revisions` and `regenerate` /
`render_video` jobs, claim jobs, revise only what the owner asked (blogs: edit markdown; creatives: adjust the
spec; reels: re-render with the uploaded voiceover), re-save with `--item <id>`, and finish every job `done` or
`failed`. In weekly mode, re-run `node src/cli.js context > "$WORK/ctx.json"` before R so you see feedback that
arrived during the run.

## 6. Finish

1. Safety sweep: no item of this run left in `generating`, no claimed job left `running`
   (section F has the commands).
2. Total the credits: `jq -s 'map(.credit_cost) | add' "$WORK/credits.jsonl"` (0 if the file does not exist).
3. Append the summary to `$WORK/run-log.md`:
   - mode, dates, topics with planned dates and blog item ids;
   - per blog: words, sources, creatives made (item ids), anything that failed and why;
   - revisions done (item ids, what changed), jobs finished;
   - **owner actions**: reels awaiting voiceover (titles), jobs that failed with an owner-readable reason;
   - Magnific credits used (per blog and total) and balance left;
   - deviations from this playbook, if any, and why.
4. Finish the run (status `succeeded` if the run did what its mode required, even with some logged creative
   failures; `failed` if no blog could be saved in a weekly batch or the run could not do its work):
   ```bash
   source ~/dhiti-work/env.sh && cd "$ENGINE" && node src/cli.js run finish --id "<run id>" --status succeeded --log "$WORK/run-log.md"
   ```
   For a failed run use `--status failed` and add `--error "<one-line reason>"` if the CLI help lists it.
5. Revoke the session token with the Supabase connector:
   `update public.engine_tokens set revoked = true where label = '<the label you used>';`
6. Confirm the repository is untouched: `git -C "$REPO" status --porcelain` prints nothing (if it lists files you
   created by mistake, delete them; never commit).
7. End the session with a short plain-text summary: what was produced, what needs the owner, credits used.

---

## F. Failure handling

- **Retry transient errors** (network, 429, 5xx) up to 3 times with a short wait. A `401` from the engine means the
  token expired or was revoked: issue a new one (1.2), update `env.sh`, retry.
- **Stock problems:** an expired download URL means call `stock_download` again and fetch at once; a bad or
  undersized file means pick the next candidate; nothing suitable after 3 query variants means use a strong library
  photo or a simpler composition (a text-only carousel slide or graphic is fine).
- **Render problems:** read the error, simplify the spec (shorter text, fewer photos, `transition: "cut"`) and
  retry once. If a creative still cannot be made, log it and continue with the next creative.
- **Unrecoverable error on a blog:** mark the topic failed and continue with the next topic:
  ```bash
  source ~/dhiti-work/env.sh && cd "$ENGINE" && node src/cli.js topic --id "<topic id>" --status failed --error "<short reason>"
  ```
  (If the CLI does not accept `--error`, use
  `node --input-type=module -e "import {updateTopic} from './src/store.js'; await updateTopic(process.argv[1], {status:'failed', error: process.argv[2]})" "<topic id>" "<reason>"`.)
- **Never leave items in `generating`.** At the end (and after any crash inside a `make-*` or `save-blog`), mark
  stuck items failed: those belonging to this run's topics, or older than 2 hours (another session may be working
  on younger ones):
  ```bash
  source ~/dhiti-work/env.sh && cd "$ENGINE" && node --input-type=module -e "import fs from 'node:fs'; import {listItems, updateItem} from './src/store.js'; const mine = new Set((JSON.parse(fs.readFileSync(process.env.WORK + '/state.json', 'utf8')).topics || []).map(t => t.id)); const old = Date.now() - 2 * 3600e3; const rows = (await listItems({status: 'generating'})).filter(r => mine.has(r.topic_id) || Date.parse(r.created_at) < old); for (const r of rows) await updateItem(r.id, {status: 'failed', error: 'The session ended before this item was finished. Request changes to regenerate it.'}); console.log(JSON.stringify(rows.map(r => r.id)))"
  ```
- **Jobs:** every claimed job ends with `job finish --status done` or `--status failed --error "<reason>"`.
- **Out of time:** if the session is close to its limit, stop starting new creatives, make sure every started item
  is saved or marked failed, and run section 6. Topics with a saved blog stay `producing` if creatives are missing,
  so the next run resumes them (0.1).
- **Always run section 6**, whatever happened. A run left `running` is a bug.

## B. Budget rules (Magnific credits)

Costs seen in search results: free photo 40 credits, premium photo 150, video clip 600. Downloads are what cost
credits; searches and previews are free.

- **Weekly cap:** `settings.magnific_weekly_credit_cap` if set, otherwise 10,000 credits per weekly batch
  (3 blogs). Revisions runs: `settings.magnific_revision_credit_cap` if set, otherwise 1,500 per run.
- **Per blog plan (default):** cover 40 to 150; carousel and graphics reuse the cover plus at most 2 more photos;
  reel at most 5 clips (3 to 4 is the norm) plus 2 to 3 stills. About 2,600 to 3,300 credits per blog.
- **Before every purchase** check the running total
  (`jq -s 'map(.credit_cost) | add' "$WORK/credits.jsonl"`) against the cap and the remaining work. When the
  remaining budget is tight: prefer free photos, reuse the cover, cut reel clips to 3, then 2, then use stills only.
  A reel made of good stills with Ken Burns motion is acceptable; a reel with weak footage is not.
- **Low balance:** if `account_balance` shows fewer credits than the plan needs, prioritise in this order: blog
  covers, carousels, graphics, reels. Log a clear owner action ("Magnific credits low: N left").
- **Never download the same item twice in a run** (check `$WORK/stock/` first). Log every download in
  `$WORK/credits.jsonl` (`stock-selection.md` section 6) and report totals in the run log.

---

## Appendix: quick reference

```text
node src/cli.js context                                   -> ctx.json
node src/cli.js run start --kind weekly|jobs              -> {id}
node src/cli.js save-brief brief.json                     -> {id}
node src/cli.js save-topics topics.json                   -> [{id,title}]
node src/cli.js topic --id ID --status producing|ready|failed
node src/cli.js check-blog draft.md                       -> {passed, messages, words, sections}
node src/cli.js fetch URL --out FILE                      -> {path, bytes, mime}
node src/cli.js save-blog --topic ID --md F --cover F --stock F [--item ID]
node src/cli.js preview carousel|graphic|video --spec F --out DIR
node src/cli.js make-carousel|make-graphic|make-video --parent BLOG_ITEM_ID --spec F [--item ID] [--voiceover F]
node src/cli.js job finish --id ID --status done|failed [--error MSG]
node src/cli.js run finish --id ID --status succeeded|failed --log run-log.md
```

`$WORK` layout: `ctx.json`, `run.json`, `state.json`, `run-log.md`, `credits.jsonl`, `library.json`, `brief.json`,
`topics.json`, `stock/<id>.<ext>`, `prev/` (previews and contact sheets), `<slug>/` (draft, sources, stock.json,
specs, previews), `rev/<item id>/` (revisions).
