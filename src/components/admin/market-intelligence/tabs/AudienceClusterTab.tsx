import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface ClusterRow {
  cohort_key: string;
  cohort_source: string | null;
  cohort_landing: string | null;
  channel: string;
  hook_family: string;
  conversions: number;
  revenue: number;
  share: number;
}

export function AudienceClusterTab() {
  const [busy, setBusy] = useState(false);
  const [windowDays, setWindowDays] = useState(21);
  const [minConv, setMinConv] = useState(2);
  const [rows, setRows] = useState<ClusterRow[]>([]);
  const [summary, setSummary] = useState<{ cohorts: number; arms: number; attributed: number } | null>(null);

  async function loadLast() {
    const { data } = await supabase
      .from("mi_audience_clusters")
      .select("*")
      .order("revenue", { ascending: false })
      .limit(100);
    if (data) setRows(data as unknown as ClusterRow[]);
  }
  useEffect(() => { void loadLast(); }, []);

  async function run(dry: boolean) {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("mi-audience-cluster", {
        body: { window_days: windowDays, min_conversions: minConv, dry_run: dry },
      });
      if (error) throw error;
      setRows((data?.rows ?? []) as ClusterRow[]);
      setSummary({ cohorts: data?.cohorts ?? 0, arms: data?.arms ?? 0, attributed: data?.attributed_orders ?? 0 });
      toast.success(`${data?.cohorts ?? 0} cohorts · ${data?.arms ?? 0} arms · ${data?.attributed_orders ?? 0} orders`);
      if (!dry) await loadLast();
    } catch (e: any) { toast.error(`Cluster failed: ${e?.message ?? e}`); }
    finally { setBusy(false); }
  }

  // Group by cohort_key for display.
  const byCohort = new Map<string, ClusterRow[]>();
  for (const r of rows) {
    const list = byCohort.get(r.cohort_key) ?? [];
    list.push(r);
    byCohort.set(r.cohort_key, list);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Audience clustering</CardTitle>
          <CardDescription>
            Maps visitor cohorts (source × landing bucket) to the hook-families that actually convert for them.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><Label className="text-xs">Window (days)</Label><Input type="number" value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))} /></div>
          <div><Label className="text-xs">Min conversions</Label><Input type="number" value={minConv} onChange={(e) => setMinConv(Number(e.target.value))} /></div>
          <div className="col-span-full flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => run(true)} disabled={busy}>{busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null} Preview</Button>
            <Button size="sm" onClick={() => run(false)} disabled={busy}>Cluster &amp; save</Button>
            {summary && <span className="text-sm text-muted-foreground self-center">{summary.cohorts} cohorts · {summary.arms} arms · {summary.attributed} orders</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Cohort → winning arms</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {byCohort.size === 0 && <p className="text-sm text-muted-foreground">No data yet — run a cluster above.</p>}
          {Array.from(byCohort.entries()).map(([cohort, list]) => (
            <div key={cohort} className="border rounded-md p-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline">{cohort}</Badge>
                <span className="text-xs text-muted-foreground">{list.length} arms</span>
              </div>
              <div className="space-y-1">
                {list.sort((a, b) => b.revenue - a.revenue).slice(0, 5).map((r) => (
                  <div key={`${r.channel}-${r.hook_family}`} className="flex items-center gap-2 text-sm flex-wrap">
                    <Badge variant="secondary" className="capitalize">{r.channel}</Badge>
                    <span className="font-medium flex-1 truncate">{r.hook_family}</span>
                    <Badge variant="outline">{r.conversions} conv</Badge>
                    <Badge variant="outline">${Number(r.revenue).toFixed(0)}</Badge>
                    <Badge>{(Number(r.share) * 100).toFixed(0)}% share</Badge>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}