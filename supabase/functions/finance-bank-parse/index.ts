// GENESIS V15 — Finance Bank Statement Parser
// Admin/finance endpoint that accepts an ING or Revolut bank statement
// (CSV or PDF, base64) and:
//   1. Detects the bank format (ING NL / Revolut / generic).
//   2. Parses transactions (CSV: native; PDF: Lovable AI Gateway JSON extract).
//   3. Dedupes each transaction by SHA-256 of (paid_at|amount|currency|reference).
//   4. Inserts one row per transaction into public.evidence_payments.
//   5. Auto-matches to public.evidence_documents (invoice) when
//      amount matches (±1 cent), date within ±10 days, and supplier
//      slug or invoice_number appears in the description.
//   6. Unmatched debit payments create/refresh a finance_import_tasks
//      row so the user can upload the missing invoice PDF.
//
// Reuses: evidence_payments, evidence_documents, evidence_suppliers,
// evidence_timeline, finance_import_tasks. Does NOT duplicate any
// existing OCR / classification / storage pipeline.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

function slugify(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "")
    .trim().replace(/\s+/g, "-").slice(0, 60);
}

// ---------- Types ----------
type ParsedTxn = {
  paid_at: string;               // ISO
  amount_minor: number;          // signed; negative = debit/outflow
  currency: string;
  description: string;
  counterparty?: string | null;
  reference?: string | null;
};

// ---------- CSV utilities ----------
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++; }
      else q = !q;
    } else if ((c === "," || c === ";") && !q) {
      out.push(cur); cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim().replace(/^"|"$/g, ""));
}

function detectDelimiter(header: string): "," | ";" {
  return (header.split(";").length > header.split(",").length) ? ";" : ",";
}

function parseAmount(v: string): number {
  if (!v) return NaN;
  const cleaned = v.replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(cleaned);
  return isFinite(n) ? Math.round(n * 100) : NaN;
}

function isoDate(v: string): string | null {
  if (!v) return null;
  const m1 = v.match(/^(\d{4})[-\/](\d{2})[-\/](\d{2})/);
  if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}`;
  const m2 = v.match(/^(\d{2})[-\/](\d{2})[-\/](\d{4})/);
  if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}`;
  const m3 = v.match(/^(\d{8})$/); // YYYYMMDD (ING)
  if (m3) return `${m3[1].slice(0,4)}-${m3[1].slice(4,6)}-${m3[1].slice(6,8)}`;
  return null;
}

// ---------- Parsers ----------
function parseIngCsv(text: string): ParsedTxn[] {
  // ING NL columns: Datum;"Naam / Omschrijving";"Rekening";"Tegenrekening";"Code";
  // "Af Bij";"Bedrag (EUR)";"MutatieSoort";"Mededelingen"
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (lines.length < 2) return [];
  const delim = detectDelimiter(lines[0]);
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = (k: string) => header.findIndex((h) => h.includes(k));
  const iDate = idx("datum");
  const iName = idx("naam") >= 0 ? idx("naam") : idx("omschrijving");
  const iAfBij = idx("af bij") >= 0 ? idx("af bij") : idx("af/bij");
  const iAmt = header.findIndex((h) => h.startsWith("bedrag"));
  const iCounter = idx("tegenrekening");
  const iMed = idx("mededelingen");
  const out: ParsedTxn[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(delim === "," ? "," : ";").length < 3
      ? splitCsvLine(lines[i])
      : splitCsvLine(lines[i]);
    if (c.length < 3) continue;
    const d = isoDate(c[iDate] || "");
    const amt = parseAmount(c[iAmt] || "");
    if (!d || !isFinite(amt)) continue;
    const sign = (c[iAfBij] || "").toLowerCase().startsWith("a") ? -1 : 1;
    out.push({
      paid_at: `${d}T00:00:00Z`,
      amount_minor: sign * Math.abs(amt),
      currency: "EUR",
      description: c[iName] || "",
      counterparty: c[iCounter] || null,
      reference: c[iMed] || null,
    });
  }
  return out;
}

