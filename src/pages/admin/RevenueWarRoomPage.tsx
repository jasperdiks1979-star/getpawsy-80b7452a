import { useCallback, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowLeft, DollarSign, Flame, Loader2, RefreshCw, Rocket, ShieldCheck, Target, TrendingDown, TrendingUp, Users, Zap } from "lucide-react";
import { toast } from "sonner";

type WarRoom = {
  captured_at: string;
  today: { visitors: number | null; qualified_visitors: number | null; add_to_cart: number | null; checkouts: number | null; purchases: number | null; revenue: number; orders: number; gross_margin: number; net_margin: number; live_visitors_15m: number | null };
  live_buyers: {
    buying_now: number;
    hot: number;
    warm: number;
    cold: number;
    window_minutes: number;
    top: Array<{
      session_id: string;
      visitor_id: string | null;
      class: 'BUYING_NOW' | 'HOT' | 'WARM' | 'COLD';
      score: number;
      last_stage: string | null;
      minutes_since_last: number;
      events: number;
      distinct_products: number;
      last_product_id: string | null;
      last_product_name?: string | null;
      country: string | null;
      device: string | null;
      utm_source: string | null;
      landing_page: string | null;
      signals: string[];
    }>;
  };
  leaks: Array<{ label: string; loss_est: number; evidence: string }>;
  hero_product: { product_id: string; name: string | null; atc_7d: number; purchases_7d: number; score: number } | null;
  next_action: { action: string; why: string; confidence: number; expected_revenue: number; expected_roi: number; eta_minutes: number; rollback: string; evidence: any };
  funnel_breakdown?: {
    steps: Array<{ key: string; label: string; count: number | null; rate_from_top: number | null; step_conv: number | null; drop_pct: number | null }>;
    bottleneck: { from: string; to: string; drop_pct: number; lost: number } | null;
    by_page: Array<{ page: string; sessions: number; atc: number; atc_rate: number | null; dropped: number }>;
    by_product: Array<{ product_id: string; name: string | null; atc: number; purchases: number; lost: number; conv_rate: number | null }>;
  };
};

const fmtNum = (n: number | null | undefined) => (n == null ? "UNKNOWN" : n.toLocaleString());
const fmt$ = (n: number | null | undefined) => (n == null ? "UNKNOWN" : `$${Math.round(Number(n)).toLocaleString()}`);

function Stat({ icon: Icon, label, value, tone = "default" }: { icon: any; label: string; value: string; tone?: "default" | "good" | "bad" | "warn" }) {
  const cls = tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-600" : tone === "warn" ? "text-amber-600" : "text-foreground";
  return (
    <div className="border rounded-lg p-3 bg-card">
      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" />{label}</div>
      <div className={`text-2xl font-semibold mt-0.5 ${cls}`}>{value}</div>
    </div>
  );
}

function ConfBadge({ n }: { n: number | null | undefined }) {
  if (n == null) return <Badge variant="outline">UNKNOWN</Badge>;
  const v = Number(n);
  if (v >= 75) return <Badge className="bg-emerald-600 text-white">HIGH {v}</Badge>;
  if (v >= 55) return <Badge className="bg-amber-500 text-white">MED {v}</Badge>;
  return <Badge className="bg-red-600 text-white">LOW {v}</Badge>;
}

