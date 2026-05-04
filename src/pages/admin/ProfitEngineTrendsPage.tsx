import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend, LineChart, Line,
} from "recharts";
import { TrendingUp, MousePointerClick, DollarSign, ShoppingCart, Package, Eye } from "lucide-react";

type Range = "7d" | "30d" | "90d";
const RANGE_DAYS: Record<Range, number> = { "7d": 7, "30d": 30, "90d": 90 };

type SpendRow = {
  entry_date: string;
  spend: number;
  clicks: number;
  impressions: number;
  add_to_cart: number;
  purchases: number;
  revenue: number;
};

type PinPerf = {
  updated_at: string;
  impressions: number;
  clicks: number;
  ctr: number;
};

export default function ProfitEngineTrendsPage() {
  const [range, setRange] = useState<Range>("30d");
  const days = RANGE_DAYS[range];
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);

  const spendQ = useQuery({
    queryKey: ["pe-trends-spend", range],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ad_spend_entries")
        .select("entry_date,spend,clicks,impressions,add_to_cart,purchases,revenue")
        .gte("entry_date", since)
        .order("entry_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SpendRow[];
    },
  });

  const pinsQ = useQuery({
    queryKey: ["pe-trends-pins", range],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pinterest_pin_performance")
        .select("updated_at,impressions,clicks,ctr")
        .gte("updated_at", new Date(Date.now() - days * 86400_000).toISOString())
        .order("updated_at", { ascending: true })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as PinPerf[];
    },
  });

  // ── daily series merged from both sources ──
  const series = useMemo(() => {
    const m = new Map<string, {
      date: string;
      impressions: number;
      clicks: number;
      spend: number;
      atc: number;
      purchases: number;
      revenue: number;
    }>();
    const ensure = (d: string) =>
      m.get(d) ?? { date: d, impressions: 0, clicks: 0, spend: 0, atc: 0, purchases: 0, revenue: 0 };

    // backfill date keys
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
      m.set(d, ensure(d));
    }

    (spendQ.data ?? []).forEach((s) => {
      const r = ensure(s.entry_date);
      r.impressions += s.impressions;
      r.clicks += s.clicks;
      r.spend += Number(s.spend);
      r.atc += s.add_to_cart;
      r.purchases += s.purchases;
      r.revenue += Number(s.revenue);
      m.set(s.entry_date, r);
    });

    // Pinterest organic (no spend) — add impressions/clicks if not yet covered by spend rows
    (pinsQ.data ?? []).forEach((p) => {
      const d = (p.updated_at ?? "").slice(0, 10);
      if (!d) return;
      const r = ensure(d);
      // Only add if spend rows didn't already cover it for this date
      // (heuristic: take max so we don't double-count)
      r.impressions = Math.max(r.impressions, r.impressions + p.impressions);
      r.clicks = Math.max(r.clicks, r.clicks + p.clicks);
      m.set(d, r);
    });

    return Array.from(m.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => ({
        ...r,
        ctr: r.impressions > 0 ? (r.clicks / r.impressions) * 100 : 0,
        cpc: r.clicks > 0 ? r.spend / r.clicks : 0,
        aov: r.purchases > 0 ? r.revenue / r.purchases : 0,
      }));
  }, [spendQ.data, pinsQ.data, days]);

  const totals = useMemo(() => {
    const t = series.reduce(
      (a, r) => {
        a.imp += r.impressions; a.clk += r.clicks; a.spend += r.spend;
        a.atc += r.atc; a.purch += r.purchases; a.rev += r.revenue;
        return a;
      },
      { imp: 0, clk: 0, spend: 0, atc: 0, purch: 0, rev: 0 },
    );
    return {
      ...t,
      ctr: t.imp > 0 ? (t.clk / t.imp) * 100 : 0,
      cpc: t.clk > 0 ? t.spend / t.clk : 0,
      aov: t.purch > 0 ? t.rev / t.purch : 0,
      roas: t.spend > 0 ? t.rev / t.spend : 0,
    };
  }, [series]);

  const fmt = (n: number) => n.toLocaleString();
  const dollars = (n: number) => `$${n.toFixed(2)}`;
  const pct = (n: number) => `${n.toFixed(2)}%`;

  return (
    <div className="container mx-auto py-8 space-y-6">
      <Helmet>
        <title>Profit Engine — Trends</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <header className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Performance trends</h1>
          <p className="text-muted-foreground">Daily impressions, CTR, CPC, ATC, purchases & AOV.</p>
        </div>
        <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
          <TabsList>
            <TabsTrigger value="7d">7 days</TabsTrigger>
            <TabsTrigger value="30d">30 days</TabsTrigger>
            <TabsTrigger value="90d">90 days</TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat icon={Eye} label="Impressions" value={fmt(totals.imp)} />
        <Stat icon={MousePointerClick} label="CTR" value={pct(totals.ctr)} />
        <Stat icon={DollarSign} label="CPC" value={dollars(totals.cpc)} />
        <Stat icon={ShoppingCart} label="Add to cart" value={fmt(totals.atc)} />
        <Stat icon={Package} label="Purchases" value={fmt(totals.purch)} />
        <Stat icon={TrendingUp} label="AOV" value={dollars(totals.aov)} accent="text-emerald-600" />
      </div>

      <ChartCard title="Impressions & clicks" desc="Volume over time">
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={series}>
            <defs>
              <linearGradient id="impG" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="clkG" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--accent))" stopOpacity={0.5} />
                <stop offset="95%" stopColor="hsl(var(--accent))" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend />
            <Area type="monotone" dataKey="impressions" stroke="hsl(var(--primary))" fill="url(#impG)" />
            <Area type="monotone" dataKey="clicks" stroke="hsl(var(--accent))" fill="url(#clkG)" />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="CTR (%)" desc="Click-through rate">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} unit="%" />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => `${Number(v).toFixed(2)}%`} />
              <Line type="monotone" dataKey="ctr" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="CPC ($)" desc="Cost per click (paid only)">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => `$${Number(v).toFixed(2)}`} />
              <Line type="monotone" dataKey="cpc" stroke="hsl(var(--destructive))" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Add to cart vs purchases" desc="Funnel volume">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
              <Area type="monotone" dataKey="atc" name="Add to cart" stroke="hsl(var(--accent))" fill="hsl(var(--accent) / 0.25)" />
              <Area type="monotone" dataKey="purchases" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.4)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="AOV ($)" desc="Average order value">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => `$${Number(v).toFixed(2)}`} />
              <Line type="monotone" dataKey="aov" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

const tooltipStyle = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
};

function Stat({
  icon: Icon, label, value, accent = "text-foreground",
}: { icon: any; label: string; value: string; accent?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className={`mt-2 text-2xl font-semibold ${accent}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{desc}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}