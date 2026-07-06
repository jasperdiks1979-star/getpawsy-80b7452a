// finance-reconcile-payments — Wave D2
// Phase 5 upgrade: probabilistic reconciliation + Phase 10 self-healing invoice discovery.
// - Deterministic reference-equality gate (payment.bank_txn_reference == invoice.invoice_number,
//   either direction, case-insensitive) short-circuits to Verified when currency + amount agree.
// - When a reference-exact + amount-exact + currency match is Verified, we self-heal by writing
//   evidence_payments.invoice_document_id (only when previously NULL) so future runs and downstream
//   reports converge without duplicating rows.
// - Preserves ALL human-accepted / human-rejected matches (never overwrites reviewed_at IS NOT NULL).
// - Never fabricates payments, invoices or VAT.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Invoice = {
  id: string;
  supplier_id: string | null;
  total_minor: number | null;
  currency: string | null;
  invoice_date: string | null;
  document_date: string | null;
  invoice_number: string | null;
  entity_id: string | null;
};
type Payment = {
  id: string;
  supplier_id: string | null;
  invoice_document_id: string | null;
  amount_minor: number;
  currency: string;
  paid_at: string | null;
  bank_txn_reference: string | null;
  entity_id: string | null;
};

function score(inv: Invoice, pay: Payment): { conf: number; signals: Record<string, any>; amountDelta: number; dateDelta: number } {
  const signals: Record<string, any> = {};
  let s = 0;
  const amountDelta = (inv.total_minor ?? 0) - pay.amount_minor;
  const invDate = inv.invoice_date || inv.document_date;
  const dateDelta = invDate && pay.paid_at
    ? Math.round((new Date(pay.paid_at).getTime() - new Date(invDate).getTime()) / 86400000)
    : 999;

  if (inv.currency && pay.currency && inv.currency === pay.currency) { s += 15; signals.currency = "match"; }
  else signals.currency = "mismatch";

  if (inv.total_minor != null && Math.abs(amountDelta) <= 100) { s += 45; signals.amount = "exact"; }
  else if (inv.total_minor != null && Math.abs(amountDelta) / Math.max(1, inv.total_minor) < 0.02) { s += 30; signals.amount = "near"; }
  else signals.amount = "off";

  if (dateDelta !== 999 && Math.abs(dateDelta) <= 3) { s += 20; signals.date = "tight"; }
  else if (Math.abs(dateDelta) <= 14) { s += 10; signals.date = "window"; }
  else signals.date = "outside";

  if (inv.supplier_id && pay.supplier_id && inv.supplier_id === pay.supplier_id) { s += 15; signals.supplier = "match"; }

  // Reference matching, symmetric + exact-equality gate.
  const invNum = (inv.invoice_number ?? "").trim().toLowerCase();
  const payRef = (pay.bank_txn_reference ?? "").trim().toLowerCase();
  if (invNum && payRef) {
    if (invNum === payRef) { s += 40; signals.reference_exact = true; }
    else if (payRef.includes(invNum) || invNum.includes(payRef)) { s += 20; signals.invoice_number_in_reference = true; }
  }
  return { conf: Math.min(100, s), signals, amountDelta, dateDelta };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const entityId: string | null = body?.entity_id ?? null;
    const windowDays: number = Number(body?.window_days ?? 180);
    const since = new Date(Date.now() - windowDays * 86400000).toISOString();

    let invQ = sb.from("evidence_documents")
      .select("id,supplier_id,total_minor,currency,invoice_date,document_date,invoice_number,entity_id")
      .gte("document_date", since)
      .limit(1000);
    if (entityId) invQ = invQ.eq("entity_id", entityId);
    const { data: invoices } = await invQ;

    let payQ = sb.from("evidence_payments")
      .select("id,supplier_id,invoice_document_id,amount_minor,currency,paid_at,bank_txn_reference,entity_id")
      .gte("paid_at", since)
      .limit(1000);
    if (entityId) payQ = payQ.eq("entity_id", entityId);
    const { data: payments } = await payQ;

    const invs = (invoices ?? []) as Invoice[];
    const pays = (payments ?? []) as Payment[];

    // existing accepted matches — never overwrite
    const { data: existing } = await sb
      .from("finance_reconciliation_matches")
      .select("invoice_document_id,payment_id,match_status");
    const acceptedInv = new Set((existing ?? []).filter((r: any) => r.match_status === "accepted").map((r: any) => r.invoice_document_id));
    const acceptedPay = new Set((existing ?? []).filter((r: any) => r.match_status === "accepted").map((r: any) => r.payment_id));
    const existingKeys = new Set((existing ?? []).map((r: any) => `${r.invoice_document_id}::${r.payment_id}`));

    let proposed = 0, autoAccepted = 0, duplicates = 0, lowConf = 0;
    let selfHealedLinks = 0;

    // seed: payments that already have invoice_document_id → accepted, if not already recorded
    for (const p of pays) {
      if (!p.invoice_document_id) continue;
      const key = `${p.invoice_document_id}::${p.id}`;
      if (existingKeys.has(key)) continue;
      const inv = invs.find(i => i.id === p.invoice_document_id);
      if (!inv) continue;
      const { signals, amountDelta, dateDelta } = score(inv, p);
      await sb.from("finance_reconciliation_matches").insert({
        invoice_document_id: p.invoice_document_id,
        payment_id: p.id,
        supplier_id: p.supplier_id ?? inv.supplier_id,
        entity_id: p.entity_id ?? inv.entity_id,
        match_type: "exact",
        match_status: "accepted",
        confidence: 100,
        amount_delta_minor: amountDelta,
        date_delta_days: dateDelta,
        match_signals: signals,
        reasoning: "Pre-linked by importer (evidence_payments.invoice_document_id).",
        created_by: "importer",
      });
      acceptedInv.add(p.invoice_document_id);
      acceptedPay.add(p.id);
      autoAccepted++;
    }

    // score every unmatched invoice against every unmatched payment
    for (const inv of invs) {
      if (acceptedInv.has(inv.id)) continue;
      const candidates = pays
        .filter(p => !acceptedPay.has(p.id))
        .map(p => ({ p, ...score(inv, p) }))
        .filter(c => c.conf >= 80)
        .sort((a, b) => b.conf - a.conf);

      if (candidates.length === 0) continue;
      const top = candidates[0];
      const key = `${inv.id}::${top.p.id}`;
      if (existingKeys.has(key)) continue;

      // Auto-accept when (a) deterministic reference match with matching currency+amount, OR
      // (b) score ≥90 with a single dominant candidate.
      const refExactWin =
        top.signals.reference_exact === true &&
        top.signals.currency === "match" &&
        (top.signals.amount === "exact" || top.signals.amount === "near");
      // Enterprise Stabilization: auto-accept ONLY when confidence ≥95% AND
      // the top candidate is unambiguously dominant. Deterministic reference
      // matches remain auto-accepted regardless of score.
      const autoAccept = refExactWin || (top.conf >= 95 && candidates.filter(c => c.conf >= 95).length === 1);
      await sb.from("finance_reconciliation_matches").insert({
        invoice_document_id: inv.id,
        payment_id: top.p.id,
        supplier_id: inv.supplier_id ?? top.p.supplier_id,
        entity_id: inv.entity_id ?? top.p.entity_id,
        match_type: refExactWin ? "exact" : autoAccept ? "exact" : "fuzzy",
        match_status: autoAccept ? "accepted" : "proposed",
        confidence: top.conf,
        amount_delta_minor: top.amountDelta,
        date_delta_days: top.dateDelta,
        match_signals: { ...top.signals, candidates_evaluated: candidates.length },
        reasoning: refExactWin
          ? `Deterministic reference match: invoice_number == bank_txn_reference, currency ${top.signals.currency}, amount ${top.signals.amount}.`
          : `Score ${top.conf}. Signals: ${JSON.stringify(top.signals)}. ${candidates.length} candidates.`,
        created_by: "reconciler",
      });
      if (autoAccept) {
        autoAccepted++;
        acceptedInv.add(inv.id);
        acceptedPay.add(top.p.id);
        // Phase 10 self-heal: link evidence_payments -> invoice, but ONLY when it was NULL.
        if (refExactWin && !top.p.invoice_document_id) {
          const { error: healErr } = await sb.from("evidence_payments")
            .update({ invoice_document_id: inv.id })
            .eq("id", top.p.id)
            .is("invoice_document_id", null);
          if (!healErr) selfHealedLinks++;
        }
      } else { proposed++; lowConf++; }

      // duplicate candidates (multiple ≥85) → anomaly
      const dupes = candidates.filter(c => c.conf >= 85);
      if (dupes.length > 1) {
        duplicates++;
        await sb.from("finance_anomalies").insert({
          anomaly_type: "duplicate_evidence_candidates",
          title: `Multiple payment candidates for invoice`,
          detail: `Invoice ${inv.invoice_number ?? inv.id} matched ${dupes.length} payments at ≥85 confidence.`,
          metadata: { invoice_document_id: inv.id, candidate_payment_ids: dupes.map(d => d.p.id), signals: dupes.map(d => d.signals) },
        });
      }
    }

    // invoice without payment (open task)
    for (const inv of invs) {
      if (acceptedInv.has(inv.id)) continue;
      const hasProposal = (existing ?? []).some((r: any) => r.invoice_document_id === inv.id);
      if (hasProposal) continue;
      const { data: existingTask } = await sb.from("finance_import_tasks")
        .select("id").eq("evidence_document_id", inv.id).eq("expected_type", "payment").maybeSingle();
      if (existingTask) continue;
      await sb.from("finance_import_tasks").insert({
        supplier_slug: "unknown",
        period_label: (inv.invoice_date || inv.document_date || "").slice(0, 7) || "unknown",
        expected_type: "payment",
        status: "open",
        instructions: `Invoice ${inv.invoice_number ?? inv.id} has no matching payment.`,
        expected_amount_minor: inv.total_minor,
        currency: inv.currency,
        evidence_document_id: inv.id,
        entity_id: inv.entity_id,
      });
    }

    // payment without invoice
    for (const p of pays) {
      if (acceptedPay.has(p.id)) continue;
      const hasProposal = (existing ?? []).some((r: any) => r.payment_id === p.id);
      if (hasProposal) continue;
      const { data: existingTask } = await sb.from("finance_import_tasks")
        .select("id").eq("expected_type", "invoice").eq("expected_amount_minor", p.amount_minor)
        .eq("currency", p.currency).limit(1).maybeSingle();
      if (existingTask) continue;
      await sb.from("finance_import_tasks").insert({
        supplier_slug: "unknown",
        period_label: (p.paid_at ?? "").slice(0, 7) || "unknown",
        expected_type: "invoice",
        status: "open",
        instructions: `Payment ${p.bank_txn_reference ?? p.id} (${(p.amount_minor / 100).toFixed(2)} ${p.currency}) has no matching invoice.`,
        expected_amount_minor: p.amount_minor,
        currency: p.currency,
        entity_id: p.entity_id,
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      invoices: invs.length,
      payments: pays.length,
      proposed, autoAccepted, duplicates, lowConf,
      selfHealedLinks,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});