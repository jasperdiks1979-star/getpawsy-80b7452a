// GENESIS V12.3 — Belastingdienst Export Generator
// Admin-only. Builds a quarterly or annual ZIP dossier for the Dutch tax
// authority (Belastingdienst) from the Evidence Vault:
//   /invoices/*          — original PDFs/images (grouped by supplier/period)
//   /receipts/*          — receipt-type documents
//   /other/*             — statements, credit notes, etc.
//   /reports/vat-summary.csv + .json
//   /reports/suppliers.csv
//   /reports/payments.csv
//   /reports/evidence-index.csv
//   manifest.json        — SHA-256 of every file, generator metadata
//   README.md            — Dutch-language explanation for the accountant
// Uploads the ZIP to the private `genesis-vault` bucket, registers a
// `finance_reports` row (report_type='tax'), and returns a 30-day signed URL.

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

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf);
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

function moneyEur(minor: number | null | undefined, ccy: string | null | undefined): string {
  if (minor == null) return "";
  return (minor / 100).toFixed(2) + " " + (ccy || "EUR");
}

function slug(s: string): string {
  return (s || "unknown").toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 50) || "unknown";
}

function periodBounds(year: number, quarter?: number | null): { start: string; end: string; label: string } {
  if (quarter && quarter >= 1 && quarter <= 4) {
    const startMonth = (quarter - 1) * 3;
    const start = new Date(Date.UTC(year, startMonth, 1));
    const end = new Date(Date.UTC(year, startMonth + 3, 0));
    return {
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      label: `${year}-Q${quarter}`,
    };
  }
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
    label: `${year}-annual`,
  };
}

