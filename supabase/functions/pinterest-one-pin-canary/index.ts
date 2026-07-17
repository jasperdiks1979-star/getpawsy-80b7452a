// Pinterest One-Pin Publication Canary (deterministic asset).
// Publishes exactly ONE Pin using a pre-verified deterministic compositor
// asset (identified by output_hash + public_asset_url). Fail-closed on any
// preflight or read-back anomaly. Never re-POSTs.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const PIN_API = "https://api.pinterest.com/v5";

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function pngDims(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (bytes[i] !== sig[i]) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: dv.getUint32(16), height: dv.getUint32(20) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, verdict: "STOP_PREFLIGHT_FAILED", reason: "POST required" }, 405);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const authHeader = req.headers.get("authorization") || "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  const isService = bearer && bearer === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const canaryToken = req.headers.get("x-canary-token") || "";
  const expectedCanaryToken = Deno.env.get("PINTEREST_CANARY_TOKEN") || "";
  const isCanaryTokenAuth = expectedCanaryToken.length > 0 && canaryToken === expectedCanaryToken;
  if (!isService && !isCanaryTokenAuth) {
    if (!authHeader) return json({ ok: false, verdict: "STOP_PREFLIGHT_FAILED", reason: "unauthorized" }, 401);
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return json({ ok: false, verdict: "STOP_PREFLIGHT_FAILED", reason: "unauthorized" }, 401);
    const { data: role } = await sb.from("user_roles").select("role").eq("user_id", uid).eq("role", "admin").maybeSingle();
    if (!role) return json({ ok: false, verdict: "STOP_PREFLIGHT_FAILED", reason: "admin_only" }, 403);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, verdict: "STOP_PREFLIGHT_FAILED", reason: "invalid_json" }, 400); }

  const { product_id, board_id, public_asset_url, expected_output_hash,
    expected_width = 1200, expected_height = 1800,
    title, description, destination_url, dry_run = false } = body ?? {};

  const missing = ["product_id","board_id","public_asset_url","expected_output_hash","title","description","destination_url"].filter((k) => !body?.[k]);
  if (missing.length) return json({ ok:false, verdict:"STOP_PREFLIGHT_FAILED", reason:"missing_fields", missing }, 400);
  if (String(title).length > 100) return json({ ok:false, verdict:"STOP_PREFLIGHT_FAILED", reason:"title_too_long" }, 400);
  if (String(description).length > 500) return json({ ok:false, verdict:"STOP_PREFLIGHT_FAILED", reason:"description_too_long" }, 400);

  const startedAt = new Date().toISOString();
  const report: Record<string, unknown> = { started_at: startedAt };
  const sideEffects = {
    new_queue_rows: 0, new_pins: 0, ai_provider_calls: 0, paid_image_calls: 0,
    paid_vision_calls: 0, compositor_renders: 0, storage_uploads: 0,
    board_mutations: 0, product_mutations: 0, other_pinterest_api_calls: 0,
  };

  // A. Asset integrity
  const getRes = await fetch(public_asset_url, { method: "GET", redirect: "follow" });
  const bytes = new Uint8Array(await getRes.arrayBuffer());
  const contentType = getRes.headers.get("content-type") || "";
  const dims = pngDims(bytes);
  const actualHash = await sha256Hex(bytes);
  const assetOk = getRes.status === 200 && contentType.toLowerCase().startsWith("image/png") &&
    actualHash === String(expected_output_hash).toLowerCase() &&
    dims?.width === expected_width && dims?.height === expected_height;
  report.preflight_asset = { url: public_asset_url, http_status: getRes.status, content_type: contentType, bytes: bytes.length, sha256: actualHash, expected_sha256: expected_output_hash, dims, expected_dims: { width: expected_width, height: expected_height }, ok: assetOk };
  if (!assetOk) return json({ ok:false, verdict:"STOP_PREFLIGHT_FAILED", reason:"asset_integrity_failed", report, side_effects: sideEffects }, 409);

  // B. Product
  const { data: product } = await sb.from("products").select("id,name,slug,is_active,primary_species,effective_stock").eq("id", product_id).maybeSingle();
  const productOk = !!product && product.is_active === true;
  report.preflight_product = { product, ok: productOk };
  if (!productOk) return json({ ok:false, verdict:"STOP_PREFLIGHT_FAILED", reason:"product_not_active", report, side_effects: sideEffects }, 409);

  const dest = String(destination_url);
  const destChecks = {
    contains_products_slug: dest.includes(`/products/${product!.slug}`),
    contains_utm_source_pinterest: /[?&]utm_source=pinterest\b/.test(dest),
    not_admin_or_staging: !/(admin|preview|staging|localhost)/i.test(dest),
  };
  let destHttp = 0;
  try { destHttp = (await fetch(dest, { method: "HEAD", redirect: "follow" })).status; } catch { destHttp = 0; }
  const destOk = destChecks.contains_products_slug && destChecks.contains_utm_source_pinterest && destChecks.not_admin_or_staging && destHttp >= 200 && destHttp < 400;
  report.preflight_destination = { url: dest, checks: destChecks, http_status: destHttp, ok: destOk };
  if (!destOk) return json({ ok:false, verdict:"STOP_PREFLIGHT_FAILED", reason:"destination_url_invalid", report, side_effects: sideEffects }, 409);

  // Board
  const { data: board } = await sb.from("pinterest_boards").select("id,name,is_blacklisted").eq("id", board_id).maybeSingle();
  const boardOk = !!board && board.is_blacklisted !== true;
  report.preflight_board = { board, ok: boardOk };
  if (!boardOk) return json({ ok:false, verdict:"STOP_PREFLIGHT_FAILED", reason:"board_invalid_or_blacklisted", report, side_effects: sideEffects }, 409);

  // Duplicate check
  const idempotencyKey = `canary:${product_id}:${expected_output_hash}:${board_id}`;
  const { count: existingIdemp } = await sb.from("pinterest_pin_queue").select("id", { count: "exact", head: true }).eq("idempotency_key", idempotencyKey);
  const { data: existingByAsset } = await sb.from("pinterest_pin_queue").select("id,pinterest_pin_id,status,board_id").eq("product_id", product_id).eq("pin_image_url", public_asset_url);
  const priorPinsForIdent = (existingByAsset ?? []).filter((r: any) => r.board_id === board_id);
  report.preflight_duplicate = {
    idempotency_key: idempotencyKey,
    existing_by_idempotency_key: existingIdemp ?? 0,
    existing_by_product_asset_board: priorPinsForIdent.length,
    prior_pin_ids: priorPinsForIdent.map((r: any) => r.pinterest_pin_id).filter(Boolean),
  };
  if ((existingIdemp ?? 0) > 0 || priorPinsForIdent.length > 0) {
    return json({ ok:false, verdict:"STOP_DUPLICATE_FOUND", reason:"equivalent_queue_or_pin_exists", report, side_effects: sideEffects }, 409);
  }

  if (dry_run) return json({ ok:true, verdict:"DRY_RUN_PREFLIGHT_PASS", report, side_effects: sideEffects });

  // OAuth
  const { data: conn } = await sb.from("pinterest_connection").select("access_token,token_expires_at,scopes,status,account_name,board_count").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const scopeArr = Array.isArray(conn?.scopes) ? conn!.scopes : String(conn?.scopes ?? "").split(/\s+/).filter(Boolean);
  const hasWrite = scopeArr.some((s: string) => s === "pins:write");
  const tokenValid = conn?.access_token && new Date(conn.token_expires_at ?? 0).getTime() > Date.now();
  const oauthOk = tokenValid && (conn?.status === "connected") && hasWrite && Number(conn?.board_count ?? 0) > 0;
  report.preflight_oauth = { account: conn?.account_name, status: conn?.status, token_expires_at: conn?.token_expires_at, board_count: conn?.board_count, pins_write_scope: hasWrite, ok: oauthOk };
  if (!oauthOk) return json({ ok:false, verdict:"STOP_PREFLIGHT_FAILED", reason:"oauth_unhealthy", report, side_effects: sideEffects }, 409);

  // Queue insert
  const insertRow = {
    product_id, product_slug: product!.slug, product_name: product!.name,
    pin_variant: "canary_editorial_hero",
    pin_title: String(title).slice(0, 100),
    pin_description: String(description).slice(0, 500),
    pin_image_url: public_asset_url,
    destination_link: dest,
    board_name: board!.name, board_id: board!.id,
    priority: "high", status: "publishing",
    scheduled_at: new Date().toISOString(),
    publishing_started_at: new Date().toISOString(),
    idempotency_key: idempotencyKey,
    image_hash: expected_output_hash,
    content_type: "product",
    creative_fingerprint: `deterministic:${expected_output_hash}`,
    meta: { canary: "one_pin_publication_canary", layout: "editorial_hero", output_hash: expected_output_hash },
    approved_at: new Date().toISOString(),
  };
  const { data: inserted, error: insErr } = await sb.from("pinterest_pin_queue").insert(insertRow).select("id").single();
  if (insErr || !inserted) {
    return json({ ok:false, verdict:"STOP_PREFLIGHT_FAILED", reason:"queue_insert_failed", details: insErr?.message, report, side_effects: sideEffects }, 500);
  }
  sideEffects.new_queue_rows = 1;
  const queueRowId = inserted.id as string;
  report.queue = { row_id: queueRowId, idempotency_key: idempotencyKey, before_count: existingIdemp ?? 0 };

  // Pinterest POST
  const postBody = {
    board_id: board!.id,
    title: insertRow.pin_title,
    description: insertRow.pin_description,
    link: dest,
    media_source: { source_type: "image_url", url: public_asset_url },
  };
  const correlationId = `canary-${queueRowId}`;
  let pinRes: Response | null = null;
  let pinNetworkError: string | null = null;
  try {
    pinRes = await fetch(`${PIN_API}/pins`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${conn!.access_token}`, "Content-Type": "application/json", "Pinterest-Request-Id": correlationId },
      body: JSON.stringify(postBody),
    });
  } catch (e) { pinNetworkError = String(e); }

  const pinStatus = pinRes?.status ?? 0;
  const pinBody = pinRes ? await pinRes.json().catch(() => null) : null;
  const pinId: string | null = (pinBody && pinBody.id) ? String(pinBody.id) : null;
  sideEffects.new_pins = pinId ? 1 : 0;
  report.pinterest_call = { total_pinterest_calls: 1, endpoint: `${PIN_API}/pins`, http_status: pinStatus, network_error: pinNetworkError, request_redacted: { ...postBody }, response_redacted: pinBody, correlation_id: correlationId, pinterest_pin_id: pinId };

  if (!pinId) {
    let recoveryPin: any = null;
    try {
      const listRes = await fetch(`${PIN_API}/boards/${board!.id}/pins?page_size=25`, { headers: { "Authorization": `Bearer ${conn!.access_token}` } });
      sideEffects.other_pinterest_api_calls += 1;
      const listBody = await listRes.json().catch(() => null);
      const items: any[] = listBody?.items ?? [];
      recoveryPin = items.find((p) => (p?.link ?? "").includes(`/products/${product!.slug}`) && (p?.link ?? "").includes(`pin_mode=canary`)) ?? null;
    } catch { /* ignore */ }
    await sb.from("pinterest_pin_queue").update({
      status: recoveryPin ? "posted" : "failed",
      last_publish_error: pinNetworkError || `pinterest_http_${pinStatus}`,
      pinterest_pin_id: recoveryPin?.id ?? null,
      posted_at: recoveryPin ? new Date().toISOString() : null,
    }).eq("id", queueRowId);
    return json({
      ok: false,
      verdict: recoveryPin ? "PUBLICATION_CANARY_FAILED_PIN_STATE_UNCERTAIN" : "PUBLICATION_CANARY_FAILED_NO_PIN_CREATED",
      report: { ...report, recovery_scan: { found_pin_id: recoveryPin?.id ?? null } },
      side_effects: sideEffects,
    }, 502);
  }

  // Read-back
  let verifyStatus = 0; let verifyBody: any = null;
  try {
    const vr = await fetch(`${PIN_API}/pins/${pinId}`, { headers: { "Authorization": `Bearer ${conn!.access_token}` } });
    verifyStatus = vr.status;
    verifyBody = await vr.json().catch(() => null);
    sideEffects.other_pinterest_api_calls += 1;
  } catch (e) { verifyBody = { error: String(e) }; }

  const readbackOk = verifyStatus === 200 && verifyBody?.id === pinId && verifyBody?.board_id === board!.id && (verifyBody?.link ?? "").includes(`/products/${product!.slug}`);

  await sb.from("pinterest_pin_queue").update({
    status: readbackOk ? "posted" : "posted_unverified",
    posted_at: new Date().toISOString(),
    pinterest_pin_id: pinId,
    pin_verified: readbackOk,
    pin_verification_reason: readbackOk ? "readback_ok" : `readback_failed:http_${verifyStatus}`,
    pin_verified_at: new Date().toISOString(),
    http_status: pinStatus,
  }).eq("id", queueRowId);

  const { count: afterIdempCount } = await sb.from("pinterest_pin_queue").select("id", { count: "exact", head: true }).eq("idempotency_key", idempotencyKey);
  const { count: afterPinCount } = await sb.from("pinterest_pin_queue").select("id", { count: "exact", head: true }).eq("product_id", product_id).eq("pin_image_url", public_asset_url).eq("board_id", board!.id);

  report.readback = {
    pinterest_pin_id: pinId,
    public_pin_url: `https://www.pinterest.com/pin/${pinId}/`,
    http_status: verifyStatus, board_id: verifyBody?.board_id,
    title: verifyBody?.title, description: verifyBody?.description,
    link: verifyBody?.link, created_at: verifyBody?.created_at,
    media: verifyBody?.media, ok: readbackOk,
  };
  report.duplicate_proof = {
    queue_rows_for_idempotency_key: afterIdempCount ?? 0,
    queue_rows_for_product_asset_board: afterPinCount ?? 0,
  };

  const passed = readbackOk && (afterIdempCount === 1) && (afterPinCount === 1);
  return json({
    ok: passed,
    verdict: passed ? "PUBLICATION_CANARY_PASS" : "PUBLICATION_CANARY_FAILED_PIN_CREATED_BUT_VERIFICATION_FAILED",
    finished_at: new Date().toISOString(), report, side_effects: sideEffects,
  }, passed ? 200 : 502);
});
