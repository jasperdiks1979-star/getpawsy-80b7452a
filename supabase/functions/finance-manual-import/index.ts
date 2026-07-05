// GENESIS V12.2 — Finance Manual Import Assistant
// Admin-only endpoint that accepts an uploaded invoice/receipt (PDF or image),
// runs OCR + metadata extraction via Lovable AI Gateway (Gemini multimodal),
// SHA-256 hashes it, archives to the private `genesis-vault` bucket,
// upserts the supplier, registers an immutable evidence_documents row,
// writes a timeline entry, updates supplier rollups, and (optionally) closes
// a matching finance_import_tasks row.
// Idempotent: dedupes by SHA-256.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const BUCKET = "genesis-vault";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.split(",", 2)[1] : b64;
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function slugify(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "unknown";
}

// Supplier adapter registry — canonicalises vendor patterns so
// downstream categorisation / matching stays consistent regardless of
// how the AI transcribes the header. Extend as new vendors appear.
const SUPPLIER_ADAPTERS: Array<{
  match: RegExp;
  slug: string;
  name: string;
  category: string;
  country?: string;
  website?: string;
}> = [
  { match: /lovable\.dev|lovable\.app|\blovable\b/i, slug: "lovable", name: "Lovable", category: "Software", country: "SE", website: "https://lovable.dev" },
  { match: /openai\.com|\bopenai\b|chatgpt/i, slug: "openai", name: "OpenAI", category: "AI", country: "US", website: "https://openai.com" },
  { match: /stripe\.com|\bstripe\b/i, slug: "stripe", name: "Stripe", category: "Payments", country: "US", website: "https://stripe.com" },
  { match: /shopify\.com|\bshopify\b/i, slug: "shopify", name: "Shopify", category: "Ecommerce", country: "CA", website: "https://shopify.com" },
  { match: /cjdropshipping|cj[- ]?dropshipping/i, slug: "cj-dropshipping", name: "CJ Dropshipping", category: "Fulfillment", country: "CN", website: "https://cjdropshipping.com" },
  { match: /apple\.com\/bill|\bapple inc\b|\bamac\b/i, slug: "apple", name: "Apple", category: "Hardware", country: "US", website: "https://apple.com" },
  { match: /\bodido\b|t-mobile netherlands|t-mobile nl/i, slug: "odido", name: "Odido", category: "Telecom", country: "NL", website: "https://odido.nl" },
  { match: /google (cloud|ads|workspace|ireland)/i, slug: "google", name: "Google", category: "Software", country: "IE", website: "https://google.com" },
  { match: /\bmeta platforms\b|facebook ireland/i, slug: "meta", name: "Meta", category: "Marketing", country: "IE", website: "https://meta.com" },
];

function applySupplierAdapter(rawName: string | null, ocrHint: string | null): (typeof SUPPLIER_ADAPTERS)[number] | null {
  const hay = `${rawName ?? ""} ${ocrHint ?? ""}`.trim();
  if (!hay) return null;
  for (const a of SUPPLIER_ADAPTERS) if (a.match.test(hay)) return a;
  return null;
}

const EXTRACT_SCHEMA_PROMPT = `You are a Dutch/EU/US bookkeeping OCR assistant. Read the attached invoice, receipt, or bill and return STRICT JSON with these fields (null if not present, never invent):
{
  "supplier_name": string|null,
  "supplier_website": string|null,
  "supplier_vat_number": string|null,
  "supplier_country": string|null,               // ISO-2, e.g. "NL","US"
  "document_type": "invoice"|"receipt"|"credit_note"|"statement"|"other",
  "invoice_number": string|null,
  "reference": string|null,
  "document_date": string|null,                  // YYYY-MM-DD
  "period_start": string|null,
  "period_end": string|null,
  "currency": string|null,                       // ISO-4217, e.g. "USD","EUR"
  "amount_total": number|null,                   // gross total in currency units, decimal
  "amount_vat": number|null,                     // VAT/BTW amount in currency units, decimal
  "vat_rate": number|null,                       // percent, e.g. 21, 0
  "tax_country": string|null,
  "category_hint": string|null,                  // e.g. "Software","AI","Cloud","Marketing","Hosting"
  "confidence": number                           // 0..1
}
Return ONLY the JSON object, no prose, no markdown fences.`;

