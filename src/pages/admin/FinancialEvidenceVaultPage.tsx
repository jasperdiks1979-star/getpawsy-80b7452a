import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuthenticatedFetch } from "@/hooks/useAuthenticatedFetch";
import { toast } from "sonner";
import { AlertTriangle, Search, RefreshCw, Boxes, Bell, LayoutDashboard, Package, Sparkles, Receipt, FileWarning, Copy, Download } from "lucide-react";
import { Link } from "react-router-dom";

type Kpis = {
  totalAssets: number;
  activeAssets: number;
  bookValueCents: number;
  openAlerts: number;
  criticalAlerts: number;
  activeSubscriptions: number;
  subscriptionMonthlyCents: number;
  suppliers: number;
};

type VatState = {
  period: { year: number; quarter: number; start: string; end: string };
  totals: { vatTotal: number; recoverable: number; nonRecoverable: number; invoiceCount: number };
  missing: any[];
  duplicates: any[][];
  reconciliations: any[];
  summaries: any[];
};

const currency = (cents: number, ccy = "EUR") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: ccy }).format(cents / 100);

export default function FinancialEvidenceVaultPage() {
  const { invokeFunction } = useAuthenticatedFetch();
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningJob, setRunningJob] = useState<string | null>(null);
  const [vat, setVat] = useState<VatState | null>(null);
  const [vatLoading, setVatLoading] = useState(false);
  const [vatGenerating, setVatGenerating] = useState(false);

  async function loadAll() {
    setLoading(true);
    const [{ data: a }, { data: al }, { data: subs }, { data: sups }] = await Promise.all([
      supabase.from("finance_assets").select("id,name,category,asset_status,purchase_date,purchase_amount_cents,current_book_value_cents,warranty_until,currency").order("created_at", { ascending: false }).limit(200),
      supabase.from("finance_alerts").select("id,alert_type,severity,title,detail,is_resolved,created_at,subject_type,subject_id").eq("is_resolved", false).order("created_at", { ascending: false }).limit(50),
      supabase.from("finance_subscriptions").select("amount_minor,cadence,is_active"),
      supabase.from("evidence_suppliers").select("id", { count: "exact", head: true }),
    ]);
    setAssets(a ?? []);
    setAlerts(al ?? []);

    const activeAssets = (a ?? []).filter((x) => x.asset_status === "active" || x.asset_status === "repair");
    const bookValue = activeAssets.reduce((s, x) => s + (x.current_book_value_cents ?? 0), 0);
    const activeSubs = (subs ?? []).filter((s) => s.is_active);
    const monthly = activeSubs.reduce((s, x) => {
      const amt = Number(x.amount_minor ?? 0);
      return s + (x.cadence === "annual" ? amt / 12 : x.cadence === "quarterly" ? amt / 3 : x.cadence === "weekly" ? amt * 4.33 : amt);
    }, 0);

    setKpis({
      totalAssets: (a ?? []).length,
      activeAssets: activeAssets.length,
      bookValueCents: bookValue,
      openAlerts: (al ?? []).length,
      criticalAlerts: (al ?? []).filter((x) => x.severity === "critical").length,
      activeSubscriptions: activeSubs.length,
      subscriptionMonthlyCents: Math.round(monthly),
      suppliers: (sups as any)?.count ?? 0,
    });
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { loadVat(); }, []);

  async function runJob(fn: string, label: string) {
    setRunningJob(fn);
    const { data, error } = await invokeFunction<{ ok: boolean }>(fn, {});
    setRunningJob(null);
    if (error || !data?.ok) toast.error(`${label} failed`);
    else { toast.success(`${label} complete`); loadAll(); }
  }

  async function doSearch() {
    if (!query.trim()) { setResults([]); return; }
    const q = query.trim().split(/\s+/).map((t) => `${t}:*`).join(" & ");
    const { data, error } = await supabase
      .from("finance_search_index")
      .select("entity_type,entity_id,title,body,metadata")
      .textSearch("tsv", q, { config: "simple" })
      .limit(50);
    if (error) toast.error(error.message);
    setResults(data ?? []);
  }

  async function resolveAlert(id: string) {
    await supabase.from("finance_alerts").update({ is_resolved: true, resolved_at: new Date().toISOString() }).eq("id", id);
    loadAll();
  }

  async function loadVat() {
    setVatLoading(true);
    const now = new Date();
    const y = now.getUTCFullYear();
    const q = Math.floor(now.getUTCMonth() / 3) + 1;
    const startMonth = (q - 1) * 3;
    const start = new Date(Date.UTC(y, startMonth, 1)).toISOString().slice(0, 10);
    const end = new Date(Date.UTC(y, startMonth + 3, 0)).toISOString().slice(0, 10);

    const [{ data: docs }, { data: recs }, { data: summaries }] = await Promise.all([
      supabase
        .from("evidence_documents")
        .select("id,title,supplier_name,invoice_number,document_date,amount_minor,vat_minor,currency,tax_country,document_type,sha256")
        .gte("document_date", start).lte("document_date", end)
        .limit(2000),
      supabase.from("finance_vat_reconciliations")
        .select("id,period_year,period_number,status,imported_vat_minor,calculated_vat_minor,delta_minor,missing_docs,created_at")
        .order("created_at", { ascending: false }).limit(8),
      supabase.from("finance_vat_summaries")
        .select("period_year,period_number,vat_total_minor,recoverable_minor,non_recoverable_minor,outstanding_minor,invoice_count,currency,computed_at")
        .order("computed_at", { ascending: false }).limit(4),
    ]);

    const rows = docs ?? [];
    let recoverable = 0, nonRecoverable = 0, vatTotal = 0;
    const missing: any[] = [];
    const dupMap = new Map<string, any[]>();
    for (const d of rows) {
      const vat = Number(d.vat_minor ?? 0);
      const amt = Number(d.amount_minor ?? 0);
      if (vat > 0) {
        vatTotal += vat;
        if ((d.tax_country ?? "").toUpperCase() === "NL") recoverable += vat;
        else nonRecoverable += vat;
      } else if (amt > 0 && (d.document_type === "invoice" || d.document_type === "receipt")) {
        missing.push(d);
      }
      const key = `${(d.supplier_name || "").toLowerCase()}|${(d.invoice_number || "").toLowerCase()}`;
      if (d.invoice_number) {
        const arr = dupMap.get(key) ?? []; arr.push(d); dupMap.set(key, arr);
      }
    }
    const duplicates = Array.from(dupMap.values()).filter((a) => a.length > 1);

    setVat({
      period: { year: y, quarter: q, start, end },
      totals: { vatTotal, recoverable, nonRecoverable, invoiceCount: rows.length },
      missing, duplicates,
      reconciliations: recs ?? [],
      summaries: summaries ?? [],
    });
    setVatLoading(false);
  }

  async function generateQuarterlyVatReport() {
    if (!vat) return;
    setVatGenerating(true);
    const { data, error } = await invokeFunction<{ ok: boolean }>("finance-vat-reconcile", {
      body: {
        triggered_by: "vault_v14_ui",
        period_type: "quarter",
        period_year: vat.period.year,
        period_number: vat.period.quarter,
      },
    });
    setVatGenerating(false);
    if (error || !data?.ok) toast.error("Quarterly VAT report failed");
    else { toast.success(`Q${vat.period.quarter} ${vat.period.year} VAT report generated`); loadVat(); }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Helmet><title>Financial Evidence Vault — Genesis V14</title></Helmet>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Financial Evidence Vault</h1>
          <p className="text-muted-foreground text-sm">Genesis V14 · CFO, accounting & tax intelligence</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="default">
            <Link to="/admin/cfo"><Sparkles className="h-4 w-4" /> Ask the CFO</Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => runJob("finance-alerts-scan", "Alerts scan")} disabled={!!runningJob}>
            <Bell className="h-4 w-4" /> Scan alerts
          </Button>
          <Button variant="outline" size="sm" onClick={() => runJob("finance-asset-depreciate", "Depreciation")} disabled={!!runningJob}>
            <RefreshCw className="h-4 w-4" /> Recompute book value
          </Button>
          <Button variant="outline" size="sm" onClick={() => runJob("finance-search-reindex", "Search reindex")} disabled={!!runningJob}>
            <Search className="h-4 w-4" /> Rebuild search
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview"><LayoutDashboard className="h-4 w-4 mr-1" />Overview</TabsTrigger>
          <TabsTrigger value="assets"><Boxes className="h-4 w-4 mr-1" />Assets</TabsTrigger>
          <TabsTrigger value="vat"><Receipt className="h-4 w-4 mr-1" />VAT{vat && (vat.missing.length + vat.duplicates.length) > 0 ? <Badge variant="secondary" className="ml-2">{vat.missing.length + vat.duplicates.length}</Badge> : null}</TabsTrigger>
          <TabsTrigger value="alerts"><Bell className="h-4 w-4 mr-1" />Alerts {kpis?.openAlerts ? <Badge variant="secondary" className="ml-2">{kpis.openAlerts}</Badge> : null}</TabsTrigger>
          <TabsTrigger value="search"><Search className="h-4 w-4 mr-1" />Search</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Kpi label="Active assets" value={kpis?.activeAssets ?? 0} sub={`${kpis?.totalAssets ?? 0} total`} />
            <Kpi label="Asset book value" value={currency(kpis?.bookValueCents ?? 0)} sub="linear depreciation" />
            <Kpi label="Monthly subscriptions" value={currency(kpis?.subscriptionMonthlyCents ?? 0)} sub={`${kpis?.activeSubscriptions ?? 0} active`} />
            <Kpi label="Suppliers" value={kpis?.suppliers ?? 0} sub={`${kpis?.openAlerts ?? 0} open alerts`} />
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Recent alerts</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {loading ? <p className="text-sm text-muted-foreground">Loading…</p> :
                alerts.length === 0 ? <p className="text-sm text-muted-foreground">No open alerts.</p> :
                alerts.slice(0, 8).map((a) => (
                  <div key={a.id} className="flex items-start justify-between border-b pb-2 last:border-0">
                    <div className="flex gap-3 items-start">
                      <AlertTriangle className={`h-4 w-4 mt-1 ${a.severity === "critical" ? "text-destructive" : a.severity === "warning" ? "text-amber-500" : "text-muted-foreground"}`} />
                      <div>
                        <div className="font-medium text-sm">{a.title}</div>
                        <div className="text-xs text-muted-foreground">{a.detail}</div>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => resolveAlert(a.id)}>Resolve</Button>
                  </div>
                ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assets">
          <Card>
            <CardHeader><CardTitle className="text-base">Company asset registry</CardTitle></CardHeader>
            <CardContent>
              {assets.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No assets registered yet. Assets get created from the Evidence Vault when Genesis detects a durable purchase (Apple, Dell, camera, etc.),
                  or you can add one manually from the Evidence Vault after uploading the invoice.
                </p>
              ) : (
                <div className="divide-y">
                  {assets.map((a) => (
                    <div key={a.id} className="py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Package className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="font-medium text-sm">{a.name}</div>
                          <div className="text-xs text-muted-foreground">{a.category} · {a.asset_status}{a.warranty_until ? ` · warranty until ${a.warranty_until}` : ""}</div>
                        </div>
                      </div>
                      <div className="text-right text-sm">
                        <div>{currency(a.current_book_value_cents ?? a.purchase_amount_cents ?? 0, a.currency ?? "EUR")}</div>
                        <div className="text-xs text-muted-foreground">since {a.purchase_date ?? "—"}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vat" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">VAT Intelligence</h2>
              <p className="text-xs text-muted-foreground">
                Current quarter: Q{vat?.period.quarter} {vat?.period.year} ({vat?.period.start} → {vat?.period.end})
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={loadVat} disabled={vatLoading}>
                <RefreshCw className="h-4 w-4" /> Refresh
              </Button>
              <Button size="sm" onClick={generateQuarterlyVatReport} disabled={vatGenerating || !vat}>
                <Download className="h-4 w-4" /> {vatGenerating ? "Generating…" : "Generate quarterly VAT report"}
              </Button>
            </div>
          </div>

          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Kpi label="Recoverable VAT (NL)" value={currency(vat?.totals.recoverable ?? 0)} sub="tax_country = NL" />
            <Kpi label="Non-recoverable VAT" value={currency(vat?.totals.nonRecoverable ?? 0)} sub="foreign / no NL VAT" />
            <Kpi label="Missing VAT" value={vat?.missing.length ?? 0} sub="invoices with amount, no VAT" />
            <Kpi label="Duplicate invoices" value={vat?.duplicates.length ?? 0} sub="same supplier + invoice #" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileWarning className="h-4 w-4" /> Missing VAT ({vat?.missing.length ?? 0})</CardTitle></CardHeader>
              <CardContent className="space-y-2 max-h-96 overflow-auto">
                {vatLoading ? <p className="text-sm text-muted-foreground">Loading…</p> :
                  (vat?.missing.length ?? 0) === 0 ? <p className="text-sm text-muted-foreground">No missing VAT this quarter.</p> :
                  vat!.missing.slice(0, 50).map((d) => (
                    <div key={d.id} className="text-sm border-b pb-1 last:border-0">
                      <div className="font-medium">{d.supplier_name || d.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {d.document_date} · {d.invoice_number || "no invoice #"} · {currency(d.amount_minor ?? 0, d.currency ?? "EUR")}
                      </div>
                    </div>
                  ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Copy className="h-4 w-4" /> Duplicate invoices ({vat?.duplicates.length ?? 0})</CardTitle></CardHeader>
              <CardContent className="space-y-3 max-h-96 overflow-auto">
                {vatLoading ? <p className="text-sm text-muted-foreground">Loading…</p> :
                  (vat?.duplicates.length ?? 0) === 0 ? <p className="text-sm text-muted-foreground">No duplicates detected.</p> :
                  vat!.duplicates.slice(0, 50).map((group, i) => (
                    <div key={i} className="border-b pb-2 last:border-0">
                      <div className="font-medium text-sm">{group[0].supplier_name} · #{group[0].invoice_number}</div>
                      <div className="text-xs text-muted-foreground">{group.length} copies — VAT sha256 differs: {new Set(group.map((g: any) => g.sha256)).size > 1 ? "yes" : "no"}</div>
                    </div>
                  ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Reconciliation history</CardTitle></CardHeader>
            <CardContent>
              {(vat?.reconciliations.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">No reconciliations yet — click “Generate quarterly VAT report” to run the first one.</p>
              ) : (
                <div className="divide-y text-sm">
                  {vat!.reconciliations.map((r) => (
                    <div key={r.id} className="py-2 flex items-center justify-between">
                      <div>
                        <div className="font-medium">Q{r.period_number} {r.period_year} · <Badge variant={r.status === "ok" ? "secondary" : "destructive"}>{r.status}</Badge></div>
                        <div className="text-xs text-muted-foreground">
                          calc {currency(r.calculated_vat_minor ?? 0)} · imported {currency(r.imported_vat_minor ?? 0)} · Δ {currency(r.delta_minor ?? 0)} · missing {r.missing_docs ?? 0}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts">
          <Card>
            <CardHeader><CardTitle className="text-base">Open alerts ({alerts.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {alerts.length === 0 ? <p className="text-sm text-muted-foreground">All clear.</p> :
                alerts.map((a) => (
                  <div key={a.id} className="flex items-start justify-between border-b pb-2 last:border-0">
                    <div className="flex gap-3 items-start">
                      <Badge variant={a.severity === "critical" ? "destructive" : "secondary"}>{a.alert_type}</Badge>
                      <div>
                        <div className="font-medium text-sm">{a.title}</div>
                        <div className="text-xs text-muted-foreground">{a.detail}</div>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => resolveAlert(a.id)}>Resolve</Button>
                  </div>
                ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="search">
          <Card>
            <CardHeader><CardTitle className="text-base">Global finance search</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input placeholder="Supplier, invoice #, asset serial, amount…" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doSearch()} />
                <Button onClick={doSearch}><Search className="h-4 w-4" /></Button>
              </div>
              {results.length === 0 ? <p className="text-sm text-muted-foreground">Try running Rebuild search first if this is a fresh install.</p> :
                <div className="divide-y">
                  {results.map((r) => (
                    <div key={`${r.entity_type}-${r.entity_id}`} className="py-2">
                      <div className="text-xs uppercase text-muted-foreground">{r.entity_type}</div>
                      <div className="font-medium text-sm">{r.title}</div>
                      <div className="text-xs text-muted-foreground line-clamp-2">{r.body}</div>
                    </div>
                  ))}
                </div>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
        {sub ? <div className="text-xs text-muted-foreground mt-1">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}
