
-- Genesis V3.6 — Persona Attribution & Closed-Loop Learning

-- 1. Extend pcie2_creatives
ALTER TABLE public.pcie2_creatives
  ADD COLUMN IF NOT EXISTS emotion_id          text,
  ADD COLUMN IF NOT EXISTS style_id            text,
  ADD COLUMN IF NOT EXISTS palette_id          text,
  ADD COLUMN IF NOT EXISTS room_id             text,
  ADD COLUMN IF NOT EXISTS camera_id           text,
  ADD COLUMN IF NOT EXISTS generation_model    text,
  ADD COLUMN IF NOT EXISTS generation_version  text,
  ADD COLUMN IF NOT EXISTS campaign_id         text;

UPDATE public.pcie2_creatives SET
  emotion_id = COALESCE(emotion_id, primary_emotion),
  style_id   = COALESCE(style_id, visual_style),
  room_id    = COALESCE(room_id, background),
  camera_id  = COALESCE(camera_id, camera_angle),
  generation_model   = COALESCE(generation_model, model_version),
  generation_version = COALESCE(generation_version, prompt_version)
WHERE emotion_id IS NULL OR style_id IS NULL OR room_id IS NULL
   OR camera_id IS NULL OR generation_model IS NULL OR generation_version IS NULL;

