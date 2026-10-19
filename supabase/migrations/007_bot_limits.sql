CREATE TABLE IF NOT EXISTS public.bot_reply_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  requested_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bot_reply_usage_contact_time_idx
  ON public.bot_reply_usage (salon_id, contact_id, requested_at DESC);

ALTER TABLE public.bot_reply_usage ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.claim_bot_reply(p_salon_id uuid, p_contact_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  recent_count integer;
BEGIN
  PERFORM 1
  FROM public.contacts
  WHERE id = p_contact_id AND salon_id = p_salon_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN false; END IF;

  SELECT count(*) INTO recent_count
  FROM public.bot_reply_usage
  WHERE salon_id = p_salon_id
    AND contact_id = p_contact_id
    AND requested_at >= now() - interval '1 hour';

  IF recent_count >= 20 THEN RETURN false; END IF;

  INSERT INTO public.bot_reply_usage (salon_id, contact_id) VALUES (p_salon_id, p_contact_id);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_bot_reply(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_bot_reply(uuid, uuid) TO service_role;