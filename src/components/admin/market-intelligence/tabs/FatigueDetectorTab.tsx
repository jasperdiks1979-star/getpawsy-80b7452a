import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Activity, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Verdict {
  channel: string;
  hook_family: string;
  recent_roas: number;
  prior_roas: number;
  decline: number;
  recent_conv: number;
  prior_conv: number;
  verdict: "fatigued" | "healthy";
}

export function FatigueDetectorTab() {
  const [busy, setBusy] = useState(false);
  const [recentDays, setRecentDays] = useState(7);
  const [priorDays, setPriorDays] = useState(7);
  const [dropPct, setDropPct] = useState(0.4);
  const [minConv, setMinConv] = useState(3);
  const [verdicts, setVerdicts] = useState<Verdict[]>([]);
  const [summary, setSummary] = useState<{ arms: number; fatigued: number; triggered: number } | null>(null);

  async function loadLast() {
    const { data } = await supabase
      .from("mi_tuning_state")
      .select("metadata")
      .eq("scope", "arm_fatigue")
      .order("updated_at", { ascending: false })
      .limit(50);
    if (data?.length) setVerdicts(data.map((r) => r.metadata as unknown as Verdict).filter(Boolean));
  }
  useEffect(() => { void loadLast(); }, []);

  async function run(dry: boolean, triggerVariants: boolean) {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("mi-fatigue-detector", {
        body: {
          recent_days: recentDays,
          prior_days: priorDays,
          drop_pct: dropPct,
          min_conversions: minConv,
          dry_run: dry,
          trigger_variants: triggerVariants,
        },
      });
      if (error) throw error;
      setVerdicts((data?.verdicts ?? []) as Verdict[]);
      setSummary({ arms: data?.arms ?? 0, fatigued: data?.fatigued ?? 0, triggered: data?.variants_triggered ?? 0 });
      toast.success(`Scanned ${data?.arms ?? 0} arms · ${data?.fatigued ?? 0} fatigued`);
    } catch (e: any) { toast.error(`Detector failed: ${e?.message ?? e}`); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" /> Creative-fatigue detector</CardTitle>
          <CardDescription>
            Compares recent ROAS vs prior period per arm. Fatigued arms can auto-trigger fresh variant generation.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><Label className="text-xs">Recent days</Label><Input type="number" value={recentDays} onChange={(e) => setRecentDays(Number(e.target.value))} /></div>
          <div><Label className="text-xs">Prior days</Label><Input type="number" value={priorDays} onChange={(e) => setPriorDays(Number(e.target.value))} /></div>
          <div><Label className="text-xs">Drop threshold</Label><Input type="number" step="0.05" value={dropPct} onChange={(e) => setDropPct(Number(e.target.value))} /></div>
          <div><Label className="text-xs">Min conversions</Label><Input type="number" value={minConv} onChange={(e) => setMinConv(Number(e.target.value))} /></div>
          <div className="col-span-full flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => run(true, false)} disabled={busy}>{busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null} Preview</Button>
            <Button size="sm" onClick={() => run(false, false)} disabled={busy}>Detect & save</Button>
            <Button size="sm" variant="secondary" onClick={() => run(false, true)} disabled={busy}><RefreshCcw className="h-3 w-3 mr-1" /> Detect + refresh variants</Button>
            {summary && <span className="text-sm text-muted-foreground self-center">{summary.fatigued}/{summary.arms} fatigued · {summary.triggered} families refreshed</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Arm health</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {verdicts.length === 0 && <p className="text-sm text-muted-foreground">No data yet — run a scan above.</p>}
          {verdicts.map((v) => (
            <div key={`${v.channel}-${v.hook_family}`} className="flex items-center gap-3 text-sm border rounded-md p-2 flex-wrap">
              <Badge variant="outline" className="capitalize">{v.channel}</Badge>
              <span className="font-medium flex-1 truncate">{v.hook_family}</span>
              <Badge variant="secondary">prior {v.prior_roas.toFixed(2)}x</Badge>
              <Badge variant="secondary">recent {v.recent_roas.toFixed(2)}x</Badge>
              <Badge variant={v.verdict === "fatigued" ? "destructive" : "default"}>
                {v.verdict === "fatigued" ? `▼ ${(v.decline * 100).toFixed(0)}%` : "healthy"}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}