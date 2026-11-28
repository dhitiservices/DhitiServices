# Revisions: apply the owner's feedback, render voiceovers

The owner reviews every item in the dashboard. "Request changes" sets the item to `changes_requested` with
`feedback` and queues a `regenerate` job. Uploading a reel voiceover queues a `render_video` job. A revisions run
(daily) and every weekly run work through both.

## 1. Build the worklist

From `$WORK/ctx.json`:
- `revisions`: items with status `changes_requested` (with `feedback`, `body`, `assets`).
- `pending_jobs`: queued or running jobs. Relevant kinds: `regenerate {content_item_id, feedback}`,
  `render_video {content_item_id, library_asset_id}`, `run_weekly {}`. Ignore `publish_now` (GitHub Actions
  publishes).

Claim the jobs you will do now (moves them `queued` to `running`, so no other session picks them up):

```bash
source ~/dhiti-work/env.sh && cd "$ENGINE" && node --input-type=module -e "import {claimJobs} from './src/store.js'; console.log(JSON.stringify(await claimJobs({limit: 25, kinds: ['regenerate','render_video']})))" | tee "$WORK/claimed.json"
```

Only claimed jobs can be finished (`job finish` answers 409 for a job that is not `running`), so always claim
first. Jobs whose worker crashed are re-claimed automatically: `claim_jobs` also returns jobs left `running` past
their lease (3 hours for `regenerate` and `render_video`, 10 hours for `run_weekly`), with an `error` noting the
take-over. Never claim `publish_now` (sessions are refused; GitHub Actions publishes).

Worklist = one entry per content item: every claimed/abandoned `regenerate` job plus every `revisions` item without
a job (dedupe by item id; if several jobs exist for one item, combine their feedback in order and finish all of
them). `render_video` jobs are separate entries.

For each entry, load the current item and its assets:

```bash
source ~/dhiti-work/env.sh && cd "$ENGINE" && mkdir -p "$WORK/rev/<id>" && node --input-type=module -e "import {getItem} from './src/store.js'; console.log(JSON.stringify(await getItem(process.argv[1]), null, 2))" "<id>" > "$WORK/rev/<id>/item.json"
```

**Never change an item whose status is `approved`, `published` or `rejected`.** If a job targets one, finish the job
as failed with the error "item is <status>; not changed" and move on.

## 2. Read the feedback like an editor

- Feedback may be written in English, Marathi, Hindi or a mix (Hinglish/Minglish), and may be terse ("hook weak",
  "photo badla", "2nd slide jasta text"). Understand it in whatever language; all content stays in English.
- Turn it into a numbered change list in `$WORK/rev/<id>/changes.md`: each point, what you will change, and where.
- Apply every point. Change **only** what the feedback asks for, plus what must change for consistency (for
  example a new headline needs a matching caption line). Keep everything the owner did not mention.
- If a point is ambiguous, choose the interpretation that best serves the reader and the brand, and note it in the
  run log. If a point would break a hard rule (fabricated number, a named client, AI imagery, an em dash), do the
  closest compliant thing and explain in the log.
- All quality rules still apply: run the same lint, checks and visual review as for new items.

## 3. Blog revisions

1. Rebuild the draft file from the stored body:
   ```bash
   source ~/dhiti-work/env.sh && cd "$ENGINE" && node --input-type=module -e "import fs from 'node:fs'; import {renderFrontmatter} from './src/blogcheck.js'; const it = JSON.parse(fs.readFileSync(process.argv[1],'utf8')); const b = it.body; fs.mkdirSync(process.argv[2],{recursive:true}); fs.writeFileSync(process.argv[2]+'/'+b.slug+'.md', renderFrontmatter(b.frontmatter) + '\n' + b.markdown.trim() + '\n'); console.log(b.slug)" "$WORK/rev/<id>/item.json" "$WORK/rev/<id>"
   ```
   (If the output's first lines are not a `---` frontmatter block, write the frontmatter by hand in the house
   format from `blog-writing.md` section 10.)
