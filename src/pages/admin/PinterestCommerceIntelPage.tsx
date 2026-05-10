import { Helmet } from "react-helmet-async";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { RefreshCw, Sparkles, TrendingUp, Target, Zap } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line, AreaChart, Area, ScatterChart, Scatter, ZAxis,
} from "recharts";
import { useMemo, useState } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";

type StrategyState = {
  id: number;
  quality_threshold: number;
  exploit_ratio: number;
  archetype_boosts: Record<string, number>;
  hook_boosts: Record<string, number>;
  trend_modifiers: Record<string, unknown>;
  last_evolved_at: string | null;
  updated_at: string;
};

type WinnerDim = {
  niche_key: string;
  pin_mode: string | null;
  hook_category: string | null;
  composite_score: number;
  sample_size: number;
  is_active: boolean;
};

type TrendSignal = {
  id: string;
  niche_key: string;
  pin_mode: string | null;
  aesthetic_tone: string | null;
  trend_label: string;
  source: string;
  weight: number;
  rationale: string | null;
  is_active: boolean;
};

type EvolutionLog = {
  id: string;
  decision_type: string;
  target_dimension: string | null;
  niche_key: string | null;
  old_value: unknown;
  new_value: unknown;
  rationale: string | null;
  metrics: unknown;
  created_at: string;
};

type PerfSignal = {
  niche_key: string;
  pin_mode: string | null;
  hook_category: string | null;
  cta: string | null;
  impressions: number;
  saves: number;
  outbound: number;
  sessions: number;
  session_seconds: number;
  add_to_cart: number;
  purchase: number;
  revenue: number;
  sample_size: number;
  last_updated: string;
};

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(217 91% 60%)",
  "hsl(142 71% 45%)",
  "hsl(38 92% 50%)",
  "hsl(330 81% 60%)",
  "hsl(199 89% 48%)",
  "hsl(271 91% 65%)",
];

function safePct(num: number, denom: number) {
  if (!denom) return 0;
  return (num / denom) * 100;
}

function KpiTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="text-xs">{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      {sub && <CardContent className="text-xs text-muted-foreground -mt-2">{sub}</CardContent>}
    </Card>
  );
}

function EmptyChart() {
  return (
    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
      No performance signals in the selected window yet.
    </div>
  );
}

