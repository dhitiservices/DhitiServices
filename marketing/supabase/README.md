# Engine API: Supabase Edge Function `engine`

The marketing engine never holds a Supabase service key. Every read and write from the Claude session
(`marketing/engine` CLI) and from the GitHub publish workflow goes through this one function, which checks a
short-lived engine token and then uses the service-role key that Supabase injects into the function.

Contract: `marketing/ARCHITECTURE.md` (v2). Source: `functions/engine/index.ts` (Deno, `npm:@supabase/supabase-js@2.49.4`).

- Project: `yexxrcgxhwsopssfyylo`
- URL: `https://yexxrcgxhwsopssfyylo.supabase.co/functions/v1/engine`
- Deployed with **verify_jwt = false**, because the function does its own authentication.
- `GET` on the URL returns `{ok:true, data:{service:"dhiti-engine", version}}`. Use it as a health check. It needs no token.

## Calling it

```
POST /functions/v1/engine
content-type: application/json
apikey: sb_publishable_eggopcLFltAS1Q3nTmGecQ_dUMTCIhR          (public by design)
authorization: Bearer sb_publishable_eggopcLFltAS1Q3nTmGecQ_dUMTCIhR
x-engine-token: <engine token>

{ "action": "get_item", "payload": { "id": "<uuid>" } }
```

A successful call returns HTTP 200 with `{ "ok": true, "data": ... }`. A failed call returns
`{ "ok": false, "error": "message" }` with one of these statuses:

| status | meaning |
|---|---|
| 400 | bad payload: unknown action, a field that is not whitelisted, an invalid uuid/enum/date, or a constraint/foreign-key violation |
| 401 | the `x-engine-token` is missing, malformed, unknown, expired or revoked |
| 403 | a publisher token called an action outside its allowlist, or tried to claim a job that is not `publish_now` |
| 404 | the row or storage object does not exist |
| 409 | an approval-gate refusal (see below), or a unique violation |
| 413 | the storage upload limit was exceeded |
| 500 | an unexpected error (details are in the function logs) |

In Node, use `marketing/engine/src/store.js` rather than calling the function by hand. It adds retries and
proxy support, and it has a DRY_RUN mirror (see below).

## Tokens

`public.engine_tokens` stores only `sha256(token)` as hex. The plaintext token is returned once, when it is issued.
Issuing a token works only from `postgres` or `service_role`, for example with the Supabase connector:

```sql
-- weekly Claude session (8 hours)
select public.issue_engine_token('session', 8, 'weekly run');
-- long-lived publisher token for the GitHub secret DHITI_ENGINE_TOKEN (1 year)
select public.issue_engine_token('publisher', 24*365, 'github publisher');
-- revoke
update public.engine_tokens set revoked = true where label = 'weekly run';
```

Each request is checked with `token_hash = sha256(x-engine-token) and not revoked and expires_at > now()`.
Issuing a new token also deletes tokens that expired more than 7 days ago.

## Actions

The table below lists every action in the contract, plus three read helpers, `delete_files` and `list_jobs`. These
extra actions are additive. All but `list_jobs` work with session tokens only. Version 2.3.0 (v3 addendum) also added
the `awaiting_voiceover` item status, the `render_video` job kind, `list_jobs`, and read access to the owner library
(`library/<uuid>/<file>`) through `sign_download`.

