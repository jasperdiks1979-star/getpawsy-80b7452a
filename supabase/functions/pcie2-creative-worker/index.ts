// PCIE2 Creative Worker v2 — mutation-first Evolution Guard.
// On low quality (<70) or high cosine similarity (>=0.88), sequentially mutate
// angle -> headline -> cta -> visual -> emotion before rejecting.
// Inserts include family + visual_fingerprint so the 4-key uniqueness index
// allows multiple distinct creatives per (product, concept).
import { createClient } from "npm:@supabase/supabase-js@2";
import { chatJson, embed, pgvector, cosine } from "../_shared/pcie2-ai.ts";
import { SIM_THRESHOLD } from "../_shared/pcie2-evolution.ts";
import {
  MUTATION_STRATEGIES, ENGINE_V2,
  pickVisualDNA, fingerprintVisualDNA,
} from "../_shared/pcie2-engine-v2.ts";
import {
  compilePrompt as compileGoldenPrompt,
  writeCompilerLedger,
} from "../_shared/golden-dna-compiler.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const SUPA = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const MODEL = "google/gemini-3-flash-preview";
const PROMPT_VERSION = "creative.v2.mutation";
const TARGET = ENGINE_V2.TARGET_CREATIVES;
const QUALITY_MIN = ENGINE_V2.QUALITY_MIN;
const RUNTIME_BUDGET_MS = 55_000;
const BATCH_CLAIM = 4;
const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function totalCreatives(): Promise<number> {
  const { count } = await SUPA.from("pcie2_creatives").select("*", { count: "exact", head: true }).eq("retired", false);
  return count ?? 0;
}
async function queuedCount(): Promise<number> {
  const { count } = await SUPA.from("pcie2_creative_jobs").select("*", { count: "exact", head: true }).eq("status", "queued");
  return count ?? 0;
}

async function generateBrief(product: { name: string; category: string | null }, concept: string, family: string | null, mutationHint?: string) {
  const system =
    "You are an art director for premium US pet ecommerce on Pinterest. " +
    "Reply ONLY with JSON: {prompt:string, negative_prompt:string, layout:string, camera_angle:string, lighting:string, background:string, breed:string, pose:string, composition:string, style:string, headline:string, cta:string, primary_emotion:string, quality:number, predicted_ctr:number, pinterest_score:number, ai_confidence:number}.";
  const prompt =
    `Product: "${product.name}" (category ${product.category ?? "pet"}).
Concept angle: "${concept}".
Creative family: ${family ?? "lifestyle"}.
${mutationHint ? `MUTATION DIRECTIVE: ${mutationHint}` : ""}
Compose a Pinterest-native creative brief. No watermarks, no on-product text, no AI fluff.
Lighting/background/camera_angle/composition each one short phrase.
headline 6-12 words, cta 2-5 words, primary_emotion one word.
predicted_ctr 0-1, pinterest_score 0-100, ai_confidence 0-100, quality 0-100.`;
  return await chatJson<any>({ model: MODEL, system, prompt, temperature: 0.95 });
}

async function logMutation(row: any) {
  await SUPA.from("pcie2_mutation_log").insert(row).then(() => {}, () => {});
}

