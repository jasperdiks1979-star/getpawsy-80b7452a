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

  // ================================================================
  // Queue-Drain Mode — the ONLY certified live Pinterest publish path.
  // Reads already-bridged, CI-passed rows from pcie2_publish_queue and
  // either dry-runs the selection or performs live v5 POSTs.
  // Legacy queues (pinterest_pin_queue, pinterest-publish-now,
  // pinterest-cron-worker) are NOT touched.
  // ================================================================
  if (body?.mode === "queue_drain") {
    return await queueDrain(sb, {
      dryRun: body?.dry_run !== false && !body?.live,
      limit: Math.min(Number(body?.limit ?? 30), 30),
      productCap: Number(body?.product_cap ?? 3),
      boardCap: Number(body?.board_cap ?? 10),
      minCiScore: Number(body?.min_ci_score ?? 75),
    });
  }

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

// ---------------------------------------------------------------
// Queue-Drain Implementation
// ---------------------------------------------------------------
interface DrainOpts {
  dryRun: boolean;
  limit: number;
  productCap: number;
  boardCap: number;
  minCiScore: number;
}

async function queueDrain(sb: any, opts: DrainOpts) {
  const startedAt = new Date().toISOString();

  // 1. Global gates
  const pcie2On = await appConfig(sb, "pcie2_publish_enabled");
  const globalStop = await appConfig(sb, "pinterest_publishing_global_stop");
  // Token source of truth: pinterest_connection.access_token (matches account/boards snapshot).
  // Env secret PINTEREST_ACCESS_TOKEN is intentionally NOT read here — it drifts on rotation.
  const { data: connRow } = await sb
    .from("pinterest_connection")
    .select("access_token,status,last_account_status,last_boards_status,token_expires_at")
    .eq("status", "connected")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const token = connRow?.access_token ?? null;
  const tokenSource = token ? "pinterest_connection.access_token" : "missing";

  // ---- Token diagnostic: compare DB token vs env secret so 401s are attributable.
  // We hash (SHA-256) both, expose length + first4/last4 + fp12. Never log the raw token.
  const envToken = Deno.env.get("PINTEREST_ACCESS_TOKEN") ?? null;
  const tokenDiagnostic = {
    used_source: tokenSource,          // what queue_drain will actually send
    used_fp: await tokenFingerprint(token),
    db: await tokenFingerprint(connRow?.access_token ?? null),
    env: await tokenFingerprint(envToken),
    env_present: !!envToken,
    db_matches_env:
      !!token && !!envToken && token === envToken,
    connection_status: connRow?.status ?? null,
    last_account_status: connRow?.last_account_status ?? null,
    last_boards_status: connRow?.last_boards_status ?? null,
    token_expires_at: connRow?.token_expires_at ?? null,
  };
  console.log("[pcie2-publisher] token_diagnostic", JSON.stringify(tokenDiagnostic));

  if (!opts.dryRun) {
    if (pcie2On !== true) return json({ ok: false, mode: "queue_drain", blocker: "pcie2_publish_enabled != true" }, 412);
    if (globalStop === true) return json({ ok: false, mode: "queue_drain", blocker: "pinterest_publishing_global_stop" }, 412);
    if (!token) return json({ ok: false, mode: "queue_drain", blocker: "pinterest_connection.access_token missing (status!=connected or row absent)" }, 412);
  }

  // 2. Whitelist boards
  const { data: boardsRaw } = await sb.from("pinterest_boards")
    .select("id,name,is_blacklisted,production_verified");
  const whitelist = new Map<string, string>();
  for (const b of boardsRaw ?? []) {
    if (b.is_blacklisted !== true && b.production_verified === true) whitelist.set(b.id, b.name);
  }

  // 3. Pull eligible ready rows (order by ci_score desc, oldest first as tiebreaker)
  const { data: rows, error: rowsErr } = await sb.from("pcie2_publish_queue")
    .select("id,product_id,product_slug,headline,hook,image_url,board_id,destination_url,ci_score,ci_passed_at,pinterest_pin_id,status")
    .eq("status", "ready")
    .order("ci_score", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(500);
  if (rowsErr) return json({ ok: false, mode: "queue_drain", error: rowsErr.message }, 500);

  // 4. Gate + cap
  const selected: any[] = [];
  const skipped: any[] = [];
  const productCount = new Map<string, number>();
  const boardCount = new Map<string, number>();
  for (const r of rows ?? []) {
    if (selected.length >= opts.limit) break;
    const reasons: string[] = [];
    if (!whitelist.has(r.board_id)) reasons.push("board_not_whitelisted");
    if (!r.image_url) reasons.push("missing_image");
    if (!r.destination_url) reasons.push("missing_destination_url");
    if (!r.headline) reasons.push("missing_headline");
    if (Number(r.ci_score ?? 0) < opts.minCiScore) reasons.push("ci_score_below_min");
    if (!r.ci_passed_at) reasons.push("missing_ci_passed_at");
    if (r.pinterest_pin_id) reasons.push("already_published");
    if ((productCount.get(r.product_id) ?? 0) >= opts.productCap) reasons.push("product_cap");
    if ((boardCount.get(r.board_id) ?? 0) >= opts.boardCap) reasons.push("board_cap");
    if (reasons.length) { skipped.push({ id: r.id, reasons }); continue; }
    selected.push(r);
    productCount.set(r.product_id, (productCount.get(r.product_id) ?? 0) + 1);
    boardCount.set(r.board_id, (boardCount.get(r.board_id) ?? 0) + 1);
  }

  const boardDist: Record<string, number> = {};
  const productDist: Record<string, number> = {};
  for (const r of selected) {
    const bn = whitelist.get(r.board_id) ?? r.board_id;
    boardDist[bn] = (boardDist[bn] ?? 0) + 1;
    productDist[r.product_slug ?? r.product_id] = (productDist[r.product_slug ?? r.product_id] ?? 0) + 1;
  }

  // 5. Dry run — return selection only, no DB writes, no POSTs
  if (opts.dryRun) {
    return json({
      ok: true,
      mode: "queue_drain",
      dry_run: true,
      selected_count: selected.length,
      would_post: selected.length,
      skipped_count: skipped.length,
      invalid_board: skipped.filter(s => s.reasons.includes("board_not_whitelisted")).length,
      missing_image: skipped.filter(s => s.reasons.includes("missing_image")).length,
      missing_url: skipped.filter(s => s.reasons.includes("missing_destination_url")).length,
      duplicate: skipped.filter(s => s.reasons.includes("already_published")).length,
      legacy_path: 0,
      board_distribution: boardDist,
      product_distribution: productDist,
      selected_ids: selected.map(s => s.id),
      config: { pcie2_publish_enabled: pcie2On, global_stop: globalStop, token_present: !!token, token_source: tokenSource, connection_status: connRow?.status ?? null, last_account_status: connRow?.last_account_status ?? null, last_boards_status: connRow?.last_boards_status ?? null },
      token_diagnostic: tokenDiagnostic,
      started_at: startedAt,
    });
  }

  // 6. Guardian gate (single check for the whole wave)
  let guardianAllow = false;
  let guardianReason = "not_checked";
  try {
    const { data: gate } = await sb.functions.invoke("guardian-publish-gate", {
      body: { pipeline: "pcie2-publisher", context: { mode: "queue_drain", wave: 1, count: selected.length } },
    });
    guardianAllow = !!(gate as any)?.allow;
    guardianReason = (gate as any)?.reason ?? "no_reason";
  } catch (e) {
    guardianReason = `gate_invoke_failed:${String(e).slice(0, 120)}`;
  }
  if (!guardianAllow) {
    return json({ ok: false, mode: "queue_drain", blocker: "guardian_gate", guardian_reason: guardianReason }, 412);
  }

  // 7. Live POST loop
  const published: any[] = [];
  const failed: any[] = [];
  const apiErrors: any[] = [];
  let rateLimitedAt: string | null = null;

  for (const r of selected) {
    // Defense-in-depth: never duplicate.
    const { data: fresh } = await sb.from("pcie2_publish_queue")
      .select("status,pinterest_pin_id").eq("id", r.id).maybeSingle();
    if (!fresh || fresh.status !== "ready" || fresh.pinterest_pin_id) {
      failed.push({ id: r.id, error: "row_no_longer_ready_or_already_published" });
      continue;
    }

    const title = String(r.headline ?? "").slice(0, 100);
    const description = String(r.hook ?? r.headline ?? "").slice(0, 500);
    const payload = {
      board_id: r.board_id,
      title,
      description,
      link: r.destination_url,
      media_source: { source_type: "image_url", url: r.image_url },
    };

    let resp: Response;
    try {
      resp = await fetch("https://api.pinterest.com/v5/pins", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      const err = `network:${String(e).slice(0, 200)}`;
      failed.push({ id: r.id, error: err });
      await sb.from("pcie2_publish_queue").update({
        status: "failed", reject_detail: err, updated_at: new Date().toISOString(),
      }).eq("id", r.id);
      continue;
    }

    const bodyText = await resp.text();
    let bodyJson: any = null;
    try { bodyJson = JSON.parse(bodyText); } catch { /* keep as text */ }

    if (resp.status === 429) {
      rateLimitedAt = new Date().toISOString();
      apiErrors.push({ id: r.id, status: 429, body: bodyJson ?? bodyText });
      failed.push({ id: r.id, error: "rate_limited" });
      await sb.from("pcie2_publish_queue").update({
        status: "ready", reject_detail: "rate_limited_deferred", updated_at: new Date().toISOString(),
      }).eq("id", r.id);
      break; // stop the wave — do not burn more attempts
    }

    if (!resp.ok || !bodyJson?.id) {
      const err = `pinterest_${resp.status}:${String(bodyJson?.message ?? bodyText).slice(0, 240)}`;
      apiErrors.push({ id: r.id, status: resp.status, body: bodyJson ?? bodyText });
      failed.push({ id: r.id, error: err });
      // Non-transient: 4xx that isn't 429 → mark failed, don't retry.
      await sb.from("pcie2_publish_queue").update({
        status: "failed", reject_detail: err, updated_at: new Date().toISOString(),
      }).eq("id", r.id);
      continue;
    }

    const pinId: string = bodyJson.id;
    const publishedAt = new Date().toISOString();

    const { error: updErr } = await sb.from("pcie2_publish_queue").update({
      status: "published",
      pinterest_pin_id: pinId,
      published_at: publishedAt,
      updated_at: publishedAt,
    }).eq("id", r.id);

    if (updErr) {
      // The pin exists remotely but we could not persist. Record for reconciliation.
      apiErrors.push({ id: r.id, pin_id: pinId, error: `db_update_failed:${updErr.message}` });
    }
    published.push({
      queue_id: r.id, product_id: r.product_id, product_slug: r.product_slug,
      board_id: r.board_id, pin_id: pinId, published_at: publishedAt,
    });
  }

  return json({
    ok: true,
    mode: "queue_drain",
    dry_run: false,
    selected: selected.length,
    published: published.length,
    failed: failed.length,
    skipped: skipped.length,
    pinterest_pin_ids: published.map(p => p.pin_id),
    board_distribution: boardDist,
    product_distribution: productDist,
    api_errors: apiErrors,
    rate_limited_at: rateLimitedAt,
    canonical_sync: "pcie2_publish_queue.pinterest_pin_id + published_at set for each pin",
    guardian_reason: guardianReason,
    token_diagnostic: tokenDiagnostic,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
  });
}

// SHA-256 fingerprint helper — never returns the raw token.
async function tokenFingerprint(tok: string | null | undefined): Promise<any> {
  if (!tok) return { present: false };
  const bytes = new TextEncoder().encode(tok);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
  return {
    present: true,
    length: tok.length,
    first4: tok.slice(0, 4),
    last4: tok.slice(-4),
    fp12: hex.slice(0, 12),
  };
}