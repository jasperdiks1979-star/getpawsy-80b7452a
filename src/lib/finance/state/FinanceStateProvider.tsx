/**
 * Single React provider for the canonical FinanceState.
 * Every finance panel consumes this — no panel fetches its own KPIs anymore.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { emptyFinanceState, reconcile } from "./reconcile";
import type { FinanceState } from "./types";

type Ctx = {
  state: FinanceState;
  entityId: string | null;
  refresh: () => Promise<void>;
};

const FinanceStateContext = createContext<Ctx | null>(null);

async function safeInvoke(fn: string, body: unknown) {
  try {
    const { data, error } = await supabase.functions.invoke(fn, { body });
    if (error) return null;
    return data;
  } catch {
    return null;
  }
}

export function FinanceStateProvider({
  entityId,
  children,
}: {
  entityId: string | null;
  children: ReactNode;
}) {
  const [state, setState] = useState<FinanceState>(() => emptyFinanceState());

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    const body = { entity_id: entityId };
    const [kpi, tax, belasting] = await Promise.all([
      safeInvoke("finance-kpi-strip", body),
      safeInvoke("finance-tax-readiness", body),
      safeInvoke("finance-belastingdienst-readiness", body),
    ]);
    try {
      const next = reconcile({ kpi, tax, belasting });
      setState(next);
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: (e as Error).message }));
    }
  }, [entityId]);

  useEffect(() => { void load(); }, [load]);

  const value = useMemo<Ctx>(() => ({ state, entityId, refresh: load }), [state, entityId, load]);
  return <FinanceStateContext.Provider value={value}>{children}</FinanceStateContext.Provider>;
}

export function useFinanceState(): Ctx {
  const ctx = useContext(FinanceStateContext);
  if (!ctx) {
    // Panels can be mounted standalone in tests — return an empty stub.
    return {
      state: emptyFinanceState(),
      entityId: null,
      refresh: async () => {},
    };
  }
  return ctx;
}
