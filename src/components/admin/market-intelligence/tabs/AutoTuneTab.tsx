import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, Sparkles, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Run = {
  id: string;
  ran_at: string;
  recipes_evaluated: number;
  recipes_boosted: number;
  recipes_decayed: number;
  recipes_deactivated: number;
  threshold_before: number | null;
  threshold_after: number | null;
  hook_multipliers: Record<string, number>;
  notes: string | null;
};

export function AutoTuneTab() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [threshold, setThreshold] = useState<number | null>(null);
  const [hookMults, setHookMults] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => { void load(); }, []);

  async function load() {
    const [{ data: r }, { data: state }] = await Promise.all([
      supabase.from("mi_tuning_runs").select("*").order("ran_at", { ascending: false }).limit(20),
      supabase.from("mi_tuning_state").select("scope, key, value"),
    ]);
    setRuns((r ?? []) as Run[]);
    const mults: Record<string, number> = {};
    let th: number | null = null;
    for (const s of state ?? []) {
      if (s.scope === "readiness" && s.key === "promote_threshold") th = Number(s.value);
      if (s.scope === "hook_family") mults[s.key] = Number(s.value);
    }
    setThreshold(th);
    setHookMults(mults);
  }

  async function run(dryRun: boolean) {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("mi-auto-tune", { body: { dry_run: dryRun } });
      if (error) throw error;
      toast.success(dryRun ? "Preview computed" : "Auto-tune applied");
      console.log("[mi-auto-tune]", data);
      await load();
    } catch (e: any) {
      toast.error(`Auto-tune failed: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" /> Self-tuning loop</CardTitle>
          <CardDescription>
            Weekly model that adjusts readiness threshold, recipe scores and hook-family multipliers based on Pinterest CTR + TikTok engagement.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => run(true)} disabled={busy}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Play className="h-3 w-3 mr-1" />}
            Preview
          </Button>
          <Button size="sm" onClick={() => run(false)} disabled={busy}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
            Apply tuning
          </Button>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Current readiness threshold</CardDescription></CardHeader>
          <CardContent><div className="text-3xl font-semibold">{threshold ?? 60}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Hook-family multipliers</CardDescription></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {Object.keys(hookMults).length === 0 && <span className="text-sm text-muted-foreground">No tuning yet</span>}
            {Object.entries(hookMults).sort((a,b) => b[1]-a[1]).map(([fam, m]) => (
              <Badge key={fam} variant={m >= 1 ? "default" : "secondary"}>
                {m >= 1 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                {fam}: {m.toFixed(2)}×
              </Badge>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent tuning runs</CardTitle></CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs yet. Click Apply tuning to start.</p>
          ) : (
            <div className="space-y-3">
              {runs.map((r) => (
                <div key={r.id} className="border rounded-md p-3 text-sm space-y-1">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="font-medium">{new Date(r.ran_at).toLocaleString()}</span>
                    <div className="flex gap-1 flex-wrap">
                      <Badge variant="outline">eval {r.recipes_evaluated}</Badge>
                      <Badge variant="default">+{r.recipes_boosted}</Badge>
                      <Badge variant="secondary">−{r.recipes_decayed}</Badge>
                      {r.recipes_deactivated > 0 && <Badge variant="destructive">off {r.recipes_deactivated}</Badge>}
                      <Badge variant="outline">thr {r.threshold_before ?? "?"} → {r.threshold_after ?? "?"}</Badge>
                    </div>
                  </div>
                  {r.notes && <p className="text-xs text-muted-foreground">{r.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
