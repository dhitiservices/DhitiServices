# Dhiti marketing engine

The command-line toolbox behind the weekly marketing run: it checks blog drafts against the website's rules,
renders the carousels, graphics and reels, uploads everything for review in the dashboard, and publishes approved
blogs to `main`. The research and writing are done by the scheduled Claude Code session that follows
`marketing/PLAYBOOK.md`. **The engine never calls an AI API and never needs an Anthropic key.** Every photo and clip is
licensed **Magnific stock** (`stock_search` with `ai_generated: "excluded"`, then `stock_download`). Nothing is
AI-generated. The binding contract is `marketing/ARCHITECTURE.md`.

## Setup

```bash
cd marketing/engine
npm ci                                   # Node 20+
export CHROMIUM_PATH=/opt/pw-browsers/chromium   # optional: any Playwright Chromium build
```

| env | meaning |
|---|---|
| `ENGINE_TOKEN` | engine API token (required unless `DRY_RUN=1`). In a Claude session use the Supabase connector: `select public.issue_engine_token('session', 8, 'weekly run');` |
| `ENGINE_URL` | defaults to `https://yexxrcgxhwsopssfyylo.supabase.co/functions/v1/engine` |
| `DRY_RUN=1` | local JSON backend in `out/` (`out/db.json`, `out/storage/`): no network, no push |
| `REPO_ROOT` | website checkout used by `check-blog`, `context` and `publish` (default: this repo) |
| `GIT_PUSH=0` | `publish` commits but does not pull or push. In `DRY_RUN` nothing is pushed unless `GIT_PUSH=1` |
| `OUT_DIR`, `LOG_QUIET=1` | where the dry-run store and work files go, and how to silence stderr logs |

Every command prints **one JSON value on stdout** and writes logs to stderr. Exit code 0 means ok, 1 means an error
(`{"ok":false,"error":"..."}`), and 2 means `check-blog` found problems.

## Commands (`node src/cli.js <command>`)

