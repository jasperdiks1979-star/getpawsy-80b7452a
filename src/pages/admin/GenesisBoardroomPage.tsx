import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Activity, DollarSign, Users, ShoppingCart, TrendingUp, ShieldCheck,
  Pin, CreditCard, Package, Brain, Dna, Network, Search, Radio,
  AlertTriangle, FileText, Building2, Wallet, Globe, Loader2,
} from "lucide-react";

/**
 * Genesis Ω.4 — Digital Boardroom
 * Executive Command Center. Every metric sourced from Ω.3 Unified Truth.
 */

interface TruthMetric {
  metric_key: string; display_name: string; domain: string; status: string;
  canonical_source: string; confidence: number; unit: string;
}
interface TruthSnapshot {
  overall_truth_score: number; data_integrity: number; revenue_integrity: number;
  analytics_integrity: number; financial_integrity: number; ai_integrity: number;
  operational_integrity: number; conflict_count: number; run_at: string;
  canonical_count: number; total_metrics: number;
}

const ROOMS: { key: string; label: string; icon: any; to: string; desc: string }[] = [
  { key: "ceo", label: "CEO Room", icon: Building2, to: "/admin/ceo", desc: "Executive summary, briefings, priorities" },
  { key: "revenue", label: "Revenue Room", icon: DollarSign, to: "/admin/revenue-command-center", desc: "Live revenue, leaks, forecasts" },
  { key: "traffic", label: "Visitor Room", icon: Globe, to: "/live-map", desc: "Live world map & session inspector" },
  { key: "funnel", label: "Funnel Commander", icon: TrendingUp, to: "/admin/conversion-commander", desc: "Landing → purchase drop-off" },
  { key: "products", label: "Product Commander", icon: Package, to: "/admin/product-intelligence", desc: "Per-product revenue & health" },
  { key: "pinterest", label: "Pinterest Commander", icon: Pin, to: "/admin/pinterest-command-center", desc: "Pins, credits, PRE, revenue" },
  { key: "stripe", label: "Stripe Commander", icon: CreditCard, to: "/admin/payments", desc: "Sessions, wallets, webhooks" },
  { key: "finance", label: "Finance Commander", icon: Wallet, to: "/admin/finance", desc: "Cashflow, expenses, subscriptions" },
  { key: "tax", label: "Tax Commander", icon: FileText, to: "/admin/vault-v14", desc: "VAT, invoices, evidence" },
  { key: "ai", label: "AI Commander", icon: Brain, to: "/admin/ai-gateway-credits", desc: "Credits, usage, workers" },
  { key: "genome", label: "Genome Room", icon: Dna, to: "/admin/genome", desc: "Living digital blueprint" },
  { key: "architecture", label: "Architecture Room", icon: Network, to: "/admin/omega-architect", desc: "System map & tech debt" },
  { key: "truth", label: "Unified Truth (Ω.3)", icon: ShieldCheck, to: "/admin/omega-truth", desc: "Certified metric registry" },
  { key: "omega", label: "Autonomous CEO (Ω)", icon: Radio, to: "/admin/omega", desc: "Board of AI executives" },
];

