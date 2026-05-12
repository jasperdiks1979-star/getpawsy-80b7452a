/**
 * useVisitorHook — Phase 22 visitor-level personalization.
 *
 * Resolves the winning hook_family for the current visitor's cohort
 * (utm_source × landing_page bucket) by calling `mi-visitor-hook`.
 * Result is cached in sessionStorage so subsequent renders/navigations
 * are zero-latency. Used by the UI layer to render cohort-aware CTA copy.
 *
 * Falls back gracefully — if the resolver is unreachable or no match
 * exists, `hook` is null and callers should render their default copy.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getStoredUTMParams } from "@/hooks/useUTMTracking";

export interface VisitorHook {
  channel: string;
  hook_family: string;
  share: number;
  conversions: number;
  source: "cohort_exact" | "channel_fallback" | "global_fallback";
}

const CACHE_KEY = "gp_visitor_hook_v1";

function readCache(): VisitorHook | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as VisitorHook;
  } catch {
    return null;
  }
}

export function useVisitorHook(): { hook: VisitorHook | null; loading: boolean } {
  const [hook, setHook] = useState<VisitorHook | null>(() => readCache());
  const [loading, setLoading] = useState(!hook);

  useEffect(() => {
    if (hook) return;
    let cancelled = false;
    (async () => {
      try {
        const utm = getStoredUTMParams();
        const { data, error } = await supabase.functions.invoke("mi-visitor-hook", {
          body: {
            utm_source: utm.utm_source ?? null,
            landing_page: utm.landing_page ?? (typeof window !== "undefined" ? window.location.pathname : null),
          },
        });
        if (cancelled) return;
        if (!error && data?.hook) {
          setHook(data.hook);
          try {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify(data.hook));
          } catch {
            /* storage unavailable */
          }
        }
      } catch {
        /* silent — caller falls back to default copy */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hook]);

  return { hook, loading };
}