export default function PinterestCommerceIntelPage() {
  const qc = useQueryClient();

  type Drilldown = {
    niche_key: string;
    pin_mode: string | null;
    hook_category: string | null;
  };
  const [drill, setDrill] = useState<Drilldown | null>(null);

  const state = useQuery({
    queryKey: ["pinterest-strategy-state"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pinterest_strategy_state" as any)
        .select("*").eq("id", 1).maybeSingle();
      if (error) throw error;
      return data as unknown as StrategyState | null;
    },
  });

  const winners = useQuery({
    queryKey: ["pinterest-winner-dimensions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pinterest_winner_dimensions" as any)
        .select("niche_key,pin_mode,hook_category,composite_score,sample_size,is_active")
        .eq("is_active", true)
        .order("composite_score", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as WinnerDim[];
    },
  });

  const trends = useQuery({
    queryKey: ["pinterest-trend-signals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pinterest_trend_signals" as any)
        .select("*").eq("is_active", true)
        .order("weight", { ascending: false }).limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as TrendSignal[];
    },
  });

  const evolution = useQuery({
    queryKey: ["pinterest-evolution-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pinterest_evolution_log" as any)
        .select("*").order("created_at", { ascending: false }).limit(40);
      if (error) throw error;
      return (data ?? []) as unknown as EvolutionLog[];
    },
  });

  const perfSignals = useQuery({
    queryKey: ["pinterest-performance-signals"],
    queryFn: async () => {
      const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("pinterest_performance_signals" as any)
        .select("niche_key,pin_mode,hook_category,cta,impressions,saves,outbound,sessions,session_seconds,add_to_cart,purchase,revenue,sample_size,last_updated")
        .gte("last_updated", since)
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as PerfSignal[];
    },
  });

  const refreshTrends = useMutation({
    mutationFn: async () => {
      // Edge function reads `action` from the query string; invoke() doesn't
      // pass query params, so call the function URL directly.
      const url = `https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/pinterest-trend-intelligence?action=refresh`;
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
      });
      const json = await res.json();
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.message ?? `HTTP ${res.status}`);
      }
      return json;
    },
    onSuccess: (json: any) => {
      toast.success(`Trends refreshed (${json?.upserts ?? 0} new, ${json?.considered ?? 0} active)`);
      qc.invalidateQueries({ queryKey: ["pinterest-trend-signals"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to refresh trends"),
  });

  const runEvolve = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        "pinterest-auto-evolve", { body: {}, method: "POST" });
      if (error) throw error;
      return data;
    },
    onSuccess: (json: any) => {
      toast.success(
        `Auto-evolve done — threshold ${json?.newThreshold ?? "?"}, exploit ${
          json?.newExploit != null ? Math.round(json.newExploit * 100) + "%" : "?"
        }, ${json?.decisions ?? 0} decisions`,
      );
      qc.invalidateQueries({ queryKey: ["pinterest-strategy-state"] });
      qc.invalidateQueries({ queryKey: ["pinterest-evolution-log"] });
      qc.invalidateQueries({ queryKey: ["pinterest-winner-dimensions"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Evolution failed"),
  });

  const s = state.data;
  const signals = perfSignals.data ?? [];

  // ── KPI rollups ──────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const sum = (k: keyof PerfSignal) =>
      signals.reduce((a, r) => a + Number(r[k] ?? 0), 0);
    const impressions = sum("impressions");
    const saves = sum("saves");
    const outbound = sum("outbound");
    const sessions = sum("sessions");
    const sessionSec = sum("session_seconds");
    const atc = sum("add_to_cart");
    const purchase = sum("purchase");
    const revenue = sum("revenue");
    return {
      impressions, saves, outbound, sessions, sessionSec, atc, purchase, revenue,
      ctr: safePct(outbound, impressions),
      saveRate: safePct(saves, impressions),
      atcRate: safePct(atc, sessions),
      cvr: safePct(purchase, sessions),
      avgDuration: sessions ? Math.round(sessionSec / sessions) : 0,
      revenuePerSession: sessions ? revenue / sessions : 0,
    };
  }, [signals]);

  // Per-archetype breakdown
  const byArchetype = useMemo(() => {
    const map = new Map<string, PerfSignal & { _key: string }>();
    for (const r of signals) {
      const key = r.pin_mode || "unknown";
      const cur = map.get(key) ?? {
        ...r, _key: key,
        impressions: 0, saves: 0, outbound: 0, sessions: 0,
        session_seconds: 0, add_to_cart: 0, purchase: 0, revenue: 0, sample_size: 0,
      };
      cur.impressions += r.impressions; cur.saves += r.saves;
      cur.outbound += r.outbound; cur.sessions += r.sessions;
      cur.session_seconds += r.session_seconds;
      cur.add_to_cart += r.add_to_cart; cur.purchase += r.purchase;
      cur.revenue += Number(r.revenue); cur.sample_size += r.sample_size;
      map.set(key, cur);
    }
    return [...map.values()].map((r) => ({
      archetype: r._key,
      ctr: safePct(r.outbound, r.impressions),
      saveRate: safePct(r.saves, r.impressions),
      cvr: safePct(r.purchase, r.sessions),
      atcRate: safePct(r.add_to_cart, r.sessions),
      revenue: Number(r.revenue.toFixed(2)),
      impressions: r.impressions,
      sessions: r.sessions,
    })).sort((a, b) => b.revenue - a.revenue);
  }, [signals]);

  // Per-hook breakdown
  const byHook = useMemo(() => {
    const map = new Map<string, { hook: string; impressions: number; outbound: number; saves: number; purchase: number; sessions: number; revenue: number }>();
    for (const r of signals) {
      const key = r.hook_category || "unknown";
      const cur = map.get(key) ?? { hook: key, impressions: 0, outbound: 0, saves: 0, purchase: 0, sessions: 0, revenue: 0 };
      cur.impressions += r.impressions; cur.outbound += r.outbound;
      cur.saves += r.saves; cur.purchase += r.purchase;
      cur.sessions += r.sessions; cur.revenue += Number(r.revenue);
      map.set(key, cur);
    }
    return [...map.values()].map((r) => ({
      hook: r.hook,
      ctr: Number(safePct(r.outbound, r.impressions).toFixed(2)),
      saveRate: Number(safePct(r.saves, r.impressions).toFixed(2)),
      cvr: Number(safePct(r.purchase, r.sessions).toFixed(2)),
      revenue: Number(r.revenue.toFixed(2)),
    })).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  }, [signals]);

  // Per-niche breakdown
  const byNiche = useMemo(() => {
    const map = new Map<string, { niche: string; revenue: number; sessions: number; impressions: number; purchase: number }>();
    for (const r of signals) {
      const key = r.niche_key || "unknown";
      const cur = map.get(key) ?? { niche: key, revenue: 0, sessions: 0, impressions: 0, purchase: 0 };
      cur.revenue += Number(r.revenue);
      cur.sessions += r.sessions;
      cur.impressions += r.impressions;
      cur.purchase += r.purchase;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 12);
  }, [signals]);

  // Daily trend
  const dailyTrend = useMemo(() => {
    const map = new Map<string, { day: string; impressions: number; outbound: number; saves: number; purchase: number; revenue: number }>();
    for (const r of signals) {
      const day = (r.last_updated || "").slice(0, 10);
      if (!day) continue;
      const cur = map.get(day) ?? { day, impressions: 0, outbound: 0, saves: 0, purchase: 0, revenue: 0 };
      cur.impressions += r.impressions; cur.outbound += r.outbound;
      cur.saves += r.saves; cur.purchase += r.purchase;
      cur.revenue += Number(r.revenue);
      map.set(day, cur);
    }
    return [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
  }, [signals]);

  // CTR vs Save scatter (each point = archetype × hook combo)
  const scatterData = useMemo(() => {
    const map = new Map<string, { name: string; ctr: number; saveRate: number; revenue: number; impressions: number }>();
    for (const r of signals) {
      const key = `${r.pin_mode ?? "?"}/${r.hook_category ?? "?"}`;
      const cur = map.get(key) ?? { name: key, ctr: 0, saveRate: 0, revenue: 0, impressions: 0 };
      cur.impressions += r.impressions;
      cur.ctr += r.outbound; cur.saveRate += r.saves; cur.revenue += Number(r.revenue);
      map.set(key, cur);
    }
    return [...map.values()]
      .filter((r) => r.impressions >= 50)
      .map((r) => ({
        name: r.name,
        ctr: Number(safePct(r.ctr, r.impressions).toFixed(2)),
        saveRate: Number(safePct(r.saveRate, r.impressions).toFixed(2)),
        revenue: Number(r.revenue.toFixed(2)),
      }));
  }, [signals]);

  const tooltipStyle = {
    contentStyle: {
      backgroundColor: "hsl(var(--popover))",
      border: "1px solid hsl(var(--border))",
      borderRadius: 8,
      fontSize: 12,
    },
  };

  // ── Drilldown details (lazy) ────────────────────────────────────────────
  const drillKey = drill ? `${drill.niche_key}|${drill.pin_mode ?? ""}|${drill.hook_category ?? ""}` : null;

  const drillSignals = useQuery({
    enabled: !!drill,
    queryKey: ["drill-signals", drillKey],
    queryFn: async () => {
      let q = supabase.from("pinterest_performance_signals" as any)
        .select("niche_key,pin_mode,hook_category,cta,product_category,impressions,saves,outbound,sessions,add_to_cart,purchase,revenue,sample_size,last_updated");
      if (drill!.niche_key) q = q.eq("niche_key", drill!.niche_key);
      if (drill!.pin_mode) q = q.eq("pin_mode", drill!.pin_mode);
      if (drill!.hook_category) q = q.eq("hook_category", drill!.hook_category);
      const { data, error } = await q.order("revenue", { ascending: false }).limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        niche_key: string; pin_mode: string | null; hook_category: string | null;
        cta: string | null; product_category: string | null;
        impressions: number; saves: number; outbound: number; sessions: number;
        add_to_cart: number; purchase: number; revenue: number;
        sample_size: number; last_updated: string;
      }>;
    },
  });

  const drillAttempts = useQuery({
    enabled: !!drill,
    queryKey: ["drill-attempts", drillKey],
    queryFn: async () => {
      let q = supabase.from("pinterest_render_attempts" as any)
        .select("id,product_slug,niche_key,pin_mode,pattern_id,hook_category,attempt_no,total_score,rejected,reasons,brief,created_at");
      if (drill!.niche_key) q = q.eq("niche_key", drill!.niche_key);
      if (drill!.pin_mode) q = q.eq("pin_mode", drill!.pin_mode);
      if (drill!.hook_category) q = q.eq("hook_category", drill!.hook_category);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(25);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string; product_slug: string; niche_key: string;
        pin_mode: string | null; pattern_id: string | null;
        hook_category: string | null; attempt_no: number;
        total_score: number; rejected: boolean; reasons: string[] | null;
        brief: any; created_at: string;
      }>;
    },
  });

  const drillEvolution = useMemo(() => {
    if (!drill || !evolution.data) return [];
    const target = `${drill.niche_key}:${drill.pin_mode ?? ""}`;
    const targetHook = `${drill.niche_key}:${drill.hook_category ?? ""}`;
    return evolution.data.filter((e) => {
      const blob = JSON.stringify(e.new_value ?? "") + JSON.stringify(e.old_value ?? "");
      return e.niche_key === drill.niche_key
        || (drill.pin_mode && blob.includes(target))
        || (drill.hook_category && blob.includes(targetHook));
    }).slice(0, 15);
  }, [drill, evolution.data]);

  const drillTotals = useMemo(() => {
    const rows = drillSignals.data ?? [];
    const sum = (k: string) => rows.reduce((a, r: any) => a + Number(r[k] ?? 0), 0);
    const impressions = sum("impressions"), outbound = sum("outbound"),
      saves = sum("saves"), sessions = sum("sessions"),
      atc = sum("add_to_cart"), purchase = sum("purchase"), revenue = sum("revenue");
    return {
      impressions, outbound, saves, sessions, atc, purchase, revenue,
      ctr: safePct(outbound, impressions),
      saveRate: safePct(saves, impressions),
      cvr: safePct(purchase, sessions),
      atcRate: safePct(atc, sessions),
    };
  }, [drillSignals.data]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Helmet>
        <title>Pinterest Commerce Intelligence — GetPawsy Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Pinterest Commerce Intelligence</h1>
          <p className="text-sm text-muted-foreground">
            Live strategy state, winning archetypes, US trend bias and the auto-evolution journal.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"
            onClick={() => refreshTrends.mutate()} disabled={refreshTrends.isPending}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh Trends
          </Button>
          <Button size="sm"
            onClick={() => runEvolve.mutate()} disabled={runEvolve.isPending}>
            <Sparkles className="w-4 h-4 mr-2" /> Run Auto-Evolve
          </Button>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Target className="w-3 h-3" /> Quality Threshold
            </CardDescription>
            <CardTitle className="text-3xl">{s?.quality_threshold ?? "—"}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Min total score for an accepted pin (auto-tuned 72–90).
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Zap className="w-3 h-3" /> Exploit Ratio
            </CardDescription>
            <CardTitle className="text-3xl">
              {s ? `${Math.round(Number(s.exploit_ratio) * 100)}%` : "—"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            How often the top winning archetype is forced for the first brief.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Active Winners
            </CardDescription>
            <CardTitle className="text-3xl">{winners.data?.length ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Niche × archetype × hook combos meeting min sample size.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Last Evolved
            </CardDescription>
            <CardTitle className="text-base">
              {s?.last_evolved_at ? new Date(s.last_evolved_at).toLocaleString() : "—"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Auto-evolution runs every 2 hours via cron.
          </CardContent>
        </Card>
      </section>

      <Tabs defaultValue="winners">
        <TabsList>
          <TabsTrigger value="kpis">Performance KPIs</TabsTrigger>
          <TabsTrigger value="winners">Winners</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="boosts">Boosts</TabsTrigger>
          <TabsTrigger value="evolution">Evolution Log</TabsTrigger>
        </TabsList>

        <TabsContent value="kpis" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiTile label="Impressions" value={kpis.impressions.toLocaleString()} sub={`${signals.length} signals`} />
            <KpiTile label="CTR" value={`${kpis.ctr.toFixed(2)}%`} sub={`${kpis.outbound.toLocaleString()} clicks`} />
            <KpiTile label="Save Rate" value={`${kpis.saveRate.toFixed(2)}%`} sub={`${kpis.saves.toLocaleString()} saves`} />
            <KpiTile label="ATC Rate" value={`${kpis.atcRate.toFixed(2)}%`} sub={`${kpis.atc.toLocaleString()} ATCs`} />
            <KpiTile label="CVR" value={`${kpis.cvr.toFixed(2)}%`} sub={`${kpis.purchase.toLocaleString()} orders`} />
            <KpiTile label="Revenue" value={`$${kpis.revenue.toFixed(0)}`} sub={`$${kpis.revenuePerSession.toFixed(2)}/session`} />
            <KpiTile label="Sessions" value={kpis.sessions.toLocaleString()} sub={`avg ${kpis.avgDuration}s`} />
            <KpiTile label="Avg Session" value={`${kpis.avgDuration}s`} sub="time on site" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Daily Performance (14d)</CardTitle>
                <CardDescription>Impressions, clicks, saves and orders over time.</CardDescription>
              </CardHeader>
              <CardContent style={{ height: 300 }}>
                {dailyTrend.length === 0 ? (
                  <EmptyChart />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dailyTrend}>
                      <defs>
                        <linearGradient id="gImp" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={CHART_COLORS[0]} stopOpacity={0.5} />
                          <stop offset="100%" stopColor={CHART_COLORS[0]} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip {...tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Area type="monotone" dataKey="impressions" stroke={CHART_COLORS[0]} fill="url(#gImp)" />
                      <Line type="monotone" dataKey="outbound" stroke={CHART_COLORS[2]} dot={false} />
                      <Line type="monotone" dataKey="saves" stroke={CHART_COLORS[3]} dot={false} />
                      <Line type="monotone" dataKey="purchase" stroke={CHART_COLORS[4]} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Revenue by Archetype</CardTitle>
                <CardDescription>Which pin modes are converting?</CardDescription>
              </CardHeader>
              <CardContent style={{ height: 300 }}>
                {byArchetype.length === 0 ? (
                  <EmptyChart />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byArchetype}
                      onClick={(e: any) => {
                        const a = e?.activePayload?.[0]?.payload?.archetype;
                        if (a && a !== "unknown") setDrill({ niche_key: "", pin_mode: a, hook_category: null });
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="archetype" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip {...tooltipStyle} />
                      <Bar dataKey="revenue" fill={CHART_COLORS[0]} radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>CTR vs Save Rate by Archetype</CardTitle>
                <CardDescription>Higher = more engaging. Right = more clickable.</CardDescription>
              </CardHeader>
              <CardContent style={{ height: 300 }}>
                {byArchetype.length === 0 ? (
                  <EmptyChart />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byArchetype}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="archetype" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 11 }} unit="%" />
                      <Tooltip {...tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="ctr" name="CTR %" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="saveRate" name="Save %" fill={CHART_COLORS[3]} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="cvr" name="CVR %" fill={CHART_COLORS[4]} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top Hooks by Revenue</CardTitle>
                <CardDescription>Which messaging angles drive sales.</CardDescription>
              </CardHeader>
              <CardContent style={{ height: 300 }}>
                {byHook.length === 0 ? (
                  <EmptyChart />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byHook} layout="vertical"
                      onClick={(e: any) => {
                        const h = e?.activePayload?.[0]?.payload?.hook;
                        if (h && h !== "unknown") setDrill({ niche_key: "", pin_mode: null, hook_category: h });
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="hook" tick={{ fontSize: 11 }} width={120} />
                      <Tooltip {...tooltipStyle} />
                      <Bar dataKey="revenue" fill={CHART_COLORS[5]} radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Niche Revenue Mix</CardTitle>
                <CardDescription>Top 12 niches by revenue contribution.</CardDescription>
              </CardHeader>
              <CardContent style={{ height: 300 }}>
                {byNiche.length === 0 ? (
                  <EmptyChart />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byNiche}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="niche" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip {...tooltipStyle} />
                      <Bar dataKey="revenue" fill={CHART_COLORS[6]} radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Engagement Map</CardTitle>
                <CardDescription>Each dot = archetype × hook combo (≥50 impressions). Bubble = revenue.</CardDescription>
              </CardHeader>
              <CardContent style={{ height: 300 }}>
                {scatterData.length === 0 ? (
                  <EmptyChart />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" dataKey="ctr" name="CTR" unit="%" tick={{ fontSize: 11 }} />
                      <YAxis type="number" dataKey="saveRate" name="Save" unit="%" tick={{ fontSize: 11 }} />
                      <ZAxis type="number" dataKey="revenue" range={[40, 400]} />
                      <Tooltip {...tooltipStyle} cursor={{ strokeDasharray: "3 3" }} />
                      <Scatter data={scatterData} fill={CHART_COLORS[7]} />
                    </ScatterChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="winners">
          <Card>
            <CardHeader>
              <CardTitle>Top Winning Dimensions</CardTitle>
              <CardDescription>
                Distilled from rolled-up performance signals (CTR, saves, ATC, conversion).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Niche</TableHead>
                    <TableHead>Pin Mode</TableHead>
                    <TableHead>Hook</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead className="text-right">Samples</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(winners.data ?? []).map((w, i) => (
                    <TableRow
                      key={`${w.niche_key}-${w.pin_mode}-${w.hook_category}-${i}`}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setDrill({
                        niche_key: w.niche_key,
                        pin_mode: w.pin_mode,
                        hook_category: w.hook_category,
                      })}
                    >
                      <TableCell className="font-medium">{w.niche_key}</TableCell>
                      <TableCell>{w.pin_mode ?? "—"}</TableCell>
                      <TableCell>{w.hook_category ?? "—"}</TableCell>
                      <TableCell className="text-right">{Number(w.composite_score).toFixed(1)}</TableCell>
                      <TableCell className="text-right">{w.sample_size}</TableCell>
                    </TableRow>
                  ))}
                  {!winners.data?.length && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                        No winners distilled yet — needs more performance signal volume.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends">
          <Card>
            <CardHeader>
              <CardTitle>Active Trend Signals</CardTitle>
              <CardDescription>
                Seasonal + curated US ecommerce trend bias merged into the planner.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Label</TableHead>
                    <TableHead>Niche</TableHead>
                    <TableHead>Pin Mode</TableHead>
                    <TableHead>Tone</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Weight</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(trends.data ?? []).map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.trend_label}</TableCell>
                      <TableCell>{t.niche_key}</TableCell>
                      <TableCell>{t.pin_mode ?? "—"}</TableCell>
                      <TableCell>{t.aesthetic_tone ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{t.source}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{Number(t.weight).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                  {!trends.data?.length && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                        No active trend signals — click “Refresh Trends”.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="boosts">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Archetype Boosts</CardTitle>
                <CardDescription>niche:pin_mode → boost (0–0.3)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {Object.entries(s?.archetype_boosts ?? {}).length === 0 && (
                  <p className="text-muted-foreground">No archetype boosts yet.</p>
                )}
                {Object.entries(s?.archetype_boosts ?? {})
                  .sort((a, b) => Number(b[1]) - Number(a[1]))
                  .map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <code className="text-xs">{k}</code>
                      <Badge>{Number(v).toFixed(2)}</Badge>
                    </div>
                  ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Hook Boosts</CardTitle>
                <CardDescription>niche:hook_category → boost (0–0.3)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {Object.entries(s?.hook_boosts ?? {}).length === 0 && (
                  <p className="text-muted-foreground">No hook boosts yet.</p>
                )}
                {Object.entries(s?.hook_boosts ?? {})
                  .sort((a, b) => Number(b[1]) - Number(a[1]))
                  .map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <code className="text-xs">{k}</code>
                      <Badge>{Number(v).toFixed(2)}</Badge>
                    </div>
                  ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="evolution">
          <Card>
            <CardHeader>
              <CardTitle>Auto-Evolution Journal</CardTitle>
              <CardDescription>
                Each tuning decision the system made, with metrics + rationale.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Decision</TableHead>
                    <TableHead>Dim</TableHead>
                    <TableHead>From → To</TableHead>
                    <TableHead>Rationale</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(evolution.data ?? []).map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(e.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{e.decision_type}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{e.target_dimension ?? "—"}</TableCell>
                      <TableCell className="text-xs max-w-[260px] truncate">
                        {(() => {
                          const ov = (e.old_value as any)?.value;
                          const nv = (e.new_value as any)?.value;
                          if (ov !== undefined && nv !== undefined) {
                            return `${ov} → ${nv}`;
                          }
                          return "(boost refresh)";
                        })()}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{e.rationale}</TableCell>
                    </TableRow>
                  ))}
                  {!evolution.data?.length && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                        No auto-evolution decisions logged yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}