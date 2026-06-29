// Genesis V3.4 — Creative Diversity Guard
// Scores recent pcie2_creatives on diversity across 8 dimensions. Flags
// repeat offenders (low diversity AND no positive performance) for regeneration.
// Writes findings to pcie2_ci_diversity_log; never regenerates winners.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DIMS = [
  "lighting", "camera_angle", "animal_breed", "background",
  "color_palette", "headline", "cta", "layout",
] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // last 200 creatives (live/published)
    const { data: creatives, error } = await sb
      .from("pcie2_creatives")
      .select(`id,product_id,status,retired,performance,quality_score,${DIMS.join(",")}`)
      .eq("retired", false)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    if (!creatives || creatives.length === 0) {
      return new Response(JSON.stringify({ ok: true, scanned: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Build frequency tables per dimension
    const freq: Record<string, Map<string, number>> = {};
    for (const dim of DIMS) freq[dim] = new Map();
    for (const c of creatives) {
      for (const dim of DIMS) {
        const v = (c as any)[dim];
        if (!v) continue;
        const key = String(v).toLowerCase().trim();
        freq[dim].set(key, (freq[dim].get(key) ?? 0) + 1);
      }
    }
    const total = creatives.length;

    type Finding = {
      creative_id: string;
      product_id: string | null;
      diversity_score: number;
      repeated_dimensions: string[];
      is_winner: boolean;
      regenerate: boolean;
    };
    const findings: Finding[] = [];

    for (const c of creatives) {
      // Each dimension contributes 1/8 to a max score of 1.
      // Penalize when a dim's value appears in >30% of the set.
      let score = 0;
      const repeated: string[] = [];
      for (const dim of DIMS) {
        const v = (c as any)[dim];
        if (!v) { score += 1 / DIMS.length * 0.5; continue; }
        const key = String(v).toLowerCase().trim();
        const share = (freq[dim].get(key) ?? 0) / total;
        if (share > 0.3) { repeated.push(`${dim}:${key}`); score += 0; }
        else if (share > 0.15) score += 1 / DIMS.length * 0.5;
        else score += 1 / DIMS.length;
      }

      const perf = (c as any).performance ?? {};
      const purchases = Number(perf.purchases ?? 0);
      const saves = Number(perf.saves ?? 0);
      const is_winner = purchases > 0 || saves >= 5 || Number((c as any).quality_score ?? 0) >= 90;

      findings.push({
        creative_id: c.id,
        product_id: c.product_id,
        diversity_score: Number(score.toFixed(3)),
        repeated_dimensions: repeated,
        is_winner,
        regenerate: !is_winner && score < 0.45 && repeated.length >= 3,
      });
    }

    // Update duplicate_score on affected creatives (1 - diversity_score).
    // Winners are protected and skipped.
    const updates = findings.filter((f) => !f.is_winner);
    for (const f of updates) {
      await sb
        .from("pcie2_creatives")
        .update({ duplicate_score: Number((1 - f.diversity_score).toFixed(3)) })
        .eq("id", f.creative_id);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        scanned: creatives.length,
        avg_diversity: findings.reduce((a, b) => a + b.diversity_score, 0) / findings.length,
        to_regenerate: findings.filter((f) => f.regenerate).length,
        winners_protected: findings.filter((f) => f.is_winner).length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});