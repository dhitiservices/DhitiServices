# Dhiti Marketing Engine — Architecture & Contracts

Autonomous blog + creative pipeline for Dhiti Services. Research → plan → blog →
cover image → carousel → graphics → reel video → human approval → publish.

## Components

| Part | Path | Runs on |
|---|---|---|
| Engine (Node 20+, plain ESM JavaScript, no TypeScript) | `marketing/engine/` | GitHub Actions (cron + manual) |
| Dashboard (React 18 + Vite 5 + Tailwind 3, plain JSX) | `marketing/dashboard/` | Netlify (static) |
| Database, auth, storage | Supabase project `yexxrcgxhwsopssfyylo` | Supabase |
| Workflows | `.github/workflows/marketing-weekly.yml`, `.github/workflows/marketing-jobs.yml` | GitHub Actions |

The live website (repo root) is built by Render from `main`. Publishing a blog =
committing `content/blog/<slug>.md` + `src/assets/photos/<slug>.webp` to `main`.
Nothing under `marketing/` may change the website build. Root `npm run build` must keep passing.

## Environment variables (engine)

| Name | Required | Notes |
|---|---|---|
| `SUPABASE_URL` | yes | `https://yexxrcgxhwsopssfyylo.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | GitHub secret. Never in dashboard. |
| `ANTHROPIC_API_KEY` | yes | GitHub secret. Research + writing. |
| `GEMINI_API_KEY` | yes | GitHub secret. All AI images. |
| `PEXELS_API_KEY` | optional | Stock video clips for reels. Without it, reels use Gemini stills with motion. |
| `MOCK_AI=1` | dev | Deterministic fake Claude/Gemini/Pexels responses; no network to AI vendors. |
| `DRY_RUN=1` | dev | No Supabase, no git. Everything written under `marketing/engine/out/` as files + `out/db.json`. |
| `REPO_ROOT` | optional | Defaults to repo root (two levels above engine). |
| `GIT_PUSH=0` | optional | Commit but do not push. |

## Supabase schema (already applied — do not change without a migration)

- `allowed_users(email pk, role)` — dashboard allowlist. `is_team()` SQL fn checks JWT email.
- `settings(id=1, data jsonb)` — keys: `blogs_per_week`(2), `carousels_per_blog`(1), `graphics_per_blog`(2),
  `videos_per_blog`(1), `publish_days`(["Tuesday","Thursday"]), `audience`(text), `avoid_topics`(text[]),
  `extra_guidance`(text), `writer_model`("claude-opus-5-5"), `image_model`("gemini-3.1-flash-image").
- `runs(id, kind['weekly'|'jobs'|'publish'|'manual'], status['running'|'succeeded'|'failed'], started_at, finished_at, log text, usage jsonb, error)`
- `research_briefs(id, run_id, week_start date, summary, trends jsonb, pain_points jsonb, competitor_notes jsonb, opportunities jsonb, sources jsonb)`
  - `trends`: `[{title, detail, source_urls[]}]`; `pain_points`: `[{audience, pain, evidence, source_urls[]}]`;
    `competitor_notes`: `[{competitor, url, observation}]`; `opportunities`: `[{idea, why_now, source_urls[]}]`; `sources`: `[{title,url}]`
- `topics(id, brief_id, week_start, title, angle, primary_keyword, secondary_keywords text[], audience, category, rationale, priority, planned_publish_date, status['planned'|'producing'|'ready'|'skipped'|'failed'], error)`
- `content_items(id, topic_id, parent_id, type['blog'|'carousel'|'graphic'|'video'], title, status, body jsonb, feedback, version, scheduled_for, approved_at, approved_by, published_at, published_url, error, created_at, updated_at)`
  - status: `generating` → `pending_review` → (`approved` | `changes_requested` | `rejected`) → `published`; `failed` on error.
  - Derived items (carousel/graphic/video) have `parent_id` = the blog item id and same `topic_id`.
- `assets(id, content_item_id, kind['blog_cover'|'carousel_slide'|'carousel_pdf'|'graphic'|'video'|'video_poster'], storage_path, mime, width, height, position, meta)`
- `jobs(id, kind['run_weekly'|'regenerate'|'publish_now'], payload jsonb, status['queued'|'running'|'done'|'failed'], requested_by, error, created_at, started_at, finished_at)`
  - `regenerate` payload: `{content_item_id, feedback}`; `publish_now` payload: `{content_item_id}`; `run_weekly` payload: `{}`
- Storage bucket `marketing` (private). Path convention: `items/<content_item_id>/v<version>/<file>`.
- RLS: authenticated team can SELECT all; UPDATE `settings`, `topics`, `content_items`; INSERT `jobs` with status 'queued'.
  Storage: team can read bucket `marketing` (dashboard uses signed URLs). Engine uses service role.

## content_items.body shapes

```jsonc
// blog
{ "slug": "kebab-case", "frontmatter": { "title", "description" /* <=160 chars */, "category", "image" /* "<slug>.webp" */,
  "imageAlt", "order" /* int, max existing + 1 */, "date" /* "YYYY-MM-DD" */ },
  "markdown": "body without frontmatter", "word_count": 1234, "meta": { "primary_keyword", "secondary_keywords": [], "faq": [{"q","a"}] },
  "image_prompt": "prompt used for cover", "sources": [{"title","url"}], "checks": { "passed": true, "messages": [] } }
