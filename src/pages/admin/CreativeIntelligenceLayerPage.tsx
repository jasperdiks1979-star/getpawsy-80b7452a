import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Run = {
  id: string; trigger: string | null; scope: string | null;
  total_rows: number; passed: number; rewritten: number; rejected: number;
  avg_score: number | null; started_at: string; finished_at: string | null;
  status: string; notes: any;
};
type ScoreRow = {
  id: string; product_slug: string | null; headline: string | null;
  family: string | null; emotion: string | null; angle: string | null;
  overall_score: number; spam_score: number; trust_score: number;
  seo_score: number; novelty_score: number; ctr_prediction: number;
  save_prediction: number; outbound_prediction: number;
  recommendation_probability: number; duplicate_similarity: number;
  rejected: boolean; reject_reasons: string[] | null;
  banned_phrases: string[] | null; rewrite_applied: boolean;
  created_at: string;
};

export default function CreativeIntelligenceLayerPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [banned, setBanned] = useState<{ phrase: string; category: string; hits: number }[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const [r, s, b] = await Promise.all([
      supabase.from("pcie2_ci_runs").select("*").order("started_at", { ascending: false }).limit(20),
      supabase.from("pcie2_ci_scores").select("*").order("created_at", { ascending: false }).limit(300),
      supabase.from("pcie2_ci_banned_phrases").select("phrase,category,hits").order("hits", { ascending: false }),
    ]);
    setRuns((r.data as Run[]) ?? []);
    setScores((s.data as ScoreRow[]) ?? []);
    setBanned((b.data as any[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function runEngine(dryRun: boolean) {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("pcie2-creative-intelligence", {
      body: { action: "rescore_ready", dry_run: dryRun, trigger: "manual_ui", limit: 200 },
    });
    if (error) toast.error(error.message);
    else toast.success(`Run: ${JSON.stringify((data as any)?.totals ?? {})}`);
    await load();
    setLoading(false);
  }

  // Aggregate panels
  const recent = scores.slice(0, 100);
  const passed = recent.filter(s => !s.rejected);
  const avgCtr = passed.length ? Math.round(passed.reduce((a,s)=>a+s.ctr_prediction,0)/passed.length) : 0;
  const avgSave = passed.length ? Math.round(passed.reduce((a,s)=>a+s.save_prediction,0)/passed.length) : 0;
  const avgOut = passed.length ? Math.round(passed.reduce((a,s)=>a+s.outbound_prediction,0)/passed.length) : 0;
  const avgEng = passed.length ? Math.round(passed.reduce((a,s)=>a+s.recommendation_probability,0)/passed.length) : 0;

  const familyCounts: Record<string, { n: number; avg: number }> = {};
  for (const s of recent) {
    const k = s.family ?? "unknown";
    familyCounts[k] ??= { n: 0, avg: 0 };
    familyCounts[k].n += 1;
    familyCounts[k].avg += s.overall_score;
  }
  const families = Object.entries(familyCounts)
    .map(([k,v]) => ({ family: k, count: v.n, avg: Math.round(v.avg / Math.max(1,v.n)) }))
    .sort((a,b) => b.avg - a.avg);

  const rejectedPhrases: Record<string, number> = {};
  for (const s of recent) {
    for (const p of s.banned_phrases ?? []) rejectedPhrases[p] = (rejectedPhrases[p] ?? 0) + 1;
  }

  // Duplicate heatmap: count of high-similarity rows
  const dupBuckets = { "0-20":0, "20-40":0, "40-60":0, "60-80":0, "80-100":0 };
  for (const s of recent) {
    const v = s.duplicate_similarity;
    if (v < 20) dupBuckets["0-20"]++; else if (v < 40) dupBuckets["20-40"]++;
    else if (v < 60) dupBuckets["40-60"]++; else if (v < 80) dupBuckets["60-80"]++;
    else dupBuckets["80-100"]++;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Creative Intelligence Layer (CI v1)</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => runEngine(true)} disabled={loading}>Dry-run</Button>
          <Button onClick={() => runEngine(false)} disabled={loading}>Rescore Ready Queue</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardHeader><CardTitle className="text-sm">Predicted CTR</CardTitle></CardHeader><CardContent><div className="text-3xl">{avgCtr}</div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Predicted Saves</CardTitle></CardHeader><CardContent><div className="text-3xl">{avgSave}</div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Predicted Outbound</CardTitle></CardHeader><CardContent><div className="text-3xl">{avgOut}</div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Engagement Index</CardTitle></CardHeader><CardContent><div className="text-3xl">{avgEng}</div></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Top Headline Families</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead><tr className="text-left"><th>Family</th><th>Count</th><th>Avg Score</th></tr></thead>
              <tbody>{families.map(f => (
                <tr key={f.family} className="border-t"><td>{f.family}</td><td>{f.count}</td><td>{f.avg}</td></tr>
              ))}</tbody>
            </table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Duplicate Similarity Heatmap</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(dupBuckets).map(([k,v]) => (
                <div key={k} className="flex items-center gap-3 text-sm">
                  <div className="w-16">{k}</div>
                  <div className="flex-1 bg-muted h-3 rounded">
                    <div className="bg-primary h-3 rounded" style={{ width: `${Math.min(100, v * 5)}%` }} />
                  </div>
                  <div className="w-10 text-right">{v}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Rejected Phrases (current batch)</CardTitle></CardHeader>
        <CardContent>
          {Object.keys(rejectedPhrases).length === 0
            ? <div className="text-sm text-muted-foreground">No banned phrases in the last 100 scored rows.</div>
            : <div className="flex flex-wrap gap-2">
                {Object.entries(rejectedPhrases).sort((a,b)=>b[1]-a[1]).map(([p,n]) =>
                  <Badge key={p} variant="destructive">{p} × {n}</Badge>)}
              </div>}
          <div className="mt-4 text-xs text-muted-foreground">
            Library: {banned.length} banned phrases active.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent Runs</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead><tr className="text-left"><th>Started</th><th>Status</th><th>Total</th><th>Passed</th><th>Rewritten</th><th>Rejected</th><th>Avg</th></tr></thead>
            <tbody>{runs.map(r => (
              <tr key={r.id} className="border-t">
                <td>{new Date(r.started_at).toLocaleString()}</td>
                <td><Badge variant={r.status === "completed" ? "default" : "secondary"}>{r.status}{r.notes?.dry_run ? " (dry)" : ""}</Badge></td>
                <td>{r.total_rows}</td><td>{r.passed}</td><td>{r.rewritten}</td><td>{r.rejected}</td>
                <td>{r.avg_score ? Number(r.avg_score).toFixed(1) : "-"}</td>
              </tr>))}</tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent Scored Creatives</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-left">
                <th>Headline</th><th>Family</th><th>Score</th><th>Spam</th><th>Trust</th><th>Novelty</th><th>Dup</th><th>State</th>
              </tr></thead>
              <tbody>{recent.slice(0, 50).map(s => (
                <tr key={s.id} className="border-t">
                  <td className="max-w-xs truncate" title={s.headline ?? ""}>{s.headline}</td>
                  <td>{s.family}</td>
                  <td>{s.overall_score}</td>
                  <td>{s.spam_score}</td>
                  <td>{s.trust_score}</td>
                  <td>{s.novelty_score}</td>
                  <td>{s.duplicate_similarity}</td>
                  <td>
                    {s.rejected
                      ? <Badge variant="destructive">rejected</Badge>
                      : s.rewrite_applied ? <Badge>rewritten</Badge> : <Badge variant="secondary">pass</Badge>}
                  </td>
                </tr>))}</tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}