import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle, ArrowUpRight, BarChart3, Boxes,
  FileText, Landmark, MessageSquareText, Receipt, RefreshCw, Shield, TrendingUp, Wallet,
} from "lucide-react";
import { FinanceIngestionPanel } from "@/components/admin/finance/FinanceIngestionPanel";
import { EntitySelector } from "@/components/admin/finance/EntitySelector";
import { TaxReadinessPanel } from "@/components/admin/finance/TaxReadinessPanel";
import { SupplierIntelligencePanel } from "@/components/admin/finance/SupplierIntelligencePanel";
import { ChannelCostIntelligencePanel } from "@/components/admin/finance/ChannelCostIntelligencePanel";
import { CFODashboardPanel } from "@/components/admin/finance/CFODashboardPanel";
import { FinanceMonitorsPanel } from "@/components/admin/finance/FinanceMonitorsPanel";
import { ForensicDocumentsPanel } from "@/components/admin/finance/ForensicDocumentsPanel";
import { SupplierProfilesPanel } from "@/components/admin/finance/SupplierProfilesPanel";
import { ReconciliationCenterPanel } from "@/components/admin/finance/ReconciliationCenterPanel";
import { SubscriptionIntelligencePanel } from "@/components/admin/finance/SubscriptionIntelligencePanel";
import { OpenFinanceTasksPanel } from "@/components/admin/finance/OpenFinanceTasksPanel";
import { BelastingdienstReadinessPanel } from "@/components/admin/finance/BelastingdienstReadinessPanel";
import { VatRefundEstimatorPanel } from "@/components/admin/finance/VatRefundEstimatorPanel";
import { CFOInsightsPanel } from "@/components/admin/finance/CFOInsightsPanel";
import { FinanceKpiStripPanel } from "@/components/admin/finance/FinanceKpiStripPanel";
import { AnomalyLearningMonitorPanel } from "@/components/admin/finance/AnomalyLearningMonitorPanel";
import { AccountantExportCenterPanel } from "@/components/admin/finance/AccountantExportCenterPanel";
import { CorrectionsLogPanel } from "@/components/admin/finance/CorrectionsLogPanel";
import { ImportQueueMonitorPanel } from "@/components/admin/finance/ImportQueueMonitorPanel";
import { LearningRulesCenterPanel } from "@/components/admin/finance/LearningRulesCenterPanel";
import { FinanceStateProvider, useFinanceState } from "@/lib/finance/state/FinanceStateProvider";
import { ContradictionBanner } from "@/components/admin/finance/shared/ContradictionBanner";
import { ConnectorHealthPanel } from "@/components/admin/finance/ConnectorHealthPanel";
import { UnknownEvidencePanel } from "@/components/admin/finance/UnknownEvidencePanel";

type HealthScore = {
  score_name: string | null;
  score_value: number | null;
  score_grade: string | null;
  computed_at: string | null;
  details?: any;
};
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
  const [entityId, setEntityId] = useState<string>("all");
  const canonicalEntity = entityId && entityId !== "all" ? entityId : null;
  return (
    <FinanceStateProvider entityId={canonicalEntity}>
      <FinanceCommanderInner
        isLoading={isLoading}
        entityId={entityId}
        setEntityId={setEntityId}
      />
    </FinanceStateProvider>
  );
}

