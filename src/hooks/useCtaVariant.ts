/**
 * useCtaVariant — reads the auto-rollback-controlled active CTA variant
 * from `cta_variant_config` for the /go landing page.
 *
 * Returns the variant string the page should render. While the network
 * fetch is in flight (or if it fails), falls back to the build-time
 * `defaultVariant` so the page never renders with a missing tag — that
 * would silently zero out CTR attribution in the dashboard.
 *
 * Why this exists: the `cta-variant-rollback-guard` edge function may
 * flip `active_variant` from `high_conv_v3` back to `high_conv_v2` if
 * CTR drops below the configured floor. The /go page must respect that
 * decision on the next pageview without a deploy.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useCtaVariant(defaultVariant: string): { variant: string; loading: boolean } {
  const [variant, setVariant] = useState<string>(defaultVariant);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('cta_variant_config')
          .select('active_variant')
          .eq('id', 1)
          .maybeSingle();
        if (cancelled) return;
        if (!error && data?.active_variant) setVariant(data.active_variant);
      } catch {
        // Silent fallback to defaultVariant — analytics must never break /go.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { variant, loading };
}