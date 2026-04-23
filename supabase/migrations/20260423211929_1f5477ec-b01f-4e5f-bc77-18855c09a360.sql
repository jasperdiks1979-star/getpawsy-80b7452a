-- Page changelog entries: admin-managed updates per policy/contact page
CREATE TABLE public.page_changelog_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  page_key TEXT NOT NULL,
  entry_date DATE NOT NULL,
  build_tag TEXT NOT NULL,
  commit_ref TEXT NOT NULL,
  changes TEXT[] NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT page_changelog_entries_page_key_check CHECK (
    page_key IN ('contact','about','shipping','returns','privacy','terms','cookies')
  )
);

CREATE INDEX idx_page_changelog_entries_page_key_date
  ON public.page_changelog_entries (page_key, entry_date DESC, sort_order DESC);

CREATE INDEX idx_page_changelog_entries_build_tag
  ON public.page_changelog_entries (build_tag);

ALTER TABLE public.page_changelog_entries ENABLE ROW LEVEL SECURITY;

-- Public visitors and Googlebot can read all PUBLISHED entries (rendered inline on policy pages).
CREATE POLICY "Anyone can view published changelog entries"
ON public.page_changelog_entries
FOR SELECT
USING (is_published = true);

-- Admins can read everything (including drafts) for the management screen.
CREATE POLICY "Admins can view all changelog entries"
ON public.page_changelog_entries
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admins can create / update / delete entries.
CREATE POLICY "Admins can insert changelog entries"
ON public.page_changelog_entries
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update changelog entries"
ON public.page_changelog_entries
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete changelog entries"
ON public.page_changelog_entries
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Auto-update updated_at
CREATE TRIGGER update_page_changelog_entries_updated_at
BEFORE UPDATE ON public.page_changelog_entries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Seed with the existing static entries from src/lib/page-changelogs.ts so
-- nothing disappears from the policy pages after the cutover.
INSERT INTO public.page_changelog_entries (page_key, entry_date, build_tag, commit_ref, changes, sort_order)
VALUES
  ('contact', '2026-04-23', 'v2026.04.23 — US identity rollout', 'bcf6c8d',
   ARRAY[
     'Removed all EU/NL address lines; sole business address is now New York, NY · United States.',
     'Updated support email to support@getpawsy.pet across all contact surfaces.',
     'Hardened Organization JSON-LD to a single US PostalAddress (addressCountry: US).'
   ], 0),
  ('about', '2026-04-23', 'v2026.04.23 — US identity rollout', 'bcf6c8d',
   ARRAY[
     'Rewrote brand identity copy as "GetPawsy LLC, a US-based pet supply company in New York, NY".',
     'Removed legacy Dutch entity references and EU shipping language.',
     'Aligned shipping/returns mentions with US policy (free shipping $35+, 30-day returns).'
   ], 0),
  ('shipping', '2026-04-23', 'v2026.04.23 — US identity rollout', 'bcf6c8d',
   ARRAY[
     'Standardized US transit time to 5–10 business days and processing to 1–2 business days.',
     'Free shipping threshold confirmed at $35; flat rate $5.99 below threshold.',
     'Added "Orders ship directly to customers across the United States" fulfillment note (matches g:shipping feed).'
   ], 0),
  ('returns', '2026-04-23', 'v2026.04.23 — US identity rollout', 'bcf6c8d',
   ARRAY[
     'Confirmed 30-day return window and aligned with MerchantReturnPolicy schema in the product feed.',
     'Returns intake routed exclusively to support@getpawsy.pet (US support).'
   ], 0),
  ('privacy', '2026-04-23', 'v2026.04.23 — US identity rollout', 'bcf6c8d',
   ARRAY[
     'Removed EU/GDPR-specific data controller address; controller is now GetPawsy LLC, New York, NY.',
     'Updated all data subject contact references to support@getpawsy.pet.'
   ], 0),
  ('terms', '2026-04-23', 'v2026.04.23 — US identity rollout', 'bcf6c8d',
   ARRAY[
     'Governing entity updated to GetPawsy LLC (United States).',
     'Shipping & returns clauses re-anchored to US policy (5–10 business days, 30-day returns, $35 free-shipping threshold).'
   ], 0),
  ('cookies', '2026-04-23', 'v2026.04.23 — US identity rollout', 'bcf6c8d',
   ARRAY[
     'Cookie controller updated to GetPawsy LLC (US).',
     'Removed EU-cookie-banner language that referenced an NL legal entity.'
   ], 0);