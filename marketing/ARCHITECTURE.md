# Dhiti Marketing Engine — Architecture & Contracts (v2)

Autonomous weekly blog + creative pipeline for Dhiti Services:
research → plan 3 topics → 3 SEO blogs → stock cover photo → carousel → graphics → reel video →
human approval in the dashboard → blog auto-published to www.dhitiservices.com.

## Hard constraints (from the owner)

1. **No paid Claude API.** The "brain" (research, planning, writing, choosing stock) is a **scheduled Claude Code
   cloud session** that follows `marketing/PLAYBOOK.md`. It uses its own WebSearch/WebFetch tools and the
   Magnific + Supabase connectors. Engine code never calls the Anthropic API and never needs an Anthropic key.
2. **No AI image/video generation.** Every image and video is **licensed Magnific (Freepik) stock**, found with
   `mcp__Magnific__stock_search` (use `ai_generated: "excluded"`) and downloaded with `mcp__Magnific__stock_download`.
   Download URLs expire in ~5 minutes (video) / ~15 minutes (photo): download immediately with `cli.js fetch`.
   Never call any `images_generate`, `video_generate` or other generation tool.
3. **3 blogs per week** (settings.blogs_per_week = 3), each with 1 carousel, 2 graphics, 1 reel.
4. **Dashboard font: SF Pro only** (system stack `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"`),
   Dhiti colours, premium/smooth/real-app feel. Creatives (carousel/graphic/video) use **Inter** — the closest
   openly licensed match to SF Pro (Apple's SF Pro licence does not allow use in marketing graphics).

## Components

| Part | Path | Runs on |
|---|---|---|
| Playbook (instructions the scheduled Claude session follows) | `marketing/PLAYBOOK.md`, `marketing/playbook/*.md` | Claude Code scheduled cloud session (env "DhitiServices") |
| Engine CLI (Node 20+, plain ESM JS; render, upload, validate, publish) | `marketing/engine/` | the Claude session + GitHub Actions |
| Engine API (Supabase Edge Function `engine`, Deno TS) | `marketing/supabase/functions/engine/index.ts` | Supabase |
| Dashboard (React 18 + Vite 5 + Tailwind 3 + framer-motion, JSX) | `marketing/dashboard/` | Netlify |
| Publish workflow | `.github/workflows/marketing-publish.yml` | GitHub Actions, every 30 min |

Website (repo root) is built by Render from `main`. Publishing a blog = committing
`content/blog/<slug>.md` + `src/assets/photos/<slug>.webp` to `main`. Nothing under `marketing/` may change the
website build; root `npm run build` must keep passing.

## Auth model (no service key in sessions)

- Table `engine_tokens(id, token_hash, kind['session'|'publisher'], label, expires_at, created_at, revoked)`.
- SQL `public.issue_engine_token(p_kind text, p_hours int, p_label text) returns text` (plaintext token, stores sha256;
  executable by `postgres`/`service_role` only). The Claude session gets a token via the Supabase connector:
  `select public.issue_engine_token('session', 8, 'weekly run');`
- Long-lived `publisher` token (kind publisher, 24*365 h) lives in GitHub secret `DHITI_ENGINE_TOKEN`.
- Edge Function `engine` (verify_jwt **false**; it authenticates itself): header `x-engine-token: <token>`.
  Uses the auto-provided `SUPABASE_SERVICE_ROLE_KEY` inside the function. Rejects missing/expired/revoked tokens (401).
  `publisher` tokens may only call: get_settings, list_items, get_item, list_assets, sign_download, update_item,
  create_run, finish_run, claim_jobs, finish_job, list_jobs.
- URL: `https://yexxrcgxhwsopssfyylo.supabase.co/functions/v1/engine`. Also send headers
  `apikey: <publishable key>` and `Authorization: Bearer <publishable key>` (publishable key:
  `sb_publishable_eggopcLFltAS1Q3nTmGecQ_dUMTCIhR`, public by design).
- Request: `POST {action, payload}` JSON → `{ok:true, data}` or `{ok:false, error}` (HTTP 4xx/5xx).

### Edge function actions

| action | payload | data |
|---|---|---|
| `get_settings` | `{}` | settings.data object |
| `context` | `{weeks?: 8}` | `{settings, recent_topics:[{title,primary_keyword,week_start,status}], pending_jobs:[...], revisions:[items with status changes_requested incl. feedback, body, assets]}` |
| `create_run` | `{kind}` | run row |
| `finish_run` | `{id, status, error?, log?, usage?}` | run row |
| `insert_brief` | brief object | row |
| `insert_topics` | `{topics:[...]}` | rows |
| `update_topic` | `{id, patch}` | row |
| `insert_item` | item object | row |
| `update_item` | `{id, patch}` | row |
| `get_item` | `{id}` | row + `assets` |
| `list_items` | `{status?, type?, topic_id?, parent_id?, limit?}` | rows |
| `insert_asset` | asset object | row |
| `list_assets` | `{content_item_id}` | rows |
| `delete_assets` | `{content_item_id}` | `{deleted}` |
| `sign_upload` | `{path}` | `{signedUrl, token, path}` (storage `createSignedUploadUrl`, bucket `marketing`, upsert true) |
| `sign_download` | `{path, expiresIn?}` | `{signedUrl}` |
| `claim_jobs` | `{kinds?:[], limit?}` | jobs moved queued→running (conditional update) |
| `finish_job` | `{id, status, error?}` | row |
| `list_jobs` | `{kind?, status?, limit?}` (read-only; publisher: `kind:'publish_now'` only) | rows |

v2.3.0 additions (v3): item status `awaiting_voiceover` (session-settable), job kind `render_video` (session default
claim), `sign_download` also reads `library/<uuid>/<file>`. Extra session-only helpers: `get_topic`, `list_topics`,
`get_brief`, `delete_files` (see `marketing/supabase/README.md`).

Patch fields are whitelisted per table (never allow changing ids/created_at).

## Supabase schema (applied; see migrations)

- `allowed_users(email pk, role)`, `is_team()`.
- `settings(id=1, data jsonb)` — keys: `blogs_per_week`(3), `carousels_per_blog`(1), `graphics_per_blog`(2),
  `videos_per_blog`(1), `publish_days`(["Monday","Wednesday","Friday"]), `audience`, `avoid_topics`[], `extra_guidance`.
- `runs(id, kind['weekly'|'jobs'|'publish'|'manual'], status['running'|'succeeded'|'failed'], started_at, finished_at, log, usage jsonb, error)`
- `research_briefs(id, run_id, week_start date, summary, trends, pain_points, competitor_notes, opportunities, sources)`
  - `trends`: `[{title, detail, source_urls[]}]`; `pain_points`: `[{audience, pain, evidence, source_urls[]}]`;
    `competitor_notes`: `[{competitor, url, observation}]`; `opportunities`: `[{idea, why_now, source_urls[]}]`; `sources`: `[{title,url}]`
- `topics(id, brief_id, week_start, title, angle, primary_keyword, secondary_keywords[], audience, category, rationale, priority, planned_publish_date, status['planned'|'producing'|'ready'|'skipped'|'failed'], error)`
- `content_items(id, topic_id, parent_id, type['blog'|'carousel'|'graphic'|'video'], title, status, body jsonb, feedback, version, scheduled_for, approved_at, approved_by, published_at, published_url, error, created_at, updated_at)`
  - status: `generating` → `pending_review` → (`approved` | `changes_requested` | `rejected`) → `published`; `failed`.
  - Derived items (carousel/graphic/video) have `parent_id` = blog item id and same `topic_id`.
- `assets(id, content_item_id, kind['blog_cover'|'carousel_slide'|'carousel_pdf'|'graphic'|'video'|'video_poster'], storage_path, mime, width, height, position, meta)`
  - `meta.stock`: `[{provider:'magnific', id, title, url_preview}]` — licence trail for every stock file used.
- `jobs(id, kind['run_weekly'|'regenerate'|'publish_now'], payload, status, requested_by, error, ...)`
  - Dashboard "Request changes" sets item `changes_requested` + `feedback` and inserts `regenerate {content_item_id, feedback}`.
  - Dashboard "Run now" inserts `run_weekly`. "Publish now" inserts `publish_now {content_item_id}`.
- Storage bucket `marketing` (private). Paths: `items/<content_item_id>/v<version>/<file>`.
- RLS: team (authenticated + allowlisted) SELECT all; UPDATE settings/topics/content_items; INSERT jobs (queued only);
  read storage `marketing` (signed URLs).

## content_items.body shapes

```jsonc
// blog
{ "slug": "kebab-case", "frontmatter": { "title", "description" /* <=160 chars */, "category", "image" /* "<slug>.webp" */,
  "imageAlt", "order" /* int */, "date" /* "YYYY-MM-DD" */ },
  "markdown": "body without frontmatter", "word_count": 1234, "meta": { "primary_keyword", "secondary_keywords": [], "faq": [{"q","a"}] },
  "sources": [{"title","url"}], "checks": { "passed": true, "messages": [] }, "cover_stock": {"id","title"} }
// carousel  (1080x1350 PNG slides + one PDF)
{ "caption_linkedin": "...", "caption_instagram": "...", "hashtags": ["..."],
  "slides": [ { "kind": "cover"|"point"|"stat"|"quote"|"cta", "eyebrow": "", "headline": "", "body": "", "stat": "", "photo": "<local file or null>" } ] }
// graphic   (1080x1080 + 1200x627 PNG)
{ "kind": "quote"|"stat"|"tip", "headline": "", "body": "", "stat": "", "attribution": "", "caption": "", "hashtags": [], "photo": "<local file or null>" }
// video     (1080x1920 H.264 MP4 reel, 20–40 s, burned-in text, no voiceover)
{ "caption": "", "hashtags": [], "scenes": [ { "duration": 4.5, "on_screen_text": "", "clip": "<local mp4>"|null, "photo": "<local jpg>"|null } ] }
```
Local file fields are stripped/replaced by stock metadata before saving to the DB.

## Brand

- Colours: brand red `#EE0800` (deep `#C20600`, bright `#FF3322`), ink `#15161A` (soft `#3a3d45`, mute `#6b6f7a`),
  white, warm off-white `#FAF7F2`.
- Logo: `src/assets/logos/dhiti-logo.webp` (wordmark), `src/assets/logos/dhiti-mark.webp` (mark).
- Voice: read recent posts in `content/blog/` — practical, specific, plain English, scenario openings, a bold key
  sentence, real external sources cited inline, no hype, no em dashes (—), illustrative examples labelled.
- Website blog rules (`scripts/check-blog.mjs`): ≥1000 words, ≥5 `##` sections, no "—", description ≤160 chars,
  ≥1 `](https:` link, no raw HTML, category from existing set
  (Travel operations, Hotel operations, Operations, Customer support, Quality, People & careers).

## Engine CLI (`marketing/engine/src/cli.js`) — what the Claude session calls

Env: `ENGINE_TOKEN` (required unless DRY_RUN), `ENGINE_URL` (default above), `DRY_RUN=1` (local JSON store under
`out/`), `CHROMIUM_PATH` (optional Playwright executable, e.g. `/opt/pw-browsers/chromium`), `REPO_ROOT`, `GIT_PUSH=0`.
Every command prints a single JSON object to stdout (logs to stderr) and exits non-zero on failure.

| command | does |
|---|---|
| `context` | settings + brand context (existing posts, categories, next order, voice samples) + recent topics + pending jobs + revisions |
| `fetch <url> --out <file>` | download a stock file immediately (retries); prints `{path, bytes, mime}` |
| `run start --kind weekly` / `run finish --id X --status succeeded [--log file]` | run bookkeeping |
| `save-brief <brief.json>` | insert research brief → `{id}` |
| `save-topics <topics.json>` | insert topics (array) → `[{id,title}]` |
| `check-blog <draft.md>` | validate a full markdown file with frontmatter using the site's exact rules → `{passed, messages, words, sections}` |
| `save-blog --topic <id> --md <draft.md> --cover <photo> --stock <stock.json> [--item <id>]` | validates, makes 1600x900 webp cover, uploads, creates (or new version of) blog item `pending_review`, sets `scheduled_for` = topic.planned_publish_date 10:00 IST |
| `make-carousel --parent <blogItemId> --spec <carousel.json> [--item <id>]` | renders slides + PDF, uploads, item `pending_review` |
| `make-graphic --parent <blogItemId> --spec <graphic.json> [--item <id>]` | renders 1080² + 1200×627, uploads |
| `make-video --parent <blogItemId> --spec <video.json> [--item <id>]` | renders reel MP4 + poster, uploads |
| `preview <kind> --spec <file> --out <dir>` | render locally without uploading (for self-review) |
| `topic --id <id> --status ready` | update topic status |
| `job finish --id <id> --status done` | finish a job |
| `publish` | publish approved blogs due now (or with a `publish_now` job): download cover → write md+webp → run `node scripts/check-blog.mjs` → commit "Blog: <title>" as "Dhiti Marketing Bot <marketing-bot@dhitiservices.com>" → `git pull --rebase` → push `main` → item `published` with URL `https://www.dhitiservices.com/blog/<slug>/` |

`--item <id>` = revision: bump `version`, upload under new version path, replace asset rows, status back to
`pending_review`, clear `feedback`.

## Engine modules (`marketing/engine/src/`)

- `config.js`, `log.js`, `util.js` (exist; adapt as needed).
- `store.js` — same function names as before, backed by the edge function (`ENGINE_TOKEN`) or the DRY_RUN JSON
  file. `uploadFile(path, buffer, mime)` = `sign_upload` then PUT to signed URL; `downloadFile(path)` = `sign_download` then GET.
- `brand.js` — `getBrandContext()` → `{colors, logoDataUri, markDataUri, voiceSamples, existingPosts, categories, nextOrder}`.
- `blogcheck.js` — exact mirror of `scripts/check-blog.mjs` + `scripts/blog-data.mjs` rules for one file.
- `render/browser.js`, `render/carousel.js`, `render/graphic.js`, `render/video.js`, templates in `marketing/engine/templates/`.
- `publish/blog.js`, `cli.js`.
- Remove anything that calls Anthropic or Gemini APIs.

## Local development

- Smoke test: `cd marketing/engine && CHROMIUM_PATH=/opt/pw-browsers/chromium DRY_RUN=1 node src/cli.js <cmd>`.
- Deps installed: `@supabase/supabase-js`, `sharp`, `playwright` 1.56, `ffmpeg-static`, `gray-matter`
  (`@anthropic-ai/sdk` must be removed from package.json).
- Sample stock files for tests: `/tmp/claude-0/-home-user/1ebfa328-06a3-5c75-bfad-24f0f6f77acf/scratchpad/stock/`.

## v3 addendum (owner decisions, supersedes anything above that conflicts)

1. **Absolutely no Magnific generation of any kind** — no images, video, voiceover/TTS, music or SFX generation.
   Magnific is used ONLY for `stock_search` / `stock_get` / `stock_download` (photos + footage).
2. **Owner-provided media.** The owner uploads their own photos and voiceovers (they make voiceovers themselves,
   e.g. in ElevenLabs with the "Anika" voice). Table `library_assets(id, kind['photo'|'video'|'voiceover'|'music'|'logo'|'other'],
   storage_path 'library/<uuid>/<file>', mime, title, notes, tags[], content_item_id, used_count, uploaded_by, created_at)`;
   the dashboard uploads into bucket `marketing` under `library/` (RLS allows team insert/delete there).
   The playbook should prefer relevant owner photos from the library over stock, and must record usage.
3. **Reel flow with owner voiceover:**
   - The session writes the reel spec INCLUDING `voiceover_script` (natural spoken English for Indian B2B travel audience,
     ~2.3 words/sec, 22–35 s) and per-scene `vo_line`; downloads stock clips/photos and **uploads them to storage**
     under `items/<id>/src/` (so the reel can be re-rendered later without re-downloading expiring URLs); renders a
     silent captioned preview; sets the video item status **`awaiting_voiceover`**.
   - Dashboard shows the script with a copy button and an upload control. On upload it creates a `library_assets`
     row (kind voiceover, content_item_id = the video item) and inserts job **`render_video {content_item_id, library_asset_id}`**.
   - The next revisions run (daily scheduled session) claims `render_video` jobs, downloads the voiceover + stored source
     clips, re-times scenes to the voiceover length (proportional to each scene's `vo_line` word count), mixes the
     audio (loudness-normalised, -14 LUFS, video audio muted), re-renders, and sets the item `pending_review`.
   - `make-video` accepts `--voiceover <file>`; `render/video.js` accepts `body.voiceover_path` and aligns to it.
   - Body adds: `"voiceover_script": "", "voiceover": {"library_asset_id", "duration"} | null`, scene `vo_line`.
4. **Dashboard design bar:** Apple × Notion × Stripe — world-class, premium gradients (Dhiti red family on
   ink/off-white, subtle mesh/aurora gradients, glass surfaces), SF Pro Display. If font files exist in
   `marketing/dashboard/public/fonts/` (SF-Pro-Display-*.otf|woff2) load them via @font-face (owner supplies them);
   otherwise the system SF stack. No other fonts.
5. Cover images, carousel and graphic photos, and reel footage must be top-tier: authentic, high resolution,
   editorial, on-topic; never cheesy, never AI-generated (`ai_generated: "excluded"`).

## v3.1 Security addendum (owner: "only I can access this portal") — binding

Applied in migration `owner_only_security`:
- `gate_signup` trigger on `auth.users`: any sign-up whose email is not in `allowed_users` is rejected inside the database. Email changes to a non-allowlisted address are rejected too (`gate_email_change`).
- `is_team()` now requires ALL of: JWT `aal = 'aal2'` (two-factor session), `auth.uid()` row exists with `email_confirmed_at`, and the email is in `allowed_users`. Every RLS policy and storage policy uses `is_team()`, so a session without 2FA reads nothing.
- `is_allowlisted()` (authenticated only) lets the dashboard show the 2FA step after the email-code step.
- `is_team()` is not executable by `anon`.

Dashboard login flow (must implement exactly):
1. Email → `signInWithOtp({ email, options: { shouldCreateUser: true } })` (6-digit code; the trigger blocks strangers). Show the same neutral message for any email ("If this email has access, a code is on its way") — never reveal whether an email is allowed.
2. `verifyOtp({ email, token, type: 'email' })`.
3. `rpc('is_allowlisted')` false → sign out, neutral error.
4. `mfa.listFactors()`: no verified TOTP factor → enrolment screen (QR + secret from `mfa.enroll({ factorType: 'totp', friendlyName: 'Dhiti Studio' })`, then `challengeAndVerify`). Verified factor → 6-digit authenticator challenge (`mfa.challenge` + `mfa.verify`).
5. Only an `aal2` session (`mfa.getAuthenticatorAssuranceLevel().currentLevel === 'aal2'`) renders the app. On any `aal1` session, render the 2FA screen, never the app shell.
6. Idle lock: after 30 min without input, sign out; on tab hidden > 12 h, sign out. "Sign out everywhere" in settings (`signOut({ scope: 'global' })`).
7. Session stored by supabase-js in localStorage (default); no other secrets in the bundle (publishable key only).
Netlify: strict CSP pinned to the project host, HSTS, frame-ancestors none, noindex, no third-party scripts or fonts.
Owner action after first login (one-time, optional extra layer): Supabase → Authentication → Sign-ups off.
