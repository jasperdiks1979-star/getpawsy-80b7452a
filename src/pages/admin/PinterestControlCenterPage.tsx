import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Wave3BProgressPanel from "@/components/admin/Wave3BProgressPanel";

type Snapshot = {
  credits: { today: number; month: number; events: number };
  queue: { total: number; pending: number; oldest_minutes: number | null };
  quality: { samples: number; avg: number; pass99: number };
  golden: { total: number; winners: number };
  perf: { ctr_7d: number; saves_7d: number; outbound_7d: number; revenue_30d: number };
  potential: { eligible: number; below_gate: number };
  alerts: Array<{ id: string; kind: string; severity: string; message: string; created_at: string }>;
  top: Array<{ pin_id: string; score: number; label: string }>;
  worst: Array<{ pin_id: string; score: number; label: string }>;
};

async function loadSnapshot(): Promise<Snapshot> {
  const since7 = new Date(Date.now() - 7 * 86400_000).toISOString();
  const since30 = new Date(Date.now() - 30 * 86400_000).toISOString();
  const sinceMonth = new Date(new Date().toISOString().slice(0, 7) + "-01T00:00:00Z").toISOString();
  const sinceToday = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").toISOString();

  const [creditsToday, creditsMonth, queue, quality, golden, perf, potential, alerts] = await Promise.all([
    supabase.from("pinterest_credit_events").select("credits_used").gte("created_at", sinceToday).limit(5000),
    supabase.from("pinterest_credit_events").select("credits_used").gte("created_at", sinceMonth).limit(10000),
    supabase.from("pinterest_pin_queue").select("id, status, created_at").in("status", ["queued", "draft", "ready", "pending"]).limit(1000),
    supabase.from("pin_creative_scores").select("overall, passed_gate, created_at").gte("created_at", since7).limit(2000),
    supabase.from("pin_golden_batch").select("id, status, winner_score_id").limit(2000),
    supabase.from("pinterest_analytics_daily").select("impressions, pin_clicks, outbound_clicks, saves, day").gte("day", since30.slice(0, 10)).limit(5000),
    supabase.from("pin_product_intelligence").select("potential_score").limit(2000),
    supabase.from("monitoring_alerts").select("id, alert_key, severity, description, created_at, is_active").eq("is_active", true).order("created_at", { ascending: false }).limit(10),
  ]);

  const todaySum = (creditsToday.data ?? []).reduce((s: number, r: any) => s + Number(r.credits_used ?? 0), 0);
  const monthSum = (creditsMonth.data ?? []).reduce((s: number, r: any) => s + Number(r.credits_used ?? 0), 0);

  const qrows = (quality.data ?? []) as any[];
  const qScores = qrows.map((r) => Number(r.overall ?? 0)).filter((n) => n > 0);
  const avg = qScores.length ? qScores.reduce((a, b) => a + b, 0) / qScores.length : 0;
  const pass99 = qScores.filter((s) => s >= 99).length;

  const grows = (golden.data ?? []) as any[];
  const winners = grows.filter((r: any) => r.winner_score_id || r.status === "winner").length;

  const prows = (perf.data ?? []) as any[];
  const last7 = prows.filter((r: any) => r.day >= since7.slice(0, 10));
  const sum = (arr: any[], k: string) => arr.reduce((s, r) => s + Number(r[k] ?? 0), 0);
  const impr7 = sum(last7, "impressions");
  const clicks7 = sum(last7, "outbound_clicks");

  const queueRows = (queue.data ?? []) as any[];
  const oldestMin = queueRows.length
    ? Math.round((Date.now() - Math.min(...queueRows.map((r) => new Date(r.created_at).getTime()))) / 60000)
    : null;

  const potRows = (potential.data ?? []) as any[];
  const potEligible = potRows.filter((r) => (r.potential_score ?? 0) >= 70).length;
  const potBelow = potRows.filter((r) => (r.potential_score ?? 0) < 70).length;

  return {
    credits: { today: Number(todaySum.toFixed(2)), month: Number(monthSum.toFixed(2)), events: (creditsToday.data ?? []).length },
    queue: { total: queueRows.length, pending: queueRows.length, oldest_minutes: oldestMin },
    quality: { samples: qScores.length, avg: Number(avg.toFixed(2)), pass99 },
    golden: { total: grows.length, winners },
    perf: {
      ctr_7d: impr7 ? Number(((clicks7 / impr7) * 100).toFixed(2)) : 0,
      saves_7d: sum(last7, "saves"),
      outbound_7d: sum(last7, "outbound_clicks"),
      revenue_30d: 0,
    },
    potential: { eligible: potEligible, below_gate: potBelow },
    alerts: (alerts.data ?? []).map((a: any) => ({
      id: a.id, kind: a.alert_key, severity: a.severity, message: a.description ?? "", created_at: a.created_at,
    })),
    top: [],
    worst: [],
  };
}

function Metric({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{label}</CardTitle></CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export default function PinterestControlCenterPage() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const s = await loadSnapshot();
        if (alive) { setSnap(s); setUpdated(new Date()); setErr(null); }
      } catch (e) { if (alive) setErr((e as Error).message); }
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Pinterest Control Center</h1>
          <p className="text-sm text-muted-foreground">Live overview of credits, queue, quality, Golden Batch and revenue. Auto-refresh 30s.</p>
        </div>
        <Badge variant="outline">{updated ? `updated ${updated.toLocaleTimeString()}` : "loading…"}</Badge>
      </header>

      {err && <Card><CardContent className="pt-6 text-destructive">{err}</CardContent></Card>}

      <Wave3BProgressPanel />

      {snap && (
        <>
          <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Metric label="Credits today" value={`$${snap.credits.today}`} sub={`${snap.credits.events} events`} />
            <Metric label="Credits MTD" value={`$${snap.credits.month}`} sub="projected from events" />
            <Metric label="Queue depth" value={snap.queue.pending} sub={snap.queue.oldest_minutes != null ? `oldest ${snap.queue.oldest_minutes}m` : "empty"} />
            <Metric label="Eligible products (≥70)" value={snap.potential.eligible} sub={`${snap.potential.below_gate} below gate`} />
          </section>

          <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Metric label="Avg quality (7d)" value={snap.quality.avg} sub={`${snap.quality.pass99}/${snap.quality.samples} ≥99`} />
            <Metric label="Golden Batch" value={`${snap.golden.winners}/${snap.golden.total}`} sub="winners / variants" />
            <Metric label="CTR (7d)" value={`${snap.perf.ctr_7d}%`} />
            <Metric label="Revenue (30d)" value={`$${snap.perf.revenue_30d}`} sub={`${snap.perf.saves_7d} saves · ${snap.perf.outbound_7d} outbound (7d)`} />
          </section>

          <Card>
            <CardHeader><CardTitle>Active alerts</CardTitle></CardHeader>
            <CardContent>
              {snap.alerts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active alerts.</p>
              ) : (
                <ul className="space-y-2">
                  {snap.alerts.map((a) => (
                    <li key={a.id} className="flex items-start gap-3 text-sm">
                      <Badge variant={a.severity === "critical" ? "destructive" : "secondary"}>{a.severity}</Badge>
                      <div>
                        <div className="font-medium">{a.kind}</div>
                        <div className="text-muted-foreground">{a.message}</div>
                      </div>
                      <span className="ml-auto text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}