async function processJob(job: any, report: any) {
  const { data: prod } = await SUPA.from("products").select("id,name,category").eq("id", job.product_id).maybeSingle();
  if (!prod) {
    await SUPA.from("pcie2_creative_jobs").update({ status: "failed", last_error: "product_missing", completed_at: new Date().toISOString() }).eq("id", job.id);
    report.failed++; return;
  }

  // Siblings for similarity
  const { data: existing } = await SUPA.from("pcie2_creatives")
    .select("id,embedding").eq("product_id", prod.id).eq("retired", false).limit(200);
  const existingVecs: number[][] = ((existing ?? []) as any[])
    .map((r) => (typeof r.embedding === "string" ? JSON.parse(r.embedding) : r.embedding))
    .filter(Array.isArray);

  const family: string | null = job.family ?? null;
  let visualFingerprint: string = job.visual_fingerprint ?? fingerprintVisualDNA(pickVisualDNA(Date.now()));
  let brief: any = null;
  let vec: number[] = [];
  let lastReason = "";
  let accepted = false;
  let mutationPath: string[] = [];
  let mutationCount = 0;

  // Base attempts (no mutation) then escalate through mutation strategies
  const strategies: { strategy: string | null; instruction?: string }[] = [
    ...Array(ENGINE_V2.MAX_BASE_ATTEMPTS).fill({ strategy: null }),
    ...MUTATION_STRATEGIES.map((m) => ({ strategy: m.strategy, instruction: m.instruction })),
  ];

  for (const step of strategies) {
    if (accepted) break;
    if (step.strategy) {
      mutationCount++;
      mutationPath.push(step.strategy);
      // visual strategy → roll a new fingerprint
      if (step.strategy === "visual") {
        visualFingerprint = fingerprintVisualDNA(pickVisualDNA(Date.now() + mutationCount * 1009));
      }
    }
    try {
      const before = brief;
      brief = await generateBrief(prod, job.concept, family, step.instruction);
      const quality = Number(brief.quality ?? 0);
      if (quality < QUALITY_MIN) {
        lastReason = `quality_${quality}_lt_${QUALITY_MIN}`;
        if (step.strategy) {
          await logMutation({
            job_id: job.id, product_id: prod.id, reason: "low_quality", strategy: step.strategy,
            attempt: mutationCount, before, after: brief, outcome: "retry",
            quality_before: Number(before?.quality ?? 0), quality_after: quality,
          });
        }
        continue;
      }
      const text = `${brief.prompt} ${brief.headline} ${brief.cta} ${brief.layout} ${brief.camera_angle} ${brief.lighting} ${brief.background} ${brief.composition} ${brief.style} ${visualFingerprint}`;
      const [v] = await embed([text]);
      vec = v ?? [];
      if (!vec.length) { lastReason = "embed_empty"; continue; }
      const maxSim = existingVecs.reduce((m, e) => Math.max(m, cosine(vec, e)), 0);
      if (maxSim >= SIM_THRESHOLD) {
        lastReason = `sim_${maxSim.toFixed(3)}_ge_${SIM_THRESHOLD}`;
        if (step.strategy) {
          await logMutation({
            job_id: job.id, product_id: prod.id, reason: "high_similarity", strategy: step.strategy,
            attempt: mutationCount, before, after: brief, outcome: "retry",
            similarity_before: maxSim, similarity_after: maxSim,
          });
        }
        continue;
      }
      accepted = true;
      if (step.strategy) {
        await logMutation({
          job_id: job.id, product_id: prod.id, reason: lastReason || "ok", strategy: step.strategy,
          attempt: mutationCount, before, after: brief, outcome: "accepted",
          quality_after: quality, similarity_after: maxSim,
        });
        report.mutated++;
      }
    } catch (e) {
      lastReason = `ai_error:${(e as Error).message?.slice(0, 120)}`;
    }
  }

  if (!accepted) {
    await SUPA.from("pcie2_creative_jobs").update({
      status: "skipped", last_error: lastReason || "evolution_blocked",
      mutation_attempts: mutationCount, last_mutation_strategy: mutationPath.at(-1) ?? null,
      completed_at: new Date().toISOString(),
    }).eq("id", job.id);
    report.similarity_prevented++;
    return;
  }

  // Register visual DNA fingerprint usage (idempotent)
  await SUPA.from("pcie2_visual_dna").upsert({
    fingerprint: visualFingerprint,
    camera_angle: brief.camera_angle, lighting: brief.lighting,
    background: brief.background, composition: brief.composition,
    pet_breed: brief.breed, layout: brief.layout,
    uses_count: 1, last_used_at: new Date().toISOString(),
  }, { onConflict: "fingerprint" }).then(() => {}, () => {});

  // Genesis V6.4 — Golden DNA Prompt Compiler gate for PCIE2 briefs.
  // Deterministic compilation must pass BEFORE the brief is persisted, so
  // downstream assemblers only ever render species-locked, occupancy-
  // targeted prompts. No thresholds lowered.
  const compiled = compileGoldenPrompt(
    { id: prod.id, name: prod.name, category: prod.category } as any,
    { minPredictedPre: 90, maxMutations: 3 },
  );
  const traceId = `pcie2_${job.id}`;
  const ledgerId = await writeCompilerLedger(SUPA as any, {
    trace_id: traceId,
    product_id: prod.id,
    product_slug: null,
    rule_hash: compiled.rule_hash,
    compiled_prompt: compiled.prompt,
    rule_set: compiled.rule_set,
    predicted_pre: compiled.predicted_pre,
    dominant_blocker: compiled.dominant_blocker,
    qa_blockers: compiled.qa_blockers,
    mutation_step: compiled.mutation_step,
    gemini_called: compiled.ok,
    source_function: "pcie2-creative-worker",
  });
  if (!compiled.ok) {
    await SUPA.from("pcie2_creative_jobs").update({
      status: "skipped",
      last_error: `golden_dna_gate:${compiled.reason ?? "predicted_pre_below_90"}`,
      completed_at: new Date().toISOString(),
    }).eq("id", job.id);
    report.similarity_prevented++;
    return;
  }
  const fusedPrompt = `${String(brief.prompt ?? "")}\n\n[GOLDEN_DNA_COMPILER trace=${traceId} ledger=${ledgerId ?? "n/a"} pred_pre=${compiled.predicted_pre}]\n${compiled.prompt}`;

  const row = {
    product_id: prod.id,
    category: prod.category,
    concept: job.concept,
    family,
    visual_fingerprint: visualFingerprint,
    concept_node_id: job.concept_node_id ?? null,
    prompt: fusedPrompt.slice(0, 4000),
    negative_prompt: String(brief.negative_prompt ?? "").slice(0, 1000),
    layout: brief.layout,
    camera_angle: brief.camera_angle,
    lighting: brief.lighting,
    background: brief.background,
    animal_breed: brief.breed,
    pet_pose: brief.pose,
    composition: brief.composition,
    visual_style: brief.style,
    headline: brief.headline ?? null,
    cta: brief.cta,
    primary_emotion: brief.primary_emotion ?? null,
    quality_score: Number(brief.quality ?? 70),
    predicted_ctr: Number(brief.predicted_ctr ?? 0.012),
    pinterest_score: Number(brief.pinterest_score ?? 70),
    ai_confidence: Number(brief.ai_confidence ?? 80),
    duplicate_score: 0,
    evolution_attempts: ENGINE_V2.MAX_BASE_ATTEMPTS + mutationCount,
    mutation_path: mutationPath,
    model_version: MODEL,
    prompt_version: PROMPT_VERSION,
    status: "draft",
    embedding: pgvector(vec),
    creative_dna: { concept: job.concept, family, mutations: mutationPath },
    scores: { quality: brief.quality, predicted_ctr: brief.predicted_ctr, pinterest_score: brief.pinterest_score },
  };

  const { data: ins, error } = await SUPA.from("pcie2_creatives").insert(row).select("id").maybeSingle();
  if (error) {
    if (String(error.message || "").includes("duplicate key")) {
      await SUPA.from("pcie2_creative_jobs").update({
        status: "done", last_error: "duplicate_prevented", completed_at: new Date().toISOString(),
      }).eq("id", job.id);
      report.duplicate_prevented++; return;
    }
    await SUPA.from("pcie2_creative_jobs").update({
      status: "failed", last_error: error.message.slice(0, 200), completed_at: new Date().toISOString(),
    }).eq("id", job.id);
    report.failed++; return;
  }

  await SUPA.from("pcie2_creative_jobs").update({
    status: "done", creative_id: ins?.id ?? null,
    mutation_attempts: mutationCount,
    last_mutation_strategy: mutationPath.at(-1) ?? null,
    completed_at: new Date().toISOString(),
  }).eq("id", job.id);
  report.generated++;

  // Bump concept usage so self-healer rotates
  if (job.concept_node_id) {
    await SUPA.rpc("noop").then(() => {}, () => {});
    await SUPA.from("pcie2_concept_graph").update({
      last_used_at: new Date().toISOString(),
    }).eq("id", job.concept_node_id);
  }
}

