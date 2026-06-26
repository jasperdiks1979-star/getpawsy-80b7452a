-- HNSW vector indexes for PCIE2 similarity search
CREATE INDEX IF NOT EXISTS pcie2_headline_embedding_hnsw ON public.pcie2_headline_library USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS pcie2_hook_embedding_hnsw ON public.pcie2_hook_library USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS pcie2_creatives_embedding_hnsw ON public.pcie2_creatives USING hnsw (embedding vector_cosine_ops);