function FinanceCommanderInner({
  isLoading,
  entityId,
  setEntityId,
}: {
  isLoading: boolean;
  entityId: string;
  setEntityId: (v: string) => void;
}) {
  const { state: canonical } = useFinanceState();
  const [health, setHealth] = useState<HealthScore | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [vat, setVat] = useState<VatSummary | null>(null);
  const [roi, setRoi] = useState<Roi[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshingHealth, setRefreshingHealth] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    const [h, a, v, r] = await Promise.all([
      supabase.from("finance_health_scores")
        .select("score_name,score_value,score_grade,computed_at,details")
        .eq("score_key", "finance_health_v2")
        .order("computed_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("finance_alerts").select("id,severity,alert_type,title,created_at").eq("is_resolved", false).order("created_at", { ascending: false }).limit(6),
      supabase.from("finance_vat_summaries").select("period_type,period_year,period_number,recoverable_minor,outstanding_minor,currency").order("period_year", { ascending: false }).order("period_number", { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
      supabase.from("v_finance_channel_roi" as any).select("*").order("day", { ascending: false }).limit(30),
    ]);
    if (h.data) setHealth(h.data as unknown as HealthScore);
    if (a.data) setAlerts(a.data as Alert[]);
    if (v.data) setVat(v.data as unknown as VatSummary);
    if (r.data) setRoi(r.data as unknown as Roi[]);
    setLoading(false);

    // If no v2 snapshot exists, compute one silently on first mount
    if (!h.data) {
      const { data } = await supabase.functions.invoke("finance-health-score", { body: { entity_id: null } });
      if (data?.ok) {
        setHealth({
          score_name: "Finance Health (v2, weighted)",
          score_value: data.overall,
          score_grade: data.grade,
          computed_at: new Date().toISOString(),
          details: data.details,
        });
      }
    }
  }, []);

  const recomputeHealth = useCallback(async () => {
    setRefreshingHealth(true);
    const { data } = await supabase.functions.invoke("finance-health-score", {
      body: { entity_id: entityId && entityId !== "all" ? entityId : null },
    });
    if (data?.ok) {
      setHealth({
        score_name: "Finance Health (v2, weighted)",
        score_value: data.overall,
        score_grade: data.grade,
        computed_at: new Date().toISOString(),
        details: data.details,
      });
    }
    setRefreshingHealth(false);
  }, [entityId]);

  useEffect(() => {
    if (isLoading) return;
    void loadDashboard();
  }, [isLoading, loadDashboard]);

  const totalSpend = roi.reduce((s, r) => s + Number(r.spend || 0), 0);
  const totalRevenue = roi.reduce((s, r) => s + Number(r.revenue || 0), 0);
  const blendedRoas = totalSpend > 0 ? (totalRevenue / totalSpend).toFixed(2) : "—";

  const healthSignals: Array<{ key: string; label: string; score: number; reason: string; action?: string }> =
    Array.isArray(health?.details?.signals) ? health!.details.signals : [];
  const worstSignals = [...healthSignals].sort((a, b) => a.score - b.score).slice(0, 3);

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 max-w-full">
      <Helmet>
        <title>Finance Commander — GetPawsy Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <header className="space-y-1">
        <h1 className="text-xl md:text-3xl font-semibold flex items-center gap-2">
          <Shield className="h-5 w-5 md:h-6 md:w-6 text-primary" />
          Finance Commander
        </h1>
        <p className="text-xs md:text-sm text-muted-foreground">
          Single source of truth for bookkeeping, VAT, evidence and channel ROI.
        </p>
      </header>

      <EntitySelector value={entityId} onChange={setEntityId} />

      {/* KPI strip */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-sm text-muted-foreground">Finance health</CardTitle>
            <Button size="sm" variant="ghost" className="h-6 px-1" onClick={recomputeHealth} disabled={refreshingHealth}>
              <RefreshCw className={`h-3 w-3 ${refreshingHealth ? "animate-spin" : ""}`} />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">
              {health?.score_value ?? canonical.finance_readiness.value ?? "—"}
              <span className="text-base text-muted-foreground">/100</span>
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {health?.score_name ??
                (canonical.loading ? "Loading canonical state…" : "Finance readiness (canonical)")}
              {health?.score_grade ? ` · grade ${health.score_grade}` : ""}
            </div>
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

      {/* Health 2.0 lowest-scoring signals */}
      {worstSignals.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Health signals needing attention
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-3">
            {worstSignals.map((s) => (
              <div key={s.key} className="rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">{s.label}</span>
                  <Badge variant={s.score < 60 ? "destructive" : s.score < 80 ? "secondary" : "outline"}>
                    {s.score}/100
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{s.reason}</div>
                {s.action && <div className="mt-1 text-xs text-primary line-clamp-2">→ {s.action}</div>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Canonical contradiction detector */}
      <ContradictionBanner />

      {/* Tax Readiness */}
      <TaxReadinessPanel entityId={entityId} />

      {/* CFO flow: KPI → Belastingdienst → Missing Evidence → Forensic → Reconciliation → Suppliers → Subs → VAT Refund → CFO Insights → Imports → Exports → Learning → Developer */}
      <FinanceKpiStripPanel entityId={entityId === "all" ? null : entityId} />
      <BelastingdienstReadinessPanel entityId={entityId === "all" ? null : entityId} />
      <ConnectorHealthPanel />
      <UnknownEvidencePanel />
      <OpenFinanceTasksPanel entityId={entityId === "all" ? null : entityId} />
      <ForensicDocumentsPanel entityId={entityId === "all" ? null : entityId} />
      <ReconciliationCenterPanel entityId={entityId === "all" ? null : entityId} />
      <SupplierProfilesPanel entityId={entityId === "all" ? null : entityId} />
      <SupplierIntelligencePanel entityId={entityId} />
      <SubscriptionIntelligencePanel entityId={entityId === "all" ? null : entityId} />
      <VatRefundEstimatorPanel entityId={entityId === "all" ? null : entityId} />
      <CFOInsightsPanel entityId={entityId === "all" ? null : entityId} />
      <CFODashboardPanel entityId={entityId} />
      <ChannelCostIntelligencePanel entityId={entityId} />
      <AccountantExportCenterPanel entityId={entityId === "all" ? null : entityId} />
      <AnomalyLearningMonitorPanel entityId={entityId === "all" ? null : entityId} />
      <CorrectionsLogPanel />
      <LearningRulesCenterPanel />
      <ImportQueueMonitorPanel />
      <FinanceMonitorsPanel entityId={entityId} />

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

      {/* Ingestion */}
      <FinanceIngestionPanel entityId={entityId} />
    </div>
  );
}