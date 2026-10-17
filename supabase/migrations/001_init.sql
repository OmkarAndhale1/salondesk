-- ============================================================
-- SalonDesk — Initial schema migration (security-hardened)
-- Run once in Supabase SQL Editor
-- ============================================================

-- Disable body validation so sql helper functions can reference
-- public.users before it is created in this same script.
SET check_function_bodies = false;

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- Trigger functions first (plpgsql bodies are NOT validated at
-- creation time, so no dependency on tables).
-- ============================================================

-- Stamp updated_at on every UPDATE.
CREATE OR REPLACE FUNCTION public.set_updated_at()
  RETURNS trigger LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Enforce that messages.salon_id matches its conversation's salon_id.
CREATE OR REPLACE FUNCTION public.check_message_salon()
  RETURNS trigger LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.conversations
    WHERE id = NEW.conversation_id AND salon_id = NEW.salon_id
  ) THEN
    RAISE EXCEPTION
      'messages.salon_id does not match conversations.salon_id for conversation_id %',
      NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================
-- salons (no access_token_encrypted — lives in salon_secrets)
-- ============================================================
CREATE TABLE public.salons (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text        NOT NULL,
  phone_number_id    text,
  waba_id            text,
  timezone           text        NOT NULL DEFAULT 'UTC',
  working_hours      jsonb       NOT NULL DEFAULT '{}',
  google_review_link text,
  bot_enabled        boolean     NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- users  (mirrors auth.users via FK)
-- Created BEFORE the sql helper functions so the functions can
-- reference public.users without a "relation does not exist" error.
-- ============================================================
CREATE TABLE public.users (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  salon_id   uuid REFERENCES public.salons(id) ON DELETE SET NULL,
  role       text NOT NULL CHECK (role IN ('super_admin', 'owner', 'staff')),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_salon_id ON public.users(salon_id);

-- ============================================================
-- Helper functions (LANGUAGE sql — bodies are validated at
-- creation time, so public.users must already exist above).
-- All SECURITY DEFINER SET search_path = '' to prevent injection.
-- ============================================================

/** salon_id of the currently authenticated user. */
CREATE OR REPLACE FUNCTION public.current_salon_id()
  RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT salon_id FROM public.users WHERE id = auth.uid()
$$;

/** true when the current user has role = 'super_admin'. */
CREATE OR REPLACE FUNCTION public.is_super_admin()
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'super_admin'
  )
$$;

/** Role text of the currently authenticated user. */
CREATE OR REPLACE FUNCTION public.my_role()
  RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT role FROM public.users WHERE id = auth.uid()
$$;

-- ============================================================
-- RLS — salons
-- ============================================================
ALTER TABLE public.salons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "salons_select" ON public.salons
  FOR SELECT USING (
    public.is_super_admin() OR id = public.current_salon_id()
  );

CREATE POLICY "salons_insert" ON public.salons
  FOR INSERT WITH CHECK (public.is_super_admin());

-- Only owner or super_admin may update their salon record.
CREATE POLICY "salons_update" ON public.salons
  FOR UPDATE USING (
    public.is_super_admin()
    OR (id = public.current_salon_id() AND public.my_role() = 'owner')
  );

CREATE POLICY "salons_delete" ON public.salons
  FOR DELETE USING (public.is_super_admin());

-- ============================================================
-- RLS — users
-- ============================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- All salon members can see each other; super_admin sees everyone.
CREATE POLICY "users_select" ON public.users
  FOR SELECT USING (
    public.is_super_admin()
    OR salon_id = public.current_salon_id()
    OR id = auth.uid()
  );

-- Only super_admin or owner may add users.
-- Nobody except super_admin may create a super_admin row.
CREATE POLICY "users_insert" ON public.users
  FOR INSERT WITH CHECK (
    public.is_super_admin()
    OR (
      salon_id = public.current_salon_id()
      AND public.my_role() = 'owner'
      AND role != 'super_admin'
    )
  );

-- Privilege-escalation fix:
-- USING  → owners cannot target super_admin rows or other salons.
-- WITH CHECK → new row cannot set role='super_admin' (unless updater is super_admin)
--              and cannot move the user to a different salon.
CREATE POLICY "users_update" ON public.users
  FOR UPDATE
  USING (
    public.is_super_admin()
    OR (
      salon_id = public.current_salon_id()
      AND public.my_role() = 'owner'
      AND role != 'super_admin'
    )
  )
  WITH CHECK (
    (role != 'super_admin' OR public.is_super_admin())
    AND (salon_id = public.current_salon_id() OR public.is_super_admin())
  );

CREATE POLICY "users_delete" ON public.users
  FOR DELETE USING (public.is_super_admin());

-- ============================================================
-- salon_secrets — WhatsApp access token isolation.
-- RLS ON + ZERO policies = only the service-role key can access.
-- The anon / authenticated keys get nothing.
-- ============================================================
CREATE TABLE public.salon_secrets (
  salon_id               uuid PRIMARY KEY
                             REFERENCES public.salons(id) ON DELETE CASCADE,
  access_token_encrypted text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.salon_secrets ENABLE ROW LEVEL SECURITY;
-- Intentionally zero policies.

-- ============================================================
-- services (staff may read; only owner/super_admin may write)
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

CREATE POLICY "services_select" ON public.services
  FOR SELECT USING (
    public.is_super_admin() OR salon_id = public.current_salon_id()
  );

CREATE POLICY "services_insert" ON public.services
  FOR INSERT WITH CHECK (
    public.is_super_admin()
    OR (salon_id = public.current_salon_id() AND public.my_role() = 'owner')
  );

CREATE POLICY "services_update" ON public.services
  FOR UPDATE USING (
    public.is_super_admin()
    OR (salon_id = public.current_salon_id() AND public.my_role() = 'owner')
  );

CREATE POLICY "services_delete" ON public.services
  FOR DELETE USING (
    public.is_super_admin()
    OR (salon_id = public.current_salon_id() AND public.my_role() = 'owner')
  );

-- ============================================================
-- contacts (all salon users may read/insert/update;
--           only owner/super_admin may delete)
-- ============================================================
CREATE TABLE public.contacts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id        uuid        NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  wa_id           text        NOT NULL,
  name            text,
  last_inbound_at timestamptz,
  tags            text[]      NOT NULL DEFAULT '{}',
  opted_out       boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (salon_id, wa_id)
);

CREATE INDEX idx_contacts_salon_id ON public.contacts(salon_id);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contacts_select" ON public.contacts
  FOR SELECT USING (
    public.is_super_admin() OR salon_id = public.current_salon_id()
  );

CREATE POLICY "contacts_insert" ON public.contacts
  FOR INSERT WITH CHECK (
    public.is_super_admin() OR salon_id = public.current_salon_id()
  );

CREATE POLICY "contacts_update" ON public.contacts
  FOR UPDATE USING (
    public.is_super_admin() OR salon_id = public.current_salon_id()
  );

CREATE POLICY "contacts_delete" ON public.contacts
  FOR DELETE USING (
    public.is_super_admin()
    OR (salon_id = public.current_salon_id() AND public.my_role() = 'owner')
  );

-- ============================================================
-- conversations (all salon users may read/write)
-- ============================================================
CREATE TABLE public.conversations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id    uuid        NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  contact_id  uuid        NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  status      text        NOT NULL DEFAULT 'bot'
                CHECK (status IN ('bot', 'human', 'closed')),
  assigned_to uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversations_salon_id ON public.conversations(salon_id);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversations_select" ON public.conversations
  FOR SELECT USING (
    public.is_super_admin() OR salon_id = public.current_salon_id()
  );

CREATE POLICY "conversations_insert" ON public.conversations
  FOR INSERT WITH CHECK (
    public.is_super_admin() OR salon_id = public.current_salon_id()
  );

CREATE POLICY "conversations_update" ON public.conversations
  FOR UPDATE USING (
    public.is_super_admin() OR salon_id = public.current_salon_id()
  );

CREATE POLICY "conversations_delete" ON public.conversations
  FOR DELETE USING (
    public.is_super_admin()
    OR (salon_id = public.current_salon_id() AND public.my_role() = 'owner')
  );

-- Auto-stamp updated_at on every conversation update.
CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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
  wa_message_id    text,
  status           text        NOT NULL DEFAULT 'sent',
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (salon_id, wa_message_id)
);

