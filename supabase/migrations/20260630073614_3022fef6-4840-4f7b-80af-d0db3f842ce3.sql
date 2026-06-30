
-- Genesis V4.1 — Attention Genome view (read-only, derived from real PPE candidate scores)
CREATE OR REPLACE VIEW public.gv41_attention_genome_v AS
WITH base AS (
  SELECT
    s.primary_emotion,
    s.story,
    s.niche,
    s.product_slug,
    s.composite,
    s.ctr_prediction,
    s.save_prediction,
    s.purchase_prediction,
    s.scroll_stop,
    s.product_visibility,
    s.novelty,
    s.us_relevance,
    s.competitor_verdict,
    s.winner,
    s.created_at
  FROM public.ppe_candidate_scores s
  WHERE s.created_at > now() - interval '14 days'
),
by_emotion AS (
  SELECT
    'emotion'::text AS dim,
    COALESCE(primary_emotion,'unknown') AS key,
    count(*)::int AS n,
    round(avg(composite))::int AS attention,
    round(avg(scroll_stop))::int AS scroll_stop,
    round(avg(save_prediction))::int AS save_p,
    round(avg(ctr_prediction))::int AS click_p,
    round(avg(purchase_prediction))::int AS purchase_p,
    sum((winner)::int)::int AS winners
  FROM base GROUP BY 2
),
by_world AS (
  SELECT
    'world'::text AS dim,
    COALESCE(niche,'unknown') AS key,
    count(*)::int AS n,
    round(avg(composite))::int AS attention,
    round(avg(scroll_stop))::int AS scroll_stop,
    round(avg(save_prediction))::int AS save_p,
    round(avg(ctr_prediction))::int AS click_p,
    round(avg(purchase_prediction))::int AS purchase_p,
    sum((winner)::int)::int AS winners
  FROM base GROUP BY 2
),
by_story AS (
  SELECT
    'story'::text AS dim,
    COALESCE(story,'unknown') AS key,
    count(*)::int AS n,
    round(avg(composite))::int AS attention,
    round(avg(scroll_stop))::int AS scroll_stop,
    round(avg(save_prediction))::int AS save_p,
    round(avg(ctr_prediction))::int AS click_p,
    round(avg(purchase_prediction))::int AS purchase_p,
    sum((winner)::int)::int AS winners
  FROM base GROUP BY 2
)
SELECT * FROM by_emotion WHERE n >= 3
UNION ALL SELECT * FROM by_world WHERE n >= 3
UNION ALL SELECT * FROM by_story WHERE n >= 3;

REVOKE ALL ON public.gv41_attention_genome_v FROM anon, authenticated;
GRANT SELECT ON public.gv41_attention_genome_v TO service_role;