| action | payload | data | publisher |
|---|---|---|---|
| `get_settings` | `{}` | `settings.data` | yes |
| `context` | `{weeks?: 8}` | `{settings, recent_topics, pending_jobs, revisions, since, week_start}` | no |
| `create_run` | `{kind}` (`weekly`\|`jobs`\|`publish`\|`manual`) | run row | yes |
| `finish_run` | `{id, status?='succeeded', error?, log?, usage?}` | run row (`finished_at` set) | yes |
| `insert_brief` | brief fields (`summary` required, `week_start` defaults to the current IST Monday) | row | no |
| `get_brief` | `{id}` | row | no |
| `insert_topics` | `{topics:[...]}` (max 30; missing keys get the column defaults) | rows, in input order | no |
| `update_topic` | `{id, patch}` | row | no |
| `get_topic` | `{id}` | row | no |
| `list_topics` | `{status?, brief_id?, week_start?, since?, limit?}` | rows (week_start desc, priority asc) | no |
| `insert_item` | item fields (`type` required) | row | no |
| `update_item` | `{id, patch}` | row | yes (restricted) |
| `get_item` | `{id}` | row + `assets` (sorted by position) | yes |
| `list_items` | `{status?, type?, topic_id?, parent_id?, limit?}` (status/type may be arrays; `parent_id:null` means blogs only) | rows (created_at desc, max 500) | yes |
| `insert_asset` | asset fields (`storage_path` must be under `items/<content_item_id>/`) | row | no |
| `list_assets` | `{content_item_id}` | rows (position asc) | yes |
| `delete_assets` | `{content_item_id}` | `{deleted}` (count of rows) | no |
| `sign_upload` | `{path}` | `{signedUrl, token, path}` (bucket `marketing`, upsert) | no |
| `sign_download` | `{path, expiresIn?=600}` (10 s to 7 days); `path` may also be `library/<uuid>/<file>` | `{signedUrl, path, expiresIn}` | yes |
| `delete_files` | `{content_item_id, paths?}` | `{deleted:[paths]}` | no |
| `claim_jobs` | `{kinds?, limit?=5}` (max 50) | claimed jobs, oldest first | yes (`publish_now` only) |
| `list_jobs` | `{kind?, status?, limit?=50}` (kind/status may be arrays; max 200) | jobs, oldest first, nothing is claimed | yes (`kind: 'publish_now'` only) |
| `finish_job` | `{id, status?='done', error?}` (`done`\|`failed`\|`queued`, where `queued` re-queues the job) | row | yes |

### Whitelisted fields

`id`, `created_at` and other system columns are never writable. `updated_at` is ignored, because a trigger sets it.
A field that is not on the list is rejected with 400 rather than silently dropped.

- **research_briefs (insert):** `run_id, week_start, summary, trends, pain_points, competitor_notes, opportunities, sources`
- **topics (insert/patch):** `brief_id, week_start, title, angle, primary_keyword, secondary_keywords, audience, category, rationale, priority, planned_publish_date, status, error`
- **content_items (insert):** `topic_id, parent_id, type, title, status, body, feedback, version, scheduled_for, error`
- **content_items (patch, session):** `title, status, body, feedback, version, scheduled_for, error`
- **content_items (patch, publisher):** `status, published_at, published_url, error`
- **assets (insert):** `content_item_id, kind, storage_path, mime, width, height, position, meta`

### Approval gate

Only a person in the dashboard approves content. The function enforces that:

- **Session tokens:**
  - They may set an item's status only to `generating`, `awaiting_voiceover`, `pending_review` or `failed`. They can never set
    `approved`, `rejected`, `changes_requested`, `published`, `approved_*` or `published_*`.
  - They cannot update an item that is `approved` or `published` (409).
  - They cannot run `delete_files` on such an item (409).
- **Publisher tokens:**
  - They may update only items that are `approved` or `published` (409 otherwise).
  - They may set status only to `published` or `failed`.

### Jobs

`claim_jobs` is race-safe. It first selects the oldest queued ids, then runs
`update jobs set status='running', started_at=now() where id in (...) and status='queued' returning *`.
Two workers that claim at the same moment therefore get disjoint sets of jobs.

If `kinds` is omitted, each worker gets its own queue:

- A **session** claims `run_weekly`, `regenerate` and `render_video`.
- A **publisher** claims `publish_now`. It is not allowed to claim any other kind.

Jobs are created by the dashboard under RLS, which allows queued jobs only. There is no `insert_job` action.
For tests, insert a job through the Supabase connector:
`insert into jobs(kind,payload,requested_by) values ('regenerate','{}','test')`.

### Storage

- Bucket `marketing` is private.
- Paths must match `items/<uuid>/<more>/<file>`, using only `[A-Za-z0-9_.-/]` with no `.` or `..` segments.
  `sign_download` (read only) also accepts `library/<uuid>/<file>`, the owner media the dashboard uploads.
- Upload: call `sign_upload`, then `PUT <signedUrl>` with the raw bytes, `content-type` and `x-upsert: true`.
  The signed upload URL is valid for 2 hours.
- `delete_files` with no `paths` removes everything under `items/<id>/`. You can also call it after the item row
  has been deleted, to clean up orphaned files.
- SQL cannot delete from `storage.objects`, because Supabase blocks it. Use this action instead.

## Deploying

