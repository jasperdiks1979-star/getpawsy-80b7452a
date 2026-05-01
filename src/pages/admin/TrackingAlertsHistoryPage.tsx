import { useEffect, useMemo, useState, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { Activity, RefreshCw, AlertTriangle, CheckCircle2, Clock, Database } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface RunRow {
  id: string;
  trace_id: string | null;
  status: string | null;
  success: boolean | null;
  started_at: string;
  completed_at: string | null;
  results: WatchResult[] | null;
  error_message: string | null;
}

interface WatchResult {
  watch: string;
  table: string;
  current: number;
  baseline: number;
  silenceMin: number | null;
  dropVsBaseline: number;
  unhealthy: boolean;
  reason: string;
}

interface AlertSeries {
  alertKey: string;
  table: string;
  label: string;
  points: { t: string; current: number; baseline: number; unhealthy: boolean; silenceMin: number | null }[];
  latest: WatchResult | null;
  latestRunAt: string | null;
  totalUnhealthy: number;
}

const RANGE_HOURS = 24;

export default function TrackingAlertsHistoryPage() {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const cutoff = new Date(Date.now() - RANGE_HOURS * 60 * 60 * 1000).toISOString();
      const { data, error: err } = await supabase
        .from("monitoring_runs")
        .select("id, trace_id, status, success, started_at, completed_at, results, error_message")
        .eq("function_name", "monitoring-tracking-heartbeat")
        .gte("started_at", cutoff)
        .order("started_at", { ascending: false })
        .limit(500);
      if (err) throw err;
      setRuns((data || []) as RunRow[]);
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      console.error("[TrackingAlertsHistory] fetch error", e);
      setError(e instanceof Error ? e.message : "Onbekende fout");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    const t = setInterval(fetchData, 60_000);
    return () => clearInterval(t);
  }, [fetchData]);

  const series = useMemo<AlertSeries[]>(() => {
    const map = new Map<string, AlertSeries>();
    // runs are newest first; build per-watch series in chronological order
    const ordered = [...runs].sort((a, b) => (a.started_at < b.started_at ? -1 : 1));
    for (const r of ordered) {
      for (const w of r.results || []) {
        if (!w?.watch) continue;
        const key = w.watch;
        const existing = map.get(key) || {
          alertKey: key,
          table: w.table,
          label: key.replace(/^tracking_silence_/, "").replace(/_/g, " "),
          points: [],
          latest: null,
          latestRunAt: null,
          totalUnhealthy: 0,
        };
        existing.points.push({
          t: r.started_at,
          current: Number(w.current) || 0,
          baseline: Number(w.baseline) || 0,
          unhealthy: !!w.unhealthy,
          silenceMin: w.silenceMin ?? null,
        });
        existing.latest = w;
        existing.latestRunAt = r.started_at;
        if (w.unhealthy) existing.totalUnhealthy++;
        map.set(key, existing);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.alertKey.localeCompare(b.alertKey));
  }, [runs]);

  const totalRuns = runs.length;
  const failedRuns = runs.filter((r) => r.status === "error" || r.success === false).length;

  return (
    <>
      <Helmet>
        <title>Tracking Alerts History | Admin</title>
      </Helmet>
      <div className="container py-6 space-y-6 max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Activity className="h-6 w-6 text-primary" />
              Tracking Alerts History
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Per tracking-alert de laatste {RANGE_HOURS}u met huidige vs baseline aantallen, gezondheidsstatus en het laatste event-tijdstip. Data uit <code>monitoring_runs</code>.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {lastUpdated && (
              <span className="text-xs text-muted-foreground">
                Laatst bijgewerkt {lastUpdated.toLocaleTimeString("nl-NL")}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {error && (
          <Card className="border-destructive">
            <CardContent className="p-4 text-sm text-destructive">Fout bij laden: {error}</CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Heartbeat runs (24u)" value={totalRuns} />
          <Stat label="Gefaalde runs" value={failedRuns} tone={failedRuns > 0 ? "warn" : "default"} />
          <Stat label="Watches gevolgd" value={series.length} />
          <Stat
            label="Watches met incidenten"
            value={series.filter((s) => s.totalUnhealthy > 0).length}
            tone={series.some((s) => s.totalUnhealthy > 0) ? "warn" : "default"}
          />
        </div>

        {series.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground text-center">
              Geen heartbeat-runs gevonden in de laatste {RANGE_HOURS}u.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {series.map((s) => (
              <AlertCard key={s.alertKey} series={s} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function AlertCard({ series }: { series: AlertSeries }) {
  const last = series.latest;
  const healthy = !!last && !last.unhealthy;
  const lastEventDate = last?.silenceMin != null
    ? new Date(Date.now() - last.silenceMin * 60_000)
    : null;

  return (
    <Card className={healthy ? "" : "border-destructive/60"}>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            <span className="font-mono">{series.alertKey}</span>
            {healthy ? (
              <Badge className="bg-emerald-600 hover:bg-emerald-600"><CheckCircle2 className="h-3 w-3 mr-1" />Healthy</Badge>
            ) : (
              <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Unhealthy</Badge>
            )}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Tabel <code>{series.table}</code> · {series.points.length} runs · {series.totalUnhealthy} incidenten
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground space-y-0.5">
          {series.latestRunAt && (
            <div>Laatste run: {new Date(series.latestRunAt).toLocaleString("nl-NL")}</div>
          )}
          {lastEventDate && (
            <div className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Laatste event: {lastEventDate.toLocaleString("nl-NL")} ({last?.silenceMin}m geleden)
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          <Mini label="Current" value={last?.current ?? 0} />
          <Mini label="Baseline (24h ago)" value={last?.baseline ?? 0} />
          <Mini
            label="Drop vs baseline"
            value={`${(last?.dropVsBaseline ?? 0).toFixed(1)}%`}
            tone={(last?.dropVsBaseline ?? 0) >= 70 ? "warn" : "default"}
          />
          <Mini
            label="Silence (min)"
            value={last?.silenceMin ?? "—"}
            tone={(last?.silenceMin ?? 0) >= 60 ? "warn" : "default"}
          />
        </div>

        {last?.reason && (
          <p className="text-xs text-muted-foreground">{last.reason}</p>
        )}

        <Sparkline points={series.points} />
      </CardContent>
    </Card>
  );
}

function Sparkline({ points }: { points: AlertSeries["points"] }) {
  if (points.length < 2) {
    return <p className="text-xs text-muted-foreground">Onvoldoende datapunten voor trend.</p>;
  }
  const W = 600, H = 80, PAD = 4;
  const maxY = Math.max(1, ...points.map((p) => Math.max(p.current, p.baseline)));
  const x = (i: number) => PAD + (i * (W - PAD * 2)) / (points.length - 1);
  const y = (v: number) => H - PAD - (v / maxY) * (H - PAD * 2);

  const toPath = (key: "current" | "baseline") =>
    points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(" ");

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-primary" /> current</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-muted-foreground/60" /> baseline (24h ago)</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-destructive" /> unhealthy run</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-20 bg-muted/30 rounded">
        <path d={toPath("baseline")} fill="none" stroke="hsl(var(--muted-foreground))" strokeOpacity="0.6" strokeWidth="1.2" />
        <path d={toPath("current")} fill="none" stroke="hsl(var(--primary))" strokeWidth="1.6" />
        {points.map((p, i) =>
          p.unhealthy ? (
            <circle key={i} cx={x(i)} cy={y(p.current)} r={2.5} fill="hsl(var(--destructive))" />
          ) : null,
        )}
      </svg>
    </div>
  );
}

function Stat({
  label, value, tone = "default", sub,
}: { label: string; value: number | string; tone?: "default" | "warn"; sub?: string }) {
  const border = tone === "warn" ? "border-amber-500/50" : "";
  return (
    <Card className={border}>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold mt-1">{typeof value === "number" ? value.toLocaleString("nl-NL") : value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function Mini({ label, value, tone = "default" }: { label: string; value: number | string; tone?: "default" | "warn" }) {
  return (
    <div className={`rounded border ${tone === "warn" ? "border-amber-500/50 bg-amber-500/5" : "border-border"} p-2`}>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{typeof value === "number" ? value.toLocaleString("nl-NL") : value}</div>
    </div>
  );
}