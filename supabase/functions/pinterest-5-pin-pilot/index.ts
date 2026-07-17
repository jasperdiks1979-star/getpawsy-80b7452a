// Pinterest 5-Pin Deterministic Pilot Orchestrator
// Renders 5 pre-planned items via pinterest-deterministic-compositor, then
// publishes each sequentially via pinterest-one-pin-canary. Fail-closed on
// any uncertainty. Never exceeds 5 assets, 5 queue rows, 5 POSTs, 5 Pins.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-canary-token",
};
function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}

interface Item {
  ordinal: number;
  product_id: string;
  source_image_url: string;
  expected_source_hash: string;
  layout: string;
  headline: string;
  benefit: string;
  cta: string;
  pin_title: string;
  pin_description: string;
  board_id: string;
  destination_url: string;
}

const RUN_ID = "5pin-pilot-2026-07-17";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST required" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  const authHeader = req.headers.get("authorization") || "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  const isService = bearer && bearer === SERVICE_KEY;
  const token = req.headers.get("x-canary-token") || "";
  const expected = Deno.env.get("PINTEREST_CANARY_TOKEN_V2") || "";
  const isTokenAuth = expected && token === expected;
  if (!isService && !isTokenAuth) {
    if (!authHeader) return json({ ok: false, error: "unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return json({ ok: false, error: "unauthorized" }, 401);
    const { data: role } = await sb.from("user_roles").select("role").eq("user_id", uid).eq("role", "admin").maybeSingle();
    if (!role) return json({ ok: false, error: "admin_only" }, 403);
  }

  let body: { items?: Item[]; dry_run?: boolean };
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
  const items = body.items ?? [];
  if (items.length !== 5) return json({ ok: false, error: "must_be_exactly_5_items", got: items.length }, 400);

  const compositorUrl = `${SUPABASE_URL}/functions/v1/pinterest-deterministic-compositor`;
  const canaryUrl = `${SUPABASE_URL}/functions/v1/pinterest-one-pin-canary`;

  const results: any[] = [];
  const totals = {
    assets_ok: 0, queue_rows_created: 0, pinterest_post_calls: 0,
    pinterest_readback_calls: 0, pins_created: 0, pins_verified: 0,
    failures: 0, uncertain: 0, ai_calls: 0, paid_image_calls: 0,
    paid_vision_calls: 0, storage_uploads: 0, cloudinary_fetches: 0,
  };

  // Preflight duplicate scan across ALL planned identities.
  const beforeCounts: any[] = [];
  for (const it of items) {
    const { count } = await sb.from("pinterest_pin_queue")
      .select("id", { count: "exact", head: true })
      .eq("product_id", it.product_id).eq("board_id", it.board_id);
    beforeCounts.push({ ordinal: it.ordinal, product_id: it.product_id, board_id: it.board_id, prior_queue_rows_for_product_board: count ?? 0 });
  }

  let stop = false;
  let stopReason: string | null = null;

  for (const it of items) {
    if (stop) {
      results.push({ ordinal: it.ordinal, status: "not_attempted_pilot_stopped", stopReason });
      continue;
    }
    const r: any = { ordinal: it.ordinal, product_id: it.product_id, layout: it.layout, board_id: it.board_id };

    // 1. Compose asset.
    let compRes: Response;
    try {
      compRes = await fetch(compositorUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({
          run_id: RUN_ID,
          product_id: it.product_id,
          source_image_url: it.source_image_url,
          expected_source_hash: it.expected_source_hash,
          headline: it.headline,
          benefit: it.benefit,
          cta: it.cta,
          layout_variant: it.layout,
          publication_allowed: false,
        }),
      });
    } catch (e) {
      r.status = "compositor_network_error"; r.detail = String(e);
      totals.failures++; results.push(r); continue;
    }
    const compBody = await compRes.json().catch(() => null);
    r.compositor = { http: compRes.status, ok: compBody?.ok === true, reason: compBody?.error ?? compBody?.reason ?? null };
    if (!compBody?.ok || !compBody?.asset?.public_url || !compBody?.asset?.output_hash) {
      r.status = "SKIPPED_PREFLIGHT_FAILED"; r.compositor_body = compBody;
      totals.failures++; results.push(r); continue;
    }
    totals.assets_ok++; totals.storage_uploads++; totals.cloudinary_fetches++;
    r.asset = {
      public_url: compBody.asset.public_url,
      output_hash: compBody.asset.output_hash,
      output_dimensions: compBody.asset.output_dimensions,
      storage_path: compBody.integrity?.storage_path,
      cloudinary_url: compBody.integrity?.cloudinary_url,
      product_occupancy: compBody.integrity?.product_occupancy,
      text_boxes: compBody.integrity?.text_boxes,
      overlap_ok: compBody.integrity?.overlap_ok ?? true,
      url_audit: compBody.integrity?.url_audit,
      layout_audit: compBody.integrity?.layout_audit,
    };

    if (body.dry_run) {
      r.status = "DRY_RUN_ASSET_OK"; results.push(r); continue;
    }

    // 2. Publish via canary function.
    let pubRes: Response;
    try {
      pubRes = await fetch(canaryUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({
          product_id: it.product_id,
          board_id: it.board_id,
          public_asset_url: compBody.asset.public_url,
          expected_output_hash: compBody.asset.output_hash,
          expected_width: 1200,
          expected_height: 1800,
          title: it.pin_title,
          description: it.pin_description,
          destination_url: it.destination_url,
        }),
      });
    } catch (e) {
      r.status = "PIN_STATE_UNCERTAIN"; r.detail = `publish_network_error:${String(e)}`;
      totals.uncertain++; stop = true; stopReason = "publish_network_error";
      results.push(r); continue;
    }
    const pubBody = await pubRes.json().catch(() => null);
    r.publication = { http: pubRes.status, verdict: pubBody?.verdict, side_effects: pubBody?.side_effects };
    const se = pubBody?.side_effects ?? {};
    totals.queue_rows_created += Number(se.new_queue_rows ?? 0);
    totals.pinterest_post_calls += Number(pubBody?.report?.pinterest_call?.total_pinterest_calls ?? 0);
    totals.pinterest_readback_calls += Number(se.other_pinterest_api_calls ?? 0);
    totals.pins_created += Number(se.new_pins ?? 0);

    if (pubBody?.verdict === "PUBLICATION_CANARY_PASS") {
      totals.pins_verified++;
      r.status = "PUBLISHED_AND_VERIFIED";
      r.pinterest_pin_id = pubBody?.report?.readback?.pinterest_pin_id;
      r.public_pin_url = pubBody?.report?.readback?.public_pin_url;
      r.queue_row_id = pubBody?.report?.queue?.row_id;
      r.idempotency_key = pubBody?.report?.queue?.idempotency_key;
      r.duplicate_proof = pubBody?.report?.duplicate_proof;
    } else if (pubBody?.verdict === "PUBLICATION_CANARY_FAILED_PIN_STATE_UNCERTAIN") {
      r.status = "PIN_STATE_UNCERTAIN"; r.report = pubBody?.report;
      totals.uncertain++; stop = true; stopReason = "pin_state_uncertain";
    } else if (pubBody?.verdict === "STOP_DUPLICATE_FOUND") {
      r.status = "SKIPPED_DUPLICATE"; r.report = pubBody?.report;
      totals.failures++;
    } else if (pubBody?.verdict === "STOP_PREFLIGHT_FAILED") {
      r.status = "SKIPPED_PREFLIGHT_FAILED"; r.report = pubBody?.report;
      totals.failures++;
    } else {
      r.status = "PUBLISH_FAILED"; r.report = pubBody?.report; r.verdict = pubBody?.verdict;
      totals.failures++;
      // If a pin was created but verification failed → treat as terminal fail (not uncertain: we have the pin id).
    }
    results.push(r);
  }

  // After counts.
  const afterCounts: any[] = [];
  for (const it of items) {
    const { count } = await sb.from("pinterest_pin_queue")
      .select("id", { count: "exact", head: true })
      .eq("product_id", it.product_id).eq("board_id", it.board_id);
    afterCounts.push({ ordinal: it.ordinal, product_id: it.product_id, board_id: it.board_id, queue_rows_for_product_board: count ?? 0 });
  }

  const allPass = totals.pins_verified === 5 && totals.uncertain === 0 && totals.failures === 0;
  const anyUncertain = totals.uncertain > 0;
  const verdict = allPass ? "FIVE_PIN_PILOT_PASS"
    : anyUncertain ? "FIVE_PIN_PILOT_FAILED_PIN_STATE_UNCERTAIN"
    : totals.pins_verified > 0 ? "FIVE_PIN_PILOT_PARTIAL_PASS"
    : "FIVE_PIN_PILOT_FAILED_NO_UNCERTAIN_PINS";

  return json({
    ok: allPass,
    verdict,
    stop_reason: stopReason,
    totals,
    per_item: results,
    before_counts: beforeCounts,
    after_counts: afterCounts,
  }, allPass ? 200 : 502);
});