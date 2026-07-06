import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type ExportType =
  | "excel" | "csv" | "pdf" | "json"
  | "audit_package" | "vat_quarter" | "missing_evidence";

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const esc = (v: unknown) => {
    if (v == null) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    console.log("[accountant-export] hit", req.headers.get("x-internal-secret") ? "internal-secret-present" : "no-internal-secret");
    const body = await req.json().catch(() => ({}));
    const dryRun: boolean = body?.dry_run === true;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // Internal certification path: dry_run + valid internal secret (service role
    // key sent via x-internal-secret) bypasses the interactive admin guard but
    // never writes a job, never emits a payload, and never returns file bytes.
    const internalSecret = req.headers.get("x-internal-secret") ?? "";
    const isInternalCert = dryRun && internalSecret && internalSecret === SERVICE_KEY;

    let user: { id: string; email?: string | null } | null = null;
    if (!isInternalCert) {
      const authHeader = req.headers.get("Authorization") ?? "";
      const token = authHeader.replace(/^Bearer\s+/i, "");
      if (!token) return new Response(JSON.stringify({ error: "no auth" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { data: userData } = await admin.auth.getUser(token);
      user = userData?.user ?? null;
      if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { data: access } = await admin.rpc("has_finance_access", { _user_id: user.id });
      if (!access) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const exportType: ExportType = body.export_type ?? "audit_package";
    const entityId: string | null = body.entity_id ?? null;
    const year: number | null = body.period_year ?? null;
    const quarter: number | null = body.period_quarter ?? null;

    // Register job (skipped in internal dry-run to avoid noise in finance_export_jobs)
    let jobId: string | null = null;
    if (!isInternalCert) {
      const { data: job } = await admin.from("finance_export_jobs").insert({
        export_type: exportType, entity_id: entityId, period_year: year, period_quarter: quarter,
        status: "running", requested_by: user!.id,
      }).select().single();
      jobId = (job?.id as string) ?? null;
    }

    // Load canonical bundle used by every export
    const filterEntity = (q: any) => (entityId ? q.eq("entity_id", entityId) : q);
    const [docs, pays, vats, matches, suppliers, subs, tasks] = await Promise.all([
      filterEntity(admin.from("evidence_documents").select("id,legal_name,vat_number,invoice_number,invoice_date,due_date,payment_date,currency,subtotal_minor,vat_minor,vat_pct,total_minor,recoverable_vat_minor,bookkeeping_category,bookkeeping_readiness,validation_state,ocr_confidence,extraction_confidence,storage_path,supplier_id,entity_id").limit(5000)),
      filterEntity(admin.from("evidence_payments").select("*").limit(5000)),
      admin.from("finance_vat_classifications").select("*").limit(5000),
      admin.from("finance_reconciliation_matches").select("*").limit(5000),
      filterEntity(admin.from("evidence_suppliers").select("id,legal_name,vat_number,kvk,expected_vat_pct,expected_cycle,avg_invoice_minor,risk_score,confidence,entity_id").limit(2000)),
      filterEntity(admin.from("finance_subscriptions").select("*").limit(2000)),
      admin.from("finance_import_tasks").select("id,task_type,status,description,supplier_id,document_id,created_at").eq("status", "open").limit(2000),
    ]);

    const bundle = {
      generated_at: new Date().toISOString(),
      generated_by: isInternalCert ? "internal:finance-production-certify" : (user!.email ?? user!.id),
      export_type: exportType,
      scope: { entity_id: entityId, period_year: year, period_quarter: quarter },
      assumptions: [
        "Numeric amounts in minor units (cents) unless suffixed.",
        "Recoverable VAT is an ESTIMATE unless invoice_quality.correct_totals and vat_consistency both pass.",
        "Reconciliation matches with confidence < 0.7 need human review.",
        "This export never files a tax return.",
      ],
      confidence_labels: {
        verified: "extraction_confidence >= 0.9 AND payment_linked",
        needs_review: "0.6 <= extraction_confidence < 0.9",
        estimated: "extraction_confidence < 0.6",
        missing_evidence: "documented in open finance tasks",
      },
      invoices: docs.data ?? [],
      payments: pays.data ?? [],
      vat_classifications: vats.data ?? [],
      reconciliation_matches: matches.data ?? [],
      supplier_profiles: suppliers.data ?? [],
      subscriptions: subs.data ?? [],
      open_finance_tasks: tasks.data ?? [],
    };

    let payload: unknown = bundle;
    let mime = "application/json";
    let filename = `finance_export_${exportType}_${Date.now()}.json`;
    let contentText: string | null = null;

    if (exportType === "csv" || exportType === "excel") {
      // CSV bundle (Excel-compatible)
      const parts: string[] = [];
      const sections: Array<[string, unknown[]]> = [
        ["invoices", bundle.invoices],
        ["payments", bundle.payments],
        ["vat_classifications", bundle.vat_classifications],
        ["reconciliation_matches", bundle.reconciliation_matches],
        ["supplier_profiles", bundle.supplier_profiles],
        ["subscriptions", bundle.subscriptions],
        ["open_finance_tasks", bundle.open_finance_tasks],
      ];
      for (const [name, rows] of sections) {
        parts.push(`### ${name}`);
        parts.push(toCsv(rows as Record<string, unknown>[]));
        parts.push("");
      }
      contentText = parts.join("\n");
      mime = "text/csv";
      filename = filename.replace(/\.json$/, ".csv");
      payload = { csv: contentText };
    } else if (exportType === "pdf") {
      // Lightweight text-based "PDF" summary (real PDF gen kept out of hot path)
      contentText = `Accountant Summary\nGenerated: ${bundle.generated_at}\nInvoices: ${bundle.invoices.length}\nPayments: ${bundle.payments.length}\nOpen tasks: ${bundle.open_finance_tasks.length}\nRecoverable VAT rows: ${bundle.vat_classifications.length}`;
      mime = "text/plain";
      filename = filename.replace(/\.json$/, ".txt");
      payload = { summary: contentText };
    } else if (exportType === "vat_quarter") {
      const q = quarter ?? (Math.floor(new Date().getMonth() / 3) + 1);
      const y = year ?? new Date().getFullYear();
      const inQuarter = (d?: string | null) => {
        if (!d) return false;
        const dt = new Date(d);
        return dt.getFullYear() === y && Math.floor(dt.getMonth() / 3) + 1 === q;
      };
      const scoped = {
        ...bundle,
        invoices: bundle.invoices.filter((r: any) => inQuarter(r.invoice_date)),
        payments: bundle.payments.filter((r: any) => inQuarter(r.paid_at ?? r.txn_date)),
      };
      payload = scoped;
    } else if (exportType === "missing_evidence") {
      payload = { open_finance_tasks: bundle.open_finance_tasks, assumptions: bundle.assumptions };
    } // else audit_package / json use full bundle

    const row_counts = {
      invoices: bundle.invoices.length,
      payments: bundle.payments.length,
      vat: bundle.vat_classifications.length,
      matches: bundle.reconciliation_matches.length,
      suppliers: bundle.supplier_profiles.length,
      subscriptions: bundle.subscriptions.length,
      open_tasks: bundle.open_finance_tasks.length,
    };
    if (jobId) {
      await admin.from("finance_export_jobs").update({
        status: "success", payload: payload as any, row_counts, completed_at: new Date().toISOString(),
      }).eq("id", jobId);
    }

    if (isInternalCert) {
      // Internal certification: return only metadata, never the payload.
      return new Response(JSON.stringify({
        ok: true, dry_run: true, filename, mime, row_counts,
        file_count: 1, period: { year, quarter },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: true, job_id: jobId, filename, mime, row_counts, payload }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[finance-accountant-export]", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});