function chain(name: string, payload: any) {
  const p = fetch(`${SUPA_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ANON}`, "apikey": ANON },
    body: JSON.stringify(payload),
  }).catch(() => {});
  try { (globalThis as any).EdgeRuntime?.waitUntil?.(p); } catch { /* ignore */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const startedAt = Date.now();
  const deadline = startedAt + RUNTIME_BUDGET_MS;
  const token = crypto.randomUUID();

  const report: any = {
    batch_id: token, generated: 0, failed: 0, mutated: 0,
    similarity_prevented: 0, duplicate_prevented: 0, claimed: 0, remaining: 0,
    total_creatives_before: 0, total_creatives_after: 0, target: TARGET,
    target_reached: false, chained: false, runtime_ms: 0,
  };

  report.total_creatives_before = await totalCreatives();
  if (report.total_creatives_before >= TARGET) {
    report.target_reached = true;
    chain("pcie2-step5-validate", { triggered_by: "worker_target_reached" });
    report.runtime_ms = Date.now() - startedAt;
    return new Response(JSON.stringify({ ok: true, message: "target_reached", report }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  while (Date.now() < deadline) {
    if ((await totalCreatives()) >= TARGET) break;
    const { data: claimed } = await SUPA.rpc("pcie2_claim_creative_jobs", { p_limit: BATCH_CLAIM, p_token: token });
    if (!claimed?.length) {
      // No jobs: ask self-healer to enqueue then break out so we chain
      chain("pcie2-self-healer", { triggered_by: "worker_empty" });
      break;
    }
    report.claimed += claimed.length;
    for (const job of claimed) {
      if (Date.now() >= deadline) {
        await SUPA.from("pcie2_creative_jobs").update({ status: "queued", claim_token: null }).eq("id", job.id);
        continue;
      }
      try { await processJob(job, report); }
      catch (e) {
        await SUPA.from("pcie2_creative_jobs").update({
          status: "failed", last_error: `unhandled:${(e as Error).message?.slice(0, 180)}`, completed_at: new Date().toISOString(),
        }).eq("id", job.id);
        report.failed++;
      }
    }
  }

  report.total_creatives_after = await totalCreatives();
  report.remaining = await queuedCount();
  report.runtime_ms = Date.now() - startedAt;

  if (report.total_creatives_after >= TARGET) {
    report.target_reached = true;
    chain("pcie2-step5-validate", { triggered_by: "worker_target_reached" });
  } else if (report.remaining > 0) {
    report.chained = true;
    chain("pcie2-creative-worker", { chained: true });
  } else {
    chain("pcie2-self-healer", { triggered_by: "worker_drained" });
  }

  await SUPA.from("pcie2_runs").insert({
    run_type: "creative_worker_v2_batch", status: "succeeded",
    totals: report, finished_at: new Date().toISOString(),
  }).then(() => {}, () => {});

  return new Response(JSON.stringify({ ok: true, report }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
