INSERT INTO public.aos_engine_registry (engine_key, display_name, category, weight, trust_score, health, meta)
VALUES ('pie', 'Product Intelligence Engine', 'product', 1.0, 0.7, 'unknown',
        jsonb_build_object('publishes', jsonb_build_array('engine.run.started','engine.run.complete','engine.run.failed','opportunity.high'),
                           'knowledge_topics', jsonb_build_array('product.opportunities','pie.daily_briefing')))
ON CONFLICT (engine_key) DO UPDATE
SET display_name = EXCLUDED.display_name,
    category = EXCLUDED.category,
    meta = EXCLUDED.meta;