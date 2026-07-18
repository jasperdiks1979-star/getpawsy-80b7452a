// pinterest-cta-overlay
//
// Single-pin executor for the deterministic CTA v6 overlay repair.
//
// Accepts a pre-rendered v6-repaired PNG (produced by the local
// deterministic overlay engine using LAYOUTS[layout].ctaBox + BG palette;
// see .lovable/plan.md), uploads it to storage under an immutable
// `-cta-v6.png` path, publishes a replacement Pinterest Pin that
// preserves title/description/alt/board/destination/UTMs, verifies the
// new pin is live, then deletes the legacy pin.
//
// Never uses AI. Never uses paid credits. Never overwrites source assets.
// Fail-closed: original pin is only deleted after the replacement is
// publicly verified.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-canary-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const PIN_API = "https://api.pinterest.com/v5";

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

type Body = {
  confirm?: string;
  pin_id: string;
  product_id: string;
  board_id: string;
  layout: string;
  cta_label: string;
  asset_b64: string; // base64 PNG (v6 overlaid, 1200x1800)
  asset_sha256: string;
  storage_dir: string; // e.g. "deterministic/cta-v6/<pin_id>"
  idempotency_key: string; // e.g. cta-overlay-v6:<original_pin_id>:v1
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST required" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // Auth: service key OR canary token OR admin user
  const authHeader = req.headers.get("authorization") || "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  const isService = !!bearer && bearer === SERVICE_KEY;
  const canaryToken = req.headers.get("x-canary-token") || "";
  const expected = Deno.env.get("PINTEREST_CANARY_TOKEN_V2") || "";
  const isCanary = expected.length > 0 && canaryToken === expected;
  let isAdmin = false;
  if (!isService && !isCanary && authHeader) {
    const uc = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: ud } = await uc.auth.getUser();
    const uid = ud?.user?.id;
    if (uid) {
      const { data: role } = await sb
        .from("user_roles").select("role")
        .eq("user_id", uid).eq("role", "admin").maybeSingle();
      isAdmin = !!role;
    }
  }
  if (!isService && !isCanary && !isAdmin) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  let body: Body;
  try { body = await req.json(); } catch { return json({ ok:false, error:"bad_json" }, 400); }
  if (body.confirm !== "CTA_OVERLAY_V6_EXECUTE") {
    return json({ ok:false, error:"confirm_token_missing", expected:"CTA_OVERLAY_V6_EXECUTE" }, 400);
  }
  for (const k of ["pin_id","product_id","board_id","layout","cta_label","asset_b64","asset_sha256","storage_dir","idempotency_key"] as const) {
    if (!body[k]) return json({ ok:false, error:`missing:${k}` }, 400);
  }

  const counts = { gets: 0, posts: 0, deletes: 0, db_writes: 0, ai_calls: 0, paid_image_calls: 0, credits_spent: 0 };
  const trace: Record<string, unknown> = {};

  // Step 0: decode + verify sha256
  const bin = Uint8Array.from(atob(body.asset_b64), (c) => c.charCodeAt(0));
  const dh = await crypto.subtle.digest("SHA-256", bin);
  const hex = Array.from(new Uint8Array(dh)).map(b=>b.toString(16).padStart(2,"0")).join("");
  if (hex !== body.asset_sha256) {
    return json({ ok:false, error:"asset_sha_mismatch", expected: body.asset_sha256, actual: hex }, 400);
  }
  trace.asset_sha256 = hex;
  trace.asset_bytes = bin.byteLength;

  // Step 1: fresh Pinterest read-back of original
  const { data: conn } = await sb.from("pinterest_connection")
    .select("access_token,token_expires_at,scopes,status")
    .order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const scopeArr = Array.isArray(conn?.scopes) ? conn!.scopes
    : String(conn?.scopes ?? "").split(/\s+/).filter(Boolean);
  const hasWrite = scopeArr.some((s: string) => s === "pins:write");
  const tokenValid = !!conn?.access_token && new Date(conn.token_expires_at ?? 0).getTime() > Date.now();
  if (!tokenValid || conn?.status !== "connected" || !hasWrite) {
    return json({ ok:false, error:"oauth_unhealthy" }, 409);
  }
  const token = conn!.access_token as string;

  const rb = await fetch(`${PIN_API}/pins/${body.pin_id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  counts.gets += 1;
  const orig = await rb.json().catch(() => null);
  if (rb.status !== 200 || !orig?.id) {
    return json({ ok:false, error:"original_not_live", http:rb.status }, 409);
  }
  trace.original = {
    id: orig.id, board_id: orig.board_id, title: orig.title,
    description: orig.description, alt_text: orig.alt_text, link: orig.link,
  };
  if (orig.board_id !== body.board_id) {
    return json({ ok:false, error:"board_mismatch", expected: body.board_id, actual: orig.board_id }, 409);
  }

  // Step 1b: duplicate-replacement guard — check DB for an existing
  // replacement row keyed by our idempotency key.
  const { data: existingRepl } = await sb.from("pinterest_pin_queue")
    .select("id,pinterest_pin_id,status").eq("idempotency_key", body.idempotency_key)
    .maybeSingle();
  if (existingRepl?.pinterest_pin_id) {
    return json({ ok:true, verdict:"already_replaced", replacement_pin_id: existingRepl.pinterest_pin_id }, 200);
  }

  // Step 2: upload asset to storage (immutable path)
  const key = `${body.storage_dir}/${body.pin_id}-cta-v6.png`;
  const up = await sb.storage.from("pinterest-ads").upload(key, bin, {
    contentType: "image/png", upsert: false, cacheControl: "31536000",
  });
  if (up.error && !/exists/i.test(up.error.message)) {
    return json({ ok:false, error:"upload_failed", detail: up.error.message }, 500);
  }
  const { data: pub } = sb.storage.from("pinterest-ads").getPublicUrl(key);
  const publicUrl = pub.publicUrl;
  trace.replacement_asset_url = publicUrl;

  // Step 3: create replacement pin (preserve title/desc/alt/link/board)
  const createRes = await fetch(`${PIN_API}/pins`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      board_id: orig.board_id,
      title: orig.title,
      description: orig.description,
      alt_text: orig.alt_text,
      link: orig.link,
      media_source: { source_type: "image_url", url: publicUrl },
    }),
  });
  counts.posts += 1;
  const created = await createRes.json().catch(() => null);
  if (createRes.status < 200 || createRes.status >= 300 || !created?.id) {
    return json({ ok:false, error:"create_failed", http: createRes.status, detail: created }, 502);
  }
  trace.replacement = { id: created.id, board_id: created.board_id, link: created.link };

  // Step 4: verify replacement is live (read-back)
  const vb = await fetch(`${PIN_API}/pins/${created.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  counts.gets += 1;
  const vjs = await vb.json().catch(() => null);
  const liveOk = vb.status === 200 && vjs?.id === created.id
    && vjs?.board_id === orig.board_id && String(vjs?.link ?? "") === String(orig.link ?? "");
  if (!liveOk) {
    return json({
      ok:false, error:"replacement_not_verified",
      http: vb.status, replacement_id: created.id, detail: vjs,
    }, 502);
  }

  // Step 5: insert replacement row (audit trail) BEFORE delete
  const nowIso = new Date().toISOString();
  const { error: insErr } = await sb.from("pinterest_pin_queue").insert({
    product_id: body.product_id,
    product_slug: "cta-v6-overlay",
    product_name: `CTA V6 replacement for ${body.pin_id}`,
    pin_variant: "cta_v6_overlay",
    pin_title: orig.title,
    pin_description: orig.description,
    pin_image_url: publicUrl,
    destination_link: orig.link,
    board_name: "preserved",
    board_id: orig.board_id,
    pinterest_pin_id: created.id,
    status: "posted",
    posted_at: nowIso,
    live_pin_verified_at: nowIso,
    pin_verified: true,
    idempotency_key: body.idempotency_key,
    repair_strategy: "cta_v6_overlay_v1",
    repaired_at: nowIso,
    image_hash: hex,
    meta: {
      cta_v6_overlay: true,
      layout: body.layout,
      cta_label: body.cta_label,
      original_pin_id: body.pin_id,
      original_link: orig.link,
      replacement_asset_url: publicUrl,
      overlay_version: "v1",
    },
  });
  counts.db_writes += 1;
  if (insErr) trace.insert_warning = insErr.message;

  // Step 6: delete original ONLY after replacement is verified live
  const del = await fetch(`${PIN_API}/pins/${body.pin_id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  counts.deletes += 1;
  const delOk = del.status === 204 || del.status === 200;
  const post = await fetch(`${PIN_API}/pins/${body.pin_id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  counts.gets += 1;
  const postLive = post.status === 200;

  if (delOk && !postLive) {
    await sb.from("pinterest_pin_queue")
      .update({
        status: "rejected",
        rejection_reason: "superseded_by_cta_v6_overlay",
        repair_strategy: "cta_v6_overlay_v1_predecessor_retired",
        repaired_at: nowIso,
        meta: {
          cta_v6_overlay_predecessor: true,
          retired_at: nowIso,
          replaced_by_pin_id: created.id,
          replaced_by_asset_url: publicUrl,
        },
      })
      .eq("pinterest_pin_id", body.pin_id);
    counts.db_writes += 1;
  }

  return json({
    ok: true,
    verdict: delOk && !postLive ? "cta_v6_overlay_replacement_complete" : "cta_v6_overlay_replacement_partial",
    original_pin_id: body.pin_id,
    replacement_pin_id: created.id,
    replacement_asset_url: publicUrl,
    replacement_asset_sha256: hex,
    replacement_live_verified: true,
    original_delete_http: del.status,
    original_post_delete_live: postLive,
    counts,
    trace,
  }, 200);
});