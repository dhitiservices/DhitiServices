-- linkedin_core (LINKEDIN.md section 2). Applied with Supabase MCP apply_migration; kept here for review.
-- Secrets live only in Supabase Vault and are reachable only through the service-role functions below.

-- ------------------------------------------------------------------------------------------------------------
-- 1. Vault helpers (service_role only)
-- ------------------------------------------------------------------------------------------------------------

create or replace function public.linkedin_secret_name_ok(p_name text) returns boolean
language sql immutable set search_path = '' as $$
  select p_name in ('linkedin_client_secret','linkedin_access_token','linkedin_refresh_token','linkedin_cron_secret');
$$;

create or replace function public.linkedin_secret_set(p_name text, p_value text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.linkedin_secret_name_ok(p_name) then
    raise exception 'linkedin_secret_set: name not allowed' using errcode = '22023';
  end if;
  if p_value is null or length(p_value) < 1 or length(p_value) > 8192 then
    raise exception 'linkedin_secret_set: invalid value' using errcode = '22023';
  end if;
  select id into v_id from vault.secrets where name = p_name;
  if v_id is null then
    perform vault.create_secret(p_value, p_name, 'dhiti linkedin integration');
  else
    perform vault.update_secret(v_id, p_value);
  end if;
end $$;

create or replace function public.linkedin_secret_get(p_name text) returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.linkedin_secret_name_ok(p_name) then
    raise exception 'linkedin_secret_get: name not allowed' using errcode = '22023';
  end if;
  return (select decrypted_secret from vault.decrypted_secrets where name = p_name limit 1);
end $$;

create or replace function public.linkedin_secret_exists(p_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.linkedin_secret_name_ok(p_name) then
    raise exception 'linkedin_secret_exists: name not allowed' using errcode = '22023';
  end if;
  return exists (select 1 from vault.secrets where name = p_name);
end $$;

create or replace function public.linkedin_secret_delete(p_name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.linkedin_secret_name_ok(p_name) then
    raise exception 'linkedin_secret_delete: name not allowed' using errcode = '22023';
  end if;
  delete from vault.secrets where name = p_name;
end $$;

-- ------------------------------------------------------------------------------------------------------------
-- 2. linkedin_connection (singleton, no secrets). The team reads it and may change only `paused`.
-- ------------------------------------------------------------------------------------------------------------

create table public.linkedin_connection (
  id int primary key default 1 check (id = 1),
  status text not null default 'not_configured' check (status in
    ('not_configured','app_saved','choose_org','connected','expired','revoked','error')),
  paused boolean not null default false,
  client_id text check (client_id ~ '^[A-Za-z0-9_-]{6,64}$'),
  app_saved_at timestamptz, app_saved_by text,
  member_urn text,
  org_urn text check (org_urn ~ '^urn:li:organization:[0-9]+$'),
  org_id bigint, org_name text, org_vanity text,
  org_logo_url text, org_logo_url_expires_at timestamptz,
  org_data_fetched_at timestamptz,
  org_candidates jsonb not null default '[]' check (jsonb_typeof(org_candidates) = 'array'),
  scopes text[] not null default '{}',
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  has_refresh_token boolean not null default false,
  last_refreshed_at timestamptz,
  last_refresh_attempt_at timestamptz,          -- addition: refresh throttle (at most hourly retries)
  last_refresh_error text,                      -- addition: drives the REFRESH_FAILING warning
  last_checked_at timestamptz, last_check_active boolean,
  last_check_attempt_at timestamptz,            -- addition: heartbeat throttle when introspection fails
  last_429_at timestamptz,                      -- addition: second 429 on the same UTC day waits for midnight
  rate_limited_until timestamptz,               -- addition: global back-off after a 429
  last_error text,
  connected_by text, connected_at timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.linkedin_connection(id) values (1);
alter table public.linkedin_connection enable row level security;
create policy linkedin_connection_team_select on public.linkedin_connection
  for select to authenticated using (public.is_team());
create policy linkedin_connection_team_pause on public.linkedin_connection
  for update to authenticated using (public.is_team()) with check (public.is_team());
revoke all on public.linkedin_connection from public, anon, authenticated;
grant select on public.linkedin_connection to authenticated;
grant update (paused) on public.linkedin_connection to authenticated;

-- Defence in depth next to the column grant: API roles other than the service role may change only `paused`.
create or replace function public.linkedin_connection_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;
  if (to_jsonb(new) - 'paused' - 'updated_at') is distinct from (to_jsonb(old) - 'paused' - 'updated_at') then
    raise exception 'only "paused" can be changed here' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger linkedin_connection_guard before update on public.linkedin_connection
  for each row execute function public.linkedin_connection_guard();
create trigger linkedin_connection_touch before update on public.linkedin_connection
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------------------------------------------------------
-- 3. linkedin_oauth_states (RLS on, NO policies, service role only)
-- ------------------------------------------------------------------------------------------------------------

create table public.linkedin_oauth_states (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique check (state_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null,
  user_email text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  used_at timestamptz
);
alter table public.linkedin_oauth_states enable row level security;
revoke all on public.linkedin_oauth_states from public, anon, authenticated;

-- oauth/start: one flow at a time. Deletes every earlier unused state and anything older than a day.
create or replace function public.linkedin_oauth_state_create(p_state_hash text, p_user_id uuid, p_user_email text)
returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare v_exp timestamptz;
begin
  delete from public.linkedin_oauth_states where used_at is null or created_at < now() - interval '1 day';
  insert into public.linkedin_oauth_states(state_hash, user_id, user_email)
  values (p_state_hash, p_user_id, lower(p_user_email))
  returning expires_at into v_exp;
  return v_exp;
end $$;

-- oauth/callback: single use + not expired, then the same owner checks as is_team(), done for the stored user.
create or replace function public.linkedin_oauth_state_consume(p_state_hash text)
returns table(user_id uuid, user_email text, owner_ok boolean)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with c as (
    update public.linkedin_oauth_states s set used_at = now()
    where s.state_hash = p_state_hash and s.used_at is null and s.expires_at > now()
    returning s.user_id, s.user_email
  )
  select c.user_id, c.user_email,
         exists (
           select 1 from auth.users u
           join public.allowed_users a on lower(a.email) = lower(u.email)
           where u.id = c.user_id
             and lower(u.email) = lower(c.user_email)
             and u.email_confirmed_at is not null
             and (u.banned_until is null or u.banned_until < now())
             and u.deleted_at is null
         )
  from c;
end $$;

-- ------------------------------------------------------------------------------------------------------------
-- 4. Caption and first-comment validators (LINKEDIN.md 5.3). Twins of validate.ts; same rules, order, messages.
-- ------------------------------------------------------------------------------------------------------------

create or replace function public.linkedin_caption_error(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  t text := btrim(replace(replace(coalesce(p, ''), E'\r\n', E'\n'), E'\r', E'\n'), E' \t\n');
  lines text[];
  last text;
  body text;
  hook text;
begin
  if char_length(t) < 1 then return 'caption is empty'; end if;
  if char_length(t) > 3000 then return 'caption is longer than 3000 characters'; end if;
  if t ~* '(https?://|www\.)' or t ~* '\m[a-z0-9-]+\.(com|in|co|io|net|org|ai)\M' then
    return 'caption must not contain a link (the link goes in the first comment)';
  end if;
  if position(E'—' in t) > 0 then return 'caption must not contain an em dash'; end if;
  if t ~ '[\x01-\x09\x0B-\x1F\x7F]' then return 'caption must not contain control characters'; end if;
  lines := string_to_array(t, E'\n');
  last := lines[array_length(lines, 1)];
  if last ~ '^(#[A-Za-z][A-Za-z0-9]{1,49})( #[A-Za-z][A-Za-z0-9]{1,49}){0,2}$' then
    body := array_to_string(lines[1:array_length(lines, 1) - 1], E'\n');
  else
    body := t;
  end if;
  if position('#' in coalesce(body, '')) > 0 then
    return 'hashtags are allowed only on the last line, at most 3, like #HotelOperations';
  end if;
  if btrim(coalesce(body, ''), E' \t\n') = '' then return 'caption needs text before the hashtags'; end if;
  hook := left(t, 200);
  if not (char_length(t) <= 200 or position(E'\n' in hook) > 0 or hook ~ '[.!?](\s|$)') then
    return 'the first 200 characters must contain a full sentence (the hook)';
  end if;
  return null;
end $$;

create or replace function public.linkedin_first_comment_error(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  t text := btrim(replace(replace(coalesce(p, ''), E'\r\n', E'\n'), E'\r', E'\n'), E' \t\n');
begin
  if char_length(t) < 1 then return 'first comment is empty'; end if;
  if char_length(t) > 300 then return 'first comment is longer than 300 characters'; end if;
  if position(E'\n' in t) > 0 then return 'first comment must be one line'; end if;
  if t ~* '(https?://|www\.)' or t ~* '\m[a-z0-9-]+\.(com|in|co|io|net|org|ai)\M' then
    return 'first comment must not contain a link (the blog link is added automatically)';
  end if;
  if position('#' in t) > 0 then return 'first comment must not contain hashtags'; end if;
  if position(E'—' in t) > 0 then return 'first comment must not contain an em dash'; end if;
  if t ~ '[\x01-\x09\x0B-\x1F\x7F]' then return 'first comment must not contain control characters'; end if;
  return null;
end $$;

-- ------------------------------------------------------------------------------------------------------------
-- 5. social_posts
-- ------------------------------------------------------------------------------------------------------------

create table public.social_posts (
  id uuid primary key default gen_random_uuid(),
  blog_item_id uuid not null references public.content_items(id) on delete cascade,
  source_item_id uuid references public.content_items(id) on delete set null,
  platform text not null default 'linkedin' check (platform = 'linkedin'),
  recommended_format text check (recommended_format in ('carousel','video','graphic')),
  recommendation_reason text check (char_length(recommendation_reason) <= 500),
  format text not null check (format in ('carousel','video','graphic')),
  caption text not null default '' check (char_length(caption) <= 3000),
  first_comment text not null default '' check (char_length(first_comment) <= 300),
  status text not null default 'pending_review' check (status in
    ('draft','pending_review','approved','publishing','published','failed','cancelled')),
  stage text check (stage in ('media_uploading','media_processing','media_ready','post_requested','post_created')),
  stage_changed_at timestamptz,                 -- addition: reconcile grace period and the 60-minute video limit
  comment_status text not null default 'none' check (comment_status in ('none','pending','requested','posted','failed')),
  approved_at timestamptz, approved_by text,
  scheduled_for timestamptz,
  media_urn text check (media_urn ~ '^urn:li:(image|document|video):[A-Za-z0-9_-]+$'),
  media_status text,
  thumbnail_urn_uploaded boolean not null default false,
  post_urn text unique check (post_urn ~ '^urn:li:(share|ugcPost):[0-9]+$'),
  post_url text,
  comment_id text, comment_urn text,
  comment_text_sent text,
  comment_requested_at timestamptz,             -- addition: when the last comment create was sent
  attempts int not null default 0,              -- publish runs that claimed the row
  post_attempts int not null default 0,         -- addition: POST /rest/posts calls (max 3 in total)
  comment_attempts int not null default 0,
  next_attempt_at timestamptz,
  lock_until timestamptz,
  last_error text,
  published_at timestamptz,
  created_by text not null default 'engine',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_posts_published_has_urn check (status <> 'published' or post_urn is not null)
);
create unique index social_posts_one_per_blog on public.social_posts(blog_item_id, platform) where status <> 'cancelled';
create index social_posts_due on public.social_posts(status, next_attempt_at);
create index social_posts_source on public.social_posts(source_item_id);
alter table public.social_posts enable row level security;
create policy social_posts_team_select on public.social_posts
  for select to authenticated using (public.is_team());
create policy social_posts_team_update on public.social_posts
  for update to authenticated using (public.is_team()) with check (public.is_team());
revoke all on public.social_posts from public, anon, authenticated;
grant select on public.social_posts to authenticated;
grant update (caption, first_comment, format, status, scheduled_for) on public.social_posts to authenticated;

-- Team updates (LINKEDIN.md 2.4). SECURITY INVOKER: runs as the dashboard user, so RLS applies to its reads.
create or replace function public.linkedin_social_posts_guard() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_team_cols constant text[] := array['caption','first_comment','format','status','scheduled_for','updated_at'];
  v_editable boolean := old.status in ('draft','pending_review','failed');
  v_edited boolean := new.caption is distinct from old.caption
                   or new.first_comment is distinct from old.first_comment
                   or new.format is distinct from old.format
                   or new.scheduled_for is distinct from old.scheduled_for;
  v_src uuid;
  v_err text;
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;

  -- Column protection (on top of the column grant): nothing but the five team columns may change.
  if (to_jsonb(new) - v_team_cols) is distinct from (to_jsonb(old) - v_team_cols) then
    raise exception 'only caption, first comment, format, schedule and status can be changed' using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if not (   (old.status = 'pending_review' and new.status = 'approved')
            or (old.status = 'approved' and new.status = 'pending_review')
            or (old.status in ('draft','pending_review','approved','failed') and new.status = 'cancelled')
            or (old.status = 'failed' and new.status = 'approved')) then
      raise exception 'status change % -> % is not allowed', old.status, new.status using errcode = '42501';
    end if;
    if new.status in ('approved','pending_review') and old.post_urn is not null then
      raise exception 'this post is already on LinkedIn; it cannot be approved again' using errcode = '42501';
    end if;
  end if;

  if v_edited and not v_editable then
    raise exception 'unapprove the post before editing it' using errcode = '42501';
  end if;

  if new.format is distinct from old.format then
    -- The media of the old format must never be posted.
    new.media_urn := null;
    new.media_status := null;
    new.thumbnail_urn_uploaded := false;
    if old.post_urn is null then new.stage := null; new.stage_changed_at := null; end if;
    select ci.id into v_src from public.content_items ci
     where ci.parent_id = new.blog_item_id and ci.type = new.format
     order by ci.created_at desc, ci.id desc limit 1;
    new.source_item_id := v_src;
  end if;

  if new.status = 'approved' and old.status is distinct from 'approved' then
    new.approved_at := now();
    new.approved_by := auth.jwt() ->> 'email';
    new.last_error := null;
    new.next_attempt_at := null;
    new.lock_until := null;
    new.attempts := 0;
    new.post_attempts := 0;
    if old.post_urn is null then
      new.stage := null;
      new.stage_changed_at := null;
      new.media_urn := null;
      new.media_status := null;
      new.thumbnail_urn_uploaded := false;
    end if;
    v_src := null;
    select ci.id into v_src from public.content_items ci
     where ci.parent_id = new.blog_item_id and ci.type = new.format and ci.status in ('approved','published')
     order by ci.created_at desc, ci.id desc limit 1;
    if v_src is null then
      raise exception 'approve the % first', new.format using errcode = '23514';
    end if;
    new.source_item_id := v_src;
    v_err := public.linkedin_caption_error(new.caption);
    if v_err is not null then raise exception '%', v_err using errcode = '23514'; end if;
    v_err := public.linkedin_first_comment_error(new.first_comment);
    if v_err is not null then raise exception '%', v_err using errcode = '23514'; end if;
  end if;

  if new.status = 'pending_review' and old.status = 'approved' then
    new.approved_at := null;
    new.approved_by := null;
  end if;

  return new;
end $$;

create trigger social_posts_guard before update on public.social_posts
  for each row execute function public.linkedin_social_posts_guard();
create trigger social_posts_touch before update on public.social_posts
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------------------------------------------------------
-- 6. Publisher helpers for the linkedin function (service_role only; use the database clock)
-- ------------------------------------------------------------------------------------------------------------

create or replace function public.linkedin_due_posts(p_limit int) returns table(id uuid)
language sql stable security definer set search_path = '' as $$
  select p.id from public.social_posts p
   where (   (p.status = 'approved' and (p.scheduled_for is null or p.scheduled_for <= now()))
          or p.status = 'publishing'
          or (p.status = 'published' and p.comment_status in ('pending','requested')))
     and (p.next_attempt_at is null or p.next_attempt_at <= now())
     and (p.lock_until is null or p.lock_until < now())
   order by p.approved_at asc nulls last, p.created_at asc
   limit greatest(1, least(coalesce(p_limit, 2), 20));
$$;

create or replace function public.linkedin_claim_post(p_id uuid, p_lease_seconds int) returns setof public.social_posts
language sql security definer set search_path = '' as $$
  update public.social_posts p
     set status = case when p.status = 'approved' then 'publishing' else p.status end,
         lock_until = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 300), 900))),
         attempts = p.attempts + 1
   where p.id = p_id
     and (p.status in ('approved','publishing')
          or (p.status = 'published' and p.comment_status in ('pending','requested')))
     and (p.lock_until is null or p.lock_until < now())
  returning p.*;
$$;

-- ------------------------------------------------------------------------------------------------------------
-- 7. Function privileges: Postgres grants EXECUTE to PUBLIC by default, and this project's default ACL also
--    grants it to anon/authenticated. Revoke everywhere, then grant exactly.
-- ------------------------------------------------------------------------------------------------------------

revoke all on function public.linkedin_secret_name_ok(text) from public, anon, authenticated;
revoke all on function public.linkedin_secret_set(text, text) from public, anon, authenticated;
revoke all on function public.linkedin_secret_get(text) from public, anon, authenticated;
revoke all on function public.linkedin_secret_exists(text) from public, anon, authenticated;
revoke all on function public.linkedin_secret_delete(text) from public, anon, authenticated;
revoke all on function public.linkedin_oauth_state_create(text, uuid, text) from public, anon, authenticated;
revoke all on function public.linkedin_oauth_state_consume(text) from public, anon, authenticated;
revoke all on function public.linkedin_due_posts(int) from public, anon, authenticated;
revoke all on function public.linkedin_claim_post(uuid, int) from public, anon, authenticated;
revoke all on function public.linkedin_connection_guard() from public, anon, authenticated;
revoke all on function public.linkedin_social_posts_guard() from public, anon, authenticated;
revoke all on function public.linkedin_caption_error(text) from public, anon;
revoke all on function public.linkedin_first_comment_error(text) from public, anon;

grant execute on function public.linkedin_secret_name_ok(text) to service_role;
grant execute on function public.linkedin_secret_set(text, text) to service_role;
grant execute on function public.linkedin_secret_get(text) to service_role;
grant execute on function public.linkedin_secret_exists(text) to service_role;
grant execute on function public.linkedin_secret_delete(text) to service_role;
grant execute on function public.linkedin_oauth_state_create(text, uuid, text) to service_role;
grant execute on function public.linkedin_oauth_state_consume(text) to service_role;
grant execute on function public.linkedin_due_posts(int) to service_role;
grant execute on function public.linkedin_claim_post(uuid, int) to service_role;
-- Pure validators: the guard trigger calls them as the dashboard user; the dashboard may call them for live checks.
grant execute on function public.linkedin_caption_error(text) to authenticated, service_role;
grant execute on function public.linkedin_first_comment_error(text) to authenticated, service_role;

-- Live updates for the dashboard (Realtime applies RLS; neither table holds secrets).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.social_posts, public.linkedin_connection;
  end if;
end $$;
