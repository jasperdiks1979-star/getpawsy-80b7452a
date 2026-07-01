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
            <TabsTrigger value="backfill">Backfill queue</TabsTrigger>
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
            <BelastingdienstExportPanel />
          </TabsContent>

          <TabsContent value="backfill">
            <BackfillTasksPanel />
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

const ManualImportPanel = ({ onImported }: { onImported: () => void }) => {
  const [file, setFile] = useState<File | null>(null);
  const [supplier, setSupplier] = useState("");
  const [category, setCategory] = useState("");
  const [docType, setDocType] = useState("invoice");
  const [notes, setNotes] = useState("");
  const [taskId, setTaskId] = useState("");
  const [tasks, setTasks] = useState<Array<{ id: string; supplier_slug: string; period_label: string; expected_type: string; status: string }>>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    supabase
      .from("finance_import_tasks")
      .select("id, supplier_slug, period_label, expected_type, status")
      .eq("status", "open")
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(50)
      .then(({ data }) => setTasks(data ?? []));
  }, []);

  const submit = async () => {
    if (!file) { toast.error("Choose a file first"); return; }
    if (file.size > 25 * 1024 * 1024) { toast.error("Max 25 MB per file"); return; }
    setRunning(true); setResult(null);
    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result || "").split(",", 2)[1] ?? "");
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
      });
      const { data, error } = await supabase.functions.invoke("finance-manual-import", {
        body: {
          filename: file.name,
          mime_type: file.type || "application/octet-stream",
          base64: b64,
          hint_supplier: supplier || null,
          hint_category: category || null,
          hint_task_id: taskId || null,
          hint_document_type: docType || null,
          user_notes: notes || null,
        },
      });
      if (error) throw error;
      setResult(data);
      if (data?.deduped) {
        toast.info("Duplicate detected — already archived (SHA-256 match).");
      } else {
        toast.success(`Archived · ${data?.document?.supplier_name ?? "unknown supplier"}${data?.closed_task_id ? " · task closed" : ""}`);
      }
      setFile(null); setSupplier(""); setCategory(""); setNotes(""); setTaskId("");
      onImported();
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
          <UploadCloud className="h-4 w-4" /> Manual Import Assistant
          <Badge variant="outline" className="ml-2 text-[10px] flex items-center gap-1">
            <Sparkles className="h-3 w-3" /> AI OCR
          </Badge>
          <Badge variant="outline" className="text-[10px]">SHA-256</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Upload an invoice, receipt or bill (PDF or image, max 25 MB). The AI assistant extracts
          supplier, invoice number, date, amount and VAT, deduplicates by SHA-256, archives to the
          private vault, and auto-links it to a matching open import task if one exists.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">File</Label>
            <Input
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file && (
              <p className="text-[10px] text-muted-foreground truncate">
                {file.name} · {(file.size / 1024).toFixed(1)} KB · {file.type || "unknown"}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Match open task (optional)</Label>
            <select
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">— auto-detect —</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.supplier_slug} · {t.period_label} · {t.expected_type}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Supplier hint (optional)</Label>
            <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="e.g. OpenAI, Lovable, Cloudflare" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Category hint (optional)</Label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. AI, Software, Hosting" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Document type</Label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="invoice">Invoice</option>
              <option value="receipt">Receipt</option>
              <option value="credit_note">Credit note</option>
              <option value="statement">Statement</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the bookkeeper should know" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={submit} disabled={running || !file}>
            {running ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Extracting & archiving…</> : "Import & archive"}
          </Button>
          {result && !result.deduped && result?.document && (
            <span className="text-xs text-muted-foreground">
              ✓ {result.document.supplier_name ?? "—"} · {result.document.document_type}
              {result.document.invoice_number ? ` · #${result.document.invoice_number}` : ""}
              {result.document.document_date ? ` · ${result.document.document_date}` : ""}
              {result.document.amount_minor != null ? ` · ${(result.document.amount_minor / 100).toFixed(2)} ${result.document.currency ?? ""}` : ""}
              {result.closed_task_id ? " · task closed" : ""}
              {typeof result.confidence === "number" ? ` · conf ${(result.confidence * 100).toFixed(0)}%` : ""}
            </span>
          )}
          {result?.deduped && (
            <span className="text-xs text-amber-600">Duplicate — already archived (SHA match).</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

type ExportResult = {
  ok: boolean;
  period: { label: string; start: string; end: string };
  totals: { documents: number; invoices: number; receipts: number; suppliers: number; payments: number; gross_minor: number; vat_minor: number };
  zip: { storage_path: string; sha256: string; bytes: number; manifest_sha256: string; signed_url: string | null; expires_in_days: number };
};

const BelastingdienstExportPanel = () => {
  const now = new Date();
  const [periodType, setPeriodType] = useState<"quarter" | "year">("quarter");
  const [year, setYear] = useState<number>(now.getUTCFullYear());
  const [quarter, setQuarter] = useState<number>(Math.floor(now.getUTCMonth() / 3) + 1);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ExportResult | null>(null);

  const run = async (override?: { periodType: "quarter" | "year"; year: number; quarter: number | null }) => {
    setRunning(true);
    setResult(null);
    try {
      const pt = override?.periodType ?? periodType;
      const yr = override?.year ?? year;
      const qt = override ? override.quarter : (periodType === "quarter" ? quarter : null);
      const { data, error } = await supabase.functions.invoke("finance-belastingdienst-export", {
        body: { period_type: pt, year: yr, quarter: qt },
      });
      if (error) throw error;
      setResult(data as ExportResult);
      toast.success(`Dossier ${(data as ExportResult).period.label} generated (${(data as ExportResult).totals.documents} docs)`);
    } catch (e: any) {
      toast.error(e?.message ?? "Export failed");
    } finally {
      setRunning(false);
    }
  };

  const oneClickCurrentQuarter = () => {
    const y = now.getUTCFullYear();
    const q = Math.floor(now.getUTCMonth() / 3) + 1;
    setPeriodType("quarter"); setYear(y); setQuarter(q);
    run({ periodType: "quarter", year: y, quarter: q });
  };
  const oneClickPreviousQuarter = () => {
    let q = Math.floor(now.getUTCMonth() / 3) + 1 - 1;
    let y = now.getUTCFullYear();
    if (q < 1) { q = 4; y -= 1; }
    setPeriodType("quarter"); setYear(y); setQuarter(q);
    run({ periodType: "quarter", year: y, quarter: q });
  };
  const oneClickYearToDate = () => {
    const y = now.getUTCFullYear();
    setPeriodType("year"); setYear(y);
    run({ periodType: "year", year: y, quarter: null });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Download className="h-4 w-4" /> Belastingdienst Export
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          One-click quarterly or annual ZIP dossier — invoices, receipts, VAT summary,
          suppliers, payments, evidence index, SHA-256 manifest and Dutch-language ReadMe.
          Stored in the private Evidence Vault; the download link below is valid for 30 days.
        </p>

        <div className="rounded-md border border-primary/30 bg-primary/5 p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">One-click Belastingdienst dossier</p>
              <p className="text-xs text-muted-foreground">
                Instant ZIP with VAT summary, invoices, receipts, evidence hashes en SHA-256 manifest.
                Klaar voor inspectie door de Belastingdienst.
              </p>
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            <Button size="sm" disabled={running} onClick={oneClickCurrentQuarter} className="gap-2">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Current quarter
            </Button>
            <Button size="sm" variant="secondary" disabled={running} onClick={oneClickPreviousQuarter} className="gap-2">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Previous quarter
            </Button>
            <Button size="sm" variant="secondary" disabled={running} onClick={oneClickYearToDate} className="gap-2">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Year-to-date ({now.getUTCFullYear()})
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <Label>Period</Label>
            <select
              className="mt-1 w-full h-9 rounded-md border bg-background px-2 text-sm"
              value={periodType}
              onChange={(e) => setPeriodType(e.target.value as "quarter" | "year")}
            >
              <option value="quarter">Quarter</option>
              <option value="year">Full year</option>
            </select>
          </div>
          <div>
            <Label>Year</Label>
            <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} min={2020} max={now.getUTCFullYear() + 1} />
          </div>
          {periodType === "quarter" && (
            <div>
              <Label>Quarter</Label>
              <select
                className="mt-1 w-full h-9 rounded-md border bg-background px-2 text-sm"
                value={quarter}
                onChange={(e) => setQuarter(Number(e.target.value))}
              >
                <option value={1}>Q1 (Jan–Mar)</option>
                <option value={2}>Q2 (Apr–Jun)</option>
                <option value={3}>Q3 (Jul–Sep)</option>
                <option value={4}>Q4 (Oct–Dec)</option>
              </select>
            </div>
          )}
          <div className="flex items-end">
            <Button disabled={running} onClick={() => run()} className="gap-2 w-full">
              {running ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</> : <><Download className="h-4 w-4" /> Generate ZIP</>}
            </Button>
          </div>
        </div>

        <div className="rounded-md border p-4 bg-muted/30 text-xs text-muted-foreground">
          <p className="font-medium text-foreground mb-1">ZIP contents</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li><code>invoices/&lt;supplier&gt;/*</code> — originele PDF's/afbeeldingen</li>
            <li><code>receipts/&lt;supplier&gt;/*</code> — betalingsbewijzen</li>
            <li><code>other/*</code> — creditnota's, statements</li>
            <li><code>reports/vat-summary.csv</code> + <code>.json</code></li>
            <li><code>reports/suppliers.csv</code> · <code>payments.csv</code> · <code>evidence-index.csv</code></li>
            <li><code>manifest.json</code> — SHA-256 per bestand</li>
            <li><code>README.md</code> — Nederlandse toelichting (Wet IB §3.8, art. 52 AWR)</li>
          </ul>
        </div>

        {result && (
          <div className="rounded-md border border-green-500/40 bg-green-500/5 p-4 space-y-2 text-sm">
            <p className="font-medium">
              ✅ Dossier <code>{result.period.label}</code> — {result.totals.documents} documents
              ({result.totals.invoices} invoices · {result.totals.receipts} receipts · {result.totals.suppliers} suppliers)
            </p>
            <p className="text-xs text-muted-foreground">
              Period {result.period.start} → {result.period.end} · ZIP {(result.zip.bytes / 1024 / 1024).toFixed(2)} MB
            </p>
            <p className="text-xs font-mono break-all">
              SHA-256: {result.zip.sha256}
            </p>
            <p className="text-xs font-mono break-all">
              Manifest SHA-256: {result.zip.manifest_sha256}
            </p>
            {result.zip.signed_url && (
              <a
                href={result.zip.signed_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary underline"
              >
                <Download className="h-3 w-3" /> Download ZIP (link expires in {result.zip.expires_in_days} days)
              </a>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

type BackfillTask = {
  id: string;
  source_type: string;
  source_id: string;
  supplier_hint: string | null;
  reference: string | null;
  document_date: string | null;
  amount_minor: number | null;
  currency: string | null;
  priority: string;
  status: string;
  reason: string;
  auto_recover_result: string | null;
  linked_document_id: string | null;
  created_at: string;
};

type BackfillScan = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  candidates_seen: number;
  auto_recovered: number;
  tasks_created: number;
  tasks_updated: number;
  error_message: string | null;
};

const BackfillTasksPanel = () => {
  const [tasks, setTasks] = useState<BackfillTask[]>([]);
  const [scans, setScans] = useState<BackfillScan[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("open");

  const load = async () => {
    setLoading(true);
    const q = supabase.from("finance_backfill_tasks")
      .select("*")
      .order("priority", { ascending: true })
      .order("document_date", { ascending: false })
      .limit(500);
    if (statusFilter !== "all") q.eq("status", statusFilter);
    const [{ data: t }, { data: s }] = await Promise.all([
      q,
      supabase.from("finance_backfill_scans").select("*").order("started_at", { ascending: false }).limit(10),
    ]);
    setTasks((t as BackfillTask[]) ?? []);
    setScans((s as BackfillScan[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [statusFilter]);

  const runScan = async (dryRun: boolean) => {
    setRunning(true);
    const { data, error } = await supabase.functions.invoke("finance-backfill-scan", {
      body: { dry_run: dryRun },
    });
    setRunning(false);
    if (error) { toast.error(error.message); return; }
    const r = data as { candidates: number; auto: number; created: number; updated: number };
    toast.success(`Scan complete — ${r.candidates} candidates, ${r.auto} auto-linked, ${r.created} new, ${r.updated} updated`);
    void load();
  };

  const updateStatus = async (id: string, status: string) => {
    const patch: Record<string, unknown> = { status };
    if (status === "resolved" || status === "wont_fix") patch.resolved_at = new Date().toISOString();
    const { error } = await supabase.from("finance_backfill_tasks").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    void load();
  };

  const openCount = tasks.filter(t => t.status === "open").length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Backfill task queue</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Scans orders, subscriptions, ad spend and payments for missing evidence documents.
              Auto-links by reference when possible; unresolved rows become tasks.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => runScan(true)} disabled={running}>
              {running ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null} Dry run
            </Button>
            <Button size="sm" onClick={() => runScan(false)} disabled={running}>
              {running ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null} Run scan
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {(["open", "in_progress", "resolved", "wont_fix", "all"] as const).map(s => (
              <Button
                key={s}
                size="sm"
                variant={statusFilter === s ? "default" : "outline"}
                onClick={() => setStatusFilter(s)}
              >
                {s === "all" ? "All" : s.replace("_", " ")}
                {s === "open" && openCount ? ` (${openCount})` : ""}
              </Button>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No tasks for this filter.</p>
          ) : (
            <div className="border rounded-lg divide-y">
              {tasks.map(t => (
                <div key={t.id} className="p-3 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline">{t.source_type}</Badge>
                      <Badge variant={t.priority === "high" ? "destructive" : "secondary"}>{t.priority}</Badge>
                      <Badge variant={t.status === "open" ? "default" : "outline"}>{t.status}</Badge>
                      {t.auto_recover_result && (
                        <Badge variant="outline" className="text-xs">{t.auto_recover_result}</Badge>
                      )}
                    </div>
                    <p className="text-sm font-medium mt-1 truncate">{t.reason}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {t.supplier_hint ?? "—"} · ref {t.reference ?? "—"} · {t.document_date ?? "—"} · {money(t.amount_minor, t.currency)}
                    </p>
                    <p className="text-xs font-mono text-muted-foreground truncate">{t.source_id}</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    {t.status !== "resolved" && (
                      <Button size="sm" variant="outline" onClick={() => updateStatus(t.id, "resolved")}>Resolve</Button>
                    )}
                    {t.status === "open" && (
                      <Button size="sm" variant="ghost" onClick={() => updateStatus(t.id, "wont_fix")}>Won't fix</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {scans.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Recent scans</h4>
              <div className="border rounded-lg divide-y text-xs">
                {scans.map(s => (
                  <div key={s.id} className="p-2 flex justify-between items-center gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={s.status === "success" ? "outline" : s.status === "failed" ? "destructive" : "secondary"}>{s.status}</Badge>
                      <span className="text-muted-foreground">{new Date(s.started_at).toLocaleString()}</span>
                    </div>
                    <span className="text-muted-foreground">
                      {s.candidates_seen} seen · {s.auto_recovered} auto · {s.tasks_created}+ / {s.tasks_updated}~
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};