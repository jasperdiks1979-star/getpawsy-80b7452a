import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Run = {
  id: string; started_at: string; finished_at: string | null; status: string;
  trigger: string | null; phases_run: any; counts: any; ai_cost_usd: number; dry_run: boolean;
};
type Settings = {
  auto_enhance: boolean; auto_lifestyle: boolean; auto_video: boolean; auto_publish: boolean;
  daily_ai_budget_usd: number; max_lifestyle_per_product: number; max_pinterest_per_product: number;
};

export default function CreativeIntelligencePage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [queueCounts, setQueueCounts] = useState<Record<string, number>>({});
  const [weights, setWeights] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const [r, s, w] = await Promise.all([
      supabase.from("cpe_pipeline_runs").select("*").order("started_at", { ascending: false }).limit(20),
      supabase.from("cpe_settings").select("*").eq("id", 1).maybeSingle(),
      supabase.from("cpe_performance_weights").select("*").order("weight", { ascending: false }).limit(20),
    ]);
    setRuns((r.data as Run[]) ?? []);
    setSettings((s.data as Settings) ?? null);
    setWeights(w.data ?? []);
    const { data: jobs } = await supabase.from("cpe_creative_jobs").select("kind,status");
    const counts: Record<string, number> = {};
    (jobs ?? []).forEach((j: any) => { const k = `${j.kind}:${j.status}`; counts[k] = (counts[k] ?? 0) + 1; });
    setQueueCounts(counts);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function runOrchestrator(dry: boolean) {
    const { data, error } = await supabase.functions.invoke("cpe-orchestrator", { body: { dry_run: dry, trigger: "manual_ui" } });
    if (error) toast.error(error.message);
    else { toast.success(`${dry ? "Dry-run" : "Run"} completed: ${JSON.stringify((data as any)?.counts ?? {})}`); load(); }
  }

  async function updateSettings(patch: Partial<Settings>) {
    const { error } = await supabase.from("cpe_settings").update(patch).eq("id", 1);
    if (error) toast.error(error.message); else { toast.success("Settings saved"); load(); }
  }

  const spentToday = runs
    .filter((r) => new Date(r.started_at).getTime() > Date.now() - 86_400_000)
    .reduce((a, r) => a + Number(r.ai_cost_usd ?? 0), 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Creative Intelligence (CPE v1)</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => runOrchestrator(true)} disabled={loading}>Dry-run</Button>
          <Button onClick={() => runOrchestrator(false)} disabled={loading}>Run orchestrator</Button>
        </div>
      </div>

      <Tabs defaultValue="pipeline">
        <TabsList>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="learning">Learning</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline" className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Card><CardHeader><CardTitle>AI spend (24h)</CardTitle></CardHeader>
              <CardContent><div className="text-3xl">${spentToday.toFixed(2)}</div>
                <div className="text-sm text-muted-foreground">Cap: ${settings?.daily_ai_budget_usd ?? 10}</div></CardContent></Card>
            <Card><CardHeader><CardTitle>Queue depth</CardTitle></CardHeader>
              <CardContent><div className="text-sm space-y-1">{Object.entries(queueCounts).map(([k, v]) =>
                <div key={k} className="flex justify-between"><span>{k}</span><Badge>{v}</Badge></div>)}</div></CardContent></Card>
            <Card><CardHeader><CardTitle>Auto modes</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1">
                <div>Enhance: {settings?.auto_enhance ? "ON" : "off"}</div>
                <div>Lifestyle: {settings?.auto_lifestyle ? "ON" : "off"}</div>
                <div>Video: {settings?.auto_video ? "ON" : "off"}</div>
                <div>Publish: {settings?.auto_publish ? "ON" : "off"}</div>
              </CardContent></Card>
          </div>
          <Card><CardHeader><CardTitle>Recent runs</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead><tr className="text-left"><th>Started</th><th>Status</th><th>Phases</th><th>Counts</th><th>Cost</th></tr></thead>
                <tbody>{runs.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td>{new Date(r.started_at).toLocaleString()}</td>
                    <td><Badge variant={r.status === "succeeded" ? "default" : "destructive"}>{r.status}{r.dry_run ? " (dry)" : ""}</Badge></td>
                    <td className="text-xs">{Array.isArray(r.phases_run) ? r.phases_run.join(", ") : ""}</td>
                    <td className="text-xs"><pre className="text-xs">{JSON.stringify(r.counts)}</pre></td>
                    <td>${Number(r.ai_cost_usd ?? 0).toFixed(2)}</td>
                  </tr>))}</tbody>
              </table>
            </CardContent></Card>
        </TabsContent>

        <TabsContent value="learning">
          <Card><CardHeader><CardTitle>Top winner DNA</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead><tr><th>Dim</th><th>Value</th><th>Weight</th><th>N</th><th>Win rate</th></tr></thead>
                <tbody>{weights.map((w: any) => (
                  <tr key={w.id} className="border-t">
                    <td>{w.dimension}</td><td className="truncate max-w-xs">{w.value}</td>
                    <td>{Number(w.weight).toFixed(2)}</td><td>{w.sample_n}</td>
                    <td>{w.win_rate ? `${Math.round(w.win_rate * 100)}%` : "-"}</td>
                  </tr>))}</tbody>
              </table>
            </CardContent></Card>
        </TabsContent>

        <TabsContent value="settings">
          {settings && (
            <Card><CardHeader><CardTitle>Engine settings</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {(["auto_enhance", "auto_lifestyle", "auto_video", "auto_publish"] as const).map((k) => (
                  <div key={k} className="flex items-center justify-between">
                    <span>{k}</span>
                    <Button size="sm" variant={settings[k] ? "default" : "outline"}
                      onClick={() => updateSettings({ [k]: !settings[k] } as any)}>
                      {settings[k] ? "ON" : "off"}
                    </Button>
                  </div>
                ))}
                <div className="flex items-center justify-between">
                  <span>Daily AI budget (USD)</span>
                  <input type="number" step="1" defaultValue={settings.daily_ai_budget_usd} className="border rounded px-2 py-1 w-24"
                    onBlur={(e) => updateSettings({ daily_ai_budget_usd: Number(e.target.value) })} />
                </div>
              </CardContent></Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}