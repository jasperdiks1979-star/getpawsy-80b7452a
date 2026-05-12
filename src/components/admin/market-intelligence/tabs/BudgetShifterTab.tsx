import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Scale, Zap } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Verdict {
  pinterest: { roas: number; cap: number; share: number };
  tiktok: { roas: number; cap: number; share: number };
  total_cap: number;
  window_days: number;
  computed_at: string;
}

export function BudgetShifterTab() {
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [totalCap, setTotalCap] = useState(14);
  const [windowDays, setWindowDays] = useState(14);
  const [minCh, setMinCh] = useState(2);
  const [verdict, setVerdict] = useState<Verdict | null>(null);

  async function loadLast() {
    const { data } = await supabase
      .from("mi_tuning_state")
      .select("value")
      .eq("scope", "budget_split").eq("key", "daily").maybeSingle();
    if (data?.value) setVerdict(data.value as unknown as Verdict);
  }
  useEffect(() => { void loadLast(); }, []);

  async function run(dry: boolean) {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("mi-budget-shifter", {
        body: { total_cap: totalCap, window_days: windowDays, min_per_channel: minCh, dry_run: dry },
      });
      if (error) throw error;
      setVerdict(data?.verdict ?? null);
      toast.success(dry ? "Preview ready" : "Budget split saved");
    } catch (e: any) { toast.error(`Shifter failed: ${e?.message ?? e}`); }
    finally { setBusy(false); }
  }

  async function applyToGuardrails() {
    if (!verdict) return;
    setApplying(true);
    try {
      const { error } = await supabase.functions.invoke("mi-arm-guardrails", {
        body: { max_pinterest_per_day: verdict.pinterest.cap, max_tiktok_per_day: verdict.tiktok.cap },
      });
      if (error) throw error;
      toast.success("Caps pushed to guardrails");
    } catch (e: any) { toast.error(`Apply failed: ${e?.message ?? e}`); }
    finally { setApplying(false); }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Scale className="h-5 w-5" /> Auto-budget shifter</CardTitle>
          <CardDescription>
            Reweights the daily Pinterest vs TikTok cap based on marginal ROAS over the window.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><Label className="text-xs">Total daily cap</Label><Input type="number" value={totalCap} onChange={(e) => setTotalCap(Number(e.target.value))} /></div>
          <div><Label className="text-xs">Window (days)</Label><Input type="number" value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))} /></div>
          <div><Label className="text-xs">Min per channel</Label><Input type="number" value={minCh} onChange={(e) => setMinCh(Number(e.target.value))} /></div>
          <div className="col-span-full flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => run(true)} disabled={busy}>{busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null} Preview</Button>
            <Button size="sm" onClick={() => run(false)} disabled={busy}><Zap className="h-3 w-3 mr-1" /> Compute & save</Button>
            <Button size="sm" variant="secondary" onClick={applyToGuardrails} disabled={!verdict || applying}>{applying ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null} Push caps to guardrails</Button>
          </div>
        </CardContent>
      </Card>

      {verdict && (
        <Card>
          <CardHeader><CardTitle className="text-base">Allocation verdict</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(["pinterest", "tiktok"] as const).map((ch) => {
              const v = verdict[ch];
              return (
                <div key={ch} className="border rounded-md p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize">{ch}</Badge>
                    <Badge variant={v.roas >= 1 ? "default" : "destructive"}>{v.roas.toFixed(2)}x ROAS</Badge>
                    <Badge variant="secondary">{(v.share * 100).toFixed(0)}% share</Badge>
                  </div>
                  <div className="text-2xl font-semibold">{v.cap} <span className="text-sm font-normal text-muted-foreground">slots/day</span></div>
                </div>
              );
            })}
            <div className="text-xs text-muted-foreground md:col-span-2">
              Window {verdict.window_days}d · total {verdict.total_cap} · computed {new Date(verdict.computed_at).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
