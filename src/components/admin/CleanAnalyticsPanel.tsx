import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, AlertTriangle } from "lucide-react";

type Range = "24h" | "7d" | "30d";

interface DebugResponse {
  ok: boolean;
  range: Range;
  us_only: boolean;
  total_raw_events: number;
  excluded_internal: number;
  excluded_bots: number;
  excluded_admin: number;
  excluded_non_us: number;
  clean_events: number;
  unique_visitors: number;
  sessions: number;
  pageviews: number;
  product_views: number;
  add_to_cart: number;
  checkout_started: number;
  purchases: number;
  conversion_rate: number;
  earliest_event_at: string | null;
  latest_event_at: string | null;
  countries: Array<{ country: string; unique_visitors: number; sessions: number; pageviews: number; add_to_cart: number; checkout_started: number; purchases: number }>;
  top_sources: Array<{ source: string; events: number }>;
  warnings: string[];
}

const RANGES: Range[] = ["24h", "7d", "30d"];

async function fetchRange(range: Range, usOnly: boolean): Promise<DebugResponse> {
  const { data, error } = await supabase.functions.invoke("world-map-debug", {
    method: "GET",
    body: undefined,
    // @ts-ignore - functions.invoke supports query via URL when method=GET
    headers: {},
  });
  if (!error && data) return data as DebugResponse;
  // Fallback: build URL with query manually
  const projectRef = (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID || "nojvgfbcjgipjxpfatmm";
  const url = `https://${projectRef}.supabase.co/functions/v1/world-map-debug?range=${range}&us_only=${usOnly}`;
  const session = await supabase.auth.getSession();
  const res = await fetch(url, {
    headers: {
      apikey: (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY || "",
      Authorization: `Bearer ${session.data.session?.access_token || (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY || ""}`,
    },
  });
  return await res.json();
}

export const CleanAnalyticsPanel = () => {
  const [usOnly, setUsOnly] = useState(true);
  const [range, setRange] = useState<Range>("24h");
  const [data, setData] = useState<Record<Range, DebugResponse | null>>({ "24h": null, "7d": null, "30d": null });
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const projectRef = (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID || "nojvgfbcjgipjxpfatmm";
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token || (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY || "";
      const apikey = (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY || "";
      const results = await Promise.all(RANGES.map(async (r) => {
        const res = await fetch(`https://${projectRef}.supabase.co/functions/v1/world-map-debug?range=${r}&us_only=${usOnly}`, {
          headers: { apikey, Authorization: `Bearer ${token}` },
        });
        return [r, await res.json()] as const;
      }));
      const next: any = { "24h": null, "7d": null, "30d": null };
      for (const [r, v] of results) next[r] = v;
      setData(next);
    } catch (e) {
      console.error("Clean analytics load failed", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [usOnly]);

  const current = data[range];

  const warnings = useMemo(() => {
    const w: string[] = [];
    const u24 = data["24h"]?.unique_visitors ?? 0;
    const u7 = data["7d"]?.unique_visitors ?? 0;
    const u30 = data["30d"]?.unique_visitors ?? 0;
    if (u7 > 0 && u30 > 0 && u7 === u30) w.push("7d unique visitors equal 30d — possible row cap or stale data.");
    if (u24 > u7 && u7 > 0) w.push("24h > 7d — date filtering looks wrong.");
    if (current?.warnings) w.push(...current.warnings);
    return w;
  }, [data, current]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Clean Analytics (US-only)</CardTitle>
          <CardDescription>
            Server-side aggregation, no row cap. Excludes internal, admin, bot &amp; (by default) non-US traffic.
          </CardDescription>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch id="us-only" checked={usOnly} onCheckedChange={setUsOnly} />
            <Label htmlFor="us-only" className="text-sm">US-only</Label>
          </div>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          {RANGES.map((r) => (
            <Button key={r} size="sm" variant={range === r ? "default" : "outline"} onClick={() => setRange(r)}>
              Last {r}
            </Button>
          ))}
        </div>

        {warnings.length > 0 && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300 space-y-1">
            {warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}

        {!current ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Metric label="Unique visitors" value={current.unique_visitors} />
              <Metric label="Sessions" value={current.sessions} />
              <Metric label="Pageviews" value={current.pageviews} />
              <Metric label="Product views" value={current.product_views} />
              <Metric label="Add to cart" value={current.add_to_cart} />
              <Metric label="Checkout started" value={current.checkout_started} />
              <Metric label="Purchases" value={current.purchases} />
              <Metric label="Conversion rate" value={`${current.conversion_rate}%`} />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <div className="text-sm font-semibold mb-2">Excluded traffic</div>
                <div className="space-y-1 text-sm">
                  <Row label="Internal / test" value={current.excluded_internal} />
                  <Row label="Admin / diagnostics" value={current.excluded_admin} />
                  <Row label="Bot / preview / dryRun" value={current.excluded_bots} />
                  <Row label="Non-US" value={current.excluded_non_us} />
                  <Row label="Total raw events" value={current.total_raw_events} bold />
                  <Row label="Clean events" value={current.clean_events} bold />
                </div>
              </div>
              <div>
                <div className="text-sm font-semibold mb-2">Top sources</div>
                <div className="space-y-1 text-sm">
                  {current.top_sources.slice(0, 8).map((s) => (
                    <Row key={s.source} label={s.source} value={s.events} />
                  ))}
                  {current.top_sources.length === 0 && <div className="text-muted-foreground">No sources</div>}
                </div>
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold mb-2">Top countries</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-muted-foreground">
                    <tr className="text-left border-b">
                      <th className="py-1 pr-3">Country</th>
                      <th className="py-1 pr-3 text-right">Visitors</th>
                      <th className="py-1 pr-3 text-right">Sessions</th>
                      <th className="py-1 pr-3 text-right">Pageviews</th>
                      <th className="py-1 pr-3 text-right">Cart</th>
                      <th className="py-1 pr-3 text-right">Checkout</th>
                      <th className="py-1 text-right">Purchases</th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.countries.slice(0, 10).map((c) => (
                      <tr key={c.country} className="border-b last:border-0">
                        <td className="py-1 pr-3">{c.country}</td>
                        <td className="py-1 pr-3 text-right font-mono">{c.unique_visitors}</td>
                        <td className="py-1 pr-3 text-right font-mono">{c.sessions}</td>
                        <td className="py-1 pr-3 text-right font-mono">{c.pageviews}</td>
                        <td className="py-1 pr-3 text-right font-mono">{c.add_to_cart}</td>
                        <td className="py-1 pr-3 text-right font-mono">{c.checkout_started}</td>
                        <td className="py-1 text-right font-mono">{c.purchases}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">earliest: {current.earliest_event_at?.slice(0, 19) ?? "—"}</Badge>
              <Badge variant="outline">latest: {current.latest_event_at?.slice(0, 19) ?? "—"}</Badge>
              <Badge variant="outline">us_only={String(current.us_only)}</Badge>
              <Badge variant="outline">range={current.range}</Badge>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold mt-1">{typeof value === "number" ? value.toLocaleString() : value}</div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between border-b last:border-0 py-1 ${bold ? "font-semibold" : ""}`}>
      <span className="text-muted-foreground capitalize">{label}</span>
      <span className="font-mono">{value.toLocaleString()}</span>
    </div>
  );
}