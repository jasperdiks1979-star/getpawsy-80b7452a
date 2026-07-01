import { useEffect, useMemo, useState } from "react";
import { Navigate, NavLink } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, FileText, Landmark, Receipt, Shield, ShieldCheck, AlertTriangle, RefreshCw, Download, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Helmet } from "react-helmet-async";

type Doc = { id: string; title: string; document_type: string; supplier_name: string | null; document_date: string | null; amount_minor: number | null; vat_minor: number | null; currency: string | null; sha256: string; };
type Vat = { id: string; period_type: string; period_year: number; period_number: number | null; recoverable_minor: number; vat_total_minor: number; currency: string; invoice_count: number };
type Recon = { id: string; period_type: string; period_year: number; period_number: number | null; status: string; currency: string; imported_vat_minor: number; calculated_vat_minor: number; delta_minor: number; delta_pct: number; invoice_count: number; missing_docs: number; evidence_sha256: string | null; triggered_by: string; created_at: string };

const money = (m: number | null | undefined, c?: string | null) =>
  m == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: c || "EUR" }).format(m / 100);

const AccountantPortalPage = () => {
  const { user, isAdmin, isLoading } = useAuth();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [vats, setVats] = useState<Vat[]>([]);
  const [recons, setRecons] = useState<Recon[]>([]);
  const [running, setRunning] = useState(false);
  const [roles, setRoles] = useState<string[]>([]);
  const [exporting, setExporting] = useState<string | null>(null);
  const [lastExport, setLastExport] = useState<{ label: string; url: string | null; bytes: number; sha256: string; totals: Record<string, number> } | null>(null);

  useEffect(() => {
    (async () => {
      if (user) {
        const r = await supabase.from("user_roles").select("role").eq("user_id", user.id);
        if (r.data) setRoles(r.data.map((x: { role: string }) => x.role));
      }
      const [d, v, r] = await Promise.all([
        supabase.from("evidence_documents").select("id,title,document_type,supplier_name,document_date,amount_minor,vat_minor,currency,sha256").order("document_date", { ascending: false, nullsFirst: false }).limit(500),
        supabase.from("finance_vat_summaries").select("*").order("period_year", { ascending: false }),
        supabase.from("finance_vat_reconciliations").select("*").order("created_at", { ascending: false }).limit(50),
      ]);
      if (d.data) setDocs(d.data as Doc[]);
      if (v.data) setVats(v.data as Vat[]);
      if (r.data) setRecons(r.data as Recon[]);
    })();
  }, [user]);

  const allowed = useMemo(() => isAdmin || roles.includes("accountant") || roles.includes("auditor"), [isAdmin, roles]);

  if (isLoading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  if (!allowed) return <Navigate to="/dashboard" replace />;

  const invoices = docs.filter((d) => d.document_type === "invoice");
  const receipts = docs.filter((d) => d.document_type === "receipt");

  const runReconcile = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("finance-vat-reconcile", {
        body: { triggered_by: "manual" },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Reconciliation failed");
      toast.success(`Reconciliation ${data.reconciliation.status.toUpperCase()} · Δ ${money(data.reconciliation.delta_minor, data.reconciliation.currency)}`);
      const { data: r } = await supabase.from("finance_vat_reconciliations").select("*").order("created_at", { ascending: false }).limit(50);
      if (r) setRecons(r as Recon[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reconciliation failed");
    } finally {
      setRunning(false);
    }
  };

  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentQuarter = Math.floor(now.getUTCMonth() / 3) + 1;

  const runExport = async (scope: "quarter" | "year" | "all", opts?: { year?: number; quarter?: number }) => {
    const key = `${scope}-${opts?.year ?? ""}-${opts?.quarter ?? ""}`;
    setExporting(key);
    try {
      const { data, error } = await supabase.functions.invoke("finance-accountant-export", {
        body: { scope, year: opts?.year ?? currentYear, quarter: opts?.quarter ?? null },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Export failed");
      setLastExport({ label: data.period.label, url: data.zip.signed_url, bytes: data.zip.bytes, sha256: data.zip.sha256, totals: data.totals });
      toast.success(`Dossier ready · ${data.totals.documents} documents · ${(data.zip.bytes / 1024 / 1024).toFixed(2)} MB`);
      if (data.zip.signed_url) window.open(data.zip.signed_url, "_blank", "noopener");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Helmet><title>Accountant Portal · GetPawsy</title></Helmet>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex items-center gap-3 mb-6">
          <NavLink to="/admin" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-5 w-5" /></NavLink>
          <Landmark className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Accountant Portal</h1>
            <p className="text-sm text-muted-foreground">Read-only bookkeeping view · Invoices, receipts, VAT &amp; evidence</p>
          </div>
        </div>

        <Tabs defaultValue="invoices">
          <TabsList className="mb-4"><TabsTrigger value="invoices">Invoices</TabsTrigger><TabsTrigger value="receipts">Receipts</TabsTrigger><TabsTrigger value="vat">VAT summaries</TabsTrigger><TabsTrigger value="reconcile">VAT reconciliation</TabsTrigger><TabsTrigger value="export">Export dossier</TabsTrigger></TabsList>

          <TabsContent value="invoices">
            <DocList items={invoices} empty="No invoices archived yet." icon={<FileText className="h-6 w-6" />} />
          </TabsContent>
          <TabsContent value="receipts">
            <DocList items={receipts} empty="No receipts archived yet." icon={<Receipt className="h-6 w-6" />} />
          </TabsContent>
          <TabsContent value="vat">
            {vats.length === 0 ? (
              <Card><CardContent className="p-8 text-sm text-muted-foreground text-center">
                <Shield className="h-6 w-6 mx-auto mb-2" />
                VAT summaries are generated after the first quarter of imported invoices. Nothing to reclaim yet.
              </CardContent></Card>
            ) : (
              <div className="grid gap-2">
                {vats.map((v) => (
                  <Card key={v.id}><CardContent className="p-3 flex items-center justify-between">
                    <div><p className="font-medium">{v.period_type === "quarter" ? `Q${v.period_number} ${v.period_year}` : `FY ${v.period_year}`}</p>
                      <p className="text-xs text-muted-foreground">{v.invoice_count} invoices</p></div>
                    <div className="text-right"><p className="font-medium">{money(v.recoverable_minor, v.currency)}</p>
                      <p className="text-xs text-muted-foreground">recoverable of {money(v.vat_total_minor, v.currency)}</p></div>
                  </CardContent></Card>
                ))}
              </div>
            )}
          </TabsContent>
          <TabsContent value="reconcile">
            <Card className="mb-4"><CardContent className="p-4 flex items-center justify-between gap-3">
              <div>
                <p className="font-medium flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Automated quarterly VAT reconciliation</p>
                <p className="text-xs text-muted-foreground">Runs every quarter · compares imported VAT vs calculated VAT from evidence · logs SHA-256 audit fingerprint</p>
              </div>
              <Button onClick={runReconcile} disabled={running} size="sm">
                <RefreshCw className={`h-4 w-4 mr-2 ${running ? "animate-spin" : ""}`} />
                {running ? "Reconciling…" : "Run now"}
              </Button>
            </CardContent></Card>
            {recons.length === 0 ? (
              <Card><CardContent className="p-8 text-sm text-muted-foreground text-center">No reconciliation runs yet. Click <b>Run now</b> to reconcile the previous quarter.</CardContent></Card>
            ) : (
              <div className="grid gap-2">
                {recons.map((r) => {
                  const badgeVariant = r.status === "ok" ? "default" : r.status === "warning" ? "secondary" : "destructive";
                  return (
                    <Card key={r.id}><CardContent className="p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium flex items-center gap-2">
                            {r.status !== "ok" && <AlertTriangle className="h-4 w-4 text-amber-600" />}
                            {r.period_type === "quarter" ? `Q${r.period_number} ${r.period_year}` : `FY ${r.period_year}`}
                            <Badge variant={badgeVariant as "default" | "secondary" | "destructive"} className="text-[10px] uppercase">{r.status}</Badge>
                            <Badge variant="outline" className="text-[10px]">{r.triggered_by}</Badge>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Imported {money(r.imported_vat_minor, r.currency)} · Calculated {money(r.calculated_vat_minor, r.currency)} · {r.invoice_count} invoices
                            {r.missing_docs > 0 ? ` · ${r.missing_docs} missing VAT` : ""}
                          </p>
                          {r.evidence_sha256 && <p className="text-[10px] font-mono text-muted-foreground truncate">sha: {r.evidence_sha256.slice(0, 32)}…</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`font-medium ${Math.abs(r.delta_minor) > 100 ? "text-amber-700" : ""}`}>Δ {money(r.delta_minor, r.currency)}</p>
                          <p className="text-xs text-muted-foreground">{Number(r.delta_pct).toFixed(2)}% · {new Date(r.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                    </CardContent></Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
          <TabsContent value="export">
            <Card className="mb-4"><CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1"><Package className="h-4 w-4" /><p className="font-medium">Accountant Mode dossier</p></div>
              <p className="text-xs text-muted-foreground mb-4">
                Bundles expenses, invoices, receipts, assets, VAT, suppliers, subscriptions, ad-spend and payments — with original PDFs and a SHA-256 manifest — into a single downloadable ZIP.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" disabled={!!exporting} onClick={() => runExport("quarter", { year: currentYear, quarter: currentQuarter })}>
                  <Download className={`h-4 w-4 mr-2 ${exporting?.startsWith("quarter") ? "animate-pulse" : ""}`} />
                  Current quarter (Q{currentQuarter} {currentYear})
                </Button>
                <Button size="sm" variant="secondary" disabled={!!exporting} onClick={() => {
                  const q = currentQuarter === 1 ? 4 : currentQuarter - 1;
                  const y = currentQuarter === 1 ? currentYear - 1 : currentYear;
                  return runExport("quarter", { year: y, quarter: q });
                }}>
                  <Download className="h-4 w-4 mr-2" />
                  Previous quarter
                </Button>
                <Button size="sm" variant="secondary" disabled={!!exporting} onClick={() => runExport("year", { year: currentYear })}>
                  <Download className="h-4 w-4 mr-2" />
                  Year to date ({currentYear})
                </Button>
                <Button size="sm" variant="secondary" disabled={!!exporting} onClick={() => runExport("year", { year: currentYear - 1 })}>
                  <Download className="h-4 w-4 mr-2" />
                  Full year {currentYear - 1}
                </Button>
                <Button size="sm" disabled={!!exporting} onClick={() => runExport("all")}>
                  <Download className={`h-4 w-4 mr-2 ${exporting === "all--" ? "animate-pulse" : ""}`} />
                  All-time archive
                </Button>
              </div>
              {exporting && <p className="text-xs text-muted-foreground mt-3">Building dossier… downloading originals and hashing files. This may take a minute for large periods.</p>}
            </CardContent></Card>
            {lastExport && (
              <Card><CardContent className="p-4">
                <p className="font-medium mb-1">Latest export · {lastExport.label}</p>
                <p className="text-xs text-muted-foreground">
                  {lastExport.totals.documents} documents · {lastExport.totals.invoices} invoices · {lastExport.totals.receipts} receipts · {lastExport.totals.assets} assets · {lastExport.totals.suppliers} suppliers
                </p>
                <p className="text-[10px] font-mono text-muted-foreground mt-1">sha256: {lastExport.sha256}</p>
                <p className="text-xs text-muted-foreground mt-1">Size: {(lastExport.bytes / 1024 / 1024).toFixed(2)} MB · signed URL valid 30 days</p>
                {lastExport.url && (
                  <Button size="sm" className="mt-3" onClick={() => window.open(lastExport.url!, "_blank", "noopener")}>
                    <Download className="h-4 w-4 mr-2" /> Download ZIP
                  </Button>
                )}
              </CardContent></Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

const DocList = ({ items, empty, icon }: { items: Doc[]; empty: string; icon: React.ReactNode }) => (
  items.length === 0 ? (
    <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
      <div className="mx-auto mb-2 text-muted-foreground">{icon}</div>{empty}
    </CardContent></Card>
  ) : (
    <div className="grid gap-2">
      {items.map((d) => (
        <Card key={d.id}><CardContent className="p-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium truncate">{d.title}</p>
            <p className="text-xs text-muted-foreground truncate">{d.supplier_name || "—"} · {d.document_date || "—"}</p>
            <p className="text-[10px] font-mono text-muted-foreground">sha: {d.sha256.slice(0, 20)}…</p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-medium">{money(d.amount_minor, d.currency)}</p>
            {d.vat_minor ? <Badge variant="outline" className="text-[10px]">VAT {money(d.vat_minor, d.currency)}</Badge> : null}
          </div>
        </CardContent></Card>
      ))}
    </div>
  )
);

export default AccountantPortalPage;