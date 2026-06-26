import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Row = Record<string, unknown>;

const ENGINES = [
  "acos-revenue-brain",
  "acos-score-engine",
  "acos-winner-detect",
  "acos-loser-detect",
  "acos-diversity-engine",
  "acos-ads-ai",
  "acos-creative-families",
  "acos-creative-fatigue",
  "acos-pin-seo-ai",
  "acos-board-intelligence",
  "acos-landing-ai",
  "acos-trend-discovery",
  "acos-predictive",
  "acos-self-learning",
  "acos-executive-report",
];

export default function CommandCenter2Page() {
  const [scores, setScores] = useState<Row[]>([]);
  const [winners, setWinners] = useState<Row[]>([]);
  const [losers, setLosers] = useState<Row[]>([]);
  const [predictions, setPredictions] = useState<Row[]>([]);
  const [decisions, setDecisions] = useState<Row[]>([]);
  const [runs, setRuns] = useState<Row[]>([]);
  const [settings, setSettings] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string>("");

  async function load() {
    const [s, w, l, p, d, r, st] = await Promise.all([
      supabase.from("acos_product_scores").select("product_id, score, category, computed_at").order("score", { ascending: false }).limit(20),
      supabase.from("acos_winner_signals").select("product_id, signal_type, metric_value, rank, detected_at").order("detected_at", { ascending: false }).limit(30),
      supabase.from("acos_loser_signals").select("product_id, signal_type, recommendation, detected_at").order("detected_at", { ascending: false }).limit(30),
      supabase.from("acos_predictions").select("scope, scope_ref, metric, horizon, point, lo, hi, confidence, computed_at").order("computed_at", { ascending: false }).limit(30),
      supabase.from("acos_decisions").select("engine, action, reason, status, observed_only, created_at").order("created_at", { ascending: false }).limit(30),
      supabase.from("acos_orchestrator_runs").select("cadence, status, started_at, finished_at, duration_ms").order("started_at", { ascending: false }).limit(10),
      supabase.from("acos_settings").select("key, value").order("key"),
    ]);
    setScores(s.data ?? []);
    setWinners(w.data ?? []);
    setLosers(l.data ?? []);
    setPredictions(p.data ?? []);
    setDecisions(d.data ?? []);
    setRuns(r.data ?? []);
    setSettings(st.data ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function run(fn: string) {
    setBusy(fn);
    try {
      const { data, error } = await supabase.functions.invoke(fn, { body: {} });
      if (error) throw error;
      toast.success(`${fn} ok`);
      console.log(fn, data);
      await load();
    } catch (e) {
      toast.error(`${fn} failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function runOrchestrator(cadence: "hourly" | "nightly") {
    setBusy(`orchestrator:${cadence}`);
    try {
      const { data, error } = await supabase.functions.invoke(`acos-orchestrator?cadence=${cadence}`, { body: {} });
      if (error) throw error;
      toast.success(`Orchestrator (${cadence}) ok`);
      console.log("orchestrator", data);
      await load();
    } catch (e) {
      toast.error(`Orchestrator failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function ask() {
    if (!question.trim()) return;
    setBusy("commander-ai");
    setAnswer("…");
    try {
      const { data, error } = await supabase.functions.invoke("acos-commander-ai", { body: { question } });
      if (error) throw error;
      setAnswer((data as { answer?: string })?.answer ?? "(no answer)");
    } catch (e) {
      setAnswer(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  const emergencyStop = (settings.find((s) => s.key === "emergency_stop")?.value as unknown) === true;
  const flags = (settings.find((s) => s.key === "feature_flags")?.value as Record<string, boolean>) ?? {};

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Command Center 2.0</h1>
          <p className="text-sm text-muted-foreground">Autonomous Commerce OS — observation mode</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {emergencyStop && <Badge variant="destructive">EMERGENCY STOP</Badge>}
          <Button disabled={!!busy} onClick={() => runOrchestrator("hourly")}>Run Hourly Loop</Button>
          <Button disabled={!!busy} variant="secondary" onClick={() => runOrchestrator("nightly")}>Run Nightly Loop</Button>
        </div>
      </header>

      <Card>
        <CardHeader><CardTitle>Engines</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {ENGINES.map((fn) => {
            const key = fn.replace("acos-", "").replace(/-/g, "_");
            const enabled = flags[key];
            return (
              <Button key={fn} size="sm" variant="outline" disabled={busy === fn} onClick={() => run(fn)}>
                {fn.replace("acos-", "")} {enabled ? <Badge variant="default" className="ml-2">on</Badge> : <Badge variant="secondary" className="ml-2">obs</Badge>}
              </Button>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Commander AI</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input placeholder="Ask: What should I improve today?" value={question} onChange={(e) => setQuestion(e.target.value)} />
              <Button onClick={ask} disabled={busy === "commander-ai"}>Ask</Button>
            </div>
            <pre className="text-xs whitespace-pre-wrap bg-muted/30 rounded p-3 max-h-72 overflow-auto">{answer || "Ask a question to get a grounded recommendation."}</pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Top Products (Score)</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {scores.length === 0 ? <p className="text-muted-foreground">No scores yet. Run the Score Engine.</p> : (
              <ul className="space-y-1">
                {scores.map((r, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="truncate font-mono text-xs">{String(r.product_id).slice(0,8)}…</span>
                    <span>{Number(r.score).toFixed(1)}</span>
                    <Badge variant="outline">{String(r.category)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Winners (latest)</CardTitle></CardHeader>
          <CardContent className="text-sm max-h-72 overflow-auto">
            {winners.length === 0 ? <p className="text-muted-foreground">No winners detected yet.</p> :
              <ul className="space-y-1">
                {winners.map((r, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="font-mono text-xs">{String(r.product_id).slice(0,8)}…</span>
                    <span>{String(r.signal_type)}</span>
                    <span className="text-muted-foreground">{Number(r.metric_value).toFixed(3)}</span>
                  </li>
                ))}
              </ul>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Losers (latest)</CardTitle></CardHeader>
          <CardContent className="text-sm max-h-72 overflow-auto">
            {losers.length === 0 ? <p className="text-muted-foreground">No loser signals yet.</p> :
              <ul className="space-y-1">
                {losers.map((r, i) => (
                  <li key={i} className="space-y-0.5">
                    <div className="flex justify-between gap-2">
                      <span className="font-mono text-xs">{String(r.product_id).slice(0,8)}…</span>
                      <Badge variant="destructive">{String(r.signal_type)}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">{String(r.recommendation ?? "")}</div>
                  </li>
                ))}
              </ul>}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader><CardTitle>Predictions (platform revenue)</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {predictions.filter((p) => p.scope === "platform").length === 0 ? <p className="text-muted-foreground">No predictions yet. Run Predictive.</p> :
              <div className="grid grid-cols-3 gap-3">
                {predictions.filter((p) => p.scope === "platform").slice(0, 3).map((p, i) => (
                  <div key={i} className="rounded border p-3">
                    <div className="text-xs text-muted-foreground">{String(p.horizon)} {String(p.metric)}</div>
                    <div className="text-xl font-semibold">{Number(p.point).toFixed(0)}</div>
                    <div className="text-xs text-muted-foreground">{Number(p.lo).toFixed(0)} – {Number(p.hi).toFixed(0)}</div>
                  </div>
                ))}
              </div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Decision Log</CardTitle></CardHeader>
          <CardContent className="text-xs max-h-72 overflow-auto">
            {decisions.length === 0 ? <p className="text-muted-foreground">No decisions yet.</p> :
              <ul className="space-y-1">
                {decisions.map((r, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span>{String(r.engine)}</span>
                    <span>{String(r.action)}</span>
                    <Badge variant={r.observed_only ? "secondary" : "default"}>{r.observed_only ? "obs" : "act"}</Badge>
                    <span className="text-muted-foreground">{new Date(String(r.created_at)).toLocaleString()}</span>
                  </li>
                ))}
              </ul>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Orchestrator Runs</CardTitle></CardHeader>
          <CardContent className="text-xs max-h-72 overflow-auto">
            {runs.length === 0 ? <p className="text-muted-foreground">No runs yet.</p> :
              <ul className="space-y-1">
                {runs.map((r, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <Badge variant="outline">{String(r.cadence)}</Badge>
                    <Badge variant={r.status === "ok" ? "default" : "destructive"}>{String(r.status)}</Badge>
                    <span>{r.duration_ms != null ? `${Number(r.duration_ms)}ms` : "—"}</span>
                    <span className="text-muted-foreground">{new Date(String(r.started_at)).toLocaleString()}</span>
                  </li>
                ))}
              </ul>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Legacy Dashboards</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Phase 2 is additive. All existing dashboards remain available: Commander, Growth, Traffic, Pinterest Control Center, Evolution Engine Phase 1 & 2, Revenue, Guardian, CI Layer.
        </CardContent>
      </Card>
    </div>
  );
}