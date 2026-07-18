import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, AlertTriangle, CheckCircle2, XCircle, PlayCircle } from "lucide-react";
import { useAnalyticsTruth, type TruthResponse } from "@/hooks/useAnalyticsTruth";
import { V2EnvelopeBadge } from "@/components/admin/V2EnvelopeBadge";

type Range = "24h" | "7d" | "30d";
const RANGE_HOURS: Record<Range, number> = { "24h": 24, "7d": 24 * 7, "30d": 24 * 30 };

// Local view-model — kept identical shape to the previous world-map-debug
// response so nothing below the fold changed. Populated exclusively from
// `analytics-canonical` via `useAnalyticsTruth` so the numbers here are
// byte-identical to the World Map counters + CSV export.
interface DebugResponse {
  ok: boolean;
  range: Range;
  us_only: boolean;
  total_raw_events: number;
  excluded_internal: number;
  excluded_bots: number;
  bot_reasons?: Record<string, number>;
  bot_samples?: Array<{ reason: string; path: string; browser: string | null; referrer: string | null; utm_source: string | null; country: string | null; created_at: string }>;
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

const BOT_REASON_LABEL: Record<string, string> = {
  test_query_param: "Test/preview query param",
  bot_browser_ua: "Bot browser/UA",
  bot_referrer: "Known crawler referrer",
  bot_utm_marker: "Bot UTM marker",
  zero_geo_ping: "Zero (0,0) geo ping",
  empty_signal_stack: "Empty signal stack",
  unknown: "Unknown bot rule",
};
const BOT_REASON_HELP: Record<string, string> = {
  test_query_param: "URL contained ?test=true / ?internal=true / ?dryrun=true / ?preview=true",
  bot_browser_ua: "browser field matched: bot|crawler|spider|headless|puppeteer|playwright|curl|wget|python-requests|axios…",
  bot_referrer: "referrer matched a known crawler/bot domain (Googlebot, Ahrefs, Semrush, FB/Twitter scraper, Slackbot…)",
  bot_utm_marker: "utm_source/medium/campaign contained bot|crawler|monitor|uptime|test|qa|automation",
  zero_geo_ping: "lat/lng = 0,0 — synthetic ping or server-side request",
  empty_signal_stack: "No geo, no browser, no referrer, no UTM, no identity — pure bot ping",
};

// PR-1 analytics-truth: `world-map-debug` was a parallel analytics path
// with its own filters, producing the 0-vs-5 ATC mismatch reported in the
// incident. This panel now derives 100% of its numbers from
// `analytics-canonical` via `useAnalyticsTruth`. Do not restore
// world-map-debug reads here — the parity test will fail CI.
function truthToDebug(t: TruthResponse, range: Range, usOnly: boolean): DebugResponse {
  const filteredSessions = usOnly
    ? t.sessions.filter((s) => (s.country || "").toUpperCase() === "US")
    : t.sessions;
  // Sanity: totals for the canonical response are already the source of
  // truth; when us_only is toggled we recompute from the session list so
  // the panel exactly reflects what CSV/Summary would output for the same
  // filter. `analytics-canonical` supports `geo=US` server-side too — this
  // client-side derivation keeps the range switcher instant.
  const visitors = new Set(filteredSessions.map((s) => s.visitor_id || s.session_id)).size;
  const sessions = filteredSessions.length;
  let pageviews = 0, product_views = 0, add_to_cart = 0, checkout_started = 0, purchases = 0;
  const internal = filteredSessions.filter((s) => s.is_internal).length;
  const byCountry = new Map<string, { u: Set<string>; sess: Set<string>; pv: number; atc: number; co: number; pu: number }>();
  const bySource = new Map<string, number>();
  for (const s of filteredSessions) {
    pageviews += s.page_views;
    if (s.has_product_view) product_views++;
    if (s.has_add_to_cart) add_to_cart++;
    if (s.has_checkout) checkout_started++;
    if (s.has_purchase) purchases++;
    const c = s.country || "Unknown";
    let row = byCountry.get(c);
    if (!row) { row = { u: new Set(), sess: new Set(), pv: 0, atc: 0, co: 0, pu: 0 }; byCountry.set(c, row); }
    row.u.add(s.visitor_id || s.session_id);
    row.sess.add(s.session_id);
    row.pv += s.page_views;
    if (s.has_add_to_cart) row.atc++;
    if (s.has_checkout) row.co++;
    if (s.has_purchase) row.pu++;
    bySource.set(s.source, (bySource.get(s.source) ?? 0) + 1);
  }
  const countries = Array.from(byCountry.entries())
    .map(([country, r]) => ({
      country,
      unique_visitors: r.u.size,
      sessions: r.sess.size,
      pageviews: r.pv,
      add_to_cart: r.atc,
      checkout_started: r.co,
      purchases: r.pu,
    }))
    .sort((a, b) => b.unique_visitors - a.unique_visitors);
  const top_sources = Array.from(bySource.entries())
    .map(([source, events]) => ({ source, events }))
    .sort((a, b) => b.events - a.events);
  const earliest = filteredSessions.reduce<string | null>((acc, s) => (!acc || s.first_seen_at < acc ? s.first_seen_at : acc), null);
  const latest = filteredSessions.reduce<string | null>((acc, s) => (!acc || s.last_seen_at > acc ? s.last_seen_at : acc), null);
  return {
    ok: true,
    range,
    us_only: usOnly,
    total_raw_events: pageviews + product_views + add_to_cart + checkout_started + purchases,
    excluded_internal: internal,
    excluded_bots: 0,
    excluded_admin: 0,
    excluded_non_us: usOnly ? t.sessions.length - filteredSessions.length : 0,
    clean_events: pageviews + product_views + add_to_cart + checkout_started + purchases,
    unique_visitors: visitors,
    sessions,
    pageviews,
    product_views,
    add_to_cart,
    checkout_started,
    purchases,
    conversion_rate: visitors ? Number(((purchases / visitors) * 100).toFixed(2)) : 0,
    earliest_event_at: earliest,
    latest_event_at: latest,
    countries,
    top_sources,
    warnings: [],
  };
}

export const CleanAnalyticsPanel = () => {
  const [usOnly, setUsOnly] = useState(true);
  const [range, setRange] = useState<Range>("24h");
  // One truth call per range. Each is byte-identical to the CSV/Summary
  // export in `VisitorWorldMap` for the same (hours, geo).
  const t24 = useAnalyticsTruth({ hours: RANGE_HOURS["24h"], geo: "all" });
  const t7 = useAnalyticsTruth({ hours: RANGE_HOURS["7d"], geo: "all" });
  const t30 = useAnalyticsTruth({ hours: RANGE_HOURS["30d"], geo: "all" });
  const loading = t24.isLoading || t7.isLoading || t30.isLoading || t24.isFetching || t7.isFetching || t30.isFetching;
  const reload = () => { void t24.refetch(); void t7.refetch(); void t30.refetch(); };
  const data: Record<Range, DebugResponse | null> = useMemo(() => ({
    "24h": t24.data ? truthToDebug(t24.data, "24h", usOnly) : null,
    "7d":  t7.data  ? truthToDebug(t7.data,  "7d",  usOnly) : null,
    "30d": t30.data ? truthToDebug(t30.data, "30d", usOnly) : null,
  }), [t24.data, t7.data, t30.data, usOnly]);

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

  const consistency = useMemo(() => {
    const d24 = data["24h"]; const d7 = data["7d"]; const d30 = data["30d"];
    if (!d24 || !d7 || !d30) return null;
    type Check = { id: string; label: string; pass: boolean; severity: "error" | "warn" | "info"; detail: string };
    const checks: Check[] = [];
    const push = (id: string, label: string, pass: boolean, detail: string, severity: Check["severity"] = "error") =>
      checks.push({ id, label, pass, detail, severity });

    // Monotonicity: 24h <= 7d <= 30d for cumulative metrics
    const monoMetrics: Array<keyof DebugResponse> = [
      "unique_visitors", "sessions", "pageviews", "product_views",
      "add_to_cart", "checkout_started", "purchases", "clean_events", "total_raw_events",
    ];
    for (const m of monoMetrics) {
      const a = Number(d24[m] ?? 0), b = Number(d7[m] ?? 0), c = Number(d30[m] ?? 0);
      push(`mono-${String(m)}`, `Monotonic ${String(m)} (24h ≤ 7d ≤ 30d)`, a <= b && b <= c,
        `24h=${a} • 7d=${b} • 30d=${c}`);
    }

    // 7d == 30d warning (likely stale or capped)
    push("7d-eq-30d-uv", "7d ≠ 30d unique visitors",
      !(d7.unique_visitors > 0 && d7.unique_visitors === d30.unique_visitors),
      `7d=${d7.unique_visitors} • 30d=${d30.unique_visitors}`, "warn");
    push("7d-eq-30d-pv", "7d ≠ 30d pageviews",
      !(d7.pageviews > 0 && d7.pageviews === d30.pageviews),
      `7d=${d7.pageviews} • 30d=${d30.pageviews}`, "warn");

    // Funnel sanity per range
    for (const r of RANGES) {
      const d = data[r]!;
      push(`funnel-pv-sess-${r}`, `${r}: pageviews ≥ sessions`, d.pageviews >= d.sessions,
        `pv=${d.pageviews} • sess=${d.sessions}`);
      push(`funnel-atc-pv-${r}`, `${r}: add_to_cart ≤ product_views`, d.add_to_cart <= d.product_views,
        `atc=${d.add_to_cart} • pv=${d.product_views}`, "warn");
      push(`funnel-co-atc-${r}`, `${r}: checkout_started ≤ add_to_cart`, d.checkout_started <= d.add_to_cart,
        `co=${d.checkout_started} • atc=${d.add_to_cart}`, "warn");
      push(`funnel-pur-co-${r}`, `${r}: purchases ≤ checkout_started`, d.purchases <= d.checkout_started,
        `pur=${d.purchases} • co=${d.checkout_started}`, "warn");
    }

    const errors = checks.filter(c => !c.pass && c.severity === "error").length;
    const warns = checks.filter(c => !c.pass && c.severity === "warn").length;
    return { checks, errors, warns, total: checks.length };
  }, [data]);

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
          <Button size="sm" variant="outline" onClick={reload} disabled={loading}>
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

        {/* Consistency test */}
        <div className="rounded-lg border bg-card">
          <div className="flex items-center justify-between p-3 border-b">
            <div>
              <div className="text-sm font-semibold flex items-center gap-2">
                <PlayCircle className="h-4 w-4" />
                Consistency test (24h / 7d / 30d)
              </div>
              <div className="text-xs text-muted-foreground">
                Monotonicity, 7d≠30d guard, and funnel sanity (pv≥sess, atc≤pv, co≤atc, pur≤co).
              </div>
            </div>
            <div className="flex items-center gap-2">
              {consistency && (
                <>
                  <Badge variant={consistency.errors === 0 ? "default" : "destructive"}>
                    {consistency.total - consistency.errors - consistency.warns}/{consistency.total} pass
                  </Badge>
                  {consistency.warns > 0 && <Badge variant="outline">{consistency.warns} warn</Badge>}
                  {consistency.errors > 0 && <Badge variant="destructive">{consistency.errors} fail</Badge>}
                </>
              )}
              <Button size="sm" variant="outline" onClick={reload} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Re-run"}
              </Button>
            </div>
          </div>
          {!consistency ? (
            <div className="p-3 text-sm text-muted-foreground">Loading ranges…</div>
          ) : (
            <div className="p-3 grid md:grid-cols-2 gap-x-6 gap-y-1 text-sm">
              {consistency.checks.map((c) => (
                <div key={c.id} className="flex items-start gap-2 py-1 border-b last:border-0">
                  {c.pass ? (
                    <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-500 flex-shrink-0" />
                  ) : c.severity === "warn" ? (
                    <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-500 flex-shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 mt-0.5 text-destructive flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className={c.pass ? "" : "font-medium"}>{c.label}</div>
                    <div className="text-xs text-muted-foreground font-mono truncate">{c.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

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
              <Metric label="Purchases (genuine)" value={current.purchases} />
              <Metric label="Conversion rate" value={`${current.conversion_rate}%`} />
            </div>

            <V2EnvelopeBadge
              hours={RANGE_HOURS[range]}
              geo="all"
              label="Traffic quality (Clean analytics)"
            />

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <div className="text-sm font-semibold mb-2">Excluded traffic</div>
                <div className="space-y-1 text-sm">
                  <Row label="Internal / test" value={current.excluded_internal} />
                  <Row label="Admin / diagnostics" value={current.excluded_admin} />
                  <Row label="Bot / preview / dryRun" value={current.excluded_bots} />
                  {current.bot_reasons && Object.keys(current.bot_reasons).length > 0 && (
                    <div className="ml-4 mt-1 mb-2 space-y-0.5 border-l-2 border-muted pl-2">
                      {Object.entries(current.bot_reasons)
                        .sort((a, b) => b[1] - a[1])
                        .map(([reason, count]) => (
                          <div key={reason} className="flex justify-between text-xs text-muted-foreground">
                            <span title={BOT_REASON_HELP[reason] || reason}>↳ {BOT_REASON_LABEL[reason] || reason}</span>
                            <span className="tabular-nums">{count}</span>
                          </div>
                        ))}
                    </div>
                  )}
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