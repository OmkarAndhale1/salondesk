ALTER TABLE public.salons
  ADD COLUMN IF NOT EXISTS faq_text text;

ALTER TABLE public.salons
  ALTER COLUMN timezone SET DEFAULT 'Asia/Kolkata';