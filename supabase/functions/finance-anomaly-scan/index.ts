import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

type Doc = {
  id: string; supplier_id: string | null; supplier_name: string | null;
  invoice_number: string | null; document_date: string | null;
  amount_minor: number | null; vat_minor: number | null; currency: string | null;
  tax_country: string | null; sha256: string | null; document_type: string | null;
  title: string | null;
};

type Finding = {
  anomaly_type: string; title: string; detail: string;
  supplier_slug?: string | null; z_score?: number | null;
  observed_minor?: number | null; expected_minor?: number | null;
  currency?: string | null; evidence_document_ids: string[];
  metadata: Record<string, unknown>;
};

function stddev(nums: number[]) {
  if (nums.length < 2) return 0;
  const m = nums.reduce((a,b)=>a+b,0)/nums.length;
  const v = nums.reduce((a,b)=>a+(b-m)**2,0)/(nums.length-1);
  return { mean: m, sd: Math.sqrt(v) };
}

async function detectDuplicates(docs: Doc[]): Promise<Finding[]> {
  const out: Finding[] = [];
  // 1. Same SHA-256 across multiple docs
  const bySha = new Map<string, Doc[]>();
  for (const d of docs) {
    if (!d.sha256) continue;
    (bySha.get(d.sha256) ?? bySha.set(d.sha256, []).get(d.sha256)!).push(d);
  }
  for (const [sha, group] of bySha) {
    if (group.length > 1) {
      out.push({
        anomaly_type: 'duplicate_sha256',
        title: `Duplicate file detected (${group.length} copies)`,
        detail: `Same SHA-256 hash (${sha.slice(0,12)}…) appears on ${group.length} documents. Consider marking duplicates.`,
        supplier_slug: group[0].supplier_name,
        evidence_document_ids: group.map(g => g.id),
        metadata: { sha256: sha, docs: group.map(g => ({ id: g.id, title: g.title, date: g.document_date })) },
      });
    }
  }
  // 2. Same supplier + invoice_number
  const byInv = new Map<string, Doc[]>();
  for (const d of docs) {
    if (!d.invoice_number || !d.supplier_id) continue;
    const k = `${d.supplier_id}::${d.invoice_number.trim().toLowerCase()}`;
    (byInv.get(k) ?? byInv.set(k, []).get(k)!).push(d);
  }
  for (const [k, group] of byInv) {
    if (group.length > 1) {
      out.push({
        anomaly_type: 'duplicate_invoice_number',
        title: `Duplicate invoice #${group[0].invoice_number}`,
        detail: `Invoice number "${group[0].invoice_number}" from ${group[0].supplier_name ?? 'supplier'} appears ${group.length}×. Possible double booking.`,
        supplier_slug: group[0].supplier_name,
        evidence_document_ids: group.map(g => g.id),
        metadata: { key: k, docs: group.map(g => ({ id: g.id, amount_minor: g.amount_minor })) },
      });
    }
  }
  return out;
}

async function detectMissingInvoices(): Promise<Finding[]> {
  const out: Finding[] = [];
  const { data: payments } = await supabase
    .from('evidence_payments')
    .select('id, supplier_id, invoice_document_id, receipt_document_id, amount_minor, currency, paid_at, provider, bank_txn_reference, metadata')
    .is('invoice_document_id', null)
    .gte('amount_minor', 500) // ≥ €5
    .order('paid_at', { ascending: false })
    .limit(500);
  for (const p of payments ?? []) {
    out.push({
      anomaly_type: 'missing_invoice',
      title: `Payment without invoice (${((p.amount_minor ?? 0)/100).toFixed(2)} ${p.currency ?? ''})`,
      detail: `Payment ${p.bank_txn_reference ?? p.id.slice(0,8)} via ${p.provider ?? 'unknown'} on ${p.paid_at?.slice(0,10) ?? 'unknown date'} has no matching invoice document. Belastingdienst requires invoices for VAT deduction.`,
      observed_minor: p.amount_minor,
      currency: p.currency,
      evidence_document_ids: [p.receipt_document_id].filter(Boolean) as string[],
      metadata: { payment_id: p.id, provider: p.provider, reference: p.bank_txn_reference },
    });
  }
  return out;
}

