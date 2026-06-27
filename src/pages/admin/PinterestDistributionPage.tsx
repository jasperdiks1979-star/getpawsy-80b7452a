import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertTriangle, CheckCircle2, ShieldAlert, Search, Globe2, Layers, BarChart3, Sparkles } from "lucide-react";

interface Recommendation {
  rank: number; cause: string; evidence: string; fix: string;
  expected_traffic_gain: number; expected_conversion_gain: number;
  difficulty: number; confidence: number; roi: number; priority: "P0" | "P1" | "P2";
}
interface AuditResult {
  ok: boolean;
  generated_at: string;
  mode: string;
  account_health: any;
  board_health: any;
  pin_quality: any;
  distribution_audit: { factors: Array<{ cause: string; evidence: string; confidence: string; fix: string; expected_impact: string }> };
  us_visibility: any;
  competitor_intel: any;
  recommendations: Recommendation[];
  autonomous_fixes: any[];
  exec_summary: any;
  message?: string;
}

function ScorePill({ label, value }: { label: string; value: number }) {
  const tone = value >= 75 ? "bg-green-600" : value >= 50 ? "bg-yellow-500 text-black" : value >= 25 ? "bg-orange-500" : "bg-red-600";
  return (
    <div className="flex flex-col items-center gap-1 p-3 rounded-lg border bg-card min-w-[110px]">
      <span className="text-xs text-muted-foreground uppercase">{label}</span>
      <span className={`text-lg font-bold text-white px-3 py-1 rounded ${tone}`}>{value}</span>
    </div>
  );
}

function ConfBadge({ c }: { c: string }) {
  const tone = c === "high" ? "bg-red-600 text-white" : c === "medium" ? "bg-orange-500 text-white" : "bg-muted";
  return <Badge className={tone}>{c}</Badge>;
}

function PriorityBadge({ p }: { p: string }) {
  const tone = p === "P0" ? "bg-red-600 text-white" : p === "P1" ? "bg-orange-500 text-white" : "bg-muted";
  return <Badge className={tone}>{p}</Badge>;
}

