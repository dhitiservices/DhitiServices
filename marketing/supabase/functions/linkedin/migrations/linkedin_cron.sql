-- linkedin_cron (LINKEDIN.md 3.10). pg_cron + pg_net call linkedin/publish_due every 10 minutes.
-- The x-cron-secret value is generated inside the database and stored only in Vault; it is never printed.
-- While LinkedIn is not connected the job sends no HTTP request at all (the WHERE clause), so it is a no-op.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'linkedin_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'linkedin_cron_secret',
                                'x-cron-secret header for linkedin/publish_due');
  end if;
end $$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'linkedin-publish-due') then
    perform cron.unschedule('linkedin-publish-due');
  end if;
end $$;

select cron.schedule('linkedin-publish-due', '*/10 * * * *', $job$
  select net.http_post(
    url := 'https://yexxrcgxhwsopssfyylo.supabase.co/functions/v1/linkedin/publish_due',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'linkedin_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000)
  where exists (select 1 from public.linkedin_connection where id = 1 and status in ('connected', 'choose_org'));
$job$);
