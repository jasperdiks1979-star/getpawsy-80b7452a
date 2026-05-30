// cinematic-fidelity-check
//
// Per-scene product fidelity validator. Compares each AI-generated scene
// image (from cinematic_ad_jobs.scene_assets) against the source PDP
// images (products.image_url + products.images) using Gemini multimodal
// scoring through the Lovable AI Gateway.
//
// Hard reject rules:
//   - product shape differs from source images
//   - product color differs from source images
//   - product dimensions / proportions differ from source images
//   - button locations differ
//   - display/screen differs
//   - entry opening differs (litter boxes, carriers, crates)
//   - AI invented features not on the real product
//   - product branding/logo missing or wrong
//   - product cannot be matched to original PDP images
//
// Output: per-scene { passed, score 0-100, reasons[] } + aggregate
// fidelity_score, fidelity_passed, scenes_needing_regen[].
//
// Auth: admin JWT OR service role (x-render-secret).
//
// Invocation:
//   POST { job_id: string, scene_indices?: number[] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const RENDER_WORKER_SECRET = Deno.env.get("RENDER_WORKER_SECRET") ?? "";

const trace = () => `fid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface SceneFidelity {
  index: number;
  passed: boolean;
  score: number;
  reasons: string[];
  rule_flags: {
    shape_match: boolean;
    color_match: boolean;
    dimensions_match: boolean;
    buttons_match: boolean;
    display_match: boolean;
    opening_match: boolean;
    no_invented_features: boolean;
    branding_match: boolean;
    product_identifiable: boolean;
  };
}

const FIDELITY_TOOL = {
  type: "function" as const,
  function: {
    name: "report_product_fidelity",
    description:
      "Compare a rendered scene image against the source product reference images and report per-rule pass/fail. Be strict — only mark a rule passed if there is clear visual evidence the scene matches the source.",
    parameters: {
      type: "object",
      properties: {
        shape_match: { type: "boolean", description: "Product silhouette/shape matches source images" },
        color_match: { type: "boolean", description: "Primary product color(s) match source images" },
        dimensions_match: { type: "boolean", description: "Product proportions and relative dimensions match source images" },
        buttons_match: { type: "boolean", description: "Buttons / controls are in the same locations as on the real product (true if the real product has no buttons)" },
        display_match: { type: "boolean", description: "Screen, dial or status display matches the real product (true if not applicable)" },
        opening_match: { type: "boolean", description: "Entry opening, door, lid, or access point matches the real product (true if not applicable)" },
        no_invented_features: { type: "boolean", description: "Scene does NOT add features (lights, panels, accessories, badges) that are not on the real product" },
        branding_match: { type: "boolean", description: "Brand mark / logo placement matches the real product (true if real product has no visible branding)" },
        product_identifiable: { type: "boolean", description: "The product in the scene is recognizably the same SKU as the source images" },
        score: { type: "integer", minimum: 0, maximum: 100, description: "Overall fidelity score 0-100" },
        reasons: {
          type: "array",
          items: { type: "string" },
          description: "Short reasons for any failing rule. Empty if all rules pass.",
        },
      },
      required: [
        "shape_match", "color_match", "dimensions_match", "buttons_match",
        "display_match", "opening_match", "no_invented_features",
        "branding_match", "product_identifiable", "score", "reasons",
      ],
      additionalProperties: false,
    },
  },
};

async function scoreScene(opts: {
  sceneIndex: number;
  sceneImageUrl: string;
  sourceImageUrls: string[];
  productName: string;
  productCategory: string;
}): Promise<SceneFidelity> {
  const sourceParts = opts.sourceImageUrls.slice(0, 4).map((u) => ({
    type: "image_url" as const, image_url: { url: u },
  }));

  const userContent: Array<Record<string, unknown>> = [
    {
      type: "text",
      text:
        `Source product: ${opts.productName} (category: ${opts.productCategory}).\n\n` +
        `Below are ${sourceParts.length} REAL product reference images followed by ONE rendered ad scene. ` +
        `Compare the rendered scene to the references and call the tool. Be strict: any shape / color / button / display / opening / branding mismatch = false. ` +
        `If the scene is a lifestyle shot where the product is barely visible, still evaluate the rules that apply and set product_identifiable accordingly.`,
    },
    ...sourceParts,
    { type: "text", text: "RENDERED AD SCENE TO EVALUATE:" },
    { type: "image_url", image_url: { url: opts.sceneImageUrl } },
  ];

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            "You are a strict product-fidelity QA reviewer for e-commerce ads. You compare AI-generated ad frames to real product photos and refuse anything that misrepresents the product.",
        },
        { role: "user", content: userContent },
      ],
      tools: [FIDELITY_TOOL],
      tool_choice: { type: "function", function: { name: "report_product_fidelity" } },
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    // Soft-fail: missing AI signal does not auto-reject; mark unknown but pass-through.
    return {
      index: opts.sceneIndex,
      passed: true,
      score: 0,
      reasons: [`ai_gateway_error:${resp.status}:${txt.slice(0, 120)}`],
      rule_flags: {
        shape_match: true, color_match: true, dimensions_match: true,
        buttons_match: true, display_match: true, opening_match: true,
        no_invented_features: true, branding_match: true, product_identifiable: true,
      },
    };
  }

  const data = await resp.json();
  const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  let parsed: any = {};
  try { parsed = typeof args === "string" ? JSON.parse(args) : args ?? {}; } catch { parsed = {}; }

  const flags = {
    shape_match: parsed.shape_match !== false,
    color_match: parsed.color_match !== false,
    dimensions_match: parsed.dimensions_match !== false,
    buttons_match: parsed.buttons_match !== false,
    display_match: parsed.display_match !== false,
    opening_match: parsed.opening_match !== false,
    no_invented_features: parsed.no_invented_features !== false,
    branding_match: parsed.branding_match !== false,
    product_identifiable: parsed.product_identifiable !== false,
  };
  const allPass = Object.values(flags).every(Boolean);
  const score = Math.max(0, Math.min(100, Number(parsed.score ?? (allPass ? 90 : 40))));
  const reasons: string[] = Array.isArray(parsed.reasons) ? parsed.reasons.map(String) : [];

  return { index: opts.sceneIndex, passed: allPass && score >= 70, score, reasons, rule_flags: flags };
}

async function authorize(req: Request, admin: any): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const workerSecret = req.headers.get("x-render-secret");
  if (workerSecret && RENDER_WORKER_SECRET && workerSecret === RENDER_WORKER_SECRET) return { ok: true };
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return { ok: false, status: 401, message: "unauthenticated" };
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data: u, error } = await userClient.auth.getUser();
  if (error || !u.user) return { ok: false, status: 401, message: "unauthenticated" };
  const { data: role } = await admin.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
  if (!role) return { ok: false, status: 403, message: "admin role required" };
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = trace();
  try {
    if (!LOVABLE_API_KEY) return json(500, { ok: false, traceId, message: "LOVABLE_API_KEY missing" });
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const auth = await authorize(req, admin);
    if (!auth.ok) return json(auth.status, { ok: false, traceId, message: auth.message });

    const body = await req.json().catch(() => ({}));
    const jobId = String(body.job_id ?? "");
    if (!jobId) return json(400, { ok: false, traceId, message: "job_id required" });
    const onlyIndices: number[] | null = Array.isArray(body.scene_indices) ? body.scene_indices.map(Number) : null;

    const { data: job, error: jobErr } = await admin.from("cinematic_ad_jobs")
      .select("id, product_slug, scene_assets, fidelity_regen_passes").eq("id", jobId).maybeSingle();
    if (jobErr || !job) return json(404, { ok: false, traceId, message: "job not found" });

    const scenes: any[] = Array.isArray(job.scene_assets) ? job.scene_assets : [];
    const filtered = onlyIndices ? scenes.filter((s) => onlyIndices.includes(Number(s.index))) : scenes;
    if (filtered.length === 0) {
      return json(200, { ok: true, traceId, message: "no scene images to check", report: { scenes: [], score: 100, passed: true } });
    }

    // Settings
    let minScore = 75, enabled = true;
    try {
      const { data: s } = await admin.from("cinematic_ad_settings")
        .select("product_fidelity_enabled, min_product_fidelity_score").limit(1).maybeSingle();
      if (s) {
        enabled = s.product_fidelity_enabled !== false;
        minScore = Number(s.min_product_fidelity_score ?? minScore);
      }
    } catch (_) { /* defaults */ }

    if (!enabled) {
      return json(200, { ok: true, traceId, message: "product fidelity disabled by settings", report: { scenes: [], score: 100, passed: true } });
    }

    const { data: product } = await admin.from("products")
      .select("name, category, image_url, images").eq("slug", job.product_slug).maybeSingle();
    const sourceImages = [
      ...(product?.image_url ? [String(product.image_url)] : []),
      ...(Array.isArray(product?.images) ? product!.images.map(String) : []),
    ].filter((u) => /^https?:\/\//.test(u));
    if (sourceImages.length === 0) {
      return json(200, {
        ok: true, traceId,
        message: "no source product images to compare against",
        report: { scenes: [], score: 0, passed: false, reason: "no_source_images" },
      });
    }

    // Score scenes in parallel (cap concurrency by Promise.all on slice batches).
    const results: SceneFidelity[] = [];
    const batchSize = 3;
    for (let i = 0; i < filtered.length; i += batchSize) {
      const batch = filtered.slice(i, i + batchSize);
      const out = await Promise.all(batch.map((s) =>
        scoreScene({
          sceneIndex: Number(s.index),
          sceneImageUrl: String(s.image_url),
          sourceImageUrls: sourceImages,
          productName: String(product?.name ?? job.product_slug),
          productCategory: String(product?.category ?? ""),
        }).catch((e): SceneFidelity => ({
          index: Number(s.index),
          passed: true, // soft-fail on error
          score: 0,
          reasons: [`exception:${e instanceof Error ? e.message : String(e)}`],
          rule_flags: {
            shape_match: true, color_match: true, dimensions_match: true,
            buttons_match: true, display_match: true, opening_match: true,
            no_invented_features: true, branding_match: true, product_identifiable: true,
          },
        })),
      ));
      results.push(...out);
    }

    const avg = Math.round(results.reduce((a, r) => a + r.score, 0) / Math.max(1, results.length));
    const failingScenes = results.filter((r) => !r.passed || r.score < minScore);
    const scenesNeedingRegen = failingScenes.map((r) => r.index);
    const passed = scenesNeedingRegen.length === 0 && avg >= minScore;

    // Aggregate reject reasons (unique).
    const reasonSet = new Set<string>();
    for (const r of failingScenes) {
      for (const [rule, ok] of Object.entries(r.rule_flags)) {
        if (!ok) reasonSet.add(`scene${r.index}:${rule}`);
      }
      for (const txt of r.reasons) reasonSet.add(`scene${r.index}:${txt}`.slice(0, 160));
    }
    const rejectReasons = Array.from(reasonSet).slice(0, 24);

    const fidelityReport = {
      checked_at: new Date().toISOString(),
      source_image_count: sourceImages.length,
      min_score: minScore,
      score: avg,
      passed,
      scenes: results,
    };

    await admin.from("cinematic_ad_jobs").update({
      fidelity_report: fidelityReport,
      fidelity_score: avg,
      fidelity_passed: passed,
      fidelity_reject_reasons: rejectReasons,
      scenes_needing_regen: scenesNeedingRegen,
      fidelity_checked_at: new Date().toISOString(),
    }).eq("id", jobId);

    console.log(`[fidelity] ${traceId} job=${jobId} score=${avg} passed=${passed} regen=${scenesNeedingRegen.join(",")}`);
    return json(200, { ok: true, traceId, report: fidelityReport });
  } catch (e) {
    console.error("[fidelity] error", e);
    return json(500, { ok: false, traceId, message: e instanceof Error ? e.message : String(e) });
  }
});