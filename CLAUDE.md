# CLAUDE.md

Project: SalonDesk. Read SPEC.md before any task.

## Working rules
- One feature per task. Do not build ahead of the current step in SPEC.md.
- Before coding, state a short plan. After coding, list the files changed and how to test.
- Ask before adding a new dependency.
- Keep functions small. No unused code, no placeholder TODOs left behind.

## Stack conventions
- TypeScript strict mode, no `any`
- Next.js App Router, server actions or route handlers for backend logic
- Supabase client: server-side with the service role only in route handlers; browser uses the anon key with RLS
- Validate all external input (webhooks, forms) with zod
- Environment variables in `.env.local`, listed in `.env.example`, never committed

## Security (do not skip)
- Every table has `salon_id` and an RLS policy. Add a test that one salon cannot read another's rows.
- Verify the WhatsApp webhook signature (X-Hub-Signature-256).
- Never log access tokens or full customer phone numbers.

## Git
- Small commits with clear messages after each working feature.
