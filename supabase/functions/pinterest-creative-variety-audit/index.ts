import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function newTraceId() {
  return `cva_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const STOP = new Set([
  "the","a","an","to","of","and","or","is","this","that","for","in","on",
  "with","your","you","my","i","it","its","by","at","be","as","are","was",
  "from","so","can","will","just","more","most","less"
]);

function tokens(s: string): string[] {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

function detectCTA(text: string): string | null {
  const t = (text || "").toLowerCase();
  const patterns = [
    "shop now","shop the","see the","see it","see how","try it","try this",
    "check it","check this","compare","build the","pick a","pick your",
    "tap to","learn more","get yours","find out","discover"
  ];
  for (const p of patterns) if (t.includes(p)) return p;
  return null;
}

function detectAngle(text: string): string | null {
  const t = (text || "").toLowerCase();
  if (/odor|smell/.test(t)) return "odor_control";
  if (/scoop|clean/.test(t)) return "low_maintenance";
  if (/multi[\s-]?cat|two cats|three cats/.test(t)) return "multi_cat";
  if (/anxious|stress|calm|quiet/.test(t)) return "calming";
  if (/airline|travel|carrier|flight/.test(t)) return "travel";
  if (/senior|joint|hip|orthop/.test(t)) return "senior_comfort";
  if (/sturdy|wobble|tip|solid|hardwood/.test(t)) return "durability";
  if (/apartment|small space|fits under/.test(t)) return "small_space";
  if (/obsessed|love|finally|changed/.test(t)) return "emotional_proof";
  if (/cheap|worth it|premium|status/.test(t)) return "status_premium";
  return null;
}

function detectBenefit(text: string): string | null {
  const t = (text || "").toLowerCase();
  if (/washable|machine.?wash/.test(t)) return "washable";
  if (/memory foam|orthop/.test(t)) return "orthopedic_foam";
  if (/sealed|chamber/.test(t)) return "sealed_odor";
  if (/sisal|hardwood|solid wood/.test(t)) return "premium_material";
  if (/non.?slip|non.?skid/.test(t)) return "non_slip";
  if (/ventilation|mesh/.test(t)) return "ventilation";
  if (/tsa|airline.?approved/.test(t)) return "airline_certified";
  return null;
}

function topN(map: Map<string, number>, n: number) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([value, count]) => ({ value, count }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = newTraceId();

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // All published pins (full corpus)
    const { data: allPosted, error: allErr } = await supabase
      .from("pinterest_pin_queue")
      .select("id, overlay_text, pin_title, pin_description, board_name, category_key, hook_group, product_id, posted_at")
      .eq("status", "posted")
      .order("posted_at", { ascending: false })
      .limit(5000);
    if (allErr) throw allErr;

    const corpus = allPosted ?? [];
    const last90 = corpus.slice(0, 90);

    // Counters
    const overlayAll = new Map<string, number>();
    const overlay90 = new Map<string, number>();
    const titleAll = new Map<string, number>();
    const hookAll = new Map<string, number>();
    const ctaAll = new Map<string, number>();
    const angleAll = new Map<string, number>();
    const benefitAll = new Map<string, number>();

    const boardStats = new Map<string, { total: number; uniques: Set<string> }>();
    const categoryStats = new Map<string, { total: number; uniques: Set<string> }>();

    for (const p of corpus) {
      const ov = (p.overlay_text || "").trim();
      if (ov) overlayAll.set(ov, (overlayAll.get(ov) || 0) + 1);
      const tt = (p.pin_title || "").trim();
      if (tt) titleAll.set(tt, (titleAll.get(tt) || 0) + 1);
      if (p.hook_group) hookAll.set(p.hook_group, (hookAll.get(p.hook_group) || 0) + 1);

      const blob = `${ov} ${tt} ${p.pin_description || ""}`;
      const cta = detectCTA(blob); if (cta) ctaAll.set(cta, (ctaAll.get(cta) || 0) + 1);
      const ang = detectAngle(blob); if (ang) angleAll.set(ang, (angleAll.get(ang) || 0) + 1);
      const ben = detectBenefit(blob); if (ben) benefitAll.set(ben, (benefitAll.get(ben) || 0) + 1);

      const board = p.board_name || "(none)";
      if (!boardStats.has(board)) boardStats.set(board, { total: 0, uniques: new Set() });
      const b = boardStats.get(board)!;
      b.total += 1;
      if (ov) b.uniques.add(ov);

      const cat = p.category_key || "(uncategorised)";
      if (!categoryStats.has(cat)) categoryStats.set(cat, { total: 0, uniques: new Set() });
      const c = categoryStats.get(cat)!;
      c.total += 1;
      if (ov) c.uniques.add(ov);
    }

    for (const p of last90) {
      const ov = (p.overlay_text || "").trim();
      if (ov) overlay90.set(ov, (overlay90.get(ov) || 0) + 1);
    }

    const overusedIn90 = [...overlay90.entries()]
      .filter(([_, c]) => c > 5)
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, count }));

    const overusedAll = [...overlayAll.entries()]
      .filter(([_, c]) => c > 5)
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, count }));

    const diversityByBoard = [...boardStats.entries()]
      .map(([board, s]) => ({
        board,
        total: s.total,
        uniques: s.uniques.size,
        diversity: s.total ? Math.round((s.uniques.size / s.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);

    const diversityByCategory = [...categoryStats.entries()]
      .map(([category, s]) => ({
        category,
        total: s.total,
        uniques: s.uniques.size,
        diversity: s.total ? Math.round((s.uniques.size / s.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);

    // Replacement pools
    const { data: pools, error: poolErr } = await supabase
      .from("pinterest_category_creative_pools")
      .select("category, pool_type, value, is_active")
      .eq("is_active", true)
      .order("category", { ascending: true });
    if (poolErr) throw poolErr;

    const replacementPools: Record<string, Record<string, string[]>> = {};
    for (const row of pools ?? []) {
      replacementPools[row.category] ||= {};
      replacementPools[row.category][row.pool_type] ||= [];
      replacementPools[row.category][row.pool_type].push(row.value);
    }

    const report = {
      ok: true,
      traceId,
      generated_at: new Date().toISOString(),
      totals: {
        published_pins_total: corpus.length,
        pins_in_window_90: last90.length,
        unique_overlays_total: overlayAll.size,
        unique_overlays_in_90: overlay90.size,
        boards_covered: boardStats.size,
        categories_covered: categoryStats.size,
      },
      goal: {
        rule: "No headline may appear more than 5 times within the previous 90 published pins.",
        violations_in_90: overusedIn90.length,
        compliant: overusedIn90.length === 0,
      },
      overused_overlays_last_90: overusedIn90,
      overused_overlays_all_time: overusedAll.slice(0, 25),
      top_repeated: {
        overlays: topN(overlayAll, 15),
        titles: topN(titleAll, 15),
        hooks: topN(hookAll, 15),
        ctas: topN(ctaAll, 15),
        angles: topN(angleAll, 15),
        benefits: topN(benefitAll, 15),
      },
      diversity_by_board: diversityByBoard,
      diversity_by_category: diversityByCategory,
      replacement_pools: replacementPools,
      replacement_pools_summary: Object.fromEntries(
        Object.entries(replacementPools).map(([cat, byType]) => [
          cat,
          Object.fromEntries(Object.entries(byType).map(([t, arr]) => [t, arr.length])),
        ]),
      ),
      publishing_status: "paused",
      message: "Audit only — no pins were created, modified, or published.",
    };

    return new Response(JSON.stringify(report), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, traceId, message: (e as Error).message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});