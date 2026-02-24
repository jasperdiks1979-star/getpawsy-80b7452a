
-- Add unique constraint on seo_clusters.label for upsert support
ALTER TABLE public.seo_clusters ADD CONSTRAINT seo_clusters_label_key UNIQUE (label);
