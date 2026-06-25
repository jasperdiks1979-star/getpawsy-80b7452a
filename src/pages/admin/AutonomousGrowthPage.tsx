import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

type Settings = {
  kill_switch: boolean;
  auto_enhance: boolean;
  auto_lifestyle: boolean;
  auto_video: boolean;
  auto_publish: boolean;
  auto_repair: boolean;
  daily_budget_usd: number;
  engine_budgets: Record<string, number>;
  updated_at: string;
};

type Run = {
  id: string; engine: string; status: string; dry_run: boolean;
  counts: any; ai_cost_usd: number; started_at: string; finished_at: string | null; error: string | null;
};

type Step = {
  id: string; engine: string; step_key: string; severity: string; status: string;
  message: string | null; created_at: string;
};

export default function AutonomousGrowthPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [overview, setOverview] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [growth, setGrowth] = useState<any | null>(null);
  const [tierCounts, setTierCounts] = useState<Record<string, number>>({});
  const [topProducts, setTopProducts] = useState<any[]>([]);

  async function load() {
    const [s, r, st, cpe, cj, pinQ, cinV3, scorecard] = await Promise.all([
      supabase.from("agp_settings").select("*").eq("id", 1).maybeSingle(),
      supabase.from("agp_runs").select("*").order("started_at", { ascending: false }).limit(25),
      supabase.from("agp_run_steps").select("id,engine,step_key,severity,status,message,created_at").in("severity", ["warn", "error", "critical"]).order("created_at", { ascending: false }).limit(50),
      supabase.from("cpe_creative_jobs").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("cj_media_derivative_jobs").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("pinterest_pin_queue").select("id", { count: "exact", head: true }).eq("status", "ready"),
      supabase.from("cinematic_v3_jobs").select("id", { count: "exact", head: true }).in("status", ["pending", "running"]),
      supabase.from("growth_daily_scorecard").select("*").order("date", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const [g, ph] = await Promise.all([
      supabase.from("agp_growth_scores").select("*").order("day", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("agp_product_health").select("product_id,overall,priority_tier,recommended_actions").order("overall", { ascending: false }).limit(20),
    ]);
    setGrowth(g.data ?? null);
    setTopProducts((ph.data as any[]) ?? []);
    const tc: Record<string, number> = {};
    for (const r of (ph.data as any[]) ?? []) tc[r.priority_tier] = (tc[r.priority_tier] ?? 0) + 1;
    setTierCounts(tc);
    setSettings((s.data as Settings) ?? null);
    setRuns((r.data as Run[]) ?? []);
    setSteps((st.data as Step[]) ?? []);
    setOverview({
      cpe_pending: cpe.count ?? 0,
      cj_pending: cj.count ?? 0,
      pinterest_ready: pinQ.count ?? 0,
      cinematic_active: cinV3.count ?? 0,
      growth_score: (scorecard.data as any)?.overall_score ?? 0,
    });
  }

  useEffect(() => { load(); }, []);

  async function toggle(key: keyof Settings) {
    if (!settings) return;
    setLoading(true);
    const { error } = await supabase.from("agp_settings").update({ [key]: !settings[key], updated_at: new Date().toISOString() } as any).eq("id", 1);
    if (error) toast.error(error.message); else { toast.success(`${String(key)} → ${!settings[key]}`); load(); }
    setLoading(false);
  }

  async function runWatcher(dry = true) {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("agp-self-healing-watcher", { body: { dry_run: dry } });
    if (error) toast.error(error.message);
    else { toast.success(`Watcher: ${JSON.stringify((data as any)?.counts ?? {})}`); load(); }
    setLoading(false);
  }

  async function runWave2(dry = true, mode: "delta" | "full" = "delta") {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("agp-wave2-media-pipeline", {
      body: { dry_run: dry, mode },
    });
    if (error) toast.error(error.message);
    else { toast.success(`Wave 2 ${dry ? "(dry)" : mode}: ${JSON.stringify((data as any)?.counts ?? {})}`); load(); }
    setLoading(false);
  }

  async function runWave3(dry = true, maxEnhance = 6) {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("agp-wave3-enhance-qa", {
      body: { dry_run: dry, maxEnhance },
    });
    if (error) toast.error(error.message);
    else { toast.success(`Wave 3 ${dry ? "(dry)" : `live x${maxEnhance}`}: ${JSON.stringify((data as any)?.counts ?? {})}`); load(); }
    setLoading(false);
  }

  async function runWave4(dry = true) {
    setLoading(true);
    const sig = await supabase.functions.invoke("agp-signal-collector", { body: { dry_run: dry } });
    if (sig.error) { toast.error(`signals: ${sig.error.message}`); setLoading(false); return; }
    const sc = await supabase.functions.invoke("agp-growth-scorer", { body: { dry_run: dry } });
    if (sc.error) toast.error(`scorer: ${sc.error.message}`);
    else toast.success(`Wave 4 ${dry ? "(dry)" : "live"}: score=${(sc.data as any)?.score?.overall?.toFixed?.(1) ?? "?"}`);
    setLoading(false);
    load();
  }

  const cost24h = runs.filter(r => new Date(r.started_at).getTime() > Date.now() - 86_400_000).reduce((a, r) => a + Number(r.ai_cost_usd ?? 0), 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Autonomous Growth Platform</h1>
          <p className="text-sm text-muted-foreground">Waves 1–3 — Foundations, media pipeline, enhancement + QA. All auto-modes default OFF.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => runWatcher(true)} disabled={loading}>Dry-run watcher</Button>
          <Button onClick={() => runWatcher(false)} disabled={loading}>Run self-healing watcher</Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Wave 2 — CJ Media Pipeline</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 items-center">
          <Button size="sm" variant="outline" onClick={() => runWave2(true)} disabled={loading}>Dry-run snapshot</Button>
          <Button size="sm" onClick={() => runWave2(false, "delta")} disabled={loading}>Run delta (4 batches)</Button>
          <Button size="sm" variant="secondary" onClick={() => runWave2(false, "full")} disabled={loading}>Run full sweep (20 batches)</Button>
          <span className="text-xs text-muted-foreground ml-2">
            Rehosts CJ images & videos, drains derivative queue, runs integrity scan.
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Wave 3 — Enhancement + QA loop</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 items-center">
          <Button size="sm" variant="outline" onClick={() => runWave3(true)} disabled={loading}>Dry-run snapshot</Button>
          <Button size="sm" onClick={() => runWave3(false, 6)} disabled={loading}>Run small (6 imgs)</Button>
          <Button size="sm" variant="secondary" onClick={() => runWave3(false, 20)} disabled={loading}>Run batch (20 imgs)</Button>
          <span className="text-xs text-muted-foreground ml-2">
            Enqueues + enhances product images via Gemini-3.1-flash-image (~$0.05/img), then grades pending creative_assets.
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Wave 4A — Signal Lake + Growth Score</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <Button size="sm" variant="outline" onClick={() => runWave4(true)} disabled={loading}>Dry-run</Button>
            <Button size="sm" onClick={() => runWave4(false)} disabled={loading}>Collect signals + score</Button>
            <span className="text-xs text-muted-foreground ml-2">
              Aggregates Pinterest/GSC/GA4/CJ/CPE/Cinematic into agp_signals_daily, computes 13 subscores and per-product priority tiers.
            </span>
          </div>
          {growth && (
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2 text-xs">
              <div className="col-span-2 md:col-span-1 bg-primary/10 rounded p-2">
                <div className="text-muted-foreground">Overall</div>
                <div className="text-2xl font-bold">{Number(growth.overall).toFixed(1)}</div>
                <div className="text-[10px] text-muted-foreground">Δ7d {Number(growth.delta_7d ?? 0).toFixed(1)}</div>
              </div>
              {(["seo","pinterest","media","creative","conversion","performance","product_quality","catalog_health","traffic","revenue","automation","ai_efficiency","trend_direction"] as const).map(k => (
                <div key={k} className="bg-muted/40 rounded p-2">
                  <div className="text-muted-foreground">{k}</div>
                  <div className="text-base font-semibold">{Number((growth as any)[k] ?? 0).toFixed(0)}</div>
                </div>
              ))}
            </div>
          )}
          {Object.keys(tierCounts).length > 0 && (
            <div className="flex gap-2 flex-wrap text-xs">
              {(["S","A","B","C","D"] as const).map(t => (
                <Badge key={t} variant={t==="S"?"default":t==="D"?"destructive":"secondary"}>Tier {t}: {tierCounts[t] ?? 0}</Badge>
              ))}
            </div>
          )}
          {topProducts.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">Top 20 products by health</summary>
              <table className="w-full mt-2">
                <thead><tr className="text-left"><th>Product</th><th>Score</th><th>Tier</th><th>Recommended</th></tr></thead>
                <tbody>{topProducts.map(p => (
                  <tr key={p.product_id} className="border-t">
                    <td className="py-1 font-mono text-[10px]">{p.product_id.slice(0,8)}</td>
                    <td>{Number(p.overall).toFixed(1)}</td>
                    <td>{p.priority_tier}</td>
                    <td className="text-[10px]">{(p.recommended_actions ?? []).slice(0,3).join(", ")}</td>
                  </tr>
                ))}</tbody>
              </table>
            </details>
          )}
        </CardContent>
      </Card>

      {settings?.kill_switch && (
        <div className="border-2 border-destructive bg-destructive/10 text-destructive p-3 rounded font-semibold">
          KILL SWITCH ACTIVE — all autonomous engines paused.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Growth score</CardTitle></CardHeader><CardContent className="text-2xl">{overview.growth_score ?? 0}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">AI spend (24h)</CardTitle></CardHeader><CardContent className="text-2xl">${cost24h.toFixed(2)}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">CPE pending</CardTitle></CardHeader><CardContent className="text-2xl">{overview.cpe_pending ?? 0}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Pinterest queue</CardTitle></CardHeader><CardContent className="text-2xl">{overview.pinterest_ready ?? 0}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Cinematic active</CardTitle></CardHeader><CardContent className="text-2xl">{overview.cinematic_active ?? 0}</CardContent></Card>
      </div>

      <Tabs defaultValue="settings">
        <TabsList>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="runs">Recent runs</TabsTrigger>
          <TabsTrigger value="issues">Issues ({steps.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="settings">
          {settings && (
            <Card><CardHeader><CardTitle>Engine controls</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {(["kill_switch", "auto_enhance", "auto_lifestyle", "auto_video", "auto_publish", "auto_repair"] as const).map((k) => (
                  <div key={k} className="flex items-center justify-between border-b py-2">
                    <span className="text-sm">{k}</span>
                    <Button size="sm" variant={settings[k] ? "default" : "outline"} disabled={loading} onClick={() => toggle(k)}>
                      {settings[k] ? "ON" : "off"}
                    </Button>
                  </div>
                ))}
                <div className="text-xs text-muted-foreground pt-2">
                  Daily budget cap: ${settings.daily_budget_usd} · Engine budgets: {JSON.stringify(settings.engine_budgets)}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="runs">
          <Card><CardContent className="pt-4">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground"><th>Started</th><th>Engine</th><th>Status</th><th>Counts</th><th>Cost</th></tr></thead>
              <tbody>{runs.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="py-1">{new Date(r.started_at).toLocaleString()}</td>
                  <td>{r.engine}</td>
                  <td><Badge variant={r.status === "succeeded" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>{r.status}{r.dry_run ? " (dry)" : ""}</Badge></td>
                  <td className="text-xs"><code>{JSON.stringify(r.counts)}</code></td>
                  <td>${Number(r.ai_cost_usd ?? 0).toFixed(2)}</td>
                </tr>))}
                {runs.length === 0 && <tr><td colSpan={5} className="text-muted-foreground py-4">No runs yet.</td></tr>}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="issues">
          <Card><CardContent className="pt-4 space-y-1">
            {steps.map((s) => (
              <div key={s.id} className="text-sm border-b py-1 flex gap-2">
                <Badge variant={s.severity === "critical" || s.severity === "error" ? "destructive" : "secondary"}>{s.severity}</Badge>
                <span className="text-muted-foreground">{s.engine}/{s.step_key}</span>
                <span className="flex-1 truncate">{s.message}</span>
                <span className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString()}</span>
              </div>
            ))}
            {steps.length === 0 && <div className="text-muted-foreground text-sm">No outstanding issues.</div>}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}