import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "@/hooks/use-toast";
import { FileSearch, RefreshCw, Sparkles, Landmark, Gauge, Search } from "lucide-react";
import {
  formatMoneyMinor,
  formatDate,
  documentStatus,
  formatConfidence,
  formatScore,
  STATUS_VARIANT,
  displaySupplier,
} from "@/lib/finance/format";

type Doc = {
  id: string;
  title: string;
  supplier_name: string | null;
  document_date: string | null;
  invoice_date: string | null;
  total_minor: number | null;
  amount_minor: number | null;
  currency: string | null;
  validation_state: string | null;
  extraction_confidence: number | null;
  quality_score: number | null;
  bookkeeping_readiness: string | null;
  missing_fields: string[] | null;
  entity_id: string | null;
  vat_number: string | null;
  invoice_number: string | null;
};

const fmtMinor = (m: number | null | undefined, cur = "EUR") =>
  formatMoneyMinor(m, cur, "Total not extracted");

export function ForensicDocumentsPanel({ entityId }: { entityId: string | null }) {
  const [rows, setRows] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [active, setActive] = useState<Doc | null>(null);
  const [drawer, setDrawer] = useState<{ extraction?: any; vat?: any; quality?: any }>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase.from("evidence_documents")
      .select("id,title,supplier_name,document_date,invoice_date,total_minor,amount_minor,currency,validation_state,extraction_confidence,quality_score,bookkeeping_readiness,missing_fields,entity_id,vat_number,invoice_number")
      .order("imported_at", { ascending: false })
      .limit(50);
    if (entityId && entityId !== "all") query = query.eq("entity_id", entityId);
    const { data } = await query;
    setRows((data ?? []) as Doc[]);
    setLoading(false);
  }, [entityId]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) => (r.title ?? "").toLowerCase().includes(t) || (r.supplier_name ?? "").toLowerCase().includes(t));
  }, [rows, q]);

  const openDoc = async (d: Doc) => {
    setActive(d);
    setDrawer({});
    const [ex, vat, qu] = await Promise.all([
      supabase.from("finance_document_extractions").select("*").eq("document_id", d.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("finance_vat_classifications").select("*").eq("document_id", d.id).maybeSingle(),
      supabase.from("finance_invoice_quality").select("*").eq("document_id", d.id).maybeSingle(),
    ]);
    setDrawer({ extraction: ex.data, vat: vat.data, quality: qu.data });
  };

  const invoke = async (fn: string, doc: Doc) => {
    setBusy(`${fn}:${doc.id}`);
    const { data, error } = await supabase.functions.invoke(fn, { body: { document_id: doc.id } });
    setBusy(null);
    if (error) { toast({ title: `${fn} failed`, description: error.message, variant: "destructive" }); return; }
    toast({ title: `${fn} ok`, description: data?.confidence != null ? `confidence ${(data.confidence * 100).toFixed(0)}%` : "done" });
    await load();
    if (active?.id === doc.id) await openDoc(doc);
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2"><FileSearch className="h-4 w-4" /> Forensic Document Understanding</CardTitle>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-3">
            <Search className="h-3 w-3 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title or supplier…" className="h-8" />
          </div>
          {loading ? <div className="text-sm text-muted-foreground">Loading…</div>
          : filtered.length === 0 ? <div className="text-sm text-muted-foreground">No documents indexed yet.</div>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 pr-3">Document</th>
                    <th className="py-1 pr-3">Supplier</th>
                    <th className="py-1 pr-3">Date</th>
                    <th className="py-1 pr-3 text-right">Total</th>
                    <th className="py-1 pr-3 text-right">Quality</th>
                    <th className="py-1 pr-3">State</th>
                    <th className="py-1 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((d) => {
                    const ds = documentStatus(d);
                    return (
                      <tr key={d.id} className="border-t">
                        <td className="py-1 pr-3">
                          <button className="text-left font-medium hover:underline" onClick={() => openDoc(d)}>{d.title}</button>
                          {d.invoice_number && <div className="text-[10px] text-muted-foreground">#{d.invoice_number}</div>}
                        </td>
                        <td className="py-1 pr-3 text-muted-foreground">{displaySupplier({ name: d.supplier_name, invoiceNumber: d.invoice_number, hasEvidence: true })}</td>
                        <td className="py-1 pr-3 text-xs">{formatDate(d.invoice_date ?? d.document_date, "Invoice date missing")}</td>
                        <td className="py-1 pr-3 text-right">{fmtMinor(d.total_minor ?? d.amount_minor, d.currency ?? "EUR")}</td>
                        <td className="py-1 pr-3 text-right">{formatScore(d.quality_score)}</td>
                        <td className="py-1 pr-3">
                          <Badge variant={STATUS_VARIANT[ds.status]}>{ds.status}</Badge>
                          <div className="text-[10px] text-muted-foreground mt-0.5">{ds.hint}</div>
                        </td>
                        <td className="py-1 text-right whitespace-nowrap">
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => invoke("finance-forensic-extract", d)} disabled={busy?.startsWith("finance-forensic-extract")}>
                            <Sparkles className="h-3 w-3 mr-1" />Extract
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => invoke("finance-vat-classify", d)} disabled={busy?.startsWith("finance-vat-classify")}>
                            <Landmark className="h-3 w-3 mr-1" />VAT
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => invoke("finance-invoice-quality", d)} disabled={busy?.startsWith("finance-invoice-quality")}>
                            <Gauge className="h-3 w-3 mr-1" />Score
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!active} onOpenChange={(o) => { if (!o) setActive(null); }}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-base">{active?.title}</SheetTitle>
          </SheetHeader>
          {active && (
            <div className="mt-4 space-y-4 text-sm">
              <section>
                <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">Header</div>
                <div className="grid grid-cols-2 gap-2">
                  <Field k="Supplier" v={displaySupplier({ name: active.supplier_name, invoiceNumber: active.invoice_number, hasEvidence: true })} />
                  <Field k="VAT number" v={active.vat_number ?? "Not on invoice"} />
                  <Field k="Invoice #" v={active.invoice_number ?? "Not extracted"} />
                  <Field k="Invoice date" v={formatDate(active.invoice_date, "Invoice date missing")} />
                  <Field k="Total" v={fmtMinor(active.total_minor ?? active.amount_minor, active.currency ?? "EUR")} />
                  <Field k="Confidence" v={formatConfidence(active.extraction_confidence)} />
                </div>
                {Array.isArray(active.missing_fields) && active.missing_fields.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {active.missing_fields.map((m) => <Badge key={m} variant="destructive" className="text-[10px]">missing: {m}</Badge>)}
                  </div>
                )}
              </section>

              <section>
                <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">VAT classification</div>
                {drawer.vat ? (
                  <div className="rounded-md border p-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{drawer.vat.bucket}</span>
                      <Badge variant="outline">confidence {Math.round((drawer.vat.confidence ?? 0) * 100)}%</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Recoverable {fmtMinor(drawer.vat.recoverable_minor)} · Non-deductible {fmtMinor(drawer.vat.non_deductible_minor)}
                      {drawer.vat.quarter ? ` · ${drawer.vat.fiscal_year} ${drawer.vat.quarter}` : ""}
                    </div>
                    <ReasoningBlock r={drawer.vat.reasoning} />
                  </div>
                ) : <div className="text-xs text-muted-foreground">Not classified yet — click VAT.</div>}
              </section>

              <section>
                <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">Invoice quality</div>
                {drawer.quality ? (
                  <div className="rounded-md border p-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Score {drawer.quality.score}/100</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-xs">
                      {Object.entries(drawer.quality.checks ?? {}).map(([k, v]) => (
                        <div key={k} className={`flex items-center gap-1 ${v ? "text-emerald-600" : "text-red-600"}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${v ? "bg-emerald-500" : "bg-red-500"}`} />{k}
                        </div>
                      ))}
                    </div>
                    {Array.isArray(drawer.quality.recommendations) && drawer.quality.recommendations.length > 0 && (
                      <ul className="text-xs list-disc pl-4 mt-1">
                        {drawer.quality.recommendations.slice(0, 6).map((r: string, i: number) => <li key={i}>{r}</li>)}
                      </ul>
                    )}
                  </div>
                ) : <div className="text-xs text-muted-foreground">Not scored yet — click Score.</div>}
              </section>

              <section>
                <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">Latest extraction</div>
                {drawer.extraction ? (
                  <pre className="rounded-md border bg-muted/40 p-2 text-[11px] overflow-x-auto max-h-60">
{JSON.stringify(drawer.extraction.normalized ?? drawer.extraction.raw_extraction, null, 2)}
                  </pre>
                ) : <div className="text-xs text-muted-foreground">No AI extraction yet — click Extract.</div>}
              </section>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function Field({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div className="rounded border px-2 py-1">
      <div className="text-[10px] uppercase text-muted-foreground">{k}</div>
      <div className="text-xs font-medium">{v ?? "—"}</div>
    </div>
  );
}

function ReasoningBlock({ r }: { r: any }) {
  if (!r || typeof r !== "object") return null;
  const entries = Object.entries(r);
  if (entries.length === 0) return null;
  return (
    <ul className="text-xs text-muted-foreground list-disc pl-4">
      {entries.map(([k, v]) => <li key={k}><span className="font-medium">{k}:</span> {String(v)}</li>)}
    </ul>
  );
}