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
3. **Authentication → Providers → Email**: keep **Email OTP length** at 6 (the app has six boxes) and the OTP
   expiry at 3600 seconds or less.
4. Optional, after your first successful sign-in: **Authentication → Sign In / Providers → Allow new users to sign up**
   off. The database already rejects any address that is not in `allowed_users`; this adds a second layer.
5. Optional: Supabase's built-in mailer sends only a few emails per hour. If codes stop arriving, add your own SMTP
   under **Authentication → Emails → SMTP Settings**.

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
| `/` Overview | Week at a glance, research summary, pipeline counts, upcoming publishes, recent runs/jobs, **Run weekly now** (`jobs` insert `run_weekly`) |
| `/review/:id?` Review | Queue grouped by topic; blog article preview (marked + DOMPurify), inline edit (title, description with 160-char counter, Markdown), carousel slide viewer + PDF, graphic square/landscape, reel player. Reels in `awaiting_voiceover` show the voiceover studio: the script (large, copy button, word count,
target seconds), the line for each scene, and a drop zone (or a take from the library); upload = `library_assets` row
+ `jobs` insert `render_video {content_item_id, library_asset_id}`, then "Rendering with your voice" until Realtime
brings the item back as `pending_review`. Approve (blog: pick publish time, IST), Request changes (`changes_requested` + `feedback` and `jobs` insert `regenerate`), Reject, Publish now (`jobs` insert `publish_now`). Optimistic, with Undo |
| `/calendar` | Week columns, topics on planned dates, status and content chips, skip topic (with Undo) |
| `/research/:id?` | Research briefs: summary, trends, pain points, opportunities, competitors, sources |
| `/ready` | Approved carousels/graphics/reels: download all, copy caption, mark as posted (`published` + optional URL) |
| `/published` | Live blogs and posted social pieces |
| `/library` | Owner photos (JPG/PNG/WebP; HEIC refused with a how-to), voiceovers (MP3/M4A/WAV) and footage (MP4/MOV): drag-drop anywhere or browse, type checked by file content, upload progress, thumbnails and waveforms, title/tags/notes, delete. Storage `library/<uuid>/<file>` + a `library_assets` row |
| `/settings` | `settings.data` fields (cadence, publish days, audience, avoid topics, extra guidance; other keys are preserved), appearance, runs with expandable logs |

Keyboard: `⌘K`/`Ctrl K` or `/` command menu · Review: `J`/`K` next/previous, `A` approve, `R` request changes,
`E` edit blog, `⌘S` save, `Esc` close. Arrow keys move carousel slides.

## Data and writes

Everything is in `src/lib/backend.js` (Supabase) and `src/lib/store.jsx` (state, optimistic actions, toasts).
Writes used, all allowed by RLS for team members: `content_items` update, `topics` update, `settings` update,
`jobs` insert with `status: 'queued'`, `library_assets` insert/delete, storage upload/delete under `library/`.
Media come from the private `marketing` bucket through batched `createSignedUrls` (1 h, cached, refreshed 5 min
before expiry). Live updates: Realtime `postgres_changes` on `content_items`, `jobs`, `runs`, `topics`,
`library_assets`, plus a 30 s poll and refresh on focus as a fallback.

## Design

Type: **SF Pro Display** for everything, from the owner's licensed OTF files in `public/fonts/`
(`SF-Pro-Display-Regular|Medium|Bold.otf`, gitignored and never committed), loaded with `@font-face` (400/500/700,
`font-display: swap`, `local()` first) in `src/index.css`. Stack: `"SF Pro Display", -apple-system,
BlinkMacSystemFont, system-ui, sans-serif`. CSP `font-src 'self'`. The splash waits up to 0.9 s for the font so the
first screen does not swap fonts. Creatives (carousel, graphics, reel, covers) use Inter, embedded by the engine.

Dhiti colours as CSS variables (`src/index.css`) with a dark theme (Auto/Light/Dark).
Motion animates transform/opacity only and honours `prefers-reduced-motion`.

## Testing locally

Demo mode (`VITE_DEMO=1` build or `vite dev`, then `/?demo=1`) runs everything against an in-memory backend:
sign in with any email and the code **123456** (an address starting with `outsider` shows the not-allowed path;
asking for a second code within 60 s behaves like Supabase's cooldown). Uploads are simulated with progress; a
voiceover render finishes after about 9 s (a take whose title contains "fail" shows the failed-render path).
