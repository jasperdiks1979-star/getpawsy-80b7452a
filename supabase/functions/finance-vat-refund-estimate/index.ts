import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

type PeriodEst = {
  label: string;
  year: number;
  quarter: number | null;
  recoverable_minor: number;
  potential_minor: number;
  missing_evidence_impact_minor: number;
  confidence: number;
  assumptions: string[];
  calculation: string;
  status: "Verified" | "Estimated" | "Needs Review" | "Missing Evidence";
};

async function collect(year: number, quarter: number | null, entity_id: string | null): Promise<PeriodEst> {
  let q = supa.from("finance_vat_classifications")
    .select("recoverable_minor,vat_minor,confidence,document_id")
    .eq("fiscal_year", year);
  if (quarter) q = q.eq("quarter", quarter);
  if (entity_id) q = q.eq("entity_id", entity_id);
  const { data } = await q;
  const rows = data ?? [];
  const recoverable = rows.reduce((s, r) => s + Number(r.recoverable_minor || 0), 0);
  const potential = rows.reduce((s, r) => s + Number(r.vat_minor || 0), 0);
  const avgConf = rows.length ? rows.reduce((s, r) => s + Number(r.confidence || 0), 0) / rows.length : 0;
  const lowConf = rows.filter(r => Number(r.confidence || 0) < 0.7).length;
  const missImpact = rows.filter(r => Number(r.confidence || 0) < 0.7)
    .reduce((s, r) => s + Number(r.recoverable_minor || 0), 0);

  const status = rows.length === 0 ? "Missing Evidence"
    : avgConf >= 0.9 && lowConf === 0 ? "Verified"
    : avgConf >= 0.75 ? "Estimated"
    : "Needs Review";

  return {
    label: quarter ? `${year} Q${quarter}` : `${year} FY`,
    year, quarter,
    recoverable_minor: recoverable,
    potential_minor: potential,
    missing_evidence_impact_minor: missImpact,
    confidence: Number(avgConf.toFixed(2)),
    assumptions: [
      "Only classified documents are counted",
      "Recoverable VAT is based on Dutch VAT rules and reverse-charge/import flags",
      "Documents with confidence < 0.7 are considered Needs Review",
    ],
    calculation: `Σ recoverable_minor over ${rows.length} classified documents`,
    status,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({} as any));
    const entity_id: string | null = body.entity_id || null;
    const now = new Date();
    const year = now.getUTCFullYear();
    const q = Math.floor(now.getUTCMonth() / 3) + 1;
    const prevQ = q === 1 ? 4 : q - 1;
    const prevQY = q === 1 ? year - 1 : year;

    const [current, previous, ytd] = await Promise.all([
      collect(year, q, entity_id),
      collect(prevQY, prevQ, entity_id),
      collect(year, null, entity_id),
    ]);

    // projection: YTD * (4/qCompleted)
    const qsElapsed = q; // includes current partial
    const projectionMultiplier = qsElapsed > 0 ? 4 / qsElapsed : 1;
    const projection: PeriodEst = {
      ...ytd,
      label: `${year} FY projection`,
      recoverable_minor: Math.round(ytd.recoverable_minor * projectionMultiplier),
      potential_minor: Math.round(ytd.potential_minor * projectionMultiplier),
      missing_evidence_impact_minor: Math.round(ytd.missing_evidence_impact_minor * projectionMultiplier),
      status: ytd.status === "Verified" ? "Estimated" : ytd.status,
      assumptions: [...ytd.assumptions, `Linear projection: YTD × (4/${qsElapsed})`],
      calculation: `YTD recoverable × (4/${qsElapsed})`,
    };

    return new Response(JSON.stringify({ ok: true, current, previous, ytd, projection,
      disclaimer: "Estimates only. Do not file returns without accountant review." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});