export default function PinterestDistributionPage() {
  const [data, setData] = useState<AuditResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true); setError(null);
    const { data: res, error: err } = await supabase.functions.invoke("pinterest-distribution-audit");
    if (err) setError(err.message);
    else if (!(res as AuditResult)?.ok) setError((res as AuditResult)?.message ?? "Unknown error");
    else setData(res as AuditResult);
    setLoading(false);
  }
  useEffect(() => { run(); }, []);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Search className="h-7 w-7" /> Pinterest Distribution &amp; Discovery
          </h1>
          <p className="text-sm text-muted-foreground">
            Phase 5 — read-only investigator. Why is Pinterest not distributing GetPawsy to the US audience?
            Mutates nothing. Analytics, canonical events, and validation untouched.
          </p>
        </div>
        <Button onClick={run} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Re-run audit
        </Button>
      </div>

      {error && (
        <Card className="border-red-500">
          <CardContent className="pt-6 flex gap-2 items-center text-red-600">
            <AlertTriangle className="h-5 w-5" /> {error}
          </CardContent>
        </Card>
      )}

      {!data && !error && (
        <Card><CardContent className="pt-6 text-muted-foreground">Loading audit…</CardContent></Card>
      )}

      {data && (
        <>
          {/* Section 9 first: Executive Summary */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" /> Executive Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <ScorePill label="Overall" value={data.exec_summary.overall_health_score} />
                <ScorePill label="Distribution" value={data.exec_summary.distribution_score} />
                <ScorePill label="Discovery" value={data.exec_summary.discovery_score} />
                <ScorePill label="SEO" value={data.exec_summary.seo_score} />
                <ScorePill label="Content" value={data.exec_summary.content_score} />
                <ScorePill label="Trust" value={data.exec_summary.account_trust_score} />
                <ScorePill label="US Ready" value={data.exec_summary.us_readiness_score} />
              </div>
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div>
                  <h3 className="font-semibold mb-2">Top 5 Blockers</h3>
                  <ol className="list-decimal pl-5 space-y-1">
                    {data.exec_summary.top_blockers.map((b: string, i: number) => <li key={i}>{b}</li>)}
                  </ol>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Top 5 Opportunities</h3>
                  <ol className="list-decimal pl-5 space-y-1">
                    {data.exec_summary.top_opportunities.map((o: string, i: number) => <li key={i}>{o}</li>)}
                  </ol>
                </div>
              </div>
              <div className="text-sm">
                <strong>Forecast after fixes:</strong> {data.exec_summary.estimated_monthly_pinterest_traffic_after_fixes}
              </div>
              <div className="text-sm">
                <strong>Implementation order:</strong>
                <ul className="list-disc pl-5 mt-1">
                  {data.exec_summary.implementation_order.map((s: string, i: number) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Section 1 — Account Health */}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5" /> 1. Account Health</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4 text-sm">
              <div>
                <div>Connected: {data.account_health.account_connected ? <Badge className="bg-green-600">YES</Badge> : <Badge className="bg-red-600">NO</Badge>}</div>
                <div>Account: {data.account_health.account_name ?? "—"} ({data.account_health.account_id ?? "—"})</div>
                <div>Status: {data.account_health.status ?? "—"}</div>
                <div>Boards on file: {data.account_health.board_count}</div>
                <div>Token expires: {data.account_health.token_expires_at ?? "—"}</div>
                <div>Domain reachable: {String(data.account_health.domain_reachable)} (HTTP {data.account_health.domain_status})</div>
              </div>
              <div>
                <div>Granted scopes: <code className="text-xs">{data.account_health.granted_scopes.join(", ") || "none"}</code></div>
                <div className="mt-1">Missing scopes: {data.account_health.missing_scopes.length === 0
                  ? <Badge className="bg-green-600">none</Badge>
                  : <Badge className="bg-red-600">{data.account_health.missing_scopes.join(", ")}</Badge>}</div>
                <div className="mt-2">Catalog feed: <Badge>{String(data.account_health.catalog_feed_status ?? "n/a")}</Badge> processing <Badge>{String(data.account_health.catalog_processing_status ?? "n/a")}</Badge></div>
                <div>Items: {data.account_health.catalog_items_total ?? "—"} (invalid: {data.account_health.catalog_items_invalid ?? "—"})</div>
                {data.account_health.catalog_last_error && <div className="text-red-600 text-xs mt-1">Last error: {data.account_health.catalog_last_error}</div>}
              </div>
              {data.account_health.recent_incidents?.length > 0 && (
                <div className="md:col-span-2">
                  <h4 className="font-semibold mb-1">Recent incidents</h4>
                  <ul className="text-xs space-y-0.5">
                    {data.account_health.recent_incidents.slice(0, 8).map((i: any, idx: number) => (
                      <li key={idx}>
                        <Badge className="mr-1">{i.severity}</Badge>
                        {i.condition} — {i.status} ({new Date(i.created_at).toLocaleString()})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 2 — Board Health */}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Layers className="h-5 w-5" /> 2. Board Health</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid md:grid-cols-4 gap-3">
                <div>Total: <strong>{data.board_health.total_boards}</strong></div>
                <div>Production-verified: <strong>{data.board_health.production_verified}</strong></div>
                <div>Sandbox: <strong>{data.board_health.sandbox}</strong></div>
                <div>Blacklisted: <strong>{data.board_health.blacklisted}</strong></div>
                <div>Dead (0 imp+clicks 30d): <strong>{data.board_health.dead_boards_count}</strong></div>
                <div>Inactive (0 pins): <strong>{data.board_health.inactive_boards_count}</strong></div>
                <div>Avg followers: <strong>{data.board_health.avg_followers}</strong></div>
                <div>Avg pins: <strong>{data.board_health.avg_pins}</strong></div>
                <div>Avg imp/board 30d: <strong>{data.board_health.avg_impressions_per_board_30d}</strong></div>
                <div>Avg clicks/board 30d: <strong>{data.board_health.avg_clicks_per_board_30d}</strong></div>
                <div>Avg saves/board 30d: <strong>{data.board_health.avg_saves_per_board_30d}</strong></div>
              </div>
              <div>
                <h4 className="font-semibold mt-2">Top 10 boards</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="text-left"><th>Name</th><th>Pins</th><th>Followers</th><th>Imp 30d</th><th>Clicks</th><th>Saves</th><th>Imp/pin</th><th>US%</th></tr></thead>
                    <tbody>
                      {data.board_health.top_boards.map((b: any) => (
                        <tr key={b.id} className="border-t">
                          <td>{b.name}</td><td>{b.pin_count}</td><td>{b.follower_count}</td>
                          <td>{b.impressions_30d}</td><td>{b.clicks_30d}</td><td>{b.saves_30d}</td>
                          <td>{b.avg_impressions_per_pin}</td>
                          <td>{b.us_share_30d != null ? Math.round(Number(b.us_share_30d) * 100) + "%" : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 3 — Pin Quality */}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" /> 3. Pin Quality Audit</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-3 gap-3 text-sm">
              <div>Pins tracked: <strong>{data.pin_quality.total_pins_tracked}</strong></div>
              <div>Lifetime impressions: <strong>{data.pin_quality.total_impressions_lifetime}</strong></div>
              <div>Lifetime clicks: <strong>{data.pin_quality.total_clicks_lifetime}</strong></div>
              <div>Lifetime saves: <strong>{data.pin_quality.total_saves_lifetime}</strong></div>
              <div>Avg CTR: <strong>{data.pin_quality.avg_ctr}%</strong></div>
              <div>Zero-impression pins: <strong>{data.pin_quality.zero_impression_pins}</strong></div>
              <div>Zero-click pins: <strong>{data.pin_quality.zero_click_pins}</strong></div>
              <div>Duplicate titles: <strong>{data.pin_quality.duplicate_titles}</strong></div>
              <div>Duplicate descriptions: <strong>{data.pin_quality.duplicate_descriptions}</strong></div>
              <div>Duplicate products: <strong>{data.pin_quality.duplicate_products}</strong></div>
              <div>Duplicate URLs: <strong>{data.pin_quality.duplicate_urls}</strong></div>
              <div>Titles &lt;30 chars: <strong>{data.pin_quality.titles_too_short}</strong></div>
              <div>Titles &gt;100 chars: <strong>{data.pin_quality.titles_too_long}</strong></div>
              <div>Descriptions &lt;100 chars: <strong>{data.pin_quality.descriptions_too_short}</strong></div>
              <div>No keywords attached: <strong>{data.pin_quality.pins_without_keywords}</strong></div>
              <div>Avg creative score: <strong>{data.pin_quality.avg_creative_score}</strong></div>
              <div>Creative pass rate: <strong>{data.pin_quality.creative_pass_rate_pct}%</strong></div>
              {data.pin_quality.top_rejection_reasons.length > 0 && (
                <div className="md:col-span-3">
                  <h4 className="font-semibold mt-1">Top creative rejection reasons</h4>
                  <ul className="text-xs">
                    {data.pin_quality.top_rejection_reasons.map((r: any) => (
                      <li key={r.reason}>• <code>{r.reason}</code> — {r.count}×</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 4 — Distribution Audit */}
          <Card>
            <CardHeader><CardTitle>4. Distribution Audit — Why Pinterest is not distributing</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {data.distribution_audit.factors.length === 0 && (
                <div className="text-green-700 flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> No distribution blockers detected.</div>
              )}
              {data.distribution_audit.factors.map((f, i) => (
                <div key={i} className="border rounded p-3">
                  <div className="flex items-center justify-between">
                    <strong>{f.cause}</strong>
                    <ConfBadge c={f.confidence} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-1"><strong>Evidence:</strong> {f.evidence}</div>
                  <div className="text-xs mt-1"><strong>Fix:</strong> {f.fix}</div>
                  <div className="text-xs mt-1"><strong>Expected impact:</strong> {f.expected_impact}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Section 5 — US Visibility */}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Globe2 className="h-5 w-5" /> 5. US Visibility</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-3 gap-3 text-sm">
              <div>Pinterest sessions 30d: <strong>{data.us_visibility.pinterest_sessions_30d}</strong></div>
              <div>US Pinterest sessions 30d: <strong>{data.us_visibility.us_pinterest_sessions_30d}</strong></div>
              <div>US share: <strong>{data.us_visibility.us_share_pct}%</strong></div>
              <div>US-ready boards (≥50% US): <strong>{data.us_visibility.us_ready_boards}</strong></div>
              <div>Boards with any US signal: <strong>{data.us_visibility.boards_with_any_us_signal}</strong></div>
              <div>Avg board US share: <strong>{data.us_visibility.avg_board_us_share}%</strong></div>
              <div className="md:col-span-3">Estimated US visibility score: <strong>{data.us_visibility.estimated_us_visibility_score}</strong> — {data.us_visibility.notes}</div>
            </CardContent>
          </Card>

          {/* Section 6 — Competitor Intelligence */}
          <Card>
            <CardHeader><CardTitle>6. Competitor Intelligence</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-3">
              <div>Patterns observed: <strong>{data.competitor_intel.summary.patterns_observed}</strong> • Gap opportunities: <strong>{data.competitor_intel.summary.opportunities_ranked}</strong></div>
              {data.competitor_intel.top_patterns.length > 0 && (
                <div>
                  <h4 className="font-semibold">Top patterns (success-ranked)</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="text-left"><th>Type</th><th>Value</th><th>Niche</th><th>Samples</th><th>Avg success</th></tr></thead>
                      <tbody>
                        {data.competitor_intel.top_patterns.slice(0, 15).map((p: any, i: number) => (
                          <tr key={i} className="border-t">
                            <td>{p.pattern_type}</td><td className="max-w-xs truncate">{p.pattern_value}</td>
                            <td>{p.niche_key}</td><td>{p.sample_count}</td><td>{Number(p.avg_success ?? 0).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {data.competitor_intel.gap_opportunities.length > 0 && (
                <div>
                  <h4 className="font-semibold mt-2">Gap opportunities</h4>
                  <ul className="text-xs space-y-0.5">
                    {data.competitor_intel.gap_opportunities.slice(0, 10).map((o: any, i: number) => (
                      <li key={i}>#{o.rank} {o.product_slug} — gap {Number(o.competitor_gap_score ?? 0).toFixed(2)}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 7 — Recommendation Engine */}
          <Card>
            <CardHeader><CardTitle>7. Recommendation Engine (ROI-ranked)</CardTitle></CardHeader>
            <CardContent className="text-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="text-left"><th>#</th><th>P</th><th>Cause</th><th>Fix</th><th>Traffic</th><th>Conv</th><th>Diff</th><th>Conf</th><th>ROI</th></tr></thead>
                  <tbody>
                    {data.recommendations.map((r) => (
                      <tr key={r.rank} className="border-t align-top">
                        <td>{r.rank}</td>
                        <td><PriorityBadge p={r.priority} /></td>
                        <td className="max-w-xs">{r.cause}</td>
                        <td className="max-w-xs">{r.fix}</td>
                        <td>{r.expected_traffic_gain}</td>
                        <td>{r.expected_conversion_gain}</td>
                        <td>{r.difficulty}</td>
                        <td>{r.confidence}</td>
                        <td><strong>{r.roi}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Section 8 — Autonomous Fixes */}
          <Card>
            <CardHeader><CardTitle>8. Autonomous Fixes (plans only — not executed)</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {data.autonomous_fixes.map((f, i) => (
                <div key={i} className="border rounded p-3">
                  <div className="flex items-center justify-between">
                    <strong>{f.issue}</strong>
                    {f.can_auto_fix ? <Badge className="bg-green-600">AUTO-FIXABLE</Badge> : <Badge className="bg-muted">MANUAL</Badge>}
                  </div>
                  <ol className="list-decimal pl-5 mt-1 text-xs space-y-0.5">
                    {f.plan.map((p: string, j: number) => <li key={j}>{p}</li>)}
                  </ol>
                  {f.blocked_by && <div className="text-xs text-red-600 mt-1">Blocked by: {f.blocked_by}</div>}
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="text-xs text-muted-foreground text-center">
            Generated {new Date(data.generated_at).toLocaleString()} • mode: <code>{data.mode}</code> • READ-ONLY — no Pinterest mutations, no analytics writes.
          </div>
        </>
      )}
    </div>
  );
}