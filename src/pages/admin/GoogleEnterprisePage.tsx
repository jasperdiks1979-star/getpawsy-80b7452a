import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { useGoogleEnterprise, runGeipSync, runGeipHealthScore, runGeipAlerts, runGeipOrganicGrowth, askGeipCopilot } from "@/hooks/useGoogleEnterprise";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

function StatusBadge({ status, blocker }: { status: string; blocker?: string }) {
  const map: Record<string, string> = {
    ready: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    ok: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    waiting_for_auth: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    disabled: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
    error: "bg-red-500/15 text-red-700 dark:text-red-300",
    partial: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    running: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  };
  return <Badge className={map[status] ?? ""} variant="outline">{status}{blocker ? ` · ${blocker}` : ""}</Badge>;
}

function Kpi({ label, value, suffix }: { label: string; value: string | number; suffix?: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}{suffix ? <span className="text-sm text-muted-foreground ml-1">{suffix}</span> : null}</div>
    </CardContent></Card>
  );
}

export default function GoogleEnterprisePage() {
  const q = useGoogleEnterprise();
  const [question, setQuestion] = useState("Why did organic traffic change in the last 7 days?");
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  async function trigger(fn: () => Promise<any>, label: string) {
    try {
      toast.loading(`${label} running...`, { id: label });
      const res = await fn();
      toast.success(`${label}: ${res?.ok ? "ok" : res?.blocker ?? "done"}`, { id: label });
      q.refetch();
    } catch (e: any) {
      toast.error(`${label} failed: ${e.message ?? e}`, { id: label });
    }
  }

  const d = q.data;
  return (
    <>
      <Helmet><title>Google Enterprise Intelligence | GetPawsy Admin</title></Helmet>
      <div className="p-6 space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Google Enterprise Intelligence</h1>
            <p className="text-sm text-muted-foreground">Layer-0 canonical Google intelligence. Read-only. Zero fabrication.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => trigger(() => runGeipSync("search-console"), "GSC sync")}>Sync GSC</Button>
            <Button size="sm" variant="outline" onClick={() => trigger(() => runGeipSync("ga4"), "GA4 sync")}>Sync GA4</Button>
            <Button size="sm" variant="outline" onClick={() => trigger(() => runGeipSync("merchant"), "Merchant sync")}>Sync Merchant</Button>
            <Button size="sm" variant="outline" onClick={() => trigger(() => runGeipSync("pagespeed"), "PageSpeed sync")}>Sync PageSpeed</Button>
            <Button size="sm" variant="outline" onClick={() => trigger(() => runGeipSync("url-inspection"), "URL Inspection")}>URL Inspection</Button>
            <Button size="sm" variant="outline" onClick={() => trigger(() => runGeipSync("technical-seo"), "Tech SEO")}>Technical SEO</Button>
            <Button size="sm" variant="outline" onClick={() => trigger(runGeipHealthScore, "Health Score")}>Recompute Health</Button>
            <Button size="sm" variant="outline" onClick={() => trigger(runGeipAlerts, "Alerts")}>Run Alerts</Button>
            <Button size="sm" variant="outline" onClick={() => trigger(runGeipOrganicGrowth, "Growth Engine")}>Growth Engine</Button>
          </div>
        </header>

        {q.isLoading && <div className="text-muted-foreground">Loading canonical Google intelligence…</div>}
        {q.error && <div className="text-red-600">Failed to load: {String((q.error as Error).message)}</div>}

        {d && (
          <>
            <section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <Kpi label="Google Health" value={d.health.latest?.overall?.toFixed?.(0) ?? "—"} suffix="/100" />
              <Kpi label="GSC clicks (30d)" value={d.gsc.totals.reduce((a, r) => a + (r.clicks | 0), 0)} />
              <Kpi label="Impressions (30d)" value={d.gsc.totals.reduce((a, r) => a + (r.impressions | 0), 0)} />
              <Kpi label="Merchant approved" value={`${d.merchant.aggregate.approved}/${d.merchant.aggregate.total || "—"}`} />
              <Kpi label="Active alerts" value={d.alerts.length} />
              <Kpi label="Opportunities" value={d.opportunities.length} />
            </section>

            <Card>
              <CardHeader><CardTitle className="text-base">Google Enterprise Gateway</CardTitle></CardHeader>
              <CardContent className="grid md:grid-cols-3 gap-3">
                {d.connections.map((c) => (
                  <div key={c.surface} className="border rounded-md p-3 flex items-center justify-between">
                    <div>
                      <div className="font-medium capitalize">{c.surface.replace(/_/g, " ")}</div>
                      <div className="text-xs text-muted-foreground">{c.last_ok_at ? `ok ${new Date(c.last_ok_at).toLocaleString()}` : "never confirmed"}</div>
                    </div>
                    <StatusBadge status={c.status} blocker={c.blocker ?? undefined} />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Tabs defaultValue="executive">
              <TabsList className="flex flex-wrap h-auto">
                {["executive","gsc","indexation","merchant","ga4","pagespeed","technical","aisearch","growth","health","monitoring","copilot"].map((k) => (
                  <TabsTrigger key={k} value={k} className="capitalize">{k === "aisearch" ? "AI Search" : k}</TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="executive" className="space-y-3 mt-4">
                <Card><CardHeader><CardTitle className="text-base">Top opportunities</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {d.opportunities.slice(0, 10).map((o) => (
                      <div key={o.id} className="flex justify-between border-b pb-1 text-sm">
                        <span className="truncate max-w-md">{o.kind} — {o.target_url ?? o.evidence?.query ?? "(page)"}</span>
                        <span className="text-muted-foreground">+{o.expected_traffic_lift ?? 0} clicks · conf {o.confidence}</span>
                      </div>
                    ))}
                    {!d.opportunities.length && <div className="text-muted-foreground text-sm">No opportunities yet — Growth Engine remains dormant until readiness thresholds met.</div>}
                  </CardContent>
                </Card>
                <Card><CardHeader><CardTitle className="text-base">Active alerts</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {d.alerts.slice(0, 15).map((a) => (
                      <div key={a.id} className="flex justify-between text-sm border-b pb-1">
                        <span><Badge variant="outline" className="mr-2">{a.severity}</Badge>{a.title}</span>
                        <span className="text-muted-foreground text-xs">{a.source}</span>
                      </div>
                    ))}
                    {!d.alerts.length && <div className="text-muted-foreground text-sm">No active alerts.</div>}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="gsc" className="mt-4 space-y-3">
                <Card><CardHeader><CardTitle className="text-base">Top queries</CardTitle></CardHeader><CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {d.gsc.top_queries.slice(0, 20).map((r, i) => (
                      <div key={i} className="flex justify-between text-sm border-b pb-1">
                        <span className="truncate">{r.dimension_value}</span>
                        <span className="text-muted-foreground">{r.clicks}c · {r.impressions}i · pos {Number(r.position).toFixed(1)}</span>
                      </div>
                    ))}
                    {!d.gsc.top_queries.length && <div className="text-muted-foreground text-sm">No GSC data yet. Link the Google Search Console connector and run Sync GSC.</div>}
                  </div>
                </CardContent></Card>
                <Card><CardHeader><CardTitle className="text-base">Top pages</CardTitle></CardHeader><CardContent className="space-y-1">
                  {d.gsc.top_pages.slice(0, 20).map((r, i) => (
                    <div key={i} className="flex justify-between text-sm border-b pb-1">
                      <span className="truncate max-w-md">{r.dimension_value}</span>
                      <span className="text-muted-foreground">{r.clicks}c · pos {Number(r.position).toFixed(1)}</span>
                    </div>
                  ))}
                </CardContent></Card>
              </TabsContent>

              <TabsContent value="indexation" className="mt-4">
                <Card><CardHeader><CardTitle className="text-base">URL Inspection sample</CardTitle></CardHeader><CardContent>
                  {!d.indexation.url_inspection.length && <div className="text-muted-foreground text-sm">No inspections yet.</div>}
                  {d.indexation.url_inspection.map((r, i) => (
                    <div key={i} className="flex justify-between text-sm border-b py-1">
                      <span className="truncate max-w-md">{r.url}</span>
                      <span className="text-muted-foreground text-xs">{r.verdict} · {r.coverage_state}</span>
                    </div>
                  ))}
                </CardContent></Card>
              </TabsContent>

              <TabsContent value="merchant" className="mt-4 space-y-3">
                <div className="grid grid-cols-4 gap-3">
                  <Kpi label="Total" value={d.merchant.aggregate.total} />
                  <Kpi label="Approved" value={d.merchant.aggregate.approved} />
                  <Kpi label="Disapproved" value={d.merchant.aggregate.disapproved} />
                  <Kpi label="Pending" value={d.merchant.aggregate.pending} />
                </div>
                {!d.merchant.aggregate.total && <div className="text-muted-foreground text-sm">Merchant Center is waiting for the existing OAuth token. Run Sync Merchant to test the current connection, or complete OAuth via the merchant-oauth-start edge function.</div>}
              </TabsContent>

              <TabsContent value="ga4" className="mt-4 space-y-3">
                {Object.entries(d.ga4.by_channel).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-sm border-b pb-1">
                    <span>{k}</span>
                    <span className="text-muted-foreground">{v.sessions} sessions · {v.purchases} purchases · ${(v.revenue_cents / 100).toFixed(2)}</span>
                  </div>
                ))}
                {!Object.keys(d.ga4.by_channel).length && <div className="text-muted-foreground text-sm">GA4 is waiting for GA4_SERVICE_ACCOUNT_JSON + GA4_PROPERTY_ID.</div>}
              </TabsContent>

              <TabsContent value="pagespeed" className="mt-4 space-y-2">
                {d.pagespeed.map((r, i) => (
                  <div key={i} className="flex justify-between text-sm border-b pb-1">
                    <span className="truncate max-w-sm">{r.url} <Badge variant="outline" className="ml-1">{r.strategy}</Badge></span>
                    <span className="text-muted-foreground">perf {r.performance?.toFixed?.(0) ?? "—"} · LCP {r.lcp_ms}ms · CLS {Number(r.cls ?? 0).toFixed(2)} · INP {r.inp_ms}ms</span>
                  </div>
                ))}
                {!d.pagespeed.length && <div className="text-muted-foreground text-sm">Add PAGESPEED_API_KEY and run Sync PageSpeed.</div>}
              </TabsContent>

              <TabsContent value="technical" className="mt-4 space-y-2">
                {d.technical_seo.map((r: any) => (
                  <div key={r.id} className="flex justify-between text-sm border-b pb-1">
                    <span className="truncate max-w-md">{r.url}</span>
                    <span className="text-muted-foreground text-xs">title {r.has_title ? "✓" : "✗"} · desc {r.has_description ? "✓" : "✗"} · canonical {r.has_canonical ? "✓" : "✗"} · schema {r.schema_types?.length ?? 0}</span>
                  </div>
                ))}
                {!d.technical_seo.length && <div className="text-muted-foreground text-sm">Run Technical SEO sync.</div>}
              </TabsContent>

              <TabsContent value="aisearch" className="mt-4 space-y-2">
                {d.ai_search.map((r: any) => (
                  <div key={r.id} className="flex justify-between text-sm border-b pb-1">
                    <span className="truncate max-w-md">{r.url}</span>
                    <span className="text-muted-foreground text-xs">FAQ {r.has_faq ? "✓" : "✗"} · HowTo {r.has_howto ? "✓" : "✗"} · Product {r.has_product ? "✓" : "✗"} · Review {r.has_review ? "✓" : "✗"} · AI Overview {r.ai_overview_ready ? "ready" : "—"}</span>
                  </div>
                ))}
                {!d.ai_search.length && <div className="text-muted-foreground text-sm">Run Technical SEO to populate AI-search signals.</div>}
              </TabsContent>

              <TabsContent value="growth" className="mt-4 space-y-2">
                {!d.readiness?.organic_growth_ready && (
                  <div className="text-sm text-muted-foreground">
                    Learning phase — GSC {d.readiness?.gsc_days ?? 0}/{d.readiness?.gsc_target ?? 14} days · GA4 {d.readiness?.ga4_days ?? 0}/{d.readiness?.ga4_target ?? 14} days.
                    Organic Growth Engine activates automatically once thresholds are met.
                  </div>
                )}
                {d.opportunities.map((o) => (
                  <div key={o.id} className="border rounded-md p-3 text-sm">
                    <div className="flex justify-between"><span className="font-medium">{o.kind}</span><span className="text-muted-foreground">confidence {o.confidence}</span></div>
                    <div className="text-muted-foreground truncate">{o.target_url}</div>
                    <div className="text-xs text-muted-foreground mt-1">Expected +{o.expected_traffic_lift ?? 0} clicks · ${(Number(o.expected_revenue_cents ?? 0) / 100).toFixed(2)} · evidence: {Object.keys(o.evidence ?? {}).join(", ")}</div>
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="health" className="mt-4">
                <Card><CardHeader><CardTitle className="text-base">Health sub-scores</CardTitle></CardHeader><CardContent>
                  {!d.health.latest && <div className="text-muted-foreground text-sm">No health score yet — click Recompute Health.</div>}
                  {d.health.latest && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {["search_console","merchant","seo","index_score","schema_score","pagespeed","ai_search","eeat","trust","organic_growth","overall"].map((k) => (
                        <div key={k} className="border rounded-md p-3">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">{k.replace(/_/g," ")}</div>
                          <div className="text-xl font-semibold">{Number((d.health.latest as any)[k] ?? 0).toFixed(0)}</div>
                          <div className="text-xs text-muted-foreground mt-1">{(d.health.latest.why as any)?.[k] ?? ""}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent></Card>
              </TabsContent>

              <TabsContent value="monitoring" className="mt-4">
                <Card><CardHeader><CardTitle className="text-base">Sync runs (last 80)</CardTitle></CardHeader><CardContent className="text-sm">
                  {d.sync_runs.map((r, i) => (
                    <div key={i} className="flex justify-between border-b py-1">
                      <span>{r.source}</span>
                      <span className="text-muted-foreground text-xs">{r.status}{r.blocker ? ` · ${r.blocker}` : ""} · {r.rows_ingested ?? 0} rows · {new Date(r.started_at).toLocaleString()}</span>
                    </div>
                  ))}
                </CardContent></Card>
              </TabsContent>

              <TabsContent value="copilot" className="mt-4 space-y-3">
                {!d.readiness?.copilot_ready && (
                  <div className="text-sm text-muted-foreground">
                    Copilot dormant — GSC {d.readiness?.gsc_days ?? 0}/{d.readiness?.gsc_target ?? 14}d · GA4 {d.readiness?.ga4_days ?? 0}/{d.readiness?.ga4_target ?? 14}d · Inspections {d.readiness?.url_inspections ?? 0}/{d.readiness?.url_inspections_target ?? 50}.
                    Activates automatically once thresholds met — no migration required.
                  </div>
                )}
                <div className="flex gap-2">
                  <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask the Copilot..." />
                  <Button disabled={asking} onClick={async () => {
                    setAsking(true); setAnswer(null);
                    try {
                      const r = await askGeipCopilot(question);
                      if (r?.dormant) setAnswer("Copilot is dormant. " + JSON.stringify(r.readiness));
                      else setAnswer(r?.answer ?? JSON.stringify(r));
                    } catch (e: any) { setAnswer("Error: " + (e.message ?? e)); } finally { setAsking(false); }
                  }}>Ask</Button>
                </div>
                {answer && <Card><CardContent className="p-4 whitespace-pre-wrap text-sm">{answer}</CardContent></Card>}
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </>
  );
}