// carousel  (renders 1080x1350 PNG slides + one PDF)
{ "caption_linkedin": "...", "caption_instagram": "...", "hashtags": ["..."],
  "slides": [ { "kind": "cover"|"point"|"stat"|"quote"|"cta", "eyebrow": "", "headline": "", "body": "", "stat": "", "image": false } ] }
// graphic   (1080x1080 PNG, and 1200x627 for LinkedIn)
{ "kind": "quote"|"stat"|"tip", "headline": "", "body": "", "stat": "", "attribution": "", "caption": "", "hashtags": [], "background_prompt": "" }
// video     (1080x1920 MP4 reel, 20–45 s, burned-in captions, no voiceover)
{ "caption": "", "hashtags": [], "music": null, "scenes": [ { "duration": 4.5, "on_screen_text": "", "visual_query": "stock search terms", "visual_prompt": "gemini fallback prompt" } ] }
```

## Brand (from repo)

- Colours: brand red `#EE0800` (deep `#C20600`, bright `#FF3322`), ink `#15161A` (soft `#3a3d45`, mute `#6b6f7a`), white, warm off-white `#FAF7F2`.
- Fonts: Fraunces (display/headlines), Plus Jakarta Sans (body), Space Grotesk (labels/eyebrows/numbers). Google Fonts.
- Logo: `src/assets/logos/dhiti-logo.webp` (wordmark), `src/assets/logos/dhiti-mark.webp` (mark).
- Voice: read 3 recent posts in `content/blog/` — practical, specific, plain-English, scenario openings, bold key sentence,
  cites real external sources inline, no hype, no em dashes (—), illustrative examples labelled as illustrative.
- Website blog rules (enforced by `scripts/check-blog.mjs`): ≥1000 words, ≥5 `##` sections, no "—", description ≤160 chars,
  at least one `](https:` external link, no raw HTML, category from existing set
  (Travel operations, Hotel operations, Operations, Customer support, Quality, People & careers).

## Engine module contracts (`marketing/engine/src/`)

- `config.js` — `export const config` (env parsing, paths: `repoRoot`, `engineRoot`, `outDir`), `isMock`, `isDryRun`.
- `log.js` — `log(...args)`, `getLogText()` buffer (saved into `runs.log`).
- `store.js` — data access, same API for Supabase and DRY_RUN JSON file:
  `getSettings()`, `createRun(kind)`, `finishRun(id, {status, error, usage})`, `insertBrief(obj)`, `insertTopics(arr)`,
  `updateTopic(id, patch)`, `insertItem(obj)`, `updateItem(id, patch)`, `getItem(id)`, `listItems(filter)`,
  `insertAsset(obj)`, `listAssets(itemId)`, `deleteAssets(itemId)`, `uploadFile(storagePath, buffer, mime)`, `downloadFile(storagePath)`,
  `claimJobs(limit)` (queued→running, returns rows), `finishJob(id, {status, error})`, `listRecentTopics(weeks)`.
- `ai/claude.js` — `askJSON({system, prompt, schema, webSearch=false, maxSearches, effort})` → parsed object; `askText(...)`.
  Uses `@anthropic-ai/sdk`, model from settings (default `claude-opus-5-5`), streaming + `finalMessage()`,
  structured output via `output_config.format` (json_schema), web search tool `web_search_20260209` when `webSearch`.
  Tracks token usage in a module-level accumulator `getUsage()`. In MOCK_AI returns schema-shaped fixtures.
