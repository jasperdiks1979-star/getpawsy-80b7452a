import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, RefreshCw, Sparkles, TrendingUp, AlertTriangle, Shield, Activity } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type QueueRow = {
  id: string;
  source_kind: string;
  source_ref: string | null;
  category: string;
  title: string;
  summary: string;
  recommended_action: string;
  expected_revenue_impact: number;
  confidence: number;
  difficulty: number;
  traffic_size: number;
  priority_score: number;
  status: string;
  evidence: Record<string, unknown>;
  generated_at: string;
};

type Snapshot = {
  id: string;
  snapshot_date: string;
  window_days: number;
  revenue_health: any;
  traffic_quality: any;
  winners: any[];
  losers: any[];
  top_sources: any[];
  anomalies: any[];
  ai_summary: string | null;
  generated_at: string;
};

const CATEGORY_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  winner: "default",
  loser: "destructive",
  traffic: "secondary",
  creative: "outline",
  seo: "outline",
  anomaly: "destructive",
  merchandising: "secondary",
};

export default function AiExecutivePage() {
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  async function refresh() {
    setLoading(true);
    try {
      const [q, s] = await Promise.all([
        supabase
          .from("ai_priority_queue" as any)
          .select("*")
          .eq("status", "pending")
          .order("priority_score", { ascending: false })
          .limit(100),
        supabase
          .from("ai_executive_snapshots" as any)
          .select("*")
          .order("generated_at", { ascending: false })
          .limit(1),
      ]);
      setQueue(((q.data as unknown) as QueueRow[]) ?? []);
      const snaps = ((s.data as unknown) as Snapshot[]) ?? [];
      setSnapshot(snaps[0] ?? null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function callEngine(action: "rebuild_queue" | "snapshot", body: Record<string, unknown> = {}) {
    setBusy(action);
    try {
      const { data, error } = await supabase.functions.invoke("ai-priority-engine", {
        body: { action, ...body },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: action === "snapshot" ? "Snapshot generated" : "Queue rebuilt", description: JSON.stringify(data).slice(0, 140) });
      await refresh();
    } catch (e: any) {
      const msg = e?.message || "Engine error";
      const variant = /rate limit|429/i.test(msg) ? "default" : "destructive";
      toast({ title: "Engine error", description: msg, variant });
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(id: string, status: string, snooze_until?: string) {
    try {
      const { error } = await supabase.functions.invoke("ai-priority-engine", {
        body: { action: "update_status", id, status, snooze_until },
      });
      if (error) throw error;
      setQueue((prev) => prev.filter((r) => r.id !== id));
    } catch (e: any) {
      toast({ title: "Update failed", description: e?.message ?? "", variant: "destructive" });
    }
  }

  const filtered = useMemo(() => {
    if (categoryFilter === "all") return queue;
    return queue.filter((q) => q.category === categoryFilter);
  }, [queue, categoryFilter]);

  const categories = useMemo(() => {
    const set = new Set(queue.map((q) => q.category));
    return ["all", ...Array.from(set)];
  }, [queue]);

  const totalImpact = queue.reduce((s, q) => s + Number(q.expected_revenue_impact || 0), 0);

  return (
    <>
      <Helmet>
        <title>AI Executive Dashboard | GetPawsy Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="space-y-6 p-4 md:p-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              AI Executive Dashboard
            </h1>
            <p className="text-sm text-muted-foreground">
              Unified revenue intelligence — winners, losers, traffic health, and prioritized actions.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button size="sm" onClick={() => callEngine("rebuild_queue")} disabled={busy !== null}>
              {busy === "rebuild_queue" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Activity className="h-4 w-4 mr-1" />}
              Rebuild Queue
            </Button>
            <Button size="sm" variant="secondary" onClick={() => callEngine("snapshot", { window_days: 7 })} disabled={busy !== null}>
              {busy === "snapshot" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
              Generate Snapshot
            </Button>
          </div>
        </header>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Pending actions</div>
            <div className="text-2xl font-bold">{queue.length}</div>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Est. revenue impact (30d)</div>
            <div className="text-2xl font-bold">${Math.round(totalImpact).toLocaleString()}</div>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Real-human traffic</div>
            <div className="text-2xl font-bold">{snapshot?.revenue_health?.real_human_pct ?? "—"}%</div>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Sessions (7d)</div>
            <div className="text-2xl font-bold">{snapshot?.revenue_health?.total_sessions ?? "—"}</div>
          </CardContent></Card>
        </div>

        {/* AI summary */}
        {snapshot?.ai_summary && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4" /> CEO Briefing</CardTitle>
              <CardDescription>{new Date(snapshot.generated_at).toLocaleString()}</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap text-sm">{snapshot.ai_summary}</pre>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="queue">
          <TabsList>
            <TabsTrigger value="queue">Priority Queue</TabsTrigger>
            <TabsTrigger value="winners">Winners</TabsTrigger>
            <TabsTrigger value="losers">Losers</TabsTrigger>
            <TabsTrigger value="traffic">Traffic Quality</TabsTrigger>
          </TabsList>

          <TabsContent value="queue">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Unified Priority Queue</CardTitle>
                <CardDescription>Ranked by predicted revenue impact, confidence, traffic size, and effort.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1 mb-3">
                  {categories.map((c) => (
                    <Button
                      key={c}
                      size="sm"
                      variant={categoryFilter === c ? "default" : "outline"}
                      onClick={() => setCategoryFilter(c)}
                    >
                      {c}
                    </Button>
                  ))}
                </div>
                <ScrollArea className="h-[520px] pr-3">
                  {loading ? (
                    <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" /></div>
                  ) : filtered.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                      No queued actions. Click <strong>Rebuild Queue</strong> to gather candidates from insights, creatives, SEO and traffic.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {filtered.map((row) => (
                        <div key={row.id} className="border rounded-md p-3 bg-card">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant={CATEGORY_BADGE[row.category] ?? "outline"}>{row.category}</Badge>
                                <span className="text-xs text-muted-foreground">{row.source_kind}</span>
                                <span className="text-xs font-mono text-muted-foreground">score {row.priority_score.toFixed(1)}</span>
                              </div>
                              <div className="font-medium mt-1 truncate" title={row.title}>{row.title}</div>
                              <div className="text-xs text-muted-foreground line-clamp-2">{row.summary}</div>
                              {row.recommended_action && (
                                <div className="text-xs mt-1"><span className="text-muted-foreground">Action:</span> {row.recommended_action}</div>
                              )}
                              <div className="flex flex-wrap gap-3 mt-2 text-[11px] text-muted-foreground">
                                <span>${Math.round(row.expected_revenue_impact).toLocaleString()} / 30d</span>
                                <span>conf {Math.round(row.confidence * 100)}%</span>
                                <span>difficulty {row.difficulty}/5</span>
                                <span>{row.traffic_size} sessions</span>
                              </div>
                            </div>
                            <div className="flex flex-col gap-1 shrink-0">
                              <Button size="sm" variant="default" onClick={() => setStatus(row.id, "approved")}>Approve</Button>
                              <Button size="sm" variant="outline" onClick={() => setStatus(row.id, "snoozed", new Date(Date.now() + 7 * 86400000).toISOString())}>Snooze 7d</Button>
                              <Button size="sm" variant="ghost" onClick={() => setStatus(row.id, "dismissed")}>Dismiss</Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="winners">
            <Card>
              <CardHeader><CardTitle className="text-base">Breakout Winners</CardTitle></CardHeader>
              <CardContent>
                <ListBlock rows={snapshot?.winners ?? []} emptyText="No winners detected in last snapshot." />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="losers">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Fading Products</CardTitle></CardHeader>
              <CardContent>
                <ListBlock rows={snapshot?.losers ?? []} emptyText="No fading products detected." />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="traffic">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Shield className="h-4 w-4" /> Traffic Quality</CardTitle></CardHeader>
              <CardContent>
                {snapshot?.traffic_quality?.breakdown ? (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    {Object.entries(snapshot.traffic_quality.breakdown).map(([k, v]) => (
                      <div key={k} className="border rounded p-3 text-center">
                        <div className="text-xs text-muted-foreground">{k}</div>
                        <div className="text-xl font-bold">{v as number}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No snapshot yet. Generate one to see traffic breakdown.</p>
                )}
                {snapshot?.top_sources?.length ? (
                  <div className="mt-4">
                    <div className="text-sm font-medium mb-2">Top sources (7d)</div>
                    <div className="space-y-1">
                      {snapshot.top_sources.map((s: any) => (
                        <div key={s.source} className="flex justify-between text-sm">
                          <span>{s.source}</span>
                          <span className="font-mono">{s.sessions}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function ListBlock({ rows, emptyText }: { rows: any[]; emptyText: string }) {
  if (!rows?.length) return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <div className="space-y-2">
      {rows.map((r: any, i: number) => (
        <div key={i} className="border rounded p-2 text-sm flex justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium truncate">{r.title}</div>
            <div className="text-xs text-muted-foreground">score {Number(r.priority_score ?? 0).toFixed(1)}</div>
          </div>
          <div className="text-xs font-mono shrink-0">${Math.round(Number(r.expected_revenue_impact ?? 0)).toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}