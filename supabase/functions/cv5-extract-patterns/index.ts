// Cinematic V5: winning-pattern extractor.
// Joins cv5_video_analytics with cv5_storyboards.beats, groups beat text by
// (role, niche), and writes the top performers into cv5_winning_patterns.
// Roles map: HOOK / PROBLEM / SOLUTION / BENEFIT / CTA + overall scene_structure.
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MIN_SAMPLE = 3; // pattern must appear ≥3 times to count

function roleToType(role: string): "hook" | "benefit" | "cta" | null {
  const r = (role || "").toLowerCase();
  if (r.includes("hook")) return "hook";
  if (r.includes("benefit") || r.includes("solution")) return "benefit";
  if (r.includes("cta")) return "cta";
  return null;
}

function keyOf(text: string) {
  return (text || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim().slice(0, 120);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const trace_id = crypto.randomUUID();
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = await req.json().catch(() => ({}));
    const triggered_by = body?.triggered_by || "manual";

    const { data: analytics } = await sb
      .from("cv5_video_analytics")
      .select("storyboard_id, ctr, save_rate, completion_rate, composite_score")
      .gt("impressions", 0);
    const rows = analytics || [];
    if (rows.length < MIN_SAMPLE) {
      return new Response(JSON.stringify({ ok: true, traceId: trace_id, skipped: "insufficient_data", videos: rows.length }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ids = rows.map((r) => r.storyboard_id);
    const { data: storyboards } = await sb
      .from("cv5_storyboards")
      .select("id, niche, beats")
      .in("id", ids);
    const sbById = new Map((storyboards || []).map((s) => [s.id, s]));

    // Baseline = mean composite across all videos.
    const baseline = rows.reduce((a, r) => a + Number(r.composite_score || 0), 0) / rows.length;

    // Aggregator: (type, niche, key) -> { texts, scores }
    type Agg = { text: string; ctr: number[]; save: number[]; comp: number[]; score: number[]; sbs: Set<string> };
    const agg = new Map<string, Agg>();
    const structAgg = new Map<string, Agg>();

    for (const r of rows) {
      const sbRow = sbById.get(r.storyboard_id);
      if (!sbRow) continue;
      const niche = sbRow.niche || "generic-pet";
      const beats: any[] = Array.isArray(sbRow.beats) ? sbRow.beats : [];

      // Beat-level patterns (hook / benefit / cta).
      for (const b of beats) {
        const type = roleToType(b.role);
        if (!type) continue;
        const text = b.vo_line || b.caption || "";
        const k = keyOf(text);
        if (!k) continue;
        const key = `${type}|${niche}|${k}`;
        let a = agg.get(key);
        if (!a) { a = { text, ctr: [], save: [], comp: [], score: [], sbs: new Set() }; agg.set(key, a); }
        a.ctr.push(Number(r.ctr || 0));
        a.save.push(Number(r.save_rate || 0));
        a.comp.push(Number(r.completion_rate || 0));
        a.score.push(Number(r.composite_score || 0));
        a.sbs.add(r.storyboard_id);
      }

      // Scene structure pattern = ordered list of roles.
      const struct = beats.map((b: any) => (b.role || "").toUpperCase()).join(">");
      if (struct) {
        const key = `scene_structure|${niche}|${struct}`;
        let a = structAgg.get(key);
        if (!a) { a = { text: struct, ctr: [], save: [], comp: [], score: [], sbs: new Set() }; structAgg.set(key, a); }
        a.ctr.push(Number(r.ctr || 0));
        a.save.push(Number(r.save_rate || 0));
        a.comp.push(Number(r.completion_rate || 0));
        a.score.push(Number(r.composite_score || 0));
        a.sbs.add(r.storyboard_id);
      }
    }

    const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
    let written = 0;
    const writePattern = async (type: string, niche: string, k: string, a: Agg) => {
      if (a.sbs.size < MIN_SAMPLE) return;
      const avgScore = mean(a.score);
      const lift = baseline > 0 ? (avgScore - baseline) / baseline : 0;
      const { error } = await sb.from("cv5_winning_patterns").upsert({
        pattern_type: type,
        niche,
        pattern_key: k,
        pattern_text: a.text,
        sample_size: a.sbs.size,
        avg_ctr: mean(a.ctr),
        avg_save_rate: mean(a.save),
        avg_completion: mean(a.comp),
        avg_score: avgScore,
        lift_vs_baseline: lift,
        example_storyboard_ids: [...a.sbs].slice(0, 5),
        is_active: lift >= 0, // only patterns at-or-above baseline are active
      }, { onConflict: "pattern_type,niche,pattern_key" });
      if (!error) written++;
    };

    for (const [key, a] of agg) {
      const [type, niche, k] = key.split("|");
      await writePattern(type, niche, k, a);
    }
    for (const [key, a] of structAgg) {
      const [type, niche, k] = key.split("|");
      await writePattern(type, niche, k, a);
    }

    await sb.from("cv5_pattern_runs").insert({
      videos_analyzed: rows.length,
      patterns_found: written,
      triggered_by,
    });

    return new Response(JSON.stringify({ ok: true, traceId: trace_id, videos: rows.length, patterns_written: written, baseline }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[cv5-extract-patterns]", e);
    return new Response(JSON.stringify({ ok: false, code: "INTERNAL", message: String(e), traceId: trace_id }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});