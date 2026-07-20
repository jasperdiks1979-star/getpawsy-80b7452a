// finance-connector-health — Phase 1 (Autonomous Connector Ecosystem)
// Reads existing tables ONLY. Never fabricates invoices/payments/VAT.
// Produces per-connector: last invoice observed, expected next invoice window,
// missing-invoice PREDICTIONS (always labelled Estimated), and a health verdict.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Connector = {
  supplier_slug: string;
  display_name: string;
  connection_method: string;
  status: string;
  health_score: number;
  last_sync_at: string | null;
  next_sync_at: string | null;
  sync_frequency: string | null;
  is_active: boolean;
};

const FREQ_DAYS: Record<string, number> = {
  daily: 1, weekly: 7, biweekly: 14, monthly: 30, quarterly: 91, annual: 365, yearly: 365,
};

function daysBetween(a: Date, b: Date) { return Math.round((b.getTime() - a.getTime()) / 86400000); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const __gate = await requireInternalOrAdmin(req);
  if (__gate) return __gate;
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    const { data: connectors } = await sb
      .from("finance_connectors")
      .select("supplier_slug,display_name,connection_method,status,health_score,last_sync_at,next_sync_at,sync_frequency,is_active")
      .eq("is_active", true)
      .order("display_name");

    const { data: suppliers } = await sb
      .from("evidence_suppliers")
      .select("id,slug,name,latest_invoice_at,invoice_count,expected_cycle,avg_invoice_minor,currency");

    const supplierBySlug = new Map<string, any>();
    for (const s of suppliers ?? []) supplierBySlug.set(String(s.slug).toLowerCase(), s);

    // last invoice observed per supplier from evidence_documents
    const supplierIds = (suppliers ?? []).map((s) => s.id);
    const { data: docAgg } = supplierIds.length
      ? await sb
          .from("evidence_documents")
          .select("supplier_id,document_date,invoice_date")
          .in("supplier_id", supplierIds)
          .order("document_date", { ascending: false })
      : { data: [] as any[] } as any;

    const lastByS = new Map<string, string>();
    for (const d of docAgg ?? []) {
      const key = d.supplier_id as string;
      const dt = (d.invoice_date || d.document_date) as string | null;
      if (!dt || !key) continue;
      if (!lastByS.has(key) || (lastByS.get(key)! < dt)) lastByS.set(key, dt);
    }

    const now = new Date();
    const rows = (connectors ?? []).map((c: Connector) => {
      const sup = supplierBySlug.get(c.supplier_slug.toLowerCase());
      const cadenceDays = FREQ_DAYS[String(c.sync_frequency ?? sup?.expected_cycle ?? "").toLowerCase()] ?? null;

      const lastInvoiceIso = sup?.id ? lastByS.get(sup.id) ?? sup?.latest_invoice_at ?? null : null;
      const lastInvoice = lastInvoiceIso ? new Date(lastInvoiceIso) : null;

      let expectedNext: Date | null = null;
      let overdueDays: number | null = null;
      let missingInvoicesPredicted = 0;
      if (cadenceDays && lastInvoice) {
        expectedNext = new Date(lastInvoice.getTime() + cadenceDays * 86400000);
        overdueDays = Math.max(0, daysBetween(expectedNext, now));
        if (overdueDays > 0) {
          missingInvoicesPredicted = Math.max(1, Math.floor(overdueDays / cadenceDays) + (overdueDays % cadenceDays > 3 ? 1 : 0));
          missingInvoicesPredicted = Math.min(missingInvoicesPredicted, 12); // never runaway
        }
      }

      // Health verdict — deterministic, explainable, evidence-only.
      let verdict: "Healthy" | "Overdue" | "Silent" | "Unconfigured" | "Error";
      const reasons: string[] = [];
      if (c.status === "error") { verdict = "Error"; reasons.push("Connector reports error status."); }
      else if (c.status === "not_configured" && !lastInvoice) { verdict = "Unconfigured"; reasons.push("Not connected and no evidence uploaded yet."); }
      else if (!lastInvoice) { verdict = "Silent"; reasons.push("No invoice ever observed for this supplier."); }
      else if (cadenceDays && overdueDays && overdueDays > Math.max(3, Math.round(cadenceDays * 0.15))) {
        verdict = "Overdue";
        reasons.push(`Last invoice ${daysBetween(lastInvoice, now)}d ago, cadence ${cadenceDays}d.`);
      } else {
        verdict = "Healthy";
        reasons.push(cadenceDays ? `On cadence (${cadenceDays}d).` : `Last invoice ${daysBetween(lastInvoice, now)}d ago.`);
      }

      return {
        supplier_slug: c.supplier_slug,
        display_name: c.display_name,
        connection_method: c.connection_method,
        status: c.status,
        is_active: c.is_active,
        cadence_days: cadenceDays,
        last_invoice_at: lastInvoiceIso,
        expected_next_invoice_at: expectedNext ? expectedNext.toISOString() : null,
        overdue_days: overdueDays,
        // ALWAYS labelled as prediction — never inserted as real invoices.
        missing_invoices_predicted: missingInvoicesPredicted,
        prediction_label: "Estimated" as const,
        verdict,
        reasons,
        supplier_id: sup?.id ?? null,
        invoice_count: sup?.invoice_count ?? 0,
        avg_invoice_minor: sup?.avg_invoice_minor ?? null,
        currency: sup?.currency ?? null,
      };
    });

    const summary = {
      total: rows.length,
      healthy: rows.filter((r) => r.verdict === "Healthy").length,
      overdue: rows.filter((r) => r.verdict === "Overdue").length,
      silent: rows.filter((r) => r.verdict === "Silent").length,
      unconfigured: rows.filter((r) => r.verdict === "Unconfigured").length,
      errored: rows.filter((r) => r.verdict === "Error").length,
      total_predicted_missing_invoices: rows.reduce((s, r) => s + r.missing_invoices_predicted, 0),
    };

    return new Response(JSON.stringify({ ok: true, summary, connectors: rows, computed_at: now.toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});