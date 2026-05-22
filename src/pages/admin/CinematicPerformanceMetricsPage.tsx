import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, TrendingUp, TrendingDown, Eye, MousePointerClick, Bookmark, Ban, Activity } from "lucide-react";
import { Helmet } from "react-helmet-async";

type PerfRow = {
  id: string;
  pin_id: string;
  asset_id: string | null;
  job_id: string | null;
  hook_archetype: string | null;
  board_id: string | null;
  outbound_clicks: number;
  saves: number;
  impressions: number;
  watch_seconds_p50: number | null;
  engagement_rate: number | null;
  collected_at: string;
};

type QuarantineRow = {
  id: string;
  pattern_type: string;
  pattern_value: string;
  reason: string | null;
  quarantined_until: string;
  created_at: string;
};

type Window = "24h" | "7d" | "30d";
const WINDOW_MS: Record<Window, number> = {
  "24h": 86400_000,
  "7d": 7 * 86400_000,
  "30d": 30 * 86400_000,
};

function fmtNum(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
function fmtPct(n: number | null | undefined) {
  if (n == null) return "—";
  return `${(n * 100).toFixed(2)}%`;
}
function fmtTime(iso: string) {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

export default function CinematicPerformanceMetricsPage() {
  const [rows, setRows] = useState<PerfRow[]>([]);
  const [quarantine, setQuarantine] = useState<QuarantineRow[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [window, setWindow] = useState<Window>("7d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const since = new Date(Date.now() - WINDOW_MS[window]).toISOString();
      const results = await Promise.allSettled([
        supabase
          .from("cinematic_pin_performance" as any)
          .select("*")
          .gte("collected_at", since)
          .order("collected_at", { ascending: false })
          .limit(1000),
        supabase
          .from("cinematic_pin_performance" as any)
          .select("collected_at")
          .order("collected_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("cinematic_quarantine_patterns" as any)
          .select("*")
          .gt("quarantined_until", new Date().toISOString())
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      const [perfR, latestR, quarR] = results;
      const perf = perfR.status === "fulfilled" ? (perfR.value as any)?.data : null;
      const latest = latestR.status === "fulfilled" ? (latestR.value as any)?.data : null;
      const quar = quarR.status === "fulfilled" ? (quarR.value as any)?.data : null;
      const perfErr = perfR.status === "fulfilled" ? (perfR.value as any)?.error : perfR.reason;
      if (perfErr) {
        const msg = String(perfErr?.message ?? perfErr ?? "");
        if (/jwt|auth|permission|rls/i.test(msg)) setError("AUTH");
        else if (!perf) setError(msg);
      }
      setRows(Array.isArray(perf) ? (perf as PerfRow[]) : []);
      setLastSync(((latest as any)?.collected_at as string) ?? null);
      setQuarantine(Array.isArray(quar) ? (quar as QuarantineRow[]) : []);
    } catch (e: any) {
      console.error("[CinematicPerformance] load failed", e);
      setError(e?.message || "Unknown error loading performance metrics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [window]);

  const totals = useMemo(() => {
    const t = { impressions: 0, clicks: 0, saves: 0, watch: 0, count: rows.length };
    for (const r of rows) {
      t.impressions += r.impressions || 0;
      t.clicks += r.outbound_clicks || 0;
      t.saves += r.saves || 0;
      t.watch += r.watch_seconds_p50 || 0;
    }
    const er = t.impressions > 0 ? (t.clicks + t.saves) / t.impressions : 0;
    const ctr = t.impressions > 0 ? t.clicks / t.impressions : 0;
    const sr = t.impressions > 0 ? t.saves / t.impressions : 0;
    const avgWatch = t.count > 0 ? t.watch / t.count : 0;
    return { ...t, er, ctr, sr, avgWatch };
  }, [rows]);

  const byHook = useMemo(() => {
    const map = new Map<string, { impressions: number; clicks: number; saves: number; count: number }>();
    for (const r of rows) {
      const k = r.hook_archetype || "(unknown)";
      const v = map.get(k) || { impressions: 0, clicks: 0, saves: 0, count: 0 };
      v.impressions += r.impressions || 0;
      v.clicks += r.outbound_clicks || 0;
      v.saves += r.saves || 0;
      v.count += 1;
      map.set(k, v);
    }
    return Array.from(map.entries())
      .map(([k, v]) => ({
        hook: k,
        ...v,
        engagement_rate: v.impressions > 0 ? (v.clicks + v.saves) / v.impressions : 0,
      }))
      .sort((a, b) => b.engagement_rate - a.engagement_rate);
  }, [rows]);

  const topPins = useMemo(() => {
    return [...rows]
      .filter((r) => (r.impressions || 0) >= 100)
      .sort((a, b) => (b.engagement_rate ?? 0) - (a.engagement_rate ?? 0))
      .slice(0, 10);
  }, [rows]);

  const worstPins = useMemo(() => {
    return [...rows]
      .filter((r) => (r.impressions || 0) >= 500)
      .sort((a, b) => (a.engagement_rate ?? 0) - (b.engagement_rate ?? 0))
      .slice(0, 10);
  }, [rows]);

  const hasData = rows.length > 0;

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl pb-24">
      <Helmet>
        <title>Cinematic Performance Metrics — Admin</title>
      </Helmet>

      <header className="mb-5 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cinematic Performance Metrics</h1>
          <p className="text-sm text-muted-foreground">
            Pinterest engagement aggregated daily by <span className="font-mono">cinematic-pin-performance-sync</span>.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Last sync sample: {lastSync ? fmtTime(lastSync) : "—"}
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <div className="flex gap-1">
            {(["24h", "7d", "30d"] as Window[]).map((w) => (
              <Button
                key={w}
                size="sm"
                variant={window === w ? "default" : "outline"}
                onClick={() => setWindow(w)}
              >
                {w}
              </Button>
            ))}
          </div>
          <Button onClick={load} variant="outline" size="sm" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Refresh
          </Button>
        </div>
      </header>

      {error === "AUTH" ? (
        <Card className="p-6 text-sm">Admin login required to view performance metrics.</Card>
      ) : error ? (
        <Card className="p-6 text-sm text-destructive">Error loading metrics: {error}</Card>
      ) : loading && !hasData ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : !hasData ? (
        <Card className="p-8 text-center">
          <Activity className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <h2 className="text-lg font-semibold mb-1">No performance data yet</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            <code className="font-mono text-xs">cinematic-pin-performance-sync</code> runs daily at 04:00 UTC.
            Once Pinterest reports impressions on published pins, charts will populate here automatically.
          </p>
        </Card>
      ) : (
        <>
          {/* KPI tiles */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-4">
            <Kpi icon={<Eye className="h-4 w-4" />} label="Impressions" value={fmtNum(totals.impressions)} sub={`${totals.count} samples`} />
            <Kpi icon={<MousePointerClick className="h-4 w-4" />} label="Outbound clicks" value={fmtNum(totals.clicks)} sub={`CTR ${fmtPct(totals.ctr)}`} />
            <Kpi icon={<Bookmark className="h-4 w-4" />} label="Saves" value={fmtNum(totals.saves)} sub={`SR ${fmtPct(totals.sr)}`} />
            <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Engagement rate" value={fmtPct(totals.er)} sub={`avg watch ${totals.avgWatch.toFixed(1)}s`} />
          </div>

          {/* By hook */}
          <Card className="p-4 mb-4">
            <h2 className="font-semibold text-sm mb-3">Engagement by hook archetype</h2>
            {byHook.length === 0 ? (
              <p className="text-xs text-muted-foreground">No hooks with data yet.</p>
            ) : (
              <div className="space-y-2">
                {byHook.slice(0, 12).map((h) => {
                  const max = byHook[0]?.engagement_rate || 1;
                  const w = Math.max(2, Math.round(((h.engagement_rate || 0) / max) * 100));
                  return (
                    <div key={h.hook} className="text-xs">
                      <div className="flex justify-between mb-0.5">
                        <span className="font-mono">{h.hook}</span>
                        <span className="text-muted-foreground">
                          {fmtPct(h.engagement_rate)} · {fmtNum(h.impressions)} impr · {h.count} pins
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${w}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Top + worst pins */}
          <div className="grid gap-3 lg:grid-cols-2 mb-4">
            <PinList title="Top performing pins" icon={<TrendingUp className="h-4 w-4 text-emerald-500" />} rows={topPins} empty="Need ≥100 impressions to rank." />
            <PinList title="Underperforming pins" icon={<TrendingDown className="h-4 w-4 text-amber-500" />} rows={worstPins} empty="Need ≥500 impressions to flag." />
          </div>

          {/* Active quarantine */}
          <Card className="p-4">
            <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <Ban className="h-4 w-4" />
              Active quarantine patterns ({quarantine.length})
            </h2>
            {quarantine.length === 0 ? (
              <p className="text-xs text-muted-foreground">No patterns currently quarantined.</p>
            ) : (
              <div className="space-y-1.5">
                {quarantine.map((q) => (
                  <div key={q.id} className="flex flex-wrap items-center gap-2 text-xs border-b border-border/40 pb-1.5">
                    <Badge variant="outline" className="font-mono">{q.pattern_type}</Badge>
                    <span className="font-mono truncate max-w-[260px]">{q.pattern_value}</span>
                    <span className="text-muted-foreground">{q.reason}</span>
                    <span className="ml-auto text-muted-foreground">
                      until {fmtTime(q.quarantined_until)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Kpi({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
        {icon} {label}
      </div>
      <div className="text-2xl font-bold leading-tight">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </Card>
  );
}

function PinList({ title, icon, rows, empty }: { title: string; icon: React.ReactNode; rows: PerfRow[]; empty: string }) {
  return (
    <Card className="p-4">
      <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">{icon}{title}</h2>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-2 text-xs border-b border-border/40 pb-1.5">
              <span className="font-mono truncate max-w-[120px]">{r.pin_id}</span>
              {r.hook_archetype && <Badge variant="outline" className="text-[10px]">{r.hook_archetype}</Badge>}
              <span className="ml-auto font-mono">
                {fmtPct(r.engagement_rate)} · {fmtNum(r.impressions)} impr
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}