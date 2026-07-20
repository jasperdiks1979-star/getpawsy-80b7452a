// Phase 19 — Visual Product Identity Audit
//
// Full-history sweep that certifies every Pinterest asset (posted, scheduled,
// queued, video, legacy) actually depicts the SAME product visible on its
// destination page. Reuses the existing Pinterest Integrity architecture —
// this function does NOT publish, does NOT create pins and does NOT touch
// the destination validator. It only produces evidence + repair tasks.
//
// Modes:
//   ?mode=inventory   → just list candidates, no AI
//   ?mode=score       → score up to `limit` candidates (default 40)
//   ?mode=full        → score + queue repair actions for failures
//
// Query params:
//   limit=<int>              max pins to score in this run (default 40, ceiling 200)
//   only_source=posted|queued|scheduled|video|legacy
//   force=1                  ignore VPI cache
//   pin_queue_id=<uuid>      score a single row
//
// Layer split:
//   Layer A (deterministic) — inventory + repair queue (no AI)
//   Layer B (AI, Gemini)    — visual identity scoring
//   When AI credits are exhausted, Layer B is skipped with ai_lane='skipped'
//   and Layer A still runs so operators keep the audit trail.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  cachedVisualIdentity,
  evaluateVisualIdentity,
  persistVisualIdentity,
  vpiEnabled,
  type VpiInput,
} from "../_shared/visual-product-identity.ts";

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

const MAX_LIMIT = 200;
const CONCURRENCY = 4;

