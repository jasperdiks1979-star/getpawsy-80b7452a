import { useEffect, useMemo, useState } from "react";
import { Navigate, NavLink } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, ExternalLink, FileText, Search, Shield, Building2, Receipt, Clock, Download, UploadCloud, Sparkles } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

type Supplier = {
  id: string;
  name: string;
  slug: string;
  website: string | null;
  vat_number: string | null;
  country: string | null;
  currency: string | null;
  category: string | null;
  invoice_count: number;
  total_paid_minor: number;
  first_invoice_at: string | null;
  latest_invoice_at: string | null;
};

type EvidenceDoc = {
  id: string;
  title: string;
  document_type: string;
  category: string;
  supplier_name: string | null;
  invoice_number: string | null;
  document_date: string | null;
  amount_minor: number | null;
  currency: string | null;
  vat_minor: number | null;
  sha256: string;
  public_path: string | null;
  storage_path: string | null;
  file_size: number | null;
  integrity_verified: boolean;
  created_at: string;
};

type Payment = {
  id: string;
  provider: string | null;
  amount_minor: number;
  currency: string;
  vat_minor: number | null;
  status: string;
  paid_at: string | null;
  bank_txn_reference: string | null;
};

type TimelineEvent = {
  id: string;
  event_at: string;
  event_type: string;
  title: string;
  description: string | null;
  amount_minor: number | null;
  currency: string | null;
};

const money = (minor: number | null | undefined, ccy: string | null | undefined) => {
  if (minor == null) return "—";
  const n = minor / 100;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: ccy || "USD" }).format(n);
};

