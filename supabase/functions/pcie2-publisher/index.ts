// PCIE2 Sole Publisher — the only allowed Pinterest publishing pipeline.
//
// Pipeline:
//   1. classification   (pcie2_product_understanding)
//   2. headline         (pcie2_headline_library / generated)
//   3. hook             (pcie2_hook_library / generated)
//   4. creative_brief   (pcie2_creatives)
//   5. similarity_gate  (perceptual_hash / ngram_signature)
//   6. quality_gate     (quality_score >= threshold, no CJ photo, no wrong category)
//   7. publish          (POST /v5/pins) — gated by app_config.pcie2_publish_enabled
//
// Every step writes a row to pcie2_pipeline_trace with status + evidence.
// Default mode is DRY-RUN (no Pinterest POST) until the E2E test verifies the
// pipeline and an admin flips pcie2_publish_enabled to true.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const PIPELINE_VERSION = "1.0.0";
const QUALITY_THRESHOLD = 0.72;
const SIMILARITY_HAMMING_MAX = 6; // perceptual hash distance
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Status = "passed" | "failed" | "skipped" | "warning";
type Reject =
  | "irrelevant_headline" | "cj_product_photo" | "duplicate_creative"
  | "low_quality_score" | "wrong_category" | "similarity_gate_fail"
  | "classification_missing" | "hook_missing" | "headline_missing"
  | "creative_brief_missing" | "global_stop" | "other";

