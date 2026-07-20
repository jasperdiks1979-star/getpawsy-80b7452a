// Premium Lifestyle Engine V3 — orchestrator
// Gated behind pinterest_lifestyle_engine_config.enabled. Returns {killed:true}
// when the master flag is off so no AI credits are ever consumed by accident.

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

type Mode = "pilot" | "full" | "single_product" | "dry_run";

interface RunRequest {
  mode?: Mode;
  product_ids?: string[];
  dry_run?: boolean;
  force?: boolean; // admin override for the engine_disabled gate; still respects dry_run
}

const SCENE_TEMPLATES = [
  "sunlit modern US living room, golden hour, hardwood floor",
  "cozy Scandinavian bedroom, soft morning light, linen bedding",
  "bright minimalist kitchen, marble counters, plants on the windowsill",
  "rustic farmhouse porch, wide planks, soft overcast daylight",
  "warm reading nook, oversized armchair, throw blanket, fall light",
];

function buildScenePrompt(productName: string, species: string, idx: number): string {
  const scene = SCENE_TEMPLATES[idx % SCENE_TEMPLATES.length];
  const pet = species === "cat" ? "a relaxed adult cat" : "a happy adult dog";
  return [
    `Editorial Pinterest lifestyle photograph, vertical 1000x1500, premium US home aesthetic.`,
    `Scene: ${scene}.`,
    `Subject: ${pet} naturally interacting with a ${productName}, candid emotional moment with a US pet owner partially in frame.`,
    `Style: shot on 35mm full-frame, shallow depth of field, natural color grade, soft directional window light, no on-image text, no watermark, no logos.`,
    `Forbidden: white seamless backdrop, studio cutout, supplier catalog look, Chinese text, infographics, multi-panel grids, AI-uncanny artifacts.`,
  ].join(" ");
}

async function loadConfig(supabase: any) {
  const { data, error } = await supabase
    .from("pinterest_lifestyle_engine_config")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const traceId = crypto.randomUUID();
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const body: RunRequest = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const mode: Mode = body.mode ?? "pilot";
    const dryRun = body.dry_run === true || mode === "dry_run";

    const config = await loadConfig(supabase);
    if (!config) {
      return new Response(JSON.stringify({ ok: false, traceId, message: "config_missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Master kill switch
    if (!config.enabled && !body.force) {
      return new Response(
        JSON.stringify({
          ok: true,
          traceId,
          killed: true,
          reason: "engine_disabled",
          message:
            "Lifestyle Engine V3 is built but disabled. Set pinterest_lifestyle_engine_config.enabled=true to activate.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Pick products
    const limit =
      mode === "single_product"
        ? (body.product_ids?.length ?? 1)
        : mode === "pilot"
          ? config.pilot_product_limit
          : 100;

    let productQuery = supabase
      .from("products")
      .select("id, slug, name, primary_species, image_url")
      .eq("pinterest_eligible", true)
      .not("image_url", "is", null)
      .limit(limit);

    if (body.product_ids?.length) productQuery = productQuery.in("id", body.product_ids);

    const { data: products, error: prodErr } = await productQuery;
    if (prodErr) throw prodErr;

    const conceptsPlanned = (products?.length ?? 0) * config.concepts_per_product;
    const estCredits =
      conceptsPlanned * config.max_attempts_per_concept * Number(config.estimated_credits_per_image) +
      conceptsPlanned * config.max_attempts_per_concept * Number(config.estimated_credits_per_vision);

    // Create run row
    const { data: run, error: runErr } = await supabase
      .from("pinterest_lifestyle_runs")
      .insert({
        mode,
        status: dryRun ? "completed" : "running",
        product_ids: products?.map((p: any) => p.id) ?? [],
        concepts_planned: conceptsPlanned,
        credits_budget: config.daily_credit_budget,
        config_snapshot: config,
        started_at: new Date().toISOString(),
        completed_at: dryRun ? new Date().toISOString() : null,
      })
      .select("*")
      .single();
    if (runErr) throw runErr;

    // Build pending concept rows (no AI calls)
    const conceptRows: any[] = [];
    for (const p of products ?? []) {
      for (let i = 0; i < config.concepts_per_product; i++) {
        const brief = `Concept ${i + 1}/${config.concepts_per_product} — ${SCENE_TEMPLATES[i % SCENE_TEMPLATES.length]}`;
        conceptRows.push({
          product_id: p.id,
          product_slug: p.slug,
          concept_index: i,
          scene_brief: brief,
          image_prompt: buildScenePrompt(p.name, p.primary_species ?? "pet", i),
          source_image_url: p.image_url,
          status: dryRun ? "skipped" : "pending",
          rejection_reason: dryRun ? "dry_run" : null,
          run_id: run.id,
        });
      }
    }

    if (conceptRows.length) {
      await supabase.from("pinterest_lifestyle_concepts").insert(conceptRows);
    }

    // In dry-run we stop here. Real generation/scoring runs in a separate
    // worker invocation (lifestyle-engine-render) which we do NOT auto-trigger
    // from inside the engine_disabled gate above.
    if (dryRun) {
      return new Response(
        JSON.stringify({
          ok: true,
          traceId,
          run_id: run.id,
          mode,
          products: products?.length ?? 0,
          concepts_planned: conceptsPlanned,
          estimated_credits: Number(estCredits.toFixed(2)),
          dry_run: true,
          message: "Dry run — no AI credits consumed.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Live execution path is intentionally NOT implemented in this commit.
    // It will be added once the engine is approved for activation; the row
    // remains in 'running' status so it is visible as a pending build-out.
    return new Response(
      JSON.stringify({
        ok: true,
        traceId,
        run_id: run.id,
        mode,
        products: products?.length ?? 0,
        concepts_planned: conceptsPlanned,
        estimated_credits: Number(estCredits.toFixed(2)),
        message:
          "Run row created and concepts queued. Live render+score worker not yet wired (intentional — requires LOVABLE_API_KEY credits).",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, traceId, message: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
