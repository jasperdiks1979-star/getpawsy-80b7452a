// pinterest-live-pin-repair-render-overlays
// One-shot: bake corrected overlay_text into Cloudinary-fetch URLs for every
// regenerated repair draft that currently has no pin_image_url. Cloudinary
// renders on demand, so the moment the URL is saved the image is "live".
//
// Scope: drafts referenced by pinterest_live_pin_repair_queue rows where
//   recommended_action = 'replace'
//   severity            = 'critical'
//   status              = 'done'
//   details.replacement_draft_id IS NOT NULL
//   details.execution            IS NULL
// and the draft row in pinterest_pin_queue has NULL/empty pin_image_url.
//
// Admin-only. Returns { ok, processed, updated, skipped, failures, sample }.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const CLOUDINARY_CLOUD = "dlkqycfzn";

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeOverlay(raw: string): string {
  // Cloudinary text-overlay escaping: strip control chars, encode reserved.
  return encodeURIComponent(
    String(raw)
      .replace(/[\u0000-\u001F]/g, " ")
      .replace(/\//g, " ")
      .replace(/,/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60),
  );
}

function buildPinImage(productImageUrl: string, top: string, bottom: string): string {
  const W = 1080, H = 1920;
  const base = [
    `w_${W}`, `h_${H}`, "c_fill", "g_center",
    "b_rgb:FAF6F0", "q_auto", "f_jpg",
  ].join(",");
  const topOverlay = [
    `l_text:Arial_72_bold:${escapeOverlay(top)}`,
    "co_rgb:FFFFFF", "b_rgb:FF6A1A", "bo_8px_solid_rgb:FFFFFF",
    "r_24", "w_900", "c_fit", "g_north", "y_120",
  ].join(",");
  const bottomOverlay = [
    `l_text:Arial_56_bold:${escapeOverlay(bottom)}`,
    "co_rgb:1A1410", "b_rgb:FFFFFF",
    "r_20", "w_900", "c_fit", "g_south", "y_140",
  ].join(",");
  // Cloudinary fetch wants the upstream URL un-encoded (it accepts raw URL).
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/image/fetch/${base}/${topOverlay}/${bottomOverlay}/${productImageUrl}`;
}

function splitOverlay(overlay: string, fallbackTop: string): { top: string; bottom: string } {
  const text = String(overlay || "").trim();
  if (!text) return { top: fallbackTop, bottom: "Shop now" };
  const parts = text.split("•").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return { top: parts[0], bottom: parts.slice(1).join(" — ") };
  return { top: fallbackTop || text, bottom: text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, message: "POST required" }, 405);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── Admin auth ──
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ ok: false, message: "unauthorized" }, 401);
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: claims } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
  const uid = claims?.claims?.sub;
  if (!uid) return json({ ok: false, message: "unauthorized" }, 401);
  const { data: roleRow } = await sb.from("user_roles")
    .select("role").eq("user_id", uid).eq("role", "admin").maybeSingle();
  if (!roleRow) return json({ ok: false, message: "admin only" }, 403);

  // ── Find eligible repair queue rows ──
  const { data: queueRows, error: qErr } = await sb
    .from("pinterest_live_pin_repair_queue")
    .select("id, details")
    .eq("recommended_action", "replace")
    .eq("severity", "critical")
    .eq("status", "done")
    .limit(500);
  if (qErr) return json({ ok: false, message: qErr.message }, 500);

  const draftIds = (queueRows ?? [])
    .filter((r: any) => r.details?.replacement_draft_id && !r.details?.execution)
    .map((r: any) => r.details.replacement_draft_id as string);
  if (draftIds.length === 0) return json({ ok: true, processed: 0, updated: 0, message: "no eligible drafts" });

  // ── Load drafts (with product join) ──
  const { data: drafts, error: dErr } = await sb
    .from("pinterest_pin_queue")
    .select("id, product_id, product_slug, pin_title, overlay_text, pin_image_url")
    .in("id", draftIds);
  if (dErr) return json({ ok: false, message: dErr.message }, 500);

  const needsImage = (drafts ?? []).filter((d: any) => !d.pin_image_url);
  const productIds = [...new Set(needsImage.map((d: any) => d.product_id).filter(Boolean))];
  const { data: prods, error: pErr } = await sb
    .from("products")
    .select("id, image_url, images")
    .in("id", productIds);
  if (pErr) return json({ ok: false, message: pErr.message }, 500);
  const prodMap = new Map<string, any>();
  for (const p of prods ?? []) prodMap.set(p.id, p);

  let updated = 0;
  const failures: any[] = [];
  const sample: any[] = [];

  for (const d of needsImage) {
    const p = prodMap.get(d.product_id);
    const productImage: string | null =
      p?.image_url ||
      (Array.isArray(p?.images) && p.images.length > 0 ? p.images[0] : null);
    if (!productImage) {
      failures.push({ draft_id: d.id, reason: "no_product_image" });
      continue;
    }
    const { top, bottom } = splitOverlay(d.overlay_text, d.pin_title || "");
    const url = buildPinImage(productImage, top, bottom);
    const { error: uErr } = await sb
      .from("pinterest_pin_queue")
      .update({ pin_image_url: url })
      .eq("id", d.id);
    if (uErr) {
      failures.push({ draft_id: d.id, reason: uErr.message });
      continue;
    }
    updated++;
    if (sample.length < 3) sample.push({ id: d.id, top, bottom, url });
  }

  return json({
    ok: true,
    processed: needsImage.length,
    updated,
    skipped: (drafts?.length ?? 0) - needsImage.length,
    failures,
    sample,
  });
});