function parseRevolutCsv(text: string): ParsedTxn[] {
  // Revolut columns: Type,Product,Started Date,Completed Date,Description,
  // Amount,Fee,Currency,State,Balance
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = (k: string) => header.findIndex((h) => h === k || h.includes(k));
  const iDate = idx("completed date") >= 0 ? idx("completed date") : idx("started date");
  const iDesc = idx("description");
  const iAmt = idx("amount");
  const iFee = idx("fee");
  const iCur = idx("currency");
  const iState = idx("state");
  const out: ParsedTxn[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = splitCsvLine(lines[i]);
    if (c.length < 4) continue;
    if (iState >= 0 && c[iState] && !/completed/i.test(c[iState])) continue;
    const d = isoDate((c[iDate] || "").slice(0, 10));
    const amt = parseAmount(c[iAmt] || "");
    const fee = iFee >= 0 ? parseAmount(c[iFee] || "0") : 0;
    if (!d || !isFinite(amt)) continue;
    const net = amt - (isFinite(fee) ? Math.abs(fee) : 0) * (amt < 0 ? 1 : 0);
    out.push({
      paid_at: `${d}T00:00:00Z`,
      amount_minor: net,
      currency: (c[iCur] || "EUR").toUpperCase(),
      description: c[iDesc] || "",
      counterparty: null,
      reference: null,
    });
  }
  return out;
}

function detectCsvFormat(text: string): "ing" | "revolut" | "generic" {
  const head = text.slice(0, 2000).toLowerCase();
  if (head.includes("af bij") || head.includes("mededelingen")) return "ing";
  if (head.includes("completed date") && head.includes("balance")) return "revolut";
  return "generic";
}

// ---------- PDF via AI Gateway ----------
async function parsePdfWithAI(mime: string, b64: string): Promise<ParsedTxn[]> {
  if (!LOVABLE_API_KEY) return [];
  const prompt = `You are a bank statement parser. Extract EVERY transaction from the attached statement (ING NL or Revolut). Return STRICT JSON: {"transactions":[{"paid_at":"YYYY-MM-DD","amount":number,"currency":"EUR|USD|...","description":string,"counterparty":string|null,"reference":string|null}]}
Rules: amount is signed (negative=debit/outflow, positive=credit/inflow). Never invent data. Return ONLY JSON.`;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "file", file: { filename: "statement.pdf", file_data: `data:${mime};base64,${b64}` } },
        ],
      }],
    }),
  });
  if (!res.ok) { console.error("bank pdf ai", res.status, await res.text()); return []; }
  const data = await res.json();
  const text: string = data?.choices?.[0]?.message?.content ?? "";
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const s = cleaned.indexOf("{"); const e = cleaned.lastIndexOf("}");
  if (s < 0 || e < 0) return [];
  try {
    const obj = JSON.parse(cleaned.slice(s, e + 1));
    return (obj?.transactions ?? []).map((t: any): ParsedTxn => ({
      paid_at: `${String(t.paid_at).slice(0, 10)}T00:00:00Z`,
      amount_minor: Math.round(Number(t.amount) * 100),
      currency: String(t.currency || "EUR").toUpperCase(),
      description: String(t.description || ""),
      counterparty: t.counterparty ?? null,
      reference: t.reference ?? null,
    })).filter((t) => t.paid_at && isFinite(t.amount_minor));
  } catch (e) {
    console.error("bank pdf json parse", e);
    return [];
  }
}

// ---------- Matching ----------
type SupplierRow = { id: string; slug: string; name: string };

