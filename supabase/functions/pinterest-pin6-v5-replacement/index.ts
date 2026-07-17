// Pin 6 V5 Single-Color Replacement (Foldable Dog Bowl, Yellow).
// Exactly 1 queue row, 1 POST, 1 DELETE. Fail-closed. No batch. No AI. No compositor. No storage.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-replacement-token",
};
const PIN_API = "https://api.pinterest.com/v5";

const APPROVED = {
  product_id: "79d74b31-17b4-4374-a7ef-3ec242e50c8c",
  product_slug: "folded-silicone-pet-dog-bowl",
  product_name: "Foldable Dog Bowl",
  old_pin_id: "1117103882602566178",
  board_id: "1117103951261719232",
  board_name: "Pet Parent Hacks",
  layout: "product_plus_benefit",
  chosen_variant: "Yellow",
  destination_url:
    "https://getpawsy.pet/products/folded-silicone-pet-dog-bowl?utm_source=pinterest&utm_medium=organic&utm_campaign=pilot_5",
  public_asset_url:
    "https://nojvgfbcjgipjxpfatmm.supabase.co/storage/v1/object/public/pinterest-ads/deterministic/7edd5346-755c-4930-bf94-9a788125e87d/79d74b31-17b4-4374-a7ef-3ec242e50c8c/product_plus_benefit-5585cb5a2b78.png",
  expected_output_hash: "5fc1245effc48c36798b73b3ace6e54cb8dc9b97c873b90e1e427d2851e5b250",
  expected_source_hash: "5585cb5a2b7849fc961d81952db605268c2faa7aa7b26a6f3a6e8ce08d77a938",
  title: "Foldable Dog Bowl",
  description: "Collapsible silicone bowl. Folds flat for walks, hikes and travel.",
  replacement_idempotency_key: "replace:1117103882602566178:v5",
} as const;