CREATE INDEX idx_messages_salon_id        ON public.messages(salon_id);
CREATE INDEX idx_messages_conversation_id ON public.messages(conversation_id);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages_select" ON public.messages
  FOR SELECT USING (
    public.is_super_admin() OR salon_id = public.current_salon_id()
  );

CREATE POLICY "messages_insert" ON public.messages
  FOR INSERT WITH CHECK (
    public.is_super_admin() OR salon_id = public.current_salon_id()
  );

CREATE POLICY "messages_update" ON public.messages
  FOR UPDATE USING (
    public.is_super_admin() OR salon_id = public.current_salon_id()
  );

-- Only super_admin may delete messages (preserve audit trail).
CREATE POLICY "messages_delete" ON public.messages
  FOR DELETE USING (public.is_super_admin());

-- Cross-tenant integrity: message.salon_id must match its conversation's salon_id.
CREATE TRIGGER messages_salon_check
  BEFORE INSERT OR UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.check_message_salon();

-- ============================================================
-- bookings (all salon users may read/write; only owner+ deletes)
-- ============================================================
CREATE TABLE public.bookings (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id         uuid        NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  contact_id       uuid        NOT NULL REFERENCES public.contacts(id),
  service_id       uuid        NOT NULL REFERENCES public.services(id),
  starts_at        timestamptz NOT NULL,
  status           text        NOT NULL DEFAULT 'confirmed'
                CHECK (status IN ('confirmed', 'cancelled', 'done', 'no_show')),
  reminder_sent    boolean     NOT NULL DEFAULT false,
  review_requested boolean     NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bookings_salon_id  ON public.bookings(salon_id);
CREATE INDEX idx_bookings_starts_at ON public.bookings(starts_at);

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bookings_select" ON public.bookings
  FOR SELECT USING (
    public.is_super_admin() OR salon_id = public.current_salon_id()
  );

CREATE POLICY "bookings_insert" ON public.bookings
  FOR INSERT WITH CHECK (
    public.is_super_admin() OR salon_id = public.current_salon_id()
  );

CREATE POLICY "bookings_update" ON public.bookings
  FOR UPDATE USING (
    public.is_super_admin() OR salon_id = public.current_salon_id()
  );

CREATE POLICY "bookings_delete" ON public.bookings
  FOR DELETE USING (
    public.is_super_admin()
    OR (salon_id = public.current_salon_id() AND public.my_role() = 'owner')
  );

-- ============================================================
-- templates (staff may read; only owner/super_admin may write)
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

CREATE POLICY "templates_select" ON public.templates
  FOR SELECT USING (
    public.is_super_admin() OR salon_id = public.current_salon_id()
  );

CREATE POLICY "templates_insert" ON public.templates
  FOR INSERT WITH CHECK (
    public.is_super_admin()
    OR (salon_id = public.current_salon_id() AND public.my_role() = 'owner')
  );

CREATE POLICY "templates_update" ON public.templates
  FOR UPDATE USING (
    public.is_super_admin()
    OR (salon_id = public.current_salon_id() AND public.my_role() = 'owner')
  );

CREATE POLICY "templates_delete" ON public.templates
  FOR DELETE USING (
    public.is_super_admin()
    OR (salon_id = public.current_salon_id() AND public.my_role() = 'owner')
  );
