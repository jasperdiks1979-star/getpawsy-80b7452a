// GENESIS Ω — Autonomous CEO console
// Aggregates ai_ceo_* evidence + Omega executive board syntheses into one screen.
// Admin can trigger the loop and the executive board on demand.
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { Brain, Loader2, RefreshCw, TrendingUp, ShieldAlert } from "lucide-react";

interface Daily {
  report_date: string;
  summary: string | null;
  top_10: any[];
  executive_score: Record<string, any>;
  mission_status: Record<string, any>;
  forecast: Record<string, any>;
}
interface Rec {
  rank: number; title: string; category: string; reason: string;
  expected_revenue_cents: number; confidence: number; risk: number; roi_score: number; status: string;
}
interface Synth {
  id: string; created_at: string; synthesis: string; disagreements: string[]; overall_score: number;
  ceo_view: any; cfo_view: any; coo_view: any; cto_view: any; cmo_view: any;
}

const money = (c: number) => `$${(c / 100).toFixed(0)}`;

function ViewCard({ label, view }: { label: string; view: any }) {
  if (!view || Object.keys(view).length === 0) return null;
  return (
    <div className="border rounded-md p-3 text-sm space-y-1">
      <div className="font-semibold">{label}</div>
      {view.verdict && <div className="text-muted-foreground">{String(view.verdict)}</div>}
      {Array.isArray(view.top_priorities) && (
        <ol className="list-decimal pl-5 text-xs mt-1">
          {view.top_priorities.map((p: string, i: number) => <li key={i}>{p}</li>)}
        </ol>
      )}
      {view.biggest_risk && (
        <div className="text-xs text-red-600 mt-1 flex gap-1 items-start">
          <ShieldAlert className="h-3 w-3 mt-0.5 shrink-0" /> {String(view.biggest_risk)}
        </div>
      )}
      {typeof view.confidence === "number" && (
        <div className="text-[10px] text-muted-foreground">confidence {(view.confidence * 100).toFixed(0)}%</div>
      )}
    </div>
  );
}

