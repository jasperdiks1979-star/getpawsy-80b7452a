
-- 1. TABLE
CREATE TABLE public.genesis_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  subtitle text,
  description text,
  document_type text NOT NULL DEFAULT 'report',
  category text NOT NULL DEFAULT 'general',
  subcategory text,
  version text,
  status text NOT NULL DEFAULT 'active',
  generated_by text,
  generator_version text,
  sha256 text,
  storage_path text,
  storage_bucket text DEFAULT 'genesis-vault',
  public_path text,
  mime_type text,
  file_size bigint,
  page_count integer,
  language text DEFAULT 'en',
  country text,
  workspace text DEFAULT 'getpawsy',
  environment text DEFAULT 'production',
  tags text[] DEFAULT ARRAY[]::text[],
  search_vector tsvector,
  is_pinned boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  is_favorite boolean NOT NULL DEFAULT false,
  visibility text NOT NULL DEFAULT 'admin',
  download_count integer NOT NULL DEFAULT 0,
  view_count integer NOT NULL DEFAULT 0,
  last_opened timestamptz,
  last_verified timestamptz,
  integrity_verified boolean NOT NULL DEFAULT false,
  parent_document uuid REFERENCES public.genesis_documents(id) ON DELETE SET NULL,
  supersedes_document uuid REFERENCES public.genesis_documents(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. GRANTS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.genesis_documents TO authenticated;
GRANT ALL ON public.genesis_documents TO service_role;

-- 3. RLS
ALTER TABLE public.genesis_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vault_admin_read"  ON public.genesis_documents FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "vault_admin_write" ON public.genesis_documents FOR ALL    TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. Indexes
CREATE INDEX idx_gdocs_category  ON public.genesis_documents (category);
CREATE INDEX idx_gdocs_type      ON public.genesis_documents (document_type);
CREATE INDEX idx_gdocs_created   ON public.genesis_documents (created_at DESC);
CREATE INDEX idx_gdocs_pinned    ON public.genesis_documents (is_pinned) WHERE is_pinned = true;
CREATE INDEX idx_gdocs_tags      ON public.genesis_documents USING gin (tags);
CREATE INDEX idx_gdocs_search    ON public.genesis_documents USING gin (search_vector);
CREATE INDEX idx_gdocs_sha       ON public.genesis_documents (sha256);

-- 5. Search vector trigger
CREATE OR REPLACE FUNCTION public.gdocs_update_search_vector()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', coalesce(NEW.title,'')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.subtitle,'') || ' ' || coalesce(NEW.category,'') || ' ' || coalesce(NEW.subcategory,'')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.description,'') || ' ' || coalesce(array_to_string(NEW.tags,' '),'')), 'C') ||
    setweight(to_tsvector('simple', coalesce(NEW.sha256,'') || ' ' || coalesce(NEW.version,'') || ' ' || coalesce(NEW.public_path,'')), 'D');
  NEW.updated_at := now();
  RETURN NEW;
END;$$;

CREATE TRIGGER trg_gdocs_search
BEFORE INSERT OR UPDATE ON public.genesis_documents
FOR EACH ROW EXECUTE FUNCTION public.gdocs_update_search_vector();
