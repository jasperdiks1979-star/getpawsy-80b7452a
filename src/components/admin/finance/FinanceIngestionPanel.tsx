import { useCallback, useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Upload, FileText, Landmark, RefreshCw, CheckCircle2, XCircle,
  AlertTriangle, Loader2, Inbox, Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";

type Route = "bank" | "invoice";
type Status = "pending" | "uploading" | "success" | "error" | "skipped";

type FileItem = {
  id: string;
  file: File;
  displayName: string;
  route: Route;
  supplierHint: string | null;
  status: Status;
  progress: number;
  result?: any;
  error?: string;
};

type Task = {
  id: string;
  supplier_slug: string;
  period_label: string | null;
  expected_amount_minor: number | null;
  currency: string | null;
  status: string;
  instructions: string | null;
  due_at: string | null;
  created_at: string;
};

type RecentDoc = {
  id: string;
  title: string | null;
  supplier_name: string | null;
  document_type: string | null;
  amount_minor: number | null;
  currency: string | null;
  document_date: string | null;
  created_at: string;
};

const SUPPLIER_HINTS: Array<{ re: RegExp; slug: string }> = [
  { re: /lovable/i, slug: "lovable" },
  { re: /openai|chatgpt/i, slug: "openai" },
  { re: /stripe/i, slug: "stripe" },
  { re: /shopify/i, slug: "shopify" },
  { re: /cj[-_ ]?drop|cjdrop/i, slug: "cj-dropshipping" },
  { re: /apple|amac/i, slug: "apple" },
  { re: /odido|t[-_ ]?mobile/i, slug: "odido" },
  { re: /google/i, slug: "google" },
  { re: /meta|facebook/i, slug: "meta" },
];

function detectRoute(name: string, mime: string): { route: Route; supplierHint: string | null } {
  const n = name.toLowerCase();
  const isBankName = /(ing|revolut)/i.test(n) || /statement|transactions|afschrift/i.test(n);
  const isCsv = /\.(csv|tsv)$/i.test(n) || /csv|excel|spreadsheet/i.test(mime);
  const looksInvoice = /invoice|factuur|receipt|bill/i.test(n);
  const route: Route = (isBankName || (isCsv && !looksInvoice)) ? "bank" : "invoice";
  const hint = SUPPLIER_HINTS.find(h => h.re.test(n))?.slug ?? null;
  return { route, supplierHint: hint };
}

async function fileToBase64(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[]);
  }
  return btoa(bin);
}

const fmtEUR = (m: number | null | undefined, cur: string | null | undefined) => {
  if (m == null) return "—";
  try {
    return new Intl.NumberFormat("nl-NL", { style: "currency", currency: cur || "EUR" }).format(m / 100);
  } catch { return `${(m / 100).toFixed(2)} ${cur ?? ""}`; }
};

