import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CanonicalV2Flag {
  enabled: boolean;
  isAdmin: boolean;
  allowV2: boolean;
  loading: boolean;
  phase4aCutoffIso: string;
}

const DEFAULT_CUTOFF = "2026-07-17T23:20:00Z";

export function useCanonicalV2Flag(): CanonicalV2Flag {
  const [state, setState] = useState<CanonicalV2Flag>({
    enabled: false, isAdmin: false, allowV2: false, loading: true, phase4aCutoffIso: DEFAULT_CUTOFF,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: userRes } = await supabase.auth.getUser();
        const uid = userRes?.user?.id;
        if (!uid) {
          if (!cancelled) setState({ enabled: false, isAdmin: false, allowV2: false, loading: false, phase4aCutoffIso: DEFAULT_CUTOFF });
          return;
        }
        const [{ data: cfg }, { data: roleRes }] = await Promise.all([
          supabase.from("app_config").select("key,value")
            .in("key", ["canonical_traffic_quality_v2.enabled", "canonical_traffic_quality_v2.phase4a_cutoff_iso"]),
          supabase.rpc("has_role", { _user_id: uid, _role: "admin" }),
        ]);
        let enabled = false;
        let cutoff = DEFAULT_CUTOFF;
        for (const row of cfg ?? []) {
          if (row.key === "canonical_traffic_quality_v2.enabled") enabled = row.value === true || row.value === "true";
          if (row.key === "canonical_traffic_quality_v2.phase4a_cutoff_iso" && typeof row.value === "string") cutoff = row.value as string;
        }
        const isAdmin = roleRes === true;
        if (!cancelled) setState({ enabled, isAdmin, allowV2: enabled && isAdmin, loading: false, phase4aCutoffIso: cutoff });
      } catch {
        if (!cancelled) setState({ enabled: false, isAdmin: false, allowV2: false, loading: false, phase4aCutoffIso: DEFAULT_CUTOFF });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return state;
}