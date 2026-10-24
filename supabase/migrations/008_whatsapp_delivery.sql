-- WhatsApp provider status and error details. Apply after 007_bot_limits.sql.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS provider_error text;

CREATE INDEX IF NOT EXISTS idx_messages_wa_message_id
  ON public.messages(salon_id, wa_message_id)
  WHERE wa_message_id IS NOT NULL;

ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS components jsonb NOT NULL DEFAULT '[]'::jsonb;