function guessSupplierSlug(desc: string, suppliers: SupplierRow[]): SupplierRow | null {
  const d = desc.toLowerCase();
  // Known merchant fingerprints (extend freely)
  const patterns: Array<[RegExp, string, string]> = [
    [/\blovable\b/i, "lovable", "Lovable"],
    [/\bopenai\b|\bchatgpt\b/i, "openai", "OpenAI"],
    [/\bstripe\b/i, "stripe", "Stripe"],
    [/\bshopify\b/i, "shopify", "Shopify"],
    [/\bcjdropshipping|\bcj dropshipping|\bcj-dropshipping/i, "cj-dropshipping", "CJ Dropshipping"],
    [/\bapple\b|\bamac\b|\bapple\.com\/bill/i, "apple", "Apple"],
    [/\bodido\b|\bt-mobile\b/i, "odido", "Odido"],
    [/\bgoogle\b.*(ads|cloud|workspace)/i, "google", "Google"],
    [/\bmeta\b|\bfacebook ads\b/i, "meta", "Meta"],
    [/\btiktok\b/i, "tiktok", "TikTok"],
    [/\bpinterest\b/i, "pinterest", "Pinterest"],
  ];
  for (const [re, slug, name] of patterns) {
    if (re.test(d)) {
      const existing = suppliers.find((s) => s.slug === slug);
      if (existing) return existing;
      return { id: "", slug, name };
    }
  }
  // Direct supplier name match
  for (const s of suppliers) {
    if (s.name && d.includes(s.name.toLowerCase())) return s;
    if (s.slug && d.includes(s.slug.replace(/-/g, " "))) return s;
  }
  return null;
}

