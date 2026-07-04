import { useEffect, useMemo, useState, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RefreshCw } from "lucide-react";

/**
 * ATC Analytics Panel
 *
 * Counts and timing distributions for the sticky ATC + cart funnel events:
 *   sticky_atc_visible, sticky_atc_click, add_to_cart, cart_restored
 *
 * Segmented by "session type" (real / qa / bot / degraded) derived from the
 * qa, is_bot and degraded flags on lp_funnel_events, so upstream writer
 * regressions (bot false-positives, missing add_to_cart, phantom
 * cart_restored) are visible at a glance.
 */

const EVENTS = [
  "sticky_atc_visible",
  "sticky_atc_click",
  "add_to_cart",
  "cart_restored",
] as const;

type EventName = (typeof EVENTS)[number];

type SessionType = "real" | "qa" | "bot" | "degraded";

type Row = {
  event_name: string;
  is_bot: boolean | null;
  qa: boolean | null;
  degraded: boolean | null;
  time_to_visible_ms: number | null;
  time_to_click_ms: number | null;
  delta_ms: number | null;
  dwell_ms: number | null;
};

function classify(r: Row): SessionType {
  if (r.qa) return "qa";
  if (r.is_bot) return "bot";
  if (r.degraded) return "degraded";
  return "real";
}

function timingField(ev: string): keyof Row {
  if (ev === "sticky_atc_visible") return "time_to_visible_ms";
  if (ev === "sticky_atc_click") return "time_to_click_ms";
  // add_to_cart / cart_restored → use delta_ms (time since previous event)
  return "delta_ms";
}

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function fmtMs(v: number | null): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  if (v >= 1000) return `${(v / 1000).toFixed(2)}s`;
  return `${Math.round(v)}ms`;
}

const RANGES: Record<string, number> = {
  "1h": 1,
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
};

export default function AtcAnalyticsPanel() {
  const [range, setRange] = useState<string>("24h");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLoaded, setLastLoaded] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const sinceIso = new Date(
      Date.now() - RANGES[range] * 3600_000,
    ).toISOString();
    const { data, error } = await supabase
      .from("lp_funnel_events")
      .select(
        "event_name,is_bot,qa,degraded,time_to_visible_ms,time_to_click_ms,delta_ms,dwell_ms",
      )
      .in("event_name", EVENTS as unknown as string[])
      .gte("created_at", sinceIso)
      .limit(50000);
    if (error) {
      setError(error.message);
      setRows([]);
    } else {
      setRows((data ?? []) as Row[]);
      setLastLoaded(new Date());
    }
    setLoading(false);
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    const buckets = new Map<string, Row[]>();
    for (const r of rows) {
      const st = classify(r);
      const key = `${r.event_name}::${st}`;
      const arr = buckets.get(key) ?? [];
      arr.push(r);
      buckets.set(key, arr);
    }
    const table: Array<{
      event: EventName;
      sessionType: SessionType;
      count: number;
      p50: number | null;
      p90: number | null;
      p99: number | null;
    }> = [];
    for (const ev of EVENTS) {
      for (const st of ["real", "qa", "bot", "degraded"] as SessionType[]) {
        const list = buckets.get(`${ev}::${st}`) ?? [];
        const field = timingField(ev);
        const timings = list
          .map((r) => r[field] as number | null)
          .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
          .sort((a, b) => a - b);
        table.push({
          event: ev,
          sessionType: st,
          count: list.length,
          p50: percentile(timings, 50),
          p90: percentile(timings, 90),
          p99: percentile(timings, 99),
        });
      }
    }
    return table;
  }, [rows]);

  const totalsBySession = useMemo(() => {
    const totals: Record<SessionType, number> = {
      real: 0, qa: 0, bot: 0, degraded: 0,
    };
    for (const r of rows) totals[classify(r)] += 1;
    return totals;
  }, [rows]);

  const badgeVariant = (st: SessionType) =>
    st === "real" ? "default"
      : st === "qa" ? "secondary"
      : st === "bot" ? "destructive"
      : "outline";

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Helmet>
        <title>ATC Analytics Panel · Admin</title>
        <meta name="description" content="Counts and timing distributions for sticky ATC and cart funnel events by session type." />
      </Helmet>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">ATC Analytics Panel</h1>
          <p className="text-sm text-muted-foreground">
            sticky_atc_visible · sticky_atc_click · add_to_cart · cart_restored
            {lastLoaded && (
              <span className="ml-2">
                · updated {lastLoaded.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.keys(RANGES).map((k) => (
                <SelectItem key={k} value={k}>Last {k}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Session mix (all four events)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(Object.keys(totalsBySession) as SessionType[]).map((st) => (
            <Badge key={st} variant={badgeVariant(st)} className="text-xs">
              {st}: {totalsBySession[st].toLocaleString()}
            </Badge>
          ))}
          <Badge variant="outline" className="text-xs">
            total events: {rows.length.toLocaleString()}
          </Badge>
        </CardContent>
      </Card>

      {EVENTS.map((ev) => {
        const evRows = summary.filter((s) => s.event === ev);
        const total = evRows.reduce((a, b) => a + b.count, 0);
        const field = timingField(ev);
        return (
          <Card key={ev}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-mono">{ev}</CardTitle>
                <Badge variant="outline" className="text-xs">
                  {total.toLocaleString()} events · timing: {String(field)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b text-muted-foreground">
                      <th className="py-2 pr-4">Session type</th>
                      <th className="py-2 pr-4 text-right">Count</th>
                      <th className="py-2 pr-4 text-right">% of event</th>
                      <th className="py-2 pr-4 text-right">p50</th>
                      <th className="py-2 pr-4 text-right">p90</th>
                      <th className="py-2 pr-4 text-right">p99</th>
                    </tr>
                  </thead>
                  <tbody>
                    {evRows.map((r) => (
                      <tr key={r.sessionType} className="border-b last:border-b-0">
                        <td className="py-2 pr-4">
                          <Badge variant={badgeVariant(r.sessionType)} className="text-xs">
                            {r.sessionType}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4 text-right font-mono">
                          {r.count.toLocaleString()}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono text-muted-foreground">
                          {total ? `${((r.count / total) * 100).toFixed(1)}%` : "—"}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono">{fmtMs(r.p50)}</td>
                        <td className="py-2 pr-4 text-right font-mono">{fmtMs(r.p90)}</td>
                        <td className="py-2 pr-4 text-right font-mono">{fmtMs(r.p99)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <p className="text-xs text-muted-foreground">
        session type: <b>qa</b> = qa flag true · <b>bot</b> = is_bot true and not qa ·
        <b> degraded</b> = degraded delivery, not bot/qa · <b>real</b> = clean human traffic.
        Timing fields: visible→time_to_visible_ms, click→time_to_click_ms,
        add_to_cart/cart_restored→delta_ms (ms since previous event in the session).
      </p>
    </div>
  );
}