function detectIncorrectVat(docs: Doc[]): Finding[] {
  const out: Finding[] = [];
  for (const d of docs) {
    if (!d.amount_minor || d.amount_minor < 100) continue;
    if (d.document_type !== 'invoice' && d.document_type !== 'receipt') continue;

    // Documents with amount but no VAT at all (only flag NL/EU)
    if ((d.vat_minor == null || d.vat_minor === 0) && (d.tax_country === 'NL' || d.tax_country === null)) {
      out.push({
        anomaly_type: 'missing_vat',
        title: `Missing VAT on ${d.document_type} (${((d.amount_minor)/100).toFixed(2)} ${d.currency ?? ''})`,
        detail: `${d.supplier_name ?? 'Supplier'} ${d.document_type} dated ${d.document_date ?? 'n/a'} has amount but no VAT recorded. Check if reverse-charge or exempt.`,
        supplier_slug: d.supplier_name,
        observed_minor: 0, expected_minor: Math.round(d.amount_minor * 0.21 / 1.21),
        currency: d.currency,
        evidence_document_ids: [d.id],
        metadata: { doc_id: d.id, doc_type: d.document_type },
      });
      continue;
    }
    if (d.vat_minor == null || d.vat_minor <= 0) continue;

    // Ratio check vs standard NL rates 21%, 9%, 0%
    const net = d.amount_minor - d.vat_minor;
    if (net <= 0) continue;
    const ratio = d.vat_minor / net;
    const rates = [0.21, 0.09];
    const nearest = rates.reduce((a,b) => Math.abs(b - ratio) < Math.abs(a - ratio) ? b : a);
    const drift = Math.abs(nearest - ratio);
    if (drift > 0.015) {
      const expected = Math.round(net * nearest);
      out.push({
        anomaly_type: 'incorrect_vat',
        title: `Unusual VAT rate ${(ratio*100).toFixed(1)}%`,
        detail: `${d.supplier_name ?? 'Supplier'} ${d.document_type} (${d.document_date ?? 'n/a'}) shows VAT ${((d.vat_minor)/100).toFixed(2)} on net ${((net)/100).toFixed(2)} ${d.currency ?? ''} = ${(ratio*100).toFixed(1)}%. Nearest NL rate is ${(nearest*100).toFixed(0)}%. Expected ${(expected/100).toFixed(2)}.`,
        supplier_slug: d.supplier_name,
        observed_minor: d.vat_minor, expected_minor: expected,
        currency: d.currency,
        evidence_document_ids: [d.id],
        metadata: { doc_id: d.id, ratio, nearest_rate: nearest, drift },
      });
    }
  }
  return out;
}

async function detectSuspiciousPayments(): Promise<Finding[]> {
  const out: Finding[] = [];
  const { data: payments } = await supabase
    .from('evidence_payments')
    .select('id, supplier_id, amount_minor, currency, paid_at, provider, invoice_document_id, receipt_document_id')
    .not('supplier_id', 'is', null)
    .gt('amount_minor', 0)
    .order('paid_at', { ascending: false })
    .limit(2000);

  const bySup = new Map<string, typeof payments>();
  for (const p of payments ?? []) {
    const k = p.supplier_id!;
    (bySup.get(k) ?? bySup.set(k, [] as any).get(k)!).push(p);
  }
  for (const [sup, pays] of bySup) {
    if (!pays || pays.length < 4) continue;
    const amounts = pays.map(p => Number(p.amount_minor));
    const stat = stddev(amounts);
    if (typeof stat === 'number' || stat.sd === 0) continue;
    for (const p of pays) {
      const z = (Number(p.amount_minor) - stat.mean) / stat.sd;
      if (z >= 3 && Number(p.amount_minor) > stat.mean * 1.5) {
        out.push({
          anomaly_type: 'suspicious_payment',
          title: `Outlier payment ${((p.amount_minor)/100).toFixed(2)} ${p.currency ?? ''} (z=${z.toFixed(2)})`,
          detail: `Payment on ${p.paid_at?.slice(0,10)} to supplier ${sup.slice(0,8)} is ${z.toFixed(1)}σ above their normal spend (avg ${((stat.mean)/100).toFixed(2)}). Verify legitimacy.`,
          supplier_slug: sup,
          z_score: Number(z.toFixed(3)),
          observed_minor: Number(p.amount_minor),
          expected_minor: Math.round(stat.mean),
          currency: p.currency,
          evidence_document_ids: [p.invoice_document_id, p.receipt_document_id].filter(Boolean) as string[],
          metadata: { payment_id: p.id, provider: p.provider, mean: stat.mean, sd: stat.sd },
        });
      }
    }
  }
  return out;
}

