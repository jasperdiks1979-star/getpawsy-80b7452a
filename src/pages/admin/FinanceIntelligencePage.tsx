import { useEffect, useMemo, useState } from "react";
import { Navigate, NavLink } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Activity, AlertTriangle, ArrowLeft, Boxes, Calendar, CreditCard,
  DollarSign, ExternalLink, FileText, Landmark, Search, Shield,
  Sparkles, TrendingUp, Truck, Wallet,
} from "lucide-react";
import { Helmet } from "react-helmet-async";

type Connector = {
  id: string;
  supplier_slug: string;
  display_name: string;
  connection_method: "api" | "oauth" | "manual" | "semi";
  status: string;
  capabilities: Record<string, boolean>;
  health_score: number;
  last_sync_at: string | null;
  next_sync_at: string | null;
  sync_frequency: string | null;
  notes: string | null;
};
type Supplier = { id: string; name: string; slug: string; invoice_count: number; total_paid_minor: number; currency: string | null };
type EvidenceDoc = { id: string; title: string; document_type: string; supplier_name: string | null; document_date: string | null; amount_minor: number | null; vat_minor: number | null; currency: string | null; };
type Payment = { id: string; amount_minor: number; currency: string; paid_at: string | null; provider: string | null; status: string };
type Subscription = { id: string; supplier_slug: string; product_name: string; cadence: string; amount_minor: number; currency: string; renews_at: string | null; is_active: boolean };
type Alert = { id: string; severity: string; alert_type: string; title: string; detail: string | null; is_resolved: boolean; created_at: string };
type Category = { id: string; slug: string; name: string; color: string | null };
type Task = { id: string; supplier_slug: string; period_label: string; expected_type: string; status: string; instructions: string | null };
type Dossier = { id: string; fiscal_year: number; completeness_score: number; belastingdienst_ready: boolean; invoice_count: number; total_expenses_minor: number };

const money = (minor: number | null | undefined, ccy?: string | null) => {
  if (minor == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: ccy || "USD" }).format(minor / 100);
};

const methodColor = (m: string) =>
  m === "api" ? "bg-emerald-600" : m === "oauth" ? "bg-blue-600" : m === "semi" ? "bg-amber-500" : "bg-slate-500";