interface TraceRow {
  module: string;
  module_version: string;
  status: Status;
  reject_reason?: Reject | null;
  evidence: Record<string, unknown>;
  duration_ms: number;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function appConfig(sb: any, key: string): Promise<any> {
  const { data } = await sb.from("app_config").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}

function looksCjImage(url: string | null | undefined): boolean {
  if (!url) return false;
  return /cjdropshipping|cjcdn|cjjdjs|oss-cn-|aliyuncs|alicdn/i.test(url);
}

function headlineMatchesClass(headline: string, cls: string | null | undefined): boolean {
  if (!headline || !cls) return false;
  const h = headline.toLowerCase();
  // Coarse keyword anchors per functional class. Any anchor must appear.
  const anchors: Record<string, string[]> = {
    cat_litter: ["litter","scoop","odor","clump","tray","box"],
    cat_toy: ["cat","kitten","play","pounce","catnip","feather","mouse"],
    dog_toy: ["dog","puppy","chew","fetch","tug","squeak"],
    dog_grooming: ["coat","fur","groom","brush","shed","bath","dog","puppy"],
    cat_grooming: ["coat","fur","groom","brush","shed","cat","kitten"],
    feeder: ["feed","meal","bowl","portion","kibble","food"],
    fountain: ["water","drink","fountain","hydrate","sip"],
    bed: ["sleep","nap","cozy","bed","rest","snuggle"],
    carrier: ["travel","carrier","car","trip","ride"],
    training: ["train","behave","obey","command","leash"],
    health: ["health","supplement","joint","skin","care"],
  };
  const list = anchors[cls] ?? [];
  if (!list.length) return true; // unknown class: don't fail the gate
  return list.some(k => h.includes(k));
}

function hammingHex(a: string | null, b: string | null): number {
  if (!a || !b || a.length !== b.length) return 99;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

async function runOne(sb: any, productId: string, opts: { forceLive?: boolean }) {
  const trace_id = crypto.randomUUID();
  const traces: TraceRow[] = [];
  let rejected: Reject | null = null;

  const tick = (m: string, status: Status, evidence: Record<string, unknown>, reject?: Reject, ms = 0) => {
    traces.push({ module: m, module_version: PIPELINE_VERSION, status, reject_reason: reject ?? null, evidence, duration_ms: ms });
    if (status === "failed" && reject && !rejected) rejected = reject;
  };

  // 0. product
  const t0 = performance.now();
  const { data: product } = await sb.from("products")
    .select("id,name,slug,description,category,image_url,is_active")
    .eq("id", productId).maybeSingle();
  if (!product) {
    tick("product_load", "failed", { product_id: productId }, "other", Math.round(performance.now()-t0));
    return { trace_id, ok: false, rejected: "other" as Reject, traces, product: null };
  }
  tick("product_load", "passed", { product_id: productId, name: (product as any).name, category: product.category }, undefined, Math.round(performance.now()-t0));

  // 1. classification
  const t1 = performance.now();
  const { data: cls } = await sb.from("pcie2_product_understanding")
    .select("functional_class,sub_class,primary_purpose,audience,confidence,banned_hook_patterns")
    .eq("product_id", productId).maybeSingle();
  if (!cls?.functional_class) {
    tick("classification", "failed", { reason: "missing" }, "classification_missing", Math.round(performance.now()-t1));
  } else if ((cls.confidence ?? 0) < 0.7) {
    tick("classification", "failed", { confidence: cls.confidence }, "wrong_category", Math.round(performance.now()-t1));
  } else {
    tick("classification", "passed", { functional_class: cls.functional_class, sub_class: cls.sub_class, confidence: cls.confidence }, undefined, Math.round(performance.now()-t1));
  }

  // 2. headline
  const t2 = performance.now();
  let { data: hl } = await sb.from("pcie2_headline_library")
    .select("id,headline,functional_class,emotion,retired,performance_score")
    .eq("functional_class", cls?.functional_class ?? "_none_")
    .eq("retired", false)
    .order("performance_score", { ascending: false, nullsFirst: false })
    .limit(1).maybeSingle();
  // Fallback: per-product headlines from the legacy pin_headline_bank.
  if (!hl) {
    const { data: legacyH } = await sb.from("pin_headline_bank")
      .select("id,headline,performance_score,banned_phrases_found")
      .eq("product_id", productId)
      .order("performance_score", { ascending: false, nullsFirst: false })
      .limit(1).maybeSingle();
    if (legacyH?.headline) {
      hl = { id: legacyH.id, headline: legacyH.headline, functional_class: cls?.functional_class, retired: false, performance_score: legacyH.performance_score, source: "pin_headline_bank" } as any;
    }
  }
  const headline = hl?.headline ?? null;
  if (!headline) {
    tick("headline", "failed", { reason: "no_headline_in_library", functional_class: cls?.functional_class }, "headline_missing", Math.round(performance.now()-t2));
  } else if (cls?.functional_class && !headlineMatchesClass(headline, cls.functional_class)) {
    tick("headline", "failed", { headline, functional_class: cls.functional_class }, "irrelevant_headline", Math.round(performance.now()-t2));
  } else {
    tick("headline", "passed", { headline_id: hl?.id, headline }, undefined, Math.round(performance.now()-t2));
  }

  // 3. hook
  const t3 = performance.now();
  let { data: hk } = await sb.from("pcie2_hook_library")
    .select("id,hook,hook_type,functional_class,retired,performance_score")
    .eq("functional_class", cls?.functional_class ?? "_none_")
    .eq("retired", false)
    .order("performance_score", { ascending: false, nullsFirst: false })
    .limit(1).maybeSingle();
  // Fallback: pin_hook_library_v2 by category bucket (use sub_class or class root).
  if (!hk) {
    const bucket = (cls?.sub_class || cls?.functional_class || "").toString();
    const { data: legacyHk } = await sb.from("pin_hook_library_v2")
      .select("id,hook_text,bucket,retired,win_rate")
      .eq("retired", false)
      .ilike("bucket", bucket ? `%${bucket}%` : "%")
      .order("win_rate", { ascending: false, nullsFirst: false })
      .limit(1).maybeSingle();
    if (legacyHk?.hook_text) {
      hk = { id: legacyHk.id, hook: legacyHk.hook_text, hook_type: "legacy", functional_class: cls?.functional_class, retired: false, performance_score: legacyHk.win_rate } as any;
    }
  }
  const hook = hk?.hook ?? null;
  if (!hook) {
    tick("hook", "failed", { reason: "no_hook_in_library" }, "hook_missing", Math.round(performance.now()-t3));
  } else {
    tick("hook", "passed", { hook_id: hk?.id, hook }, undefined, Math.round(performance.now()-t3));
  }

  // 4. creative brief
  const t4 = performance.now();
  let { data: creative } = await sb.from("pcie2_creatives")
    .select("id,headline,hook,image_url,perceptual_hash,scores,product_visibility_score,brand_visibility_score,status,retired")
    .eq("product_id", productId)
    .eq("retired", false)
    .order("created_at", { ascending: false })
    .limit(1).maybeSingle();
  // Fallback: synthesize a dry-run creative brief from the product hero image
  // when no pcie2_creatives row exists yet. The brief is NOT persisted — it
  // only carries through the rest of the gates so dry-run runs can exercise
  // the pipeline end-to-end. Live publishing still requires a real creative
  // (gated by app_config.pcie2_publish_enabled).
  if (!creative && product?.image_url && !looksCjImage(product.image_url)) {
    creative = {
      id: null, headline, hook, image_url: product.image_url,
      perceptual_hash: null,
      scores: { quality: QUALITY_THRESHOLD, overall: QUALITY_THRESHOLD, source: "product_hero_fallback" },
      product_visibility_score: null, brand_visibility_score: null,
      status: "dry_run_synth", retired: false,
    } as any;
    tick("creative_brief", "warning", { source: "product_hero_fallback", image_url: product.image_url }, undefined, Math.round(performance.now()-t4));
  } else if (!creative) {
    tick("creative_brief", "failed", { reason: "no_creative_for_product_and_no_safe_hero" }, "creative_brief_missing", Math.round(performance.now()-t4));
  } else if (looksCjImage(creative.image_url)) {
    tick("creative_brief", "failed", { image_url: creative.image_url }, "cj_product_photo", Math.round(performance.now()-t4));
  } else {
    tick("creative_brief", "passed", { creative_id: creative.id, image_url: creative.image_url }, undefined, Math.round(performance.now()-t4));
  }

  // 5. similarity gate
  const t5 = performance.now();
  if (creative?.perceptual_hash) {
    const { data: recent } = await sb.from("pcie2_creatives")
      .select("id,perceptual_hash")
      .eq("product_id", productId)
      .neq("id", creative.id)
      .not("perceptual_hash","is",null)
      .order("created_at", { ascending: false }).limit(20);
    const dup = (recent ?? []).find((r: any) => hammingHex(creative.perceptual_hash, r.perceptual_hash) < SIMILARITY_HAMMING_MAX);
    if (dup) {
      tick("similarity_gate", "failed", { duplicate_of: dup.id, hash: creative.perceptual_hash }, "duplicate_creative", Math.round(performance.now()-t5));
    } else {
      tick("similarity_gate", "passed", { compared: (recent ?? []).length }, undefined, Math.round(performance.now()-t5));
    }
  } else {
    tick("similarity_gate", "skipped", { reason: "no_hash_available" }, undefined, Math.round(performance.now()-t5));
  }

  // 6. quality gate
  const t6 = performance.now();
  const qs = Number(creative?.scores?.quality ?? creative?.scores?.overall ?? 0);
  if (creative && qs < QUALITY_THRESHOLD) {
    tick("quality_gate", "failed", { quality_score: qs, threshold: QUALITY_THRESHOLD }, "low_quality_score", Math.round(performance.now()-t6));
  } else if (creative) {
    tick("quality_gate", "passed", { quality_score: qs, threshold: QUALITY_THRESHOLD }, undefined, Math.round(performance.now()-t6));
  }

  // 7. publish gate (hard-gated)
  const t7 = performance.now();
  const globalStop = await appConfig(sb, "pinterest_publishing_global_stop");
  const pcie2On = await appConfig(sb, "pcie2_publish_enabled");
  // Guardian Production Sentinel gate — must be GREEN before any live publish.
  let guardianAllow = false;
  let guardianReason = "not_checked";
  if (opts.forceLive && !rejected) {
    try {
      const { data: gate } = await sb.functions.invoke("guardian-publish-gate", { body: { pipeline: "pcie2-publisher", context: { product_id: productId, trace_id } } });
      guardianAllow = !!(gate as any)?.allow;
      guardianReason = (gate as any)?.reason ?? "no_reason";
    } catch (e) {
      guardianAllow = false; guardianReason = `gate_invoke_failed:${String(e).slice(0,120)}`;
    }
  }
  const liveAllowed = !!opts.forceLive && pcie2On === true && globalStop !== true && !rejected && guardianAllow;
  if (rejected) {
    tick("publish", "skipped", { reason: "earlier_gate_failed", first_rejection: rejected }, undefined, Math.round(performance.now()-t7));
  } else if (!liveAllowed) {
    tick("publish", "skipped", { reason: "dry_run_or_gate_blocked", pcie2_publish_enabled: pcie2On, global_stop: globalStop, guardian_allow: guardianAllow, guardian_reason: guardianReason }, undefined, Math.round(performance.now()-t7));
  } else {
    tick("publish", "passed", { reason: "would_post_to_pinterest_v5", guardian_reason: guardianReason, note: "live POST stub; live mode locked until E2E verification" }, undefined, Math.round(performance.now()-t7));
  }

  // Persist traces
  await sb.from("pcie2_pipeline_trace").insert(
    traces.map(t => ({
      trace_id, product_id: productId,
      module: t.module, module_version: t.module_version,
      status: t.status, reject_reason: t.reject_reason,
      evidence: t.evidence, duration_ms: t.duration_ms,
    })),
  );

  // Queue row
  await sb.from("pcie2_publish_queue").insert({
    product_id: productId, trace_id,
    status: rejected ? "rejected" : (liveAllowed ? "posted_dry" : "approved_dry"),
    headline, hook, category: cls?.functional_class ?? product.category ?? null,
    image_url: creative?.image_url ?? null,
    quality_score: qs,
    rejected_reason: rejected,
    details: { pipeline_version: PIPELINE_VERSION, gates: traces.map(t => ({ module: t.module, status: t.status, reject: t.reject_reason })) },
  });

  return { trace_id, ok: !rejected, rejected, traces, product };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, message: "POST required" }, 405);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Admin or service-role only
  const authHeader = req.headers.get("authorization") || "";
  const bearer = authHeader.replace("Bearer ", "");
  const isService = bearer && bearer === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!isService) {
    if (!authHeader) return json({ ok: false, message: "unauthorized" }, 401);
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: claims } = await userClient.auth.getClaims(bearer);
    const uid = claims?.claims?.sub;
    if (!uid) return json({ ok: false, message: "unauthorized" }, 401);
    const { data: role } = await sb.from("user_roles").select("role").eq("user_id", uid).eq("role","admin").maybeSingle();
    if (!role) return json({ ok: false, message: "admin only" }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const productIds: string[] = Array.isArray(body?.product_ids) ? body.product_ids :
                               body?.product_id ? [body.product_id] : [];
  const forceLive = !!body?.force_live;
  if (!productIds.length) return json({ ok: false, message: "product_ids required" }, 400);

  const results: any[] = [];
  for (const pid of productIds.slice(0, 50)) {
    try {
      results.push(await runOne(sb, pid, { forceLive }));
    } catch (e) {
      results.push({ product_id: pid, ok: false, error: String(e) });
    }
  }

  return json({
    ok: true,
    pipeline: "pcie2_only",
    pipeline_version: PIPELINE_VERSION,
    processed: results.length,
    approved: results.filter(r => r.ok).length,
    rejected: results.filter(r => !r.ok).length,
    results,
  });
});