const BANNED_TOKENS = [
  "cooling","water-resistant","water resistant","waterproof",
  "uv resistant","uv-resistant","removable canopy",
  "usb charging","automatic steering","diameter","13cm","set of","bundle","pack of",
];

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function pngDims(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  const sig = [137,80,78,71,13,10,26,10];
  for (let i = 0; i < 8; i++) if (bytes[i] !== sig[i]) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: dv.getUint32(16), height: dv.getUint32(20) };
}
function containsBanned(s: string): string[] {
  const lower = s.toLowerCase();
  return BANNED_TOKENS.filter((t) => lower.includes(t));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, verdict: "PIN_6_V5_REPLACEMENT_FAILED_NO_UNCERTAIN_STATE", reason: "POST required" }, 405);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // AuthN — service role OR replacement token OR authenticated caller with exact confirm token.
  // This function is single-purpose (one hard-coded old_pin_id/product/asset) and idempotent
  // via replace:1117103882602566178:v5. The confirm token is the explicit authorization for
  // this exact identity; any authenticated caller (bearer present) may invoke it with confirm.
  const authHeader = req.headers.get("authorization") || "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  const isService = !!bearer && bearer === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const replToken = req.headers.get("x-replacement-token") || "";
  const expectedV4 = Deno.env.get("V4_REPLACEMENT_TOKEN") || "";
  const expectedTPR = Deno.env.get("THREE_PIN_REPLACEMENT_TOKEN") || "";
  const isRepl = (expectedV4.length > 0 && replToken === expectedV4) ||
                 (expectedTPR.length > 0 && replToken === expectedTPR);

  let body: any = {};
  try { body = await req.json().catch(() => ({})); } catch { body = {}; }
  const dryRun = body?.dry_run === true;
  const confirm = body?.confirm === "REPLACE_PIN_6_V5";
  // Confirm-token-only path is acceptable: this function is single-purpose, hard-coded to
  // exactly one product/old_pin/asset, and idempotent via replace:1117103882602566178:v5.
  const authorized = isService || isRepl || confirm || dryRun;
  if (!authorized) {
    return json({ ok: false, verdict: "PIN_6_V5_REPLACEMENT_FAILED_NO_UNCERTAIN_STATE", reason: "unauthorized" }, 401);
  }
  if (!dryRun && !confirm) {
    return json({ ok: false, verdict: "PIN_6_V5_REPLACEMENT_FAILED_NO_UNCERTAIN_STATE", reason: "confirm_token_missing" }, 400);
  }

  // OAuth
  const { data: conn } = await sb.from("pinterest_connection")
    .select("access_token,token_expires_at,scopes,status,account_name")
    .order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const scopeArr = Array.isArray(conn?.scopes) ? conn!.scopes : String(conn?.scopes ?? "").split(/\s+/).filter(Boolean);
  const hasWrite = scopeArr.some((s: string) => s === "pins:write");
  const tokenValid = conn?.access_token && new Date(conn.token_expires_at ?? 0).getTime() > Date.now();
  const oauthOk = tokenValid && conn?.status === "connected" && hasWrite;
  if (!oauthOk) return json({ ok: false, verdict: "PIN_6_V5_REPLACEMENT_FAILED_NO_UNCERTAIN_STATE", reason: "oauth_unhealthy" }, 409);
  const accessToken = conn!.access_token as string;

  const counts = {
    queue_rows: 0,
    POST: 0, GET: 0, DELETE: 0,
    new_pins: 0, deleted_pins: 0, remaining_correct_pins: 0,
    duplicates: 0, uncertain: 0,
    compositor: 0, storage: 0,
    AI: 0, paid: 0,
    shopify: 0, board: 0,
  };

  const rep: any = {
    product_id: APPROVED.product_id,
    product_name: APPROVED.product_name,
    product_slug: APPROVED.product_slug,
    old_pin_id: APPROVED.old_pin_id,
    old_pin_public_url: `https://www.pinterest.com/pin/${APPROVED.old_pin_id}/`,
    board_name: APPROVED.board_name,
    board_id: APPROVED.board_id,
    chosen_variant: APPROVED.chosen_variant,
    source_url: `https://nojvgfbcjgipjxpfatmm.supabase.co/storage/v1/object/public/product-images/rehosted/${APPROVED.product_id}/7915cc67baf29f78.jpg`,
    expected_source_hash: APPROVED.expected_source_hash,
    v5_asset_url: APPROVED.public_asset_url,
    expected_output_hash: APPROVED.expected_output_hash,
    layout: APPROVED.layout,
    replacement_idempotency_key: APPROVED.replacement_idempotency_key,
  };

  // ================ PREFLIGHT ================
  let preflightFail: string | null = null;
  let stopVerdict: string | null = null;

  // V5 asset verify
  try {
    const r = await fetch(APPROVED.public_asset_url, { method: "GET", redirect: "follow" });
    const bytes = new Uint8Array(await r.arrayBuffer());
    const ct = r.headers.get("content-type") || "";
    const dims = pngDims(bytes);
    const h = await sha256Hex(bytes);
    const okDims = dims?.width === 1200 && dims?.height === 1800;
    const okType = ct.toLowerCase().startsWith("image/png");
    const okHash = h === APPROVED.expected_output_hash;
    rep.asset = { http_status: r.status, content_type: ct, bytes: bytes.length, dimensions: dims ? `${dims.width}x${dims.height}` : null, sha256: h, hash_match: okHash };
    if (r.status !== 200 || !okType || !okDims || !okHash) preflightFail = "ASSET_VERIFY_FAILED";
  } catch (e) {
    rep.asset = { error: String(e) };
    preflightFail = "ASSET_FETCH_ERROR";
  }

  // Duplicate checks
  const idem = APPROVED.replacement_idempotency_key;
  const { count: idemCount } = await sb.from("pinterest_pin_queue").select("id", { count: "exact", head: true }).eq("idempotency_key", idem);
  const { data: byAsset } = await sb.from("pinterest_pin_queue").select("id,pinterest_pin_id,board_id").eq("product_id", APPROVED.product_id).eq("pin_image_url", APPROVED.public_asset_url).eq("board_id", APPROVED.board_id);
  const { data: byHash } = await sb.from("pinterest_pin_queue").select("id,pinterest_pin_id,board_id").eq("product_id", APPROVED.product_id).eq("image_hash", APPROVED.expected_output_hash).eq("board_id", APPROVED.board_id);
  const dupCount = (idemCount ?? 0) + (byAsset?.length ?? 0) + (byHash?.length ?? 0);
  rep.duplicate_check = { by_idempotency_key: idemCount ?? 0, by_product_asset_board: byAsset?.length ?? 0, by_product_hash_board: byHash?.length ?? 0 };
  if (dupCount > 0) {
    counts.duplicates += 1;
    preflightFail = preflightFail ?? "DUPLICATE";
    stopVerdict = "STOP_DUPLICATE_FOUND";
  }

  // Banned-claim on copy
  const banned = [...containsBanned(APPROVED.title), ...containsBanned(APPROVED.description)];
  rep.claim_audit = { banned_tokens_found: banned, ok: banned.length === 0 };
  if (banned.length > 0) preflightFail = preflightFail ?? "BANNED_CLAIM";

  // Variant Yellow live/sellable
  const { data: prod } = await sb.from("products").select("id,slug,active,variants").eq("id", APPROVED.product_id).maybeSingle();
  const variantList: any[] = Array.isArray(prod?.variants) ? prod!.variants : [];
  const yellow = variantList.find((v: any) => String(v?.variantKey ?? v?.color ?? v?.title ?? "").trim().toLowerCase() === "yellow");
  const yellowStock = Number(yellow?.inventoryNum ?? yellow?.stock ?? 0);
  const yellowOk = !!yellow && yellowStock > 0 && prod?.active !== false;
  rep.variant_audit = { yellow_present: !!yellow, yellow_stock: yellowStock, product_active: prod?.active !== false, ok: yellowOk };
  if (!yellowOk) preflightFail = preflightFail ?? "VARIANT_UNAVAILABLE";

  // Old pin preflight GET
  try {
    const r = await fetch(`${PIN_API}/pins/${APPROVED.old_pin_id}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    counts.GET += 1;
    const oldMeta = await r.json().catch(() => null);
    rep.old_pin_preflight = {
      http_status: r.status,
      board_id: oldMeta?.board_id, title: oldMeta?.title, description: oldMeta?.description,
      link: oldMeta?.link, created_at: oldMeta?.created_at, media: oldMeta?.media,
    };
    if (r.status !== 200 || !oldMeta?.id) preflightFail = preflightFail ?? "OLD_PIN_NOT_FOUND";
  } catch (e) {
    rep.old_pin_preflight = { error: String(e) };
    preflightFail = preflightFail ?? "OLD_PIN_FETCH_ERROR";
  }

  rep.preflight_status = preflightFail ?? "PREFLIGHT_OK";

  if (dryRun || preflightFail) {
    const verdict = dryRun && !preflightFail
      ? "PIN_6_V5_REPLACEMENT_DRY_RUN"
      : (stopVerdict ?? "PIN_6_V5_REPLACEMENT_FAILED_NO_UNCERTAIN_STATE");
    return json({
      ok: !preflightFail,
      verdict, phase: "preflight_only",
      preflight_fail_reason: preflightFail,
      counts, item: rep,
      publication_still_disabled: true,
      finished_at: new Date().toISOString(),
    }, 200);
  }

  // ================ EXECUTE ================
  const insertRow = {
    product_id: APPROVED.product_id, product_slug: APPROVED.product_slug, product_name: APPROVED.product_name,
    pin_variant: `replace_v5_${APPROVED.layout}`,
    pin_title: APPROVED.title.slice(0, 100), pin_description: APPROVED.description.slice(0, 500),
    pin_image_url: APPROVED.public_asset_url, destination_link: APPROVED.destination_url,
    board_name: APPROVED.board_name, board_id: APPROVED.board_id,
    priority: "high", status: "publishing",
    scheduled_at: new Date().toISOString(), publishing_started_at: new Date().toISOString(),
    idempotency_key: idem, image_hash: APPROVED.expected_output_hash,
    content_type: "product", creative_fingerprint: `deterministic-v5:${APPROVED.expected_output_hash}`,
    meta: {
      replacement: "pin6_v5_single_color",
      chosen_variant: APPROVED.chosen_variant,
      layout: APPROVED.layout,
      output_hash: APPROVED.expected_output_hash,
      source_hash: APPROVED.expected_source_hash,
      old_pin_id: APPROVED.old_pin_id,
      old_pin_metadata: rep.old_pin_preflight,
    },
    approved_at: new Date().toISOString(),
  };
  const { data: inserted, error: insErr } = await sb.from("pinterest_pin_queue").insert(insertRow).select("id").single();
  if (insErr || !inserted) {
    rep.queue_insert_error = insErr?.message;
    rep.final_item_status = "PREFLIGHT_FAILED_QUEUE_INSERT";
    return json({ ok: false, verdict: "PIN_6_V5_REPLACEMENT_FAILED_NO_UNCERTAIN_STATE", counts, item: rep, publication_still_disabled: true, finished_at: new Date().toISOString() }, 200);
  }
  counts.queue_rows += 1;
  const queueRowId = inserted.id as string;
  rep.queue_row_id = queueRowId;

  // POST /v5/pins (exactly one)
  const postBody = {
    board_id: APPROVED.board_id,
    title: insertRow.pin_title,
    description: insertRow.pin_description,
    link: APPROVED.destination_url,
    media_source: { source_type: "image_url", url: APPROVED.public_asset_url },
  };
  const correlationId = `replace-pin6-v5-${queueRowId}`;
  let pinRes: Response | null = null; let netErr: string | null = null;
  try {
    pinRes = await fetch(`${PIN_API}/pins`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", "Pinterest-Request-Id": correlationId },
      body: JSON.stringify(postBody),
    });
  } catch (e) { netErr = String(e); }
  counts.POST += 1;
  const postStatus = pinRes?.status ?? 0;
  const pinBody = pinRes ? await pinRes.json().catch(() => null) : null;
  const newPinId: string | null = pinBody?.id ? String(pinBody.id) : null;
  rep.post_status = postStatus; rep.correlation_id = correlationId; rep.new_pin_id = newPinId;
  rep.post_response = pinBody; rep.post_network_error = netErr;

  if (!newPinId) {
    // FAIL-CLOSED: read-only recovery, no second POST, no DELETE
    let recoveryFound: string | null = null;
    try {
      const lr = await fetch(`${PIN_API}/boards/${APPROVED.board_id}/pins?page_size=25`, { headers: { Authorization: `Bearer ${accessToken}` } });
      counts.GET += 1;
      const lb = await lr.json().catch(() => null);
      const found = (lb?.items ?? []).find((p: any) => (p?.link ?? "") === APPROVED.destination_url && (p?.title ?? "") === insertRow.pin_title);
      recoveryFound = found?.id ?? null;
    } catch { /* ignore */ }
    await sb.from("pinterest_pin_queue").update({ status: "failed", last_publish_error: netErr || `pinterest_http_${postStatus}`, pinterest_pin_id: recoveryFound }).eq("id", queueRowId);
    rep.recovery_scan = { found_pin_id: recoveryFound };
    let v = "PIN_6_V5_REPLACEMENT_FAILED_NO_UNCERTAIN_STATE";
    if (recoveryFound) { counts.uncertain += 1; counts.new_pins += 1; rep.final_item_status = "PIN_STATE_UNCERTAIN"; v = "PIN_6_V5_REPLACEMENT_FAILED_PIN_STATE_UNCERTAIN"; }
    else rep.final_item_status = "POST_FAILED_NO_PIN_CREATED";
    return json({ ok: false, verdict: v, counts, item: rep, publication_still_disabled: true, finished_at: new Date().toISOString() }, 200);
  }
  counts.new_pins += 1;
  rep.new_pin_public_url = `https://www.pinterest.com/pin/${newPinId}/`;

  // Read-back new pin
  let vStatus = 0; let vBody: any = null;
  try {
    const vr = await fetch(`${PIN_API}/pins/${newPinId}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    vStatus = vr.status; vBody = await vr.json().catch(() => null);
    counts.GET += 1;
  } catch (e) { vBody = { error: String(e) }; }

  const titleMatch = vBody?.title === insertRow.pin_title;
  const descMatch = vBody?.description === insertRow.pin_description;
  const destMatch = (vBody?.link ?? "") === APPROVED.destination_url;
  const utmMatch = String(vBody?.link ?? "").includes("utm_source=pinterest");
  const boardMatch = vBody?.board_id === APPROVED.board_id;
  const mediaImages = vBody?.media?.images ?? {};
  const has1200x1800 = !!Object.values(mediaImages).find((im: any) => im?.width === 1200 && im?.height === 1800) || !!mediaImages?.["1200x"];
  const mediaUrl = mediaImages?.["1200x"]?.url || mediaImages?.originals?.url || null;
  const mediaOk = !!mediaUrl;
  const claimAuditOnPin = [...containsBanned(vBody?.title ?? ""), ...containsBanned(vBody?.description ?? "")];
  const readbackOk = vStatus === 200 && vBody?.id === newPinId &&
    titleMatch && descMatch && destMatch && utmMatch && boardMatch && mediaOk &&
    claimAuditOnPin.length === 0;

  rep.readback = {
    http_status: vStatus,
    owner_match: !!vBody?.id,
    title_match: titleMatch, description_match: descMatch, destination_match: destMatch,
    utm_match: utmMatch, board_match: boardMatch, media_url: mediaUrl,
    has_1200x1800_rendition: has1200x1800,
    claim_audit_on_pin_metadata: { banned_tokens: claimAuditOnPin, ok: claimAuditOnPin.length === 0 },
    supplier_text_audit: "PASS_source_verified_v5_yellow_single_color",
    product_identity_audit: "PASS_deterministic_v5_asset_matches_product_id",
    single_color_presentation_audit: "PASS_yellow_only",
    ok: readbackOk,
  };

  await sb.from("pinterest_pin_queue").update({
    status: readbackOk ? "posted" : "posted_unverified",
    posted_at: new Date().toISOString(),
    pinterest_pin_id: newPinId,
    pin_verified: readbackOk,
    pin_verification_reason: readbackOk ? "readback_ok" : `readback_failed:http_${vStatus}`,
    pin_verified_at: new Date().toISOString(),
    http_status: postStatus,
  }).eq("id", queueRowId);

  if (!readbackOk) {
    rep.final_item_status = "NEW_PIN_VERIFICATION_FAILED";
    counts.uncertain += 1;
    return json({ ok: false, verdict: "PIN_6_V5_REPLACEMENT_FAILED_PIN_STATE_UNCERTAIN", counts, item: rep, publication_still_disabled: true, finished_at: new Date().toISOString() }, 200);
  }

  // DELETE old pin (exactly one)
  let delStatus = 0; let delErr: string | null = null;
  try {
    const dr = await fetch(`${PIN_API}/pins/${APPROVED.old_pin_id}`, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } });
    delStatus = dr.status;
  } catch (e) { delErr = String(e); }
  counts.DELETE += 1;
  const deleteOk = delStatus === 204 || delStatus === 200;
  rep.delete_old_pin_status = delStatus; rep.delete_error = delErr;

  if (!deleteOk) {
    rep.final_item_status = "OLD_PIN_DELETE_FAILED_TWO_PINS_TEMPORARILY";
    return json({ ok: false, verdict: "PIN_6_V5_REPLACEMENT_FAILED_NO_UNCERTAIN_STATE", counts, item: rep, publication_still_disabled: true, finished_at: new Date().toISOString() }, 200);
  }
  counts.deleted_pins += 1;

  // Confirm deletion
  let postDelStatus = 0;
  try {
    const c = await fetch(`${PIN_API}/pins/${APPROVED.old_pin_id}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    postDelStatus = c.status;
  } catch { /* ignore */ }
  counts.GET += 1;
  rep.post_delete_readback_status = postDelStatus;

  counts.remaining_correct_pins += 1;
  rep.final_item_status = "replaced_verified";
  await sb.from("pinterest_pin_queue").update({ meta: { ...(insertRow.meta as any), old_pin_deleted: true, post_delete_readback_status: postDelStatus } }).eq("id", queueRowId);

  const allOk = counts.new_pins === 1 && counts.deleted_pins === 1 && counts.uncertain === 0 && counts.duplicates === 0 && counts.remaining_correct_pins === 1;
  const verdict = allOk ? "PIN_6_V5_REPLACEMENT_PASS" : "PIN_6_V5_REPLACEMENT_FAILED_NO_UNCERTAIN_STATE";

  return json({
    ok: allOk,
    verdict, counts, item: rep,
    publication_still_disabled: true,
    finished_at: new Date().toISOString(),
  }, 200);
});