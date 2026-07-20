import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * Creative DNA bias engine.
 * - action: "top" -> returns top N winning DNA patterns to bias new renders.
 * - action: "record" -> upserts a DNA fingerprint with performance metrics.
 * - action: "score_all" -> recomputes scores from performance JSON.
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "top";

    if (action === "top") {
      const limit = Math.max(1, Math.min(20, body.limit ?? 5));
      const { data, error } = await supabase
        .from("cinematic_creative_dna")
        .select("dna_fingerprint, hook_type, scene_sequence, motion_sequence, style_preset, score, sample_count")
        .gte("sample_count", 1)
        .order("score", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return json({ ok: true, traceId: crypto.randomUUID(), patterns: data ?? [] });
    }

    if (action === "record") {
      const {
        dna_fingerprint, hook_type, scene_sequence, motion_sequence,
        style_preset, performance,
      } = body;
      if (!dna_fingerprint) return json({ ok: false, message: "dna_fingerprint required" }, 400);

      const score = computeScore(performance ?? {});
      const { data: existing } = await supabase
        .from("cinematic_creative_dna")
        .select("id, sample_count, performance")
        .eq("dna_fingerprint", dna_fingerprint)
        .maybeSingle();

      if (existing) {
        const merged = mergePerformance(existing.performance ?? {}, performance ?? {});
        await supabase.from("cinematic_creative_dna").update({
          performance: merged,
          sample_count: (existing.sample_count ?? 0) + 1,
          score: computeScore(merged),
          last_used_at: new Date().toISOString(),
        }).eq("id", existing.id);
      } else {
        await supabase.from("cinematic_creative_dna").insert({
          dna_fingerprint,
          hook_type, scene_sequence, motion_sequence, style_preset,
          performance: performance ?? {},
          sample_count: 1,
          score,
          last_used_at: new Date().toISOString(),
        });
      }
      return json({ ok: true, traceId: crypto.randomUUID(), score });
    }

    if (action === "score_all") {
      const { data } = await supabase
        .from("cinematic_creative_dna")
        .select("id, performance");
      let updated = 0;
      for (const row of data ?? []) {
        const s = computeScore(row.performance ?? {});
        await supabase.from("cinematic_creative_dna").update({ score: s }).eq("id", row.id);
        updated++;
      }
      return json({ ok: true, traceId: crypto.randomUUID(), updated });
    }

    return json({ ok: false, message: `unknown action: ${action}` }, 400);
  } catch (e) {
    return json({ ok: false, message: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function computeScore(p: Record<string, number>): number {
  // Weighted blend: saves, ctr, retention, clicks, scroll_stop
  const saves = Number(p.pinterest_saves ?? 0);
  const clicks = Number(p.clicks ?? 0);
  const ctr = Number(p.ctr ?? 0);
  const retention = Number(p.retention ?? 0);
  const scrollStop = Number(p.scroll_stop_rate ?? 0);
  // Normalize roughly to 0..100
  const s =
    Math.min(100, saves * 2) * 0.2 +
    Math.min(100, clicks) * 0.2 +
    Math.min(100, ctr * 1000) * 0.2 +
    Math.min(100, retention) * 0.2 +
    Math.min(100, scrollStop) * 0.2;
  return Math.round(s * 100) / 100;
}

function mergePerformance(
  a: Record<string, number>,
  b: Record<string, number>,
): Record<string, number> {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: Record<string, number> = {};
  for (const k of keys) {
    out[k] = Number(a[k] ?? 0) + Number(b[k] ?? 0);
  }
  return out;
}