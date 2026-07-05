import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertTriangle, ArrowUpRight, BarChart3, Boxes, Building2,
  FileText, Landmark, MessageSquareText, Receipt, Shield, TrendingUp, Wallet,
} from "lucide-react";

type Entity = { id: string; slug: string; legal_name: string; trade_name: string | null; base_currency: string; is_default: boolean };
type HealthScore = { score_name: string | null; score_value: number | null; score_grade: string | null; computed_at: string | null };
type Alert = { id: string; severity: string; alert_type: string; title: string; created_at: string };
type VatSummary = { period_type: string | null; period_year: number | null; period_number: number | null; recoverable_minor: number | null; outstanding_minor: number | null; currency: string | null };
type Roi = { day: string; supplier: string; spend: number; revenue: number; orders_count: number; roas: number | null };

const fmtEUR = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);
const fmtMinor = (m: number | null | undefined) =>
  m == null ? "—" : fmtEUR(m / 100);

const severityColor = (s: string) =>
  s === "critical" ? "bg-red-600" : s === "high" ? "bg-orange-500" : s === "medium" ? "bg-amber-500" : "bg-slate-500";

const quickLinks = [
  { to: "/admin/finance", icon: BarChart3, label: "Finance Intelligence", desc: "Suppliers, invoices, connectors" },
  { to: "/admin/cfo", icon: MessageSquareText, label: "CFO Chat", desc: "Ask the finance AI" },
  { to: "/admin/cfo-reports", icon: FileText, label: "CFO Report Library", desc: "Generated reports" },
  { to: "/admin/accountant", icon: Landmark, label: "Accountant Portal", desc: "Exports for boekhouder" },
  { to: "/admin/payments", icon: Receipt, label: "Payments", desc: "Stripe evidence" },
  { to: "/admin/financial-health", icon: TrendingUp, label: "Financial Health", desc: "P&L, cash flow trends" },
];

