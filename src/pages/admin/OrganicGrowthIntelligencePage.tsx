import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, TrendingDown, Minus, Sparkles, Shield, ExternalLink } from "lucide-react";
import { useOrganicGrowthIntelligence, type OGIChannel } from "@/hooks/useOrganicGrowthIntelligence";
import { CanonicalKpiStrip } from "@/components/admin/CanonicalKpiStrip";

const PLATFORM_COLORS: Record<string, string> = {
  google: "#22c55e",
  pinterest: "#e60023",
  tiktok: "#a855f7",
  facebook: "#1877f2",
  instagram: "#e1306c",
  meta: "#1877f2",
  reddit: "#ff4500",
  linkedin: "#0a66c2",
  youtube: "#ff0000",
  bing: "#00809d",
  duckduckgo: "#de5833",
  yahoo: "#6001d2",
  referral: "#14b8a6",
  direct: "#9ca3af",
  unknown: "#d1d5db",
};

function fmtInt(n: number | null | undefined) { return (n ?? 0).toLocaleString(); }
function fmtMoney(cents: number | null | undefined) {
  const v = (cents ?? 0) / 100;
  return v.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function fmtPct(n: number | null | undefined, digits = 1) {
  if (n == null || !isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}
function DeltaBadge({ v }: { v: number | null | undefined }) {
  if (v == null || !isFinite(v)) return <span className="text-xs text-muted-foreground">—</span>;
  const Icon = v > 0.01 ? TrendingUp : v < -0.01 ? TrendingDown : Minus;
  const cls = v > 0.01 ? "text-emerald-600" : v < -0.01 ? "text-rose-600" : "text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${cls}`}>
      <Icon className="h-3 w-3" /> {v > 0 ? "+" : ""}{(v * 100).toFixed(1)}%
    </span>
  );
}

export default function OrganicGrowthIntelligencePage() {
  const { data, isLoading, error } = useOrganicGrowthIntelligence();

  return (
    <div className="p-4 md:p-6 space-y-6">
      <Helmet>
        <title>Organic Growth Intelligence — Layer 1 Truth</title>
        <meta name="description" content="Enterprise Organic Growth Intelligence Center — the Layer-1 truth for every AI engine. Canonical sources only." />
      </Helmet>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" /> Organic Growth Intelligence
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Layer-1 truth for every AI engine. Organic traffic is the primary KPI; paid is validation only.
            Reads canonical sources exclusively — never re-classifies, never fabricates.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">canonical_sessions_traffic_class</Badge>
          <Badge variant="outline">canonical_events</Badge>
          <Badge variant="outline">v_organic_product_ranking_30d</Badge>
          <Badge variant="outline">v_organic_pin_ranking_30d</Badge>
          <Link to="/admin/organic-first" className="inline-flex items-center gap-1 text-primary hover:underline">
            Organic-First Audit <ExternalLink className="h-3 w-3" />
          </Link>
          <Link to="/admin/organic-intelligence" className="inline-flex items-center gap-1 text-primary hover:underline">
            Success DNA <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </header>

      <CanonicalKpiStrip defaultRange="24h" title="Canonical truth — 24h" />

      {isLoading && (
        <div className="text-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading canonical envelope…
        </div>
      )}
      {error && (
        <Card className="border-rose-500/40">
          <CardContent className="p-4 text-sm text-rose-600">
            Failed to load Organic Growth Intelligence: {String((error as any).message || error)}
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          {/* KPI STRIP */}
          <section className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-9 gap-3">
            <KpiCard label="Organic Sessions" value={fmtInt(data.windows["24h"].organic.sessions)} delta={data.deltas.vs_yesterday.sessions} />
            <KpiCard label="Organic Visitors" value={fmtInt(data.windows["24h"].organic.visitors)} delta={data.deltas.vs_yesterday.visitors} />
            <KpiCard label="Product Views" value={fmtInt(data.windows["24h"].organic.product_views)} />
            <KpiCard label="Add to Cart" value={fmtInt(data.windows["24h"].organic.add_to_cart)} />
            <KpiCard label="Checkout" value={fmtInt(data.windows["24h"].organic.checkout_started)} />
            <KpiCard label="Purchases" value={fmtInt(data.windows["24h"].organic.purchases)} delta={data.deltas.vs_yesterday.purchases} />
            <KpiCard label="Revenue" value={fmtMoney(data.windows["24h"].organic.revenue_cents)} delta={data.deltas.vs_yesterday.revenue_cents} />
            <KpiCard label="CVR" value={fmtPct(data.windows["24h"].organic.conversion_rate, 2)} />
            <KpiCard label="Attrib. Confidence" value={fmtPct(data.windows["24h"].organic.avg_attribution_confidence, 0)} />
          </section>

          {/* CHANNEL BREAKDOWN */}
          <section>
            <h2 className="text-lg font-semibold mb-3">Organic Channel Breakdown (30d)</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {sortChannels(data.windows["30d"].channels.filter((c) => c.is_organic && !c.is_paid)).map((c) => (
                <ChannelCard key={c.platform} c={c} totalSessions={data.windows["30d"].organic.sessions} />
              ))}
              {data.windows["30d"].channels.filter((c) => c.is_organic && !c.is_paid).length === 0 && (
                <p className="text-sm text-muted-foreground">No organic sessions in the last 30 days.</p>
              )}
            </div>
          </section>

          {/* PAID VALIDATION */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Shield className="h-4 w-4 text-amber-500" /> Paid Validation
              </h2>
              <Badge variant="outline" className="border-amber-500/60 text-amber-600">
                VALIDATION ONLY — AI never promotes products from paid data alone
              </Badge>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {data.windows["30d"].channels.filter((c) => c.is_paid).map((c) => (
                <ChannelCard key={"paid:" + c.platform} c={c} totalSessions={data.windows["30d"].organic.sessions} paid />
              ))}
              {data.windows["30d"].channels.filter((c) => c.is_paid).length === 0 && (
                <Card><CardContent className="p-4 text-sm text-muted-foreground">No paid sessions detected in the last 30 days.</CardContent></Card>
              )}
            </div>
          </section>

          {/* FUNNEL 24H */}
          <section className="grid lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle className="text-base">Organic Funnel (24h)</CardTitle></CardHeader>
              <CardContent>
                <FunnelBars totals={data.windows["24h"].organic} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Attribution (24h)</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {Object.entries(data.windows["24h"].attribution).map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="capitalize">{k.replace("_", " ")}</span>
                    <span className="font-mono">{v}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>

          {/* LEADERBOARDS */}
          <section className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Top Organic Landing Pages (24h)</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr><th className="text-left py-1">Path</th><th className="text-right">Sess.</th><th className="text-right">ATC</th><th className="text-right">Purch.</th><th className="text-right">CVR</th></tr>
                  </thead>
                  <tbody>
                    {(data.windows["24h"].top_landing_pages || []).slice(0, 10).map((p) => (
                      <tr key={p.path} className="border-t border-border/40">
                        <td className="py-1 truncate max-w-[240px]">{p.path}</td>
                        <td className="text-right font-mono">{p.sessions}</td>
                        <td className="text-right font-mono">{p.add_to_cart}</td>
                        <td className="text-right font-mono">{p.purchases}</td>
                        <td className="text-right font-mono">{fmtPct(p.conversion_rate, 1)}</td>
                      </tr>
                    ))}
                    {(data.windows["24h"].top_landing_pages || []).length === 0 && (
                      <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">No organic landing pages in the window.</td></tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Top Organic Products (30d)</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr><th className="text-left py-1">Product</th><th className="text-right">Sess.</th><th className="text-right">Views</th><th className="text-right">Purch.</th><th className="text-right">Revenue</th></tr>
                  </thead>
                  <tbody>
                    {(data.leaderboard.top_products || []).slice(0, 10).map((p: any) => (
                      <tr key={p.product_id} className="border-t border-border/40">
                        <td className="py-1 truncate max-w-[220px]">{p.product_id}</td>
                        <td className="text-right font-mono">{fmtInt(p.organic_sessions)}</td>
                        <td className="text-right font-mono">{fmtInt(p.organic_product_views)}</td>
                        <td className="text-right font-mono">{fmtInt(p.organic_purchases)}</td>
                        <td className="text-right font-mono">{fmtMoney(p.organic_revenue_cents)}</td>
                      </tr>
                    ))}
                    {(data.leaderboard.top_products || []).length === 0 && (
                      <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">No organic product data yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Top Organic Pins (30d)</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr><th className="text-left py-1">Pin</th><th className="text-right">Sess.</th><th className="text-right">ATC</th><th className="text-right">Purch.</th><th className="text-right">Revenue</th></tr>
                  </thead>
                  <tbody>
                    {(data.leaderboard.top_pins || []).slice(0, 10).map((p: any) => (
                      <tr key={p.pin_id} className="border-t border-border/40">
                        <td className="py-1 font-mono truncate max-w-[180px]">{p.pin_id}</td>
                        <td className="text-right font-mono">{fmtInt(p.organic_sessions)}</td>
                        <td className="text-right font-mono">{fmtInt(p.organic_add_to_cart)}</td>
                        <td className="text-right font-mono">{fmtInt(p.organic_purchases)}</td>
                        <td className="text-right font-mono">{fmtMoney(p.organic_revenue_cents)}</td>
                      </tr>
                    ))}
                    {(data.leaderboard.top_pins || []).length === 0 && (
                      <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">No organic pin data yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Traffic-Class Funnel (24h)</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr><th className="text-left py-1">Class</th><th className="text-right">Sess.</th><th className="text-right">Views</th><th className="text-right">ATC</th><th className="text-right">Chk</th><th className="text-right">Purch.</th><th className="text-right">Rev.</th></tr>
                  </thead>
                  <tbody>
                    {data.funnel_24h.map((r) => (
                      <tr key={r.traffic_class} className="border-t border-border/40">
                        <td className="py-1 capitalize">{r.traffic_class}</td>
                        <td className="text-right font-mono">{fmtInt(r.sessions)}</td>
                        <td className="text-right font-mono">{fmtInt(r.product_views)}</td>
                        <td className="text-right font-mono">{fmtInt(r.add_to_cart)}</td>
                        <td className="text-right font-mono">{fmtInt(r.checkout_started)}</td>
                        <td className="text-right font-mono">{fmtInt(r.purchases)}</td>
                        <td className="text-right font-mono">{fmtMoney(Number(r.revenue_cents))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </section>

          {/* INSIGHTS + RECOMMENDATIONS */}
          <section className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">AI Insights (evidence-backed)</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {data.insights.length === 0 && <p className="text-sm text-muted-foreground">No insights meet the evidence threshold yet.</p>}
                {data.insights.map((i, idx) => (
                  <div key={idx} className="rounded-md border border-border/60 p-2 text-sm">
                    <p>{i.text}</p>
                    <div className="mt-1 text-xs text-muted-foreground flex flex-wrap gap-2">
                      <span>Evidence: <span className="font-mono">{i.evidence}</span></span>
                      <span>Confidence: {fmtPct(i.confidence, 0)}</span>
                      <span>Sample: {i.sample_size}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Recommendations</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {data.recommendations.length === 0 && <p className="text-sm text-muted-foreground">No recommendations meet the evidence threshold yet.</p>}
                {data.recommendations.map((r, idx) => (
                  <div key={idx} className="rounded-md border border-border/60 p-2 text-sm">
                    <p>{r.text}</p>
                    <div className="mt-1 text-xs text-muted-foreground flex flex-wrap gap-2">
                      <span>Evidence source: <span className="font-mono">{r.evidence_source}</span></span>
                      <span>Confidence: {fmtPct(r.confidence, 0)}</span>
                      <span>Sample: {r.sample_size}</span>
                      <span>Fresh: {new Date(r.freshness).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>

          {/* ADAPTERS + SEO HEALTH */}
          <section>
            <h2 className="text-lg font-semibold mb-3">Future-Ready Adapters</h2>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {Object.entries(data.adapters).map(([name, a]) => (
                <Card key={name} className="border-dashed">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium capitalize">{name.replace(/_/g, " ")}</span>
                      <Badge variant="outline" className="text-xs">Not Connected</Badge>
                    </div>
                    {a.note && <p className="text-xs text-muted-foreground mt-1">{a.note}</p>}
                  </CardContent>
                </Card>
              ))}
              <Card className="border-dashed">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">SEO Health</span>
                    <Badge variant="outline" className="text-xs">Not Tracked</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{data.seo_health.note}</p>
                </CardContent>
              </Card>
            </div>
          </section>

          <footer className="text-xs text-muted-foreground pt-4 border-t border-border/60">
            Envelope generated {new Date(data.generated_at).toLocaleString()} — canonical Layer-1 read only.
          </footer>
        </>
      )}
    </div>
  );
}

function KpiCard({ label, value, delta }: { label: string; value: string; delta?: number | null }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-lg font-semibold tabular-nums">{value}</div>
        {delta !== undefined && <div className="mt-0.5"><DeltaBadge v={delta} /> <span className="text-[10px] text-muted-foreground">vs yesterday</span></div>}
      </CardContent>
    </Card>
  );
}

function ChannelCard({ c, totalSessions, paid = false }: { c: OGIChannel; totalSessions: number; paid?: boolean }) {
  const color = paid ? "#f59e0b" : (PLATFORM_COLORS[c.platform] || "#9ca3af");
  const share = totalSessions ? c.sessions / totalSessions : 0;
  const cvr = c.sessions ? c.purchases / c.sessions : 0;
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full" style={{ background: color }} />
            <span className="font-medium capitalize">{c.platform}</span>
          </div>
          <Badge variant={paid ? "outline" : "secondary"} className="text-[10px]">
            {paid ? "PAID" : `${(share * 100).toFixed(0)}% of organic`}
          </Badge>
        </div>
        <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
          <dt className="text-muted-foreground">Sessions</dt><dd className="text-right font-mono">{fmtInt(c.sessions)}</dd>
          <dt className="text-muted-foreground">Visitors</dt><dd className="text-right font-mono">{fmtInt(c.visitors)}</dd>
          <dt className="text-muted-foreground">Views</dt><dd className="text-right font-mono">{fmtInt(c.product_views)}</dd>
          <dt className="text-muted-foreground">ATC</dt><dd className="text-right font-mono">{fmtInt(c.add_to_cart)}</dd>
          <dt className="text-muted-foreground">Checkout</dt><dd className="text-right font-mono">{fmtInt(c.checkout_started)}</dd>
          <dt className="text-muted-foreground">Purchases</dt><dd className="text-right font-mono">{fmtInt(c.purchases)}</dd>
          <dt className="text-muted-foreground">Revenue</dt><dd className="text-right font-mono">{fmtMoney(c.revenue_cents)}</dd>
          <dt className="text-muted-foreground">CVR</dt><dd className="text-right font-mono">{fmtPct(cvr, 2)}</dd>
        </dl>
      </CardContent>
    </Card>
  );
}

function sortChannels(cs: OGIChannel[]) {
  return [...cs].sort((a, b) => b.sessions - a.sessions);
}

function FunnelBars({ totals }: { totals: { sessions: number; product_views: number; add_to_cart: number; checkout_started: number; purchases: number } }) {
  const stages = [
    { k: "Sessions", v: totals.sessions },
    { k: "Product Views", v: totals.product_views },
    { k: "Add to Cart", v: totals.add_to_cart },
    { k: "Checkout", v: totals.checkout_started },
    { k: "Purchases", v: totals.purchases },
  ];
  const max = Math.max(1, stages[0].v);
  return (
    <div className="space-y-2">
      {stages.map((s, i) => {
        const prev = i === 0 ? s.v : stages[i - 1].v;
        const drop = prev ? 1 - s.v / prev : 0;
        return (
          <div key={s.k}>
            <div className="flex justify-between text-xs mb-0.5">
              <span>{s.k}</span>
              <span className="font-mono">{fmtInt(s.v)} {i > 0 && <span className="text-muted-foreground">(-{(drop * 100).toFixed(0)}%)</span>}</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${(s.v / max) * 100}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}