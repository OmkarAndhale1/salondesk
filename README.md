# SalonDesk

## Local setup

Install dependencies with `npm install`, copy `.env.example` to `.env.local`, and fill in the Supabase URL, anon key, service-role key, demo salon ID, and Gemini key. Keep `.env.local` out of version control. Then run `npm run dev`.

In Supabase, create a project and open **SQL Editor**. Apply the migrations in numeric order: `001_init.sql`, `002_realtime.sql`, `003_salon_faq.sql`, `004_booking_integrity.sql`, `005_reminder_outbox.sql`, `006_schedule_reminders.sql`, and `007_bot_limits.sql`. Before applying `006_schedule_reminders.sql`, enable Supabase Vault, `pg_cron`, and `pg_net`, then add the Vault values described below.

Run `npx tsx scripts/seed.ts` to create Glow Salon and its sample services. Add the resulting salon UUID to `NEXT_PUBLIC_DEMO_SALON_ID`.

Apply subsequent migrations in numeric order. Before applying `006_schedule_reminders.sql`, enable `pg_cron`, `pg_net`, and Vault in Supabase and add Vault secrets named `salondesk_app_url` (the deployed app origin) and `salondesk_cron_secret` (the same value configured as the app's `CRON_SECRET`). The schedule reads both values from Vault at request time; no secret is stored in migration source. Set `LOCAL_APP_URL` to test locally and run `npx tsx scripts/test-reminders.ts` with the required process environment.

Reminder workers use a unique outbox row and an atomic database lease to avoid concurrent sends. As with any external delivery, a process crash after the channel accepts a message but before the outbox row is marked sent can still cause a retry; a real WhatsApp provider's idempotency support is needed for strict exactly-once delivery.

Create the Glow Salon owner after seeding by passing its salon UUID and a strong password to `npx tsx scripts/create-user.ts <email> <password> owner <salon-uuid> <name>`. The script never prints the password. Avoid putting a real password into shell history; use a temporary password and rotate it after first sign-in.

## Checks

Run `npm run lint`, `npx tsc --noEmit`, `npm run build`, and `npx tsx scripts/test-slots.ts`. With Supabase credentials available in the process environment, run `npx tsx scripts/test-isolation.ts` to create and clean up disposable test tenants while checking RLS with anon-key sessions. With the app running and `CRON_SECRET` set, run `npx tsx scripts/test-reminders.ts`. `npx tsx scripts/test-bot.ts` sends 10 sample prompts to Gemini and prints its replies; review the output for correctness and safety.

## Environment variables

Set the variables listed in `.env.example` in `.env.local` for local development and in your hosting provider's encrypted environment settings for deployment. `SUPABASE_SERVICE_ROLE_KEY` is server-only and must never use a `NEXT_PUBLIC_` prefix. `GEMINI_API_KEY` is required to run the bot. The WhatsApp-related variables are reserved for the later Meta integration and are not used by the current mock channel. Add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to use shared Redis rate limits; without them the app falls back to process memory, which is not shared between serverless instances.

## Supabase and cron

Run every migration in the SQL Editor in order and check that each statement completes successfully. `004_booking_integrity.sql` can fail if existing confirmed bookings overlap; resolve those records before retrying. The migrations configure tenant RLS, Realtime, booking end times and overlap integrity, the notification outbox, and scheduling.

Before `006_schedule_reminders.sql`, enable **Vault**, **pg_cron**, and **pg_net** in the Supabase dashboard. In Vault create `salondesk_app_url` with the app's origin and `salondesk_cron_secret` with the same random value configured as `CRON_SECRET`. The SQL migration references Vault by name; it contains no secret values. The cron endpoint receives the secret in `x-cron-secret`.

Reminder work is queued once per booking and claimed with a database lease. The worker may retry if a process crashes before completion. A crash after an external provider accepts a send but before the outbox is marked sent can produce a duplicate; strict exactly-once delivery requires provider-side idempotency. The current MockChannel does not contact customers.

## Vercel deployment

Import this repository into Vercel and configure the same server/client environment variables from `.env.example` in the project settings. Add Supabase URLs/keys and `GEMINI_API_KEY`; set a strong `CRON_SECRET`, then add the deployment origin and matching secret to Supabase Vault before applying the scheduling migration. Deploy only after applying the schema migrations and creating at least one super-admin/user profile. Verify login, RLS isolation, inbox Realtime, and cron responses in the deployed environment.

The inbound webhook, send adapter, and demo chat in this build are mock/local-only. `NODE_ENV=production` disables `/mock-chat`, `/api/webhook/mock`, and `/api/mock-chat/messages`. A paying salon still needs the later Meta WhatsApp Cloud integration, webhook signature verification, approved templates, and provider delivery/idempotency handling. This plan does not make real WhatsApp messages or set up Vercel cron by itself; reminders are scheduled by Supabase `pg_cron`/`pg_net`.

## Pilot onboarding checklist

1. Apply and verify all schema migrations.
2. Seed or create a salon and provision its owner account.
3. Add services, working hours, salon policies, and review link in Settings.
4. Test the bot with representative salon questions and review its output.
5. Create a test contact and appointment, verify the inbox flow, and exercise reminders.
6. Before a paying pilot, complete Meta WhatsApp onboarding and replace the mock channel with the verified provider implementation.