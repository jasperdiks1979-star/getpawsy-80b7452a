
-- =============================================================================
-- Pinterest Wave Opportunity Engine — additive read-only view
-- Ranks Top-N products for the next wave, biased toward:
--   * never-promoted (untapped)
--   * high-margin
--   * category headroom (few pins there yet)
--   * board availability (compatible verified board exists)
--   * Pinterest potential score (visual/emotional/seasonal/US demand)
-- Formula mirrors the Phase 4 report:
--   wave_score = 0.30*margin_n + 0.25*untapped + 0.15*headroom_n
--              + 0.15*board_n + 0.15*potential_n
-- All inputs are already exposed by v_pinterest_product_potential.
-- =============================================================================

CREATE OR REPLACE VIEW public.v_pinterest_wave_opportunity AS
WITH src AS (
  SELECT * FROM public.v_pinterest_product_potential
),
bounds AS (
  SELECT
    GREATEST(MAX(margin), 1)                       AS max_margin,
    GREATEST(MAX(s_category_headroom), 1)          AS max_headroom,
    GREATEST(MAX(COALESCE(s_board_compat, 0)), 1)  AS max_board,
    GREATEST(MAX(pinterest_potential_score), 1)    AS max_potential
  FROM src
),
scored AS (
  SELECT
    s.*,
    -- normalized 0..1 components
    LEAST(1.0, s.margin::numeric / b.max_margin)                             AS n_margin,
    (CASE WHEN s.ever_published THEN 0.0 ELSE 1.0 END)                       AS n_untapped,
    LEAST(1.0, s.s_category_headroom::numeric / b.max_headroom)              AS n_headroom,
    LEAST(1.0, COALESCE(s.s_board_compat,0)::numeric / b.max_board)          AS n_board,
    LEAST(1.0, s.pinterest_potential_score::numeric / b.max_potential)       AS n_potential
  FROM src s CROSS JOIN bounds b
),
final AS (
  SELECT
    sc.*,
    ROUND(
      (0.30 * n_margin
       + 0.25 * n_untapped
       + 0.15 * n_headroom
       + 0.15 * n_board
       + 0.15 * n_potential) * 100
    , 1)::numeric AS wave_score
  FROM scored sc
)
SELECT
  product_id, product_slug, product_name, category,
  price, margin, image_url, image_count,
  ever_published, times_published,
  s_category_headroom, s_margin, s_price_band, s_visual_richness,
  s_lifestyle, s_emotional, s_seasonal, s_us_demand,
  s_uniqueness, s_board_compat,
  pinterest_potential_score, pinterest_class,
  ROUND(n_margin::numeric,    3) AS n_margin,
  ROUND(n_untapped::numeric,  3) AS n_untapped,
  ROUND(n_headroom::numeric,  3) AS n_headroom,
  ROUND(n_board::numeric,     3) AS n_board,
  ROUND(n_potential::numeric, 3) AS n_potential,
  wave_score,
  CASE
    WHEN NOT ever_published AND margin >= 40 AND pinterest_potential_score >= 55 THEN 'Wave 2 — Priority Untapped'
    WHEN NOT ever_published AND pinterest_potential_score >= 55                  THEN 'Wave 2 — Untapped'
    WHEN NOT ever_published                                                      THEN 'Wave 3 — Untapped'
    WHEN times_published <= 1 AND pinterest_potential_score >= 60               THEN 'Wave 3 — Boost'
    ELSE 'Backlog'
  END AS wave_bucket,
  ROW_NUMBER() OVER (
    ORDER BY
      (CASE WHEN ever_published THEN 1 ELSE 0 END) ASC,
      wave_score DESC,
      margin DESC
  ) AS wave_rank
FROM final;

ALTER VIEW public.v_pinterest_wave_opportunity SET (security_invoker = true);
GRANT SELECT ON public.v_pinterest_wave_opportunity TO authenticated;