// ---------- Main ----------
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
    const { data: access } = await admin.rpc("has_finance_access", { _user_id: uid });
    if (!access) {
      const { data: isAdmin } = await admin.rpc("has_role", { _user_id: uid, _role: "admin" });
      if (!isAdmin) return json(403, { error: "forbidden" });
    }

    const body = await req.json().catch(() => null) as {
      filename: string;
      mime_type: string;
      base64: string;
      format_hint?: "ing" | "revolut" | "generic" | null;
      entity_id?: string | null;
    } | null;
    if (!body?.base64 || !body?.filename) return json(400, { error: "missing_file" });
    if (body.base64.length > 30 * 1024 * 1024) return json(413, { error: "file_too_large" });

    const mime = body.mime_type || "application/octet-stream";
    const isPdf = mime === "application/pdf" || /\.pdf$/i.test(body.filename);
    const isCsv = /csv|excel|spreadsheet|text\/plain/.test(mime) || /\.(csv|tsv|txt)$/i.test(body.filename);

    let txns: ParsedTxn[] = [];
    let format = body.format_hint ?? "generic";

    if (isCsv) {
      const raw = atob(body.base64.split(",").pop()!);
      const detected = detectCsvFormat(raw);
      format = body.format_hint ?? detected;
      if (format === "ing") txns = parseIngCsv(raw);
      else if (format === "revolut") txns = parseRevolutCsv(raw);
      else {
        // try both
        txns = parseIngCsv(raw);
        if (!txns.length) txns = parseRevolutCsv(raw);
      }
    } else if (isPdf) {
      txns = await parsePdfWithAI(mime, body.base64);
      format = body.format_hint ?? "generic";
    } else {
      return json(400, { error: "unsupported_mime", detail: mime });
    }

    if (!txns.length) return json(200, { ok: true, imported: 0, matched: 0, tasks: 0, note: "no_transactions" });

    // Load supplier + open invoice universes once
    const { data: suppliers } = await admin.from("evidence_suppliers").select("id, slug, name");
    const supList = (suppliers ?? []) as SupplierRow[];
    const { data: openInvoices } = await admin.from("evidence_documents")
      .select("id, supplier_id, supplier_name, invoice_number, amount_minor, currency, document_date")
      .eq("document_type", "invoice");
    const invoices = openInvoices ?? [];

    let imported = 0, matched = 0, tasksCreated = 0, deduped = 0;

    for (const t of txns) {
      const key = `${t.paid_at}|${t.amount_minor}|${t.currency}|${(t.reference || t.description || "").slice(0, 80)}`;
      const sha = await sha256Hex(key);

      const { data: existing } = await admin.from("evidence_payments")
        .select("id").eq("sha256", sha).maybeSingle();
      if (existing?.id) { deduped++; continue; }

      const supplierGuess = guessSupplierSlug(`${t.description} ${t.counterparty ?? ""}`, supList);
      let supplierId: string | null = supplierGuess?.id || null;

      // Try to match an invoice: same currency, amount within 1 cent, date within ±10d, and
      // supplier or invoice_number appears in description.
      let invoiceMatch: any = null;
      const target = Math.abs(t.amount_minor);
      const txnDate = new Date(t.paid_at).getTime();
      for (const inv of invoices) {
        if (!inv.amount_minor || !inv.currency) continue;
        if (inv.currency.toUpperCase() !== t.currency) continue;
        if (Math.abs(inv.amount_minor - target) > 1) continue;
        if (inv.document_date) {
          const invT = new Date(`${inv.document_date}T00:00:00Z`).getTime();
          if (Math.abs(invT - txnDate) > 10 * 86400_000) continue;
        }
        const desc = `${t.description} ${t.counterparty ?? ""} ${t.reference ?? ""}`.toLowerCase();
        const supHit = supplierId && inv.supplier_id === supplierId;
        const invNumHit = inv.invoice_number && desc.includes(String(inv.invoice_number).toLowerCase());
        const supNameHit = inv.supplier_name && desc.includes(String(inv.supplier_name).toLowerCase());
        if (supHit || invNumHit || supNameHit) { invoiceMatch = inv; break; }
      }
      if (invoiceMatch && !supplierId) supplierId = invoiceMatch.supplier_id ?? null;

      const status = invoiceMatch ? "matched" : (t.amount_minor < 0 ? "unmatched" : "credit");
      const { data: payRow, error: pErr } = await admin.from("evidence_payments").insert({
        supplier_id: supplierId,
        invoice_document_id: invoiceMatch?.id ?? null,
        bank_txn_reference: t.reference || t.description.slice(0, 120),
        provider: `bank:${format}`,
        amount_minor: t.amount_minor,
        currency: t.currency,
        status,
        paid_at: t.paid_at,
        sha256: sha,
        entity_id: body.entity_id ?? null,
        metadata: {
          description: t.description,
          counterparty: t.counterparty,
          reference: t.reference,
          source_filename: body.filename,
          format,
          matched_by: invoiceMatch ? "auto" : null,
        },
      }).select("id").single();

      if (pErr) { console.error("payment insert", pErr); continue; }
      imported++;
      if (invoiceMatch) matched++;

      // Unmatched debit → create finance_import_tasks row so the user can upload the invoice
      if (!invoiceMatch && t.amount_minor < 0) {
        const slug = supplierGuess?.slug || slugify(t.counterparty || t.description) || "unknown";
        const period = t.paid_at.slice(0, 7);
        const { data: existingTask } = await admin.from("finance_import_tasks")
          .select("id").eq("supplier_slug", slug).eq("period_label", period)
          .eq("status", "open").maybeSingle();
        if (!existingTask?.id) {
          const { error: tErr } = await admin.from("finance_import_tasks").insert({
            supplier_slug: slug,
            period_label: period,
            expected_type: "invoice",
            status: "open",
            expected_amount_minor: Math.abs(t.amount_minor),
            currency: t.currency,
            due_at: t.paid_at.slice(0, 10),
            entity_id: body.entity_id ?? null,
            instructions: `MISSING INVOICE - PAYMENT FOUND. Bank ${format.toUpperCase()} debit of ${(Math.abs(t.amount_minor)/100).toFixed(2)} ${t.currency} on ${t.paid_at.slice(0,10)}: "${t.description.slice(0,140)}". Upload the matching supplier invoice via Manual Import.`,
          });
          if (!tErr) tasksCreated++;
        }
      }

      // Timeline entry when matched
      if (invoiceMatch) {
        await admin.from("evidence_timeline").insert({
          evidence_id: invoiceMatch.id,
          supplier_id: supplierId,
          event_type: "payment_matched",
          event_date: t.paid_at.slice(0, 10),
          title: `Bank payment matched (${format.toUpperCase()})`,
          description: `${(Math.abs(t.amount_minor)/100).toFixed(2)} ${t.currency} — ${t.description.slice(0,140)}`,
          amount_minor: t.amount_minor,
          currency: t.currency,
          metadata: { payment_id: payRow?.id, sha256: sha, source: `bank:${format}` },
        });
      }
    }

    return json(200, {
      ok: true,
      format,
      parsed: txns.length,
      imported,
      deduped,
      matched,
      unmatched: imported - matched,
      tasks_created: tasksCreated,
    });
  } catch (e: any) {
    console.error("finance-bank-parse error", e);
    return json(500, { error: "internal", detail: String(e?.message ?? e) });
  }
});