-- 2. Attribution links
CREATE TABLE IF NOT EXISTS public.gv36_attribution_links (
  pin_id            text PRIMARY KEY,
  creative_id       uuid REFERENCES public.pcie2_creatives(id) ON DELETE SET NULL,
  persona_id        uuid REFERENCES public.gv35_audience_personas(id) ON DELETE SET NULL,
  product_id        uuid,
  emotion_id        text,
  hook_id           uuid,
  style_id          text,
  board_id          text,
  campaign_id       text,
  destination_url   text,
  published_at      timestamptz NOT NULL DEFAULT now(),
  last_metric_sync  timestamptz,
  meta              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gv36_attribution_links TO authenticated;
GRANT ALL    ON public.gv36_attribution_links TO service_role;
ALTER TABLE public.gv36_attribution_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gv36_links_admin_read" ON public.gv36_attribution_links
  FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "gv36_links_service_all" ON public.gv36_attribution_links
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS gv36_links_creative_idx ON public.gv36_attribution_links (creative_id);
CREATE INDEX IF NOT EXISTS gv36_links_persona_idx  ON public.gv36_attribution_links (persona_id);
CREATE INDEX IF NOT EXISTS gv36_links_product_idx  ON public.gv36_attribution_links (product_id);
CREATE INDEX IF NOT EXISTS gv36_links_published_idx ON public.gv36_attribution_links (published_at DESC);
CREATE TRIGGER gv36_links_touch BEFORE UPDATE ON public.gv36_attribution_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Combo performance
CREATE TABLE IF NOT EXISTS public.gv36_combo_performance (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id         uuid,
  emotion_id         text,
  hook_id            uuid,
  style_id           text,
  board_id           text,
  product_id         uuid,
  impressions        bigint NOT NULL DEFAULT 0,
  saves              bigint NOT NULL DEFAULT 0,
  clicks             bigint NOT NULL DEFAULT 0,
  ctr                numeric NOT NULL DEFAULT 0,
  atc                bigint NOT NULL DEFAULT 0,
  checkouts          bigint NOT NULL DEFAULT 0,
  purchases          bigint NOT NULL DEFAULT 0,
  revenue_cents      bigint NOT NULL DEFAULT 0,
  aov_cents          bigint NOT NULL DEFAULT 0,
  confidence_wilson  numeric NOT NULL DEFAULT 0,
  sample_n           bigint NOT NULL DEFAULT 0,
  trend_7d           numeric NOT NULL DEFAULT 0,
  momentum_28d       numeric NOT NULL DEFAULT 0,
  status             text NOT NULL DEFAULT 'stable'
    CHECK (status IN ('winning','growing','stable','declining','needs_refresh','retire')),
  evidence_sources   jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_evaluated_at  timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS gv36_combo_perf_combo_uidx
  ON public.gv36_combo_performance (
    COALESCE(persona_id::text,''), COALESCE(emotion_id,''),
    COALESCE(hook_id::text,''),    COALESCE(style_id,''),
    COALESCE(board_id,''),         COALESCE(product_id::text,'')
  );
CREATE INDEX IF NOT EXISTS gv36_combo_perf_status_idx ON public.gv36_combo_performance (status, confidence_wilson DESC);
CREATE INDEX IF NOT EXISTS gv36_combo_perf_revenue_idx ON public.gv36_combo_performance (revenue_cents DESC);
GRANT SELECT ON public.gv36_combo_performance TO authenticated;
GRANT ALL    ON public.gv36_combo_performance TO service_role;
ALTER TABLE public.gv36_combo_performance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gv36_combo_admin_read" ON public.gv36_combo_performance
  FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "gv36_combo_service_all" ON public.gv36_combo_performance
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER gv36_combo_touch BEFORE UPDATE ON public.gv36_combo_performance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. First-sale memory (append-only)
CREATE TABLE IF NOT EXISTS public.gv36_first_sale_memory (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id           uuid,
  product_id         uuid,
  category           text,
  persona_id         uuid,
  creative_id        uuid,
  emotion_id         text,
  hook_id            uuid,
  style_id           text,
  board_id           text,
  campaign_id        text,
  pin_id             text,
  publish_time       timestamptz,
  traffic_path       jsonb NOT NULL DEFAULT '[]'::jsonb,
  revenue_cents      bigint NOT NULL DEFAULT 0,
  meta               jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS gv36_fsm_order_uidx
  ON public.gv36_first_sale_memory (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS gv36_fsm_persona_idx  ON public.gv36_first_sale_memory (persona_id);
CREATE INDEX IF NOT EXISTS gv36_fsm_product_idx  ON public.gv36_first_sale_memory (product_id);
CREATE INDEX IF NOT EXISTS gv36_fsm_recorded_idx ON public.gv36_first_sale_memory (recorded_at DESC);
GRANT SELECT ON public.gv36_first_sale_memory TO authenticated;
GRANT ALL    ON public.gv36_first_sale_memory TO service_role;
ALTER TABLE public.gv36_first_sale_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gv36_fsm_admin_read" ON public.gv36_first_sale_memory
  FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "gv36_fsm_service_all" ON public.gv36_first_sale_memory
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.gv36_fsm_block_mutations()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'gv36_first_sale_memory is append-only';
END;
$$;
CREATE TRIGGER gv36_fsm_no_update BEFORE UPDATE ON public.gv36_first_sale_memory
  FOR EACH ROW
  WHEN (current_setting('role', true) IS DISTINCT FROM 'service_role')
  EXECUTE FUNCTION public.gv36_fsm_block_mutations();
CREATE TRIGGER gv36_fsm_no_delete BEFORE DELETE ON public.gv36_first_sale_memory
  FOR EACH ROW
  WHEN (current_setting('role', true) IS DISTINCT FROM 'service_role')
  EXECUTE FUNCTION public.gv36_fsm_block_mutations();

-- 5. Views (use correct enum labels: CANONICAL_ADD_TO_CART, CANONICAL_CHECKOUT, CANONICAL_PURCHASE)
CREATE OR REPLACE VIEW public.gv36_persona_performance_v
WITH (security_invoker = true) AS
WITH pin_metrics AS (
  SELECT l.persona_id,
    SUM(COALESCE(pp.impressions,0))::bigint AS impressions,
    SUM(COALESCE(pp.saves,0))::bigint       AS saves,
    SUM(COALESCE(pp.clicks,0))::bigint      AS clicks
  FROM public.gv36_attribution_links l
  LEFT JOIN public.pinterest_pin_performance pp ON pp.pin_id = l.pin_id
  GROUP BY l.persona_id
),
canonical_metrics AS (
  SELECT p.id AS persona_id,
    COUNT(*) FILTER (WHERE ce.canonical_name = 'CANONICAL_ADD_TO_CART')::bigint    AS atc,
    COUNT(*) FILTER (WHERE ce.canonical_name = 'CANONICAL_CHECKOUT')::bigint       AS checkouts,
    COUNT(*) FILTER (WHERE ce.canonical_name = 'CANONICAL_PURCHASE')::bigint       AS purchases,
    COALESCE(SUM(ce.value_cents) FILTER (WHERE ce.canonical_name = 'CANONICAL_PURCHASE'),0)::bigint AS revenue_cents
  FROM public.gv35_audience_personas p
  LEFT JOIN public.canonical_events ce
    ON ce.utm_content = ('persona_' || p.id::text)
   AND ce.occurred_at > now() - interval '90 days'
  GROUP BY p.id
)
SELECT
  p.id AS persona_id, p.name AS persona_name,
  COALESCE(pm.impressions,0) AS impressions,
  COALESCE(pm.saves,0)       AS saves,
  COALESCE(pm.clicks,0)      AS clicks,
  CASE WHEN COALESCE(pm.impressions,0) > 0
       THEN ROUND((pm.clicks::numeric / pm.impressions) * 100, 3) ELSE 0 END AS ctr_pct,
  CASE WHEN COALESCE(pm.impressions,0) > 0
       THEN ROUND((pm.saves::numeric / pm.impressions) * 100, 3) ELSE 0 END AS save_rate_pct,
  COALESCE(cm.atc,0) AS atc, COALESCE(cm.checkouts,0) AS checkouts,
  COALESCE(cm.purchases,0) AS purchases, COALESCE(cm.revenue_cents,0) AS revenue_cents,
  CASE WHEN COALESCE(cm.purchases,0) > 0
       THEN ROUND(cm.revenue_cents::numeric / cm.purchases, 0) ELSE 0 END AS aov_cents,
  p.confidence, p.evidence_count
FROM public.gv35_audience_personas p
LEFT JOIN pin_metrics pm       ON pm.persona_id = p.id
LEFT JOIN canonical_metrics cm ON cm.persona_id = p.id;
GRANT SELECT ON public.gv36_persona_performance_v TO authenticated;

CREATE OR REPLACE VIEW public.gv36_creative_performance_v
WITH (security_invoker = true) AS
WITH pin_metrics AS (
  SELECT l.creative_id,
    SUM(COALESCE(pp.impressions,0))::bigint AS impressions,
    SUM(COALESCE(pp.saves,0))::bigint       AS saves,
    SUM(COALESCE(pp.clicks,0))::bigint      AS clicks,
    AVG(COALESCE(pp.performance_score,0))   AS perf_score
  FROM public.gv36_attribution_links l
  LEFT JOIN public.pinterest_pin_performance pp ON pp.pin_id = l.pin_id
  GROUP BY l.creative_id
),
purchase_metrics AS (
  SELECT creative_id, COUNT(*)::bigint AS purchases,
         COALESCE(SUM(revenue_cents),0) AS revenue_cents
  FROM public.gv36_first_sale_memory
  WHERE creative_id IS NOT NULL GROUP BY creative_id
)
SELECT
  c.id AS creative_id, c.product_id, c.persona_id, c.emotion_id, c.style_id,
  c.headline, c.cta, c.board_id,
  COALESCE(pm.impressions,0) AS impressions,
  COALESCE(pm.saves,0)       AS saves,
  COALESCE(pm.clicks,0)      AS clicks,
  CASE WHEN COALESCE(pm.impressions,0) > 0
       THEN ROUND((pm.clicks::numeric / pm.impressions) * 100, 3) ELSE 0 END AS ctr_pct,
  COALESCE(pm.perf_score,0)  AS perf_score,
  COALESCE(qm.purchases,0)   AS purchases,
  COALESCE(qm.revenue_cents,0) AS revenue_cents,
  c.quality_score, c.ai_confidence,
  CASE
    WHEN COALESCE(qm.purchases,0) >= 3 AND COALESCE(pm.impressions,0) >= 500 THEN 'winning'
    WHEN COALESCE(pm.clicks,0) >= 50 AND COALESCE(pm.impressions,0) >= 200 THEN 'growing'
    WHEN COALESCE(pm.impressions,0) >= 200 AND COALESCE(pm.clicks,0) < 5    THEN 'declining'
    WHEN COALESCE(pm.impressions,0) >= 1000 AND COALESCE(qm.purchases,0) = 0 THEN 'needs_refresh'
    WHEN c.retired                                                          THEN 'retire'
    ELSE 'stable'
  END AS status,
  c.created_at
FROM public.pcie2_creatives c
LEFT JOIN pin_metrics pm   ON pm.creative_id = c.id
LEFT JOIN purchase_metrics qm ON qm.creative_id = c.id;
GRANT SELECT ON public.gv36_creative_performance_v TO authenticated;