- `ai/gemini.js` — `generateImage({prompt, aspectRatio, size})` → `Buffer` (PNG). REST
  `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` header `x-goog-api-key`,
  body `{contents:[{parts:[{text}]}], generationConfig:{responseModalities:["IMAGE"], imageConfig:{aspectRatio, imageSize}}}`,
  image at `candidates[0].content.parts[].inlineData.data` (base64). Model from settings (`gemini-3.1-flash-image`, fallback `gemini-2.5-flash-image`). Retries. MOCK_AI → branded placeholder PNG made with sharp.
- `ai/stock.js` — `searchVideos(query, {orientation:'portrait', minDuration})` → `[{url, width, height, duration}]` via Pexels; `downloadTo(url, path)`.
- `brand.js` — `getBrandContext()` → `{colors, fonts, logoPath, markPath, voiceSamples:[{title, excerpt}], existingPosts:[{slug,title,category,description}], categories, nextOrder}`.
- `pipeline/research.js` — `runResearch({settings, recentTopics})` → brief object (shape above).
- `pipeline/plan.js` — `planTopics({brief, settings, brand, recentTopics})` → array of topic objects (count = blogs_per_week).
- `pipeline/blog.js` — `writeBlog({topic, brief, brand, settings, feedback?, previous?})` → blog body (shape above) incl. self-check + repair loop.
- `pipeline/cover.js` — `makeCover({blog, brand})` → `{buffer (webp 1600x900), prompt}`.
- `pipeline/social.js` — `planCarousel({blog, brand, feedback?})`, `planGraphics({blog, brand, count, feedback?})`, `planVideo({blog, brand, feedback?})` → bodies.
- `render/carousel.js` — `renderCarousel(body, {brand})` → `{slides: [Buffer png 1080x1350], pdf: Buffer}` (Playwright + HTML templates in `marketing/engine/templates/`).
- `render/graphic.js` — `renderGraphic(body, {brand, background?: Buffer})` → `{square: Buffer 1080x1080, landscape: Buffer 1200x627}`.
- `render/video.js` — `renderVideo(body, {brand, workDir})` → `{mp4: Buffer, poster: Buffer}` (ffmpeg via `ffmpeg-static`, overlays rendered with Playwright).
- `publish/blog.js` — `publishBlog(item, {coverBuffer})` → `{url, commit}`: writes md + webp into repo, runs `node scripts/check-blog.mjs`,
  git commit as "Dhiti Marketing Bot", push to `main` (unless `GIT_PUSH=0`/DRY_RUN). URL `https://www.dhitiservices.com/blog/<slug>/`.
- `orchestrate.js` — `runWeekly()`, `produceTopic(topic, brief)`, `regenerate(itemId, feedback)`, `processJobs()`, `publishApproved()`.
- `cli.js` — `node src/cli.js weekly|jobs|publish|produce-demo`. `jobs` = processJobs + publishApproved. Exit non-zero on failure.

All Claude prompts live in `marketing/engine/prompts/*.md` (system prompts) so they can be tuned without code changes.

## Local development in this container

- `CHROMIUM_PATH` (optional env): when set, Playwright launches `chromium.launch({executablePath: CHROMIUM_PATH})`.
  Locally use `CHROMIUM_PATH=/opt/pw-browsers/chromium`. In GitHub Actions leave unset (workflow runs `npx playwright install --with-deps chromium`).
- Smoke test: `cd marketing/engine && CHROMIUM_PATH=/opt/pw-browsers/chromium DRY_RUN=1 MOCK_AI=1 node src/cli.js produce-demo`
  must produce a full demo (brief, topics, blog md, cover webp, carousel PNGs+PDF, graphics, reel MP4) under `out/`.
- Dependencies are already installed (`@anthropic-ai/sdk` 1.14, `@supabase/supabase-js`, `sharp`, `playwright` 1.56, `ffmpeg-static`, `gray-matter`).
  Do not add dependencies without a strong reason; if you must, `npm install <pkg>` in `marketing/engine`.
- Claude API reference (read before writing Claude code): `/tmp/claude-0/bundled-skills/2.1.332/742765aab06b7caa7d98cec7babbd09d/claude-api/typescript/claude-api/README.md`,
  `.../typescript/claude-api/tool-use.md` (structured outputs, server tools), `.../typescript/claude-api/streaming.md`, `.../shared/tool-use-concepts.md` (pause_turn).
