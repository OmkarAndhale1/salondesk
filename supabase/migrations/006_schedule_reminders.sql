CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'salondesk_app_url')
     OR NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'salondesk_cron_secret') THEN
    RAISE EXCEPTION 'Add salondesk_app_url and salondesk_cron_secret to Supabase Vault before applying this migration.';
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'salondesk-reminders') THEN
    PERFORM cron.unschedule('salondesk-reminders');
  END IF;

  PERFORM cron.schedule(
    'salondesk-reminders',
    '*/10 * * * *',
    $job$
      SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'salondesk_app_url') || '/api/cron/reminders',
        headers := jsonb_build_object(
          'content-type', 'application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'salondesk_cron_secret')
        ),
        body := '{}'::jsonb
      );
    $job$
  );
END;
$$;