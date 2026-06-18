// Cinematic V4: Pre-render quality gate.
// Reads a storyboard row and runs deterministic rejection checks.
// Reject reasons land on cinematic_v4_storyboards.cv4_reject_reasons[]
// and flip status to 'rejected' on any failure.
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export function runPreChecks(storyboard: any): { reasons: string[]; quality_score: number } {
  const reasons: string[] = [];
  const beats: any[] = Array.isArray(storyboard?.beats) ? storyboard.beats : [];
  const assets: any[] = Array.isArray(storyboard?.scene_assets) ? storyboard.scene_assets : [];

  if (beats.length < 5) reasons.push(`scenes_lt_5:${beats.length}`);

  const captions = beats.map((b) => String(b?.caption || "").trim().toLowerCase()).filter(Boolean);
  const dupCaption = captions.length !== new Set(captions).size;
  if (dupCaption) reasons.push("duplicate_caption");

  for (const b of beats) {
    const c = String(b?.caption || "").trim();
    const w = c.split(/\s+/).filter(Boolean);
    if (w.length === 0) reasons.push(`empty_caption:${b?.beat}`);
    if (w.length > 5) reasons.push(`caption_over_5_words:${b?.beat}:${w.length}`);
    if (c.length > 32) reasons.push(`caption_over_32_chars:${b?.beat}:${c.length}`);
  }

  const uniqueImgs = new Set(assets.map((a) => a?.image_url).filter(Boolean));
  if (uniqueImgs.size < 3) reasons.push(`unique_images_lt_3:${uniqueImgs.size}`);
  if (uniqueImgs.size === 1) reasons.push("single_image_detected");

  // (length check folded above — 32 char hard limit fits Pinterest safe-zone at fontsize 82)

  // simple deterministic score
  let score = 100;
  score -= reasons.length * 20;
  if (uniqueImgs.size >= 5) score += 5;
  return { reasons, quality_score: Math.max(0, Math.min(100, score)) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const trace_id = crypto.randomUUID();
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { storyboard_id } = await req.json();
    if (!storyboard_id) return new Response(JSON.stringify({ ok: false, code: "MISSING_STORYBOARD_ID", traceId: trace_id }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: row } = await sb.from("cinematic_v4_storyboards").select("*").eq("id", storyboard_id).maybeSingle();
    if (!row) return new Response(JSON.stringify({ ok: false, code: "STORYBOARD_NOT_FOUND", traceId: trace_id }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { reasons, quality_score } = runPreChecks(row);
    const passed = reasons.length === 0;
    await sb.from("cinematic_v4_storyboards").update({
      cv4_reject_reasons: reasons,
      quality_score,
      status: passed ? "validated" : "rejected",
      rejected_at: passed ? null : new Date().toISOString(),
    }).eq("id", storyboard_id);
    return new Response(JSON.stringify({ ok: passed, traceId: trace_id, reasons, quality_score }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[cv4-quality-gate-pre]", e);
    return new Response(JSON.stringify({ ok: false, code: "INTERNAL", message: String(e), traceId: trace_id }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});