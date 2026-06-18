// V4 Pinterest Revenue Renderer orchestrator.
// Pipeline: pick product -> generate 5-scene script via Lovable AI ->
// auto-fit text to safe zone -> select premium asset -> write storyboard ->
// run server-side quality gate -> approve only if score >= threshold.
// NOTE: actual mp4 render dispatch to GitHub Actions worker happens once
// render workers are restored; this function produces a fully validated
// storyboard + quality report and leaves status=rendering for the worker
// to pick up. Approve/reject is finalized post-render.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SAFE_CHAR_LIMITS = { hook: 60, problem: 90, benefit: 90, key_feature: 80, cta: 36 };

function safeFitText(text: string, key: keyof typeof SAFE_CHAR_LIMITS): { ok: boolean; lines: string[]; reason?: string } {
  const limit = SAFE_CHAR_LIMITS[key];
  if (!text || !text.trim()) return { ok: false, lines: [], reason: "empty" };
  const cleaned = text.trim().replace(/\s+/g, " ");
  if (cleaned.length <= limit) return { ok: true, lines: [cleaned] };
  // try 2-line split
  const words = cleaned.split(" ");
  let l1 = "", l2 = "";
  for (const w of words) {
    if ((l1 + " " + w).trim().length <= limit / 1.6) l1 = (l1 + " " + w).trim();
    else l2 = (l2 + " " + w).trim();
  }
  if (l1 && l2 && l1.length <= limit && l2.length <= limit) return { ok: true, lines: [l1, l2] };
  return { ok: false, lines: [cleaned], reason: "text_exceeds_safe_zone" };
}