const StatusPill = ({ s }: { s: Status }) => {
  const map: Record<Status, { c: string; label: string }> = {
    pending: { c: "bg-slate-400", label: "Queued" },
    uploading: { c: "bg-blue-500", label: "Uploading" },
    success: { c: "bg-emerald-500", label: "Imported" },
    error: { c: "bg-red-500", label: "Failed" },
    skipped: { c: "bg-amber-500", label: "Skipped" },
  };
  const m = map[s];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-white ${m.c}`}>{m.label}</span>;
};

export function FinanceIngestionPanel({ entityId }: { entityId: string | null }) {
  const [items, setItems] = useState<FileItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [recent, setRecent] = useState<RecentDoc[]>([]);
  const [loadingSide, setLoadingSide] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [batchStart, setBatchStart] = useState<number | null>(null);

  const refreshSide = useCallback(async () => {
    setLoadingSide(true);
    const [t, r] = await Promise.all([
      supabase.from("finance_import_tasks")
        .select("id,supplier_slug,period_label,expected_amount_minor,currency,status,instructions,due_at,created_at")
        .eq("status", "open").order("created_at", { ascending: false }).limit(25),
      supabase.from("evidence_documents")
        .select("id,title,supplier_name,document_type,amount_minor,currency,document_date,created_at")
        .order("created_at", { ascending: false }).limit(15),
    ]);
    if (t.data) setTasks(t.data as Task[]);
    if (r.data) setRecent(r.data as RecentDoc[]);
    setLoadingSide(false);
  }, []);

  useEffect(() => { void refreshSide(); }, [refreshSide]);

  const addFiles = useCallback(async (files: File[]) => {
    const expanded: File[] = [];
    for (const f of files) {
      if (/\.zip$/i.test(f.name) || f.type === "application/zip") {
        try {
          const zip = await JSZip.loadAsync(f);
          const entries = Object.values(zip.files).filter((e: any) => !e.dir);
          for (const e of entries) {
            const blob = await (e as any).async("blob");
            const name = (e as any).name.split("/").pop() || (e as any).name;
            if (/\.(pdf|csv|tsv|png|jpe?g|webp|txt)$/i.test(name)) {
              expanded.push(new File([blob], name, { type: blob.type || "application/octet-stream" }));
            }
          }
        } catch (err) {
          toast.error(`Failed to open ZIP ${f.name}`);
        }
      } else {
        expanded.push(f);
      }
    }
    const next: FileItem[] = expanded.map(f => {
      const { route, supplierHint } = detectRoute(f.name, f.type);
      return {
        id: `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 8)}`,
        file: f, displayName: f.name, route, supplierHint,
        status: "pending", progress: 0,
      };
    });
    setItems(prev => [...next, ...prev]);
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const list = Array.from(e.dataTransfer.files || []);
    if (list.length) void addFiles(list);
  };

  const uploadOne = useCallback(async (item: FileItem) => {
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: "uploading", progress: 15, error: undefined } : i));
    try {
      const base64 = await fileToBase64(item.file);
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, progress: 45 } : i));
      const fn = item.route === "bank" ? "finance-bank-parse" : "finance-manual-import";
      const payload: Record<string, unknown> = {
        filename: item.file.name,
        mime_type: item.file.type || (item.file.name.endsWith(".pdf") ? "application/pdf" : "application/octet-stream"),
        base64,
        entity_id: entityId && entityId !== "all" ? entityId : null,
      };
      if (item.route === "invoice" && item.supplierHint) payload.hint_supplier = item.supplierHint;
      const { data, error } = await supabase.functions.invoke(fn, { body: payload });
      if (error) throw new Error(error.message || "invoke_failed");
      const anyData = data as any;
      if (anyData?.error) throw new Error(anyData.error);
      const isSkipped = anyData?.deduped === true;
      setItems(prev => prev.map(i => i.id === item.id ? {
        ...i, status: isSkipped ? "skipped" : "success", progress: 100, result: anyData,
      } : i));
    } catch (e: any) {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: "error", progress: 100, error: e?.message ?? String(e) } : i));
    }
  }, [entityId]);

  const runAll = async () => {
    const queue = items.filter(i => i.status === "pending" || i.status === "error");
    setBatchStart(Date.now());
    for (const it of queue) {
      await uploadOne(it);
    }
    await refreshSide();
    setBatchStart(null);
    toast.success(`Processed ${queue.length} file${queue.length === 1 ? "" : "s"}`);
  };

  const clearDone = () => setItems(prev => prev.filter(i => i.status !== "success" && i.status !== "skipped"));

  const completedCount = items.filter(i => ["success", "skipped", "error"].includes(i.status)).length;
  const totalToProcess = items.length;
  const batchPct = totalToProcess ? Math.round((completedCount / totalToProcess) * 100) : 0;
  const etaSec = (() => {
    if (!batchStart || completedCount === 0 || completedCount >= totalToProcess) return null;
    const elapsed = (Date.now() - batchStart) / 1000;
    const perFile = elapsed / completedCount;
    return Math.round(perFile * (totalToProcess - completedCount));
  })();

  const q = query.trim().toLowerCase();
  const filteredRecent = q
    ? recent.filter(d =>
        (d.supplier_name || "").toLowerCase().includes(q) ||
        (d.title || "").toLowerCase().includes(q) ||
        (d.document_type || "").toLowerCase().includes(q))
    : recent;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="h-4 w-4" /> Ingest bank statements & supplier invoices
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
              dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:bg-accent/40"
            }`}
          >
            <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">Drag & drop PDFs, CSVs or ZIPs here</p>
            <p className="text-xs text-muted-foreground">
              ING & Revolut statements · Odido, Apple, Lovable, OpenAI, Stripe, Shopify, CJ invoices · batches & ZIPs supported
            </p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.csv,.tsv,.txt,.zip,.png,.jpg,.jpeg,.webp,application/pdf,application/zip,text/csv"
              className="hidden"
              onChange={(e) => {
                const list = Array.from(e.target.files || []);
                if (list.length) void addFiles(list);
                if (inputRef.current) inputRef.current.value = "";
              }}
            />
          </div>

          {items.length > 0 && (
            <>
              {items.length > 1 && (
                <div className="rounded-md border bg-muted/30 p-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span>Batch progress {completedCount}/{totalToProcess}</span>
                    <span>{etaSec != null ? `ETA ~${etaSec}s` : batchStart ? "estimating…" : ""}</span>
                  </div>
                  <Progress value={batchPct} className="h-1.5" />
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={runAll} disabled={items.every(i => i.status === "uploading")}>
                  Process {items.filter(i => i.status === "pending" || i.status === "error").length} file(s)
                </Button>
                <Button size="sm" variant="outline" onClick={clearDone}>Clear completed</Button>
                <Button size="sm" variant="ghost" onClick={() => setItems([])}>Reset</Button>
              </div>

              <div className="space-y-2">
                {items.map(item => (
                  <div key={item.id} className="rounded-md border p-3 text-sm">
                    <div className="flex items-start gap-2">
                      {item.route === "bank"
                        ? <Landmark className="h-4 w-4 mt-0.5 text-blue-500" />
                        : <FileText className="h-4 w-4 mt-0.5 text-emerald-600" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">{item.displayName}</span>
                          <Badge variant="outline" className="text-[10px]">{item.route === "bank" ? "Bank" : "Invoice"}</Badge>
                          {item.supplierHint && <Badge variant="secondary" className="text-[10px]">{item.supplierHint}</Badge>}
                          <StatusPill s={item.status} />
                        </div>
                        {(item.status === "uploading") && <Progress value={item.progress} className="mt-2 h-1.5" />}
                        {item.error && (
                          <div className="mt-1 text-xs text-red-600 flex items-center gap-1">
                            <XCircle className="h-3 w-3" /> {item.error}
                          </div>
                        )}
                        {item.result && item.status === "success" && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {item.route === "bank" ? (
                              <>
                                Parsed <b>{item.result.parsed ?? 0}</b> · Imported <b>{item.result.imported ?? 0}</b> ·
                                Deduped <b>{item.result.deduped ?? 0}</b> · Matched <b>{item.result.matched ?? 0}</b> ·
                                Unmatched <b>{item.result.unmatched ?? 0}</b> · Tasks created <b>{item.result.tasks_created ?? 0}</b>
                                {item.result.unmatched > 0 && (
                                  <div className="mt-1 flex items-center gap-1 text-amber-600">
                                    <AlertTriangle className="h-3 w-3" /> {item.result.unmatched} transaction(s) with no matching invoice — see Missing evidence.
                                  </div>
                                )}
                              </>
                            ) : (
                              <>
                                Supplier <b>{item.result.document?.supplier_name ?? "—"}</b> ·
                                Amount <b>{fmtEUR(item.result.document?.amount_minor, item.result.document?.currency)}</b> ·
                                Type <b>{item.result.document?.document_type ?? "—"}</b>
                                {item.result.closed_task_id && <> · <span className="text-emerald-600">Task closed</span></>}
                              </>
                            )}
                          </div>
                        )}
                        {item.status === "skipped" && (
                          <div className="mt-1 text-xs text-amber-600 flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Already imported (deduped by SHA-256)
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {item.status === "error" && (
                          <Button size="sm" variant="outline" onClick={() => uploadOne(item)}>
                            <RefreshCw className="h-3 w-3 mr-1" /> Retry
                          </Button>
                        )}
                        {item.status === "pending" && (
                          <Button size="sm" variant="ghost" onClick={() => uploadOne(item)}>
                            {item.route === "bank" ? "Parse" : "Import"}
                          </Button>
                        )}
                        {item.status === "uploading" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Missing evidence
            </CardTitle>
            <Button size="sm" variant="ghost" onClick={refreshSide} disabled={loadingSide}>
              <RefreshCw className={`h-3 w-3 ${loadingSide ? "animate-spin" : ""}`} />
            </Button>
          </CardHeader>
          <CardContent>
            {tasks.length === 0 ? (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Inbox className="h-4 w-4" /> No open import tasks.
              </div>
            ) : (
              <ul className="space-y-2 max-h-80 overflow-auto pr-1">
                {tasks.map(t => (
                  <li key={t.id} className="rounded border p-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="text-sm font-medium">
                        {t.supplier_slug} <span className="text-muted-foreground font-normal">· {t.period_label ?? "—"}</span>
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        {fmtEUR(t.expected_amount_minor, t.currency)}
                      </Badge>
                    </div>
                    {t.instructions && (
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{t.instructions}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" /> Import history
            </CardTitle>
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search supplier or type"
                className="pl-7 h-8 text-xs"
              />
            </div>
          </CardHeader>
          <CardContent>
            {filteredRecent.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                {query ? "No matches." : "No documents yet."}
              </div>
            ) : (
              <div className="max-h-80 overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground text-xs">
                      <th className="py-1 pr-2">Date</th>
                      <th className="py-1 pr-2">Supplier</th>
                      <th className="py-1 pr-2">Type</th>
                      <th className="py-1 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecent.map(d => (
                      <tr key={d.id} className="border-t">
                        <td className="py-1 pr-2 whitespace-nowrap">{d.document_date ?? d.created_at.slice(0, 10)}</td>
                        <td className="py-1 pr-2 truncate max-w-[140px]">{d.supplier_name ?? d.title ?? "—"}</td>
                        <td className="py-1 pr-2"><Badge variant="outline" className="text-[10px]">{d.document_type ?? "—"}</Badge></td>
                        <td className="py-1 text-right">{fmtEUR(d.amount_minor, d.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default FinanceIngestionPanel;