function fingerprint(f: Finding): string {
  const ids = [...f.evidence_document_ids].sort().join(',');
  return `${f.anomaly_type}::${ids}::${f.observed_minor ?? ''}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const __gate = await requireInternalOrAdmin(req);
  if (__gate) return __gate;
  try {
    const { data: docs, error: docErr } = await supabase
      .from('evidence_documents')
      .select('id, supplier_id, supplier_name, invoice_number, document_date, amount_minor, vat_minor, currency, tax_country, sha256, document_type, title')
      .order('document_date', { ascending: false })
      .limit(5000);
    if (docErr) throw docErr;

    const findings: Finding[] = [];
    findings.push(...await detectDuplicates(docs as Doc[]));
    findings.push(...detectIncorrectVat(docs as Doc[]));
    findings.push(...await detectMissingInvoices());
    findings.push(...await detectSuspiciousPayments());

    // Load existing open findings to dedupe
    const { data: existing } = await supabase
      .from('finance_anomalies')
      .select('id, anomaly_type, metadata, observed_minor')
      .in('status', ['open', 'ack'])
      .limit(5000);
    const seen = new Set<string>();
    for (const e of existing ?? []) {
      const ids = ((e.metadata as any)?.evidence_document_ids ?? []) as string[];
      seen.add(`${e.anomaly_type}::${[...ids].sort().join(',')}::${e.observed_minor ?? ''}`);
    }

    const fresh = findings.filter(f => !seen.has(fingerprint(f)));
    let inserted = 0;
    if (fresh.length) {
      const rows = fresh.map(f => ({
        anomaly_type: f.anomaly_type,
        title: f.title,
        detail: f.detail,
        supplier_slug: f.supplier_slug ?? null,
        z_score: f.z_score ?? null,
        observed_minor: f.observed_minor ?? null,
        expected_minor: f.expected_minor ?? null,
        currency: f.currency ?? null,
        status: 'open',
        metadata: { ...f.metadata, evidence_document_ids: f.evidence_document_ids },
      }));
      const { data: ins, error: insErr } = await supabase
        .from('finance_anomalies').insert(rows).select('id, anomaly_type, title, detail, metadata');
      if (insErr) throw insErr;
      inserted = ins?.length ?? 0;

      // Index into finance_search_index so CFO chat can retrieve
      if (ins?.length) {
        const idxRows = ins.map((r: any) => ({
          entity_type: 'anomaly',
          entity_id: r.id,
          title: r.title,
          body: `${r.detail}\nType: ${r.anomaly_type}\nEvidence: ${((r.metadata?.evidence_document_ids ?? []) as string[]).join(', ')}`,
          metadata: r.metadata,
          updated_at: new Date().toISOString(),
        }));
        await supabase.from('finance_search_index').upsert(idxRows, { onConflict: 'entity_type,entity_id' });
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      scanned_documents: docs?.length ?? 0,
      candidates: findings.length,
      inserted,
      skipped_existing: findings.length - fresh.length,
      by_type: findings.reduce((acc: Record<string, number>, f) => {
        acc[f.anomaly_type] = (acc[f.anomaly_type] ?? 0) + 1; return acc;
      }, {}),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});