import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, DollarSign, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface ArmRow {
  channel: string;
  hook_family: string;
  conversions: number;
  revenue: number;
  est_spend: number;
  roas: number;
  rev_per_click: number;
  computed_at: string;
}

export function RevenueAttributionTab() {
  const [busy, setBusy] = useState(false);
  const [windowDays, setWindowDays] = useState(14);
  const [cpc, setCpc] = useState(0.25);
  const [rows, setRows] = useState<ArmRow[]>([]);
  const [summary, setSummary] = useState<{ attributed: number; total: number } | null>(null);

  async function load() {
    const { data } = await supabase
      .from("mi_arm_revenue")
      .select("channel,hook_family,conversions,revenue,est_spend,roas,rev_per_click,computed_at")
      .order("roas", { ascending: false })
      .limit(50);
    setRows((data ?? []) as ArmRow[]);
  }

  useEffect(() => { void load(); }, []);

  async function run() {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("mi-revenue-attribution", {
        body: { window_days: windowDays, cpc_estimate: cpc },
      });
      if (error) throw error;
      setSummary({ attributed: data?.attributed_orders ?? 0, total: data?.total_orders ?? 0 });
      await load();
      toast.success(`Attributed ${data?.attributed_orders ?? 0}/${data?.total_orders ?? 0} orders`);
    } catch (e: any) { toast.error(`Attribution failed: ${e?.message ?? e}`); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" /> Revenue attribution loop</CardTitle>
          <CardDescription>
            Maps paid orders back to (channel, hook) via UTM sessions. The bandit then ranks arms on ROAS, not just CTR.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><Label className="text-xs">Window (days)</Label><Input type="number" value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))} /></div>
          <div><Label className="text-xs">Assumed CPC ($)</Label><Input type="number" step="0.01" value={cpc} onChange={(e) => setCpc(Number(e.target.value))} /></div>
          <div className="col-span-full">
            <Button size="sm" onClick={run} disabled={busy}>{busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <TrendingUp className="h-3 w-3 mr-1" />} Run attribution</Button>
            {summary && <span className="ml-3 text-sm text-muted-foreground">{summary.attributed}/{summary.total} orders attributed</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Top arms by ROAS</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {rows.length === 0 && <p className="text-sm text-muted-foreground">No attribution data yet — run the loop above.</p>}
          {rows.map((r) => (
            <div key={`${r.channel}-${r.hook_family}`} className="flex items-center gap-3 text-sm border rounded-md p-2">
              <Badge variant="outline" className="capitalize">{r.channel}</Badge>
              <span className="font-medium flex-1 truncate">{r.hook_family}</span>
              <Badge variant="secondary">{r.conversions} conv</Badge>
              <Badge variant="secondary">${r.revenue.toFixed(2)} rev</Badge>
              <Badge variant="secondary">${r.est_spend.toFixed(2)} est. spend</Badge>
              <Badge variant={r.roas >= 1 ? "default" : "destructive"}>{r.roas.toFixed(2)}x ROAS</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}