2. Rebuild the claims ledger and its sources, then edit the markdown per the change list. Keep the slug, `image`,
   `order` and `date` unless the feedback asks.
   ```bash
   source ~/dhiti-work/env.sh && cd "$ENGINE" && jq '[.body.claims[] | del(.verified, .sha256, .text_sha256, .source_text_path, .match, .fetched_at, .phrase, .pages, .claim_hash, .factcheck) | if .derived then .derived |= {steps, from} else . end | if .extra_quotes then .extra_quotes |= map(del(.sha256, .text_sha256, .source_text_path, .match, .fetched_at, .pages)) else . end]' "$WORK/rev/<id>/item.json" > "$WORK/rev/<id>/claims.json" && node src/cli.js restore-sources --item "<id>"
   ```
   `restore-sources` brings back the exact server-fetched sources the claims were verified against (checked by
   sha256). For every rule the post states, also fetch the source again (`fetch-source`) and search for newer
   circulars or advisories (`blog-writing.md` section 1, point 6): a restored source proves what the page said
   then, not that it is still current. New facts need new sources fetched with `fetch-source` and new claims. Edit
   `claim_text` whenever you edit a factual sentence.
   **Older blogs** (saved before the v4.1 gate: no `body.claims_check.server`, or `restore-sources` fails, or a claim
   has a free-text `derived.arithmetic`): fetch every source again with `fetch-source`, rewrite each derived claim
   with `derived.steps`, and build anything missing from scratch (`blog-writing.md` section 1b). The engine server
   refuses creatives and LinkedIn posts for a blog without its stamp, so re-save such a blog (steps 3 to 5) before
   you revise or re-render any of its creatives, even when only a creative was asked for.
3. Run the full editing pass from `blog-editing.md` (lint, `check-blog --claims`, rubric, and the independent
   fact-check of step 4, which writes `$WORK/rev/<id>/factcheck.json`; every claim needs a "correct" verdict for its
   current text, so the checker re-checks every claim you added or changed).
4. Cover: if the feedback asks for a different photo, choose one with `stock-selection.md` and write a new
   `stock.json`. Otherwise reuse the current cover: download the item's `blog_cover` asset
   (`assets[].storage_path` where `kind` is `blog_cover`) with `downloadFile` (see `stock-selection.md` section 1)
   and rebuild `stock.json` from `body.cover_stock` and the asset's `meta.stock`. Rebuild `meta.json` from
   `body.meta` (keywords, FAQ) and `body.sources` (titles in "Publisher: page title (Mon YYYY)" form).
5. Save a new version:
   ```bash
   source ~/dhiti-work/env.sh && cd "$ENGINE" && node src/cli.js save-blog --topic "<topic_id>" --md "$WORK/rev/<id>/<slug>.md" --claims "$WORK/rev/<id>/claims.json" --factcheck "$WORK/rev/<id>/factcheck.json" --cover "<cover file>" --stock "$WORK/rev/<id>/stock.json" --meta "$WORK/rev/<id>/meta.json" --item "<id>"
   ```
6. Consistency: if the revision removed or changed a fact that a derived item (carousel, graphic, reel) of this
   blog still uses, and that derived item is `pending_review` or `awaiting_voiceover`, revise it too (same rules)
   and say so in the run log. Never touch approved derived items; mention the mismatch in the log instead.
   The same goes for the blog's LinkedIn post (`node src/cli.js social list --blog <id>`): if its caption uses a
   changed fact and it is `draft`, `pending_review` or `failed`, save it again with `save-social --item <post id>`
   (`linkedin.md`). An approved post cannot be changed by a session: log an owner action instead.

## 4. Carousel and graphic revisions

1. Rebuild the spec from `item.body` (same fields as `carousel.md` / `graphics.md`).
2. Photos: the stored body references stock metadata, not local files. Re-obtain each photo the new spec keeps:
   library items with `downloadFile`; the parent blog's cover via the parent's `blog_cover` asset (no credits);
   any other Magnific photo by calling `stock_download` for the same id and `cli.js fetch` at once (log the
   credits). Rebuild the spec's `stock` array.
3. Apply the change list, lint, preview, Read every PNG, fix, then save with `--item`:
   ```bash
   # carousel
   source ~/dhiti-work/env.sh && cd "$ENGINE" && node src/cli.js make-carousel --parent "<blog item id>" --spec "$WORK/rev/<id>/carousel.json" --item "<id>"
   # graphic
   source ~/dhiti-work/env.sh && cd "$ENGINE" && node src/cli.js make-graphic --parent "<blog item id>" --spec "$WORK/rev/<id>/graphic.json" --item "<id>"
   ```

