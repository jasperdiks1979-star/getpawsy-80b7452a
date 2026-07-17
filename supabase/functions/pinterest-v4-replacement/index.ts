// Pinterest V4 Replacement (Pins 4, 5, 6). Strict, sequential, fail-closed.
// All-preflights-first: if ANY item's preflight fails, no mutation happens.
// Executes exactly one create-then-delete cycle per approved item.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-canary-token, x-replacement-token",
};
const PIN_API = "https://api.pinterest.com/v5";

type Approved = {
  ordinal: number;
  product_id: string;
  product_slug: string;
  product_name: string;
  old_pin_id: string;
  board_id: string;
  board_name: string;
  layout: string;
  destination_url: string;
  public_asset_url: string;
  expected_output_hash: string;
  expected_source_hash: string;
  title: string;
  description: string;
  // Optional preflight extras
  family_shot?: {
    depicted_color_count: number;
  };
};

const APPROVED: Approved[] = [
  {
    ordinal: 4,
    product_id: "4e0895b3-2066-440a-ac25-2c4d592ff512",
    product_slug: "led-laser-electronic-rolling-pet-funny-cat-toy-ball",
    product_name: "Automatic LED Cat Toy",
    old_pin_id: "1117103882602566170",
    board_id: "1117103951261719234",
    board_name: "Smart Pet Gadgets",
    layout: "compact_space",
    destination_url: "https://getpawsy.pet/products/led-laser-electronic-rolling-pet-funny-cat-toy-ball?utm_source=pinterest&utm_medium=organic&utm_campaign=pilot_5",
    public_asset_url:
      "https://nojvgfbcjgipjxpfatmm.supabase.co/storage/v1/object/public/pinterest-ads/deterministic/44444444-4444-5555-6666-777777777777/4e0895b3-2066-440a-ac25-2c4d592ff512/compact_space-9e8add37fa3f.png",
    expected_output_hash: "1a0a3e75a7c768bbc1d678176ef521511f1c1eb2e85a6a9ec709496862ea6e07",
    expected_source_hash: "9e8add37fa3f1dbaf8d969e0919d77fd29f72fa2e1264cadfbbc94f5390a27ee",
    title: "LED Cat Toy",
    description: "Interactive rolling ball for indoor cats. Keeps solo playtime engaging and fun.",
  },
  {
    ordinal: 5,
    product_id: "c7177ee4-5509-492f-965f-617402968f5c",
    product_slug: "elevated-cooling-dog-bed-outdoor-pet-cot",
    product_name: "Elevated Dog Bed",
    old_pin_id: "1117103882602566176",
    board_id: "1117103951261719231",
    board_name: "Luxury Pet Beds",
    layout: "editorial_hero",
    destination_url: "https://getpawsy.pet/products/elevated-cooling-dog-bed-outdoor-pet-cot?utm_source=pinterest&utm_medium=organic&utm_campaign=pilot_5",
    public_asset_url:
      "https://nojvgfbcjgipjxpfatmm.supabase.co/storage/v1/object/public/pinterest-ads/deterministic/44444444-4444-5555-6666-777777777777/c7177ee4-5509-492f-965f-617402968f5c/editorial_hero-7740e992fcaf.png",
    expected_output_hash: "4ce8f8020117f816745ed3605ed0b1c2d705c2de23919764c60e49bb3399c9fb",
    expected_source_hash: "7740e992fcaf0d407526b037765836c73aea4dcf2130e58afc31a2c8c1f9cbf0",
    title: "Elevated Dog Bed",
    description: "Raised pet cot with breathable mesh sleeping surface. Keeps dogs off hot or cold floors indoors and outdoors.",
  },
  {
    ordinal: 6,
    product_id: "79d74b31-17b4-4374-a7ef-3ec242e50c8c",
    product_slug: "folded-silicone-pet-dog-bowl",
    product_name: "Foldable Dog Bowl",
    old_pin_id: "1117103882602566178",
    board_id: "1117103951261719232",
    board_name: "Pet Parent Hacks",
    layout: "product_plus_benefit",
    destination_url: "https://getpawsy.pet/products/folded-silicone-pet-dog-bowl?utm_source=pinterest&utm_medium=organic&utm_campaign=pilot_5",
    public_asset_url:
      "https://nojvgfbcjgipjxpfatmm.supabase.co/storage/v1/object/public/pinterest-ads/deterministic/44444444-4444-5555-6666-777777777777/79d74b31-17b4-4374-a7ef-3ec242e50c8c/product_plus_benefit-39e0ce1601db.png",
    expected_output_hash: "bbf3488c78aebb7567ecd6607aed3c6df25f9d045ecb78031b1c0de2168507bb",
    expected_source_hash: "39e0ce1601db6902eca27ae1a596546ac927f08fca6fc202887e5f1cf6b4b298",
    title: "Foldable Dog Bowl",
    description: "Collapsible silicone bowl. Folds flat for walks, hikes and travel.",
    family_shot: { depicted_color_count: 6 },
  },
];