async function generateScript(lovableKey: string, product: any): Promise<any> {
  const sys = `You write Pinterest video ad scripts for GetPawsy, a US pet store. Return strict JSON only.`;
  const user = `Product: ${product.title}\nCategory: ${product.category ?? ""}\nDescription: ${(product.description ?? "").slice(0, 600)}\n\nWrite a 5-scene Pinterest video script with this exact JSON shape:\n{"hook":"<=60 chars, scroll-stopping","problem":"<=90 chars","benefit":"<=90 chars","key_feature":"<=80 chars","cta":"<=36 chars action phrase ending in Today/Now"}\nRules: US-native voice, no fluff, no banned phrases (vet-approved, eco-friendly, stop scooping), no emojis.`;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableKey}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "system", content: sys }, { role: "user", content: user }],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI gateway ${res.status}: ${t}`);
  }
  const j = await res.json();
  const txt = j.choices?.[0]?.message?.content ?? "{}";
  return JSON.parse(txt);
}

function detectCollage(url: string | null | undefined): boolean {
  if (!url) return false;
  return /(_main_|collage|combo|grid|multi|all-in-one|details?_\d|sku\d+_)/i.test(url);
}

async function selectPremiumAssets(supa: any, productId: string, minPx: number) {
  const { data: media } = await supa
    .from("product_media")
    .select("url, width, height, media_type, position")
    .eq("product_id", productId)
    .order("position", { ascending: true });
  const all = (media ?? []).filter((m: any) => m.media_type === "image" || !m.media_type);
  const eligible = all.filter((m: any) =>
    !detectCollage(m.url) &&
    (!m.width || m.width >= minPx) &&
    (!m.height || m.height >= minPx)
  );
  return { eligible, total: all.length };
}

function scoreStoryboard(storyboard: any, cfg: any) {
  const issues: any[] = [];
  let score = 100;
  const scenes = storyboard.scenes ?? [];
  const fitFail = scenes.some((s: any) => !s.fit_ok);
  if (fitFail) { score -= cfg.penalty_safe_area; issues.push({ code: "safe_area", message: "Text does not fit safe zone" }); }
  if (!storyboard.hook_text) { score -= cfg.penalty_missing_hook; issues.push({ code: "missing_hook" }); }
  if (!storyboard.benefit_text) { score -= cfg.penalty_missing_benefit; issues.push({ code: "missing_benefit" }); }
  if (!storyboard.cta_text) { score -= cfg.penalty_missing_cta; issues.push({ code: "missing_cta" }); }
  if (storyboard.supplier_collage_detected) { score -= cfg.penalty_supplier_collage; issues.push({ code: "supplier_collage" }); }
  if (storyboard.low_res_source) { score -= cfg.penalty_low_res; issues.push({ code: "low_res_source" }); }
  if (!storyboard.branding_ok) { score -= cfg.penalty_branding; issues.push({ code: "branding" }); }
  score = Math.max(0, Math.min(100, score));
  return { score, issues };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) throw new Error("LOVABLE_API_KEY missing");

    const body = await req.json().catch(() => ({}));
    const slug: string | undefined = body.product_slug;
    if (!slug) throw new Error("product_slug required");

    const { data: product, error: pErr } = await supa
      .from("products")
      .select("id, slug, title, category, description")
      .eq("slug", slug).maybeSingle();
    if (pErr || !product) throw new Error(`Product not found: ${slug}`);

    const { data: cfg } = await supa.from("cinematic_v4_safe_zone_config").select("*").limit(1).maybeSingle();
    if (!cfg) throw new Error("safe zone config missing");

    // Create job row in scripting
    const { data: job, error: jErr } = await supa.from("cinematic_v4_jobs").insert({
      product_id: product.id, product_slug: product.slug, status: "scripting",
    }).select("*").single();
    if (jErr) throw jErr;

    // 1. Script
    const script = await generateScript(lovableKey, product);

    // 2. Safe fit per scene
    const sceneSpecs: Array<{ key: keyof typeof SAFE_CHAR_LIMITS; label: string; duration: number }> = [
      { key: "hook", label: "Hook", duration: 5 },
      { key: "problem", label: "Problem", duration: 5 },
      { key: "benefit", label: "Benefit", duration: 5 },
      { key: "key_feature", label: "Key Feature", duration: 5 },
      { key: "cta", label: "CTA", duration: 4 },
    ];
    const scenes = sceneSpecs.map((s, idx) => {
      const fit = safeFitText(String(script[s.key] ?? ""), s.key);
      return { idx, ...s, text: script[s.key] ?? "", lines: fit.lines, fit_ok: fit.ok, fit_reason: fit.reason };
    });

    // 3. Assets
    const { eligible, total } = await selectPremiumAssets(supa, product.id, cfg.min_source_image_px);
    const sceneAssets = scenes.map((s, i) => ({
      scene_idx: s.idx,
      asset_url: eligible[i % Math.max(eligible.length, 1)]?.url ?? null,
      width: eligible[i % Math.max(eligible.length, 1)]?.width ?? null,
    }));
    const supplier_collage_detected = (eligible.length === 0 && total > 0);
    const low_res_source = eligible.length === 0;

    // 4. Storyboard
    const storyboard = {
      canvas: { width: cfg.canvas_width, height: cfg.canvas_height, fps: 30 },
      safe_zone: {
        top: Math.round(cfg.canvas_height * (cfg.top_reserve_pct / 100)),
        bottom: cfg.canvas_height - Math.round(cfg.canvas_height * (cfg.bottom_reserve_pct / 100)),
        left: cfg.side_reserve_px,
        right: cfg.canvas_width - cfg.side_reserve_px,
      },
      scenes,
      hook_text: script.hook ?? "",
      benefit_text: script.benefit ?? "",
      cta_text: script.cta ?? "",
      brand_endcard: { logo_url: cfg.brand_logo_url, primary: cfg.brand_primary, accent: cfg.brand_accent },
      branding_ok: true,
      supplier_collage_detected,
      low_res_source,
    };

    // 5. Score
    const { score, issues } = scoreStoryboard(storyboard, cfg);
    const rejection_reasons = issues.map(i => i.code);
    const approved = score >= cfg.approval_threshold && !storyboard.supplier_collage_detected && scenes.every(s => s.fit_ok);

    await supa.from("cinematic_v4_jobs").update({
      script_json: script,
      scene_assets: sceneAssets,
      storyboard,
      quality_score: score,
      quality_report: { issues, eligible_assets: eligible.length, total_assets: total },
      rejection_reasons: approved ? [] : rejection_reasons,
      status: approved ? "rendering" : "rejected",
      duration_seconds: scenes.reduce((s, x) => s + x.duration, 0),
      updated_at: new Date().toISOString(),
      approved_at: approved ? new Date().toISOString() : null,
    }).eq("id", job.id);

    return new Response(JSON.stringify({
      ok: true, job_id: job.id, status: approved ? "rendering" : "rejected",
      quality_score: score, rejection_reasons,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});