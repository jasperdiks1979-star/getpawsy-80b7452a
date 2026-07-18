import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Activity, Compass, ShieldCheck, RefreshCw, Loader2, Award, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import QualityAndGatesPanel from "@/components/admin/QualityAndGatesPanel";
import { CanonicalKpiStrip } from "@/components/admin/CanonicalKpiStrip";
import { V2EnvelopeBadge } from "@/components/admin/V2EnvelopeBadge";
import { useCanonicalFunnel } from "@/hooks/useCanonicalFunnel";

type Overview = {
  total_sessions: number;
  reached_atc: number;
  reached_checkout: number;
  reached_purchase: number;
  intent_distribution: Record<string, number>;
  abandonment_distribution: Record<string, number>;
  channel_conversion: Array<{ channel: string; sessions: number; buyers: number; conversion_pct: number }>;
  journey_completeness_pct: number;
  behaviour_classification_pct: number;
  abandonment_classification_pct: number;
  trust_classification_pct: number;
  unknown_journey_pct: number;
  avg_intent_confidence: number;
  avg_abandon_confidence: number;
};

type LiveJourney = {
  session_id: string;
  classified_channel: string | null;
  intent_class: string | null;
  intent_confidence: number | null;
  abandonment_reason: string | null;
  duration_ms: number;
  event_count: number;
  page_count: number;
  entry_page: string | null;
  exit_page: string | null;
  country: string | null;
  device: string | null;
  reached_atc: boolean;
  reached_checkout: boolean;
  reached_purchase: boolean;
  last_seen: string;
  stage_sequence: string[];
};

const intentColor: Record<string, string> = {
  Buyer: "bg-emerald-600",
  "Returning Customer": "bg-emerald-500",
  "High Purchase Intent": "bg-amber-500",
  "Abandoned Cart": "bg-orange-500",
  "Checkout Hesitation": "bg-rose-500",
  "Comparison Shopper": "bg-sky-500",
  "Research Visitor": "bg-blue-500",
  "Window Shopper": "bg-slate-500",
  "Low Intent": "bg-slate-400",
  Unknown: "bg-muted",
};

async function invoke(action: string, params: Record<string, string> = {}) {
  const q = new URLSearchParams({ action, ...params });
  const { data, error } = await supabase.functions.invoke(`revenue-attribution?${q.toString()}`, {
    method: "GET",
  } as any);
  if (error) throw error;
  return data as any;
}

