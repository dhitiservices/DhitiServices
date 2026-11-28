# Dhiti Studio (marketing dashboard)

The team's review app for the weekly marketing pipeline (contract: `marketing/ARCHITECTURE.md`).
React 18 + Vite 5 + Tailwind 3 + framer-motion, plain JSX. Hosted on Netlify. Talks to Supabase directly with the
publishable key; Row Level Security and `public.is_team()` decide what a signed-in person can see and change.

## Run

```bash
cd marketing/dashboard
npm install
npm run dev        # http://localhost:5174  (demo mode available: "Explore with sample data" or /?demo=1)
npm run build      # production build into dist/ (no demo code, no fixtures)
npm run preview    # serve dist/ on http://localhost:4174
```

Env (all optional, defaults are built in and public by design), see `.env.example`:
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. `VITE_DEMO=1` compiles demo mode into a build: use it only for
screenshot builds, never on the production site.

## Netlify

`netlify.toml` is in this folder: set the site's **base directory to `marketing/dashboard`**. Build `npm run build`,
publish `dist`, SPA redirect, strict security headers (CSP: scripts, styles and fonts from the site itself only;
data, images and media from the project's Supabase host only; `frame-ancestors 'none'`, HSTS, `noindex`).

The SF Pro Display font files are gitignored (`public/fonts/`), so a build that Netlify runs from Git ships without
them and the app falls back to the system SF font (Apple devices) or the system UI font. To ship the licensed files,
deploy from a machine that has them in `public/fonts/`: `npm run build && npx netlify deploy --prod --dir dist`.

## Owner setup (one time, Supabase dashboard)

1. **Authentication → URL Configuration**: set **Site URL** to the Netlify URL (for example
   `https://<your-site>.netlify.app`) and add the same URL to **Redirect URLs**. The emailed sign-in link only
   returns to URLs on that list.
2. **Authentication → Email Templates**: the default templates contain a link but no code. Add the code line
   `Your code: {{ .Token }}` to **Magic Link** (every later sign-in) and to **Confirm signup** (your very first
   sign-in creates the account, and Supabase sends that template the first time). Keep the link as well: it works too,
   on any device, and the app removes it from the address bar after signing in.
3. **Authentication → Providers → Email**: keep **Email OTP length** at 6 (the app has six boxes) and set the
   **OTP expiry to 600 seconds** (10 minutes; the sign-in screen says so). A short expiry shrinks the window for
   guessing a code.
4. **Do your first sign-in now**, then turn **Authentication → Sign In / Providers → Allow new users to sign up**
   off. Until the owner account exists, the allowlisted address is the only one the database accepts as a new user.
   Passwords cannot be planted on it (the `strip_password` trigger blanks every password, so the password grant never
   works), but closing sign-ups ends the window completely. Before that first sign-in you can confirm nothing is
   waiting: `select count(*) from auth.users where email_confirmed_at is null;` must be 0 (delete any such row).
5. **Authentication → Rate Limits**: lower the limits for sending OTP emails and for verifying tokens (for example 5
   emails and 15 verifications per hour per IP) so a code cannot be brute-forced. Optional extra: Supabase CAPTCHA
   (Cloudflare Turnstile); it needs `challenges.cloudflare.com` added to the CSP in `netlify.toml`, which relaxes the
   "no third-party scripts" rule, so it is off by default.
6. Optional: Supabase's built-in mailer sends only a few emails per hour. If codes stop arriving, add your own SMTP
   under **Authentication → Emails → SMTP Settings**.

7. **Edge Functions → linkedin → Secrets**: add `DASHBOARD_ORIGIN` = the Netlify origin (for example
   `https://<your-site>.netlify.app`, no trailing slash). It is not a secret. Until it is set, the `linkedin` function
   sends no CORS headers (checked on 28 Nov 2026: the preflight answers 204 with no `access-control-allow-origin`), so
   the browser blocks every call from the studio and Settings → LinkedIn shows "Couldn't check LinkedIn". The OAuth
   callback also redirects there (LINKEDIN.md 1.6 and 10.2).

To give someone access, add their email to `public.allowed_users` (SQL editor). To remove access, delete the row,
then use **Settings → Sign out everywhere** if needed (that ends your own sessions; their next request already
returns no data because every policy checks the allowlist).

## Sign-in and sessions

- Email step: `signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: origin } })`. Every
  address gets the same message ("If this email has access, a code is on its way."); only network problems, a
  malformed address and real rate limits are shown, never whether an address is allowed.
- Code step: six boxes (paste and autofill aware, auto-advance, Backspace, auto-submit) → `verifyOtp({ type: 'email' })`.
  Resend after a visible 60 s countdown. "Use a different email" goes back.
- Link in the email: implicit flow (`detectSessionInUrl`), so it also works when opened on another device; the
  tokens are removed from the URL right after.
- Gate: a splash until the session exists **and** `rpc('is_allowlisted')` is true; otherwise sign out with a
  neutral message. The app shell never renders before that.
- Idle lock: 30 min without pointer, key, touch or scroll input → sign out (60 s countdown first; shared across tabs).
  A tab hidden for more than 12 h, or a browser reopened after the idle limit, also signs out.
  **Settings → Account and security → Sign out everywhere** = `signOut({ scope: 'global' })`.
- No passwords and no authenticator app anywhere.

## Pages

| Route | What it does |
|---|---|
| `/` Home | One "next step" card first (blogs ready for you, then reels that need your voice, pictures and reels to check, LinkedIn posts that need a look, anything that went wrong; the rest as "Also waiting" chips), or "You're all caught up. Next blog posts Monday at 10:00 am."; then Coming up, this week's research, Recently, and **Make this week's blogs now** (`jobs` insert `run_weekly`) |
| `/review/:id?` Review | Queue grouped by topic; blog article preview (marked + DOMPurify), inline edit (title, description with 160-char counter, Markdown), carousel slide viewer + PDF, graphic square/landscape, reel player. Reels in `awaiting_voiceover` show the voiceover studio: the script (large, copy button, word count,
target seconds), the line for each scene, and a drop zone (or a take from the library); upload = `library_assets` row
+ `jobs` insert `render_video {content_item_id, library_asset_id}`, then "Rendering with your voice" until Realtime
brings the item back as `pending_review`. Blogs also show **Facts** (`body.claims` from the engine's claims ledger:
a green line "8 facts have a quote from the source. Read each quote: does it say the same thing?" or a red warning; each
fact with its source, the day the source was read and the quote. The words say only what the engine proves: the quote is
in the source and the claim's numbers are in the quote, not that the quote means the same, so the owner reads each one.
Examples and advice are labelled, not counted as facts. After the owner edits the text, a fact whose sentence is no
longer in it (compared as the engine does) shows "Changed after the check" and counts as not checked. Every way to
approve or put a blog live uses the same gate: with any unchecked fact, or no fact list at all, the approve sheet needs
the tick "I checked them myself"; Shift+A then opens the sheet instead of approving; "Put live now" is offered only for
an approved blog or a blog waiting for review whose facts all have a quote. A **Sent back** blog is read-only ("Sent
back. We're fixing it."); "Approve this version instead" in More opens the same sheet and says it stops the fix (the
revisions run never changes an approved item). Carousels, graphics and reels have no fact list yet, so their screens say
"We check facts in the blog only. Check that every number here is the same as in the blog.") and the **LinkedIn post** card (`social_posts`, LINKEDIN.md 2.4): a company-post preview
with the "...see more" cut, the media as document pages, video or picture, the first comment with the blog link,
Carousel/Reel/Graphic switch (only formats made for that blog; recommended one marked "Best" with its reason), caption
and first-comment editors with live checks (no link, 3 hashtags at most, no long dash, length), and the status in words
("Will post after the blog is live", "Posted", "Posted, comment failed" + Try again via `retry_comment`, Post now via
`publish_now` with a confirm). Approve (blog: pick publish time, IST, plus "Also post on LinkedIn after the blog is
live?", default yes, which approves the post and, for a carousel or graphic still waiting for review, that creative:
the switch stays off until every carousel page has been looked at, in the card or in the sheet; a reel is never approved
this way. The approval always sends the caption, first comment and format exactly as shown. Undo puts back the blog,
the post and that creative. After Approve the app moves to the next item that still needs the owner, at the top of the
page), Request changes (`changes_requested` + `feedback` and `jobs` insert `regenerate`), Reject, Publish now (`jobs` insert `publish_now`). Optimistic, with Undo |
| `/calendar` | Week columns, topics on planned dates, status and content chips, skip topic (with Undo) |
| `/research/:id?` | Research briefs: summary, trends, pain points, opportunities, competitors, sources |
| `/ready` | Approved carousels/graphics/reels to post by hand: download all, copy caption, mark as posted (`published` + optional URL). A creative that its blog's LinkedIn post uses (a `social_posts` row that is not cancelled, same format, its `source_item_id` or the item it would pick) is listed apart under "Posts on LinkedIn by itself" with the post status, and has no "I posted it" or LinkedIn caption anywhere, so it can't be posted twice. A creative whose blog already posts another format says so |
| `/published` | Live blogs and posted social pieces |
| `/library` | Owner photos (JPG/PNG/WebP; HEIC refused with a how-to), voiceovers (MP3/M4A/WAV) and footage (MP4/MOV): drag-drop anywhere or browse, type checked by file content, upload progress, thumbnails and waveforms, title/tags/notes, delete. Storage `library/<uuid>/<file>` + a `library_assets` row |
| `/settings` | **LinkedIn** (first section, `#linkedin`): the five setup steps with ticks (create a new app with no other products, privacy link and redirect URL; verify the app with the Dhiti page; ask for the Community Management API with the work email and legal name; paste your keys; connect the page); a Client ID + Client Secret form (secret masked, `autocomplete=off`, sent only in the body of `linkedin/save_app`, cleared right away, never shown again); **Connect LinkedIn** (`oauth/start`, then a top-level navigation to `www.linkedin.com/oauth/v2/authorization` only); the return (`?linkedin=connected` or `?linkedin=error&reason=`) as a banner; choose the page (`select_org`); "Connected to Dhiti Services" with the logo and "The link works for N more days" (on a phone, Disconnect sits on its own row so the name is never cut); Pause (`linkedin_connection.paused`); Disconnect with a confirm (optionally also deleting the keys); `status.warnings` as plain-English banners. Then `settings.data` fields (cadence, publish days, audience, avoid topics, extra guidance; other keys are preserved), appearance, runs with expandable logs |

Keyboard: `⌘K`/`Ctrl K` or `/` command menu · Review: `J`/`K` next/previous, `A` approve, `Shift A` approve for the planned day (only when every fact has a quote; else it opens the approve sheet), `R` request changes, `U` upload voiceover (reels waiting for one),
`E` edit blog, `⌘S` save, `Esc` close. Arrow keys move carousel slides.

## Data and writes

Everything is in `src/lib/backend.js` (Supabase) and `src/lib/store.jsx` (state, optimistic actions, toasts).
Writes used, all allowed by RLS for team members: `content_items` update, `topics` update, `settings` update,
`social_posts` update (caption, first_comment, format, status; the `linkedin_social_posts_guard` trigger decides),
`linkedin_connection.paused`, the `linkedin` Edge Function routes with the user's JWT,
`jobs` insert, `library_assets` insert/update (title, notes, tags only)/delete, storage upload/delete under `library/`.
The database checks each write itself (migrations `jobs_insert_policy_strict`, `library_uploads_type_and_path_checks`,
`least_privilege_table_grants`): a job must be one of the four shapes the dashboard sends, queued by the signed-in
address, for an item in the right state (`regenerate` needs `changes_requested`, `publish_now` an approved or published
blog, `render_video` a reel in `awaiting_voiceover` and a voiceover that is unassigned or recorded for that reel;
feedback up to 4,000 characters); a library row must point at `library/<uuid>/<file>`, use an allowed media type and
name the uploader; the bucket accepts only images, MP4/MOV/WebM video, PDF and MP3/M4A/WAV audio. `anon` has no table
privileges at all.
Media come from the private `marketing` bucket through batched `createSignedUrls` (1 h, cached, refreshed 5 min
before expiry). Live updates: Realtime `postgres_changes` on `content_items`, `jobs`, `runs`, `topics`,
`library_assets`, `assets`, and (on their own channel) `social_posts` and `linkedin_connection`; all eight tables are in
the `supabase_realtime` publication on the live project (checked in `pg_publication_tables`, 28 Nov 2026). The 30 s
poll and the refresh on focus are only a fallback. A realtime row for an item or a LinkedIn post that has a write in
flight is skipped, so an optimistic change never flickers back. A failed first load shows "Couldn't load your studio"
with Retry and Sign out (never an empty queue); a failed background refresh keeps the data on screen and replaces the
Live dot with an amber "Offline · synced N min ago" pill until the next refresh succeeds.

## Design

Type: **SF Pro Display** for everything, from the owner's licensed OTF files in `public/fonts/`
(`SF-Pro-Display-Regular|Medium|Bold.otf`, gitignored and never committed), loaded with `@font-face` (400/500/700,
`font-display: swap`, `local()` first) in `src/index.css`. With no Semibold file, Tailwind's `font-semibold` maps to
500 and the Medium face also covers 600, so nothing renders as Bold by accident; 700 is for titles and numbers.
Form fields focus with an ink ring; red borders mean an error (`aria-invalid`). Stack: `"SF Pro Display", -apple-system,
BlinkMacSystemFont, system-ui, sans-serif`. CSP `font-src 'self'`. The splash waits up to 0.9 s for the font so the
first screen does not swap fonts. Creatives (carousel, graphics, reel, covers) use Inter, embedded by the engine.

Dhiti colours as CSS variables (`src/index.css`) with a dark theme (Auto/Light/Dark): brand red `#EE0800` (deep
`#C20600` for text, bright `#FF3322`), warm ink `#161110` / `#4A403E`, off-white canvas `#FAF7F2`, and a warm
near-black dark theme from the website's dark bands. Muted text is the brand mute darkened just enough for WCAG AA.
Gradients are used with restraint: the animated aurora behind sign-in and the splash, the ink-to-red hero cards
(week at a glance, research summary), primary buttons and focus rings. Everything else is flat surfaces, hairlines
and soft shadows on an 8 pt grid.
Motion animates transform/opacity only (springs, 150 to 300 ms for UI, slow 18 to 38 s drifts for the aurora) and
honours `prefers-reduced-motion` (drifts and sheens stop, transitions become fades).

## Testing locally

Demo mode (`VITE_DEMO=1` build or `vite dev`, then `/?demo=1`) runs everything against an in-memory backend:
sign in with any email and the code **123456** (an address starting with `outsider` shows the not-allowed path;
asking for a second code within 60 s behaves like Supabase's cooldown). Uploads are simulated with progress; a
voiceover render finishes after about 9 s (a take whose title contains "fail" shows the failed-render path).
LinkedIn in demo: `/settings?li=none|app|choose|connected|expiring|expired` sets the connection state for the tab;
saving keys and Connect run the whole round trip locally (no LinkedIn call). `/?state=clear` starts with everything
reviewed (the "all caught up" home).
