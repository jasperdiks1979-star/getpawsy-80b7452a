// V3 quality audit — scores existing approved V3 jobs against the V4 quality bar.
// Heuristic-only (no OCR / no ffmpeg). Reads script JSON, scene data, source media,
// and writes per-job rows into cinematic_v3_quality_audit.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Cfg = Record<string, number>;

function detectCollage(url: string | null | undefined): boolean {
  if (!url) return false;
  const u = url.toLowerCase();
  // CJ / supplier collage signatures
  return /(_main_|collage|combo|grid|multi|all-in-one|details?_\d|sku\d+_)/i.test(u);
}

function pickText(s: any): string {
  if (!s) return "";
  if (typeof s === "string") return s;
  return [s.text, s.copy, s.caption, s.headline, s.line, s.body].filter(Boolean).join(" ");
}

function scoreJob(job: any, cfg: Cfg) {
  const script = job.script || {};
  const scenes: any[] = Array.isArray(job.scenes) ? job.scenes : Array.isArray(script.scenes) ? script.scenes : [];

  const sceneTexts = scenes.map(pickText);
  const allText = (sceneTexts.join(" ") + " " + JSON.stringify(script)).toLowerCase();

  // Required structural beats
  const hook_present = !!(script.hook || sceneTexts[0]?.length > 4);
  const benefit_present = !!(script.benefit || /benefit|love|helps?|easier|stops?|prevents?|saves?/i.test(allText));
  const cta_present = !!(script.cta || /shop|buy|get|order|tap|swipe|link|today|now/i.test(allText));

  // Branding — final scene mentions GetPawsy or branded end card flag
  const branding_ok = /getpawsy|get pawsy|gp\b/i.test(allText) || !!script.brand_endcard;

  // Safe-area heuristic: any scene text > 90 chars likely overflows vertical safe area on 1080x1920
  const caption_clipped = sceneTexts.some(t => t.length > 110);
  const safe_area_ok = !sceneTexts.some(t => t.length > 140);

  // Supplier collage / low-res from scene assets
  let supplier_collage = false;
  let low_res_source = false;
  for (const s of scenes) {
    const img = s?.image_url || s?.media_url || s?.asset_url || s?.bg_url;
    if (detectCollage(img)) supplier_collage = true;
    const w = Number(s?.image_width || s?.width || 0);
    if (w && w < 1000) low_res_source = true;
  }

  // Zoom/pan only — if every scene uses the same simple ken-burns motion and there are < 3 distinct images
  const motions = scenes.map(s => (s?.motion || s?.effect || "ken-burns").toString().toLowerCase());
  const images = new Set(scenes.map(s => s?.image_url || s?.media_url).filter(Boolean));
  const zoom_pan_only = motions.length > 0 && motions.every(m => /ken-?burns|zoom|pan/.test(m)) && images.size <= 2;

  const issues: { code: string; message: string; severity: "warn" | "error" }[] = [];
  let score = 100;
  if (!safe_area_ok) { score -= cfg.safe_area; issues.push({ code: "safe_area", message: "Text exceeds vertical safe area", severity: "error" }); }
  if (caption_clipped) { score -= cfg.caption_clipped; issues.push({ code: "caption_clipped", message: "Caption likely clipped", severity: "error" }); }
  if (supplier_collage) { score -= cfg.supplier_collage; issues.push({ code: "supplier_collage", message: "Supplier collage image detected", severity: "error" }); }
  if (low_res_source) { score -= cfg.low_res; issues.push({ code: "low_res_source", message: "Source image below 1000px", severity: "warn" }); }
  if (zoom_pan_only) { score -= cfg.zoom_pan_only; issues.push({ code: "zoom_pan_only", message: "Video uses only zoom/pan motion", severity: "warn" }); }
  if (!hook_present) { score -= cfg.missing_hook; issues.push({ code: "missing_hook", message: "Hook scene missing", severity: "error" }); }
  if (!benefit_present) { score -= cfg.missing_benefit; issues.push({ code: "missing_benefit", message: "Benefit beat missing", severity: "warn" }); }
  if (!cta_present) { score -= cfg.missing_cta; issues.push({ code: "missing_cta", message: "CTA missing", severity: "error" }); }
  if (!branding_ok) { score -= cfg.branding; issues.push({ code: "branding", message: "GetPawsy branding not detected", severity: "warn" }); }

  score = Math.max(0, Math.min(100, score));
  const verdict = score >= 90 ? "approved" : score >= 70 ? "review" : "rejected";

  return {
    safe_area_ok, caption_clipped, supplier_collage, low_res_source, zoom_pan_only,
    hook_present, benefit_present, cta_present, branding_ok,
    quality_score: score, verdict, issues,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: cfgRow } = await supa.from("cinematic_v4_safe_zone_config").select("*").limit(1).maybeSingle();
    const cfg: Cfg = {
      safe_area: cfgRow?.penalty_safe_area ?? 25,
      caption_clipped: cfgRow?.penalty_caption_clipped ?? 20,
      supplier_collage: cfgRow?.penalty_supplier_collage ?? 30,
      low_res: cfgRow?.penalty_low_res ?? 15,
      zoom_pan_only: cfgRow?.penalty_zoom_pan_only ?? 15,
      missing_hook: cfgRow?.penalty_missing_hook ?? 15,
      missing_benefit: cfgRow?.penalty_missing_benefit ?? 10,
      missing_cta: cfgRow?.penalty_missing_cta ?? 20,
      branding: cfgRow?.penalty_branding ?? 10,
    };

    const { data: jobs, error } = await supa
      .from("cinematic_v3_jobs")
      .select("id, product_slug, script, scenes, final_mp4_url, status")
      .eq("status", "approved")
      .not("final_mp4_url", "is", null);
    if (error) throw error;

    const rows = (jobs ?? []).map((j: any) => {
      const r = scoreJob(j, cfg);
      return {
        job_id: j.id,
        product_slug: j.product_slug,
        mp4_url: j.final_mp4_url,
        ...r,
      };
    });

    if (rows.length) {
      const { error: upErr } = await supa.from("cinematic_v3_quality_audit").upsert(rows, { onConflict: "job_id" });
      if (upErr) throw upErr;
    }

    const approved = rows.filter(r => r.verdict === "approved").length;
    const review = rows.filter(r => r.verdict === "review").length;
    const rejected = rows.filter(r => r.verdict === "rejected").length;

    return new Response(JSON.stringify({
      ok: true,
      audited: rows.length,
      approved, review, rejected,
      avg_score: rows.length ? Math.round(rows.reduce((s, r) => s + r.quality_score, 0) / rows.length) : 0,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});