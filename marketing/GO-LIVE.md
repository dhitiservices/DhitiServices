# Go-live checklist (Dhiti marketing system)

Do these in order. Each step says how to check it worked. Contract: `ARCHITECTURE.md` (v2, v3, v3.1, v3.1.1, v3.2).

State at the final check (2026-11-28): root site build and `test:blog` pass; dashboard builds with the three SF Pro
OTF files in `dist/fonts/` (none tracked in git); engine API `engine` v2.4.0 is live; no live engine tokens
(all 4 session tokens revoked, no publisher token yet); 0 auth users, 1 allowlisted address; no scheduled tasks yet.
The sample blog (airline GST invoices) and its 4 creatives are waiting for review, with the reel waiting for a voiceover.

## 1. Deploy the dashboard to Netlify (local build, so the licensed fonts ship)

The SF Pro Display files are gitignored, so a build that Netlify runs from Git has no fonts. Deploy from a machine
that has `marketing/dashboard/public/fonts/SF-Pro-Display-{Regular,Medium,Bold}.otf`.

1. Create the Netlify site **without linking a Git repository**. If it is already linked, turn off builds
   (Site configuration → Build & deploy → Stop builds), otherwise the next push replaces this deploy with a fontless build.
2. ```bash
   cd marketing/dashboard
   npm ci && npm run build
   ls dist/fonts            # must list the 3 .otf files
   npx netlify deploy --prod --dir dist
   ```
   Run it from `marketing/dashboard` so `netlify.toml` (CSP, HSTS, noindex, SPA redirect) is applied.
   Do not set `VITE_DEMO` on this build.
3. Check: open the site, DevTools → Network: `/fonts/SF-Pro-Display-*.otf` load with 200, no CSP errors in the
   console, response headers include `Content-Security-Policy` and `X-Robots-Tag: noindex, nofollow`.
4. Optional: add a custom domain in Netlify. Use the final URL (custom or `*.netlify.app`) in step 2.

## 2. Supabase Auth settings (dashboard of project `yexxrcgxhwsopssfyylo`)

Full wording: `dashboard/README.md` → "Owner setup".

1. Authentication → URL Configuration: **Site URL** = the Netlify URL; add the same URL to **Redirect URLs**.
2. Authentication → Email Templates: add `Your code: {{ .Token }}` to **Magic Link** and to **Confirm signup**
   (keep the link too).
3. Authentication → Providers → Email: OTP length **6**, OTP expiry **600** seconds.
4. Authentication → Rate Limits: lower OTP send and verify limits (for example 5 emails, 15 verifications per hour per IP).
5. Before the first sign-in, in the SQL editor: `select count(*) from auth.users where email_confirmed_at is null;` must be 0.
6. Optional: custom SMTP if the built-in mailer's hourly limit is too low.

## 3. Publisher token and GitHub secret

1. In the Supabase SQL editor (runs as `postgres`):
   `select public.issue_engine_token('publisher', 24*365, 'github publisher');`
   Copy the value once. Do not paste it into chat, files, issues or commit messages.
2. GitHub → repository → Settings → Secrets and variables → Actions → New repository secret:
   name **`DHITI_ENGINE_TOKEN`**, value = the token.
3. If `main` is protected, allow `github-actions[bot]` to push to it.
4. If the token ever leaks: `update public.engine_tokens set revoked = true where label = 'github publisher';`, then
   issue a new one and replace the secret.

## 4. Merge `marketing-automation` into `main`

- The merge adds only `marketing/` and `.github/workflows/marketing-publish.yml`. No root site file changes, and the
  root build ignores `marketing/`.
- Before merging: `npm run build && npm run test:blog` at the repo root must pass.
- After merging: Render deploys `main` as usual (no visible site change). Scheduled workflows only run from the
  default branch, so the publisher starts only after this merge.
- Check: GitHub → Actions → "Marketing publish" → Run workflow (leave "force" off). It must end green. The summary
  shows `approved blogs: N, due now: M` (no warning about a missing secret).

## 5. Scheduled tasks (Claude Code cloud sessions)

Create two scheduled tasks. Both: environment **DhitiServices**; repository `dhitiservices` on branch **`main`**
(after step 4); a **new session for each run**; connectors **Supabase** and **Magnific** only; push notification on.

| Task | Schedule (IST) | Cron | Prompt |
|---|---|---|---|
| Dhiti weekly content | Monday about 08:45 | `CRON_TZ=Asia/Kolkata 47 8 * * 1` | `MODE: weekly. Follow marketing/PLAYBOOK.md exactly.` |
| Dhiti daily revisions | Tuesday to Sunday about 13:15 | `CRON_TZ=Asia/Kolkata 13 13 * * 0,2-6` | `MODE: revisions. Follow marketing/PLAYBOOK.md exactly.` |

- The weekly run also handles waiting revisions, so the daily task skips Monday. Two sessions running together can
  mark each other's in-progress items as failed (the 2-hour clean-up rule in PLAYBOOK.md "Never leave items in generating").
- Voiceovers uploaded in the dashboard are turned into the final reel by the next run, so allow up to a day.
- Check after the first run: the dashboard Settings → runs list shows a finished run; `select kind, revoked from
  engine_tokens order by created_at desc limit 3;` shows the run's session token revoked.

## 6. First login test (the owner, on the real site)

1. Open the Netlify URL, enter the allowlisted email, and wait for the email. It must show a 6-digit code.
2. Type or paste the code. The studio opens (Overview). The link in the same email must also sign in.
3. Right after this first sign-in: Authentication → Sign In / Providers → turn **Allow new users to sign up** off.
4. Check in SQL: `select count(*) from auth.users;` is 1, `email_confirmed_at` is set, `encrypted_password = ''`.
5. Try a different email address: it gets the same neutral message and no code ever opens the studio.
6. Review the sample: open the blog, look at the publish time (Monday 30 Nov 10:00 IST is planned), then approve
   it or ask for changes. Upload the reel voiceover (script in the reel's review screen; `U` key).
7. Settings → "Sign out everywhere" signs out. The 30-minute idle lock signs out after its countdown.
8. When an approved blog is due, the next "Marketing publish" run commits it to `main` as "Dhiti Marketing Bot" and
   it goes live at `https://www.dhitiservices.com/blog/<slug>/` after Render deploys.

## Rules that stay true after go-live

- Magnific: only `stock_search`, `stock_get`, `stock_download` (plus the read-only `account_balance` credit check).
  No generation of any kind. No Anthropic API, no Gemini.
- The owner provides photos and voiceovers through Library in the dashboard.
- Dashboard font: SF Pro Display only (never committed). Creatives: Inter (embedded).
- Only the publishable key is in the bundle. The owner's address is never written into the repo.
