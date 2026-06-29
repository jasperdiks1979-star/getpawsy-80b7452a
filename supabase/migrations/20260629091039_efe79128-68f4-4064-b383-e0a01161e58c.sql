
-- Wave 1: cull 12 duplicate / merged nightly engine crons
-- (audit recommendations: collapse Commander/ACI duplicates, fold AGD+MIL+AEC
-- into a single Council, de-frequency AOS sub-jobs, defer PEI evolution).
DO $$
DECLARE
  v_jobs text[] := ARRAY[
    'aci-orchestrator-daily',
    'aci-orchestrator-hourly',
    'cmdr-orchestrator-daily',
    'commander-orchestrator-daily',
    'agd-growth-director-hourly',
    'mil-daily-review',
    'aec-executive-council-briefing',
    'aec-executive-council-weekly-review',
    'aos-engine-integrator-10min',
    'aos-failover-10min',
    'aos-twin-evaluator-hourly',
    'pei-evolution-engine-nightly'
  ];
  j text;
BEGIN
  FOREACH j IN ARRAY v_jobs LOOP
    BEGIN
      PERFORM cron.unschedule(j);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'cron.unschedule(%) skipped: %', j, SQLERRM;
    END;
  END LOOP;
END$$;

-- Guardian revenue-truth alert: when cie_revenue_truth lands a `diverged`
-- snapshot, queue a Guardian email instantly (idempotent per snapshot).
CREATE OR REPLACE FUNCTION public.cie_guardian_revenue_truth_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'diverged' THEN
    INSERT INTO public.guardian_notification_queue (channel, recipient, subject, body, status, scheduled_at)
    VALUES (
      'email',
      'admin@getpawsy.pet',
      format('Guardian: revenue divergence %s%%', round(coalesce(NEW.max_divergence_pct,0)::numeric, 2)),
      format(
        'CIE detected a cross-source revenue divergence above tolerance.%s' ||
        'Window: %s → %s%s' ||
        'orders=%s cents, stripe=%s cents, ledger=%s cents, ga4=%s cents, pinterest=%s cents, tiktok=%s cents%s' ||
        'max_divergence=%s%%',
        E'\n', NEW.window_start, NEW.window_end, E'\n',
        NEW.orders_cents, NEW.stripe_cents, NEW.ledger_cents, NEW.ga4_cents, NEW.pinterest_cents, NEW.tiktok_cents, E'\n',
        round(coalesce(NEW.max_divergence_pct,0)::numeric, 2)
      ),
      'queued',
      now()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cie_revenue_truth_guardian_alert ON public.cie_revenue_truth;
CREATE TRIGGER cie_revenue_truth_guardian_alert
AFTER INSERT ON public.cie_revenue_truth
FOR EACH ROW EXECUTE FUNCTION public.cie_guardian_revenue_truth_alert();