## 5. Reel revisions

1. Rebuild the spec from `item.body`. The scene sources were uploaded to `items/<id>/src/`: download each scene's
   stored source with `downloadFile` (the storage path is recorded on the scene or in the item's assets; list them
   with `listAssets` if needed). Use `stock_download` again only for new footage.
2. Apply the change list. If the feedback changes the spoken words, update `vo_line`s and `voiceover_script`
   together.
3. Voiceover:
   - If the item has a recorded voiceover (`body.voiceover.library_asset_id`) **and** the script is unchanged,
     download it and re-render with `--voiceover`.
   - If the script changed, the old recording no longer matches: save without `--voiceover`, so the item returns
     to `awaiting_voiceover`, and say in the run log that the owner needs to record the new script.
4. Preview, extract frames, Read them, fix, then:
   ```bash
   source ~/dhiti-work/env.sh && cd "$ENGINE" && node src/cli.js make-video --parent "<blog item id>" --spec "$WORK/rev/<id>/video.json" --item "<id>" [--voiceover "$WORK/rev/<id>/voiceover.<ext>"]
   ```

## 6. `render_video` jobs (the owner uploaded a voiceover)

1. Load the item (`getItem`) and the voiceover row with the Supabase connector:
   `select id, storage_path, mime, title from public.library_assets where id = '<library_asset_id>';`
2. Download the voiceover (storage path `library/<uuid>/<file>`; `sign_download` accepts library paths):
   ```bash
   source ~/dhiti-work/env.sh && mkdir -p "$WORK/rev/<id>" && cd "$ENGINE" && node --input-type=module -e "import {downloadFile} from './src/store.js'; import fs from 'node:fs'; fs.writeFileSync(process.argv[2], await downloadFile(process.argv[1])); console.log(JSON.stringify({ok:true,out:process.argv[2]}))" "<storage_path>" "$WORK/rev/<id>/voiceover.<ext>"
   ```
3. Check the recording: `ffprobe -v error -show_entries format=duration -of csv=p=0 <file>`. If it is shorter than
   15 s or longer than 40 s, or silent, do not render: finish the job as failed with a clear reason the owner can
   act on (for example "voiceover is 52 s; the reel allows 22 to 35 s, please record the script at a brisker pace").
4. Re-render from the stored sources (no `--spec` needed: the engine downloads every scene source from
   `items/<id>/src/` itself, keeps the saved text, re-times and records `voiceover {library_asset_id, duration}`):
   ```bash
   source ~/dhiti-work/env.sh && cd "$ENGINE" && node src/cli.js make-video --item "<id>" --voiceover "$WORK/rev/<id>/voiceover.<ext>" --voiceover-asset "<library_asset_id>"
   ```
   If it refuses with `no fact list verified by the engine server`, the blog is an older one: re-save the blog first
   (section 3, "Older blogs"), then run this step again. If it refuses with `not backed by the blog's verified
   claims`, the reel's text states something the blog no longer says: fix the scene text (and `vo_line`) with a
   full spec as below, and tell the owner in the run log that the script changed.
   If the owner's feedback also changes the scenes, write a full spec with local paths instead and add
   `--spec "$WORK/rev/<id>/video.json"` to the same command. The engine re-times scenes to the recording
   (proportional to each scene's `vo_line` words), mixes the audio at -14 LUFS with the footage muted, and sets the
   item to `pending_review`.
5. Extract 3 frames and Read them; also confirm the MP4 has an audio stream
   (`ffprobe -v error -select_streams a -show_entries stream=codec_name -of csv=p=0 <mp4>` prints `aac`).
6. Record usage: `update public.library_assets set used_count = used_count + 1, content_item_id = '<item id>' where id = '<library_asset_id>';`

## 7. Close every job

```bash
source ~/dhiti-work/env.sh && cd "$ENGINE" && node src/cli.js job finish --id "<job id>" --status done
# on failure:
source ~/dhiti-work/env.sh && cd "$ENGINE" && node src/cli.js job finish --id "<job id>" --status failed --error "<short, owner-readable reason>"
```

A job is `done` only when the new version is saved. Every claimed job ends `done` or `failed` before the run
finishes; never leave one `running`.
