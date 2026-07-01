// GENESIS V13.2 — Stripe → Evidence Vault auto-import
// Pulls invoices, charge receipts, payouts, balance transactions, and subscriptions from Stripe LIVE,
// extracts per-invoice VAT/tax breakdowns, generates period CSV statements,
// SHA-256 hashes every artifact, stores the PDF/JSON/CSV in the private `genesis-vault` bucket,
// and registers immutable rows in evidence_documents + evidence_payments + finance_subscriptions
// + finance_vat_summaries. Admin-only. Idempotent: dedupes by (source_id, sha256).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? Deno.env.get("STRIPE_KEY") ?? "";
const BUCKET = "genesis-vault";

async function sha256(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function stripeGet(path: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `https://api.stripe.com/v1${path}${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${STRIPE_KEY}` } });
  if (!res.ok) throw new Error(`Stripe ${path} ${res.status}: ${await res.text()}`);
  return await res.json();
}

async function downloadPdf(url: string): Promise<ArrayBuffer | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.arrayBuffer();
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!STRIPE_KEY) throw new Error("STRIPE_SECRET_KEY not configured");
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: userData } = await admin.auth.getUser(token);
    const uid = userData?.user?.id;
    if (!uid) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: hasRole } = await admin.rpc("has_role", { _user_id: uid, _role: "admin" });
    if (!hasRole) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json().catch(() => ({}));
    const sinceDays = Number(body.since_days ?? 365);
    const created_gte = Math.floor(Date.now() / 1000) - sinceDays * 86400;
    const limit = Math.min(Number(body.limit ?? 100), 100);

    // Ensure Stripe supplier
    let supplierId: string | null = null;
    {
      const { data: sup } = await admin.from("evidence_suppliers").select("id").eq("slug", "stripe").maybeSingle();
      supplierId = sup?.id ?? null;
      if (!supplierId) {
        const { data: created } = await admin.from("evidence_suppliers").insert({
          name: "Stripe", slug: "stripe", website: "https://stripe.com", category: "payments",
          country: "US", currency: "USD",
        }).select("id").single();
        supplierId = created?.id ?? null;
      }
    }

    const stats = { invoices: 0, receipts: 0, payouts: 0, balance_txns: 0, skipped: 0, errors: [] as string[] };

    const registerDoc = async (opts: {
      source_id: string;
      kind: "invoice" | "receipt" | "payout" | "balance" | "subscription" | "csv_statement";
      title: string;
      docDate: string | null; number: string | null; amountMinor: number | null; currency: string;
      pdfBuf: ArrayBuffer | null; jsonPayload: unknown;
      csvBuf?: ArrayBuffer | null;
    }) => {
      const ext = opts.csvBuf ? "csv" : opts.pdfBuf ? "pdf" : "json";
      const contentType = opts.csvBuf ? "text/csv" : opts.pdfBuf ? "application/pdf" : "application/json";
      const filename = `${opts.kind}_${opts.source_id}.${ext}`;
      const path = `stripe/${opts.kind}s/${filename}`;
      const payloadBuf = opts.csvBuf ?? opts.pdfBuf ?? new TextEncoder().encode(JSON.stringify(opts.jsonPayload, null, 2)).buffer;
      const hash = await sha256(payloadBuf);

      // Dedupe by sha256 + reference
      const { data: existing } = await admin
        .from("evidence_documents").select("id")
        .or(`sha256.eq.${hash},reference.eq.${opts.source_id}`)
        .limit(1).maybeSingle();
      if (existing) { stats.skipped++; return existing.id; }

      const { error: upErr } = await admin.storage.from(BUCKET).upload(path, payloadBuf, {
        contentType, upsert: true,
      });
      if (upErr) throw new Error(`storage upload failed: ${upErr.message}`);

      const { data: doc, error: insErr } = await admin.from("evidence_documents").insert({
        title: opts.title,
        description: `Auto-imported from Stripe (${opts.kind}).`,
        document_type: opts.kind === "invoice" ? "invoice"
          : opts.kind === "receipt" ? "receipt"
          : opts.kind === "subscription" ? "contract"
          : "statement",
        category: "payments",
        subcategory: `stripe_${opts.kind}`,
        supplier_id: supplierId,
        supplier_name: "Stripe",
        document_date: opts.docDate,
        invoice_number: opts.number,
        reference: opts.source_id,
        amount_minor: opts.amountMinor,
        currency: opts.currency,
        original_filename: filename,
        mime_type: contentType,
        file_size: payloadBuf.byteLength,
        sha256: hash,
        storage_bucket: BUCKET,
        storage_path: path,
        source: "stripe_api",
        is_immutable: true,
        integrity_verified: true,
        last_verified: new Date().toISOString(),
        classification: `stripe_${opts.kind}`,
        classification_confidence: 1.0,
        tags: ["stripe", opts.kind, "auto-import"],
        metadata: { stripe_id: opts.source_id, payload: opts.jsonPayload },
      }).select("id").single();
      if (insErr) throw new Error(`doc insert failed: ${insErr.message}`);
      return doc.id;
    };

    // Aggregate VAT across imported invoices (this run)
    type VatEntry = { year: number; quarter: number; vat: number; count: number; currency: string; details: Array<Record<string, unknown>> };
    const vatByYearQuarter = new Map<string, VatEntry>();

    // 1) Invoices
    let starting_after: string | undefined;
    let pages = 0;
    do {
      const params: Record<string, string> = { limit: String(limit), "created[gte]": String(created_gte) };
      if (starting_after) params.starting_after = starting_after;
      const list = await stripeGet("/invoices", params);
      for (const inv of list.data as any[]) {
        try {
          const pdf = inv.invoice_pdf ? await downloadPdf(inv.invoice_pdf) : null;
          await registerDoc({
            source_id: inv.id, kind: "invoice",
            title: `Stripe Invoice ${inv.number ?? inv.id}`,
            docDate: inv.created ? new Date(inv.created * 1000).toISOString().slice(0, 10) : null,
            number: inv.number ?? null,
            amountMinor: inv.amount_paid ?? inv.amount_due ?? null,
            currency: (inv.currency ?? "usd").toUpperCase(),
            pdfBuf: pdf, jsonPayload: inv,
          });
          stats.invoices++;
          // VAT extraction
          const taxMinor = Number(inv.tax ?? 0) || (inv.total_tax_amounts ?? []).reduce((s: number, t: any) => s + Number(t.amount ?? 0), 0);
          if (taxMinor > 0 && inv.created) {
            const d = new Date(inv.created * 1000);
            const yr = d.getUTCFullYear();
            const q = Math.floor(d.getUTCMonth() / 3) + 1;
            const key = `${yr}-Q${q}`;
            const cur = (inv.currency ?? "usd").toUpperCase();
            const entry: VatEntry = vatByYearQuarter.get(key) ?? { year: yr, quarter: q, vat: 0, count: 0, currency: cur, details: [] };
            entry.vat += taxMinor; entry.count += 1;
            entry.details.push({ invoice: inv.id, number: inv.number, tax_minor: taxMinor, currency: cur, rates: inv.total_tax_amounts ?? null });
            vatByYearQuarter.set(key, entry);
          }
        } catch (e) { stats.errors.push(`invoice ${inv.id}: ${(e as Error).message}`); }
      }
      starting_after = list.has_more ? list.data[list.data.length - 1]?.id : undefined;
      pages++;
    } while (starting_after && pages < 20);

    // 2) Charge receipts
    starting_after = undefined; pages = 0;
    do {
      const params: Record<string, string> = { limit: String(limit), "created[gte]": String(created_gte) };
      if (starting_after) params.starting_after = starting_after;
      const list = await stripeGet("/charges", params);
      for (const ch of list.data as any[]) {
        if (!ch.paid || ch.status !== "succeeded") continue;
        try {
          const pdf = ch.receipt_url ? await downloadPdf(ch.receipt_url) : null;
          const docId = await registerDoc({
            source_id: ch.id, kind: "receipt",
            title: `Stripe Receipt ${ch.receipt_number ?? ch.id}`,
            docDate: ch.created ? new Date(ch.created * 1000).toISOString().slice(0, 10) : null,
            number: ch.receipt_number ?? null,
            amountMinor: ch.amount_captured ?? ch.amount ?? null,
            currency: (ch.currency ?? "usd").toUpperCase(),
            pdfBuf: pdf, jsonPayload: ch,
          });
          // Payment record
          const { data: existP } = await admin.from("evidence_payments").select("id").eq("bank_txn_reference", ch.id).maybeSingle();
          if (!existP) {
            await admin.from("evidence_payments").insert({
              supplier_id: supplierId,
              receipt_document_id: docId,
              bank_txn_reference: ch.id,
              provider: "stripe",
              amount_minor: ch.amount_captured ?? ch.amount,
              currency: (ch.currency ?? "usd").toUpperCase(),
              status: ch.status,
              paid_at: ch.created ? new Date(ch.created * 1000).toISOString() : null,
              metadata: { charge_id: ch.id, payment_intent: ch.payment_intent, customer: ch.customer },
            });
          }
          stats.receipts++;
        } catch (e) { stats.errors.push(`charge ${ch.id}: ${(e as Error).message}`); }
      }
      starting_after = list.has_more ? list.data[list.data.length - 1]?.id : undefined;
      pages++;
    } while (starting_after && pages < 20);

    // 3) Payouts (JSON statements — no PDF from Stripe API)
    starting_after = undefined; pages = 0;
    do {
      const params: Record<string, string> = { limit: String(limit), "created[gte]": String(created_gte) };
      if (starting_after) params.starting_after = starting_after;
      const list = await stripeGet("/payouts", params);
      for (const po of list.data as any[]) {
        try {
          await registerDoc({
            source_id: po.id, kind: "payout",
            title: `Stripe Payout ${po.id}`,
            docDate: po.arrival_date ? new Date(po.arrival_date * 1000).toISOString().slice(0, 10) : null,
            number: null,
            amountMinor: po.amount ?? null,
            currency: (po.currency ?? "usd").toUpperCase(),
            pdfBuf: null, jsonPayload: po,
          });
          stats.payouts++;
        } catch (e) { stats.errors.push(`payout ${po.id}: ${(e as Error).message}`); }
      }
      starting_after = list.has_more ? list.data[list.data.length - 1]?.id : undefined;
      pages++;
    } while (starting_after && pages < 20);

    // 4) Subscriptions (active + past_due + canceled)
    stats["subscriptions" as keyof typeof stats] = 0 as any;
    (stats as any).subscriptions = 0;
    starting_after = undefined; pages = 0;
    do {
      const params: Record<string, string> = { limit: String(limit), status: "all" };
      if (starting_after) params.starting_after = starting_after;
      const list = await stripeGet("/subscriptions", params);
      for (const sub of list.data as any[]) {
        try {
          const item = sub.items?.data?.[0];
          const price = item?.price;
          const amountMinor = Number(price?.unit_amount ?? 0) * Number(item?.quantity ?? 1);
          const cadence = (() => {
            const iv = price?.recurring?.interval;
            if (iv === "month") return "monthly";
            if (iv === "year") return "annual";
            if (iv === "week") return "weekly";
            if (iv === "day") return "usage";
            return "monthly";
          })();
          const currency = (price?.currency ?? "usd").toUpperCase();
          const productName = price?.nickname ?? item?.plan?.nickname ?? `Stripe ${sub.id}`;
          await registerDoc({
            source_id: sub.id, kind: "subscription",
            title: `Stripe Subscription ${productName}`,
            docDate: sub.start_date ? new Date(sub.start_date * 1000).toISOString().slice(0, 10) : null,
            number: sub.id,
            amountMinor,
            currency,
            pdfBuf: null, jsonPayload: sub,
          });
          // Upsert into finance_subscriptions
          const { data: existing } = await admin.from("finance_subscriptions")
            .select("id, price_history").eq("supplier_slug", "stripe").eq("product_name", productName).maybeSingle();
          const isActive = ["active", "trialing", "past_due"].includes(sub.status);
          const payload = {
            supplier_slug: "stripe",
            product_name: productName,
            cadence, amount_minor: amountMinor, currency,
            started_at: sub.start_date ? new Date(sub.start_date * 1000).toISOString().slice(0, 10) : null,
            renews_at: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString().slice(0, 10) : null,
            cancelled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString().slice(0, 10) : null,
            is_active: isActive,
            last_seen_at: new Date().toISOString(),
            notes: `Stripe status: ${sub.status}`,
          };
          if (existing) {
            const history = Array.isArray(existing.price_history) ? existing.price_history : [];
            history.push({ at: new Date().toISOString(), amount_minor: amountMinor, status: sub.status });
            await admin.from("finance_subscriptions").update({ ...payload, price_history: history }).eq("id", existing.id);
          } else {
            await admin.from("finance_subscriptions").insert({ ...payload, price_history: [{ at: new Date().toISOString(), amount_minor: amountMinor, status: sub.status }] });
          }
          (stats as any).subscriptions++;
        } catch (e) { stats.errors.push(`subscription ${sub.id}: ${(e as Error).message}`); }
      }
      starting_after = list.has_more ? list.data[list.data.length - 1]?.id : undefined;
      pages++;
    } while (starting_after && pages < 20);

    // 5) Balance transactions summary snapshot
    const balList = await stripeGet("/balance_transactions", { limit: String(limit), "created[gte]": String(created_gte) });
    if (balList.data?.length) {
      const snapshotId = `balance_snapshot_${created_gte}_${Date.now()}`;
      await registerDoc({
        source_id: snapshotId, kind: "balance",
        title: `Stripe Balance Snapshot (${new Date(created_gte * 1000).toISOString().slice(0, 10)} → today)`,
        docDate: new Date().toISOString().slice(0, 10),
        number: null, amountMinor: null, currency: "USD",
        pdfBuf: null, jsonPayload: { count: balList.data.length, transactions: balList.data },
      });
      // Also archive CSV
      const header = "id,created,type,amount,currency,fee,net,description\n";
      const rows = (balList.data as any[]).map(t =>
        [t.id, new Date(t.created * 1000).toISOString(), t.type, t.amount, t.currency, t.fee, t.net,
         JSON.stringify(t.description ?? "")].join(",")
      ).join("\n");
      const csvBuf = new TextEncoder().encode(header + rows).buffer;
      await registerDoc({
        source_id: `${snapshotId}_csv`, kind: "csv_statement",
        title: `Stripe Balance CSV Statement`,
        docDate: new Date().toISOString().slice(0, 10),
        number: null, amountMinor: null, currency: "USD",
        pdfBuf: null, jsonPayload: { rows: balList.data.length }, csvBuf,
      });
      stats.balance_txns = balList.data.length;
    }

    // 6) VAT summaries — upsert quarter aggregates from imported invoices
    (stats as any).vat_periods = 0;
    for (const [, entry] of vatByYearQuarter) {
      const { error: vatErr } = await admin.from("finance_vat_summaries").upsert({
        period_type: "quarter",
        period_year: entry.year,
        period_number: entry.quarter,
        vat_total_minor: entry.vat,
        recoverable_minor: entry.vat,
        non_recoverable_minor: 0,
        currency: entry.currency,
        invoice_count: entry.count,
        details: { source: "stripe_auto_import", invoices: entry.details },
        computed_at: new Date().toISOString(),
      }, { onConflict: "period_type,period_year,period_number" });
      if (!vatErr) (stats as any).vat_periods++;
      else stats.errors.push(`vat ${entry.year}Q${entry.quarter}: ${vatErr.message}`);
    }

    // Refresh supplier rollups
    await admin.rpc("has_role", { _user_id: uid, _role: "admin" }); // no-op to keep client warm
    const { data: rollup } = await admin.from("evidence_documents")
      .select("amount_minor, imported_at").eq("supplier_id", supplierId);
    if (rollup) {
      const total = rollup.reduce((s, r) => s + Number(r.amount_minor ?? 0), 0);
      const dates = rollup.map(r => r.imported_at).filter(Boolean).sort();
      await admin.from("evidence_suppliers").update({
        invoice_count: rollup.length,
        total_paid_minor: total,
        first_invoice_at: dates[0] ?? null,
        latest_invoice_at: dates[dates.length - 1] ?? null,
      }).eq("id", supplierId);
    }

    return new Response(JSON.stringify({ ok: true, stats, supplier_id: supplierId, since_days: sinceDays }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});