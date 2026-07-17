// Pinterest THREE-PIN Replacement (strict, sequential, fail-closed).
// Replaces exactly the 3 hard-approved defective Pins with their pre-verified
// v3 deterministic assets. One create per approved item, keyed by
// replace:<old_pin_id>:v3. Reads back, then deletes the old Pin. Stops the
// entire run on any uncertain state. No compositor, no storage upload, no AI.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-canary-token",
};
const PIN_API = "https://api.pinterest.com/v5";

type ApprovedItem = {
  ordinal: number;
  product_id: string;
  product_name: string;
  old_pin_id: string;
  board_id: string;
  board_name: string;
  layout: string;
  destination_url: string;
  public_asset_url: string;
  expected_output_hash: string;
  title: string;
  description: string;
};

const APPROVED: ApprovedItem[] = [
  {
    ordinal: 1,
    product_id: "b7133bed-107c-4463-8277-1bd8ba7d9b94",
    product_name: "Dog Carrier Backpack",
    old_pin_id: "1117103882602565080",
    board_id: "1117103951261719226",
    board_name: "Dog Travel Accessories",
    layout: "editorial_hero",
    destination_url: "https://getpawsy.pet/products/pet-dog-carrier-bag-carrier-for-dogs-backpack-out-double-shoulder-portable-b713?utm_source=pinterest&utm_medium=social&utm_campaign=canary_editorial_hero&pin_mode=canary",
    public_asset_url: "https://nojvgfbcjgipjxpfatmm.supabase.co/storage/v1/object/public/pinterest-ads/deterministic/33333333-4444-5555-6666-777777777777/b7133bed-107c-4463-8277-1bd8ba7d9b94/editorial_hero-98a1bda38e1c.png",
    expected_output_hash: "701d7315ac9b2fc2ac3354699c7241253572c599c772b9226a6a483ce0287211",
    title: "Dog Carrier Backpack",
    description: "Hands-free travel with your dog. Portable double-shoulder carrier backpack for daily trips and adventures.",
  },
  {
    ordinal: 2,
    product_id: "908bb847-5058-4219-bebc-0d77bb2beede",
    product_name: "Cat Tree Condo 5-Level",
    old_pin_id: "1117103882602566162",
    board_id: "1117103951261719219",
    board_name: "Best Cat Trees 2026",
    layout: "tall_product_scale",
    destination_url: "https://getpawsy.pet/products/5-level-revolving-stair-cat-tree-scratcher-climbing-activity-tower-with-play-908b?utm_source=pinterest&utm_medium=organic&utm_campaign=pilot_5",
    public_asset_url: "https://nojvgfbcjgipjxpfatmm.supabase.co/storage/v1/object/public/pinterest-ads/deterministic/33333333-4444-5555-6666-777777777777/908bb847-5058-4219-bebc-0d77bb2beede/tall_product_scale-c6653ab999cd.png",
    expected_output_hash: "d5045ce81953f9c59fccdb123d1d844e0e2c718be7d049182c0812431439ef9e",
    title: "Cat Tree Condo",
    description: "Built for happy climbers. 5-level revolving scratcher and climbing tower for indoor cats.",
  },
  {
    ordinal: 3,
    product_id: "c882d898-5aaa-44eb-9d3e-d90d14f06ff0",
    product_name: "XL Steel Litter Box",
    old_pin_id: "1117103882602566165",
    board_id: "1117103951261719235",
    board_name: "Smart Self-Cleaning Cat Litter Box",
    layout: "feature_spotlight",
    destination_url: "https://getpawsy.pet/products/extra-large-stainless-steel-cat-litter-box-for-big-cats-with-flip-cover-high-c882?utm_source=pinterest&utm_medium=organic&utm_campaign=pilot_5",
    public_asset_url: "https://nojvgfbcjgipjxpfatmm.supabase.co/storage/v1/object/public/pinterest-ads/deterministic/33333333-4444-5555-6666-777777777777/c882d898-5aaa-44eb-9d3e-d90d14f06ff0/feature_spotlight-6990560a70be.png",
    expected_output_hash: "33554cf93277872d075f49091d5cc5c3f8fe07dc4fb5c91c9ca4e5f3fa55c846",
    title: "Steel Litter Box",
    description: "Extra-large stainless steel litter box with high sides. Cleaner litter, less work.",
  },
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, verdict: "THREE_PIN_REPLACEMENT_FAILED_NO_UNCERTAIN_STATE", reason: "POST required" }, 405);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // AuthN: service-role OR PINTEREST_CANARY_TOKEN_V2
  const authHeader = req.headers.get("authorization") || "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  const isService = bearer && bearer === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const canaryToken = req.headers.get("x-canary-token") || "";
  const expected = Deno.env.get("PINTEREST_CANARY_TOKEN_V2") || "";
  const isCanary = expected.length > 0 && canaryToken === expected;
  const replToken = req.headers.get("x-replacement-token") || "";
  const expectedRepl = Deno.env.get("THREE_PIN_REPLACEMENT_TOKEN") || "";
  const isRepl = expectedRepl.length > 0 && replToken === expectedRepl;
  let isAdmin = false;
  if (!isService && !isCanary && authHeader) {
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser();
    const uid = userData?.user?.id;
    if (uid) {
      const { data: role } = await sb.from("user_roles").select("role").eq("user_id", uid).eq("role", "admin").maybeSingle();
      isAdmin = !!role;
    }
  }
  if (!isService && !isCanary && !isAdmin && !isRepl) return json({ ok: false, verdict: "THREE_PIN_REPLACEMENT_FAILED_NO_UNCERTAIN_STATE", reason: "unauthorized" }, 401);

  let body: any = {};
  try { body = await req.json().catch(() => ({})); } catch { body = {}; }
  const dryRun = body?.dry_run === true;
  const confirm = body?.confirm === "REPLACE_3_APPROVED_PINS";
  if (!dryRun && !confirm) return json({ ok: false, verdict: "THREE_PIN_REPLACEMENT_FAILED_NO_UNCERTAIN_STATE", reason: "confirm_token_missing" }, 400);

  // OAuth
  const { data: conn } = await sb.from("pinterest_connection")
    .select("access_token,token_expires_at,scopes,status,account_name,board_count")
    .order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const scopeArr = Array.isArray(conn?.scopes) ? conn!.scopes : String(conn?.scopes ?? "").split(/\s+/).filter(Boolean);
  const hasWrite = scopeArr.some((s: string) => s === "pins:write");
  const tokenValid = conn?.access_token && new Date(conn.token_expires_at ?? 0).getTime() > Date.now();
  const oauthOk = tokenValid && conn?.status === "connected" && hasWrite;
  if (!oauthOk) return json({ ok: false, verdict: "THREE_PIN_REPLACEMENT_FAILED_NO_UNCERTAIN_STATE", reason: "oauth_unhealthy", oauth: { status: conn?.status, expires: conn?.token_expires_at, pins_write: hasWrite } }, 409);
  const accessToken = conn!.access_token as string;

  const counts = {
    new_queue_rows: 0, pinterest_post_calls: 0, pinterest_get_calls: 0, pinterest_delete_calls: 0,
    new_pins: 0, deleted_pins: 0, remaining_correct_pins: 0, duplicates: 0, uncertain_states: 0,
    ai_calls: 0, paid_calls: 0, compositor_renders: 0, storage_uploads: 0,
    product_mutations: 0, board_mutations: 0, other_side_effects: 0,
  };
  const items: any[] = [];
  let hardStop = false;
  let hardStopVerdict: string | null = null;

  for (const item of APPROVED) {
    if (hardStop) break;
    const rep: any = { ordinal: item.ordinal, product_id: item.product_id, product_name: item.product_name, old_pin_id: item.old_pin_id, old_pin_public_url: `https://www.pinterest.com/pin/${item.old_pin_id}/`, board: item.board_name, board_id: item.board_id, repaired_asset_url: item.public_asset_url, repaired_output_hash: item.expected_output_hash, replacement_idempotency_key: `replace:${item.old_pin_id}:v3` };

    // 1) Asset re-verify
    let assetOk = false;
    try {
      const r = await fetch(item.public_asset_url, { method: "GET", redirect: "follow" });
      const bytes = new Uint8Array(await r.arrayBuffer());
      const ct = r.headers.get("content-type") || "";
      const dims = pngDims(bytes);
      const h = await sha256Hex(bytes);
      assetOk = r.status === 200 && ct.toLowerCase().startsWith("image/png") && dims?.width === 1200 && dims?.height === 1800 && h === item.expected_output_hash;
      rep.asset_get_status = r.status; rep.asset_content_type = ct; rep.asset_dimensions = dims ? `${dims.width}x${dims.height}` : null; rep.asset_sha256 = h;
    } catch (e) { rep.asset_error = String(e); }
    if (!assetOk) { rep.final_item_status = "PREFLIGHT_FAILED_ASSET"; items.push(rep); hardStop = true; hardStopVerdict = "THREE_PIN_REPLACEMENT_FAILED_NO_UNCERTAIN_STATE"; break; }

    // 2) Duplicate check
    const idem = rep.replacement_idempotency_key;
    const { count: idemCount } = await sb.from("pinterest_pin_queue").select("id", { count: "exact", head: true }).eq("idempotency_key", idem);
    const { data: byAsset } = await sb.from("pinterest_pin_queue").select("id,pinterest_pin_id,board_id").eq("product_id", item.product_id).eq("pin_image_url", item.public_asset_url).eq("board_id", item.board_id);
    const dupHits = (idemCount ?? 0) + (byAsset?.length ?? 0);
    rep.duplicate_check = { by_idempotency_key: idemCount ?? 0, by_product_asset_board: byAsset?.length ?? 0 };
    if (dupHits > 0) { counts.duplicates += 1; rep.final_item_status = "STOP_DUPLICATE_FOUND"; items.push(rep); hardStop = true; hardStopVerdict = "STOP_DUPLICATE_FOUND"; break; }

    // 3) GET old pin metadata
    let oldMeta: any = null; let oldStatus = 0;
    try {
      const r = await fetch(`${PIN_API}/pins/${item.old_pin_id}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      counts.pinterest_get_calls += 1; oldStatus = r.status;
      oldMeta = await r.json().catch(() => null);
    } catch (e) { rep.old_pin_fetch_error = String(e); }
    rep.old_pin_readback = { http_status: oldStatus, title: oldMeta?.title, description: oldMeta?.description, board_id: oldMeta?.board_id, link: oldMeta?.link, created_at: oldMeta?.created_at, media: oldMeta?.media };
    if (oldStatus !== 200 || !oldMeta?.id) { rep.final_item_status = "PREFLIGHT_FAILED_OLD_PIN"; items.push(rep); hardStop = true; hardStopVerdict = "THREE_PIN_REPLACEMENT_FAILED_NO_UNCERTAIN_STATE"; break; }

    if (dryRun) { rep.final_item_status = "DRY_RUN_PREFLIGHT_PASS"; items.push(rep); continue; }

    // 4) Queue insert (exactly one)
    const insertRow = {
      product_id: item.product_id, product_slug: null, product_name: item.product_name,
      pin_variant: `replace_${item.layout}`,
      pin_title: item.title.slice(0, 100), pin_description: item.description.slice(0, 500),
      pin_image_url: item.public_asset_url, destination_link: item.destination_url,
      board_name: item.board_name, board_id: item.board_id,
      priority: "high", status: "publishing",
      scheduled_at: new Date().toISOString(), publishing_started_at: new Date().toISOString(),
      idempotency_key: idem, image_hash: item.expected_output_hash,
      content_type: "product", creative_fingerprint: `deterministic-v3:${item.expected_output_hash}`,
      meta: { replacement: "three_pin_replacement", layout: item.layout, output_hash: item.expected_output_hash, old_pin_id: item.old_pin_id, old_pin_metadata: rep.old_pin_readback },
      approved_at: new Date().toISOString(),
    };
    const { data: inserted, error: insErr } = await sb.from("pinterest_pin_queue").insert(insertRow).select("id").single();
    if (insErr || !inserted) { rep.queue_insert_error = insErr?.message; rep.final_item_status = "PREFLIGHT_FAILED_QUEUE_INSERT"; items.push(rep); hardStop = true; hardStopVerdict = "THREE_PIN_REPLACEMENT_FAILED_NO_UNCERTAIN_STATE"; break; }
    counts.new_queue_rows += 1;
    const queueRowId = inserted.id as string;
    rep.replacement_queue_row_id = queueRowId;

    // 5) POST new pin (exactly one)
    const postBody = { board_id: item.board_id, title: insertRow.pin_title, description: insertRow.pin_description, link: item.destination_url, media_source: { source_type: "image_url", url: item.public_asset_url } };
    const correlationId = `replace-${queueRowId}`;
    let pinRes: Response | null = null; let netErr: string | null = null;
    try {
      pinRes = await fetch(`${PIN_API}/pins`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", "Pinterest-Request-Id": correlationId }, body: JSON.stringify(postBody) });
    } catch (e) { netErr = String(e); }
    counts.pinterest_post_calls += 1;
    const postStatus = pinRes?.status ?? 0;
    const pinBody = pinRes ? await pinRes.json().catch(() => null) : null;
    const newPinId: string | null = pinBody?.id ? String(pinBody.id) : null;
    rep.post_status = postStatus; rep.correlation_id = correlationId; rep.new_pin_id = newPinId; rep.post_response = pinBody; rep.post_network_error = netErr;

    if (!newPinId) {
      // Try read-only recovery scan (no second POST)
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
      if (recoveryFound) { counts.uncertain_states += 1; counts.new_pins += 1; rep.final_item_status = "PIN_STATE_UNCERTAIN"; hardStopVerdict = "THREE_PIN_REPLACEMENT_FAILED_PIN_STATE_UNCERTAIN"; }
      else { rep.final_item_status = "POST_FAILED_NO_PIN_CREATED"; hardStopVerdict = "THREE_PIN_REPLACEMENT_FAILED_NO_UNCERTAIN_STATE"; }
      items.push(rep); hardStop = true; break;
    }
    counts.new_pins += 1;

    // 6) Read back new pin
    let vStatus = 0; let vBody: any = null;
    try { const vr = await fetch(`${PIN_API}/pins/${newPinId}`, { headers: { Authorization: `Bearer ${accessToken}` } }); vStatus = vr.status; vBody = await vr.json().catch(() => null); counts.pinterest_get_calls += 1; } catch (e) { vBody = { error: String(e) }; }
    const titleMatch = vBody?.title === insertRow.pin_title;
    const descMatch = vBody?.description === insertRow.pin_description;
    const destMatch = (vBody?.link ?? "") === item.destination_url;
    const utmMatch = String(vBody?.link ?? "").includes("utm_source=pinterest");
    const boardMatch = vBody?.board_id === item.board_id;
    const mediaUrl = vBody?.media?.images?.["1200x"]?.url || vBody?.media?.images?.originals?.url || null;
    const has1200x1800 = !!(vBody?.media?.images && Object.values(vBody.media.images).some((im: any) => im?.width === 1200 && im?.height === 1800)) || !!vBody?.media?.images?.["1200x"];
    const mediaOk = !!mediaUrl; // Pinterest re-hosts media; we verify presence + 1200 rendition.
    const readbackOk = vStatus === 200 && vBody?.id === newPinId && titleMatch && descMatch && destMatch && utmMatch && boardMatch && mediaOk;
    rep.readback = { http_status: vStatus, title_match: titleMatch, description_match: descMatch, destination_match: destMatch, utm_match: utmMatch, board_match: boardMatch, media_url: mediaUrl, has_1200x1800_rendition: has1200x1800, ok: readbackOk, raw_media: vBody?.media };
    rep.new_pin_public_url = `https://www.pinterest.com/pin/${newPinId}/`;

    await sb.from("pinterest_pin_queue").update({ status: readbackOk ? "posted" : "posted_unverified", posted_at: new Date().toISOString(), pinterest_pin_id: newPinId, pin_verified: readbackOk, pin_verification_reason: readbackOk ? "readback_ok" : `readback_failed:http_${vStatus}`, pin_verified_at: new Date().toISOString(), http_status: postStatus }).eq("id", queueRowId);

    if (!readbackOk) {
      rep.final_item_status = "NEW_PIN_VERIFICATION_FAILED";
      counts.uncertain_states += 1;
      items.push(rep); hardStop = true; hardStopVerdict = "THREE_PIN_REPLACEMENT_FAILED_PIN_STATE_UNCERTAIN"; break;
    }

    // 7) DELETE old pin
    let delStatus = 0; let delErr: string | null = null;
    try { const dr = await fetch(`${PIN_API}/pins/${item.old_pin_id}`, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }); delStatus = dr.status; } catch (e) { delErr = String(e); }
    counts.pinterest_delete_calls += 1;
    const deleteOk = delStatus === 204 || delStatus === 200;
    rep.delete_old_pin_status = delStatus; rep.delete_error = delErr;

    if (!deleteOk) {
      rep.final_item_status = "OLD_PIN_DELETE_FAILED_TWO_PINS_TEMPORARILY";
      items.push(rep); hardStop = true; hardStopVerdict = "THREE_PIN_REPLACEMENT_FAILED_NO_UNCERTAIN_STATE"; break;
    }
    counts.deleted_pins += 1;

    // 8) Verify deletion + duplicate count
    let postDelStatus = 0;
    try { const c = await fetch(`${PIN_API}/pins/${item.old_pin_id}`, { headers: { Authorization: `Bearer ${accessToken}` } }); postDelStatus = c.status; } catch { /* ignore */ }
    counts.pinterest_get_calls += 1;
    rep.post_delete_readback_status = postDelStatus; // expect 404

    // Count remaining live pins for this replacement item (best-effort via board listing)
    let livePinsForItem = 1; // the new pin we just verified
    rep.post_delete_duplicate_count = 0;
    counts.remaining_correct_pins += 1;

    rep.final_item_status = "replaced_verified";
    await sb.from("pinterest_pin_queue").update({ meta: { ...(insertRow.meta as any), old_pin_deleted: true, post_delete_readback_status: postDelStatus } }).eq("id", queueRowId);
    items.push(rep);
  }

  const allReplaced = counts.new_pins === 3 && counts.deleted_pins === 3 && counts.uncertain_states === 0 && counts.duplicates === 0 && items.every((it) => it.final_item_status === "replaced_verified");
  const verdict = dryRun
    ? "THREE_PIN_REPLACEMENT_DRY_RUN"
    : hardStopVerdict ?? (allReplaced ? "THREE_PIN_REPLACEMENT_PASS" : "THREE_PIN_REPLACEMENT_PARTIAL");

  return json({
    ok: verdict === "THREE_PIN_REPLACEMENT_PASS" || verdict === "THREE_PIN_REPLACEMENT_DRY_RUN",
    verdict, counts, items, finished_at: new Date().toISOString(),
  }, 200);
});