| command | what it does |
|---|---|
| `context` | settings, brand (colours, voice rules and samples, existing posts, categories, `nextOrder`), suggested publish dates, recent topics, pending jobs, revisions |
| `fetch <url> --out <file>` | downloads a stock file immediately. Magnific links expire after about 5 min (video) or 15 min (photo). It rejects HTML or JSON error pages and adds the file extension |
| `fetch library/<uuid>/<file> --out <file>` | downloads owner library media (photo, clip, voiceover) from the `marketing` bucket |
| `run start --kind weekly` / `run finish --id X --status succeeded [--log file]` | run bookkeeping |
| `save-brief brief.json [--run id]` | inserts the research brief and returns `{id}` |
| `save-topics topics.json` | inserts the topics and returns `[{id,title,planned_publish_date}]` |
| `check-blog draft.md` | the website's exact rules plus extra checks, giving `{passed,messages,warnings,words,sections}` |
| `save-blog --topic T --md draft.md --cover photo.jpg --stock stock.json [--meta meta.json] [--owner-note "..."] [--item I] [--focus x,y]` | checks the draft (including link safety: only https/mailto/#/relative links, no reference-style definitions), builds a 1600x900 WebP cover (q82, attention crop), uploads it and creates the blog item, or a new version of it, as `pending_review`. `scheduled_for` is the topic's planned date at 10:00 IST |
| `make-carousel --parent B --spec carousel.json [--item I]` | 1080x1350 PNG slides and a PDF |
| `make-graphic --parent B --spec graphic.json [--item I]` | 1080x1080 and 1200x627 PNGs |
| `make-video --parent B --spec video.json [--item I] [--voiceover vo.mp3 --voiceover-asset id]` | 1080x1920 H.264 reel and a JPEG poster. With `voiceover_script` and no voiceover, the item waits in `awaiting_voiceover` |
| `make-video --item I --voiceover vo.mp3 [--voiceover-asset id]` | re-renders from the stored sources (no spec and no re-download needed). Scenes are re-timed to the recording in proportion to each scene's `vo_line` word count (lead 0.25 s, tail 0.45 s, minimum 1.5 s per scene, up to 90 s); the voiceover is loudness-normalised to -14 LUFS (true peak -1.5 dB) and replaces the silent track; clip audio is always muted. The item returns to `pending_review` |
| `preview carousel\|graphic\|video --spec f --out dir [--publish-date YYYY-MM-DD]` / `preview cover --cover photo --out dir [--md draft.md]` | renders locally without uploading, for self-review. Prints `warnings` (dates without a year, dates before the publish date); video previews also write `safe-zone-sheet.jpg` (one frame per scene with the platform UI zones shaded) |
| `topic --id T --status ready` · `job claim [--kinds regenerate]` · `job finish --id J --status done` · `item --id I` | bookkeeping |
| `publish [--dry-list]` | publishes the approved blogs that are due or have a `publish_now` job |

`--item` revises an item: it first moves it to `generating` (the server refuses once a person approved it, and the
dashboard hides Approve meanwhile), bumps `version`, uploads under `items/<id>/v<version>/`, inserts the new asset
rows and only then deletes the old ones, sets the status back to `pending_review` and clears `feedback`. A failed
revision restores the previous status and keeps the previous assets. Approved, published or rejected items cannot be
revised.

`--meta meta.json` (`{primary_keyword, secondary_keywords, faq, sources:[{title,url}]}`) fills `body.meta` and gives
`body.sources` their "Publisher: page title (Mon YYYY)" titles. `--owner-note` stores `body.owner_note`, shown as a
warning above the post in the dashboard (for example "UNVERIFIED SOURCES: ...").

`publish` refuses to push unless `REPO_ROOT` is on `main` (or detached at `origin/main`); use a separate worktree of
main, or `GIT_PUSH=0`. It re-reads each item right before the push and aborts (undoing the local commit) if a
person changed or un-approved it. Pull/push retries stop after a 6-minute budget per post, and no new post starts
after `PUBLISH_BUDGET_MS` (default 12 min). A failure of the website check in another post is transient.

### Draft and spec formats

**Blog draft**: the same frontmatter as `content/blog/*.md`, with every value a quoted string except `order`:
`title, description (<=160), category, image ("<slug>.webp"), imageAlt, order, date ("YYYY-MM-DD")`. The slug is
taken from `image`. Keywords and FAQ belong in `--meta meta.json` (extra frontmatter keys `primary_keyword`,
`secondary_keywords` and `faq` are still read as a fallback and never published). The body needs at least 1000 words and **exactly 8 `##` sections**, because
`npm run test:blog` asserts eight. It may not contain an em dash, raw HTML, a `#` H1 or inline images, and it
needs at least one `](https://...)` source. Link related posts as `../<slug>/`, and those posts must exist.

**Stock metadata** (`--stock`, or `"stock"` next to every `photo`/`clip` in a spec):
`{"id":"<magnific id>","title":"<provider title, verbatim>","url_preview":"...","author":"...","license":"...","note":"<editorial note>"}`.
It is stored in `assets.meta.stock` (on every asset that embeds the file, carousel slides included) and in the body
as the licence trail. Entries marked AI-generated are refused.

**Set rules enforced by `make-*` (v3.2):** a creative may not use a stock id that the blog cover or another
creative of the same blog already uses (`UsageError`, nothing is saved). The JSON result carries `warnings` for
dates in the copy that have no year or fall before the blog's `scheduled_for`.

**Spec fields added in v3.2** (all optional; older specs render as before except where noted):
- Every photo/clip with a person: `subject` `{x,y,w,h}` (fractions of the source photo or clip frame, the face box)
  plus an explicit `{x,y}` `focus`. The render fails if any text line crosses the mapped box (carousel slides,
  graphics, reel scenes). Reel highlight boxes are checked against the glyphs of the line above.
- Carousel: no big numerals (one numbering system: the header counter; eyebrows may say "Step 1"); non-cover slides
  are top-anchored at a fixed y. CTA slides render per platform: PNGs (Instagram) end with `cta_instagram` (default
  "Full guide: link in bio") and `save_line`; the PDF (LinkedIn) keeps the URL button.
- Graphic: stat `compare` `[{label, value, active?}]` (2 or 3 cells); tip `chips` (up to 10 short labels).
- Video: scene `zoom` (1 to 3, punch into a clip around `focus`), scene `logo` ("left"/"right"; default: the calmer
  top corner, or away from the subject), body `outro_text` (verb-led end-card line) and `outro_vo_line` (spoken over
  the end card; with a voiceover the card takes its share of the recording). Default `transition` is `cut`: hard
  cuts between scenes and one fade to black into the end card. The hook's text is visible from frame 0 (only its
  highlight animates in); text sits in the band y 770 to 1240, clear of the bottom 35% platform UI.

