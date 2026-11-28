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
publish `dist`, SPA redirect, strict security headers (CSP allows only self + `*.supabase.co`).
In Supabase Auth, add the Netlify URL to **Site URL / Redirect URLs** so magic links land back on the app.

## Pages

| Route | What it does |
|---|---|
| `/` Overview | Week at a glance, research summary, pipeline counts, upcoming publishes, recent runs/jobs, **Run weekly now** (`jobs` insert `run_weekly`) |
| `/review/:id?` Review | Queue grouped by topic; blog article preview (marked + DOMPurify), inline edit (title, description with 160-char counter, Markdown), carousel slide viewer + PDF, graphic square/landscape, reel player, owner voiceover upload. Approve (blog: pick publish time, IST), Request changes (`changes_requested` + `feedback` and `jobs` insert `regenerate`), Reject, Publish now (`jobs` insert `publish_now`). Optimistic, with Undo |
| `/calendar` | Week columns, topics on planned dates, status and content chips, skip topic (with Undo) |
| `/research/:id?` | Research briefs: summary, trends, pain points, opportunities, competitors, sources |
| `/ready` | Approved carousels/graphics/reels: download all, copy caption, mark as posted (`published` + optional URL) |
| `/published` | Live blogs and posted social pieces |
| `/library` | Owner photos, footage, voiceovers (`library_assets` + storage `library/<uuid>/<file>`) |
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

SF Pro only: `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui`. Apple devices use the
system SF; elsewhere the owner-supplied `public/fonts/SF-Pro-Display-*.otf` (not committed, licence) are used via
`@font-face` when present. Dhiti colours as CSS variables (`src/index.css`) with a dark theme (Auto/Light/Dark).
Motion animates transform/opacity only and honours `prefers-reduced-motion`.
