UPDATE public.governance_decision_log
SET proposal = proposal
  || jsonb_build_object(
       'measurement_window_days', 14,
       'baseline_value', 0,
       'gross_margin', 0.30,
       'cycle', 1
     )
WHERE id = '5c75bf04-fe88-4700-ba26-f2e10cd4ffa3';

UPDATE public.governance_decision_log
SET learning_status = 'evaluated',
    outcome = 'neutral',
    actual_metric = 'governance_level',
    actual_value = 1
WHERE id = '7c1c7e0a-b16f-4312-b371-e1cf48a05a9f' AND learning_status = 'pending';