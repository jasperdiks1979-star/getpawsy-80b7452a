// finance-supplier-learn — Wave D2
// Recomputes supplier profile 2.0 from historical evidence_documents + finance_supplier_memory.
// Additive: only fills expected_* fields when NULL, or updates learned aggregates (avg, yoy, counts).
// Never overwrites values a human corrected (source='human' rules in supplier_memory always win).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Doc = {
  id: string;
  supplier_id: string | null;
  currency: string | null;
  vat_pct: number | null;
  total_minor: number | null;
  bookkeeping_category: string | null;
  country: string | null;
  invoice_date: string | null;
  document_date: string | null;
};

function mode<T>(arr: T[]): T | null {
  const counts = new Map<T, number>();
  for (const v of arr) if (v != null) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | null = null;
  let bestN = 0;
  for (const [k, n] of counts) if (n > bestN) { best = k; bestN = n; }
  return best;
}

function detectCycle(dates: Date[]): { cycle: string | null; confidence: number } {
  if (dates.length < 3) return { cycle: null, confidence: 0 };
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push((sorted[i].getTime() - sorted[i - 1].getTime()) / 86400000);
  }
  const avg = gaps.reduce((s, x) => s + x, 0) / gaps.length;
  if (avg >= 25 && avg <= 35) return { cycle: "monthly", confidence: 0.9 };
  if (avg >= 85 && avg <= 100) return { cycle: "quarterly", confidence: 0.85 };
  if (avg >= 350 && avg <= 380) return { cycle: "annual", confidence: 0.9 };
  if (avg >= 6 && avg <= 8) return { cycle: "weekly", confidence: 0.8 };
  return { cycle: null, confidence: 0.4 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const onlySupplier: string | null = body?.supplier_id ?? null;

    const supQ = sb.from("evidence_suppliers").select("id,slug,name,expected_vat_pct,expected_currency,expected_cycle,expected_bookkeeping_category,expected_layout,learned_patterns");
    if (onlySupplier) supQ.eq("id", onlySupplier);
    const { data: suppliers, error: supErr } = await supQ;
    if (supErr) throw supErr;

    let processed = 0;
    for (const s of (suppliers ?? []) as any[]) {
      const { data: docs } = await sb
        .from("evidence_documents")
        .select("id,supplier_id,currency,vat_pct,total_minor,bookkeeping_category,country,invoice_date,document_date")
        .eq("supplier_id", s.id)
        .order("document_date", { ascending: false })
        .limit(60);
      const rows = (docs ?? []) as Doc[];
      if (rows.length === 0) continue;

      const vatMode = mode(rows.map(r => r.vat_pct != null ? Number(r.vat_pct) : null).filter(x => x != null) as number[]);
      const curMode = mode(rows.map(r => r.currency).filter(Boolean) as string[]);
      const catMode = mode(rows.map(r => r.bookkeeping_category).filter(Boolean) as string[]);
      const totals = rows.map(r => r.total_minor).filter((x): x is number => x != null && x > 0);
      const avg = totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : null;

      const now = new Date();
      const yoyCut = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      const yoy = rows.filter(r => {
        const d = r.invoice_date || r.document_date;
        return d && new Date(d) >= yoyCut;
      }).reduce((s, r) => s + (r.total_minor ?? 0), 0);

      const dates = rows.map(r => r.invoice_date || r.document_date).filter(Boolean).map(d => new Date(d!));
      const { cycle, confidence } = detectCycle(dates);

      // human-corrected memory wins
      const { data: mem } = await sb.from("finance_supplier_memory").select("rule_key,rule_value,source").eq("supplier_id", s.id);
      const humanRules = new Map<string, any>();
      for (const m of (mem ?? []) as any[]) {
        if (m.source === "human") humanRules.set(m.rule_key, m.rule_value);
      }

      const patch: Record<string, any> = {
        avg_invoice_minor: avg,
        yoy_spend_minor: yoy,
        learned_patterns: {
          samples: rows.length,
          computed_at: new Date().toISOString(),
          cycle_confidence: confidence,
        },
        profile_last_computed_at: new Date().toISOString(),
        confidence_score: Math.min(100, Math.round((rows.length / 12) * 100)),
      };
      if (s.expected_vat_pct == null && vatMode != null && !humanRules.has("expected_vat_pct")) patch.expected_vat_pct = vatMode;
      if (!s.expected_currency && curMode && !humanRules.has("expected_currency")) patch.expected_currency = curMode;
      if (!s.expected_bookkeeping_category && catMode && !humanRules.has("expected_bookkeeping_category")) patch.expected_bookkeeping_category = catMode;
      if (!s.expected_cycle && cycle && !humanRules.has("expected_cycle")) patch.expected_cycle = cycle;

      // apply human overrides
      for (const [k, v] of humanRules) patch[k] = v;

      await sb.from("evidence_suppliers").update(patch).eq("id", s.id);
      processed++;
    }

    return new Response(JSON.stringify({ ok: true, processed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});