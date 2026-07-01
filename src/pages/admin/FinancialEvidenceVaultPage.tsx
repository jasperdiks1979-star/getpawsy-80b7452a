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
import { AlertTriangle, Search, RefreshCw, Boxes, Bell, LayoutDashboard, Package, Sparkles } from "lucide-react";
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
