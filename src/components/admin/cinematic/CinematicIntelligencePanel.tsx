import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Brain, RefreshCw, Wand2, Shield, Star, Send } from "lucide-react";
import { toast } from "sonner";

type Breakdown = { category: string; total: number; recoverable: number; unrecoverable: number; needs_review: number };
type QueueItem = { id: string; product_slug: string; product_name: string | null; render_priority_score: number | null; preset: string | null };
type ReviewItem = {
  id: string; product_slug: string; product_name: string | null; status: string;
  failure_category: string | null; root_cause: string | null; recommended_fix: string | null;
  recoverable: boolean | null; risk_level: string | null; expected_impact: string | null;
  admin_review_reason: string | null; smart_retry_count: number | null; qa_score: number | null;
  error_message: string | null;
};
type Metrics = { avg_qa_score: number | null; retry_success_rate: number | null; completed_count: number; review_count: number };

type Summary = {
  breakdown: Breakdown[];
  priority_queue: QueueItem[];
  review_queue: ReviewItem[];
  metrics: Metrics;
};

function riskBadge(r: string | null) {
  if (r === "high") return "destructive" as const;
  if (r === "medium") return "default" as const;
  return "secondary" as const;
}

export default function CinematicIntelligencePanel() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-ad-intelligence", {
        body: { action: "summary" },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message ?? "summary failed");
      setSummary(data as Summary);
    } catch (e) {
      console.error("[intelligence] load failed", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 30_000);
    return () => window.clearInterval(t);
  }, [load]);

  const run = async (action: string, label: string) => {
    setBusy(action);
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-ad-intelligence", { body: { action } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message ?? "failed");
      toast.success(`${label} done`, {
        description: JSON.stringify(
          Object.fromEntries(Object.entries(data).filter(([k]) => !["ok", "traceId", "items", "ids"].includes(k))),
        ),
      });
      await load();
    } catch (e) {
      toast.error(`${label} failed`, { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  const oneClickRetry = async (jobId: string) => {
    setBusy(`retry:${jobId}`);
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-ad-intelligence", {
        body: { action: "smart_retry", job_id: jobId },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message ?? "retry failed");
      toast.success("Smart retry queued");
      await load();
    } catch (e) {
      toast.error("Retry failed", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  const forceRepair = async (jobId: string) => {
    setBusy(`repair:${jobId}`);
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-ad-intelligence", {
        body: { action: "force_repair", job_id: jobId },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message ?? "repair failed");
      toast.success("Force repair triggered", { description: "Job reset and re-queued with smart retry." });
      await load();
    } catch (e) {
      toast.error("Force repair failed", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading intelligence…
        </CardContent>
      </Card>
    );
  }

  if (!summary) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4" /> Cinematic Intelligence
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => load()}>
              <RefreshCw className="mr-1 h-3 w-3" /> Refresh
            </Button>
            <Button size="sm" variant="outline" onClick={() => run("classify_failures", "Classify")} disabled={!!busy}>
              {busy === "classify_failures" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Brain className="mr-1 h-3 w-3" />}
              Classify failures
            </Button>
            <Button size="sm" variant="outline" onClick={() => run("smart_retry", "Smart retry")} disabled={!!busy}>
              {busy === "smart_retry" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Wand2 className="mr-1 h-3 w-3" />}
              Fix recoverable
            </Button>
            <Button size="sm" variant="outline" onClick={() => run("score_qa", "QA scoring")} disabled={!!busy}>
              {busy === "score_qa" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Shield className="mr-1 h-3 w-3" />}
              Score QA
            </Button>
            <Button size="sm" variant="outline" onClick={() => run("recompute_priority", "Priority")} disabled={!!busy}>
              {busy === "recompute_priority" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Star className="mr-1 h-3 w-3" />}
              Recompute priority
            </Button>
            <Button size="sm" onClick={() => run("publish_high_qa", "Publish high-QA")} disabled={!!busy}>
              {busy === "publish_high_qa" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Send className="mr-1 h-3 w-3" />}
              Publish high-QA
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Metric label="Avg QA score" value={summary.metrics.avg_qa_score ?? "—"} />
          <Metric label="Retry success" value={summary.metrics.retry_success_rate != null ? `${summary.metrics.retry_success_rate}%` : "—"} />
          <Metric label="Completed" value={summary.metrics.completed_count} />
          <Metric label="Needs review" value={summary.metrics.review_count} tone={summary.metrics.review_count > 0 ? "warn" : "muted"} />
        </div>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Failure breakdown</h3>
          {summary.breakdown.length === 0 ? (
            <p className="text-xs text-muted-foreground">No failed jobs.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {summary.breakdown.map((b) => (
                <div key={b.category} className="rounded border bg-muted/30 px-2 py-1 text-xs">
                  <span className="font-medium">{b.category}</span>
                  <span className="ml-1 text-muted-foreground">×{b.total}</span>
                  <span className="ml-1 text-emerald-600">↻{b.recoverable}</span>
                  {b.needs_review > 0 && <span className="ml-1 text-amber-600">⚑{b.needs_review}</span>}
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Priority queue (top 10)</h3>
          {summary.priority_queue.length === 0 ? (
            <p className="text-xs text-muted-foreground">Queue is empty.</p>
          ) : (
            <ul className="space-y-1">
              {summary.priority_queue.slice(0, 10).map((q) => (
                <li key={q.id} className="flex items-center justify-between rounded border bg-muted/20 px-2 py-1 text-xs">
                  <span className="truncate">{q.product_name ?? q.product_slug}</span>
                  <Badge variant="secondary" className="ml-2">★ {q.render_priority_score ?? "—"}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Needs review</h3>
          {summary.review_queue.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nothing waiting.</p>
          ) : (
            <ul className="space-y-2">
              {summary.review_queue.slice(0, 20).map((r) => (
                <li key={r.id} className="rounded border bg-muted/20 p-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.product_name ?? r.product_slug}</span>
                    {r.failure_category && <Badge variant="outline">{r.failure_category}</Badge>}
                    {r.risk_level && <Badge variant={riskBadge(r.risk_level)}>{r.risk_level}</Badge>}
                    {r.recoverable != null && (
                      <Badge variant={r.recoverable ? "secondary" : "destructive"}>
                        {r.recoverable ? "recoverable" : "unrecoverable"}
                      </Badge>
                    )}
                    {r.qa_score != null && <Badge variant="outline">QA {r.qa_score}</Badge>}
                  </div>
                  {r.admin_review_reason && <p className="mt-1 text-muted-foreground">Reason: {r.admin_review_reason}</p>}
                  {r.root_cause && <p className="mt-1">Cause: {r.root_cause}</p>}
                  {r.recommended_fix && <p className="mt-1">Fix: {r.recommended_fix}</p>}
                  {r.expected_impact && <p className="mt-1 text-muted-foreground">Impact: {r.expected_impact}</p>}
                  {r.recoverable && (
                    <div className="mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => oneClickRetry(r.id)}
                        disabled={busy === `retry:${r.id}`}
                      >
                        {busy === `retry:${r.id}` ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Wand2 className="mr-1 h-3 w-3" />}
                        One-click fix
                      </Button>
                    </div>
                  )}
                  <div className="mt-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => forceRepair(r.id)}
                      disabled={busy === `repair:${r.id}`}
                    >
                      {busy === `repair:${r.id}` ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Wand2 className="mr-1 h-3 w-3" />}
                      Force repair & re-render
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, tone = "default" }: { label: string; value: number | string; tone?: "default" | "warn" | "muted" }) {
  const cls = tone === "warn" ? "text-amber-600 dark:text-amber-400" : tone === "muted" ? "text-muted-foreground" : "text-foreground";
  return (
    <div className="rounded border bg-muted/30 p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold ${cls}`}>{value}</div>
    </div>
  );
}
