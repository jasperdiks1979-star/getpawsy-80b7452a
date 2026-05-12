import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

export function ApiHealthTab() {
  const [status, setStatus] = useState<{ pinterest: boolean | null; tableCount: number | null; lastRollup: string | null }>({
    pinterest: null, tableCount: null, lastRollup: null,
  });
  useEffect(() => { (async () => {
    const { count: pCount } = await supabase.from("pinterest_accounts").select("*", { count: "exact", head: true });
    const { count: tCount } = await supabase.from("gi_settings").select("*", { count: "exact", head: true });
    const { data: action } = await supabase.from("gi_automation_actions")
      .select("acted_at").eq("action", "rollup_internal").order("acted_at", { ascending: false }).limit(1).maybeSingle();
    setStatus({ pinterest: (pCount ?? 0) > 0, tableCount: tCount, lastRollup: (action as any)?.acted_at ?? null });
  })(); }, []);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <HealthCard label="Pinterest connection" ok={status.pinterest === true} loading={status.pinterest === null}
        detail={status.pinterest ? "Token present in pinterest_accounts." : "No connected Pinterest account."} />
      <HealthCard label="GI tables initialized" ok={(status.tableCount ?? 0) > 0} loading={status.tableCount === null} detail="gi_settings reachable" />
      <HealthCard label="Last internal rollup" ok={!!status.lastRollup} loading={false}
        detail={status.lastRollup ? new Date(status.lastRollup).toLocaleString() : "Never run — use Channels tab to trigger."} />
      <Card>
        <CardHeader><CardTitle>External APIs</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <div>GA4 Data API: <Badge variant="outline">CSV import only</Badge></div>
          <div>Search Console: <Badge variant="outline">CSV import only</Badge></div>
          <div>TikTok Business API: <Badge variant="outline">CSV import only</Badge></div>
          <div>Pinterest analytics API: <Badge variant="secondary">Phase 2</Badge></div>
        </CardContent>
      </Card>
    </div>
  );
}
function HealthCard({ label, ok, loading, detail }: { label: string; ok: boolean; loading: boolean; detail: string }) {
  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between">
        <CardTitle className="text-base">{label}</CardTitle>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : ok ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <XCircle className="h-4 w-4 text-destructive" />}
      </CardHeader>
      <CardContent><CardDescription>{detail}</CardDescription></CardContent>
    </Card>
  );
}