const EvidenceVaultPage = () => {
  const { isAdmin, isLoading } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [docs, setDocs] = useState<EvidenceDoc[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [s, d, p, t] = await Promise.all([
      supabase.from("evidence_suppliers").select("*").order("name"),
      supabase.from("evidence_documents").select("*").order("document_date", { ascending: false, nullsFirst: false }).limit(500),
      supabase.from("evidence_payments").select("*").order("paid_at", { ascending: false, nullsFirst: false }).limit(500),
      supabase.from("evidence_timeline").select("*").order("event_at", { ascending: false }).limit(200),
    ]);
    if (s.data) setSuppliers(s.data as Supplier[]);
    if (d.data) setDocs(d.data as EvidenceDoc[]);
    if (p.data) setPayments(p.data as Payment[]);
    if (t.data) setTimeline(t.data as TimelineEvent[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return docs;
    return docs.filter((d) =>
      [d.title, d.supplier_name, d.invoice_number, d.category, d.sha256]
        .some((v) => (v || "").toLowerCase().includes(needle))
    );
  }, [docs, q]);

  const stats = useMemo(() => {
    const total = docs.length;
    const suppliersCount = suppliers.length;
    const totalPaid = payments.reduce((sum, p) => sum + (p.amount_minor || 0), 0);
    const invoices = docs.filter((d) => d.document_type === "invoice").length;
    return { total, suppliersCount, totalPaid, invoices };
  }, [docs, suppliers, payments]);

  if (isLoading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Evidence Vault · GetPawsy Admin</title>
      </Helmet>
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="flex items-center gap-3 mb-8">
          <NavLink to="/admin/vault" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </NavLink>
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Evidence Vault</h1>
              <p className="text-sm text-muted-foreground">
                Genesis V11.1 · Immutable financial &amp; accounting archive
              </p>
            </div>
          </div>
          <NavLink
            to="/admin/finance"
            className="ml-auto inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Open Finance Intelligence →
          </NavLink>
        </div>

        <StripeImportPanel />
        <ManualImportPanel onImported={load} />


        <div className="grid gap-4 md:grid-cols-4 mb-6">
          <StatCard label="Evidence documents" value={stats.total} icon={<FileText className="h-5 w-5" />} />
          <StatCard label="Suppliers" value={stats.suppliersCount} icon={<Building2 className="h-5 w-5" />} />
          <StatCard label="Invoices archived" value={stats.invoices} icon={<Receipt className="h-5 w-5" />} />
          <StatCard label="Total paid" value={money(stats.totalPaid, "USD")} icon={<Receipt className="h-5 w-5" />} />
        </div>

        <Tabs defaultValue="documents">
          <TabsList className="mb-4">
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="belastingdienst">Belastingdienst</TabsTrigger>
          </TabsList>

          <TabsContent value="documents">
            <div className="flex items-center gap-2 mb-4">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder='Search: "Stripe June", "OpenAI", "Invoice 1458", "$25", SHA…'
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="max-w-xl"
              />
              <Badge variant="outline">{filtered.length} matching</Badge>
            </div>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading evidence…</p>
            ) : filtered.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-sm text-muted-foreground">
                  No evidence documents yet. Original invoices and receipts will appear here once
                  the auto-import connectors are activated (Phase 2). You can also upload
                  documents manually via the API.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3">
                {filtered.map((d) => (
                  <Card key={d.id}>
                    <CardContent className="p-4 flex items-start gap-4">
                      <FileText className="h-6 w-6 text-primary shrink-0 mt-1" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium">{d.title}</p>
                          <Badge variant="secondary">{d.document_type}</Badge>
                          <Badge variant="outline">{d.category}</Badge>
                          {d.integrity_verified && (
                            <Badge className="bg-emerald-600 text-white">SHA-verified</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          {d.supplier_name || "—"}
                          {d.invoice_number ? ` · #${d.invoice_number}` : ""}
                          {d.document_date ? ` · ${d.document_date}` : ""}
                          {" · "}
                          {money(d.amount_minor, d.currency)}
                          {d.vat_minor ? ` (VAT ${money(d.vat_minor, d.currency)})` : ""}
                        </p>
                        <p className="text-[10px] font-mono text-muted-foreground mt-1 truncate">
                          sha256: {d.sha256.slice(0, 32)}…
                        </p>
                      </div>
                      {d.public_path && (
                        <Button size="sm" variant="outline" asChild>
                          <a href={d.public_path} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="suppliers">
            <div className="grid gap-3 md:grid-cols-2">
              {suppliers.map((s) => (
                <Card key={s.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{s.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.category || "—"} · {s.country || "—"} · {s.currency || "USD"}
                        </p>
                      </div>
                      <Badge variant="outline">{s.invoice_count} invoices</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Total paid: {money(s.total_paid_minor, s.currency)}
                    </p>
                    {s.website && (
                      <a
                        href={s.website}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-1"
                      >
                        {s.website} <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="payments">
            {payments.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-sm text-muted-foreground">
                  Payment register is empty. Payments auto-populate when invoices are imported
                  with matching bank-transaction confirmations (Phase 2 connector).
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-2">
                {payments.map((p) => (
                  <Card key={p.id}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium">{money(p.amount_minor, p.currency)}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.provider || "—"} · {p.status} ·{" "}
                          {p.paid_at ? new Date(p.paid_at).toLocaleDateString() : "—"}
                        </p>
                      </div>
                      <Badge variant="outline">{p.bank_txn_reference || "no ref"}</Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="timeline">
            <div className="space-y-2">
              {timeline.map((e) => (
                <Card key={e.id}>
                  <CardContent className="p-4 flex items-start gap-3">
                    <Clock className="h-4 w-4 mt-1 text-muted-foreground" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{e.title}</p>
                        <Badge variant="secondary">{e.event_type}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(e.event_at).toLocaleString()}
                        {e.amount_minor ? ` · ${money(e.amount_minor, e.currency)}` : ""}
                      </p>
                      {e.description && <p className="text-sm mt-1">{e.description}</p>}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {timeline.length === 0 && (
                <p className="text-sm text-muted-foreground">Timeline is empty.</p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="belastingdienst">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Belastingdienst Package</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  One-click export of every invoice, receipt, VAT statement, payment
                  confirmation, audit report, Genesis certification, evidence index and SHA-256
                  verification list — packaged with a Dutch-language ReadMe for the accountant.
                </p>
                <div className="rounded-md border p-4 bg-muted/30 text-sm">
                  <p className="font-medium">Contents (auto-generated at export time)</p>
                  <ul className="list-disc list-inside mt-2 space-y-1 text-muted-foreground">
                    <li>Invoices ZIP · Receipts ZIP · Expense reports</li>
                    <li>VAT reports · Payment register (CSV)</li>
                    <li>Genesis certifications · Audit reports</li>
                    <li>Evidence index (JSON) · SHA-256 verification list</li>
                    <li>ReadMe (NL) — Wet IB §3.8 references</li>
                  </ul>
                </div>
                <Button disabled className="gap-2">
                  <Download className="h-4 w-4" />
                  Generate Belastingdienst ZIP (Phase 2)
                </Button>
                <p className="text-xs text-muted-foreground">
                  ZIP generator ships in Phase 2 once the auto-import connectors have populated
                  the archive with original invoices.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

const StatCard = ({ label, value, icon }: { label: string; value: React.ReactNode; icon: React.ReactNode }) => (
  <Card>
    <CardContent className="p-4 flex items-center gap-3">
      <div className="rounded-md bg-primary/10 p-2 text-primary">{icon}</div>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </CardContent>
  </Card>
);

const StripeImportPanel = () => {
  const [running, setRunning] = useState(false);
  const [sinceDays, setSinceDays] = useState(365);
  const [result, setResult] = useState<any>(null);

  const run = async () => {
    setRunning(true); setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-evidence-import", {
        body: { since_days: sinceDays, limit: 100 },
      });
      if (error) throw error;
      setResult(data);
      toast.success(`Imported ${data?.stats?.invoices ?? 0} invoices · ${data?.stats?.receipts ?? 0} receipts · ${data?.stats?.payouts ?? 0} payouts`);
    } catch (e: any) {
      toast.error(e?.message ?? "Import failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card className="mb-6 border-primary/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Receipt className="h-4 w-4" /> Stripe Auto-Import
          <Badge variant="outline" className="ml-2 text-[10px]">SHA-256 verified</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">Import invoices, receipts, payouts, and balance snapshots from Stripe LIVE. Idempotent (dedupes by SHA + reference). Auto-linked to Stripe supplier.</span>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Since (days)</label>
          <Input type="number" min={1} max={3650} value={sinceDays} onChange={(e)=>setSinceDays(Number(e.target.value)||365)} className="w-24 h-8" />
        </div>
        <Button size="sm" onClick={run} disabled={running}>
          {running ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Importing…</> : "Run Stripe import"}
        </Button>
        {result?.stats && (
          <span className="text-xs text-muted-foreground">
            ✓ {result.stats.invoices} inv · {result.stats.receipts} rcpt · {result.stats.payouts} payouts · {result.stats.skipped} skipped
            {result.stats.errors?.length ? ` · ${result.stats.errors.length} errors` : ""}
          </span>
        )}
      </CardContent>
    </Card>
  );
};

export default EvidenceVaultPage;