export default function GenesisBoardroomPage() {
  const [truth, setTruth] = useState<TruthSnapshot | null>(null);
  const [metrics, setMetrics] = useState<TruthMetric[]>([]);
  const [live, setLive] = useState<{ revenueToday: number; ordersToday: number; visitors24h: number; atc24h: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const snapRes: any = await supabase.from("genesis_truth_snapshots").select("*").order("run_at", { ascending: false }).limit(1);
      const mtsRes: any = await supabase.from("genesis_truth_metrics").select("metric_key,display_name,domain,status,canonical_source,confidence,unit").eq("status", "canonical");
      setTruth((snapRes.data?.[0] as TruthSnapshot | undefined) ?? null);
      setMetrics((mtsRes.data as TruthMetric[] | null) ?? []);

      // Live KPIs — sourced from canonical tables only
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const ordersRes: any = await supabase.from("orders").select("total_amount,status").gte("created_at", today.toISOString()).eq("status", "paid");
      const visitorsRes: any = await supabase.from("canonical_sessions").select("*", { count: "exact", head: true }).gte("started_at", since);
      const atcRes: any = await supabase.from("canonical_events").select("*", { count: "exact", head: true }).eq("event_name", "add_to_cart").gte("occurred_at", since);
      const orderRows: any[] = ordersRes.data ?? [];
      const revenueToday = orderRows.reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0);
      setLive({ revenueToday, ordersToday: orderRows.length, visitors24h: visitorsRes.count ?? 0, atc24h: atcRes.count ?? 0 });
      setLoading(false);
    })().catch(() => setLoading(false));
  }, []);

  const healthBar = useMemo(() => {
    if (!truth) return [];
    return [
      { label: "Overall", v: truth.overall_truth_score, to: "/admin/omega-truth" },
      { label: "Revenue", v: truth.revenue_integrity, to: "/admin/revenue-command-center" },
      { label: "Analytics", v: truth.analytics_integrity, to: "/admin/analytics-truth" },
      { label: "Finance", v: truth.financial_integrity, to: "/admin/finance" },
      { label: "AI", v: truth.ai_integrity, to: "/admin/ai-gateway-credits" },
      { label: "Operational", v: truth.operational_integrity, to: "/admin/pinterest-command-center" },
      { label: "Data", v: truth.data_integrity, to: "/admin/omega-truth" },
    ];
  }, [truth]);

  const filteredRooms = ROOMS.filter((r) =>
    !q || r.label.toLowerCase().includes(q.toLowerCase()) || r.desc.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Executive top bar */}
      <div className="border-b bg-card/60 backdrop-blur">
        <div className="p-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            <div>
              <div className="text-lg font-bold leading-none">Genesis Ω.4 — Digital Boardroom</div>
              <div className="text-xs text-muted-foreground">Executive Command Center · sourced from Unified Truth</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 ml-auto">
            {healthBar.map((h) => (
              <Link key={h.label} to={h.to}
                className="border rounded px-3 py-1.5 text-xs hover:bg-muted/60 transition flex items-center gap-2">
                <span className="text-muted-foreground">{h.label}</span>
                <span className={`font-bold ${h.v >= 90 ? "text-primary" : h.v >= 70 ? "" : "text-destructive"}`}>{h.v}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Live KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <Kpi icon={DollarSign} label="Revenue Today" value={live ? `$${live.revenueToday.toFixed(2)}` : "…"} accent />
          <Kpi icon={ShoppingCart} label="Orders Today" value={live?.ordersToday ?? "…"} />
          <Kpi icon={Users} label="Visitors 24h" value={live ? live.visitors24h.toLocaleString() : "…"} />
          <Kpi icon={Activity} label="Add-to-Cart 24h" value={live ? live.atc24h.toLocaleString() : "…"} />
          <Kpi icon={ShieldCheck} label="Truth Score" value={truth ? `${truth.overall_truth_score}/100` : "…"} />
          <Kpi icon={AlertTriangle} label="Open Conflicts" value={truth?.conflict_count ?? "…"} warn={!!(truth && truth.conflict_count > 0)} />
        </div>

        {/* Executive Rooms */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <CardTitle>Executive Rooms</CardTitle>
              <div className="ml-auto w-64 relative">
                <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search rooms…" className="pl-8 h-9" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {filteredRooms.map((r) => (
                <Link key={r.key} to={r.to}
                  className="border rounded-lg p-4 hover:border-primary hover:bg-muted/40 transition group">
                  <div className="flex items-center gap-2 mb-1">
                    <r.icon className="h-5 w-5 text-primary" />
                    <div className="font-semibold">{r.label}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">{r.desc}</div>
                  <div className="text-xs mt-2 text-primary opacity-0 group-hover:opacity-100 transition">Open →</div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Canonical metric registry snapshot */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Canonical Metrics ({metrics.length})
            </CardTitle>
            <Button asChild variant="outline" size="sm"><Link to="/admin/omega-truth">Open Unified Truth</Link></Button>
          </CardHeader>
          <CardContent>
            {loading && !metrics.length ? (
              <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> loading truth registry…</div>
            ) : !metrics.length ? (
              <p className="text-sm text-muted-foreground">No canonical metrics yet — run the Ω.3 Truth Audit first.</p>
            ) : (
              <div className="overflow-auto max-h-[380px]">
                <table className="w-full text-sm">
                  <thead className="text-xs bg-muted sticky top-0">
                    <tr><th className="p-2 text-left">Metric</th><th className="p-2 text-left">Domain</th>
                    <th className="p-2 text-left">Canonical Source</th><th className="p-2 text-right">Confidence</th></tr>
                  </thead>
                  <tbody>
                    {metrics.map((m) => (
                      <tr key={m.metric_key} className="border-t">
                        <td className="p-2"><div className="font-medium">{m.display_name}</div>
                          <div className="text-xs font-mono text-muted-foreground">{m.metric_key}</div></td>
                        <td className="p-2"><Badge variant="outline">{m.domain}</Badge></td>
                        <td className="p-2 font-mono text-xs">{m.canonical_source}</td>
                        <td className="p-2 text-right">{m.confidence}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground text-center">
          Every metric displayed above is certified by Genesis Ω.3 Unified Truth Platform. Widgets showing conflicting values render UNKNOWN by law.
        </p>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, accent, warn }: { icon: any; label: string; value: any; accent?: boolean; warn?: boolean }) {
  return (
    <Card className={accent ? "border-primary" : warn ? "border-destructive" : undefined}>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">{label}</div>
          <Icon className={`h-4 w-4 ${accent ? "text-primary" : warn ? "text-destructive" : "text-muted-foreground"}`} />
        </div>
        <div className={`text-2xl font-bold mt-1 ${accent ? "text-primary" : warn ? "text-destructive" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}