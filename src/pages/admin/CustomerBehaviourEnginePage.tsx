import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

// Read-only Customer Behaviour Engine admin lens.
// Uses ONLY existing production evidence. No writes, no mutations.

type Row = Record<string, unknown>;

function Empty({ label = "No data yet" }: { label?: string }) {
  return (
    <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
      {label} — insufficient data
    </div>
  );
}

function ErrorState({ msg }: { msg: string }) {
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
      {msg}
    </div>
  );
}

function useTable<T extends Row = Row>(
  fn: () => Promise<{ data: T[] | null; error: { message: string } | null }>,
  deps: unknown[] = [],
) {
  const [state, setState] = useState<{ loading: boolean; data: T[]; error: string | null }>({
    loading: true, data: [], error: null,
  });
  useEffect(() => {
    let alive = true;
    fn().then((res) => {
      if (!alive) return;
      if (res.error) setState({ loading: false, data: [], error: res.error.message });
      else setState({ loading: false, data: (res.data ?? []) as T[], error: null });
    }).catch((e: unknown) => {
      if (!alive) return;
      setState({ loading: false, data: [], error: e instanceof Error ? e.message : String(e) });
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

// ---------- 1. Visitor clusters ----------
function VisitorClusters() {
  const rhs = useTable<Row>(() =>
    (supabase as any).from("real_human_sessions")
      .select("session_id,last_stage,tsi_classification,first_seen_at")
      .gte("first_seen_at", new Date(Date.now() - 7 * 864e5).toISOString())
      .limit(1000),
  );
  const asq = useTable<Row>(() =>
    (supabase as any).from("analytics_session_quality")
      .select("session_id,time_on_page_ms,page_count,cart_interactions,checkout_interactions,product_interactions,classification")
      .order("updated_at", { ascending: false })
      .limit(1000),
  );

  const buckets = useMemo(() => {
    const qMap = new Map<string, Row>();
    for (const r of asq.data) qMap.set(String(r.session_id), r);
    const counts: Record<string, number> = {
      bounce: 0, curious_browser: 0, researcher: 0, high_intent: 0,
      cart_abandoner: 0, checkout_abandoner: 0, buyer: 0, unknown: 0,
    };
    for (const s of rhs.data) {
      const q = qMap.get(String(s.session_id));
      const stage = String(s.last_stage ?? "");
      const dwell = Number(q?.time_on_page_ms ?? 0);
      const pages = Number(q?.page_count ?? 0);
      const cart = Number(q?.cart_interactions ?? 0);
      const chk = Number(q?.checkout_interactions ?? 0);
      if (stage === "purchase" || s.order_id) counts.buyer++;
      else if (stage === "checkout" || chk > 0) counts.checkout_abandoner++;
      else if (stage === "add_to_cart" || cart > 0) counts.cart_abandoner++;
      else if (dwell > 60_000 && pages >= 3) counts.researcher++;
      else if (dwell > 15_000 || pages >= 2) counts.curious_browser++;
      else if (pages <= 1 && dwell < 5_000) counts.bounce++;
      else counts.unknown++;
    }
    return counts;
  }, [rhs.data, asq.data]);

  if (rhs.error) return <ErrorState msg={`real_human_sessions: ${rhs.error}`} />;
  if (asq.error) return <ErrorState msg={`analytics_session_quality: ${asq.error}`} />;
  if (rhs.loading || asq.loading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  const total = Object.values(buckets).reduce((a, b) => a + b, 0);
  if (total === 0) return <Empty label="No verified human sessions in the last 7 days" />;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {Object.entries(buckets).map(([k, v]) => (
        <Card key={k}>
          <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground capitalize">{k.replace(/_/g, " ")}</CardTitle></CardHeader>
          <CardContent className="pt-0 text-2xl font-semibold tabular-nums">
            {v}
            <div className="text-xs font-normal text-muted-foreground">{total ? Math.round((v / total) * 100) : 0}%</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------- 2. Product intelligence ----------
function ProductIntelligence() {
  const health = useTable<Row>(() =>
    (supabase as any).from("agp_product_health")
      .select("product_id,overall,ctr,cvr,traffic_30d,revenue_30d_cents,priority_tier")
      .order("overall", { ascending: false })
      .limit(50),
  );
  const signals = useTable<Row>(() =>
    (supabase as any).from("agp_signals_daily")
      .select("day,ga_sessions,ga_atc,ga_checkouts,ga_purchases,ga_revenue_cents,pin_impressions,pin_clicks")
      .gte("day", new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10))
      .order("day", { ascending: false })
      .limit(500),
  );

  if (health.error) return <ErrorState msg={`agp_product_health: ${health.error}`} />;
  if (signals.error) return <ErrorState msg={`agp_signals_daily: ${signals.error}`} />;
  if (health.loading || signals.loading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const totals = signals.data.reduce((a, r) => ({
    sessions: a.sessions + Number(r.ga_sessions ?? 0),
    atc: a.atc + Number(r.ga_atc ?? 0),
    checkouts: a.checkouts + Number(r.ga_checkouts ?? 0),
    purchases: a.purchases + Number(r.ga_purchases ?? 0),
    revenue: a.revenue + Number(r.ga_revenue_cents ?? 0),
  }), { sessions: 0, atc: 0, checkouts: 0, purchases: 0, revenue: 0 });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ["Sessions (7d)", totals.sessions],
          ["ATC", totals.atc],
          ["Checkouts", totals.checkouts],
          ["Purchases", totals.purchases],
          ["Revenue", `$${(totals.revenue / 100).toFixed(2)}`],
        ].map(([label, v]) => (
          <Card key={String(label)}>
            <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle></CardHeader>
            <CardContent className="pt-0 text-xl font-semibold tabular-nums">{String(v)}</CardContent>
          </Card>
        ))}
      </div>
      {health.data.length === 0 ? <Empty label="No product health rows" /> : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr><th className="p-2">Product</th><th className="p-2">Health</th><th className="p-2">CTR</th><th className="p-2">CVR</th><th className="p-2">Traffic 30d</th><th className="p-2">Revenue 30d</th><th className="p-2">Tier</th></tr>
            </thead>
            <tbody>
              {health.data.slice(0, 30).map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="p-2 font-mono text-xs">{String(r.product_id).slice(0, 24)}</td>
                  <td className="p-2 tabular-nums">{Number(r.overall ?? 0).toFixed(1)}</td>
                  <td className="p-2 tabular-nums">{(Number(r.ctr ?? 0) * 100).toFixed(2)}%</td>
                  <td className="p-2 tabular-nums">{(Number(r.cvr ?? 0) * 100).toFixed(2)}%</td>
                  <td className="p-2 tabular-nums">{Number(r.traffic_30d ?? 0)}</td>
                  <td className="p-2 tabular-nums">${(Number(r.revenue_30d_cents ?? 0) / 100).toFixed(2)}</td>
                  <td className="p-2"><Badge variant="secondary">{String(r.priority_tier ?? "-")}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------- 3. Pin intelligence ----------
function PinIntelligence() {
  const pins = useTable<Row>(() =>
    (supabase as any).from("pinterest_analytics_daily")
      .select("pin_id,day,impressions,outbound_clicks,saves,engagement_rate,quality_score")
      .gte("day", new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10))
      .order("impressions", { ascending: false })
      .limit(100),
  );
  const lq = useTable<Row>(() =>
    (supabase as any).from("landing_quality_scores")
      .select("url,overall_score,bounce_rate,avg_scroll_depth,human_sessions_24h,audited_at")
      .order("audited_at", { ascending: false })
      .limit(100),
  );

  if (pins.error) return <ErrorState msg={`pinterest_analytics_daily: ${pins.error}`} />;
  if (lq.error) return <ErrorState msg={`landing_quality_scores: ${lq.error}`} />;
  if (pins.loading || lq.loading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <h3 className="mb-2 text-sm font-semibold">Top pins (7d by impressions)</h3>
        {pins.data.length === 0 ? <Empty label="No pin analytics" /> : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr><th className="p-2">Pin</th><th className="p-2">Impr</th><th className="p-2">Clicks</th><th className="p-2">Saves</th><th className="p-2">Eng%</th><th className="p-2">Q</th></tr>
              </thead>
              <tbody>
                {pins.data.slice(0, 25).map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2 font-mono text-xs">{String(r.pin_id).slice(0, 20)}</td>
                    <td className="p-2 tabular-nums">{Number(r.impressions ?? 0)}</td>
                    <td className="p-2 tabular-nums">{Number(r.outbound_clicks ?? 0)}</td>
                    <td className="p-2 tabular-nums">{Number(r.saves ?? 0)}</td>
                    <td className="p-2 tabular-nums">{(Number(r.engagement_rate ?? 0) * 100).toFixed(1)}%</td>
                    <td className="p-2 tabular-nums">{Number(r.quality_score ?? 0).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Landing quality</h3>
        {lq.data.length === 0 ? <Empty label="No landing audits" /> : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr><th className="p-2">URL</th><th className="p-2">Score</th><th className="p-2">Bounce</th><th className="p-2">Scroll</th></tr>
              </thead>
              <tbody>
                {lq.data.slice(0, 25).map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2 text-xs truncate max-w-[240px]" title={String(r.url)}>{String(r.url)}</td>
                    <td className="p-2 tabular-nums">{Number(r.overall_score ?? 0).toFixed(1)}</td>
                    <td className="p-2 tabular-nums">{(Number(r.bounce_rate ?? 0) * 100).toFixed(0)}%</td>
                    <td className="p-2 tabular-nums">{(Number(r.avg_scroll_depth ?? 0) * 100).toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- 4. Journey reconstruction ----------
function JourneyReconstruction() {
  const [input, setInput] = useState("");
  const [sid, setSid] = useState<string | null>(null);
  const events = useTable<Row>(async () => {
    if (!sid) return { data: [], error: null };
    return (supabase as any).from("canonical_events")
      .select("occurred_at,canonical_name,page_path,product_id,utm_source,utm_medium,value_cents,currency,country,device")
      .eq("session_id", sid)
      .order("occurred_at", { ascending: true })
      .limit(500);
  }, [sid]);

  return (
    <div className="space-y-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => { e.preventDefault(); setSid(input.trim() || null); }}
      >
        <Input placeholder="Enter session_id" value={input} onChange={(e) => setInput(e.target.value)} />
        <Button type="submit" variant="secondary">Load</Button>
      </form>
      {!sid ? <Empty label="Enter a session_id to reconstruct its journey" /> :
        events.error ? <ErrorState msg={events.error} /> :
        events.loading ? <div className="text-sm text-muted-foreground">Loading…</div> :
        events.data.length === 0 ? <Empty label={`No events for session ${sid}`} /> : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr><th className="p-2">When</th><th className="p-2">Event</th><th className="p-2">Path</th><th className="p-2">Product</th><th className="p-2">UTM</th><th className="p-2">Value</th></tr>
              </thead>
              <tbody>
                {events.data.map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2 whitespace-nowrap text-xs">{new Date(String(r.occurred_at)).toLocaleTimeString()}</td>
                    <td className="p-2"><Badge variant="outline">{String(r.canonical_name)}</Badge></td>
                    <td className="p-2 text-xs">{String(r.page_path ?? "")}</td>
                    <td className="p-2 font-mono text-xs">{r.product_id ? String(r.product_id).slice(0, 20) : ""}</td>
                    <td className="p-2 text-xs">{[r.utm_source, r.utm_medium].filter(Boolean).join(" / ")}</td>
                    <td className="p-2 tabular-nums">{r.value_cents ? `${(Number(r.value_cents) / 100).toFixed(2)} ${r.currency ?? ""}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}

// ---------- 5. Top exits / friction ----------
function FrictionPanel() {
  const ux = useTable<Row>(() =>
    (supabase as any).from("cro_ux_signals")
      .select("created_at,path,signal_type,payload,device")
      .gte("created_at", new Date(Date.now() - 7 * 864e5).toISOString())
      .order("created_at", { ascending: false })
      .limit(500),
  );
  const errs = useTable<Row>(() =>
    (supabase as any).from("frontend_error_logs")
      .select("created_at,error_type,error_message,component_name,page_url")
      .gte("created_at", new Date(Date.now() - 7 * 864e5).toISOString())
      .order("created_at", { ascending: false })
      .limit(200),
  );

  if (ux.error) return <ErrorState msg={`cro_ux_signals: ${ux.error}`} />;
  if (errs.error) return <ErrorState msg={`frontend_error_logs: ${errs.error}`} />;
  if (ux.loading || errs.loading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const byType: Record<string, number> = {};
  const byPath: Record<string, number> = {};
  for (const r of ux.data) {
    const t = String(r.signal_type);
    byType[t] = (byType[t] ?? 0) + 1;
    const p = String(r.path ?? "");
    byPath[p] = (byPath[p] ?? 0) + 1;
  }
  const topPaths = Object.entries(byPath).sort((a, b) => b[1] - a[1]).slice(0, 10);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">UX signals (7d)</h3>
        {ux.data.length === 0 ? <Empty /> : (
          <>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {Object.entries(byType).map(([k, v]) => (
                <Card key={k}><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground capitalize">{k.replace(/_/g, " ")}</CardTitle></CardHeader><CardContent className="pt-0 text-lg font-semibold tabular-nums">{v}</CardContent></Card>
              ))}
            </div>
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground"><tr><th className="p-2">Path</th><th className="p-2">Signals</th></tr></thead>
                <tbody>{topPaths.map(([p, c]) => (
                  <tr key={p} className="border-t"><td className="p-2 text-xs">{p || "(unknown)"}</td><td className="p-2 tabular-nums">{c}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </>
        )}
      </div>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Frontend errors (7d)</h3>
        {errs.data.length === 0 ? <Empty label="No frontend errors" /> : (
          <div className="rounded-md border max-h-[420px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground sticky top-0"><tr><th className="p-2">When</th><th className="p-2">Type</th><th className="p-2">Message</th></tr></thead>
              <tbody>
                {errs.data.slice(0, 100).map((r, i) => (
                  <tr key={i} className="border-t align-top">
                    <td className="p-2 whitespace-nowrap text-xs">{new Date(String(r.created_at)).toLocaleString()}</td>
                    <td className="p-2 text-xs"><Badge variant="outline">{String(r.error_type ?? "")}</Badge></td>
                    <td className="p-2 text-xs">{String(r.error_message ?? "").slice(0, 200)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- 6. Root causes ----------
function RootCauses() {
  const rc = useTable<Row>(() =>
    (supabase as any).from("cie_root_cause_analyses")
      .select("created_at,subject,hypothesis,category,confidence,status,evidence,suggested_fix")
      .order("created_at", { ascending: false })
      .limit(50),
  );
  const val = useTable<Row>(() =>
    (supabase as any).from("agal_root_cause_validations")
      .select("created_at,claim,independent_verdict,agreement,confidence,evidence,upstream_engine")
      .order("created_at", { ascending: false })
      .limit(50),
  );

  if (rc.error) return <ErrorState msg={`cie_root_cause_analyses: ${rc.error}`} />;
  if (val.error) return <ErrorState msg={`agal_root_cause_validations: ${val.error}`} />;
  if (rc.loading || val.loading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <h3 className="mb-2 text-sm font-semibold">CIE root causes</h3>
        {rc.data.length === 0 ? <Empty /> : (
          <div className="space-y-2">
            {rc.data.slice(0, 20).map((r, i) => (
              <Card key={i}>
                <CardHeader className="pb-1">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>{String(r.subject ?? "-")}</span>
                    <Badge variant="secondary">{Math.round(Number(r.confidence ?? 0) * 100)}%</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-xs text-muted-foreground space-y-1">
                  <div><span className="font-medium text-foreground">Hypothesis:</span> {String(r.hypothesis ?? "")}</div>
                  <div className="flex gap-2"><Badge variant="outline">{String(r.category ?? "")}</Badge><Badge variant="outline">{String(r.status ?? "")}</Badge></div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Independent validations</h3>
        {val.data.length === 0 ? <Empty /> : (
          <div className="space-y-2">
            {val.data.slice(0, 20).map((r, i) => (
              <Card key={i}>
                <CardHeader className="pb-1">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span className="truncate">{String(r.claim ?? "-").slice(0, 80)}</span>
                    <Badge variant={r.agreement ? "secondary" : "destructive"}>{r.agreement ? "agree" : "disagree"}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-xs text-muted-foreground">
                  <div>Engine: {String(r.upstream_engine ?? "")}</div>
                  <div>Verdict: {String(r.independent_verdict ?? "")}</div>
                  <div>Confidence: {Math.round(Number(r.confidence ?? 0) * 100)}%</div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CustomerBehaviourEnginePage() {
  return (
    <div className="container mx-auto space-y-6 py-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Customer Behaviour Engine</h1>
        <p className="text-sm text-muted-foreground">
          Read-only lens over existing production evidence. No writes, no automated changes.
        </p>
      </div>
      <Tabs defaultValue="clusters" className="w-full">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="clusters">Visitor clusters</TabsTrigger>
          <TabsTrigger value="products">Product intelligence</TabsTrigger>
          <TabsTrigger value="pins">Pin intelligence</TabsTrigger>
          <TabsTrigger value="journey">Journey</TabsTrigger>
          <TabsTrigger value="friction">Friction &amp; errors</TabsTrigger>
          <TabsTrigger value="root">Root causes</TabsTrigger>
        </TabsList>
        <TabsContent value="clusters"><VisitorClusters /></TabsContent>
        <TabsContent value="products"><ProductIntelligence /></TabsContent>
        <TabsContent value="pins"><PinIntelligence /></TabsContent>
        <TabsContent value="journey"><JourneyReconstruction /></TabsContent>
        <TabsContent value="friction"><FrictionPanel /></TabsContent>
        <TabsContent value="root"><RootCauses /></TabsContent>
      </Tabs>
    </div>
  );
}