// PCIE2 Creative Worker — resumable, time-boxed queue worker.
// Constraints:
//   - Hard runtime cap 55s per invocation.
//   - Persists progress after every creative (idempotent insert).
//   - Auto-chains itself if jobs remain and creative count < TARGET.
//   - Stops automatically at TARGET; triggers pcie2-step5-validate when crossing target.
//   - Respects Evolution Guard (SIM_THRESHOLD 0.88) and quality gate (>=70).
//   - No Pinterest publishing, no API calls beyond AI gateway + DB.
import { createClient } from "npm:@supabase/supabase-js@2";
import { chatJson, embed, pgvector, cosine } from "../_shared/pcie2-ai.ts";
import { SIM_THRESHOLD, MAX_EVOLUTION_ATTEMPTS } from "../_shared/pcie2-evolution.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const SUPA = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const MODEL = "google/gemini-3-flash-preview";
const PROMPT_VERSION = "creative.v1";
const TARGET = 1000;
const QUALITY_MIN = 70;
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

async function generateBrief(product: { name: string; category: string | null }, concept: string, attempt: number) {
  const system =
    "You are an art director for premium US pet ecommerce on Pinterest. " +
    "Reply ONLY with JSON: {prompt:string, negative_prompt:string, layout:string, camera_angle:string, lighting:string, background:string, breed:string, pose:string, composition:string, style:string, cta:string, quality:number, predicted_ctr:number, pinterest_score:number, ai_confidence:number}.";
  const prompt =
    `Product: "${product.name}" (category ${product.category ?? "pet"}). Concept: "${concept}". Attempt #${attempt}. ` +
    `Compose a Pinterest-native creative brief. No watermarks, no on-product text, no AI fluff. ` +
    `Lighting/background/camera_angle/composition must each be 1 short phrase. ` +
    `predicted_ctr 0–1, pinterest_score 0–100, ai_confidence 0–100, quality 0–100.`;
  return await chatJson<any>({ model: MODEL, system, prompt, temperature: 0.95 });
}

async function processJob(job: any, report: any) {
  const { data: prod } = await SUPA.from("products").select("id,name,category").eq("id", job.product_id).maybeSingle();
  if (!prod) {
    await SUPA.from("pcie2_creative_jobs").update({ status: "failed", last_error: "product_missing", completed_at: new Date().toISOString() }).eq("id", job.id);
    report.failed++; return;
  }

  // Existing siblings for evolution guard
  const { data: existing } = await SUPA.from("pcie2_creatives")
    .select("id,embedding,concept").eq("product_id", prod.id).eq("retired", false).limit(200);
  const existingVecs: number[][] = ((existing ?? []) as any[])
    .map((r) => (typeof r.embedding === "string" ? JSON.parse(r.embedding) : r.embedding))
    .filter(Array.isArray);
  const sameConcept = (existing ?? []).find((r: any) => r.concept === job.concept);
  if (sameConcept) {
    await SUPA.from("pcie2_creative_jobs").update({
      status: "done", creative_id: sameConcept.id, completed_at: new Date().toISOString(), last_error: "already_exists",
    }).eq("id", job.id);
    report.duplicate_prevented++; return;
  }

  const [{ data: heads }, { data: hooks }] = await Promise.all([
    SUPA.from("pcie2_headline_library").select("id,headline").eq("source_category", prod.category).eq("retired", false).limit(50),
    SUPA.from("pcie2_hook_library").select("id,hook").eq("product_id", prod.id).eq("retired", false).limit(50),
  ]);

  let brief: any = null;
  let vec: number[] = [];
  let attempts = 0;
  let lastReason = "";
  let accepted = false;
  let regenerated = false;

  while (attempts < MAX_EVOLUTION_ATTEMPTS && !accepted) {
    attempts++;
    if (attempts > 1) regenerated = true;
    try {
      brief = await generateBrief(prod, job.concept, attempts);
      const quality = Number(brief.quality ?? 0);
      if (quality < QUALITY_MIN) { lastReason = `quality_${quality}_lt_${QUALITY_MIN}`; continue; }
      const text = `${brief.prompt} ${brief.layout} ${brief.camera_angle} ${brief.lighting} ${brief.background} ${brief.composition} ${brief.style}`;
      const [v] = await embed([text]);
      vec = v ?? [];
      if (!vec.length) { lastReason = "embed_empty"; continue; }
      const maxSim = existingVecs.reduce((m, e) => Math.max(m, cosine(vec, e)), 0);
      if (maxSim >= SIM_THRESHOLD) { lastReason = `sim_${maxSim.toFixed(3)}_ge_${SIM_THRESHOLD}`; continue; }
      accepted = true;
    } catch (e) {
      lastReason = `ai_error:${(e as Error).message?.slice(0, 120)}`;
    }
  }

  if (regenerated && accepted) report.regenerated++;

  if (!accepted) {
    await SUPA.from("pcie2_creative_jobs").update({
      status: "skipped", last_error: lastReason || "evolution_blocked", completed_at: new Date().toISOString(),
    }).eq("id", job.id);
    report.skipped++; return;
  }

  const headline = heads?.[Math.floor(Math.random() * (heads?.length ?? 1))];
  const hook = hooks?.[Math.floor(Math.random() * (hooks?.length ?? 1))];
  const row = {
    product_id: prod.id,
    category: prod.category,
    concept: job.concept,
    prompt: String(brief.prompt ?? "").slice(0, 4000),
    negative_prompt: String(brief.negative_prompt ?? "").slice(0, 1000),
    layout: brief.layout,
    camera_angle: brief.camera_angle,
    lighting: brief.lighting,
    background: brief.background,
    animal_breed: brief.breed,
    pet_pose: brief.pose,
    composition: brief.composition,
    visual_style: brief.style,
    cta: brief.cta,
    headline: headline?.headline ?? null,
    hook: hook?.hook ?? null,
    headline_id: headline?.id ?? null,
    hook_id: hook?.id ?? null,
    quality_score: Number(brief.quality ?? 70),
    predicted_ctr: Number(brief.predicted_ctr ?? 0.012),
    pinterest_score: Number(brief.pinterest_score ?? 70),
    ai_confidence: Number(brief.ai_confidence ?? 80),
    duplicate_score: 0,
    evolution_attempts: attempts,
    model_version: MODEL,
    prompt_version: PROMPT_VERSION,
    status: "draft",
    embedding: pgvector(vec),
    creative_dna: { concept: job.concept, attempts },
    scores: { quality: brief.quality, predicted_ctr: brief.predicted_ctr, pinterest_score: brief.pinterest_score },
  };

  // Idempotent insert — unique (product_id, concept) where retired=false
  const { data: ins, error } = await SUPA.from("pcie2_creatives").insert(row).select("id").maybeSingle();
  if (error) {
    // Duplicate from unique index → mark prevented
    if (String(error.message || "").includes("duplicate key")) {
      const { data: existingRow } = await SUPA.from("pcie2_creatives")
        .select("id").eq("product_id", prod.id).eq("concept", job.concept).eq("retired", false).maybeSingle();
      await SUPA.from("pcie2_creative_jobs").update({
        status: "done", creative_id: existingRow?.id ?? null, completed_at: new Date().toISOString(), last_error: "duplicate_prevented",
      }).eq("id", job.id);
      report.duplicate_prevented++; return;
    }
    await SUPA.from("pcie2_creative_jobs").update({
      status: "failed", last_error: error.message.slice(0, 200), completed_at: new Date().toISOString(),
    }).eq("id", job.id);
    report.failed++; return;
  }

  await SUPA.from("pcie2_creative_jobs").update({
    status: "done", creative_id: ins?.id ?? null, completed_at: new Date().toISOString(),
  }).eq("id", job.id);
  report.generated++;
}