function buildReadmeNL(params: {
  label: string;
  start: string;
  end: string;
  totals: { docs: number; invoices: number; receipts: number; suppliers: number; vatMinor: number; grossMinor: number };
  manifestSha: string;
  generatedAt: string;
}): string {
  const { label, start, end, totals, manifestSha, generatedAt } = params;
  return `# Belastingdienst Dossier — ${label}

Periode: **${start} t/m ${end}**
Gegenereerd: **${generatedAt}**
Onderneming: **GetPawsy**

## Inhoud van deze ZIP

- \`invoices/\` — alle originele facturen (PDF/afbeelding), gegroepeerd per leverancier.
- \`receipts/\` — betalingsbewijzen en kassabonnen.
- \`other/\` — creditnota's, rekeningafschriften en overige bewijsstukken.
- \`reports/vat-summary.csv\` + \`vat-summary.json\` — BTW-overzicht (verschuldigd/voorbelasting).
- \`reports/suppliers.csv\` — leveranciersregister.
- \`reports/payments.csv\` — betalingsregister met bank-/provider-referenties.
- \`reports/evidence-index.csv\` — volledige documentindex met SHA-256 fingerprints.
- \`manifest.json\` — cryptografische inventaris (SHA-256 per bestand).
- \`README.md\` — dit bestand.

## Samenvatting

| Metric | Waarde |
|---|---|
| Documenten in dossier | ${totals.docs} |
| Facturen | ${totals.invoices} |
| Betalingsbewijzen | ${totals.receipts} |
| Unieke leveranciers | ${totals.suppliers} |
| Bruto zakelijke uitgaven | ${(totals.grossMinor / 100).toFixed(2)} EUR (equivalent) |
| BTW / voorbelasting | ${(totals.vatMinor / 100).toFixed(2)} EUR (equivalent) |
| Manifest SHA-256 | \`${manifestSha}\` |

## Wettelijk kader

Deze export is opgesteld conform de **bewaarplicht van 7 jaar** (art. 52 AWR) en de
aftrekbaarheid van zakelijke kosten volgens **Wet IB 2001 §3.8**. Alle documenten
in dit dossier zijn onveranderlijke ("immutable") kopieën uit de Genesis Evidence
Vault; iedere wijziging aan een origineel bestand wordt gedetecteerd via de
SHA-256 fingerprint in \`manifest.json\`.

## Voor de accountant

1. Controleer \`manifest.json\` — hash elk bestand en vergelijk met de opgegeven
   SHA-256 om integriteit te bevestigen.
2. \`reports/vat-summary.csv\` bevat het BTW-overzicht per document en het totaal
   voor deze periode. Bedragen zijn in de originele documentvaluta; conversie
   naar EUR (indien nodig) is de verantwoordelijkheid van de aangifte.
3. \`reports/evidence-index.csv\` is de master-index. Elk bestand in
   \`invoices/\`, \`receipts/\` en \`other/\` correspondeert 1-op-1 met een rij.
4. Bij vragen over provenance: elk document verwijst naar een supplier + upload
   timestamp in de Genesis Evidence Vault (interne audit trail).

_Generated by GetPawsy Genesis V12.3 — Finance Intelligence Platform._
`;
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
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: uid, _role: "admin" });
    if (!isAdmin) return json(403, { error: "forbidden" });

    const body = (await req.json().catch(() => ({}))) as {
      period_type?: "quarter" | "year";
      year?: number;
      quarter?: number | null;
    };
    const now = new Date();
    const year = Number(body.year) || now.getUTCFullYear();
    const isQuarter = body.period_type === "quarter";
    const quarter = isQuarter ? Number(body.quarter) : null;
    if (isQuarter && !(quarter && quarter >= 1 && quarter <= 4)) {
      return json(400, { error: "invalid_quarter" });
    }
    const { start, end, label } = periodBounds(year, quarter);

    // 1) Load documents in period
    const { data: docs, error: docsErr } = await admin
      .from("evidence_documents")
      .select("id,title,document_type,category,supplier_id,supplier_name,invoice_number,document_date,period_start,period_end,amount_minor,currency,vat_minor,tax_country,original_filename,mime_type,file_size,sha256,storage_bucket,storage_path,source,created_at")
      .or(`and(document_date.gte.${start},document_date.lte.${end}),and(document_date.is.null,created_at.gte.${start}T00:00:00Z,created_at.lte.${end}T23:59:59Z)`)
      .order("document_date", { ascending: true, nullsFirst: false })
      .limit(5000);
    if (docsErr) return json(500, { error: "docs_query_failed", detail: docsErr.message });

    // 2) Load suppliers referenced
    const supplierIds = Array.from(new Set((docs ?? []).map((d) => d.supplier_id).filter(Boolean))) as string[];
    const suppliersMap = new Map<string, any>();
    if (supplierIds.length) {
      const { data: sups } = await admin.from("evidence_suppliers")
        .select("id,name,slug,website,vat_number,country,currency,category,invoice_count,total_paid_minor")
        .in("id", supplierIds);
      (sups ?? []).forEach((s: any) => suppliersMap.set(s.id, s));
    }

    // 3) Load payments in period
    const { data: payments } = await admin
      .from("evidence_payments")
      .select("id,supplier_id,invoice_document_id,receipt_document_id,bank_txn_reference,provider,amount_minor,currency,vat_minor,status,paid_at,sha256")
      .gte("paid_at", `${start}T00:00:00Z`)
      .lte("paid_at", `${end}T23:59:59Z`)
      .limit(5000);

    // 4) Build ZIP
    const zip = new JSZip();
    const manifest: { file: string; sha256: string; bytes: number; source_document_id?: string }[] = [];

    let totalGross = 0;
    let totalVat = 0;
    let invoiceCount = 0;
    let receiptCount = 0;

    const addToManifest = async (path: string, data: Uint8Array, sourceDocId?: string) => {
      zip.file(path, data);
      const sha = await sha256Hex(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
      manifest.push({ file: path, sha256: sha, bytes: data.byteLength, source_document_id: sourceDocId });
    };

    // Download & bundle originals
    for (const d of docs ?? []) {
      if (!d.storage_path) continue;
      const bucket = d.storage_bucket || BUCKET;
      const dl = await admin.storage.from(bucket).download(d.storage_path);
      if (dl.error || !dl.data) {
        console.warn("skip download", d.id, dl.error?.message);
        continue;
      }
      const bytes = new Uint8Array(await dl.data.arrayBuffer());

      const bucketFolder =
        d.document_type === "invoice" ? "invoices" :
        d.document_type === "receipt" ? "receipts" : "other";
      if (d.document_type === "invoice") invoiceCount++;
      else if (d.document_type === "receipt") receiptCount++;

      const supFolder = slug(d.supplier_name || "unknown-supplier");
      const ext = (d.original_filename?.match(/\.[a-z0-9]+$/i)?.[0]) ||
        (d.mime_type === "application/pdf" ? ".pdf" :
         d.mime_type?.startsWith("image/") ? "." + d.mime_type.split("/")[1] : ".bin");
      const baseName = slug(
        [d.document_date ?? "", d.invoice_number ?? d.title ?? d.id.slice(0, 8)]
          .filter(Boolean).join("_")
      );
      const path = `${bucketFolder}/${supFolder}/${baseName}${ext}`;
      await addToManifest(path, bytes, d.id);

      if (typeof d.amount_minor === "number") totalGross += d.amount_minor;
      if (typeof d.vat_minor === "number") totalVat += d.vat_minor;
    }

    // Reports
    const vatRows = (docs ?? []).map((d) => ({
      document_date: d.document_date ?? "",
      supplier: d.supplier_name ?? "",
      invoice_number: d.invoice_number ?? "",
      document_type: d.document_type,
      category: d.category,
      currency: d.currency ?? "",
      amount_gross: d.amount_minor != null ? (d.amount_minor / 100).toFixed(2) : "",
      amount_vat: d.vat_minor != null ? (d.vat_minor / 100).toFixed(2) : "",
      tax_country: d.tax_country ?? "",
      sha256: d.sha256,
    }));
    const vatCsv = toCsv(vatRows, [
      "document_date","supplier","invoice_number","document_type","category",
      "currency","amount_gross","amount_vat","tax_country","sha256",
    ]);
    const vatSummary = {
      period: { type: isQuarter ? "quarter" : "year", year, quarter, start, end, label },
      totals: {
        documents: (docs ?? []).length,
        invoices: invoiceCount,
        receipts: receiptCount,
        gross_minor: totalGross,
        vat_minor: totalVat,
      },
      by_country: (docs ?? []).reduce((acc: Record<string, { docs: number; vat_minor: number }>, d) => {
        const k = d.tax_country || "unknown";
        acc[k] ??= { docs: 0, vat_minor: 0 };
        acc[k].docs++;
        acc[k].vat_minor += d.vat_minor ?? 0;
        return acc;
      }, {}),
    };
    await addToManifest("reports/vat-summary.csv", new TextEncoder().encode(vatCsv));
    await addToManifest("reports/vat-summary.json", new TextEncoder().encode(JSON.stringify(vatSummary, null, 2)));

    const suppliersRows = Array.from(suppliersMap.values()).map((s) => ({
      name: s.name, slug: s.slug, website: s.website ?? "", vat_number: s.vat_number ?? "",
      country: s.country ?? "", currency: s.currency ?? "", category: s.category ?? "",
      invoice_count: s.invoice_count, total_paid: (s.total_paid_minor / 100).toFixed(2),
    }));
    await addToManifest(
      "reports/suppliers.csv",
      new TextEncoder().encode(toCsv(suppliersRows, [
        "name","slug","website","vat_number","country","currency","category","invoice_count","total_paid",
      ])),
    );

    const paymentRows = (payments ?? []).map((p: any) => ({
      paid_at: p.paid_at ?? "",
      provider: p.provider ?? "",
      supplier: suppliersMap.get(p.supplier_id)?.name ?? "",
      amount: (p.amount_minor / 100).toFixed(2),
      currency: p.currency,
      vat: p.vat_minor != null ? (p.vat_minor / 100).toFixed(2) : "",
      status: p.status,
      bank_txn_reference: p.bank_txn_reference ?? "",
      invoice_document_id: p.invoice_document_id ?? "",
      receipt_document_id: p.receipt_document_id ?? "",
      sha256: p.sha256 ?? "",
    }));
    await addToManifest(
      "reports/payments.csv",
      new TextEncoder().encode(toCsv(paymentRows, [
        "paid_at","provider","supplier","amount","currency","vat","status",
        "bank_txn_reference","invoice_document_id","receipt_document_id","sha256",
      ])),
    );

    const indexRows = (docs ?? []).map((d) => ({
      id: d.id,
      document_date: d.document_date ?? "",
      document_type: d.document_type,
      category: d.category,
      supplier: d.supplier_name ?? "",
      invoice_number: d.invoice_number ?? "",
      currency: d.currency ?? "",
      amount_gross: d.amount_minor != null ? (d.amount_minor / 100).toFixed(2) : "",
      amount_vat: d.vat_minor != null ? (d.vat_minor / 100).toFixed(2) : "",
      original_filename: d.original_filename ?? "",
      mime_type: d.mime_type ?? "",
      file_size: d.file_size ?? "",
      sha256: d.sha256,
      source: d.source ?? "",
    }));
    await addToManifest(
      "reports/evidence-index.csv",
      new TextEncoder().encode(toCsv(indexRows, [
        "id","document_date","document_type","category","supplier","invoice_number",
        "currency","amount_gross","amount_vat","original_filename","mime_type",
        "file_size","sha256","source",
      ])),
    );

    // Manifest + README
    const generatedAt = new Date().toISOString();
    const manifestObj = {
      generator: "GetPawsy Genesis V12.3 — Belastingdienst Export",
      generated_at: generatedAt,
      period: { type: isQuarter ? "quarter" : "year", year, quarter, start, end, label },
      totals: {
        documents: (docs ?? []).length,
        invoices: invoiceCount,
        receipts: receiptCount,
        suppliers: suppliersMap.size,
        payments: (payments ?? []).length,
        gross_minor: totalGross,
        vat_minor: totalVat,
      },
      files: manifest,
    };
    const manifestBytes = new TextEncoder().encode(JSON.stringify(manifestObj, null, 2));
    const manifestSha = await sha256Hex(manifestBytes.buffer.slice(manifestBytes.byteOffset, manifestBytes.byteOffset + manifestBytes.byteLength));
    zip.file("manifest.json", manifestBytes);

    const readme = buildReadmeNL({
      label, start, end,
      totals: {
        docs: (docs ?? []).length,
        invoices: invoiceCount,
        receipts: receiptCount,
        suppliers: suppliersMap.size,
        vatMinor: totalVat,
        grossMinor: totalGross,
      },
      manifestSha,
      generatedAt,
    });
    zip.file("README.md", readme);

    // 5) Generate ZIP
    const zipBuf = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
    const zipSha = await sha256Hex(zipBuf.buffer.slice(zipBuf.byteOffset, zipBuf.byteOffset + zipBuf.byteLength));
    const storagePath = `belastingdienst/${label}/${generatedAt.slice(0,10)}_${zipSha.slice(0,10)}.zip`;

    const up = await admin.storage.from(BUCKET).upload(storagePath, zipBuf, {
      contentType: "application/zip",
      upsert: true,
    });
    if (up.error) return json(500, { error: "upload_failed", detail: up.error.message });

    // 6) Register finance_reports row
    const { data: report } = await admin.from("finance_reports").insert({
      report_type: "tax",
      period_year: year,
      period_number: quarter,
      title: `Belastingdienst dossier — ${label}`,
      storage_path: storagePath,
      sha256: zipSha,
      file_size: zipBuf.byteLength,
      summary: {
        label, start, end, manifest_sha256: manifestSha,
        documents: (docs ?? []).length, invoices: invoiceCount, receipts: receiptCount,
        suppliers: suppliersMap.size, gross_minor: totalGross, vat_minor: totalVat,
      },
    }).select("id").maybeSingle();

    const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 60 * 24 * 30);

    return json(200, {
      ok: true,
      report_id: report?.id ?? null,
      period: { label, start, end, year, quarter },
      totals: {
        documents: (docs ?? []).length,
        invoices: invoiceCount,
        receipts: receiptCount,
        suppliers: suppliersMap.size,
        payments: (payments ?? []).length,
        gross_minor: totalGross,
        vat_minor: totalVat,
      },
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
    console.error("belastingdienst export failed", e);
    return json(500, { error: "export_failed", detail: (e as Error)?.message });
  }
});