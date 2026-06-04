// CJ Video diagnostic endpoint.
//
// GET / POST:
//   - { product_id }            → per-product report (live CJ candidates + DB rows)
//   - { cj_product_id }         → resolve to product and per-product report
//   - {}                        → catalog aggregate
//
// Auth: admin only.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ADMIN_FALLBACK_EMAILS = ["jasperdiks@hotmail.com"];

const CJ_VIDEO_HOSTS = [
  "cf.cjdropshipping.com", "oss-cf.cjdropshipping.com", "cjvideopublic",
  "cjvideo", "video.cjdropshipping.com", "oss-eu.cjdropshipping.com",
  "oss-us.cjdropshipping.com",
];
const VIDEO_FIELDS_TOP = ["productVideo","productVideoUrl","video","videoUrl","videoUrls","videoGallery","detailVideos","media","productMedia"];
const VIDEO_FIELDS_VARIANT = ["variantVideo","variantVideoUrl","variantVideoUrls","video"];

type Cand = { url: string; source: string; status: "accepted" | "rejected_unknown_shape" };

function classify(u: string): Cand["status"] {
  if (!u || !/^https?:\/\//.test(u)) return "rejected_unknown_shape";
  if (/\.(mp4|mov|webm|m4v)(\?|$)/i.test(u)) return "accepted";
  try {
    const host = new URL(u).hostname.toLowerCase();
    if (CJ_VIDEO_HOSTS.some((h) => host.includes(h))) return "accepted";
  } catch { /* ignore */ }
  return "rejected_unknown_shape";
}
function pushUrl(out: Cand[], seen: Set<string>, raw: unknown, source: string) {
  if (raw == null) return;
  const list = Array.isArray(raw) ? raw : [raw];
  for (const item of list) {
    let u: string | null = null;
    if (typeof item === "string") u = item;
    else if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      if (typeof obj.url === "string") u = obj.url;
      else if (typeof obj.videoUrl === "string") u = obj.videoUrl;
      else if (typeof obj.src === "string") u = obj.src;
    }
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push({ url: u, source, status: classify(u) });
  }
}
function extractCandidates(p: Record<string, unknown>): Cand[] {
  const out: Cand[] = []; const seen = new Set<string>();
  for (const f of VIDEO_FIELDS_TOP) pushUrl(out, seen, p[f], f);
  const variants = (p as { variants?: unknown[] }).variants;
  if (Array.isArray(variants)) {
    for (const v of variants) {
      if (!v || typeof v !== "object") continue;
      const vr = v as Record<string, unknown>;
      for (const f of VIDEO_FIELDS_VARIANT) pushUrl(out, seen, vr[f], `variant.${f}`);
    }
  }
  return out;
}