async function chainNextWorker() {
  // Background self-invocation that survives handler return (edge runtime).
  const p = fetch(`${SUPA_URL}/functions/v1/pcie2-creative-worker`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ANON}`, "apikey": ANON },
    body: JSON.stringify({ chained: true }),
  }).catch(() => {});
  // @ts-ignore - EdgeRuntime is provided by Supabase Edge Runtime
  try { (globalThis as any).EdgeRuntime?.waitUntil?.(p); } catch { /* ignore */ }
}

async function triggerStep5() {
  const p = fetch(`${SUPA_URL}/functions/v1/pcie2-step5-validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ANON}`, "apikey": ANON },
    body: JSON.stringify({ triggered_by: "worker_target_reached" }),
  }).catch(() => {});
  // @ts-ignore
  try { (globalThis as any).EdgeRuntime?.waitUntil?.(p); } catch { /* ignore */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const startedAt = Date.now();
  const deadline = startedAt + RUNTIME_BUDGET_MS;
  const token = crypto.randomUUID();

  const report: any = {
    batch_id: token, generated: 0, failed: 0, regenerated: 0, skipped: 0,
    duplicate_prevented: 0, claimed: 0, remaining: 0, total_creatives_before: 0,
    total_creatives_after: 0, target: TARGET, target_reached: false,
    chained: false, runtime_ms: 0,
  };

  report.total_creatives_before = await totalCreatives();
  if (report.total_creatives_before >= TARGET) {
    report.target_reached = true;
    await triggerStep5();
    report.runtime_ms = Date.now() - startedAt;
    return new Response(JSON.stringify({ ok: true, message: "target_reached", report }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  while (Date.now() < deadline) {
    if ((await totalCreatives()) >= TARGET) break;
    const { data: claimed } = await SUPA.rpc("pcie2_claim_creative_jobs", { p_limit: BATCH_CLAIM, p_token: token });
    if (!claimed?.length) break;
    report.claimed += claimed.length;
    for (const job of claimed) {
      if (Date.now() >= deadline) {
        // Release un-processed job back to queued
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

  // Throughput → ETA
  const elapsedSec = Math.max(1, report.runtime_ms / 1000);
  const ratePerSec = report.generated / elapsedSec; // creatives/sec
  const need = Math.max(0, TARGET - report.total_creatives_after);
  report.estimated_completion_seconds = ratePerSec > 0 ? Math.round(need / ratePerSec) : null;
  report.estimated_completion_iso = ratePerSec > 0
    ? new Date(Date.now() + (need / ratePerSec) * 1000).toISOString() : null;

  if (report.total_creatives_after >= TARGET) {
    report.target_reached = true;
  } else if (report.remaining > 0 && report.claimed > 0) {
    report.chained = true;
  }

  // Persist batch report
  await SUPA.from("pcie2_runs").insert({
    run_type: "creative_worker_batch",
    status: "succeeded",
    totals: report,
    finished_at: new Date().toISOString(),
  });

  if (report.target_reached) await triggerStep5();
  else if (report.chained) await chainNextWorker();

  return new Response(JSON.stringify({ ok: true, report }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});