# SalonDesk: WhatsApp AI Receptionist for Salons

Multi-tenant SaaS. Each salon connects its own WhatsApp Business number. An AI bot answers enquiries, books appointments, sends reminders and asks for Google reviews. Staff can read and reply to every chat from a web dashboard and take over from the bot at any time.

## Stack
- Next.js (App Router) + TypeScript + Tailwind
- Supabase: Postgres, Auth, Realtime, Row Level Security
- WhatsApp Cloud API (official, direct from Meta)
- Claude API for bot replies (tool use for booking)
- Deploy on Vercel

## Roles
- **super_admin** (Om): onboards salons, sees all tenants
- **owner**: manages one salon, staff, services, reports
- **staff**: inbox and bookings only

## Data model (every table has `salon_id`, protected by RLS)
- `salons`: id, name, phone_number_id, waba_id, access_token (encrypted), timezone, working_hours (json), google_review_link, bot_enabled
- `users`: id, salon_id, role, name
- `services`: id, salon_id, name, price, duration_min, active
- `contacts`: id, salon_id, wa_id, name, last_inbound_at, tags[]
- `conversations`: id, salon_id, contact_id, status (bot | human | closed), assigned_to
- `messages`: id, salon_id, conversation_id, direction (in | out), sender (customer | bot | staff), type, body, wa_message_id, status, created_at
- `bookings`: id, salon_id, contact_id, service_id, starts_at, status (confirmed | cancelled | done | no_show), reminder_sent, review_requested
- `templates`: id, salon_id, name, category, language, status

## Features (build in this order, one per prompt)
1. **Webhook**: verify endpoint, receive inbound messages and status updates, store them, dedupe by `wa_message_id`
2. **Send API**: send text within the 24h window; template messages outside it
3. **Inbox UI**: conversation list, live chat view (realtime), reply box, assign, tags, "Take over / Hand back to bot" toggle
4. **Bot**: Claude replies using the salon's services, prices, hours. Tools: `list_services`, `check_availability`, `create_booking`, `cancel_booking`, `handoff_to_human`. If unsure, hand off.
5. **Booking**: slot generation from working hours and existing bookings, no double booking, confirmation message
6. **Reminders**: cron job sends a reminder template 24h and 2h before the appointment
7. **Reviews**: after the booking is marked done, send a review request template with the Google link
8. **Admin**: onboarding flow for a new salon in under 30 minutes (connect number, add services, set hours, test message)
9. **Reports**: monthly page with leads, bookings, no-shows and reviews requested

## Rules
- Free-form replies only within 24h of the customer's last message; otherwise use approved templates
- Never reply from the bot when `conversation.status = human`
- Salon access tokens are encrypted and never sent to the client
- All queries scoped by `salon_id` through RLS; test cross-tenant access explicitly
- Validate the Meta webhook signature on every request
- Respect opt-out: if a customer sends STOP, no more templates

## Out of scope for the MVP
Payments, multiple branches, Instagram or other channels, mobile app, voice