type Candidate = {
  source: "posted" | "queued" | "scheduled" | "video" | "legacy" | "orphan_live";
  pin_queue_id: string | null;
  pinterest_pin_id: string | null;
  product_id: string | null;
  product_slug: string | null;
  pin_image_url: string | null;
  destination_link: string | null;
  pin_title: string | null;
  pin_description: string | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function collectCandidates(
  sb: any,
  opts: { onlySource?: string | null; pinQueueId?: string | null; limit: number },
): Promise<Candidate[]> {
  const out: Candidate[] = [];

  // Single-row lookup shortcut
  if (opts.pinQueueId) {
    const { data } = await sb
      .from("pinterest_pin_queue")
      .select("id, pinterest_pin_id, product_id, product_slug, pin_image_url, destination_link, pin_title, pin_description, status")
      .eq("id", opts.pinQueueId)
      .maybeSingle();
    if (data && data.pin_image_url && data.product_id) {
      out.push({
        source: data.status === "posted" ? "posted" : "queued",
        pin_queue_id: data.id,
        pinterest_pin_id: data.pinterest_pin_id,
        product_id: data.product_id,
        product_slug: data.product_slug,
        pin_image_url: data.pin_image_url,
        destination_link: data.destination_link,
        pin_title: data.pin_title,
        pin_description: data.pin_description,
      });
    }
    return out;
  }

  const wantAll = !opts.onlySource;

  // 1) pinterest_pin_queue (posted + not-yet-posted). Posted first — that is the visitor-facing risk.
  if (wantAll || opts.onlySource === "posted" || opts.onlySource === "queued" || opts.onlySource === "scheduled") {
    let q = sb
      .from("pinterest_pin_queue")
      .select("id, pinterest_pin_id, product_id, product_slug, pin_image_url, destination_link, pin_title, pin_description, status, verification_state, created_at")
      .not("pin_image_url", "is", null)
      .not("product_id", "is", null)
      .order("created_at", { ascending: false });
    if (opts.onlySource === "posted") q = q.eq("status", "posted");
    else if (opts.onlySource === "scheduled") q = q.eq("status", "scheduled");
    else if (opts.onlySource === "queued") q = q.in("status", ["queued", "draft", "failed"]);
    const { data } = await q.limit(opts.limit * 2);
    for (const r of (data ?? []) as any[]) {
      const src: Candidate["source"] =
        (r.status === "posted" || (r.pinterest_pin_id && r.status !== "rejected")) ? "posted" :
        r.status === "scheduled" ? "scheduled" : "queued";
      if (opts.onlySource && opts.onlySource !== src) continue;
      out.push({
        source: src,
        pin_queue_id: r.id,
        pinterest_pin_id: r.pinterest_pin_id,
        product_id: r.product_id,
        product_slug: r.product_slug,
        pin_image_url: r.pin_image_url,
        destination_link: r.destination_link,
        pin_title: r.pin_title,
        pin_description: r.pin_description,
      });
      if (out.length >= opts.limit) break;
    }
  }

  // 2) pinterest_video_queue (legacy safety net — schema is loose across environments)
  if ((wantAll || opts.onlySource === "video") && out.length < opts.limit) {
    try {
      const { data } = await sb
        .from("pinterest_video_queue")
        .select("id, pinterest_pin_id, product_id, product_slug, cover_image_url, destination_url, pin_title, pin_description, created_at")
        .not("cover_image_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(Math.min(60, opts.limit - out.length));
      for (const r of (data ?? []) as any[]) {
        out.push({
          source: "video",
          pin_queue_id: null,
          pinterest_pin_id: r.pinterest_pin_id ?? null,
          product_id: r.product_id ?? null,
          product_slug: r.product_slug ?? null,
          pin_image_url: r.cover_image_url ?? null,
          destination_link: r.destination_url ?? null,
          pin_title: r.pin_title ?? null,
          pin_description: r.pin_description ?? null,
        });
        if (out.length >= opts.limit) break;
      }
    } catch (_) { /* table may not exist */ }
  }

  // 3) Orphan live pins that were published before queue rows were fully
  // backfilled. These are still visitor-facing because their UUID is present
  // in Pinterest publish logs / performance tables even when pinterest_pin_queue
  // has no row. Treat them as live audit candidates; same-category is not a pass.
  if ((wantAll || opts.onlySource === "posted" || opts.onlySource === "legacy") && out.length < opts.limit) {
    try {
      const { data: logs } = await sb
        .from("pinterest_publish_logs")
        .select("pin_queue_id, image_url, pin_title, destination_link, request_payload, response_payload, created_at")
        .eq("status", "success")
        .not("request_payload", "is", null)
        .not("response_payload", "is", null)
        .order("created_at", { ascending: false })
        .limit(Math.min(500, opts.limit * 12));

      const existingIds = new Set(out.map((c) => c.pin_queue_id).filter(Boolean));
      const orphanIds = Array.from(new Set(
        (logs ?? [])
          .map((l: any) => String(l.pin_queue_id ?? l.request_payload?.link?.match(/[?&]pin_id=([^&]+)/)?.[1] ?? ""))
          .filter(Boolean),
      )).filter((id) => !existingIds.has(id));

      const { data: existingRows } = orphanIds.length
        ? await sb.from("pinterest_pin_queue").select("id").in("id", orphanIds)
        : { data: [] };
      const materialized = new Set((existingRows ?? []).map((r: any) => String(r.id)));

      const productIds = Array.from(new Set(
        (logs ?? [])
          .map((l: any) => {
            const link = String(l.destination_link ?? l.request_payload?.link ?? "");
            const m = link.match(/\/products\/([^?/#]+)/);
            return m?.[1] ?? null;
          })
          .filter(Boolean),
      ));
      const { data: products } = productIds.length
        ? await sb.from("products").select("id,slug").in("slug", productIds)
        : { data: [] };
      const productBySlug = new Map((products ?? []).map((p: any) => [String(p.slug), p]));

      for (const l of (logs ?? []) as any[]) {
        if (out.length >= opts.limit) break;
        const link = String(l.destination_link ?? l.request_payload?.link ?? l.response_payload?.link ?? "");
        const queueId = String(l.pin_queue_id ?? link.match(/[?&]pin_id=([^&]+)/)?.[1] ?? "") || null;
        if (!queueId || materialized.has(queueId) || existingIds.has(queueId)) continue;
        const slug = link.match(/\/products\/([^?/#]+)/)?.[1] ?? null;
        const product = slug ? productBySlug.get(slug) : null;
        if (!product?.id) continue;
        out.push({
          source: "orphan_live",
          pin_queue_id: queueId,
          pinterest_pin_id: String(l.response_payload?.id ?? "") || null,
          product_id: product.id,
          product_slug: slug,
          pin_image_url: String(l.image_url ?? l.request_payload?.media_source?.url ?? "") || null,
          destination_link: link || null,
          pin_title: String(l.pin_title ?? l.request_payload?.title ?? "") || null,
          pin_description: String(l.request_payload?.description ?? "") || null,
        });
      }
    } catch (_) { /* older environments may not have publish logs */ }
  }

  return out.filter((c) => c.pin_image_url && c.product_id).slice(0, opts.limit);
}

async function scorePool(
  sb: any,
  runId: string,
  cands: Candidate[],
  minScore: number,
  force: boolean,
) {
  let scored = 0, pass = 0, fail = 0, aiCalls = 0;
  const failures: Array<{ audit_id: string | null; c: Candidate; identity: number; kind: string; action: string; diffs: string[] }> = [];

  async function work(c: Candidate) {
    if (!c.pin_image_url || !c.product_id || !c.product_slug) return;
    // Cache first
    if (!force) {
      const cached = await cachedVisualIdentity(sb, c.product_id, c.pin_image_url);
      if (cached) {
        scored++;
        if (cached.passed && cached.identity_score >= minScore) pass++;
        else fail++;
        return;
      }
    }

    const input: VpiInput = {
      product_id: c.product_id,
      product_slug: c.product_slug,
      product_name: c.product_slug,
      pin_image_url: c.pin_image_url,
      pin_title: c.pin_title,
      pin_description: c.pin_description,
      destination_link: c.destination_link,
      pin_queue_id: c.pin_queue_id,
      pinterest_pin_id: c.pinterest_pin_id,
      source: c.source,
    };
    const v = await evaluateVisualIdentity(sb, input);
    aiCalls++;
    scored++;
    const auditId = await persistVisualIdentity(sb, input, v, runId);
    if (v.passed && v.identity_score >= minScore) pass++;
    else {
      fail++;
      failures.push({ audit_id: auditId, c, identity: v.identity_score, kind: v.wrong_product_kind, action: v.recommended_action, diffs: v.differences });
    }
  }

  // Simple worker pool
  const queue = cands.slice();
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(CONCURRENCY, queue.length); i++) {
    workers.push((async () => {
      while (queue.length) {
        const c = queue.shift()!;
        try { await work(c); } catch (_) { /* keep going */ }
      }
    })());
  }
  await Promise.all(workers);

  return { scored, pass, fail, aiCalls, failures };
}

async function repairFailures(
  sb: any,
  failures: Array<{ audit_id: string | null; c: Candidate; identity: number; kind: string; action: string; diffs: string[] }>,
) {
  let repaired = 0, replaceRequired = 0;
  for (const f of failures) {
    const notes = `identity=${f.identity} kind=${f.kind} diffs=${f.diffs.slice(0, 2).join("; ")}`;
    if (f.action === "repair_destination" || f.action === "sync_hero") {
      // Queue soft-repair by inserting an integrity report row that the existing
      // live-pin-repair / hero-sync pipelines already consume.
      try {
        await sb.from("pinterest_live_pin_repair_queue").insert({
          pinterest_pin_id: f.c.pinterest_pin_id,
          product_id: f.c.product_id,
          product_slug: f.c.product_slug,
          reason: `vpi_${f.kind}`,
          details: notes,
          status: "pending",
        });
        repaired++;
      } catch (_) { /* table shape may differ — non-fatal */ }
      if (f.audit_id) await sb.from("pinterest_visual_identity_audits").update({ repair_status: "queued", repair_notes: notes }).eq("id", f.audit_id);
    } else if (f.action === "replace_pin") {
      replaceRequired++;
      // Mark queue row so the guard blocks re-publish and archive-only path can handle it.
      if (f.c.pin_queue_id) {
        try {
          await sb.from("pinterest_pin_queue").update({
            status: "paused",
            pin_verified: false,
            verification_state: "visual_mismatch_confirmed",
            validation_status: "failed",
            repair_strategy: "replace_or_correct_destination",
            rejection_reason: `vpi_replace_required:${f.kind}`,
            verification_failure_reason: `visual_identity_fail:${f.identity}`,
            updated_at: new Date().toISOString(),
          }).eq("id", f.c.pin_queue_id);
        } catch (_) {}
      }
      if (f.audit_id) await sb.from("pinterest_visual_identity_audits").update({ repair_status: "replace_required", repair_notes: notes }).eq("id", f.audit_id);
    } else {
      if (f.audit_id) await sb.from("pinterest_visual_identity_audits").update({ repair_status: "manual_review", repair_notes: notes }).eq("id", f.audit_id);
    }
  }
  return { repaired, replaceRequired };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const mode = (url.searchParams.get("mode") ?? "full").toLowerCase() as "inventory" | "score" | "full";
  const onlySource = url.searchParams.get("only_source");
  const pinQueueId = url.searchParams.get("pin_queue_id");
  const force = url.searchParams.get("force") === "1";
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get("limit") ?? 40)));

  const sb = createClient(SUPA_URL, SERVICE);
  const cfg = await vpiEnabled(sb);

  // Create run row
  const { data: run } = await sb
    .from("pinterest_visual_identity_runs")
    .insert({ mode, scope: onlySource ?? "all" })
    .select("id")
    .maybeSingle();
  const runId = run?.id ?? null;

  const cands = await collectCandidates(sb, { onlySource, pinQueueId, limit });

  if (mode === "inventory") {
    await sb.from("pinterest_visual_identity_runs").update({
      finished_at: new Date().toISOString(),
      pins_total: cands.length,
      ai_lane: "skipped",
      summary: { mode, only_source: onlySource, force, note: "inventory only" },
    }).eq("id", runId);
    return json({ ok: true, run_id: runId, mode, candidates: cands.length, sample: cands.slice(0, 5) });
  }

  const aiAvailable = !!LOVABLE_KEY && cfg.enabled;
  if (!aiAvailable) {
    await sb.from("pinterest_visual_identity_runs").update({
      finished_at: new Date().toISOString(),
      pins_total: cands.length,
      ai_lane: "skipped",
      notes: !LOVABLE_KEY ? "no_lovable_api_key" : "vpi_disabled",
      summary: { mode, only_source: onlySource, force },
    }).eq("id", runId);
    return json({ ok: true, run_id: runId, ai_lane: "skipped", reason: !LOVABLE_KEY ? "no_lovable_api_key" : "vpi_disabled", candidates: cands.length });
  }

  const { scored, pass, fail, aiCalls, failures } = await scorePool(sb, runId!, cands, cfg.minScore, force);

  let repaired = 0, replaceRequired = 0;
  if (mode === "full" && failures.length) {
    const r = await repairFailures(sb, failures);
    repaired = r.repaired; replaceRequired = r.replaceRequired;
  }

  await sb.from("pinterest_visual_identity_runs").update({
    finished_at: new Date().toISOString(),
    pins_total: cands.length,
    pins_scored: scored,
    pins_pass: pass,
    pins_fail: fail,
    pins_repaired: repaired,
    pins_replace_required: replaceRequired,
    ai_calls: aiCalls,
    ai_lane: "available",
    summary: {
      mode, only_source: onlySource, force,
      min_identity_score: cfg.minScore,
      top_kinds: failures.slice(0, 10).map((f) => ({ kind: f.kind, score: f.identity, slug: f.c.product_slug })),
    },
  }).eq("id", runId);

  return json({
    ok: true,
    run_id: runId,
    mode,
    ai_lane: "available",
    totals: { candidates: cands.length, scored, pass, fail, repaired, replaceRequired, ai_calls: aiCalls },
    min_identity_score: cfg.minScore,
  });
});