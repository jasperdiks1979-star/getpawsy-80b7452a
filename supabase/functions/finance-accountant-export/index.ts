// GENESIS V12.4 — Accountant Mode Export
// Admin/accountant only. Bundles the full bookkeeping picture into a single
// downloadable ZIP:
//   /invoices/<supplier>/*   — original PDFs/images
//   /receipts/<supplier>/*   — receipts
//   /other/*                 — statements, credit notes
//   /assets/*.csv            — business asset register
//   /registers/*.csv         — expenses, suppliers, subscriptions, ad-spend
//   /vat/*.csv + .json       — VAT summaries + reconciliation history
//   manifest.json            — SHA-256 fingerprint of every file
//   README.md                — accountant-facing explanation (EN + NL)
// Uploads to `genesis-vault`, logs a `finance_reports` row and returns a
// 30-day signed URL.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import JSZip from "npm:jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "genesis-vault";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const head = columns.join(",");
  const body = rows.map((r) => columns.map((c) => csvEscape(r[c])).join(",")).join("\n");
  return head + "\n" + body + (body ? "\n" : "");
}

function slug(s: string): string {
  return (s || "unknown").toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 50) || "unknown";
}

function resolveRange(body: { scope?: string; year?: number; quarter?: number | null; start?: string; end?: string }): { start: string; end: string; label: string } {
  const now = new Date();
  const year = Number(body.year) || now.getUTCFullYear();
  if (body.scope === "custom" && body.start && body.end) {
    return { start: body.start, end: body.end, label: `custom_${body.start}_to_${body.end}` };
  }
  if (body.scope === "quarter" && body.quarter && body.quarter >= 1 && body.quarter <= 4) {
    const q = body.quarter;
    const sm = (q - 1) * 3;
    const s = new Date(Date.UTC(year, sm, 1));
    const e = new Date(Date.UTC(year, sm + 3, 0));
    return { start: s.toISOString().slice(0, 10), end: e.toISOString().slice(0, 10), label: `${year}-Q${q}` };
  }
  if (body.scope === "all") {
    return { start: "1970-01-01", end: now.toISOString().slice(0, 10), label: "all-time" };
  }
  return { start: `${year}-01-01`, end: `${year}-12-31`, label: `${year}-annual` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) return json(401, { error: "unauthorized" });
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: userData } = await admin.auth.getUser(token);
    const uid = userData?.user?.id;
    if (!uid) return json(401, { error: "unauthorized" });

    const [{ data: isAdmin }, { data: rolesRows }] = await Promise.all([
      admin.rpc("has_role", { _user_id: uid, _role: "admin" }),
      admin.from("user_roles").select("role").eq("user_id", uid),
    ]);
    const roles = (rolesRows ?? []).map((r: { role: string }) => r.role);
    if (!isAdmin && !roles.includes("accountant") && !roles.includes("auditor")) {
      return json(403, { error: "forbidden" });
    }

    const body = (await req.json().catch(() => ({}))) as {
      scope?: "year" | "quarter" | "custom" | "all";
      year?: number;
      quarter?: number | null;
      start?: string;
      end?: string;
    };
    const { start, end, label } = resolveRange(body);

    // -- Load registers in parallel --
    const [
      { data: docs, error: docsErr },
      { data: suppliers },
      { data: assets },
      { data: subs },
      { data: cats },
      { data: ads },
      { data: vats },
      { data: recons },
      { data: payments },
    ] = await Promise.all([
      admin.from("evidence_documents")
        .select("id,title,document_type,category,supplier_id,supplier_name,invoice_number,document_date,amount_minor,currency,vat_minor,tax_country,original_filename,mime_type,file_size,sha256,storage_bucket,storage_path,source,created_at")
        .or(`and(document_date.gte.${start},document_date.lte.${end}),and(document_date.is.null,created_at.gte.${start}T00:00:00Z,created_at.lte.${end}T23:59:59Z)`)
        .order("document_date", { ascending: true, nullsFirst: false })
        .limit(10000),
      admin.from("evidence_suppliers").select("id,name,slug,website,vat_number,country,currency,category,invoice_count,total_paid_minor,health_score,risk_score,spend_ytd_cents").limit(2000),
      admin.from("finance_assets").select("id,category,name,serial,supplier_id,purchase_date,purchase_amount_cents,vat_amount_cents,currency,business_usage_pct,depreciation_method,depreciation_years,asset_status,current_book_value_cents,warranty_until").limit(2000),
      admin.from("finance_subscriptions").select("id,supplier_slug,product_name,cadence,amount_minor,currency,vat_pct,started_at,renews_at,cancelled_at,is_active,notes").limit(2000),
      admin.from("finance_expense_categories").select("slug,name,description,vat_default_pct,is_recoverable"),
      admin.from("ad_spend_entries").select("entry_date,platform,campaign,impressions,clicks,spend,purchases,revenue")
        .gte("entry_date", start).lte("entry_date", end).limit(10000),
      admin.from("finance_vat_summaries").select("period_type,period_year,period_number,recoverable_minor,vat_total_minor,currency,invoice_count").order("period_year", { ascending: false }).limit(200),
      admin.from("finance_vat_reconciliations").select("period_type,period_year,period_number,status,currency,imported_vat_minor,calculated_vat_minor,delta_minor,delta_pct,invoice_count,missing_docs,evidence_sha256,created_at").order("created_at", { ascending: false }).limit(200),
      admin.from("evidence_payments").select("id,supplier_id,invoice_document_id,receipt_document_id,bank_txn_reference,provider,amount_minor,currency,vat_minor,status,paid_at,sha256")
        .gte("paid_at", `${start}T00:00:00Z`).lte("paid_at", `${end}T23:59:59Z`).limit(10000),
    ]);
    if (docsErr) return json(500, { error: "docs_query_failed", detail: docsErr.message });

    const suppliersMap = new Map<string, { id: string; name: string; slug: string }>(
      (suppliers ?? []).map((s: { id: string; name: string; slug: string }) => [s.id, s]),
    );

    const zip = new JSZip();
    const manifest: { file: string; sha256: string; bytes: number; source_document_id?: string }[] = [];
    const addFile = async (path: string, data: Uint8Array, sourceDocId?: string) => {
      zip.file(path, data);
      manifest.push({ file: path, sha256: await sha256Hex(data), bytes: data.byteLength, source_document_id: sourceDocId });
    };

    let totalGross = 0;
    let totalVat = 0;
    let invoiceCount = 0;
    let receiptCount = 0;
    let skipped = 0;

    // Download originals
    for (const d of docs ?? []) {
      if (typeof d.amount_minor === "number") totalGross += d.amount_minor;
      if (typeof d.vat_minor === "number") totalVat += d.vat_minor;
      if (d.document_type === "invoice") invoiceCount++;
      else if (d.document_type === "receipt") receiptCount++;
      if (!d.storage_path) { skipped++; continue; }
      const bucket = d.storage_bucket || BUCKET;
      const dl = await admin.storage.from(bucket).download(d.storage_path);
      if (dl.error || !dl.data) { skipped++; continue; }
      const bytes = new Uint8Array(await dl.data.arrayBuffer());
      const folder = d.document_type === "invoice" ? "invoices" : d.document_type === "receipt" ? "receipts" : "other";
      const supFolder = slug(d.supplier_name || "unknown-supplier");
      const ext = d.original_filename?.match(/\.[a-z0-9]+$/i)?.[0]
        || (d.mime_type === "application/pdf" ? ".pdf" : d.mime_type?.startsWith("image/") ? "." + d.mime_type.split("/")[1] : ".bin");
      const baseName = slug([d.document_date ?? "", d.invoice_number ?? d.title ?? d.id.slice(0, 8)].filter(Boolean).join("_"));
      await addFile(`${folder}/${supFolder}/${baseName}${ext}`, bytes, d.id);
    }

    // Expense register (from evidence docs)
    const expenseRows = (docs ?? []).map((d) => ({
      date: d.document_date ?? "",
      supplier: d.supplier_name ?? "",
      category: d.category ?? "",
      document_type: d.document_type,
      invoice_number: d.invoice_number ?? "",
      currency: d.currency ?? "",
      amount_gross: d.amount_minor != null ? (d.amount_minor / 100).toFixed(2) : "",
      amount_vat: d.vat_minor != null ? (d.vat_minor / 100).toFixed(2) : "",
      tax_country: d.tax_country ?? "",
      sha256: d.sha256,
    }));
    await addFile("registers/expenses.csv", new TextEncoder().encode(toCsv(expenseRows, ["date","supplier","category","document_type","invoice_number","currency","amount_gross","amount_vat","tax_country","sha256"])));

    await addFile("registers/suppliers.csv", new TextEncoder().encode(toCsv(
      (suppliers ?? []).map((s: Record<string, unknown>) => ({
        name: s.name, slug: s.slug, website: s.website ?? "", vat_number: s.vat_number ?? "",
        country: s.country ?? "", currency: s.currency ?? "", category: s.category ?? "",
        invoice_count: s.invoice_count ?? 0,
        total_paid: s.total_paid_minor != null ? ((s.total_paid_minor as number) / 100).toFixed(2) : "",
        health_score: s.health_score ?? "", risk_score: s.risk_score ?? "",
      })),
      ["name","slug","website","vat_number","country","currency","category","invoice_count","total_paid","health_score","risk_score"],
    )));

    await addFile("registers/subscriptions.csv", new TextEncoder().encode(toCsv(
      (subs ?? []).map((s: Record<string, unknown>) => ({
        supplier: s.supplier_slug, product: s.product_name, cadence: s.cadence,
        amount: s.amount_minor != null ? ((s.amount_minor as number) / 100).toFixed(2) : "",
        currency: s.currency, vat_pct: s.vat_pct ?? "",
        started_at: s.started_at ?? "", renews_at: s.renews_at ?? "",
        cancelled_at: s.cancelled_at ?? "", is_active: s.is_active,
      })),
      ["supplier","product","cadence","amount","currency","vat_pct","started_at","renews_at","cancelled_at","is_active"],
    )));

    await addFile("registers/expense-categories.csv", new TextEncoder().encode(toCsv(
      (cats ?? []) as Record<string, unknown>[],
      ["slug","name","description","vat_default_pct","is_recoverable"],
    )));

    await addFile("registers/ad-spend.csv", new TextEncoder().encode(toCsv(
      (ads ?? []) as Record<string, unknown>[],
      ["entry_date","platform","campaign","impressions","clicks","spend","purchases","revenue"],
    )));

    await addFile("registers/payments.csv", new TextEncoder().encode(toCsv(
      (payments ?? []).map((p: Record<string, unknown>) => ({
        paid_at: p.paid_at ?? "", provider: p.provider ?? "",
        supplier: suppliersMap.get(p.supplier_id as string)?.name ?? "",
        amount: p.amount_minor != null ? ((p.amount_minor as number) / 100).toFixed(2) : "",
        currency: p.currency, vat: p.vat_minor != null ? ((p.vat_minor as number) / 100).toFixed(2) : "",
        status: p.status, bank_txn_reference: p.bank_txn_reference ?? "",
        invoice_document_id: p.invoice_document_id ?? "", receipt_document_id: p.receipt_document_id ?? "",
        sha256: p.sha256 ?? "",
      })),
      ["paid_at","provider","supplier","amount","currency","vat","status","bank_txn_reference","invoice_document_id","receipt_document_id","sha256"],
    )));

    // Assets register
    await addFile("assets/assets.csv", new TextEncoder().encode(toCsv(
      (assets ?? []).map((a: Record<string, unknown>) => ({
        name: a.name, category: a.category, serial: a.serial ?? "",
        supplier: suppliersMap.get(a.supplier_id as string)?.name ?? "",
        purchase_date: a.purchase_date ?? "",
        purchase_amount: a.purchase_amount_cents != null ? ((a.purchase_amount_cents as number) / 100).toFixed(2) : "",
        vat_amount: a.vat_amount_cents != null ? ((a.vat_amount_cents as number) / 100).toFixed(2) : "",
        currency: a.currency,
        business_usage_pct: a.business_usage_pct ?? "",
        depreciation_method: a.depreciation_method ?? "",
        depreciation_years: a.depreciation_years ?? "",
        book_value: a.current_book_value_cents != null ? ((a.current_book_value_cents as number) / 100).toFixed(2) : "",
        asset_status: a.asset_status ?? "", warranty_until: a.warranty_until ?? "",
      })),
      ["name","category","serial","supplier","purchase_date","purchase_amount","vat_amount","currency","business_usage_pct","depreciation_method","depreciation_years","book_value","asset_status","warranty_until"],
    )));

    // VAT reports
    await addFile("vat/vat-summaries.csv", new TextEncoder().encode(toCsv(
      (vats ?? []).map((v: Record<string, unknown>) => ({
        period: v.period_type === "quarter" ? `${v.period_year}-Q${v.period_number}` : `${v.period_year}`,
        invoice_count: v.invoice_count,
        recoverable: v.recoverable_minor != null ? ((v.recoverable_minor as number) / 100).toFixed(2) : "",
        vat_total: v.vat_total_minor != null ? ((v.vat_total_minor as number) / 100).toFixed(2) : "",
        currency: v.currency,
      })),
      ["period","invoice_count","recoverable","vat_total","currency"],
    )));
    await addFile("vat/vat-reconciliations.csv", new TextEncoder().encode(toCsv(
      (recons ?? []).map((r: Record<string, unknown>) => ({
        period: r.period_type === "quarter" ? `${r.period_year}-Q${r.period_number}` : `${r.period_year}`,
        status: r.status,
        imported_vat: r.imported_vat_minor != null ? ((r.imported_vat_minor as number) / 100).toFixed(2) : "",
        calculated_vat: r.calculated_vat_minor != null ? ((r.calculated_vat_minor as number) / 100).toFixed(2) : "",
        delta: r.delta_minor != null ? ((r.delta_minor as number) / 100).toFixed(2) : "",
        delta_pct: r.delta_pct ?? "",
        currency: r.currency,
        missing_docs: r.missing_docs ?? 0,
        evidence_sha256: r.evidence_sha256 ?? "",
        created_at: r.created_at,
      })),
      ["period","status","imported_vat","calculated_vat","delta","delta_pct","currency","missing_docs","evidence_sha256","created_at"],
    )));

    const generatedAt = new Date().toISOString();
    const summary = {
      generator: "GetPawsy Genesis V12.4 — Accountant Mode Export",
      generated_at: generatedAt,
      period: { start, end, label },
      totals: {
        documents: (docs ?? []).length,
        invoices: invoiceCount,
        receipts: receiptCount,
        skipped_downloads: skipped,
        suppliers: (suppliers ?? []).length,
        assets: (assets ?? []).length,
        subscriptions: (subs ?? []).length,
        ad_spend_entries: (ads ?? []).length,
        vat_summaries: (vats ?? []).length,
        vat_reconciliations: (recons ?? []).length,
        payments: (payments ?? []).length,
        gross_minor: totalGross,
        vat_minor: totalVat,
      },
    };

    const manifestBytes = new TextEncoder().encode(JSON.stringify({ ...summary, files: manifest }, null, 2));
    const manifestSha = await sha256Hex(manifestBytes);
    zip.file("manifest.json", manifestBytes);

    const readme = `# Accountant Dossier — ${label}

Period: **${start} → ${end}**
Generated: **${generatedAt}**
Company: **GetPawsy**

## Contents

- \`invoices/\`, \`receipts/\`, \`other/\` — original documents grouped per supplier (immutable, SHA-256 verified).
- \`registers/expenses.csv\` — chronological expense register (from evidence documents).
- \`registers/suppliers.csv\` — supplier master data.
- \`registers/subscriptions.csv\` — active + historic recurring costs.
- \`registers/expense-categories.csv\` — categorisation & VAT recoverability.
- \`registers/ad-spend.csv\` — marketing spend per platform/campaign.
- \`registers/payments.csv\` — bank/provider payment register with references to invoices.
- \`assets/assets.csv\` — business asset register with depreciation state & book value.
- \`vat/vat-summaries.csv\` — VAT totals per quarter/year.
- \`vat/vat-reconciliations.csv\` — automated VAT reconciliation history (imported vs calculated).
- \`manifest.json\` — SHA-256 fingerprint of every file, plus generator metadata.
- \`README.md\` — this file.

## Totals

| Metric | Value |
|---|---|
| Documents | ${(docs ?? []).length} |
| Invoices | ${invoiceCount} |
| Receipts | ${receiptCount} |
| Suppliers | ${(suppliers ?? []).length} |
| Assets | ${(assets ?? []).length} |
| Subscriptions | ${(subs ?? []).length} |
| Ad-spend entries | ${(ads ?? []).length} |
| Payments | ${(payments ?? []).length} |
| Gross | ${(totalGross / 100).toFixed(2)} (mixed currencies) |
| VAT | ${(totalVat / 100).toFixed(2)} (mixed currencies) |
| Manifest SHA-256 | \`${manifestSha}\` |

_Bewaarplicht: 7 jaar (art. 52 AWR). Every file is an immutable copy; alterations are detected via SHA-256._
`;
    zip.file("README.md", readme);

    const zipBuf = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
    const zipSha = await sha256Hex(zipBuf);
    const storagePath = `accountant/${label}/${generatedAt.slice(0, 10)}_${zipSha.slice(0, 10)}.zip`;

    const up = await admin.storage.from(BUCKET).upload(storagePath, zipBuf, {
      contentType: "application/zip", upsert: true,
    });
    if (up.error) return json(500, { error: "upload_failed", detail: up.error.message });

    const { data: report } = await admin.from("finance_reports").insert({
      report_type: "accountant",
      period_year: Number(body.year) || new Date().getUTCFullYear(),
      period_number: body.scope === "quarter" ? (body.quarter ?? null) : null,
      title: `Accountant dossier — ${label}`,
      storage_path: storagePath,
      sha256: zipSha,
      file_size: zipBuf.byteLength,
      summary: { ...summary, manifest_sha256: manifestSha },
    }).select("id").maybeSingle();

    const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 60 * 24 * 30);

    return json(200, {
      ok: true,
      report_id: report?.id ?? null,
      period: { start, end, label },
      totals: summary.totals,
      zip: {
        storage_path: storagePath,
        sha256: zipSha,
        bytes: zipBuf.byteLength,
        manifest_sha256: manifestSha,
        signed_url: signed?.signedUrl ?? null,
        expires_in_days: 30,
      },
    });
  } catch (e) {
    console.error("accountant export failed", e);
    return json(500, { error: "internal_error", detail: e instanceof Error ? e.message : String(e) });
  }
});