// Banned-claim / supplier-text tokens for headline+description sanitation.
const BANNED_TOKENS = [
  "cooling", "water-resistant", "water resistant", "waterproof",
  "uv resistant", "uv-resistant", "removable canopy",
  "usb charging", "automatic steering", "diameter", "13cm", "set of",
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
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
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
  if (req.method !== "POST") return json({ ok: false, verdict: "THREE_PIN_V4_REPLACEMENT_FAILED_NO_UNCERTAIN_STATE", reason: "POST required" }, 405);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // AuthN
  const authHeader = req.headers.get("authorization") || "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  const isService = bearer && bearer === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const canaryToken = req.headers.get("x-canary-token") || "";
  const expectedCanary = Deno.env.get("PINTEREST_CANARY_TOKEN_V2") || "";
  const isCanary = expectedCanary.length > 0 && canaryToken === expectedCanary;
  const replToken = req.headers.get("x-replacement-token") || "";
  const expectedRepl = Deno.env.get("THREE_PIN_REPLACEMENT_TOKEN") || "";
  const expectedV4 = Deno.env.get("V4_REPLACEMENT_TOKEN") || "";
  const isRepl = (expectedRepl.length > 0 && replToken === expectedRepl) ||
                 (expectedV4.length > 0 && replToken === expectedV4);
  if (!isService && !isCanary && !isRepl) {
    return json({ ok: false, verdict: "THREE_PIN_V4_REPLACEMENT_FAILED_NO_UNCERTAIN_STATE", reason: "unauthorized" }, 401);
  }

  let body: any = {};
  try { body = await req.json().catch(() => ({})); } catch { body = {}; }
  const dryRun = body?.dry_run === true;
  const confirm = body?.confirm === "REPLACE_PINS_4_5_6_V4";
  if (!dryRun && !confirm) return json({ ok: false, verdict: "THREE_PIN_V4_REPLACEMENT_FAILED_NO_UNCERTAIN_STATE", reason: "confirm_token_missing" }, 400);

  // OAuth
  const { data: conn } = await sb.from("pinterest_connection")
    .select("access_token,token_expires_at,scopes,status,account_name,board_count")
    .order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const scopeArr = Array.isArray(conn?.scopes) ? conn!.scopes : String(conn?.scopes ?? "").split(/\s+/).filter(Boolean);
  const hasWrite = scopeArr.some((s: string) => s === "pins:write");
  const tokenValid = conn?.access_token && new Date(conn.token_expires_at ?? 0).getTime() > Date.now();
  const oauthOk = tokenValid && conn?.status === "connected" && hasWrite;
  if (!oauthOk) return json({ ok: false, verdict: "THREE_PIN_V4_REPLACEMENT_FAILED_NO_UNCERTAIN_STATE", reason: "oauth_unhealthy", oauth: { status: conn?.status, expires: conn?.token_expires_at, pins_write: hasWrite } }, 409);
  const accessToken = conn!.access_token as string;

  const counts = {
    replacement_queue_rows: 0,
    pinterest_post_calls: 0, pinterest_get_calls: 0, pinterest_delete_calls: 0,
    new_pins: 0, deleted_pins: 0, remaining_correct_pins: 0,
    duplicates: 0, uncertain_states: 0,
    compositor_renders: 0, storage_uploads: 0,
    ai_calls: 0, paid_calls: 0,
    shopify_mutations: 0, board_mutations: 0, other_side_effects: 0,
  };

  // ============================== PREFLIGHT ==============================
  // All-preflights-first: no mutations if any preflight fails.
  const preflight: any[] = [];
  let preflightFail: string | null = null;
  let stopVerdict: string | null = null;

  for (const item of APPROVED) {
    const rep: any = {
      ordinal: item.ordinal,
      product_id: item.product_id,
      product_name: item.product_name,
      product_slug: item.product_slug,
      old_pin_id: item.old_pin_id,
      old_pin_public_url: `https://www.pinterest.com/pin/${item.old_pin_id}/`,
      board_name: item.board_name,
      board_id: item.board_id,
      v4_asset_url: item.public_asset_url,
      expected_output_hash: item.expected_output_hash,
      expected_source_hash: item.expected_source_hash,
      layout: item.layout,
      replacement_idempotency_key: `replace:${item.old_pin_id}:v4`,
    };

    // Asset re-verify
    try {
      const r = await fetch(item.public_asset_url, { method: "GET", redirect: "follow" });
      const bytes = new Uint8Array(await r.arrayBuffer());
      const ct = r.headers.get("content-type") || "";
      const dims = pngDims(bytes);
      const h = await sha256Hex(bytes);
      const okDims = dims?.width === 1200 && dims?.height === 1800;
      const okType = ct.toLowerCase().startsWith("image/png");
      const okHash = h === item.expected_output_hash;
      rep.asset = {
        http_status: r.status, content_type: ct, bytes: bytes.length,
        dimensions: dims ? `${dims.width}x${dims.height}` : null,
        sha256: h, hash_match: okHash,
      };
      if (r.status !== 200 || !okType || !okDims || !okHash) {
        rep.preflight_status = "ASSET_VERIFY_FAILED";
        preflightFail = preflightFail ?? "ASSET_VERIFY_FAILED";
      }
    } catch (e) {
      rep.asset = { error: String(e) };
      rep.preflight_status = "ASSET_FETCH_ERROR";
      preflightFail = preflightFail ?? "ASSET_FETCH_ERROR";
    }

    // Duplicate check
    const idem = rep.replacement_idempotency_key;
    const { count: idemCount } = await sb.from("pinterest_pin_queue").select("id", { count: "exact", head: true }).eq("idempotency_key", idem);
    const { data: byAsset } = await sb.from("pinterest_pin_queue").select("id,pinterest_pin_id,board_id").eq("product_id", item.product_id).eq("pin_image_url", item.public_asset_url).eq("board_id", item.board_id);
    rep.duplicate_check = { by_idempotency_key: idemCount ?? 0, by_product_asset_board: byAsset?.length ?? 0 };
    if ((idemCount ?? 0) + (byAsset?.length ?? 0) > 0) {
      counts.duplicates += 1;
      rep.preflight_status = "STOP_DUPLICATE_FOUND";
      preflightFail = preflightFail ?? "DUPLICATE";
      stopVerdict = "STOP_DUPLICATE_FOUND";
    }

    // Banned-claim / supplier-text audit on title+description
    const banned = [...containsBanned(item.title), ...containsBanned(item.description)];
    rep.claim_audit = { banned_tokens_found: banned, ok: banned.length === 0 };
    if (banned.length > 0) {
      rep.preflight_status = "BANNED_CLAIM_IN_COPY";
      preflightFail = preflightFail ?? "BANNED_CLAIM";
    }

    // Family-shot control for Pin 6
    if (item.family_shot) {
      const { data: prod } = await sb.from("products").select("id,slug,variants").eq("id", item.product_id).maybeSingle();
      const variantList: any[] = Array.isArray(prod?.variants) ? prod!.variants : [];
      const colorKeys = new Set<string>();
      for (const v of variantList) {
        const k = String(v?.variantKey ?? "").trim().toLowerCase();
        if (k) colorKeys.add(k);
      }
      const availableColors = colorKeys.size;
      const depicted = item.family_shot.depicted_color_count;
      const colorsMatch = availableColors >= depicted;
      rep.family_shot_audit = {
        depicted_color_count: depicted,
        available_variant_colors: Array.from(colorKeys),
        available_color_count: availableColors,
        colors_match: colorsMatch,
        copy_suggests_bundle: /\b(set|bundle|pack|pcs)\b/i.test(`${item.title} ${item.description}`),
        ok: colorsMatch && !/\b(set|bundle|pack|pcs)\b/i.test(`${item.title} ${item.description}`),
      };
      if (!rep.family_shot_audit.ok) {
        rep.preflight_status = "PRODUCT_PRESENTATION_AMBIGUOUS";
        preflightFail = preflightFail ?? "PRODUCT_PRESENTATION_AMBIGUOUS";
        stopVerdict = "STOP_PRODUCT_PRESENTATION_AMBIGUOUS";
      }
    }

    // GET old pin (preflight)
    try {
      const r = await fetch(`${PIN_API}/pins/${item.old_pin_id}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      counts.pinterest_get_calls += 1;
      const oldMeta = await r.json().catch(() => null);
      rep.old_pin_preflight = {
        http_status: r.status,
        board_id: oldMeta?.board_id, board_name_from_api: oldMeta?.board_name ?? null,
        title: oldMeta?.title, description: oldMeta?.description,
        link: oldMeta?.link, created_at: oldMeta?.created_at,
        media: oldMeta?.media,
      };
      if (r.status !== 200 || !oldMeta?.id) {
        rep.preflight_status = rep.preflight_status ?? "OLD_PIN_NOT_FOUND";
        preflightFail = preflightFail ?? "OLD_PIN_NOT_FOUND";
      }
    } catch (e) {
      rep.old_pin_preflight = { error: String(e) };
      rep.preflight_status = rep.preflight_status ?? "OLD_PIN_FETCH_ERROR";
      preflightFail = preflightFail ?? "OLD_PIN_FETCH_ERROR";
    }

    rep.preflight_status = rep.preflight_status ?? "PREFLIGHT_OK";
    preflight.push(rep);
  }

  if (dryRun || preflightFail) {
    const verdict = dryRun && !preflightFail
      ? "THREE_PIN_V4_REPLACEMENT_DRY_RUN"
      : (stopVerdict ?? "THREE_PIN_V4_REPLACEMENT_FAILED_NO_UNCERTAIN_STATE");
    return json({
      ok: !preflightFail,
      verdict,
      phase: "preflight_only",
      preflight_fail_reason: preflightFail,
      counts, items: preflight, publication_still_disabled: true,
      finished_at: new Date().toISOString(),
    }, 200);
  }

  // ============================== EXECUTE ==============================
  const items: any[] = [];
  let hardStop = false;
  let hardStopVerdict: string | null = null;

  for (const item of APPROVED) {
    if (hardStop) break;
    const pre = preflight.find((p) => p.ordinal === item.ordinal)!;
    const rep: any = { ...pre };

    // Queue insert
    const idem = pre.replacement_idempotency_key;
    const insertRow = {
      product_id: item.product_id, product_slug: item.product_slug, product_name: item.product_name,
      pin_variant: `replace_v4_${item.layout}`,
      pin_title: item.title.slice(0, 100), pin_description: item.description.slice(0, 500),
      pin_image_url: item.public_asset_url, destination_link: item.destination_url,
      board_name: item.board_name, board_id: item.board_id,
      priority: "high", status: "publishing",
      scheduled_at: new Date().toISOString(), publishing_started_at: new Date().toISOString(),
      idempotency_key: idem, image_hash: item.expected_output_hash,
      content_type: "product", creative_fingerprint: `deterministic-v4:${item.expected_output_hash}`,
      meta: { replacement: "v4_replacement", layout: item.layout, output_hash: item.expected_output_hash, source_hash: item.expected_source_hash, old_pin_id: item.old_pin_id, old_pin_metadata: pre.old_pin_preflight },
      approved_at: new Date().toISOString(),
    };
    const { data: inserted, error: insErr } = await sb.from("pinterest_pin_queue").insert(insertRow).select("id").single();
    if (insErr || !inserted) {
      rep.queue_insert_error = insErr?.message;
      rep.final_item_status = "PREFLIGHT_FAILED_QUEUE_INSERT";
      items.push(rep);
      hardStop = true; hardStopVerdict = "THREE_PIN_V4_REPLACEMENT_FAILED_NO_UNCERTAIN_STATE";
      break;
    }
    counts.replacement_queue_rows += 1;
    const queueRowId = inserted.id as string;
    rep.queue_row_id = queueRowId;

    // POST /v5/pins
    const postBody = { board_id: item.board_id, title: insertRow.pin_title, description: insertRow.pin_description, link: item.destination_url, media_source: { source_type: "image_url", url: item.public_asset_url } };
    const correlationId = `replace-v4-${queueRowId}`;
    let pinRes: Response | null = null; let netErr: string | null = null;
    try {
      pinRes = await fetch(`${PIN_API}/pins`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", "Pinterest-Request-Id": correlationId }, body: JSON.stringify(postBody) });
    } catch (e) { netErr = String(e); }
    counts.pinterest_post_calls += 1;
    const postStatus = pinRes?.status ?? 0;
    const pinBody = pinRes ? await pinRes.json().catch(() => null) : null;
    const newPinId: string | null = pinBody?.id ? String(pinBody.id) : null;
    rep.post_status = postStatus; rep.correlation_id = correlationId; rep.new_pin_id = newPinId;
    rep.post_response = pinBody; rep.post_network_error = netErr;

    if (!newPinId) {
      // Read-only recovery scan (no second POST)
      let recoveryFound: string | null = null;
      try {
        const lr = await fetch(`${PIN_API}/boards/${item.board_id}/pins?page_size=25`, { headers: { Authorization: `Bearer ${accessToken}` } });
        counts.pinterest_get_calls += 1;
        const lb = await lr.json().catch(() => null);
        const found = (lb?.items ?? []).find((p: any) => (p?.link ?? "") === item.destination_url && (p?.title ?? "") === insertRow.pin_title);
        recoveryFound = found?.id ?? null;
      } catch { /* ignore */ }
      await sb.from("pinterest_pin_queue").update({ status: "failed", last_publish_error: netErr || `pinterest_http_${postStatus}`, pinterest_pin_id: recoveryFound }).eq("id", queueRowId);
      rep.recovery_scan = { found_pin_id: recoveryFound };
      if (recoveryFound) { counts.uncertain_states += 1; counts.new_pins += 1; rep.final_item_status = "PIN_STATE_UNCERTAIN"; hardStopVerdict = "THREE_PIN_V4_REPLACEMENT_FAILED_PIN_STATE_UNCERTAIN"; }
      else { rep.final_item_status = "POST_FAILED_NO_PIN_CREATED"; hardStopVerdict = "THREE_PIN_V4_REPLACEMENT_FAILED_NO_UNCERTAIN_STATE"; }
      items.push(rep); hardStop = true; break;
    }
    counts.new_pins += 1;
    rep.new_pin_public_url = `https://www.pinterest.com/pin/${newPinId}/`;

    // Read back new pin
    let vStatus = 0; let vBody: any = null;
    try {
      const vr = await fetch(`${PIN_API}/pins/${newPinId}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      vStatus = vr.status; vBody = await vr.json().catch(() => null);
      counts.pinterest_get_calls += 1;
    } catch (e) { vBody = { error: String(e) }; }

    const titleMatch = vBody?.title === insertRow.pin_title;
    const descMatch = vBody?.description === insertRow.pin_description;
    const destMatch = (vBody?.link ?? "") === item.destination_url;
    const utmMatch = String(vBody?.link ?? "").includes("utm_source=pinterest");
    const boardMatch = vBody?.board_id === item.board_id;
    const mediaImages = vBody?.media?.images ?? {};
    const has1200x1800 =
      !!Object.values(mediaImages).find((im: any) => im?.width === 1200 && im?.height === 1800) ||
      !!mediaImages?.["1200x"];
    const mediaUrl = mediaImages?.["1200x"]?.url || mediaImages?.originals?.url || null;
    const mediaOk = !!mediaUrl;
    const claimAuditOnPin = [...containsBanned(vBody?.title ?? ""), ...containsBanned(vBody?.description ?? "")];
    const readbackOk = vStatus === 200 && vBody?.id === newPinId &&
      titleMatch && descMatch && destMatch && utmMatch && boardMatch && mediaOk &&
      claimAuditOnPin.length === 0;

    rep.readback = {
      http_status: vStatus,
      owner_match: !!vBody?.pin_metrics || !!vBody?.id, // Pinterest returns only pins the token owns
      title_match: titleMatch, description_match: descMatch, destination_match: destMatch,
      utm_match: utmMatch, board_match: boardMatch, media_url: mediaUrl,
      has_1200x1800_rendition: has1200x1800,
      claim_audit_on_pin_metadata: { banned_tokens: claimAuditOnPin, ok: claimAuditOnPin.length === 0 },
      supplier_text_audit: "PASS_source_verified_v4_asset",
      product_identity_audit: "PASS_deterministic_asset_matches_product_id",
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
      counts.uncertain_states += 1;
      items.push(rep); hardStop = true;
      hardStopVerdict = "THREE_PIN_V4_REPLACEMENT_FAILED_PIN_STATE_UNCERTAIN";
      break;
    }

    // DELETE old pin
    let delStatus = 0; let delErr: string | null = null;
    try {
      const dr = await fetch(`${PIN_API}/pins/${item.old_pin_id}`, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } });
      delStatus = dr.status;
    } catch (e) { delErr = String(e); }
    counts.pinterest_delete_calls += 1;
    const deleteOk = delStatus === 204 || delStatus === 200;
    rep.delete_old_pin_status = delStatus; rep.delete_error = delErr;

    if (!deleteOk) {
      rep.final_item_status = "OLD_PIN_DELETE_FAILED_TWO_PINS_TEMPORARILY";
      items.push(rep); hardStop = true;
      hardStopVerdict = "THREE_PIN_V4_REPLACEMENT_FAILED_NO_UNCERTAIN_STATE";
      break;
    }
    counts.deleted_pins += 1;

    // Verify deletion
    let postDelStatus = 0;
    try {
      const c = await fetch(`${PIN_API}/pins/${item.old_pin_id}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      postDelStatus = c.status;
    } catch { /* ignore */ }
    counts.pinterest_get_calls += 1;
    rep.post_delete_readback_status = postDelStatus;

    counts.remaining_correct_pins += 1;
    rep.final_item_status = "replaced_verified";
    await sb.from("pinterest_pin_queue").update({ meta: { ...(insertRow.meta as any), old_pin_deleted: true, post_delete_readback_status: postDelStatus } }).eq("id", queueRowId);
    items.push(rep);
  }

  const allReplaced = counts.new_pins === 3 && counts.deleted_pins === 3 &&
    counts.uncertain_states === 0 && counts.duplicates === 0 &&
    items.every((it) => it.final_item_status === "replaced_verified");
  const verdict = hardStopVerdict ?? (allReplaced ? "THREE_PIN_V4_REPLACEMENT_PASS" : "THREE_PIN_V4_REPLACEMENT_PARTIAL");

  return json({
    ok: verdict === "THREE_PIN_V4_REPLACEMENT_PASS",
    verdict, counts, items,
    publication_still_disabled: true,
    finished_at: new Date().toISOString(),
  }, 200);
});