const FinanceIntelligencePage = () => {
  const { isAdmin, isLoading } = useAuth();
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [docs, setDocs] = useState<EvidenceDoc[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [c, s, d, p, sb, a, ct, tk, ds] = await Promise.all([
        supabase.from("finance_connectors").select("*").order("display_name"),
        supabase.from("evidence_suppliers").select("id,name,slug,invoice_count,total_paid_minor,currency").order("name"),
        supabase.from("evidence_documents").select("id,title,document_type,supplier_name,document_date,amount_minor,vat_minor,currency").order("document_date", { ascending: false, nullsFirst: false }).limit(200),
        supabase.from("evidence_payments").select("id,amount_minor,currency,paid_at,provider,status").order("paid_at", { ascending: false, nullsFirst: false }).limit(200),
        supabase.from("finance_subscriptions").select("*").order("renews_at", { ascending: true, nullsFirst: false }),
        supabase.from("finance_alerts").select("*").eq("is_resolved", false).order("created_at", { ascending: false }).limit(50),
        supabase.from("finance_expense_categories").select("id,slug,name,color").order("sort_order"),
        supabase.from("finance_import_tasks").select("*").eq("status","open").order("created_at", { ascending: false }).limit(50),
        supabase.from("finance_annual_dossiers").select("*").order("fiscal_year", { ascending: false }),
      ]);
      if (c.data) setConnectors(c.data as Connector[]);
      if (s.data) setSuppliers(s.data as Supplier[]);
      if (d.data) setDocs(d.data as EvidenceDoc[]);
      if (p.data) setPayments(p.data as Payment[]);
      if (sb.data) setSubs(sb.data as Subscription[]);
      if (a.data) setAlerts(a.data as Alert[]);
      if (ct.data) setCats(ct.data as Category[]);
      if (tk.data) setTasks(tk.data as Task[]);
      if (ds.data) setDossiers(ds.data as Dossier[]);
      setLoading(false);
    })();
  }, []);

  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const qtrStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const inRange = (iso: string | null, from: Date) =>
      iso ? new Date(iso).getTime() >= from.getTime() : false;

    const spendM = payments.filter((p) => inRange(p.paid_at, monthStart)).reduce((a, p) => a + p.amount_minor, 0);
    const spendQ = payments.filter((p) => inRange(p.paid_at, qtrStart)).reduce((a, p) => a + p.amount_minor, 0);
    const spendY = payments.filter((p) => inRange(p.paid_at, yearStart)).reduce((a, p) => a + p.amount_minor, 0);
    const totalExpenses = payments.reduce((a, p) => a + p.amount_minor, 0);
    const recoverableVat = docs.reduce((a, d) => a + (d.vat_minor || 0), 0);
    const invoicesImported = docs.filter((d) => d.document_type === "invoice").length;
    const invoicesMissing = tasks.filter((t) => t.expected_type === "invoice").length;
    const receiptsMissing = tasks.filter((t) => t.expected_type === "receipt").length;
    const activeSubs = subs.filter((s) => s.is_active).length;
    const monthlyBurn = subs
      .filter((s) => s.is_active)
      .reduce((a, s) => a + (s.cadence === "annual" ? s.amount_minor / 12 : s.cadence === "quarterly" ? s.amount_minor / 3 : s.amount_minor), 0);

    const connectorsHealthy = connectors.filter((c) => c.status === "connected").length;
    const supplierHealth = connectors.length ? Math.round((connectorsHealthy / connectors.length) * 100) : 0;

    const totalExpected = invoicesImported + invoicesMissing;
    const accountingCompleteness = totalExpected ? Math.round((invoicesImported / totalExpected) * 100) : 100;
    const belastingdienstReadiness = Math.min(
      100,
      Math.round(accountingCompleteness * 0.5 + (invoicesImported > 0 ? 25 : 0) + (recoverableVat > 0 ? 15 : 0) + (dossiers.some((d) => d.belastingdienst_ready) ? 10 : 0)),
    );

    const upcomingRenewals = subs.filter((s) => {
      if (!s.renews_at || !s.is_active) return false;
      const days = (new Date(s.renews_at).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      return days >= 0 && days <= 30;
    }).length;

    const annualForecast = monthlyBurn * 12;

    return {
      spendM, spendQ, spendY, totalExpenses, recoverableVat,
      invoicesImported, invoicesMissing, receiptsMissing,
      supplierHealth, accountingCompleteness, belastingdienstReadiness,
      monthlyBurn, upcomingRenewals, activeSubs, annualForecast,
    };
  }, [payments, docs, tasks, subs, connectors, dossiers]);

  const filteredDocs = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return docs;
    return docs.filter((d) =>
      [d.title, d.supplier_name, d.document_type].some((v) => (v || "").toLowerCase().includes(n)),
    );
  }, [docs, q]);

  if (isLoading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Finance Intelligence · GetPawsy Admin</title>
      </Helmet>
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="flex items-center gap-3 mb-8 flex-wrap">
          <NavLink to="/admin" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </NavLink>
          <div className="flex items-center gap-2">
            <Landmark className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Finance Intelligence</h1>
              <p className="text-sm text-muted-foreground">
                Genesis V12 · Autonomous accounting, tax &amp; expense management
              </p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <NavLink to="/admin/evidence-vault">Evidence Vault →</NavLink>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <NavLink to="/admin/accountant">Accountant Portal →</NavLink>
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4 mb-6">
          <StatCard icon={<DollarSign className="h-5 w-5" />} label="This month" value={money(stats.spendM, "USD")} />
          <StatCard icon={<DollarSign className="h-5 w-5" />} label="This quarter" value={money(stats.spendQ, "USD")} />
          <StatCard icon={<DollarSign className="h-5 w-5" />} label="This year" value={money(stats.spendY, "USD")} />
          <StatCard icon={<Wallet className="h-5 w-5" />} label="Total expenses" value={money(stats.totalExpenses, "USD")} />
        </div>
        <div className="grid gap-3 md:grid-cols-4 mb-6">
          <StatCard icon={<Sparkles className="h-5 w-5" />} label="Recoverable VAT" value={money(stats.recoverableVat, "EUR")} />
          <StatCard icon={<FileText className="h-5 w-5" />} label="Invoices imported" value={stats.invoicesImported} />
          <StatCard icon={<AlertTriangle className="h-5 w-5" />} label="Invoices missing" value={stats.invoicesMissing} tone={stats.invoicesMissing ? "warn" : undefined} />
          <StatCard icon={<AlertTriangle className="h-5 w-5" />} label="Receipts missing" value={stats.receiptsMissing} tone={stats.receiptsMissing ? "warn" : undefined} />
        </div>
        <div className="grid gap-3 md:grid-cols-4 mb-8">
          <StatCard icon={<Activity className="h-5 w-5" />} label="Supplier health" value={`${stats.supplierHealth}%`} />
          <StatCard icon={<Shield className="h-5 w-5" />} label="Accounting completeness" value={`${stats.accountingCompleteness}%`} />
          <StatCard icon={<Landmark className="h-5 w-5" />} label="Belastingdienst readiness" value={`${stats.belastingdienstReadiness}%`} />
          <StatCard icon={<TrendingUp className="h-5 w-5" />} label="Monthly burn" value={money(Math.round(stats.monthlyBurn), "USD")} />
        </div>
        <div className="grid gap-3 md:grid-cols-4 mb-8">
          <StatCard icon={<CreditCard className="h-5 w-5" />} label="Active subscriptions" value={stats.activeSubs} />
          <StatCard icon={<Calendar className="h-5 w-5" />} label="Upcoming renewals (30d)" value={stats.upcomingRenewals} />
          <StatCard icon={<TrendingUp className="h-5 w-5" />} label="Annual forecast" value={money(Math.round(stats.annualForecast), "USD")} />
          <StatCard icon={<Boxes className="h-5 w-5" />} label="Suppliers" value={suppliers.length} />
        </div>

        <Tabs defaultValue="connectors">
          <TabsList className="mb-4 flex-wrap h-auto">
            <TabsTrigger value="connectors">Connectors</TabsTrigger>
            <TabsTrigger value="invoices">Invoices</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
            <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
            <TabsTrigger value="tasks">Missing docs</TabsTrigger>
            <TabsTrigger value="alerts">Alerts</TabsTrigger>
            <TabsTrigger value="dossiers">Dossiers</TabsTrigger>
            <TabsTrigger value="categories">Categories</TabsTrigger>
          </TabsList>

          <TabsContent value="connectors">
            <div className="grid gap-3 md:grid-cols-2">
              {connectors.map((c) => (
                <Card key={c.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">{c.display_name}</p>
                        <p className="text-xs text-muted-foreground">{c.notes}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge className={`${methodColor(c.connection_method)} text-white`}>{c.connection_method.toUpperCase()}</Badge>
                        <Badge variant="outline">{c.status.replace("_", " ")}</Badge>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-3">
                      {Object.entries(c.capabilities || {})
                        .filter(([, v]) => v)
                        .map(([k]) => (
                          <Badge key={k} variant="secondary" className="text-[10px]">{k}</Badge>
                        ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Frequency: {c.sync_frequency || "—"} · Health: {c.health_score}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="invoices">
            <div className="flex items-center gap-2 mb-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search invoices…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" />
              <Badge variant="outline">{filteredDocs.length}</Badge>
            </div>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : filteredDocs.length === 0 ? (
              <EmptyState icon={<FileText />} title="No invoices archived yet" body="Connect a supplier or upload historical invoices via the Evidence Vault to populate this register." />
            ) : (
              <div className="grid gap-2">
                {filteredDocs.map((d) => (
                  <Card key={d.id}><CardContent className="p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{d.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {d.supplier_name || "—"} · {d.document_date || "—"} · {d.document_type}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-medium">{money(d.amount_minor, d.currency)}</p>
                      {d.vat_minor ? <p className="text-xs text-muted-foreground">VAT {money(d.vat_minor, d.currency)}</p> : null}
                    </div>
                  </CardContent></Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="payments">
            {payments.length === 0 ? (
              <EmptyState icon={<Wallet />} title="Payment register empty" body="Payments will appear as invoices import and match bank/Stripe transactions." />
            ) : (
              <div className="grid gap-2">
                {payments.map((p) => (
                  <Card key={p.id}><CardContent className="p-3 flex items-center justify-between">
                    <div><p className="font-medium">{money(p.amount_minor, p.currency)}</p>
                      <p className="text-xs text-muted-foreground">{p.provider || "—"} · {p.status} · {p.paid_at ? new Date(p.paid_at).toLocaleDateString() : "—"}</p></div>
                  </CardContent></Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="suppliers">
            <div className="grid gap-3 md:grid-cols-2">
              {suppliers.map((s) => (
                <Card key={s.id}><CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{s.invoice_count} invoices · {money(s.total_paid_minor, s.currency)}</p>
                  </div>
                  <Badge variant="outline">{s.slug}</Badge>
                </CardContent></Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="subscriptions">
            {subs.length === 0 ? (
              <EmptyState icon={<CreditCard />} title="No subscriptions tracked" body="Subscriptions auto-populate as recurring charges are detected in the payment register." />
            ) : (
              <div className="grid gap-2">
                {subs.map((s) => (
                  <Card key={s.id}><CardContent className="p-3 flex items-center justify-between">
                    <div><p className="font-medium">{s.product_name}</p>
                      <p className="text-xs text-muted-foreground">{s.supplier_slug} · {s.cadence} · renews {s.renews_at || "—"}</p></div>
                    <p className="font-medium">{money(s.amount_minor, s.currency)}</p>
                  </CardContent></Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="tasks">
            {tasks.length === 0 ? (
              <EmptyState icon={<Truck />} title="No missing documents" body="Every expected invoice for the tracked suppliers is present. The engine opens tasks automatically when it detects gaps." />
            ) : (
              <div className="grid gap-2">
                {tasks.map((t) => (
                  <Card key={t.id}><CardContent className="p-3 flex items-center justify-between">
                    <div><p className="font-medium">{t.supplier_slug} · {t.period_label}</p>
                      <p className="text-xs text-muted-foreground">{t.expected_type} · {t.instructions || "Upload the file to Evidence Vault"}</p></div>
                    <Badge variant="outline">{t.status}</Badge>
                  </CardContent></Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="alerts">
            {alerts.length === 0 ? (
              <EmptyState icon={<Shield />} title="All clear" body="No open finance alerts. Missing invoices, duplicate payments and VAT discrepancies will surface here." />
            ) : (
              <div className="grid gap-2">
                {alerts.map((a) => (
                  <Card key={a.id}><CardContent className="p-3 flex items-start gap-3">
                    <AlertTriangle className={`h-4 w-4 mt-1 ${a.severity === "critical" ? "text-red-600" : a.severity === "warning" ? "text-amber-500" : "text-muted-foreground"}`} />
                    <div className="flex-1"><p className="font-medium">{a.title}</p>
                      {a.detail && <p className="text-xs text-muted-foreground">{a.detail}</p>}</div>
                    <Badge variant="outline">{a.severity}</Badge>
                  </CardContent></Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="dossiers">
            <div className="grid gap-3 md:grid-cols-2">
              {dossiers.map((d) => (
                <Card key={d.id}><CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-lg font-semibold">FY {d.fiscal_year}</p>
                    <Badge className={d.belastingdienst_ready ? "bg-emerald-600 text-white" : ""} variant={d.belastingdienst_ready ? "default" : "outline"}>
                      {d.belastingdienst_ready ? "Belastingdienst ready" : "In progress"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {d.invoice_count} invoices · {money(d.total_expenses_minor, "EUR")} · completeness {d.completeness_score}%
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="outline" disabled>Generate ZIP (Phase 2)</Button>
                    <Button size="sm" variant="outline" disabled>Generate PDF summary</Button>
                  </div>
                </CardContent></Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="categories">
            <div className="grid gap-2 md:grid-cols-3">
              {cats.map((c) => (
                <Card key={c.id}><CardContent className="p-3 flex items-center gap-3">
                  <span className="h-3 w-3 rounded-full" style={{ background: c.color || "#94a3b8" }} />
                  <div><p className="font-medium">{c.name}</p>
                    <p className="text-[10px] text-muted-foreground">{c.slug}</p></div>
                </CardContent></Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

const StatCard = ({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; tone?: "warn" }) => (
  <Card><CardContent className="p-4 flex items-center gap-3">
    <div className={`rounded-md p-2 ${tone === "warn" ? "bg-amber-500/10 text-amber-600" : "bg-primary/10 text-primary"}`}>{icon}</div>
    <div><p className="text-2xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>
  </CardContent></Card>
);

const EmptyState = ({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) => (
  <Card><CardContent className="p-8 text-center">
    <div className="mx-auto h-8 w-8 text-muted-foreground mb-2">{icon}</div>
    <p className="font-medium">{title}</p>
    <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">{body}</p>
  </CardContent></Card>
);

export default FinanceIntelligencePage;