export default function GenesisOmegaPage() {
  const [daily, setDaily] = useState<Daily | null>(null);
  const [recs, setRecs] = useState<Rec[]>([]);
  const [synths, setSynths] = useState<Synth[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | "loop" | "board">(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [d, r, s] = await Promise.all([
      supabase.from("ai_ceo_daily_reports").select("*").order("report_date", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("ai_ceo_recommendations").select("rank,title,category,reason,expected_revenue_cents,confidence,risk,roi_score,status").order("roi_score", { ascending: false }).limit(10),
      supabase.from("genesis_omega_syntheses" as any).select("*").order("created_at", { ascending: false }).limit(5),
    ]);
    setDaily((d.data as any) ?? null);
    setRecs((r.data as any) ?? []);
    setSynths((s.data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const runFn = async (name: "ai-ceo-loop" | "genesis-omega-board") => {
    setBusy(name === "ai-ceo-loop" ? "loop" : "board");
    setErr(null);
    try {
      const { data, error } = await supabase.functions.invoke(name, { body: {} });
      if (error) throw error;
      if ((data as any)?.ok === false) throw new Error((data as any).error);
      await load();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(null);
    }
  };

  const latest = synths[0];

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <header className="space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <Brain className="h-7 w-7" />
          <h1 className="text-3xl font-bold">Genesis Ω — Autonomous CEO</h1>
          <Badge variant="destructive">PERMANENT EXECUTIVE GOVERNANCE</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Executive intelligence layer above every Genesis module. Reads existing evidence, runs a five-role
          executive board, and archives the synthesis. Read-only against production — repairs execute in their
          owning modules under the Genesis V0 Revenue Constitution.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
          </Button>
          <Button size="sm" onClick={() => runFn("ai-ceo-loop")} disabled={!!busy}>
            {busy === "loop" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <TrendingUp className="h-3 w-3 mr-1" />}
            Run daily CEO loop
          </Button>
          <Button size="sm" onClick={() => runFn("genesis-omega-board")} disabled={!!busy}>
            {busy === "board" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Brain className="h-3 w-3 mr-1" />}
            Convene executive board
          </Button>
        </div>
        {err && <div className="text-sm text-red-600">{err}</div>}
      </header>

      {loading ? (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : (
        <>
          {/* Latest daily CEO report */}
          <Card>
            <CardHeader><CardTitle className="text-base">Latest CEO Daily Report</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              {daily ? (
                <>
                  <div className="text-xs text-muted-foreground">for {daily.report_date}</div>
                  <div className="whitespace-pre-wrap">{daily.summary ?? "(no summary)"}</div>
                  {daily.executive_score && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                      {Object.entries(daily.executive_score).map(([k, v]) => (
                        <div key={k} className="border rounded p-2">
                          <div className="text-[10px] uppercase text-muted-foreground">{k}</div>
                          <div className="font-semibold">{typeof v === "object" ? JSON.stringify(v) : String(v)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-muted-foreground">No daily report yet — run the CEO loop.</div>
              )}
            </CardContent>
          </Card>

          {/* Executive board synthesis */}
          <Card>
            <CardHeader><CardTitle className="text-base">Executive Board — Latest Synthesis</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm">
              {latest ? (
                <>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">Score {Math.round(latest.overall_score)}/100</Badge>
                    <span className="text-xs text-muted-foreground">{new Date(latest.created_at).toLocaleString()}</span>
                  </div>
                  <div className="whitespace-pre-wrap">{latest.synthesis || "(no synthesis text)"}</div>
                  {latest.disagreements?.length > 0 && (
                    <div>
                      <div className="font-semibold mt-2 mb-1">Disagreements</div>
                      <ul className="list-disc pl-5 text-xs">
                        {latest.disagreements.map((d, i) => <li key={i}>{d}</li>)}
                      </ul>
                    </div>
                  )}
                  <Separator />
                  <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-5">
                    <ViewCard label="Digital CEO" view={latest.ceo_view} />
                    <ViewCard label="Digital CFO" view={latest.cfo_view} />
                    <ViewCard label="Digital COO" view={latest.coo_view} />
                    <ViewCard label="Digital CTO" view={latest.cto_view} />
                    <ViewCard label="Digital CMO" view={latest.cmo_view} />
                  </div>
                </>
              ) : (
                <div className="text-muted-foreground">No executive synthesis yet — convene the board.</div>
              )}
            </CardContent>
          </Card>

          {/* Ranked recommendations */}
          <Card>
            <CardHeader><CardTitle className="text-base">Top ROI Recommendations (from ai_ceo_recommendations)</CardTitle></CardHeader>
            <CardContent>
              {recs.length === 0 ? (
                <div className="text-sm text-muted-foreground">No recommendations recorded yet.</div>
              ) : (
                <ol className="space-y-2 text-sm">
                  {recs.map((r) => (
                    <li key={`${r.rank}-${r.title}`} className="border rounded p-2 flex gap-3 items-start">
                      <div className="font-mono text-xs w-6 shrink-0">{r.rank}</div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">{r.title}</div>
                        <div className="text-xs text-muted-foreground">{r.category} · {r.reason}</div>
                        <div className="text-[10px] mt-1">
                          ROI {Number(r.roi_score).toFixed(2)} · Conf {(Number(r.confidence) * 100).toFixed(0)}% · Risk {(Number(r.risk) * 100).toFixed(0)}% · est {money(r.expected_revenue_cents)}
                        </div>
                      </div>
                      <Badge variant="outline">{r.status}</Badge>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          {/* History */}
          <Card>
            <CardHeader><CardTitle className="text-base">Executive Diary — recent syntheses</CardTitle></CardHeader>
            <CardContent>
              <ul className="text-sm space-y-1">
                {synths.map((s) => (
                  <li key={s.id} className="border-b py-1 flex justify-between gap-2">
                    <span className="truncate">{s.synthesis?.slice(0, 120) || "(empty)"}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{new Date(s.created_at).toLocaleDateString()} · {Math.round(s.overall_score)}/100</span>
                  </li>
                ))}
                {synths.length === 0 && <li className="text-muted-foreground">Empty diary.</li>}
              </ul>
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Final Law</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          The ultimate KPI is sustainable verified profit created through exceptional customer experience.
          Every automation is reversible, every recommendation is evidence-backed, every report is archived.
        </CardContent>
      </Card>
    </div>
  );
}