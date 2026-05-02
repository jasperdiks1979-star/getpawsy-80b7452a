import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Result {
  eligible: boolean;
  loading: boolean;
  reason?: string;
}

// In-memory cache keyed by amount+country+currency (per session) to avoid duplicate calls.
const cache = new Map<string, { eligible: boolean; reason?: string; ts: number }>();
const TTL_MS = 5 * 60 * 1000;

export function useKlarnaEligibility(
  amount: number | null | undefined,
  opts: { country?: string; currency?: string } = {},
): Result {
  const country = (opts.country || "US").toUpperCase();
  const currency = (opts.currency || "usd").toLowerCase();
  const amt = typeof amount === "number" && Number.isFinite(amount) ? amount : null;

  const [state, setState] = useState<Result>({ eligible: false, loading: amt !== null });

  useEffect(() => {
    if (amt === null) {
      setState({ eligible: false, loading: false });
      return;
    }
    const key = `${amt.toFixed(2)}|${country}|${currency}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.ts < TTL_MS) {
      setState({ eligible: cached.eligible, loading: false, reason: cached.reason });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("check-klarna-eligibility", {
          body: { amount: amt, country, currency },
        });
        if (cancelled) return;
        if (error) {
          setState({ eligible: false, loading: false, reason: "error" });
          return;
        }
        const eligible = !!data?.eligible;
        cache.set(key, { eligible, reason: data?.reason, ts: Date.now() });
        setState({ eligible, loading: false, reason: data?.reason });
      } catch {
        if (!cancelled) setState({ eligible: false, loading: false, reason: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [amt, country, currency]);

  return state;
}