async function extractWithAI(mime: string, b64: string): Promise<Record<string, any> | null> {
  if (!LOVABLE_API_KEY) return null;
  try {
    const isPdf = mime === "application/pdf";
    const dataUrl = `data:${mime};base64,${b64}`;
    const contentBlock = isPdf
      ? { type: "file", file: { filename: "doc.pdf", file_data: dataUrl } }
      : { type: "image_url", image_url: { url: dataUrl } };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": LOVABLE_API_KEY,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: EXTRACT_SCHEMA_PROMPT },
              contentBlock,
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      console.error("AI extract failed", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? "";
    const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first === -1 || last === -1) return null;
    return JSON.parse(cleaned.slice(first, last + 1));
  } catch (e) {
    console.error("AI extract error", e);
    return null;
  }
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

    const body = await req.json().catch(() => null) as {
      filename?: string;
      mime_type?: string;
      base64?: string;
      hint_supplier?: string | null;
      hint_category?: string | null;
      hint_task_id?: string | null;
      hint_document_type?: string | null;
      user_notes?: string | null;
      override?: Record<string, any> | null;
    } | null;

    if (!body?.base64 || !body?.filename) return json(400, { error: "missing_file" });
    const mime = body.mime_type || "application/octet-stream";
    if (body.base64.length > 30 * 1024 * 1024) return json(413, { error: "file_too_large" });

    const bytes = base64ToBytes(body.base64);
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const sha = await sha256Hex(buf);
    const fileSize = bytes.byteLength;

    // Dedupe
    const { data: existing } = await admin
      .from("evidence_documents").select("id, title, storage_path").eq("sha256", sha).maybeSingle();
    if (existing?.id) {
      return json(200, { ok: true, deduped: true, evidence_id: existing.id, sha256: sha });
    }

    // Storage path
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const ext = (body.filename.split(".").pop() || "bin").toLowerCase().slice(0, 6);
    const storagePath = `manual/${yyyy}/${mm}/${sha.slice(0, 12)}-${slugify(body.filename.replace(/\.[^.]+$/, ""))}.${ext}`;

    const up = await admin.storage.from(BUCKET).upload(storagePath, bytes, {
      contentType: mime, upsert: false,
    });
    if (up.error && !String(up.error.message || "").toLowerCase().includes("exists")) {
      return json(500, { error: "upload_failed", detail: up.error.message });
    }

    // AI extraction (only for pdf/image types)
    const supportsAi = mime === "application/pdf" || mime.startsWith("image/");
    const ai = supportsAi ? await extractWithAI(mime, body.base64) : null;
    const override = body.override ?? {};

    const supplierName: string | null = override.supplier_name ?? ai?.supplier_name ?? body.hint_supplier ?? null;
    const adapter = applySupplierAdapter(supplierName, ai?.category_hint ?? null);
    const canonicalName = adapter?.name ?? supplierName;
    const supplierSlug = adapter?.slug ?? (canonicalName ? slugify(canonicalName) : null);
    const documentType: string = override.document_type ?? ai?.document_type ?? body.hint_document_type ?? "invoice";
    const invoiceNumber: string | null = override.invoice_number ?? ai?.invoice_number ?? null;
    const documentDate: string | null = override.document_date ?? ai?.document_date ?? null;
    const periodStart: string | null = override.period_start ?? ai?.period_start ?? null;
    const periodEnd: string | null = override.period_end ?? ai?.period_end ?? null;
    const currency: string | null = (override.currency ?? ai?.currency ?? null)?.toUpperCase?.() ?? null;
    const amountTotal: number | null = override.amount_total ?? ai?.amount_total ?? null;
    const amountVat: number | null = override.amount_vat ?? ai?.amount_vat ?? null;
    const category: string = override.category ?? adapter?.category ?? ai?.category_hint ?? body.hint_category ?? "expense";
    const taxCountry: string | null = override.tax_country ?? ai?.tax_country ?? ai?.supplier_country ?? null;
    const confidence: number = typeof ai?.confidence === "number" ? ai.confidence : (ai ? 0.6 : 0.0);

    // Upsert supplier
    let supplierId: string | null = null;
    if (canonicalName && supplierSlug) {
      const { data: sup } = await admin.from("evidence_suppliers")
        .select("id").eq("slug", supplierSlug).maybeSingle();
      if (sup?.id) {
        supplierId = sup.id;
      } else {
        const { data: created, error: cErr } = await admin.from("evidence_suppliers").insert({
          name: canonicalName,
          slug: supplierSlug,
          website: adapter?.website ?? ai?.supplier_website ?? null,
          vat_number: ai?.supplier_vat_number ?? null,
          country: adapter?.country ?? ai?.supplier_country ?? null,
          currency: currency ?? "USD",
          category: category,
        }).select("id").single();
        if (cErr) console.error("supplier insert", cErr);
        supplierId = created?.id ?? null;
      }
    }

    const amountMinor = amountTotal != null ? Math.round(Number(amountTotal) * 100) : null;
    const vatMinor = amountVat != null ? Math.round(Number(amountVat) * 100) : null;

    const title = [
      supplierName ?? "Manual upload",
      documentType,
      invoiceNumber ? `#${invoiceNumber}` : null,
      documentDate ?? null,
    ].filter(Boolean).join(" · ");

    const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 60 * 24 * 30);

    const { data: doc, error: docErr } = await admin.from("evidence_documents").insert({
      title,
      document_type: documentType,
      category,
      subcategory: ai?.category_hint ?? null,
      supplier_id: supplierId,
      supplier_name: supplierName,
      document_date: documentDate,
      period_start: periodStart,
      period_end: periodEnd,
      invoice_number: invoiceNumber,
      reference: override.reference ?? ai?.reference ?? null,
      amount_minor: amountMinor,
      currency,
      vat_minor: vatMinor,
      tax_country: taxCountry,
      original_filename: body.filename,
      mime_type: mime,
      file_size: fileSize,
      sha256: sha,
      storage_bucket: BUCKET,
      storage_path: storagePath,
      public_path: signed?.signedUrl ?? null,
      source: "manual_upload",
      uploader: uid,
      ocr_text: null,
      ocr_status: ai ? "completed" : (supportsAi ? "failed" : "skipped"),
      classification: category,
      classification_confidence: confidence,
      integrity_verified: true,
      last_verified: new Date().toISOString(),
      tags: ["manual", body.hint_task_id ? "task-linked" : "adhoc"],
      metadata: {
        ai_extract: ai ?? null,
        override: override ?? null,
        user_notes: body.user_notes ?? null,
        vat_rate: ai?.vat_rate ?? null,
      },
    }).select("*").single();

    if (docErr || !doc) {
      console.error("evidence insert", docErr);
      return json(500, { error: "evidence_insert_failed", detail: docErr?.message });
    }

    // Timeline
    await admin.from("evidence_timeline").insert({
      evidence_id: doc.id,
      supplier_id: supplierId,
      event_type: "document_uploaded",
      event_date: (documentDate ?? new Date().toISOString().slice(0, 10)),
      title: `Manual upload: ${title}`,
      description: `Uploaded by admin via Manual Import Assistant (${mime}, ${fileSize} bytes).`,
      amount_minor: amountMinor,
      currency,
      metadata: { sha256: sha, source: "manual_upload" },
    });

    // Supplier rollup
    if (supplierId && amountMinor != null) {
      const { data: agg } = await admin
        .from("evidence_documents")
        .select("amount_minor, document_date")
        .eq("supplier_id", supplierId);
      const rows = agg ?? [];
      const total = rows.reduce((s, r: any) => s + (r.amount_minor ?? 0), 0);
      const dates = rows.map((r: any) => r.document_date).filter(Boolean).sort();
      await admin.from("evidence_suppliers").update({
        invoice_count: rows.length,
        total_paid_minor: total,
        first_invoice_at: dates[0] ? `${dates[0]}T00:00:00Z` : null,
        latest_invoice_at: dates[dates.length - 1] ? `${dates[dates.length - 1]}T00:00:00Z` : null,
      }).eq("id", supplierId);
    }

    // Close matching import task
    let closedTaskId: string | null = null;
    if (body.hint_task_id) {
      const { error: tErr } = await admin.from("finance_import_tasks").update({
        status: "fulfilled",
        evidence_document_id: doc.id,
        updated_at: new Date().toISOString(),
      }).eq("id", body.hint_task_id);
      if (!tErr) closedTaskId = body.hint_task_id;
    } else if (supplierSlug) {
      // Auto-match open task by supplier + period
      const period = periodStart ?? documentDate ?? null;
      const { data: task } = await admin.from("finance_import_tasks")
        .select("id, period_label")
        .eq("supplier_slug", supplierSlug)
        .eq("status", "open")
        .limit(5);
      const match = (task ?? []).find((t: any) =>
        !period || !t.period_label || (t.period_label && period && period.startsWith(t.period_label.slice(0, 7)))
      ) ?? (task ?? [])[0];
      if (match?.id) {
        await admin.from("finance_import_tasks").update({
          status: "fulfilled",
          evidence_document_id: doc.id,
          updated_at: new Date().toISOString(),
        }).eq("id", match.id);
        closedTaskId = match.id;
      }
    }

    return json(200, {
      ok: true,
      deduped: false,
      evidence_id: doc.id,
      supplier_id: supplierId,
      closed_task_id: closedTaskId,
      sha256: sha,
      storage_path: storagePath,
      signed_url: signed?.signedUrl ?? null,
      extracted: ai,
      confidence,
      document: {
        title,
        supplier_name: supplierName,
        document_type: documentType,
        invoice_number: invoiceNumber,
        document_date: documentDate,
        amount_minor: amountMinor,
        vat_minor: vatMinor,
        currency,
        category,
      },
    });
  } catch (e: any) {
    console.error("finance-manual-import error", e);
    return json(500, { error: "internal", detail: String(e?.message ?? e) });
  }
});