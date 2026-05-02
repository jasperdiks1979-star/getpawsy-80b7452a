import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface FunnelRow {
  session_id: string | null;
  stripe_session_id: string | null;
  step: string;
  is_klarna: boolean | null;
  payment_method: string | null;
  value: number | null;
  created_at: string;
}

interface TtRow {
  event_name: string;
  status: string | null;
  created_at: string;
}

const FUNNEL_STEPS = [
  "ViewContent",
  "AddToCart",
  "InitiateCheckout",
  "CheckoutCreated",
  "Purchase",
] as const;

const TT_EVENTS = [
  "ViewContent",
  "AddToCart",
  "InitiateCheckout",
  "CompletePayment",
] as const;

const RANGES: Record<string, number> = {
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
};

export default function ConversionDashboardPage() {
  const [range, setRange] = useState<keyof typeof RANGES>("7d");
  const [funnel, setFunnel] = useState<FunnelRow[]>([]);
  const [tiktok, setTiktok] = useState<TtRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const since = new Date(
      Date.now() - RANGES[range] * 60 * 60 * 1000,
    ).toISOString();

    const [{ data: f }, { data: t }] = await Promise.all([
      supabase
        .from("checkout_funnel_events")
        .select(
          "session_id, stripe_session_id, step, is_klarna, payment_method, value, created_at",
        )
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5000),
      supabase
        .from("tiktok_server_events")
        .select("event_name, status, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5000),
    ]);

    setFunnel((f ?? []) as FunnelRow[]);
    setTiktok((t ?? []) as TtRow[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  // Group funnel events per session/order to compute step reach.
  const funnelStats = useMemo(() => {
    const sessions = new Map<
      string,
      { steps: Set<string>; isKlarna: boolean; revenue: number }
    >();
    for (const r of funnel) {
      const key = r.stripe_session_id ?? r.session_id ?? "anon";
      const cur = sessions.get(key) ?? {
        steps: new Set<string>(),
        isKlarna: false,
        revenue: 0,
      };
      cur.steps.add(r.step);
      if (r.is_klarna) cur.isKlarna = true;
      if (r.step === "Purchase" && r.value) cur.revenue = Number(r.value);
      sessions.set(key, cur);
    }

    const totalSessions = sessions.size;
    const klarnaSessions = Array.from(sessions.values()).filter(
      (s) => s.isKlarna,
    ).length;

    const stepData = FUNNEL_STEPS.map((step) => {
      let total = 0;
      let klarna = 0;
      let other = 0;
      for (const s of sessions.values()) {
        if (s.steps.has(step)) {
          total += 1;
          if (s.isKlarna) klarna += 1;
          else other += 1;
        }
      }
      return { step, total, klarna, other };
    });

    // Drop-off per step (vs previous step).
    const dropoff = stepData.map((s, i) => {
      const prev = i === 0 ? s.total : stepData[i - 1].total;
      const dropPct = prev > 0 ? Math.max(0, (1 - s.total / prev) * 100) : 0;
      const conversionFromTop =
        stepData[0].total > 0 ? (s.total / stepData[0].total) * 100 : 0;
      return { ...s, dropPct, conversionFromTop };
    });

    const purchases = sessions.size
      ? Array.from(sessions.values()).filter((s) => s.steps.has("Purchase"))
      : [];
    const klarnaPurchases = purchases.filter((s) => s.isKlarna).length;
    const klarnaRevenue = purchases
      .filter((s) => s.isKlarna)
      .reduce((acc, s) => acc + s.revenue, 0);
    const otherRevenue = purchases
      .filter((s) => !s.isKlarna)
      .reduce((acc, s) => acc + s.revenue, 0);

    return {
      totalSessions,
      klarnaSessions,
      klarnaSharePct: totalSessions
        ? (klarnaSessions / totalSessions) * 100
        : 0,
      stepData: dropoff,
      purchases: purchases.length,
      klarnaPurchases,
      klarnaRevenue,
      otherRevenue,
    };
  }, [funnel]);

  // TikTok server-side parity (delivered vs failed per event).
  const ttStats = useMemo(() => {
    return TT_EVENTS.map((ev) => {
      const matching = tiktok.filter((r) => r.event_name === ev);
      const success = matching.filter((r) => r.status === "success").length;
      const failed = matching.length - success;
      return { event: ev, success, failed, total: matching.length };
    });
  }, [tiktok]);

  return (
    <div className="container mx-auto py-8 max-w-6xl space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">Conversion Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            Drop-off per funnel step, Klarna mix, and TikTok server-side event
            delivery.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={range} onValueChange={(v) => setRange(v as keyof typeof RANGES)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24 hours</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Sessions" value={funnelStats.totalSessions} />
        <KpiCard
          label="Purchases"
          value={funnelStats.purchases}
          sub={
            funnelStats.totalSessions
              ? `${((funnelStats.purchases / funnelStats.totalSessions) * 100).toFixed(1)}% CVR`
              : ""
          }
        />
        <KpiCard
          label="Klarna selected"
          value={funnelStats.klarnaSessions}
          sub={`${funnelStats.klarnaSharePct.toFixed(1)}% of sessions`}
        />
        <KpiCard
          label="Klarna revenue"
          value={`$${funnelStats.klarnaRevenue.toFixed(2)}`}
          sub={`vs $${funnelStats.otherRevenue.toFixed(2)} other`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Funnel drop-off</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelStats.stepData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="step" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                  }}
                />
                <Legend />
                <Bar dataKey="klarna" stackId="a" fill="hsl(var(--primary))" name="Klarna" />
                <Bar dataKey="other" stackId="a" fill="hsl(var(--muted-foreground))" name="Other" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-2">
            {funnelStats.stepData.map((s, i) => (
              <div key={s.step} className="space-y-1">
                <div className="flex justify-between text-sm flex-wrap gap-2">
                  <span className="font-medium">{s.step}</span>
                  <span className="text-muted-foreground font-mono">
                    {s.total} sessions · {s.conversionFromTop.toFixed(1)}% of top
                    {i > 0 && (
                      <span
                        className={
                          s.dropPct > 50
                            ? "ml-2 text-destructive"
                            : "ml-2 text-muted-foreground"
                        }
                      >
                        −{s.dropPct.toFixed(1)}% vs prev
                      </span>
                    )}
                  </span>
                </div>
                <Progress value={s.conversionFromTop} className="h-2" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Klarna vs other (per step)</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelStats.stepData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="step" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                  }}
                />
                <Legend />
                <Bar dataKey="klarna" fill="hsl(var(--primary))" name="Klarna" />
                <Bar dataKey="other" fill="hsl(var(--muted-foreground))" name="Other" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>TikTok server-side delivery</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ttStats}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="event" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                    }}
                  />
                  <Legend />
                  <Bar dataKey="success" stackId="t" fill="hsl(var(--primary))" name="Delivered" />
                  <Bar dataKey="failed" stackId="t" fill="hsl(var(--destructive))" name="Failed" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1 text-sm">
              {ttStats.map((s) => {
                const pct = s.total ? (s.success / s.total) * 100 : 0;
                return (
                  <div key={s.event} className="flex justify-between">
                    <span className="font-mono">{s.event}</span>
                    <span>
                      <Badge
                        variant={pct === 100 ? "default" : pct > 0 ? "outline" : "destructive"}
                      >
                        {s.success}/{s.total} ({pct.toFixed(0)}%)
                      </Badge>
                    </span>
                  </div>
                );
              })}
              {ttStats.every((s) => s.total === 0) && (
                <p className="text-muted-foreground">
                  No server-side TikTok events in this range.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">
          {label}
        </p>
        <p className="text-2xl font-bold">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}