Option 1: use the Supabase connector (`deploy_edge_function`). Set name `engine`, entrypoint `index.ts`,
`verify_jwt: false`, and pass the content of `functions/engine/index.ts`.

Option 2: use the Supabase CLI, from `marketing/`:

```bash
supabase functions deploy engine --project-ref yexxrcgxhwsopssfyylo --no-verify-jwt
```

You do not need to set any secrets, because `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically. To check the function after a deploy:

1. `curl https://yexxrcgxhwsopssfyylo.supabase.co/functions/v1/engine` should report the expected `version`.
2. A POST without a token must return 401.

Logs: in the Supabase dashboard (Edge Functions, `engine`, Logs), or with the connector's `query_logs` on source
`function_logs`. Each request logs one JSON line, `{fn, action, kind, status, ms}`. Tokens and payloads are never
logged.

## store.js (engine client)

`marketing/engine/src/store.js` exposes the same API on two backends.

| export | action |
|---|---|
| `getSettings()` | `get_settings` merged over the contract defaults (3 blogs/week, Mon/Wed/Fri, ...) |
| `context({weeks})` or `context(8)` | `context` (settings merged as above) |
| `createRun(kind)`, `finishRun(id, {status, error, usage, log})` | `create_run`, `finish_run` (`log` defaults to the log.js buffer) |
| `insertBrief(obj)`, `getBrief(id)` | `insert_brief`, `get_brief` |
| `insertTopics(arr)`, `updateTopic(id, patch)`, `getTopic(id)`, `listTopics(filter, opts)`, `listRecentTopics(weeks)` | topic actions |
| `insertItem(obj)`, `updateItem(id, patch)`, `getItem(id)`, `listItems(filter, opts)` | item actions |
| `insertAsset(obj)`, `listAssets(itemId)`, `deleteAssets(itemId)` (returns a count) | asset actions |
| `signUpload(path)`, `signDownload(path, expiresIn)` | `sign_upload`, `sign_download` |
| `uploadFile(path, buffer, mime)` (returns the path), `downloadFile(path)` (returns a Buffer) | sign, then PUT or GET |
| `deleteFiles(itemId, paths?)` | `delete_files` |
| `claimJobs(limit, kinds)` or `claimJobs({limit, kinds})`, `finishJob(id, {status, error})`, `listJobs({kind, status, limit})` | job actions (`listJobs` never claims) |
| `insertJob(kind, payload, by)` | DRY_RUN only |
| `engineCall(action, payload)`, `httpRequest(url, opts)`, `backendName()` ("dry-run"|"edge"), `weekStartIST()`, `EngineError` (alias `StoreError`) | low level |

How store.js behaves:

- **Ids:** any id argument also accepts a row object. FK fields such as `topic_id: topicRow` are normalised to ids.
- **Filters:** `listItems` and `listTopics` keep the rich filter syntax: scalar, array, `null`, and
  `{eq,neq,lt,lte,gt,gte,in,is}`. The server applies the keys it supports. Store applies the rest on the client,
  comparing timestamps as instants. Example: `listItems({type:'blog', status:'approved', scheduled_for:{lte: now}})`.
- **Errors:** failures throw `EngineError` with `.status` (HTTP), `.action` and `.retryable`.
- **Retries:** reads and updates are retried on network errors and 408/429/5xx. Inserts and `claim_jobs` are
  retried only when the request provably never reached the function (a connect-phase failure, 429 or 503), so
  retries never create duplicates.
- **Proxy:** `HTTPS_PROXY` and `NO_PROXY` are honoured through a built-in CONNECT tunnel. This is required in
  Claude Code cloud sessions, where Node's `fetch` ignores the proxy unless `NODE_USE_ENV_PROXY=1` is set.
  Other modules can import `httpRequest` for proxy-aware downloads.
- **DRY_RUN=1:** a local mirror of every action, with the same whitelists, enums, defaults, FK checks and errors.
  Data is stored in `$OUT_DIR/db.json` (default `marketing/engine/out/`) and files under `$OUT_DIR/storage/`.
  Signed URLs are `file://` URLs.
- **DRY_RUN_KIND:** sets which rights the DRY_RUN mirror applies.
  - `any` (the default) combines session and publisher rights and also allows `approved`/`approved_*`, so
    approval and publishing can be simulated locally.
  - `session` or `publisher` gives exactly the live permissions of that token kind.