export default function FinanceCommanderPage() {
  const { isLoading } = useAuth();
  const [entities, setEntities] = useState<Entity[]>([]);
  const [entityId, setEntityId] = useState<string>("all");
  const [health, setHealth] = useState<HealthScore | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [vat, setVat] = useState<VatSummary | null>(null);
  const [roi, setRoi] = useState<Roi[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isLoading) return;
    (async () => {
      setLoading(true);
      const [e, h, a, v, r] = await Promise.all([
        supabase.from("finance_entities").select("*").order("is_default", { ascending: false }),
        supabase.from("finance_health_scores").select("score_name,score_value,score_grade,computed_at").order("computed_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("finance_alerts").select("id,severity,alert_type,title,created_at").eq("is_resolved", false).order("created_at", { ascending: false }).limit(6),
        supabase.from("finance_vat_summaries").select("period_type,period_year,period_number,recoverable_minor,outstanding_minor,currency").order("period_year", { ascending: false }).order("period_number", { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
        supabase.from("v_finance_channel_roi" as any).select("*").order("day", { ascending: false }).limit(30),
      ]);
      if (e.data) {
        setEntities(e.data as Entity[]);
        const def = (e.data as Entity[]).find(x => x.is_default);
        if (def) setEntityId(def.id);
      }
      if (h.data) setHealth(h.data as unknown as HealthScore);
      if (a.data) setAlerts(a.data as Alert[]);
      if (v.data) setVat(v.data as unknown as VatSummary);
      if (r.data) setRoi(r.data as unknown as Roi[]);
      setLoading(false);
    })();
  }, [isLoading]);

  const totalSpend = roi.reduce((s, r) => s + Number(r.spend || 0), 0);
  const totalRevenue = roi.reduce((s, r) => s + Number(r.revenue || 0), 0);
  const blendedRoas = totalSpend > 0 ? (totalRevenue / totalSpend).toFixed(2) : "—";

  return (
    <div className="p-4 md:p-6 space-y-6">
      <Helmet>
        <title>Finance Commander — GetPawsy Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Finance Commander
          </h1>
          <p className="text-sm text-muted-foreground">
            Single source of truth for bookkeeping, VAT, evidence and channel ROI.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <Select value={entityId} onValueChange={setEntityId}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Select entity" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All entities</SelectItem>
              {entities.map(e => (
                <SelectItem key={e.id} value={e.id}>
                  {e.trade_name || e.legal_name} {e.is_default && "· default"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      {/* KPI strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Finance health</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{health?.score_value ?? "—"}<span className="text-base text-muted-foreground">/100</span></div>
            <div className="text-xs text-muted-foreground">{health?.score_name ?? "no snapshot yet"}{health?.score_grade ? ` · ${health.score_grade}` : ""}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Latest VAT period</CardTitle></CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">
              {vat?.period_year ? `${vat.period_year}${vat.period_number != null ? ` ${vat.period_type === "quarter" ? "Q" : ""}${vat.period_number}` : ""}` : "—"}
            </div>
            <div className="text-xs text-muted-foreground">
              Recoverable {fmtMinor(vat?.recoverable_minor ?? null)} · Outstanding {fmtMinor(vat?.outstanding_minor ?? null)}
            </div>
            {vat?.currency && <Badge variant="outline" className="mt-1">{vat.currency}</Badge>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">30d spend</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{fmtEUR(totalSpend)}</div>
            <div className="text-xs text-muted-foreground">from evidence_payments</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Blended ROAS</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{blendedRoas === "—" ? "—" : `${blendedRoas}×`}</div>
            <div className="text-xs text-muted-foreground">revenue {fmtEUR(totalRevenue)} · 30d</div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts + Quick links */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Open finance alerts</CardTitle></CardHeader>
          <CardContent>
            {loading ? <div className="text-sm text-muted-foreground">Loading…</div> :
             alerts.length === 0 ? <div className="text-sm text-muted-foreground">No open alerts.</div> :
             <ul className="space-y-2">
              {alerts.map(a => (
                <li key={a.id} className="flex items-start gap-2 border-b last:border-b-0 pb-2">
                  <span className={`inline-block h-2 w-2 mt-2 rounded-full ${severityColor(a.severity)}`} />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{a.title}</div>
                    <div className="text-xs text-muted-foreground">{a.alert_type} · {new Date(a.created_at).toLocaleString()}</div>
                  </div>
                </li>
              ))}
             </ul>}
            <div className="mt-3">
              <Button asChild variant="outline" size="sm">
                <Link to="/admin/finance">View all in Finance Intelligence <ArrowUpRight className="ml-1 h-3 w-3" /></Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Boxes className="h-4 w-4" /> Jump to</CardTitle></CardHeader>
          <CardContent className="grid gap-2">
            {quickLinks.map(l => (
              <Link key={l.to} to={l.to} className="flex items-start gap-3 rounded-md border p-2 hover:bg-accent transition-colors">
                <l.icon className="h-4 w-4 mt-0.5 text-primary" />
                <div className="flex-1">
                  <div className="text-sm font-medium">{l.label}</div>
                  <div className="text-xs text-muted-foreground">{l.desc}</div>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Channel ROI */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Wallet className="h-4 w-4" /> Channel ROI (30 days)</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <div className="text-sm text-muted-foreground">Loading…</div> :
           roi.length === 0 ? <div className="text-sm text-muted-foreground">No spend or revenue in window.</div> :
           <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-4">Day</th>
                  <th className="py-1 pr-4">Supplier</th>
                  <th className="py-1 pr-4 text-right">Spend</th>
                  <th className="py-1 pr-4 text-right">Revenue</th>
                  <th className="py-1 pr-4 text-right">Orders</th>
                  <th className="py-1 text-right">ROAS</th>
                </tr>
              </thead>
              <tbody>
                {roi.slice(0, 30).map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-1 pr-4">{r.day}</td>
                    <td className="py-1 pr-4">{r.supplier}</td>
                    <td className="py-1 pr-4 text-right">{fmtEUR(Number(r.spend))}</td>
                    <td className="py-1 pr-4 text-right">{fmtEUR(Number(r.revenue))}</td>
                    <td className="py-1 pr-4 text-right">{r.orders_count}</td>
                    <td className="py-1 text-right">{r.roas != null ? `${Number(r.roas).toFixed(2)}×` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
           </div>}
        </CardContent>
      </Card>
    </div>
  );
}