async function fetchCjDetails(cjProductId: string): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/cj-dropshipping`, {
      method: "POST",
      headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "getProductDetails", productIds: [cjProductId] }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const arr = Array.isArray(j?.results) ? j.results : Array.isArray(j) ? j : [];
    const hit = arr.find((x: { success?: boolean; pid?: string; data?: unknown }) =>
      x?.success && (x?.pid === cjProductId || x?.data));
    if (!hit) return null;
    return (hit.data as Record<string, unknown>) ?? (hit as Record<string, unknown>);
  } catch { return null; }
}
function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ ok: false, message: "unauthorized" }, 401);
  const user = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: ures } = await user.auth.getUser();
  if (!ures?.user) return json({ ok: false, message: "unauthorized" }, 401);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: role } = await admin.from("user_roles").select("role").eq("user_id", ures.user.id).eq("role", "admin").maybeSingle();
  const email = (ures.user.email ?? "").toLowerCase();
  if (!role && !ADMIN_FALLBACK_EMAILS.includes(email)) return json({ ok: false, message: "admin required" }, 403);

  let body: { product_id?: string; cj_product_id?: string; live?: boolean } = {};
  if (req.method === "POST") body = await req.json().catch(() => ({}));
  else {
    const u = new URL(req.url);
    body.product_id = u.searchParams.get("product_id") ?? undefined;
    body.cj_product_id = u.searchParams.get("cj_product_id") ?? undefined;
    body.live = u.searchParams.get("live") === "1";
  }

  // ===== Per-product mode =====
  if (body.product_id || body.cj_product_id) {
    let q = admin.from("products").select("id, name, slug, cj_product_id, cj_media_synced_at, images, variants, variant_stock, stock").limit(1);
    if (body.product_id) q = q.eq("id", body.product_id);
    else q = q.eq("cj_product_id", body.cj_product_id!);
    const { data: rows } = await q;
    const p = rows?.[0];
    if (!p) return json({ ok: false, message: "product_not_found" }, 404);

    const { data: media } = await admin
      .from("product_media").select("id, media_type, storage_url, supplier_url, source, sort_order, variant_key, created_at")
      .eq("product_id", p.id).order("sort_order", { ascending: true });

    const { data: items } = await admin
      .from("cj_sync_items").select("action, error, after, created_at")
      .eq("product_id", p.id).order("created_at", { ascending: false }).limit(50);

    let liveCandidates: Cand[] | null = null;
    let liveRaw: Record<string, unknown> | null = null;
    if (body.live && p.cj_product_id) {
      const detail = await fetchCjDetails(p.cj_product_id);
      if (detail) {
        liveCandidates = extractCandidates(detail);
        liveRaw = {
          has_variants: Array.isArray((detail as { variants?: unknown[] }).variants) && ((detail as { variants?: unknown[] }).variants!.length),
          variant_count: Array.isArray((detail as { variants?: unknown[] }).variants) ? (detail as { variants?: unknown[] }).variants!.length : 0,
          image_count: Array.isArray((detail as { productImageSet?: unknown[] }).productImageSet) ? (detail as { productImageSet?: unknown[] }).productImageSet!.length : 0,
        };
      }
    }

    return json({
      ok: true,
      product: p,
      product_media: media ?? [],
      video_count: (media ?? []).filter((m: { media_type: string }) => m.media_type === "video").length,
      image_media_count: (media ?? []).filter((m: { media_type: string }) => m.media_type === "image").length,
      variant_count: Array.isArray(p.variants) ? p.variants.length : 0,
      recent_sync_items: items ?? [],
      live_candidates: liveCandidates,
      live_summary: liveRaw,
    });
  }

  // ===== Aggregate mode =====
  const { count: cjCount } = await admin.from("products").select("id", { count: "exact", head: true }).not("cj_product_id", "is", null);
  const { count: syncedCount } = await admin.from("products").select("id", { count: "exact", head: true }).not("cj_media_synced_at", "is", null);
  const { count: dbVideos } = await admin.from("product_media").select("id", { count: "exact", head: true }).eq("media_type", "video");
  const { count: dbImages } = await admin.from("product_media").select("id", { count: "exact", head: true }).eq("media_type", "image");

  const { data: zeroVar } = await admin.from("products").select("id, name, slug, cj_product_id, stock").not("cj_product_id", "is", null).limit(2000);
  const zeroVariants = (zeroVar ?? []).filter((r: { variants?: unknown[] }) => !Array.isArray(r.variants) || r.variants.length === 0);

  // Products with cj_product_id but NO product_media video rows
  const { data: withVideos } = await admin
    .from("product_media").select("product_id").eq("media_type", "video").limit(5000);
  const productIdsWithVideo = new Set<string>((withVideos ?? []).map((r: { product_id: string }) => r.product_id));

  const { data: allCj } = await admin.from("products").select("id").not("cj_product_id", "is", null).limit(5000);
  const missingVideos = (allCj ?? []).filter((r: { id: string }) => !productIdsWithVideo.has(r.id)).length;

  // Recent sync items grouped by action
  const { data: recentItems } = await admin
    .from("cj_sync_items").select("action").order("created_at", { ascending: false }).limit(2000);
  const actionCounts: Record<string, number> = {};
  for (const it of (recentItems ?? [])) {
    const a = (it.action as string) ?? "unknown";
    actionCounts[a] = (actionCounts[a] ?? 0) + 1;
  }

  return json({
    ok: true,
    aggregate: {
      cj_products: cjCount ?? 0,
      cj_media_synced: syncedCount ?? 0,
      db_videos: dbVideos ?? 0,
      db_images: dbImages ?? 0,
      products_with_video: productIdsWithVideo.size,
      products_missing_video: missingVideos,
      products_with_zero_variants: zeroVariants.length,
      recent_actions: actionCounts,
    },
    zero_variant_sample: zeroVariants.slice(0, 25),
  });
});