# Dhiti Marketing: LinkedIn Company Page Integration (contract v1)

This contract covers how an approved blog becomes **one** LinkedIn post on the Dhiti Services company page, together
with an automatic **first comment** from the page that links to the blog. It is the build contract for
`marketing/supabase/functions/linkedin/**` and the `linkedin_*` migrations. It also lists what the `engine` function
and the dashboard must add; those parts are owned by another workflow and are described here, not built.

Status: **dormant by design.** No LinkedIn credentials exist yet. The function and the tables can be deployed now: until the
owner saves an app and connects a page, every call answers `not_configured` and nothing is sent to LinkedIn.
Every flow can be tested against a mock LinkedIn server (section 8).

Every LinkedIn API detail below is taken from the official docs on learn.microsoft.com. They were fetched on
2026-11-28, at Marketing version `li-lms-2026-11` (the docs' latest), and are cached in the session scratchpad. Citations use
the short names listed in [section 0](#0-sources). Anything the docs do not say is marked **UNVERIFIED**, together with
how this contract deals with it.

---

## 0. Sources

The marketing pages were read at `?view=li-lms-2026-11`.

| Tag | URL |
|---|---|
| CM-OVERVIEW | https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview?view=li-lms-2026-11 |
| CM-REVIEW | https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review?view=li-lms-2026-11 |
| CM-REQ | https://learn.microsoft.com/en-us/linkedin/marketing/community-management/integration-requirements-community-management?view=li-lms-2026-11 |
| QUICKSTART | https://learn.microsoft.com/en-us/linkedin/marketing/quick-start?view=li-lms-2026-11 |
| ACCESS | https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access?view=li-lms-2026-11 |
| OAUTH | https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow |
| REFRESH | https://learn.microsoft.com/en-us/linkedin/shared/authentication/programmatic-refresh-tokens |
| INTROSPECT | https://learn.microsoft.com/en-us/linkedin/shared/authentication/token-introspection |
| PORTAL | https://learn.microsoft.com/en-us/linkedin/shared/authentication/developer-portal-tools |
| SECURE | https://learn.microsoft.com/en-us/linkedin/shared/api-guide/best-practices/secure-applications |
| ACLS | https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/organization-access-control-by-role?view=li-lms-2026-11 |
| ORG | https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/organization-lookup-api?view=li-lms-2026-11 |
| POSTS | https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-11 |
| POST-SCHEMA | https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/post-api-schema?view=li-lms-2026-11 |
| IMAGES | https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/images-api?view=li-lms-2026-11 |
| VECTOR | https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/vector-asset-api?view=li-lms-2026-11 |
| DOCUMENTS | https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/documents-api?view=li-lms-2026-11 |
| VIDEOS | https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/videos-api?view=li-lms-2026-11 |
| COMMENTS | https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/comments-api?view=li-lms-2026-11 |
| LITTLE | https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/little-text-format?view=li-lms-2026-11 |
| VERSIONING | https://learn.microsoft.com/en-us/linkedin/marketing/versioning?view=li-lms-2026-11 |
| MIGRATIONS | https://learn.microsoft.com/en-us/linkedin/marketing/integrations/migrations?view=li-lms-2026-11 |
| CHANGES | https://learn.microsoft.com/en-us/linkedin/marketing/integrations/recent-changes?view=li-lms-2026-11 |
| PROTOCOL | https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/protocol-version |
| RATE | https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/rate-limits |
| ERRORS | https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/error-handling |
| STORAGE | https://learn.microsoft.com/en-us/linkedin/marketing/data-storage-requirements?view=li-lms-2026-11 |

**Not fetched:** LinkedIn Help article *"Associate an app with a LinkedIn Page"*
(`https://www.linkedin.com/help/linkedin/answer/a548360/associate-an-app-with-a-linkedin-page`). CM-REVIEW links
it, but `www.linkedin.com` is blocked in this build session's network. The page-verification click path in step 1.3 is
therefore **UNVERIFIED** and must be checked on screen.

Pinned API version: **`Linkedin-Version: 202611`**. That is the latest version (VERSIONING) and it is supported until
**2027-11-16** (MIGRATIONS). No breaking changes to Posts, Images, Documents, Videos, Comments or OAuth were announced
between 202601 and 202611 (CHANGES). The version lives in one constant, `LINKEDIN_VERSION`. Every API call must send it,
because a call without the version header is an error and a sunset version returns 426 (VERSIONING, ERRORS).

---

## 1. Owner setup (one time, about 30 minutes of clicks, then LinkedIn's review)

You need:

- a personal LinkedIn account that is a **super admin** of the Dhiti Services page
- a **business** email address on the dhitiservices.com domain (personal emails fail vetting, CM-REVIEW)
- the company's legal name and registered address
- the privacy policy URL `https://www.dhitiservices.com/privacy/` (the page exists on the site)

### 1.1 Create the developer app

1. Open https://www.linkedin.com/developers/apps/new while signed in (QUICKSTART step 1).
2. **App name:** for example `Dhiti Marketing Publisher`. The name and logo must not contain "LinkedIn", "Linked",
   "In" or any LinkedIn or Microsoft logo (CM-REVIEW).
3. **LinkedIn Page:** choose **Dhiti Services**.
4. **Privacy policy URL:** `https://www.dhitiservices.com/privacy/`.
5. **App logo:** the Dhiti mark (`src/assets/logos/dhiti-mark.webp` exported as PNG).
6. Accept the legal agreement and click **Create app**.
7. Make this a **new app with no other products**. Do not add "Sign In with LinkedIn" or "Share on LinkedIn" first:
   the Community Management request option is greyed out on apps that already have other API products (CM-OVERVIEW
   FAQ 4).

### 1.2 Request the Community Management API (Development tier)

1. In the app, open the **Products** tab and click **Request access** on **Community Management API** (QUICKSTART
   step 1.4).
2. Fill in the access form. LinkedIn asks for, and checks (CM-REVIEW):
   - your business email address, which must be verified (check spam, promotions and social tabs for the email)
   - the organization's legal name, registered address, website and privacy policy
   - a use case. Pick **Page Management** and describe it as: "Our own company page only. A staff member approves each
     post in our internal tool, which then publishes it as an organization post and adds a first comment with a link
     to our blog."
3. LinkedIn checks the use case, the verified business email, the verified organization, the website and domain, and
   that the app was **verified by the associated Page** (CM-REVIEW). The API is offered to registered legal
   organizations for commercial use only (CM-REVIEW).
4. **Wait time:** LinkedIn publishes no timeline for Community Management review. The docs give "no fixed timeline"
   only for restricted APIs (ACCESS). Plan for days to a few weeks (**UNVERIFIED**). A rejection cannot be appealed
   with the same app: you must create a new app and submit again (CM-REVIEW).
5. **Development tier limits** (ACCESS):
   - 500 calls per app and 100 calls per member every 24 h
   - **no BATCH_GET calls**
   - no webhooks
   - the integration must be completed within 12 months

   This design uses no batch calls and needs roughly 6 to 15 calls per post (section 3.9). LinkedIn describes the
   Standard tier as the one "for live production" (ACCESS). Once the flow works, apply for Standard under **My Apps >
   Products**. That needs a downloadable screencast that shows the OAuth consent, a post going to the page, and how
   comments and commenter data appear in the app, plus test credentials (CM-REVIEW). This system shows no commenter data,
   so say so in the recording.

### 1.3 Verify the app with the Dhiti page (super admin) **UNVERIFIED click path**

The documented requirement: "a super admin of the LinkedIn Page associated with your organization has verified your
application" (CM-REVIEW). The click path below comes from LinkedIn's help article, which could not be fetched:

1. In the app, open the **Settings** tab and find the **LinkedIn Page** row. Click **Verify** to generate a
   verification URL.
2. A super admin of the Dhiti Services page opens that URL while signed in and approves it.
3. Back on the **Settings** tab, the page shows as **Verified**.

### 1.4 Add the OAuth redirect URL

1. Open the **Auth** tab (OAUTH step 1).
2. Under **OAuth 2.0 settings > Authorized redirect URLs for your app**, add exactly this URL:
   `https://yexxrcgxhwsopssfyylo.supabase.co/functions/v1/linkedin/oauth/callback`
   The rules (OAUTH): it must be absolute and HTTPS; query parameters are ignored; it may not contain `#`. LinkedIn
   rejects a mismatch with `401 Redirect_uri doesn't match`.
3. After approval, the **Auth** tab lists the granted scopes (OAUTH, ACCESS). The Community Management product grants:
   `r_basicprofile, r_1st_connections_size, r_organization_followers, r_organization_social, r_organization_social_feed, rw_organization_admin, w_member_social, w_member_social_feed, w_organization_social, w_organization_social_feed, r_member_profileAnalytics, r_member_postAnalytics`
   (ACCESS table).

### 1.5 Client ID and Client Secret

- They are on the **Auth** tab under **Application credentials** (OAUTH step 1, SECURE FAQ).
- The Client Secret must never be shared, put in a URL, posted in chat or forums, or written to logs (OAUTH, SECURE).
  **Never paste it into a chat with Claude.**
- To rotate it: **Auth > Generate a new Client Secret** makes the old one the Secondary secret. Save the new one in the
  dashboard, test, then remove the Secondary (SECURE FAQ).

### 1.6 Connect in the dashboard

1. Dashboard: **Settings > LinkedIn > Connect**. Paste the **Client ID** and **Client Secret** and click **Save app**
   (route `save_app`). The secret goes straight to Supabase Vault and is never shown again. The form shows only
   "Secret saved" and the time it was saved.
2. Click **Connect LinkedIn**. You are sent to LinkedIn's consent screen, signed in as the page super admin. Click
   **Allow**.
3. LinkedIn sends you back to the dashboard, which shows **Connected: Dhiti Services**, with the page logo and the
   token expiry dates. If your account administers more than one page, pick **Dhiti Services** from the list
   (route `select_org`).
4. One-time function setting (not a secret): in Supabase, **Edge Functions > linkedin > Secrets**, add
   `DASHBOARD_ORIGIN = https://<your-site>.netlify.app`. The OAuth callback redirects there, and CORS allows only that
   origin.

---

## 2. Data model (migration `linkedin_core`, plus `linkedin_cron` in section 3.10)

Live database facts checked on 2026-11-28:

- `pgcrypto` 1.3 and `supabase_vault` 0.3.2 are installed; `pg_cron` and `pg_net` are **not installed yet**.
- `rls_auto_enable()` is an event trigger, so new tables get RLS on automatically. The migrations still state it
  explicitly.
- `public.is_team()` is a SECURITY DEFINER function with no arguments.

### 2.1 Secrets: Supabase Vault only

Secrets are stored as named Vault secrets. No other table holds them.

| Vault name | Written by | Contents |
|---|---|---|
| `linkedin_client_secret` | `save_app` | the app's Client Secret |
| `linkedin_access_token` | OAuth callback, refresh | the access token. It is about 500 characters; allow at least 1000 (OAUTH) |
| `linkedin_refresh_token` | OAuth callback, refresh | the refresh token, only if LinkedIn returned one (REFRESH) |
| `linkedin_cron_secret` | migration `linkedin_cron` | 32 random bytes as hex, for the `x-cron-secret` header |

Access goes only through these service-role functions (`SECURITY DEFINER`, `set search_path = ''`, `EXECUTE` revoked
from `public`, `anon` and `authenticated`, and granted to `service_role` only):

```sql
create function public.linkedin_secret_set(p_name text, p_value text) returns void   -- upsert via vault.create_secret / vault.update_secret
create function public.linkedin_secret_get(p_name text) returns text                 -- from vault.decrypted_secrets
create function public.linkedin_secret_delete(p_name text) returns void
-- each raises unless p_name in ('linkedin_client_secret','linkedin_access_token','linkedin_refresh_token','linkedin_cron_secret')
```

Rules:

- No secret is ever returned by a route.
- No secret is ever written to `last_error` or the logs. The error text from LinkedIn is reduced to
  `{status, serviceErrorCode, message}`, cut to 300 characters, and scrubbed of anything that looks like a token.
- No secret is ever put in a URL. LinkedIn forbids secrets in query strings (OAUTH, SECURE). The token exchange and
  introspection send them in a form-encoded POST body.

### 2.2 `linkedin_connection` (singleton, no secrets)

```sql
create table public.linkedin_connection (
  id int primary key default 1 check (id = 1),
  status text not null default 'not_configured' check (status in
    ('not_configured','app_saved','choose_org','connected','expired','revoked','error')),
  paused boolean not null default false,             -- owner kill switch: publish_due does nothing while true
  client_id text,                                    -- public identifier (SECURE); the secret is in Vault
  app_saved_at timestamptz, app_saved_by text,
  member_urn text,                                   -- urn:li:person:... of the admin who connected (STORAGE: no limit)
  org_urn text check (org_urn ~ '^urn:li:organization:[0-9]+$'),
  org_id bigint, org_name text, org_vanity text,
  org_logo_url text, org_logo_url_expires_at timestamptz,
  org_data_fetched_at timestamptz,                   -- name/logo may be kept 8 weeks, then refetched (STORAGE)
  org_candidates jsonb not null default '[]',        -- [{org_urn, org_name}] while status = 'choose_org'
  scopes text[] not null default '{}',
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  has_refresh_token boolean not null default false,
  last_refreshed_at timestamptz,
  last_checked_at timestamptz, last_check_active boolean,  -- daily introspection heartbeat (CM-REQ CM-002)
  last_error text,
  connected_by text, connected_at timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.linkedin_connection(id) values (1);
alter table public.linkedin_connection enable row level security;
create policy linkedin_connection_team_select on public.linkedin_connection for select to authenticated using (public.is_team());
create policy linkedin_connection_team_pause on public.linkedin_connection for update to authenticated using (public.is_team()) with check (public.is_team());
revoke all on public.linkedin_connection from anon, authenticated;
grant select on public.linkedin_connection to authenticated;
grant update (paused) on public.linkedin_connection to authenticated;   -- the only column the dashboard writes
create trigger linkedin_connection_touch before update on public.linkedin_connection for each row execute function public.touch_updated_at();
```

### 2.3 `linkedin_oauth_states` (RLS on, no policies, service role only)

```sql
create table public.linkedin_oauth_states (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique,        -- hex sha256 of the state; the plaintext state exists only in the authorize URL
  user_id uuid not null,                  -- auth.uid() of the owner who started the flow
  user_email text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  used_at timestamptz
);
alter table public.linkedin_oauth_states enable row level security;   -- no policies
revoke all on public.linkedin_oauth_states from anon, authenticated;
```

Rules for the state:

- **Unguessable:** 32 random bytes, base64url. LinkedIn requires a unique, hard-to-guess state and asks that the
  callback check it (OAUTH, SECURE).
- **Short-lived:** 10 minutes. LinkedIn's authorization code itself lives 30 minutes (OAUTH).
- **Single use:** the callback consumes the state with

  ```sql
  update linkedin_oauth_states set used_at = now()
  where state_hash = $1 and used_at is null and expires_at > now()
  returning user_id, user_email
  ```

  Zero rows returned means the state is rejected.
- **Bound to the owner:** the row records the JWT user who called `oauth/start`. At callback time the function
  re-checks that `auth.users` still has that id with that email, a confirmed email, not banned, and the email still in
  `allowed_users`. These are the same tests as `is_team()`, done with the service role, because the callback has no
  JWT. The connection stores `connected_by = user_email`.
- **Only one flow at a time:** `oauth/start` deletes every earlier unused state (and any row older than one day) before
  it inserts a new one.

### 2.4 `social_posts`

```sql
create table public.social_posts (
  id uuid primary key default gen_random_uuid(),
  blog_item_id uuid not null references public.content_items(id) on delete cascade,
  source_item_id uuid references public.content_items(id) on delete set null, -- the carousel/graphic/video item whose asset is posted
  platform text not null default 'linkedin' check (platform = 'linkedin'),
  recommended_format text check (recommended_format in ('carousel','video','graphic')),
  recommendation_reason text check (char_length(recommendation_reason) <= 500),
  format text not null check (format in ('carousel','video','graphic')),
  caption text not null default '' check (char_length(caption) <= 3000),
  first_comment text not null default '' check (char_length(first_comment) <= 300),  -- the line before the link; no URL
  status text not null default 'pending_review' check (status in
    ('draft','pending_review','approved','publishing','published','failed','cancelled')),
  stage text check (stage in ('media_uploading','media_processing','media_ready','post_requested','post_created')),
  comment_status text not null default 'none' check (comment_status in ('none','pending','requested','posted','failed')),
  approved_at timestamptz, approved_by text,
  scheduled_for timestamptz,              -- null = as soon as the blog is live
  media_urn text,                         -- urn:li:image:.. | urn:li:document:.. | urn:li:video:..
  media_status text,                      -- last LinkedIn MediaStatus seen (WAITING_UPLOAD|PROCESSING|AVAILABLE|PROCESSING_FAILED)
  thumbnail_urn_uploaded boolean not null default false,  -- video thumbnail uploaded (VIDEOS)
  post_urn text unique,                   -- from the x-restli-id header (POSTS)
  post_url text,
  comment_id text, comment_urn text,      -- x-restli-id and body.commentUrn (COMMENTS)
  comment_text_sent text,                 -- exact text sent (first_comment + link)
  attempts int not null default 0,
  comment_attempts int not null default 0,
  next_attempt_at timestamptz,
  lock_until timestamptz,                 -- lease held by one publish_due/publish_now/retry_comment invocation
  last_error text,
  published_at timestamptz,
  created_by text not null default 'engine',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index social_posts_one_per_blog on public.social_posts(blog_item_id, platform) where status <> 'cancelled';
create index social_posts_due on public.social_posts(status, next_attempt_at);
alter table public.social_posts enable row level security;
create policy social_posts_team_select on public.social_posts for select to authenticated using (public.is_team());
create policy social_posts_team_update on public.social_posts for update to authenticated using (public.is_team()) with check (public.is_team());
revoke all on public.social_posts from anon, authenticated;
grant select on public.social_posts to authenticated;
grant update (caption, first_comment, format, status, scheduled_for) on public.social_posts to authenticated;
create trigger social_posts_touch before update on public.social_posts for each row execute function public.touch_updated_at();
create trigger social_posts_guard before update on public.social_posts for each row execute function public.linkedin_social_posts_guard();
```

The team cannot insert or delete rows; there are no such grants and no such policies.

`linkedin_social_posts_guard()` is SECURITY INVOKER. It applies only when `current_user = 'authenticated'`; the service
role passes through.

1. **Allowed status changes:**
   - `pending_review → approved`
   - `approved → pending_review` (unapprove)
   - `draft | pending_review | approved | failed → cancelled`
   - `failed → approved` (approve again after a fix)

   Anything else raises an error. `publishing` and `published` can never be changed by the team. Retrying the comment of
   a published post is done by the `retry_comment` route.
2. **When edits are allowed:** `caption`, `first_comment`, `format` and `scheduled_for` may change only while
   `OLD.status` is `draft`, `pending_review` or `failed`. They may also change in the same statement that moves a row to
   `approved`, so the owner can switch format while approving.
3. **On a move to `approved`**, the trigger:
   - sets `approved_at = now()` and `approved_by = auth.jwt()->>'email'`
   - clears `last_error`, `next_attempt_at`, `stage` and `media_urn` (unless `post_urn` is set)
   - re-derives `source_item_id` as the newest child of `blog_item_id` with `type = NEW.format` and status `approved`
     or `published`. If there is none, it raises `approve the <format> first`.
   - validates the caption (section 5.3) and raises the first failing rule
4. A changed `format` always re-derives `source_item_id` and clears `media_urn` and `media_status`, so the media of the
   old format is never posted.
5. A row with `post_urn` set can never go back to `approved` or `pending_review`. This is part of the never-post-twice
   guarantee.

### 2.5 What the `engine` function will need (another workflow builds this; listed here, not built here)

The session token (scheduled Claude run) needs these actions:

| action | payload | rules |
|---|---|---|
| `insert_social_post` | `{blog_item_id, format, recommended_format, recommendation_reason, caption, first_comment, scheduled_for?}` | Blog must exist and be `type='blog'`. Status `draft` or `pending_review` only. One active row per blog (409 from the unique index). `source_item_id` is derived as in the trigger, using the newest child of that type in any status. Caption rules (5.3) are checked here too, with 400 on failure. |
| `update_social_post` | `{id, patch}` | Patch whitelist: `caption, first_comment, format, recommended_format, recommendation_reason, scheduled_for, status`. Status may go only from `draft` to `pending_review`. 409 if the row is `approved`, `publishing`, `published` or `cancelled`. |
| `get_social_post` / `list_social_posts` | `{id}` / `{blog_item_id?, status?, limit?}` | read only |

The publisher token gets nothing: the `linkedin` function publishes. Playbook input: `carousel.body.caption_linkedin` and
`hashtags` already exist and are the starting point for `caption`. The format recommendation and its reason come from
section 5.1.

### 2.6 What the dashboard needs (another workflow builds this)

- **Settings > LinkedIn card**
  - State comes from `select * from linkedin_connection` (RLS, no secrets) or from `GET .../linkedin/status`.
  - **Save app** form: Client ID and Client Secret, `type=password`, `autocomplete=off`, cleared from memory after the
    call.
  - **Connect** button: calls `oauth/start`, then `window.location.assign(authorize_url)`.
  - **Choose page** list when `status = 'choose_org'`.
  - **Pause** toggle (`update linkedin_connection set paused`).
  - **Disconnect** button.
  - Warning badges (section 4.4).
- **Blog review page, "LinkedIn post" panel**
  - Three-way format switch with the "Recommended" badge and its reason.
  - Caption editor with live checks: character count, a preview of the first 200 characters ("before see more"),
    hashtag count, link detector.
  - First-comment line, with a read-only preview of the link that will be appended.
  - Approve, Unapprove and Cancel buttons (RLS updates), plus **Publish now** and **Retry comment** (routes).
  - Status timeline: approved, then waiting for the blog to be live, then uploading or processing media, then posted
    (link to `post_url`), then comment posted.
- **CSP:** the org logo is served from LinkedIn's CDN (for example `media.licdn.com`), which the current `img-src`
  blocks. Either add the CDN host to `img-src` in `marketing/dashboard/netlify.toml`, or show the org name without the
  logo. The exact CDN host is **UNVERIFIED**: read it from a real `downloadUrl`.

---

## 3. Edge Function `linkedin`

- Deno; uses `npm:@supabase/supabase-js@2.49.4`, the same version as `engine`.
- Deployed with **`verify_jwt = false`**, because the OAuth callback is a browser redirect from LinkedIn and
  `publish_due` is called by pg_cron. Every route authenticates itself.
- **Routing:** the URL is `https://yexxrcgxhwsopssfyylo.supabase.co/functions/v1/linkedin/<route>`. In Deno,
  `new URL(req.url).pathname` ends with `/linkedin/<route>`; take the part after the last `/linkedin/`.
- **Response envelope:** `{ok:true, data}` or `{ok:false, error:"<message>", code:"<CODE>"}`. The one exception is
  `oauth/callback`, which answers 302.
- **CORS:** only `DASHBOARD_ORIGIN`. Allowed headers: `authorization, apikey, content-type`. `publish_due` has no CORS.
- **Team JWT routes:** header `Authorization: Bearer <user access token>` (plus `apikey: <publishable key>`). The
  function calls `auth.getUser(jwt)`, then `rpc('is_team')` through a client created with the user's Authorization
  header. If either check fails, it answers 401 `UNAUTHORIZED`.
- **Logs:** one JSON line per request,
  `{fn:'linkedin', route, status, ms, li:[{op, status, x_li_uuid}]}`. `x-li-uuid` is LinkedIn's request id (ERRORS).
  Logs never contain tokens, secrets, codes, states, captions or upload URLs.
- **Environment:** `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (injected by Supabase), plus `DASHBOARD_ORIGIN`.
  Test-only settings are covered in section 8.
- **Dormant behaviour:** while `linkedin_connection.status <> 'connected'` or `paused`, `publish_due` answers
  `{ok:true, data:{skipped:'not_connected'|'paused'}}` without contacting LinkedIn.

### 3.0 Common LinkedIn request rules

| Item | Value | Source |
|---|---|---|
| REST base | `https://api.linkedin.com/rest` | POSTS, IMAGES, ACLS |
| OAuth base | `https://www.linkedin.com/oauth/v2` | OAUTH |
| Headers on every `/rest` call | `Authorization: Bearer <access token>`, `Linkedin-Version: 202611`, `X-Restli-Protocol-Version: 2.0.0`, and `Content-Type: application/json` when there is a body | POSTS note ("All APIs require..."), IMAGES, VIDEOS, DOCUMENTS |
| FINDER calls | also send `X-RestLi-Method: FINDER` (shown in the Posts author finder sample) | POSTS |
| URNs in a path | URL-encode the whole key: `encodeURIComponent(urn)` followed by `(`→`%28` and `)`→`%29`. `encodeURIComponent` alone leaves the parentheses alone. | PROTOCOL, POSTS ("URNs included in the URL params must be URL encoded") |
| Created id | `x-restli-id` response header (posts and comments) | POSTS, COMMENTS |
| Error body | `{message, serviceErrorCode, status}` | ERRORS |
| 429 | Daily limits reset at **00:00 UTC**; a 429 can also be short-term infrastructure protection. Comments have a separate short-term **1-minute** create limit. | RATE, COMMENTS |
| 401 | missing, invalid, expired or revoked token | ERRORS |
| 426 | version header deprecated | ERRORS, VERSIONING |

**Upload-URL safety.** Upload URLs come back from LinkedIn and are fetched with PUT. Every sample host is
`www.linkedin.com` (IMAGES, DOCUMENTS, VIDEOS).

- The function PUTs only to `https:` URLs whose host is `www.linkedin.com`. In test mode it also allows the mock host
  (section 8).
- It sends the Bearer token only on image and document uploads, which require it (VECTOR). On video part and thumbnail
  uploads it sends **no** Authorization header ("The upload call shouldn't include an OAuth token", VECTOR).
- Any other host fails with `UPLOAD_HOST_REJECTED`.

### 3.1 `POST /save_app` (team JWT)

Request: `{"client_id": "<string>", "client_secret": "<string>"}`

Validation:

- `client_id` matches `^[A-Za-z0-9_-]{6,64}$`
- `client_secret` is 8 to 256 printable characters with no whitespace

These bounds are deliberately loose. The docs show the formats `861hhm46p48to2` and `gPecS7yqHkyyShvR` (REFRESH sample)
but specify no format.

Effect:

1. Stores the secret with `linkedin_secret_set('linkedin_client_secret', …)`.
2. If the `client_id` changed, deletes the access and refresh tokens and resets every connection field.
3. Sets `client_id`, `app_saved_at`, `app_saved_by` and `status = 'app_saved'` (or keeps `connected` when only the
   secret was rotated).

Response:

```json
{"ok":true,"data":{"client_id":"861hhm46p48to2","secret_saved":true,
 "redirect_uri":"https://yexxrcgxhwsopssfyylo.supabase.co/functions/v1/linkedin/oauth/callback","status":"app_saved"}}
```

### 3.2 `POST /oauth/start` (team JWT)

Request: `{}`. Needs `client_id` and the Vault client secret; otherwise 409 `APP_NOT_SAVED`.

Effect: creates a state (section 2.3) and builds the authorize URL (OAUTH step 2):

```
GET https://www.linkedin.com/oauth/v2/authorization?response_type=code
  &client_id=<client_id>
  &redirect_uri=https%3A%2F%2Fyexxrcgxhwsopssfyylo.supabase.co%2Ffunctions%2Fv1%2Flinkedin%2Foauth%2Fcallback
  &state=<43-char base64url>
  &scope=rw_organization_admin%20w_organization_social%20r_organization_social%20w_organization_social_feed%20r_organization_social_feed
```

The scopes are a fixed constant. Each one has a documented reason:

| Scope | Why | Source |
|---|---|---|
| `rw_organization_admin` | List the pages the member administers (`organizationAcls`); read the organization (`/organizations/{id}`) | ACLS permissions table, ORG permissions table |
| `w_organization_social` | Create posts as the organization; Images, Documents and Videos uploads | POSTS, IMAGES, DOCUMENTS, VIDEOS permission tables |
| `r_organization_social` | Find the page's own posts (`q=author`) to reconcile a lost create response | POSTS "Find Posts by Authors" note |
| `w_organization_social_feed` | Create a comment as the organization | COMMENTS permission table |
| `r_organization_social_feed` | Read the post's comments to reconcile a lost comment response | COMMENTS permission table |

POSTS describes `w_organization_social` as covering "post, comment, and like". The Comments page, however, names
`w_organization_social_feed`. Both are requested so that comments work under either reading.

Do not change this list later without telling the owner: "If you request a different scope than the previously granted
scope, all the previous access tokens are invalidated", and the member must re-consent (OAUTH).

Response: `{"ok":true,"data":{"authorize_url":"https://www.linkedin.com/oauth/v2/authorization?...","expires_at":"<iso, +10 min>"}}`.
The dashboard navigates to that URL with a top-level navigation, not a popup. The URL contains no secret.

### 3.3 `GET /oauth/callback` (from LinkedIn; no JWT)

LinkedIn redirects to this URL with either `?code=…&state=…` or `?error=user_cancelled_login|user_cancelled_authorize&error_description=…&state=…`
(OAUTH).

Steps:

1. **Check and consume the state** (section 2.3). A missing, unknown, expired or used state ends the flow with
   `reason=state_invalid` and no token exchange. LinkedIn advises a 401 for a state mismatch (OAUTH). Because a browser
   is waiting, the function redirects to the dashboard with that reason instead of answering 401.
2. If `error` is present: redirect with `reason=<error>`. `error_description` is never shown or stored.
3. **Exchange the code** (OAUTH step 3):

   ```
   POST https://www.linkedin.com/oauth/v2/accessToken
   Content-Type: application/x-www-form-urlencoded

   grant_type=authorization_code&code=<code>&client_id=<id>&client_secret=<secret>&redirect_uri=<same redirect_uri>
   ```

   Response: `{access_token, expires_in, refresh_token?, refresh_token_expires_in?, scope}` (OAUTH, REFRESH).
   Store both tokens in Vault, then:
   - `access_token_expires_at = now + expires_in s`
   - `refresh_token_expires_at = now + refresh_token_expires_in s` (only if the refresh token was returned)
   - `has_refresh_token`
   - `scopes = split(scope)`

   The scope string is documented as "URL-encoded, space-delimited" (OAUTH), while introspection returns a
   comma-separated list (INTROSPECT). Split on spaces, `%20` and commas. If any required scope is missing:
   `reason=missing_scope` and the stored tokens are deleted.
4. **Find the pages** (ACLS):

   ```
   GET https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=100&start=0
   ```

   Send the common headers. The elements look like `{role, roleAssignee, state, organization | organizationTarget}`.
   The doc samples use both key names, so read `organization ?? organizationTarget`. Store
   `member_urn = roleAssignee`. Follow `paging.links[rel=next]` if present.
5. For each org, read it (ORG "Retrieve an Administered Organization"):

   ```
   GET https://api.linkedin.com/rest/organizations/<numeric id>
   ```

   Single GETs only, because **BATCH_GET is not allowed in Development tier** (ACCESS). Keep `localizedName`,
   `vanityName`, `id` and `logoV2.cropped`.
6. **How many pages:**
   - **0** → `reason=not_admin`. Tokens are deleted and `status = 'error'`.
   - **1** → `status = 'connected'`.
   - **more than 1** → `status = 'choose_org'` and `org_candidates = [{org_urn, org_name}]` (URNs and names only).
7. **Logo, best effort:**
   - `logoV2.cropped` is a `urn:li:digitalmediaAsset:<id>`.
   - Per VECTOR ("reuse the id as `urn:li:image:<id>`") and ORG ("For more information, see GET a single image"), call
     `GET https://api.linkedin.com/rest/images/urn%3Ali%3Aimage%3A<id>` and keep `downloadUrl` and
     `downloadUrlExpiresAt` (IMAGES).
   - **UNVERIFIED** that this works for page logos. Any failure leaves `org_logo_url` null.
8. Redirect `302 Location: ${DASHBOARD_ORIGIN}/settings?linkedin=connected` (or `?linkedin=error&reason=<code>`), with
   headers `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. The code and state are never echoed.

### 3.4 `POST /select_org` (team JWT)

Request: `{"org_urn":"urn:li:organization:123"}`. The URN must be in `org_candidates` and `status` must be `choose_org`.

Effect: re-reads the org (step 3.3.5), sets the org fields and `status = 'connected'`, and empties `org_candidates`.
Response: same as `status`.

### 3.5 `GET /status` (team JWT; non-secret)

Side effects, each at most once per call:

- If `org_data_fetched_at` is older than 7 weeks, or the logo URL has expired, re-read the org. STORAGE allows
  organization profile data about an authenticated organization to be kept for 8 weeks.
- If `last_checked_at` is older than 24 h, run the introspection heartbeat (section 4.3).

Response:

```json
{"ok":true,"data":{
  "status":"connected","paused":false,"client_id":"861hhm46p48to2","secret_saved":true,
  "org":{"urn":"urn:li:organization:123","name":"Dhiti Services","vanity":"dhiti-services","logo_url":"https://…"},
  "scopes":["rw_organization_admin","w_organization_social","r_organization_social","w_organization_social_feed","r_organization_social_feed"],
  "access_token_expires_at":"…","refresh_token_expires_at":"…","has_refresh_token":true,
  "last_refreshed_at":"…","last_checked_at":"…","last_check_active":true,
  "warnings":[{"level":"amber","code":"REFRESH_TOKEN_EXPIRING","days_left":25}],
  "api_version":"202611","api_version_sunset":"2027-11-16",
  "redirect_uri":"https://yexxrcgxhwsopssfyylo.supabase.co/functions/v1/linkedin/oauth/callback"}}
```

### 3.6 `POST /disconnect` (team JWT)

Effect:

1. Deletes `linkedin_access_token` and `linkedin_refresh_token` from Vault.
2. Clears the org, member, token and scope fields and sets `status = 'app_saved'`. The app credentials are kept.
   `{"forget_app":true}` also deletes the client secret and `client_id` and sets `status = 'not_configured'`.
3. Posts that are `approved` stay approved and wait. A row that is `publishing` keeps its stage and resumes after a
   reconnect.

Response: `{"ok":true,"data":{"status":"app_saved"}}`.

The fetched docs describe **no token-revocation endpoint**. To revoke the grant on LinkedIn's side, the member removes
the app in their LinkedIn settings (ERRORS mentions revocation "from their privacy settings on LinkedIn's website").

### 3.7 `POST /publish_due` (pg_cron via pg_net; header `x-cron-secret`)

Auth: compare `x-cron-secret` with `linkedin_secret_get('linkedin_cron_secret')` using a constant-time comparison.
Mismatch → 401. Request body: `{}`. Work is capped at about 50 s per call: at most **2 posts**, plus one token
maintenance step.

1. **Token maintenance** (section 4).
2. If the connection is not `connected`, or is `paused`: answer `skipped`.
3. **Pick due rows**, oldest `approved_at` first:

   ```sql
   select … where (status = 'approved' and (scheduled_for is null or scheduled_for <= now())
                    or status = 'publishing'
                    or (status = 'published' and comment_status in ('pending','requested')))
     and (next_attempt_at is null or next_attempt_at <= now())
     and (lock_until is null or lock_until < now())
   ```

4. **Gates**, checked again on every run before any LinkedIn write. Each failure explains itself in `last_error` and
   sets `next_attempt_at`:
   1. **The blog is live:**
      - Blog item `status = 'published'` and `published_url` matches
        `^https://www\.dhitiservices\.com/blog/<body.slug>/?$`.
      - `GET published_url` with `redirect: 'manual'`, a 10 s timeout and no cookies answers exactly **HTTP 200** with
        `content-type` `text/html`.
      - If not, the row stays `approved`, `last_error = 'blog not live yet (HTTP <n>)'`, and
        `next_attempt_at = now() + 10 min`. It is **not** a failure.
   2. **The source is valid:** `source_item_id` is a child of the blog, its `type = format`, and its status is
      `approved` or `published`.
   3. **The asset exists** in storage (`assets` row):

      | format | asset |
      |---|---|
      | `carousel` | `carousel_pdf` (PDF, at most 100 MB and 300 pages, DOCUMENTS) |
      | `graphic` | `graphic`: the 1080×1080 one first, else 1200×627. PNG; under 36,152,320 pixels; JPG/GIF/PNG allowed (IMAGES) |
      | `video` | `video` (MP4, 3 s to 30 min, 75 KB to 500 MB, VIDEOS), plus `video_poster` if present |

   4. **The caption and first comment pass** the rules in section 5.3.
   5. Gates 2 to 4 failing → `status = 'failed'` and `last_error`. The owner fixes the problem and approves again.
5. **Claim** the row with a conditional update. If it returns 0 rows, another invocation owns the row; skip it.

   ```sql
   update social_posts set status = 'publishing', lock_until = now() + interval '5 minutes', attempts = attempts + 1
   where id = $1 and status in ('approved','publishing') and (lock_until is null or lock_until < now()) returning *
   ```

6. **Run the state machine** (section 3.7.1), then release with `lock_until = null`. When the row stays in
   `publishing`, also set `next_attempt_at`.

Response:

```json
{"ok":true,"data":{"processed":[{"id":"…","from":"approved","to":"publishing","stage":"media_processing","note":"video PROCESSING"}],
 "maintenance":{"refreshed":false,"introspected":false}}}
```

#### 3.7.1 Publish state machine (idempotent: never posts twice)

Every arrow below is a conditional `UPDATE … WHERE id = $1 AND stage IS NOT DISTINCT FROM $old RETURNING *`. Each step's
result is **written to the row before the next LinkedIn call**.

```
(media_urn null) ──upload──► media_uploading ──► media_processing ──AVAILABLE──► media_ready
media_ready ──(write stage=post_requested FIRST)──► POST /rest/posts
   201 + x-restli-id ─► post_urn, post_url saved, stage=post_created, status=published, published_at, comment_status=pending
   4xx (400/403/404/422) ─► no post exists ─► status=failed, stage=media_ready, last_error
   network error / timeout / 5xx / 429 ─► stage stays post_requested ─► RECONCILE on the next run
post_requested (no post_urn) ─► RECONCILE:
   GET /rest/posts?author=<enc org urn>&q=author&count=20&sortBy=CREATED&viewContext=AUTHOR
   match element where content.media.id == media_urn (each attempt uploads its own media, so the URN is unique)
   found ─► adopt its id as post_urn (same as 201)      not found ─► re-POST, at most 3 times in total, then failed
comment_status pending ─► (write comment_status=requested FIRST) ─► POST comment
   201 ─► comment_id, comment_urn, comment_text_sent, comment_status=posted
   4xx ─► comment_status=failed, last_error      network/5xx/429 ─► stays requested ─► RECONCILE:
   GET /rest/socialActions/<enc post urn>/comments ─► element with actor == org_urn and message.text containing the link
   found ─► adopt      not found ─► POST again (at most 5 comment_attempts, then failed; the owner can call retry_comment)
```

- `post_urn` is unique and is never cleared. The trigger blocks any return to `approved` once it is set. Retrying a
  comment never touches the post.
- The reconcile reads are reads only. Nothing read back from LinkedIn is stored except our own URNs. The data rules
  allow URNs to be kept without limit (STORAGE). Other members' comment content may be kept for at most 48 h (STORAGE),
  so it is not stored.
- Reconcile relies on the `author` finder, which needs `r_organization_social` (POSTS). Because the default view is
  `READER`, the finder is called with `viewContext=AUTHOR`: posts that are still processing are visible only in the
  AUTHOR view (POSTS).

#### 3.7.2 Media upload per format

**Graphic: image** (IMAGES, VECTOR)

```
POST https://api.linkedin.com/rest/images?action=initializeUpload
{"initializeUploadRequest":{"owner":"urn:li:organization:<id>"}}
→ 200 {"value":{"uploadUrlExpiresAt":…, "uploadUrl":"https://www.linkedin.com/dms-uploads/…", "image":"urn:li:image:…"}}
```

- Save `media_urn = value.image` before uploading.
- `SYNCHRONOUS_UPLOAD` is not supported (IMAGES).
- Upload: `PUT <uploadUrl>` with header `Authorization: Bearer <token>` and the raw PNG bytes. VECTOR says to use PUT
  with the OAuth token. The sample answers 201; accept any 2xx.
- Then poll `GET https://api.linkedin.com/rest/images/<enc urn>` until `status = "AVAILABLE"` (IMAGES schema: PROCESSING,
  PROCESSING_FAILED, AVAILABLE, WAITING_UPLOAD). Poll up to 3 times, 2 s apart, within this run; otherwise
  `stage = media_processing` and the next run polls once.

**Carousel: document PDF** (DOCUMENTS). Organic carousel posts are **not supported**; carousels are sponsored only
(POSTS content-type table). That is why the carousel goes out as a PDF document post.

```
POST https://api.linkedin.com/rest/documents?action=initializeUpload
{"initializeUploadRequest":{"owner":"urn:li:organization:<id>"}}
→ 200 {"value":{"uploadUrlExpiresAt":…, "uploadUrl":"https://www.linkedin.com/dms-uploads/…", "document":"urn:li:document:…"}}
```

- Upload: `PUT <uploadUrl>` with `Authorization: Bearer <token>` and the PDF bytes. The sample uses
  `curl --upload-file`, which is a PUT, with that header and answers 201.
- Poll `GET https://api.linkedin.com/rest/documents/<enc urn>` until `AVAILABLE` (DOCUMENTS schema), as for images.
- File limits: at most 100 MB and 300 pages; types PDF, PPT, PPTX, DOC, DOCX (DOCUMENTS).

**Reel: video** (VIDEOS)

```
POST https://api.linkedin.com/rest/videos?action=initializeUpload
{"initializeUploadRequest":{"owner":"urn:li:organization:<id>","fileSizeBytes":<exact bytes>,
  "uploadCaptions":false,"uploadThumbnail":<true if a video_poster exists>}}
→ 200 {"value":{"uploadUrlsExpireAt":…, "video":"urn:li:video:…",
  "uploadInstructions":[{"uploadUrl":"…","firstByte":0,"lastByte":4194303}, …],
  "uploadToken":"", "thumbnailUploadUrl":"…"}}
```

Steps:

1. Save `media_urn = value.video` and `stage = media_uploading`.
2. **Parts:** for each instruction, in order, `PUT uploadUrl` with header `Content-Type: application/octet-stream`, the
   bytes `[firstByte, lastByte]` inclusive (`buf.slice(firstByte, lastByte + 1)`), and **no Authorization header**
   (VECTOR, VIDEOS sample). Collect each response's `ETag` header value in order. The sample answers 200.
3. **Thumbnail** (when requested): `PUT thumbnailUploadUrl` with headers `media-type-family: STILLIMAGE` and
   `Content-Type: application/octet-stream`, and the poster JPG/PNG. The sample answers 201. Then set
   `thumbnail_urn_uploaded = true`. The docs order is: initialize, upload the video, upload captions, upload the
   thumbnail, finalize (VIDEOS).
4. **Finalize:**

   ```
   POST https://api.linkedin.com/rest/videos?action=finalizeUpload
   {"finalizeUploadRequest":{"video":"<urn>","uploadToken":"<value.uploadToken as returned, may be \"\">","uploadedPartIds":["<etag1>","<etag2>",…]}}
   → 200
   ```

   The part order must match `uploadInstructions` (VIDEOS schema).
5. Set `stage = media_processing`. Each run then polls `GET https://api.linkedin.com/rest/videos/<enc urn>`:
   - `AVAILABLE` → `media_ready`
   - `PROCESSING` or `WAITING_UPLOAD` → `next_attempt_at = now() + 2 min`
   - `PROCESSING_FAILED` → `failed`, with `processingFailureReason` in `last_error` (VIDEOS schema)

   Give up after 60 minutes in `media_processing`.
6. If a run dies between initialize and finalize, the next run starts a new initialize. A new video URN is harmless:
   nothing has been posted yet.

The upload URLs and `uploadToken` are bearer-like and are **never stored**. Upload URLs "typically" expire 30 days after
initialize (VIDEOS); this design never needs them after the run that created them.

#### 3.7.3 Create the organization post (POSTS, POST-SCHEMA, DOCUMENTS)

```
POST https://api.linkedin.com/rest/posts
{
  "author": "urn:li:organization:<id>",
  "commentary": "<caption escaped per section 5.4>",
  "visibility": "PUBLIC",
  "distribution": {"feedDistribution": "MAIN_FEED", "targetEntities": [], "thirdPartyDistributionChannels": []},
  "content": {"media": {"id": "<media_urn>", "title": "<see below>", "altText": "<graphic only, ≤120 chars>"}},
  "lifecycleState": "PUBLISHED",
  "isReshareDisabledByAuthor": false
}
→ 201, header x-restli-id: urn:li:share:<n> | urn:li:ugcPost:<n>
```

- **Media title:**
  - document: the blog title. It is **required** for documents (POST-SCHEMA: "The media title (Required field for
    Documents API)"; DOCUMENTS sample).
  - video: the blog title (optional, POSTS sample).
  - image: omit the title and send `altText` instead (POST-SCHEMA media `altText`; IMAGES recommends under 120
    characters).
- `lifecycleState`: "PUBLISHED is the only accepted field during creation" (POST-SCHEMA).
- Errors (POSTS): 400 `FIELD_LENGTH_TOO_LONG`, `INVALID_URN_TYPE`, `MISSING_FIELD`; 403 `ACCESS_DENIED`; 409
  `CONFLICT`; 422; 429; 500; 503.
  - 409 is documented as "retry the request". Treat it as retryable **through reconcile**, never as a blind re-POST.
- **`post_url`:** `https://www.linkedin.com/feed/update/<post_urn>/`. POSTS documents this pattern for `urn:li:ugcPost`.
  **UNVERIFIED** for `urn:li:share` URNs, though LinkedIn uses the same pattern in its own UI. The dashboard shows the
  URN as well.

#### 3.7.4 First comment, posted by the page (COMMENTS)

Right after `post_created`, in the same run, check the post: `GET https://api.linkedin.com/rest/posts/<enc post_urn>?viewContext=AUTHOR`.

- `lifecycleState` is `PUBLISHED` → comment now.
- `PUBLISH_REQUESTED` (content still processing, POST-SCHEMA) → leave `comment_status = 'pending'` and set
  `next_attempt_at = now() + 2 min`.
- `PUBLISH_FAILED` → `status = 'failed'` with `last_error`, and the owner is alerted.

The comment request:

```
POST https://api.linkedin.com/rest/socialActions/<enc post_urn>/comments
{"actor":"urn:li:organization:<id>","object":"<post_urn>","message":{"text":"<first_comment>\n<blog link with UTM>"}}
→ 201, header x-restli-id: <comment id>; body includes "commentUrn":"urn:li:comment:(urn:li:activity:…,<id>)"
```

- When `actor` is an organization URN, the page is shown as the publisher (COMMENTS URN table). The body has `actor`,
  `object` and `message` (COMMENTS create fields). Send no `content`, because images in inline comments are refused with
  403 (COMMENTS errors).
- Store the comment id from `x-restli-id` and `commentUrn` from the body. Do **not** build the comment URN yourself: it
  is composed with the activity URN, which differs from the post URN (COMMENTS "Comment Urns").
- **429** "Comment create throttled" is a 1-minute member limit. Set `next_attempt_at = now() + 2 min`.

### 3.8 `POST /publish_now` (team JWT) and `POST /retry_comment` (team JWT)

**`publish_now`**

- Request: `{"social_post_id":"<uuid>"}`.
- The row must be `approved`; otherwise 409 `NOT_APPROVED`.
- Runs the same gates and state machine as `publish_due` for that one row, ignoring `scheduled_for` and
  `next_attempt_at` but **never** the blog-live gate.
- A blog that is not live yet answers 409 `BLOG_NOT_LIVE` and the row stays approved. Video processing may still
  continue on later cron runs.
- Response: `{"ok":true,"data":{"id","status","stage","comment_status","post_url","last_error"}}`.

**`retry_comment`**

- Request: `{"social_post_id":"<uuid>"}`.
- The row must be `published` with `post_urn` set and `comment_status` `failed` (or `pending`/`requested` with an
  expired lease); otherwise 409 `COMMENT_NOT_RETRYABLE`.
- Resets `comment_attempts = 0` and runs only section 3.7.4, reconcile first. **The post is never re-created.**
- Response: as for `publish_now`.

### 3.9 Call budget per post (Development tier: 100 per member and 500 per app per day, ACCESS)

| format | calls |
|---|---|
| graphic | init 1 + upload 1 + status 1–3 + post 1 + get post 1 + comment 1 ≈ **6–8** |
| carousel | ≈ **6–8**, same as graphic |
| video (≤ 3 parts) | init 1 + parts 1–3 + thumbnail 1 + finalize 1 + status polls (2 min apart, usually 1–5) + post 1 + get 1 + comment 1 ≈ **8–15** |

Plus about 1 introspection a day and 1 refresh every ~53 days. **UNVERIFIED** whether PUTs to `www.linkedin.com`
upload URLs count against the API limits. At 3 posts a week this uses well under 10% of the limit.

Standard tier limits are not published; they show in the Developer Portal **Analytics** tab, and admins get an email at
75% of the app quota (RATE). On a 429, set `next_attempt_at` to the earlier of now + 15 min and the next 00:00 UTC; on
the second consecutive 429 the same day, wait for 00:00 UTC.

### 3.10 Migration `linkedin_cron`

```sql
create extension if not exists pg_cron;   -- not installed today (checked 2026-11-28)
create extension if not exists pg_net;
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'linkedin_cron_secret',
                           'x-cron-secret header for linkedin/publish_due');
select cron.schedule('linkedin-publish-due', '*/5 * * * *', $job$
  select net.http_post(
    url := 'https://yexxrcgxhwsopssfyylo.supabase.co/functions/v1/linkedin/publish_due',
    headers := jsonb_build_object('content-type','application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'linkedin_cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 60000)
$job$);
```

- The secret is generated inside the database and never appears in the repo.
- To rotate it, run `select vault.update_secret(id, <new>)`. The function reads the secret on each call.
- While dormant, each cron call costs one cheap function invocation (about 288 a day).

---

## 4. Token lifecycle

### 4.1 Lifetimes

| Token | Lifetime | Source |
|---|---|---|
| Authorization code | 30 minutes, single exchange | OAUTH |
| Access token | "Currently, all access tokens are issued with a 60-day lifespan" | OAUTH |
| Refresh token | 365 days, a **fixed** TTL counted from the first consent. A refresh gives a new 60-day access token, but the refresh token's remaining TTL keeps shrinking: on day 360 both expire 5 days later. | REFRESH |

**Always use the returned `expires_in` and `refresh_token_expires_in`, never these constants.** The REFRESH samples
themselves show `expires_in: 86400`.

### 4.2 Refresh-token availability

The docs disagree:

- REFRESH: "LinkedIn supports programmatic refresh tokens for all approved Marketing Developer Platform (MDP) partners."
- OAUTH: "available for a limited set of partners."

Community Management is a Marketing API product, so a refresh token is **expected but not guaranteed**. The callback
records `has_refresh_token`:

- **With a refresh token:** when `access_token_expires_at - now() < 7 days`, `publish_due` refreshes:

  ```
  POST https://www.linkedin.com/oauth/v2/accessToken
  Content-Type: application/x-www-form-urlencoded

  grant_type=refresh_token&refresh_token=<rt>&client_id=<id>&client_secret=<secret>
  ```

  (REFRESH step 2). Store the new access token and refresh token, recompute both expiry times from the response, and set
  `last_refreshed_at`.
  - `400 invalid_request "…invalid, expired or revoked"` → `status = 'expired'` (the owner must reconnect).
  - Network errors and 5xx → retry next run.
  - The Developer Portal **Analytics** tab shows a per-app daily quota for refresh-token use (PORTAL), so refresh at most
    once a day.
- **Without a refresh token:** the only way to renew is the authorization flow again. If the member is still signed in
  to LinkedIn and the access token has not expired, the consent screen is skipped and LinkedIn redirects straight back
  (OAUTH step 5). The owner clicks **Reconnect**: same routes, same scopes.

### 4.3 Validity checks (CM-REQ CM-002 to CM-006)

- **Daily heartbeat:** `POST https://www.linkedin.com/oauth/v2/introspectToken` with form body
  `client_id, client_secret, token=<access token>`. The response is `{active, status: active|expired|revoked,
  expires_at, scope, …}` (INTROSPECT).
  - `active:false` → `status = 'revoked'` or `'expired'` (from `status`).
  - It needs no extra scope. That is why it replaces the `/me` heartbeat CM-REQ mentions, which would need a profile
    scope.
  - Store `last_checked_at` and `last_check_active`, and correct `access_token_expires_at` from `expires_at`.
- **Any `/rest` call answering 401** → introspect once. If the token is inactive, set `status = 'expired'` or
  `'revoked'` and stop publishing. Posts stay `approved` or `publishing` and resume after a reconnect.
- LinkedIn may revoke tokens at any time. The expected fallback is the standard OAuth flow (REFRESH note), which here is
  the **Reconnect** button.

### 4.4 Dashboard warning thresholds (`status.warnings`)

| Condition | Level | Code |
|---|---|---|
| `status` in (`expired`, `revoked`, `error`) or `last_check_active = false` | red | `RECONNECT_REQUIRED` |
| no refresh token and the access token expires in ≤ 14 days | amber | `ACCESS_TOKEN_EXPIRING` |
| no refresh token and the access token expires in ≤ 3 days | red | `ACCESS_TOKEN_EXPIRING` |
| refresh token expires in ≤ 30 days | amber | `REFRESH_TOKEN_EXPIRING` (reconnect any time to reset the 365 days) |
| refresh token expires in ≤ 7 days | red | `REFRESH_TOKEN_EXPIRING` |
| has a refresh token but `last_refreshed_at` failed and the access token expires in ≤ 3 days | red | `REFRESH_FAILING` |
| `last_checked_at` older than 48 h | amber | `HEARTBEAT_STALE` |
| `now() > 2027-08-16` (3 months before the 202611 sunset on 2027-11-16, MIGRATIONS) | amber | `API_VERSION_AGING` (bump `LINKEDIN_VERSION` after reading CHANGES) |
| any `social_posts` row `failed`, or `comment_status = 'failed'` | red | `POST_FAILED` / `COMMENT_FAILED` |
| Development tier: 11 months after `connected_at` | amber | `DEV_TIER_DEADLINE` (the integration must be finished within 12 months, ACCESS) |

---

## 5. Captions and first comments

### 5.1 Format recommendation (the playbook decides; the owner can switch at approval)

| Recommend | When |
|---|---|
| `carousel` (PDF document post) | The blog is a how-to, checklist, framework or step list with 5 or more scannable points, and the carousel item exists. This is the default for most Dhiti guides. |
| `video` (reel) | The blog opens with a scenario or story, the reel has the owner's voiceover (`body.voiceover` set), and its status is approved. |
| `graphic` | The blog has one standout statistic, quote or tip that works alone. Also used when the other two are not approved. |

`recommendation_reason` states the reason in one sentence, for example "7-step checklist: a document post lets readers
swipe the steps".

### 5.2 Caption: Dhiti editorial policy for a B2B company page

These are **house rules, not LinkedIn API facts**. The API documents no truncation point or limits for this.

1. **Hook in the first ~200 characters.** The feed truncates long commentary behind "…see more", and the cut-off point
   depends on device (**UNVERIFIED**: not in the API docs). The first line must state the reader's problem or a specific
   number, in plain words. No "In today's fast-paced world".
2. **Short paragraphs:** 1 or 2 sentences each, a blank line between them. Use `\n\n`; newlines are preserved, as the
   LITTLE bullet sample shows.
3. **Length:** aim for 700 to 1,300 characters. The validator caps it at 3,000. 3,000 is LinkedIn's in-product limit:
   **UNVERIFIED**, because the API docs only define the error `FIELD_LENGTH_TOO_LONG` (POSTS).
4. **No link of any kind in the caption.** The link goes in the first comment. The caption ends with a pointer such as
   "Full guide in the first comment."
5. **At most 3 hashtags, all on the last line**, CamelCase, letters and digits only. For example
   `#TravelOperations #HotelOperations #CustomerSupport`.
6. Brand voice (ARCHITECTURE.md): practical, specific, no hype, **no em dashes (—)**, no emojis, no @mentions, no
   clickbait, nothing that is not in the blog. Facts and numbers must match the blog and its cited sources.
7. Do not copy the blog's opening paragraph word for word.

### 5.3 Validator (shared by the engine, the trigger and the function; reject with the first failing rule)

- `caption`:
  - must be 1 to 3,000 characters after trimming
  - must contain no `http://`, `https://` or `www.` (case-insensitive), and no bare domain matching
    `\b[a-z0-9-]+\.(com|in|co|io|net|org|ai)\b`
  - must contain no `—`
  - must contain no control characters other than `\n` (`\r\n` is normalised to `\n`)
  - must have no `#` except in the final hashtag line, which matches
    `^(#[A-Za-z][A-Za-z0-9]{1,49})( #[A-Za-z][A-Za-z0-9]{1,49}){0,2}$` (at most 3 tags)
  - the first 200 characters must contain at least one full sentence or line
- `first_comment`:
  - one line, 1 to 300 characters
  - no URL, no `#`, no `—`
  - the link is **appended by the function, never typed by a person**

### 5.4 First comment text (built by the function)

```
comment_text = first_comment.trim() + "\n" + link
link = new URL(blog.published_url)  // must be https://www.dhitiservices.com/blog/<slug>/ (gate 4.1)
       + searchParams: utm_source=linkedin, utm_medium=social, utm_campaign=<blog.body.slug>
// e.g. "The full 7-step checklist, with sources:\nhttps://www.dhitiservices.com/blog/hotel-night-audit-checklist/?utm_source=linkedin&utm_medium=social&utm_campaign=hotel-night-audit-checklist"
```

The slug is kebab-case (`[a-z0-9-]`), so it needs no encoding. `comment_text_sent` stores exactly what was sent.

### 5.5 Little text format escaping (commentary only)

`commentary` is of type *little text* (POST-SCHEMA). LITTLE says: "All reserved characters need to be escaped with a
backslash, even if those characters are not used in one of the supported elements." The reserved set, from the `Text`
grammar, is:

```
|  {  }  @  [  ]  (  )  <  >  #  \  *  _  ~
```

```ts
const LITTLE_RESERVED = /[\\|{}@\[\]()<>#*_~]/g;
export function escapeLittle(s: string): string { return s.replace(LITTLE_RESERVED, (c) => "\\" + c); }

export function buildCommentary(caption: string): string {
  const text = caption.replace(/\r\n?/g, "\n").trim();
  const lines = text.split("\n");
  const last = lines[lines.length - 1];
  const tagLine = /^(#[A-Za-z][A-Za-z0-9]{1,49})( #[A-Za-z][A-Za-z0-9]{1,49}){0,2}$/.test(last) ? last : null;
  const body = (tagLine ? lines.slice(0, -1) : lines).join("\n");
  // hashtags stay as HashtagElements ('#' SINGLE_WORD, LITTLE grammar); everything else is escaped
  return escapeLittle(body) + (tagLine ? "\n" + tagLine : "");
}
```

- Hashtags are sent as `#Word`. POSTS shows `"Follow best practices #coding"`, which LinkedIn stores as
  `{hashtag|\#|coding}` and which is valid input as well (LITTLE HashtagTemplate). JSON-encoding adds the second
  backslash, giving `"\\*"` in the payload, as in the LITTLE sample.
- Mentions (`@[Name](urn:li:organization:…)`) are not used, so a literal `@` is always escaped.
- **The comment `message.text` is not escaped.** COMMENTS types it as plain "Text" with optional `attributes` for
  mentions, not as little text, and its samples are plain. **UNVERIFIED** against a real account: the mock checks that
  no backslash escapes are sent, and the first real comment must be checked by eye.

---

## 6. Security checklist (owner-only)

- **Owner-only access.** Every route that is not cron or callback needs a team JWT that passes `is_team()`; tables use
  RLS `is_team()`; `anon` has no grants.
- **Secrets stay server-side.** The client secret, access token, refresh token and cron secret exist only in Vault,
  readable only by `service_role` through the `linkedin_secret_*` functions. They are not in the repo, the dashboard
  bundle, logs, API responses, URLs or error text (SECURE).
- **OAuth state:** single-use, expires in 10 minutes, only its hash is stored, bound to the starting owner's user id and
  email, and re-checked against `allowed_users` and `auth.users` at callback time (OAUTH, SECURE).
- **Redirect URI:** a fixed constant that must equal the one registered on the Auth tab (OAUTH).
- **Bearer token on uploads:** sent only to `https://www.linkedin.com/...` upload URLs for images and documents, never
  for video parts or thumbnails (VECTOR).
- **Data retention.** Stored indefinitely: only our own content plus LinkedIn URNs and ids (STORAGE: no limit).
  Organization name and logo URL: refreshed or dropped after 8 weeks (STORAGE). No member profile data or member
  comment content is stored (STORAGE: 24 h and 48 h limits).
- **The client secret is entered once.** The owner pastes it into the form; nothing can read it back.
- **Kill switches:** `paused`, then `disconnect`, then `forget_app`.

---

## 7. Status summary (what moves a row)

| who | from | to |
|---|---|---|
| engine (session) | (new) | `draft` or `pending_review` |
| engine (session) | `draft` | `pending_review` |
| dashboard (owner, RLS + trigger) | `pending_review` / `failed` | `approved` (format switch allowed in the same update) |
| dashboard | `approved` | `pending_review` (only while `post_urn` is null) |
| dashboard | `draft` / `pending_review` / `approved` / `failed` | `cancelled` |
| linkedin fn | `approved` | `publishing` (claim) |
| linkedin fn | `publishing` | `published` (post created; the comment follows) or `failed` |
| linkedin fn | `published` | `published` (`comment_status`: `pending` → `requested` → `posted` / `failed`) |

---

## 8. Testing against a mock LinkedIn (no real credentials)

Function settings that only the test harness sets:

- `LINKEDIN_MOCK_BASE=http://127.0.0.1:<port>`. It replaces `https://api.linkedin.com` and
  `https://www.linkedin.com/oauth/v2`, and is added to the upload-host allowlist.
- The function refuses to start if `LINKEDIN_MOCK_BASE` is set while `SUPABASE_URL` is the production project URL. The
  mock is only possible with `supabase functions serve` against a local or branch database.

The mock is not built yet. It goes under the session scratchpad `linkedin/mock/`, and it must implement exactly the calls in sections 3 and 4, with these checks:

- It requires `Linkedin-Version: 202611` and `X-Restli-Protocol-Version: 2.0.0` on `/rest/*`.
- It rejects a Bearer token on video part PUTs, and requires one on image and document PUTs.
- It checks the form fields on `/accessToken` and `/introspectToken`.
- It checks that `commentary` uses correct little escaping and that comment text is unescaped.
- It requires `content.media.title` for documents.

Fault switches:

- drop the response of `POST /rest/posts` after creating the post, to test reconcile
- the same for comments
- 429, 500, 401
- video stays `PROCESSING` for N polls, or ends in `PROCESSING_FAILED`
- `PUBLISH_REQUESTED` before `PUBLISHED`
- refresh returns 400
- introspection returns `active:false`
- 0, 1 or 2 administered orgs

Acceptance tests:

1. No post without approval.
2. No post before the blog URL answers 200.
3. Exactly one post under every fault, including a lost create response.
4. The comment is retried alone and the post is never recreated.
5. A replayed, expired or foreign OAuth state is rejected.
6. No secret appears in any response, log line or database column outside Vault (grep the mock's captured traffic and
   the function logs for the test secret values).

---

## 9. Open uncertainties (all must be confirmed on the first real connection)

1. **Page verification click path** (step 1.3): the LinkedIn Help page could not be fetched.
2. **Review time** for Community Management Development tier: not published.
3. **Development tier for real posting:** ACCESS frames it as build and test, and Standard as "live production". Low
   volume should work, but apply for Standard once the flow is demonstrable.
4. **Refresh token is returned** for this app (section 4.2): the docs conflict. Both paths are handled.
5. **Comment scope:** w_organization_social vs w_organization_social_feed (section 3.2). Both are requested.
6. **Commentary maximum length:** 3,000 is the UI value. The API docs only name `FIELD_LENGTH_TOO_LONG`.
7. **The first comment's `message.text` is plain** (not little-escaped), and LinkedIn turns the URL in it into a link.
8. **`post_url` pattern** for `urn:li:share` URNs (documented for `ugcPost` only).
9. **Org logo** via `logoV2` → `urn:li:image:<id>` → `GET /rest/images`, and the CDN host for the dashboard CSP.
10. Whether PUTs to upload URLs count against API rate limits.
11. **`organizationAcls` response key** for the org: `organization` vs `organizationTarget`. Both are read.