**Specs** follow the `content_items.body` shapes in ARCHITECTURE.md. `photo`/`clip` are local paths, resolved
relative to the spec file. The engine uploads each source to `items/<id>/src/` (photos at 2560 px or less; clips
re-encoded only above 45 MB). In the saved body each path becomes `null`, with `stock` and `source` (the storage path)
in its place, so the database never holds local paths.

## Publishing

`.github/workflows/marketing-publish.yml` runs every 30 minutes and can also be started by hand. First, a quick
`curl` check asks the API for approved blogs that are due, plus a read-only `list_jobs` peek at `publish_now` jobs. If
that action is not available, any approved blog counts as a possible publish-now. Only then does the workflow install
dependencies (`npm ci --ignore-scripts`) and run `cli.js publish`, which for each item:

1. downloads the cover and refuses to overwrite a different existing post or photo (identical content counts as already published);
2. writes `content/blog/<slug>.md` (date = today IST, `order` bumped if taken) and `src/assets/photos/<slug>.webp`;
3. runs `node scripts/check-blog.mjs` (`npm ci` first if needed) and reverts the files if it fails;
4. commits `Blog: <title>` as `Dhiti Marketing Bot <marketing-bot@dhitiservices.com>`, then pulls with rebase and pushes `main`, with retries;
5. marks the item `published` with `https://www.dhitiservices.com/blog/<slug>/`, and finishes its `publish_now` job.

Content problems (failed check, slug collision) set the item to `failed` with the reason. Network or push problems
keep it `approved` with an `error` note, and the next run tries again. Render deploys `main` as usual.

**One-time setup:** create the publisher token and store it as the GitHub secret `DHITI_ENGINE_TOKEN`:
`select public.issue_engine_token('publisher', 24*365, 'github publisher');`. If `main` is protected, allow
`github-actions[bot]` to push. Scheduled workflows run only from the default branch, so the workflow file has to be on `main`.

## Local testing

```bash
export DRY_RUN=1 OUT_DIR=/tmp/dhiti-out CHROMIUM_PATH=/opt/pw-browsers/chromium
node src/cli.js check-blog draft.md
node src/cli.js preview carousel --spec carousel.json --out /tmp/preview
# publish against a throwaway checkout, never the real one:
git worktree add --detach /tmp/wt && REPO_ROOT=/tmp/wt GIT_PUSH=0 node src/cli.js publish
git worktree remove --force /tmp/wt
```

In `DRY_RUN` the local store accepts every status, so you can approve an item for a test:
`node -e 'import("./src/store.js").then(s=>s.updateItem("<id>",{status:"approved"}))'`.

## Modules

`cli.js` (commands), `blogcheck.js` (site rules for one file, using the website's own gray-matter and marked
when they are installed), `brand.js` (`getBrandContext()`), `publish/blog.js` (git publishing), `store.js` (edge
function or dry-run backend), `render/*` (Playwright and ffmpeg; Inter for creatives), `config.js`, `log.js`, `util.js`.
