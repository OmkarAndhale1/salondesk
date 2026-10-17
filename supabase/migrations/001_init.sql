-- ============================================================
-- SalonDesk — Initial schema migration
-- Run in Supabase SQL Editor (or via Supabase CLI)
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- Helper functions in public schema (hosted Supabase does not
-- allow CREATE in the auth schema).
-- SECURITY DEFINER + SET search_path = '' prevents search_path
-- injection while still allowing calls to auth.uid().
-- ============================================================

/** Returns the salon_id of the currently logged-in user. */
CREATE OR REPLACE FUNCTION public.current_salon_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT salon_id FROM public.users WHERE id = auth.uid()
$$;

/** Returns true if the currently logged-in user is a super_admin. */
CREATE OR REPLACE FUNCTION public.is_super_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'super_admin'
  )
$$;

-- ============================================================
-- salons
-- ============================================================
CREATE TABLE public.salons (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   text        NOT NULL,
  phone_number_id        text,
  waba_id                text,
  access_token_encrypted text,                          -- never send to client
  timezone               text        NOT NULL DEFAULT 'UTC',
  working_hours          jsonb       NOT NULL DEFAULT '{}',
  google_review_link     text,
  bot_enabled            boolean     NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.salons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "salons_select"  ON public.salons FOR SELECT USING      (public.is_super_admin() OR id = public.current_salon_id());
CREATE POLICY "salons_insert"  ON public.salons FOR INSERT WITH CHECK  (public.is_super_admin());
CREATE POLICY "salons_update"  ON public.salons FOR UPDATE USING       (public.is_super_admin() OR id = public.current_salon_id());
CREATE POLICY "salons_delete"  ON public.salons FOR DELETE USING       (public.is_super_admin());

-- ============================================================
-- users  (mirrors auth.users via FK)
-- ============================================================
CREATE TABLE public.users (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  salon_id   uuid REFERENCES public.salons(id) ON DELETE SET NULL,
  role       text NOT NULL CHECK (role IN ('super_admin', 'owner', 'staff')),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_salon_id ON public.users(salon_id);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Users can see everyone in their own salon; super_admin sees all.
CREATE POLICY "users_select"  ON public.users FOR SELECT USING      (public.is_super_admin() OR salon_id = public.current_salon_id() OR id = auth.uid());
CREATE POLICY "users_insert"  ON public.users FOR INSERT WITH CHECK  (public.is_super_admin() OR salon_id = public.current_salon_id());
CREATE POLICY "users_update"  ON public.users FOR UPDATE USING       (public.is_super_admin() OR (salon_id = public.current_salon_id() AND id = auth.uid()));
CREATE POLICY "users_delete"  ON public.users FOR DELETE USING       (public.is_super_admin());

-- ============================================================
-- services
-- ============================================================
CREATE TABLE public.services (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id     uuid          NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  name         text          NOT NULL,
  price        numeric(10,2) NOT NULL,
  duration_min integer       NOT NULL CHECK (duration_min > 0),
  active       boolean       NOT NULL DEFAULT true,
  created_at   timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX idx_services_salon_id ON public.services(salon_id);

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "services_select"  ON public.services FOR SELECT USING      (public.is_super_admin() OR salon_id = public.current_salon_id());
CREATE POLICY "services_insert"  ON public.services FOR INSERT WITH CHECK  (public.is_super_admin() OR salon_id = public.current_salon_id());
CREATE POLICY "services_update"  ON public.services FOR UPDATE USING       (public.is_super_admin() OR salon_id = public.current_salon_id());
CREATE POLICY "services_delete"  ON public.services FOR DELETE USING       (public.is_super_admin() OR salon_id = public.current_salon_id());

-- ============================================================
-- contacts
-- ============================================================
CREATE TABLE public.contacts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id        uuid        NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  wa_id           text        NOT NULL,               -- WhatsApp phone number string
  name            text,
  last_inbound_at timestamptz,
  tags            text[]      NOT NULL DEFAULT '{}',
  opted_out       boolean     NOT NULL DEFAULT false, -- STOP opt-out
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (salon_id, wa_id)
);

CREATE INDEX idx_contacts_salon_id ON public.contacts(salon_id);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contacts_select"  ON public.contacts FOR SELECT USING      (public.is_super_admin() OR salon_id = public.current_salon_id());
CREATE POLICY "contacts_insert"  ON public.contacts FOR INSERT WITH CHECK  (public.is_super_admin() OR salon_id = public.current_salon_id());
CREATE POLICY "contacts_update"  ON public.contacts FOR UPDATE USING       (public.is_super_admin() OR salon_id = public.current_salon_id());
CREATE POLICY "contacts_delete"  ON public.contacts FOR DELETE USING       (public.is_super_admin() OR salon_id = public.current_salon_id());

-- ============================================================
-- conversations
-- ============================================================
CREATE TABLE public.conversations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id    uuid        NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  contact_id  uuid        NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  status      text        NOT NULL DEFAULT 'bot' CHECK (status IN ('bot', 'human', 'closed')),
  assigned_to uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversations_salon_id ON public.conversations(salon_id);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversations_select"  ON public.conversations FOR SELECT USING      (public.is_super_admin() OR salon_id = public.current_salon_id());
CREATE POLICY "conversations_insert"  ON public.conversations FOR INSERT WITH CHECK  (public.is_super_admin() OR salon_id = public.current_salon_id());
CREATE POLICY "conversations_update"  ON public.conversations FOR UPDATE USING       (public.is_super_admin() OR salon_id = public.current_salon_id());
CREATE POLICY "conversations_delete"  ON public.conversations FOR DELETE USING       (public.is_super_admin() OR salon_id = public.current_salon_id());

-- ============================================================
-- messages
-- ============================================================
CREATE TABLE public.messages (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id         uuid        NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  conversation_id  uuid        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  direction        text        NOT NULL CHECK (direction IN ('in', 'out')),
  sender           text        NOT NULL CHECK (sender IN ('customer', 'bot', 'staff')),
  type             text        NOT NULL DEFAULT 'text',
  body             text,
  wa_message_id    text,                              -- null for outbound until we get the ID back
  status           text        NOT NULL DEFAULT 'sent',
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- deduplication: wa_message_id must be unique within a salon
  UNIQUE (salon_id, wa_message_id)
);

CREATE INDEX idx_messages_salon_id        ON public.messages(salon_id);
CREATE INDEX idx_messages_conversation_id ON public.messages(conversation_id);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages_select"  ON public.messages FOR SELECT USING      (public.is_super_admin() OR salon_id = public.current_salon_id());
CREATE POLICY "messages_insert"  ON public.messages FOR INSERT WITH CHECK  (public.is_super_admin() OR salon_id = public.current_salon_id());
CREATE POLICY "messages_update"  ON public.messages FOR UPDATE USING       (public.is_super_admin() OR salon_id = public.current_salon_id());
CREATE POLICY "messages_delete"  ON public.messages FOR DELETE USING       (public.is_super_admin());

-- ============================================================
-- bookings
-- ============================================================
CREATE TABLE public.bookings (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id         uuid        NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  contact_id       uuid        NOT NULL REFERENCES public.contacts(id),
  service_id       uuid        NOT NULL REFERENCES public.services(id),
  starts_at        timestamptz NOT NULL,
  status           text        NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'done', 'no_show')),
  reminder_sent    boolean     NOT NULL DEFAULT false,
  review_requested boolean     NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bookings_salon_id  ON public.bookings(salon_id);
CREATE INDEX idx_bookings_starts_at ON public.bookings(starts_at);

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bookings_select"  ON public.bookings FOR SELECT USING      (public.is_super_admin() OR salon_id = public.current_salon_id());
CREATE POLICY "bookings_insert"  ON public.bookings FOR INSERT WITH CHECK  (public.is_super_admin() OR salon_id = public.current_salon_id());
CREATE POLICY "bookings_update"  ON public.bookings FOR UPDATE USING       (public.is_super_admin() OR salon_id = public.current_salon_id());
CREATE POLICY "bookings_delete"  ON public.bookings FOR DELETE USING       (public.is_super_admin() OR salon_id = public.current_salon_id());

-- ============================================================
-- templates
-- ============================================================
CREATE TABLE public.templates (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id   uuid        NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  category   text        NOT NULL,
  language   text        NOT NULL DEFAULT 'en',
  status     text        NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_templates_salon_id ON public.templates(salon_id);

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "templates_select"  ON public.templates FOR SELECT USING      (public.is_super_admin() OR salon_id = public.current_salon_id());
CREATE POLICY "templates_insert"  ON public.templates FOR INSERT WITH CHECK  (public.is_super_admin() OR salon_id = public.current_salon_id());
CREATE POLICY "templates_update"  ON public.templates FOR UPDATE USING       (public.is_super_admin() OR salon_id = public.current_salon_id());
CREATE POLICY "templates_delete"  ON public.templates FOR DELETE USING       (public.is_super_admin() OR salon_id = public.current_salon_id());
