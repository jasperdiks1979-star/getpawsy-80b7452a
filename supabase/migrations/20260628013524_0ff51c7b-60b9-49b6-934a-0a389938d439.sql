
CREATE TABLE IF NOT EXISTS public.fos_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  kpis jsonb NOT NULL DEFAULT '{}'::jsonb,
  ceo_summary text,
  biggest_wins jsonb DEFAULT '[]'::jsonb,
  biggest_losses jsonb DEFAULT '[]'::jsonb,
  top_3_actions jsonb DEFAULT '[]'::jsonb,
  evidence jsonb DEFAULT '{}'::jsonb,
  markdown text,
  trigger text DEFAULT 'cron',
  UNIQUE(week_start)
);
GRANT SELECT ON public.fos_reviews TO authenticated;
GRANT ALL ON public.fos_reviews TO service_role;
ALTER TABLE public.fos_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read fos_reviews" ON public.fos_reviews
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service role manages fos_reviews" ON public.fos_reviews
  FOR ALL USING (auth.role() = 'service_role');
