import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, ShieldCheck } from "lucide-react";

type Quality = { clean: number; bot: number; admin: number; internal: number; unknown: number; total: number };

/**
 * Surfaces data-quality status above any panel that drives AI/autopilot
 * decisions. When clean-US share drops below 30% in the last 24h we warn
 * the operator that automated optimization should be paused.
 */
export default function DataQualityWarning() {
  const [q, setQ] = useState<Quality | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const since = new Date(Date.now() - 86400000).toISOString();
      const { data } = await supabase
        .from("visitor_activity")
        .select("traffic_quality")
        .gte("created_at", since)
        .limit(10000);
      if (!alive || !data) return;
      const counts: Quality = { clean: 0, bot: 0, admin: 0, internal: 0, unknown: 0, total: data.length };
      for (const r of data as any[]) {
        const k = (r.traffic_quality ?? "unknown") as keyof Quality;
        if (k in counts) (counts as any)[k]++;
        else counts.unknown++;
      }
      setQ(counts);
    })();
    return () => { alive = false; };
  }, []);

  if (!q || q.total === 0) return null;
  const cleanShare = (q.clean / q.total) * 100;
  const ok = cleanShare >= 30;

  return (
    <Alert variant={ok ? "default" : "destructive"}>
      {ok ? <ShieldCheck className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
      <AlertTitle>
        Data quality: {cleanShare.toFixed(0)}% clean US ({q.clean}/{q.total} events, 24h)
      </AlertTitle>
      <AlertDescription className="text-xs">
        Bot {q.bot} • Admin {q.admin} • Internal {q.internal} • Unknown geo {q.unknown}.
        {ok
          ? " AI autopilot is using clean traffic only."
          : " Clean share is too low — autopilot decisions will be deferred until quality recovers."}
      </AlertDescription>
    </Alert>
  );
}