export default function CustomerJourneyCenterPage() {
  const [days, setDays] = useState("7");
  const [loading, setLoading] = useState(true);
  const [certifying, setCertifying] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [live, setLive] = useState<LiveJourney[]>([]);
  const [paths, setPaths] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<any | null>(null);

  // PR-2 slice 2: business KPIs must come from analytics-canonical, NOT from
  // `cjie_session_journeys`. CJIE is retained below as diagnostic-only
  // (per-session timelines, intent/abandonment distributions, paths). The
  // top KPI grid (sessions / ATC / checkout / purchases / revenue / CVR) is
  // driven by `useCanonicalFunnel` with a matching time window so parity
  // with every other admin dashboard is guaranteed by construction.
  const hours = Math.max(1, Number(days) || 7) * 24;
  const canonical = useCanonicalFunnel({ hours, geo: "all" });
  const t = canonical.data?.totals;
  const fmt = (n: number | undefined) => (n ?? 0).toLocaleString();
  const money = (n: number | undefined, ccy: string | undefined) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: (ccy || "EUR").toUpperCase() }).format(n ?? 0);

  const load = async () => {
    setLoading(true);
    try {
      const [ov, lv, pt, pr, qs] = await Promise.all([
        invoke("cjie_overview", { days }),
        invoke("cjie_live"),
        invoke("cjie_paths"),
        invoke("cjie_products"),
        invoke("cjie_questions", { days }),
      ]);
      setOverview(ov.overview);
      setLive(lv.live);
      setPaths(pt.paths);
      setProducts(pr.products);
      setQuestions(qs.questions);
    } catch (e: any) {
      toast.error(`Failed to load: ${e.message ?? e}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(() => invoke("cjie_live").then((r) => setLive(r.live)).catch(() => {}), 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  useEffect(() => {
    if (!selected) return;
    invoke("cjie_session", { session_id: selected }).then((r) => setDetail(r)).catch(() => setDetail(null));
  }, [selected]);

  const runCertify = async () => {
    setCertifying(true);
    try {
      const r = await invoke("cjie_certify", { days });
      toast.success(`Certification signed · ${r.hash.slice(0, 12)}…`);
    } catch (e: any) {
      toast.error(`Certify failed: ${e.message ?? e}`);
    } finally {
      setCertifying(false);
    }
  };

  const intentRows = useMemo(() =>
    Object.entries(overview?.intent_distribution ?? {}).sort((a, b) => b[1] - a[1]),
  [overview]);
  const abandonRows = useMemo(() =>
    Object.entries(overview?.abandonment_distribution ?? {}).sort((a, b) => b[1] - a[1]),
  [overview]);

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <CanonicalKpiStrip defaultRange="24h" title="Canonical truth — Customer Journey" />
      <V2EnvelopeBadge hours={hours} geo="all" label="Traffic quality (Customer Journey)" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold flex items-center gap-2">
            <Compass className="h-7 w-7 text-primary" />
            Customer Journey Center
          </h1>
          <p className="text-sm text-muted-foreground">
            CJIE — every visitor becomes explainable. Evidence-only classification, SHA-256 certified.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">24 hours</SelectItem>
              <SelectItem value="7">7 days</SelectItem>
              <SelectItem value="30">30 days</SelectItem>
              <SelectItem value="90">90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          <Button size="sm" onClick={runCertify} disabled={certifying}>
            {certifying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
            Certify (SHA-256)
          </Button>
        </div>
      </div>

      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <MetricCard label="Journey Completeness" value={`${overview.journey_completeness_pct}%`} />
          <MetricCard label="Behaviour Classified" value={`${overview.behaviour_classification_pct}%`} />
          <MetricCard label="Abandonment Classified" value={`${overview.abandonment_classification_pct}%`} />
          <MetricCard label="Trust Interactions" value={`${overview.trust_classification_pct}%`} />
          <MetricCard label="Unknown Journey" value={`${overview.unknown_journey_pct}%`} accent={overview.unknown_journey_pct > 20} />
        </div>
      )}

      {/* Business KPIs — canonical truth. Same source as CanonicalKpiStrip,
          Funnel Health, Sales Commander, World Map. */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold">Business KPIs · analytics-canonical</h2>
          <Badge variant="outline" className="text-[10px]">
            source: analytics-canonical · window: {hours}h · clean
          </Badge>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <MetricCard label="Sessions"    value={fmt(t?.sessions)} />
          <MetricCard label="Add-to-cart" value={fmt(t?.add_to_cart)} />
          <MetricCard label="Checkout"    value={fmt(t?.checkout_started)} />
          <MetricCard label="Purchases"   value={fmt(t?.purchases)} accent />
          <MetricCard label="Revenue"     value={money(t?.revenue, t?.currency)} accent />
          <MetricCard label="CVR"         value={`${(t?.conversion_rate ?? 0).toFixed(2)}%`} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-2">
          <MetricCard
            label="ATC rate"
            value={t && t.sessions > 0 ? `${((t.add_to_cart / t.sessions) * 100).toFixed(2)}%` : "0%"}
          />
          <MetricCard
            label="Checkout rate"
            value={t && t.sessions > 0 ? `${((t.checkout_started / t.sessions) * 100).toFixed(2)}%` : "0%"}
          />
          <MetricCard
            label="Purchase rate"
            value={t && t.sessions > 0 ? `${((t.purchases / t.sessions) * 100).toFixed(2)}%` : "0%"}
          />
        </div>
        {canonical.error && (
          <p className="text-xs text-destructive mt-2">
            canonical error: {(canonical.error as Error).message}
          </p>
        )}
      </div>

      {/* CJIE diagnostic-only totals — kept for parity investigation, never
          used as business KPIs. Any drift vs canonical above indicates an
          instrumentation gap in `cjie_session_journeys` and is expected. */}
      {overview && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-muted-foreground">CJIE diagnostic totals (per-session classifier)</h2>
            <Badge variant="secondary" className="text-[10px]">diagnostic-only · not a KPI</Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 opacity-80">
            <MetricCard label="CJIE sessions"   value={overview.total_sessions.toString()} />
            <MetricCard label="CJIE add-to-cart" value={overview.reached_atc.toString()} />
            <MetricCard label="CJIE checkout"    value={overview.reached_checkout.toString()} />
            <MetricCard label="CJIE purchases"   value={overview.reached_purchase.toString()} />
          </div>
        </div>
      )}

      <Tabs defaultValue="live">
        <TabsList>
          <TabsTrigger value="live"><Activity className="h-4 w-4 mr-1" />Live journeys</TabsTrigger>
          <TabsTrigger value="intent">Intent & Abandonment</TabsTrigger>
          <TabsTrigger value="paths">Journey paths</TabsTrigger>
          <TabsTrigger value="products">Product health</TabsTrigger>
          <TabsTrigger value="quality">Quality & Gates</TabsTrigger>
          <TabsTrigger value="questions">Ask Genesis</TabsTrigger>
        </TabsList>

        <TabsContent value="live" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Last 30 min · click any session for full timeline</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="[&>th]:text-left [&>th]:py-2 [&>th]:pr-3">
                      <th>When</th><th>Channel</th><th>Intent</th><th>Stage</th>
                      <th>Country</th><th>Device</th><th>Duration</th><th>Events</th><th>Entry</th>
                    </tr>
                  </thead>
                  <tbody>
                    {live.map((r) => (
                      <tr key={r.session_id} className="border-t hover:bg-muted/40 cursor-pointer" onClick={() => setSelected(r.session_id)}>
                        <td className="py-2 pr-3 text-xs text-muted-foreground">{new Date(r.last_seen).toLocaleTimeString()}</td>
                        <td className="py-2 pr-3">{r.classified_channel ?? "unknown"}</td>
                        <td className="py-2 pr-3">
                          <Badge className={`${intentColor[r.intent_class ?? "Unknown"] ?? "bg-muted"} text-white`}>
                            {r.intent_class ?? "Unknown"}
                          </Badge>
                        </td>
                        <td className="py-2 pr-3">
                          {r.reached_purchase ? "Purchase" : r.reached_checkout ? "Checkout" : r.reached_atc ? "Cart" : "Browse"}
                        </td>
                        <td className="py-2 pr-3">{r.country ?? "—"}</td>
                        <td className="py-2 pr-3">{r.device ?? "—"}</td>
                        <td className="py-2 pr-3">{Math.round(r.duration_ms / 1000)}s</td>
                        <td className="py-2 pr-3">{r.event_count}</td>
                        <td className="py-2 pr-3 truncate max-w-[240px]" title={r.entry_page ?? ""}>{r.entry_page ?? "—"}</td>
                      </tr>
                    ))}
                    {live.length === 0 && (
                      <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">No sessions in the last 30 minutes.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="intent" className="mt-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Intent distribution</CardTitle></CardHeader>
              <CardContent className="space-y-1">
                {intentRows.map(([name, count]) => (
                  <RowBar key={name} label={name} value={count} total={overview?.total_sessions ?? 0} colorClass={intentColor[name] ?? "bg-primary"} />
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Abandonment reasons</CardTitle></CardHeader>
              <CardContent className="space-y-1">
                {abandonRows.map(([name, count]) => (
                  <RowBar key={name} label={name} value={count} total={overview?.total_sessions ?? 0} colorClass="bg-orange-500" />
                ))}
                {abandonRows.length === 0 && <p className="text-sm text-muted-foreground">No abandonments in window.</p>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="paths" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Top journey paths (stage sequences)</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="[&>th]:text-left [&>th]:py-2 [&>th]:pr-3">
                      <th>Path</th><th>Sessions</th><th>Purchases</th><th>Conversion</th><th>Avg duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paths.map((p: any, i: number) => (
                      <tr key={i} className="border-t">
                        <td className="py-2 pr-3 font-mono text-xs">{p.path}</td>
                        <td className="py-2 pr-3">{p.sessions}</td>
                        <td className="py-2 pr-3">{p.purchases}</td>
                        <td className="py-2 pr-3">
                          <Badge variant={p.conversion_pct > 0 ? "default" : "secondary"}>{p.conversion_pct}%</Badge>
                        </td>
                        <td className="py-2 pr-3">{p.avg_duration_sec}s</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Product journey health (30d)</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="[&>th]:text-left [&>th]:py-2 [&>th]:pr-3">
                      <th>Product</th><th>Views</th><th>Uniq</th><th>ATC</th><th>Checkout</th><th>Purchases</th>
                      <th>ATC %</th><th>Purchase %</th><th>Lost post-ATC</th><th>Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.slice(0, 50).map((p: any) => (
                      <tr key={p.product_id} className="border-t">
                        <td className="py-2 pr-3 font-mono text-xs">{p.product_id}</td>
                        <td className="py-2 pr-3">{p.views}</td>
                        <td className="py-2 pr-3">{p.unique_viewers}</td>
                        <td className="py-2 pr-3">{p.atc_sessions}</td>
                        <td className="py-2 pr-3">{p.checkout_sessions}</td>
                        <td className="py-2 pr-3">{p.purchase_sessions}</td>
                        <td className="py-2 pr-3">{p.atc_rate_pct}%</td>
                        <td className="py-2 pr-3">{p.purchase_rate_pct}%</td>
                        <td className="py-2 pr-3">
                          {p.lost_after_atc > 0 && <Badge variant="destructive">{p.lost_after_atc}</Badge>}
                          {p.lost_after_atc === 0 && <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="py-2 pr-3"><Badge variant="outline">{p.confidence}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="questions" className="mt-4">
          <div className="grid md:grid-cols-2 gap-4">
            <QuestionCard title="Best converting journey" body={
              questions?.best_converting_journey
                ? <><p className="font-mono text-xs mb-1">{questions.best_converting_journey.path}</p>
                    <p className="text-sm">{questions.best_converting_journey.sessions} sessions · {questions.best_converting_journey.conversion_pct}% CVR</p></>
                : <p className="text-muted-foreground text-sm">No purchase paths yet.</p>
            } />
            <QuestionCard title="Worst product (post-ATC drop)" body={
              questions?.worst_product_by_lost_atc
                ? <p className="text-sm">Product <span className="font-mono">{questions.worst_product_by_lost_atc.product_id}</span> lost {questions.worst_product_by_lost_atc.lost_after_atc} carts.</p>
                : <p className="text-muted-foreground text-sm">Insufficient ATC volume.</p>
            } />
            <QuestionCard title="Best channels" body={
              <ul className="text-sm space-y-1">
                {(questions?.best_channels ?? []).slice(0, 5).map((r: any) => (
                  <li key={r.key} className="flex justify-between"><span>{r.key}</span><span>{r.buyers} buyers · {r.conversion_pct}%</span></li>
                ))}
              </ul>
            } />
            <QuestionCard title="Best landing pages" body={
              <ul className="text-sm space-y-1">
                {(questions?.best_landing_pages ?? []).slice(0, 5).map((r: any) => (
                  <li key={r.key} className="flex justify-between gap-2"><span className="truncate font-mono text-xs">{r.key}</span><span>{r.conversion_pct}%</span></li>
                ))}
              </ul>
            } />
            <QuestionCard title="Device conversion" body={
              <ul className="text-sm space-y-1">
                {(questions?.device_conversion ?? []).slice(0, 5).map((r: any) => (
                  <li key={r.key} className="flex justify-between"><span>{r.key}</span><span>{r.conversion_pct}%</span></li>
                ))}
              </ul>
            } />
            <QuestionCard title="Retargeting candidates" body={
              <p className="text-2xl font-semibold flex items-center gap-2">
                <Award className="h-5 w-5 text-primary" />
                {questions?.retarget_candidates_count ?? 0}
                <span className="text-xs text-muted-foreground ml-2">high-intent sessions that didn't buy</span>
              </p>
            } />
          </div>
        </TabsContent>

        <TabsContent value="quality" className="mt-4">
          <QualityAndGatesPanel />
        </TabsContent>
      </Tabs>

      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) { setSelected(null); setDetail(null); } }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm break-all">Session {selected}</DialogTitle>
          </DialogHeader>
          {!detail && <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>}
          {detail?.journey && (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge className={`${intentColor[detail.journey.intent_class ?? "Unknown"]} text-white`}>{detail.journey.intent_class} · {Math.round((detail.journey.intent_confidence ?? 0) * 100)}%</Badge>
                {detail.journey.abandonment_reason && (
                  <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />{detail.journey.abandonment_reason}</Badge>
                )}
                <Badge variant="outline">{detail.journey.classified_channel ?? "unknown"}</Badge>
                <Badge variant="outline">{detail.journey.country ?? "—"}</Badge>
                <Badge variant="outline">{detail.journey.device ?? "—"}</Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                {detail.journey.event_count} events · {detail.journey.page_count} pages · {Math.round(detail.journey.duration_ms / 1000)}s
              </div>
              <div>
                <div className="text-xs font-semibold mb-1">Timeline</div>
                <ol className="border-l pl-3 space-y-1">
                  {detail.events.map((e: any, i: number) => (
                    <li key={i} className="text-xs">
                      <span className="text-muted-foreground">{new Date(e.occurred_at).toLocaleTimeString()}</span>
                      {" · "}<span className="font-mono">{e.canonical_name}</span>
                      {e.page_path ? <> · <span className="text-muted-foreground">{e.page_path}</span></> : null}
                      {e.product_id ? <> · <span className="font-mono text-primary">{e.product_id}</span></> : null}
                      {e.value_cents ? <> · <span className="text-emerald-600">${(Number(e.value_cents) / 100).toFixed(2)}</span></> : null}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-semibold ${accent ? "text-primary" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function RowBar({ label, value, total, colorClass }: { label: string; value: number; total: number; colorClass: string }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="text-sm">
      <div className="flex justify-between mb-0.5"><span>{label}</span><span className="text-muted-foreground">{value} · {pct}%</span></div>
      <div className="h-1.5 bg-muted rounded"><div className={`h-1.5 rounded ${colorClass}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function QuestionCard({ title, body }: { title: string; body: React.ReactNode }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}