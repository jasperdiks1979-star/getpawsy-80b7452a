import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, FlaskConical, Trophy, Sparkles, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Experiment = {
  id: string; name: string; placement: string; hook_family: string | null;
  status: string; winner_variant_id: string | null; started_at: string;
};
type Variant = {
  id: string; experiment_id: string; label: string;
  impressions: number; clicks: number; conversions: number;
  posterior_win_prob: number; status: string;
};

export function ExperimentsTab() {
  const [busy, setBusy] = useState(false);
  const [autoBusy, setAutoBusy] = useState(false);
  const [ingestBusy, setIngestBusy] = useState(false);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [variants, setVariants] = useState<Record<string, Variant[]>>({});
  const [lastResult, setLastResult] = useState<any>(null);

  useEffect(() => { void load(); }, []);

  async function load() {
    const { data: exps } = await supabase
      .from("mi_experiments")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(20);
    setExperiments((exps ?? []) as Experiment[]);
    if (exps && exps.length) {
      const ids = exps.map(e => e.id);
      const { data: vars } = await supabase
        .from("mi_experiment_variants")
        .select("*")
        .in("experiment_id", ids);
      const grouped: Record<string, Variant[]> = {};
      (vars ?? []).forEach((v: any) => {
        (grouped[v.experiment_id] ||= []).push(v as Variant);
      });
      setVariants(grouped);
    }
  }

  async function run(dryRun: boolean) {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("mi-experiment-tracker", { body: { dry_run: dryRun } });
      if (error) throw error;
      setLastResult(data);
      toast.success(dryRun ? "Preview ready" : `${data?.winners_selected ?? 0} winners, ${data?.losers_paused ?? 0} paused`);
      if (!dryRun) await load();
    } catch (e: any) { toast.error(`Tracker failed: ${e?.message ?? e}`); }
    finally { setBusy(false); }
  }

  async function autoCreate() {
    setAutoBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("mi-experiment-autocreate", { body: {} });
      if (error) throw error;
      toast.success(`Created ${data?.experiments_created ?? 0} experiments`);
      await load();
    } catch (e: any) { toast.error(`Auto-create failed: ${e?.message ?? e}`); }
    finally { setAutoBusy(false); }
  }

  async function ingest() {
    setIngestBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("mi-experiment-ingest", { body: {} });
      if (error) throw error;
      toast.success(`Ingested ${data?.updated ?? 0} variants`);
      await load();
    } catch (e: any) { toast.error(`Ingest failed: ${e?.message ?? e}`); }
    finally { setIngestBusy(false); }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FlaskConical className="h-5 w-5" /> A/B experiment tracker</CardTitle>
          <CardDescription>Bayesian Thompson sampling on per-variant CTR. Variants with ≥95% posterior win-prob auto-pause losers in the Pinterest queue.</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2 flex-wrap">
          <Button size="sm" variant="secondary" onClick={autoCreate} disabled={autoBusy}>
            {autoBusy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />} Auto-create
          </Button>
          <Button size="sm" variant="secondary" onClick={ingest} disabled={ingestBusy}>
            {ingestBusy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Download className="h-3 w-3 mr-1" />} Ingest analytics
          </Button>
          <Button size="sm" variant="outline" onClick={() => run(true)} disabled={busy}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null} Preview
          </Button>
          <Button size="sm" onClick={() => run(false)} disabled={busy}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null} Evaluate &amp; apply
          </Button>
          {lastResult && (
            <div className="flex gap-2 ml-auto flex-wrap">
              <Badge variant="outline">evaluated {lastResult.experiments_evaluated}</Badge>
              <Badge variant="default">winners {lastResult.winners_selected}</Badge>
              <Badge variant="secondary">paused {lastResult.losers_paused}</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {experiments.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No experiments yet. Create one by inserting into mi_experiments + mi_experiment_variants.</CardContent></Card>
      ) : experiments.map((exp) => {
        const vs = variants[exp.id] ?? [];
        return (
          <Card key={exp.id}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                {exp.name}
                <Badge variant={exp.status === "completed" ? "default" : "secondary"}>{exp.status}</Badge>
                {exp.hook_family && <Badge variant="outline">{exp.hook_family}</Badge>}
              </CardTitle>
              <CardDescription>{exp.placement} · started {new Date(exp.started_at).toLocaleDateString()}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {vs.map((v) => {
                const ctr = v.impressions ? (v.clicks / v.impressions) * 100 : 0;
                const isWinner = exp.winner_variant_id === v.id;
                return (
                  <div key={v.id} className="flex items-center gap-3 text-sm border rounded-md p-2">
                    {isWinner && <Trophy className="h-4 w-4 text-amber-500" />}
                    <span className="font-medium flex-1 truncate">{v.label}</span>
                    <Badge variant="outline">{v.impressions} imp</Badge>
                    <Badge variant="outline">{v.clicks} clk</Badge>
                    <Badge variant="secondary">{ctr.toFixed(2)}% CTR</Badge>
                    <Badge variant={Number(v.posterior_win_prob) >= 0.95 ? "default" : "outline"}>
                      win {(Number(v.posterior_win_prob) * 100).toFixed(1)}%
                    </Badge>
                    <Badge variant={v.status === "active" ? "default" : "secondary"}>{v.status}</Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}