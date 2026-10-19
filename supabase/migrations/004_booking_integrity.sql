CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS ends_at timestamptz;

UPDATE public.bookings AS booking
SET ends_at = booking.starts_at + make_interval(mins => service.duration_min)
FROM public.services AS service
WHERE booking.service_id = service.id
  AND booking.ends_at IS NULL;

ALTER TABLE public.bookings ALTER COLUMN ends_at SET NOT NULL;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_valid_interval
  CHECK (ends_at > starts_at);

CREATE UNIQUE INDEX IF NOT EXISTS contacts_id_salon_id_unique ON public.contacts(id, salon_id);
CREATE UNIQUE INDEX IF NOT EXISTS services_id_salon_id_unique ON public.services(id, salon_id);

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_contact_id_fkey;
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_service_id_fkey;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_contact_same_salon_fk
  FOREIGN KEY (contact_id, salon_id) REFERENCES public.contacts(id, salon_id);
ALTER TABLE public.bookings ADD CONSTRAINT bookings_service_same_salon_fk
  FOREIGN KEY (service_id, salon_id) REFERENCES public.services(id, salon_id);

ALTER TABLE public.bookings ADD CONSTRAINT bookings_no_confirmed_overlap
  EXCLUDE USING gist (
    salon_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status = 'confirmed');