UPDATE public.pinterest_runtime_settings
SET pin_type_target_ratio = jsonb_build_object(
      'lifestyle',         0.30,
      'educational',       0.20,
      'problem_solution',  0.20,
      'seasonal',          0.15,
      'entertainment',     0.10,
      'product_showcase',  0.05
    ),
    optimization_target = 'saves',
    lifestyle_min = 30,
    max_category_share_pct = 18,
    per_category_daily_cap = 22,
    updated_at = now()
WHERE id = 1;

UPDATE public.pcie_v2_config
SET value = '{"save_rate":0.35,"outbound_ctr":0.20,"follow_rate":0.10,"atc_rate":0.10,"checkout_rate":0.08,"purchase_rate":0.07,"ctr":0.05,"revenue":0.03,"roas":0.02}'::jsonb
WHERE key = 'revenue_signal_weights';

UPDATE public.pcie_v2_config SET value = '88'::jsonb WHERE key = 'ppe_ctr_floor';
UPDATE public.pcie_v2_config SET value = '90'::jsonb WHERE key = 'ppe_composite_floor';