export default function RevenueWarRoomPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<WarRoom | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [certifying, setCertifying] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [lastCert, setLastCert] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data: r, error: err } = await supabase.functions.invoke("first-sales-accelerator", { body: null, method: "GET" as any });
      if (err) throw err;
      setData(r as WarRoom);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load Revenue War Room");
    } finally {
      setLoading(false);
    }
    try {
      const { data: cert } = await supabase.from("first_sales_certifications").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle();
      setLastCert(cert);
    } catch {}
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const runAudit = async () => {
    setAuditing(true);
    try {
      const { data: r, error: e } = await supabase.functions.invoke("first-sales-accelerator?action=audit", { method: "POST" as any });
      if (e) throw e;
      toast.success("Nightly audit recorded");
      await load();
    } catch (e: any) { toast.error(e?.message ?? "Audit failed"); }
    finally { setAuditing(false); }
  };

  const runCertify = async () => {
    setCertifying(true);
    try {
      const { data: r, error: e } = await supabase.functions.invoke("first-sales-accelerator?action=certify", { method: "POST" as any });
      if (e) throw e;
      toast.success("First Sales certification archived");
      await load();
    } catch (e: any) { toast.error(e?.message ?? "Certification failed"); }
    finally { setCertifying(false); }
  };

  const t = data?.today;
  const conv = useMemo(() => {
    if (!t) return null;
    const v = t.visitors ?? 0;
    return v > 0 && t.purchases != null ? ((t.purchases / v) * 100).toFixed(2) + "%" : "UNKNOWN";
  }, [t]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <Helmet><title>Revenue War Room · Genesis Ω∞ V6</title></Helmet>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="text-xs text-muted-foreground flex items-center gap-1.5"><Link to="/admin/mission-control" className="hover:underline flex items-center gap-1"><ArrowLeft className="h-3 w-3" />Mission Control</Link> · Genesis Ω∞ V6</div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2"><Rocket className="h-6 w-6 text-primary" />Revenue War Room</h1>
          <div className="text-sm text-muted-foreground">Mission: first 100 verified organic sales. Only revenue-moving actions get built.</div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>{loading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}Refresh</Button>
          <Button size="sm" variant="outline" onClick={runAudit} disabled={auditing}>{auditing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Target className="h-3 w-3 mr-1" />}Nightly Audit</Button>
          <Button size="sm" onClick={runCertify} disabled={certifying}>{certifying ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ShieldCheck className="h-3 w-3 mr-1" />}Certify</Button>
        </div>
      </div>

      {error && (
        <Card className="border-red-500/50">
          <CardContent className="p-3 text-sm text-red-600 flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{error}</CardContent>
        </Card>
      )}

      {/* Phase 1 — Live board */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat icon={Users} label="Visitors" value={fmtNum(t?.visitors ?? null)} />
        <Stat icon={Users} label="Qualified" value={fmtNum(t?.qualified_visitors ?? null)} />
        <Stat icon={Zap} label="Add-to-Cart" value={fmtNum(t?.add_to_cart ?? null)} />
        <Stat icon={Zap} label="Checkout" value={fmtNum(t?.checkouts ?? null)} />
        <Stat icon={DollarSign} label="Purchases" value={fmtNum(t?.purchases ?? null)} tone={((t?.purchases ?? 0) > 0) ? "good" : "warn"} />
        <Stat icon={DollarSign} label="Revenue" value={fmt$(t?.revenue ?? 0)} tone={((t?.revenue ?? 0) > 0) ? "good" : "warn"} />
        <Stat icon={TrendingUp} label="Gross Margin" value={fmt$(t?.gross_margin ?? 0)} />
        <Stat icon={TrendingUp} label="Net Margin" value={fmt$(t?.net_margin ?? 0)} />
        <Stat icon={Flame} label="Live (15m)" value={fmtNum(t?.live_visitors_15m ?? null)} />
        <Stat icon={Target} label="Conv Rate" value={conv ?? "UNKNOWN"} />
      </div>

      {/* Phase 2 — Single highest-value action */}
      <Card className="border-primary/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Target className="h-4 w-4 text-primary" />Single highest-value action (next hour)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data?.next_action ? (
            <>
              <div className="text-lg font-semibold">{data.next_action.action}</div>
              <div className="text-sm text-muted-foreground">{data.next_action.why}</div>
              <div className="flex flex-wrap gap-3 text-xs pt-1">
                <div className="flex items-center gap-1">Confidence: <ConfBadge n={data.next_action.confidence} /></div>
                <div>Expected revenue: <span className="font-medium">{fmt$(data.next_action.expected_revenue)}</span></div>
                <div>Expected ROI: <span className="font-medium">{data.next_action.expected_roi}×</span></div>
                <div>ETA: <span className="font-medium">{data.next_action.eta_minutes} min</span></div>
                <div>Rollback: <span className="font-medium">{data.next_action.rollback}</span></div>
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">No signal yet.</div>
          )}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Phase 5 — Revenue leaks */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><TrendingDown className="h-4 w-4 text-red-600" />Revenue Leaks (today)</CardTitle></CardHeader>
          <CardContent>
            {data?.leaks?.length ? (
              <ul className="space-y-2">
                {data.leaks.map((l, i) => (
                  <li key={i} className="border rounded p-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-sm">{l.label}</div>
                      <Badge variant="destructive">~{fmt$(l.loss_est)}/day</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{l.evidence}</div>
                  </li>
                ))}
              </ul>
            ) : <div className="text-sm text-muted-foreground">No qualifying leaks detected.</div>}
          </CardContent>
        </Card>

        {/* Phase 6 — Hero product */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Rocket className="h-4 w-4 text-primary" />Hero Product (7d)</CardTitle></CardHeader>
          <CardContent>
            {data?.hero_product ? (
              <div className="space-y-1">
                <div className="font-medium">{data.hero_product.name ?? data.hero_product.product_id}</div>
                <div className="text-xs text-muted-foreground">Score {data.hero_product.score} · ATC {data.hero_product.atc_7d} · Purchases {data.hero_product.purchases_7d}</div>
                <Link to={`/admin/products?highlight=${data.hero_product.product_id}`} className="text-xs text-primary hover:underline">Open product →</Link>
              </div>
            ) : <div className="text-sm text-muted-foreground">No product has enough signal yet.</div>}
          </CardContent>
        </Card>

        {/* Phase 4 — Live buyer detector */}
        <Card className="md:col-span-2 xl:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-500" />
              Live Buyer Detector · last {data?.live_buyers.window_minutes ?? 30}m
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-4 gap-2">
              <div className="border rounded p-2 bg-red-500/5 border-red-500/40">
                <div className="text-[11px] text-muted-foreground">Buying Now</div>
                <div className="text-xl font-semibold text-red-600">{data?.live_buyers.buying_now ?? 0}</div>
              </div>
              <div className="border rounded p-2 bg-orange-500/5 border-orange-500/40">
                <div className="text-[11px] text-muted-foreground">Hot</div>
                <div className="text-xl font-semibold text-orange-600">{data?.live_buyers.hot ?? 0}</div>
              </div>
              <div className="border rounded p-2 bg-amber-500/5 border-amber-500/40">
                <div className="text-[11px] text-muted-foreground">Warm</div>
                <div className="text-xl font-semibold text-amber-600">{data?.live_buyers.warm ?? 0}</div>
              </div>
              <div className="border rounded p-2">
                <div className="text-[11px] text-muted-foreground">Cold</div>
                <div className="text-xl font-semibold text-muted-foreground">{data?.live_buyers.cold ?? 0}</div>
              </div>
            </div>

            {data?.live_buyers.top && data.live_buyers.top.length > 0 ? (
              <div className="border rounded overflow-hidden">
                <div className="grid grid-cols-12 gap-2 px-2 py-1.5 text-[11px] text-muted-foreground bg-muted/40 border-b">
                  <div className="col-span-2">Class</div>
                  <div className="col-span-1 text-right">Score</div>
                  <div className="col-span-2">Stage</div>
                  <div className="col-span-1 text-right">Ago</div>
                  <div className="col-span-4">Looking at</div>
                  <div className="col-span-2">Source</div>
                </div>
                {data.live_buyers.top.map((v) => {
                  const cls =
                    v.class === 'BUYING_NOW' ? 'bg-red-600 text-white' :
                    v.class === 'HOT' ? 'bg-orange-500 text-white' :
                    v.class === 'WARM' ? 'bg-amber-500 text-white' :
                    'bg-muted text-muted-foreground';
                  const label = v.class === 'BUYING_NOW' ? 'BUYING NOW' : v.class;
                  const stage = (v.last_stage ?? '').replace('CANONICAL_', '').toLowerCase() || '—';
                  const productLabel = v.last_product_name || v.last_product_id;
                  return (
                    <div key={v.session_id} className="grid grid-cols-12 gap-2 px-2 py-1.5 text-xs border-b last:border-b-0 items-center">
                      <div className="col-span-2"><Badge className={cls}>{label}</Badge></div>
                      <div className="col-span-1 text-right font-mono">{v.score}</div>
                      <div className="col-span-2 truncate" title={stage}>{stage}</div>
                      <div className="col-span-1 text-right text-muted-foreground">{v.minutes_since_last}m</div>
                      <div className="col-span-4 truncate" title={v.signals.join(' · ')}>
                        {productLabel ? (
                          <Link to={`/admin/products?highlight=${v.last_product_id}`} className="text-primary hover:underline">
                            {productLabel}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">{v.signals[0] ?? 'browsing'}</span>
                        )}
                        {v.distinct_products > 1 && (
                          <span className="text-muted-foreground"> +{v.distinct_products - 1}</span>
                        )}
                      </div>
                      <div className="col-span-2 truncate text-muted-foreground" title={[v.utm_source, v.country, v.device].filter(Boolean).join(' · ')}>
                        {v.utm_source ?? 'direct'}{v.country ? ` · ${v.country}` : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">No active visitors in the last 30 minutes.</div>
            )}

            <div className="text-[11px] text-muted-foreground">
              Intent scored from canonical_events: page_view×1 · product_view×4 · cart×8 · add_to_cart×20 · checkout×40 · purchase×100 (multi-product & recency bonuses). Buying Now = purchase or checkout in last 10 min.
            </div>
          </CardContent>
        </Card>

        {/* Phase 13 — Latest certification */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" />Latest First Sales Recovery Report</CardTitle></CardHeader>
          <CardContent>
            {lastCert ? (
              <div className="text-sm space-y-1">
                <div>{new Date(lastCert.created_at).toLocaleString()}</div>
                <div>Revenue: <span className="font-medium">{fmt$(lastCert.revenue)}</span> · Purchases: {lastCert.purchases} · Conf: {lastCert.confidence ?? "—"}</div>
                {lastCert.sha256 && <div className="text-[11px] font-mono text-muted-foreground break-all">SHA-256 {lastCert.sha256}</div>}
              </div>
            ) : <div className="text-sm text-muted-foreground">No certification yet. Click Certify to archive one.</div>}
          </CardContent>
        </Card>
      </div>

      <div className="text-[11px] text-muted-foreground pt-2">
        Genesis Constitution: revenue &gt; trust &gt; evidence &gt; CX &gt; long-term value. Missing signals shown as UNKNOWN — never zero.
      </div>
    </div>
  );
}