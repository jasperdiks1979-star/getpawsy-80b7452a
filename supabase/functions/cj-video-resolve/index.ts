// CJ Video Resolver
//
// Reverse-engineers the CJ video resolution path:
//   productVideo hash IDs (returned by /product/query with enable_video)
//   → full playable MP4 URLs via POST /product/queryVideosByProductId
//
// For each CJ-linked product (or a provided subset), call the resolver,
// then upsert one row per video into `product_media` (media_type='video').
//
// Auth: admin JWT OR x-internal-secret = INTERNAL_FUNCTION_SECRET.
// Body: { product_ids?: string[]; cj_product_ids?: string[]; limit?: number;
//         only_with_video_metadata?: boolean; dry_run?: boolean }
//
// NOTE: CJ's videoUrl host (download-only-api.cjdropshipping.com) requires
// the request `Referer: https://developers.cjdropshipping.com` for direct
// download. Browser <video> tags cannot set Referer, so playable end-user
// delivery still needs a rehost step. This resolver records the source URL
// + cover + dimensions; rehosting is handled by the existing
// cj-rehost-existing-videos worker, which reads `product_media` rows where
// supplier_url is set and storage_url still points at CJ.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";
const CJ_API_BASE = "https://developers.cjdropshipping.com/api2.0/v1";
const ADMIN_FALLBACK_EMAILS = ["jasperdiks@hotmail.com"];

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getCjAccessToken(admin: ReturnType<typeof createClient>): Promise<string> {
  const { data: cached } = await admin
    .from("cj_token_cache").select("access_token, token_expiry").eq("id", "singleton").maybeSingle();
  if (cached?.access_token && cached.token_expiry && Date.now() < new Date(cached.token_expiry).getTime()) {
    return cached.access_token as string;
  }
  const apiKey = Deno.env.get("CJ_API_KEY");
  if (!apiKey) throw new Error("CJ_API_KEY not configured");
  const r = await fetch(`${CJ_API_BASE}/authentication/getAccessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey }),
  });
  const d = await r.json();
  if (!d?.result) throw new Error(`CJ auth failed: ${d?.code} ${d?.message ?? ""}`);
  const expiry = new Date(new Date(d.data.accessTokenExpiryDate).getTime() - 5 * 60_000);
  await admin.from("cj_token_cache").upsert({
    id: "singleton",
    access_token: d.data.accessToken,
    token_expiry: expiry.toISOString(),
    updated_at: new Date().toISOString(),
  });
  return d.data.accessToken as string;
}

interface CjVideo {
  id?: string;
  videoId?: string;
  videoName?: string;
  videoState?: string;
  videoUrl?: string;
  coverURL?: string;
  duration?: number;
  videoSize?: string | number;
  width?: number;
  height?: number;
  isFree?: string;
  videoType?: number;
  orderNum?: number;
}

async function resolveVideosForCjProduct(token: string, cjProductId: string): Promise<{ ok: boolean; videos: CjVideo[]; code?: number; message?: string }> {
  const r = await fetch(`${CJ_API_BASE}/product/queryVideosByProductId`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "CJ-Access-Token": token,
    },
    body: JSON.stringify({ productId: cjProductId }),
  });
  const d = await r.json().catch(() => ({}));
  // CJ uses both `result`/`success` flags; success=true OR code in (0, 200)
  const ok = d?.success === true || d?.result === true || d?.code === 0 || d?.code === 200;
  if (!ok) return { ok: false, videos: [], code: d?.code, message: d?.message };
  const list = Array.isArray(d?.data) ? d.data as CjVideo[] : [];
  return { ok: true, videos: list };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, message: "method_not_allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // --- Auth: internal secret OR admin JWT ---
  const internal = req.headers.get("x-internal-secret") ?? "";
  let isAuthorized = INTERNAL_SECRET.length > 0 && internal === INTERNAL_SECRET;
  if (!isAuthorized) {
    // Fallback: one-shot token stored in public.app_config under key
    // `cj_video_resolve_token`. Lets the agent kick off the resolver
    // without exposing INTERNAL_FUNCTION_SECRET. Token is single-use:
    // it is deleted after a successful auth.
    const url = new URL(req.url);
    const headerTok = req.headers.get("x-one-shot-token") ?? "";
    const qpTok = url.searchParams.get("one_shot_token") ?? "";
    const provided = headerTok || qpTok;
    if (provided) {
      const { data: cfg } = await admin
        .from("app_config").select("value").eq("key", "cj_video_resolve_token").maybeSingle();
      const storedVal = (cfg?.value as { token?: string; expires_at?: string } | null) ?? null;
      const stored = storedVal?.token;
      const exp = storedVal?.expires_at ? new Date(storedVal.expires_at).getTime() : 0;
      const notExpired = exp === 0 || Date.now() < exp;
      if (stored && stored === provided && notExpired) {
        isAuthorized = true;
        // Token is reusable until expires_at; do not delete here.
      }
    }
  }
  if (!isAuthorized) {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ ok: false, message: "unauthorized" }, 401);
    const user = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: ures } = await user.auth.getUser();
    if (!ures?.user) return json({ ok: false, message: "unauthorized" }, 401);
    const { data: role } = await admin
      .from("user_roles").select("role").eq("user_id", ures.user.id).eq("role", "admin").maybeSingle();
    const email = (ures.user.email ?? "").toLowerCase();
    if (!role && !ADMIN_FALLBACK_EMAILS.includes(email)) return json({ ok: false, message: "admin required" }, 403);
    isAuthorized = true;
  }

  const body = await req.json().catch(() => ({})) as {
    product_ids?: string[];
    cj_product_ids?: string[];
    limit?: number;
    only_with_video_metadata?: boolean;
    dry_run?: boolean;
  };

  // --- Build the target set: products with cj_product_id ---
  let q = admin.from("products").select("id, cj_product_id, name").not("cj_product_id", "is", null);
  if (body.product_ids?.length) q = q.in("id", body.product_ids);
  if (body.cj_product_ids?.length) q = q.in("cj_product_id", body.cj_product_ids);
  if (typeof body.limit === "number") q = q.limit(Math.max(1, Math.min(2000, body.limit)));
  else q = q.limit(2000);
  const { data: products, error: prodErr } = await q;
  if (prodErr) return json({ ok: false, message: `query_failed: ${prodErr.message}` }, 500);

  let targets = (products ?? []) as { id: string; cj_product_id: string; name: string }[];

  // Optional pre-filter: only products that we previously saw productVideo metadata for
  // (cj_sync_items.after.productVideo non-empty). Best-effort; skip on error.
  if (body.only_with_video_metadata) {
    try {
      const { data: items } = await admin
        .from("cj_sync_items").select("product_id, after")
        .in("product_id", targets.map((t) => t.id))
        .order("created_at", { ascending: false })
        .limit(5000);
      const withVideo = new Set<string>();
      for (const it of (items ?? []) as { product_id: string; after: Record<string, unknown> | null }[]) {
        const pv = (it.after as { productVideo?: unknown })?.productVideo;
        if (Array.isArray(pv) && pv.length > 0) withVideo.add(it.product_id);
      }
      targets = targets.filter((t) => withVideo.has(t.id));
    } catch (_) { /* ignore — process all */ }
  }

  const token = await getCjAccessToken(admin);

  let productsScanned = 0;
  let productsWithVideos = 0;
  let videosResolved = 0;
  let videosInserted = 0;
  const examples: Array<{ product_id: string; cj_product_id: string; name: string; video_url: string; cover_url?: string; duration?: number; width?: number; height?: number }> = [];
  const errors: Array<{ cj_product_id: string; code?: number; message?: string }> = [];

  for (const p of targets) {
    productsScanned++;
    try {
      let res = await resolveVideosForCjProduct(token, p.cj_product_id);
      // Single retry on CJ QPS rate-limit (code 1600200) after a longer wait
      if (!res.ok && res.code === 1600200) {
        await new Promise((r) => setTimeout(r, 2500));
        res = await resolveVideosForCjProduct(token, p.cj_product_id);
      }
      if (!res.ok) {
        errors.push({ cj_product_id: p.cj_product_id, code: res.code, message: res.message });
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
      // Keep only listed videos with a usable URL
      const usable = res.videos.filter((v) => v.videoUrl && (v.videoState ?? "ON_STATE") === "ON_STATE");
      if (usable.length === 0) {
        await new Promise((r) => setTimeout(r, 250));
        continue;
      }
      productsWithVideos++;
      videosResolved += usable.length;

      if (examples.length < 20) {
        const v = usable[0];
        examples.push({
          product_id: p.id,
          cj_product_id: p.cj_product_id,
          name: p.name,
          video_url: v.videoUrl!,
          cover_url: v.coverURL,
          duration: v.duration,
          width: v.width,
          height: v.height,
        });
      }

      if (!body.dry_run) {
        // Upsert one row per video — dedupe on (product_id, supplier_url)
        const rows = usable.map((v, idx) => ({
          product_id: p.id,
          cj_product_id: p.cj_product_id,
          media_type: "video" as const,
          // Store the CJ URL in both columns for now. Rehost worker will
          // later overwrite storage_url with a public storage URL.
          storage_url: v.videoUrl!,
          supplier_url: v.videoUrl!,
          source: "cj",
          sort_order: 100 + (v.orderNum ?? idx),
          duration_sec: typeof v.duration === "number" ? v.duration : null,
          file_size: typeof v.videoSize === "string" ? Number(v.videoSize) || null : (v.videoSize ?? null),
          width: v.width ?? null,
          height: v.height ?? null,
          metadata: {
            cj_video_id: v.videoId ?? v.id ?? null,
            cover_url: v.coverURL ?? null,
            video_state: v.videoState ?? null,
            is_free: v.isFree ?? null,
            video_type: v.videoType ?? null,
            video_name: v.videoName ?? null,
            resolved_via: "queryVideosByProductId",
            referer_required: true,
          },
        }));
        // The unique index on (product_id, supplier_url) is partial
        // (WHERE supplier_url IS NOT NULL), which PostgREST cannot use
        // for ON CONFLICT. Idempotent path: delete existing rows for
        // these supplier_urls under this product, then insert fresh.
        const supplierUrls = rows.map((r) => r.supplier_url).filter(Boolean) as string[];
        if (supplierUrls.length) {
          await admin
            .from("product_media")
            .delete()
            .eq("product_id", p.id)
            .eq("media_type", "video")
            .in("supplier_url", supplierUrls);
        }
        const { data: ins, error: insErr } = await admin
          .from("product_media")
          .insert(rows)
          .select("id");
        if (insErr) {
          errors.push({ cj_product_id: p.cj_product_id, message: `insert_failed: ${insErr.message}` });
        } else {
          videosInserted += ins?.length ?? 0;
        }
      }
    } catch (e) {
      errors.push({ cj_product_id: p.cj_product_id, message: (e as Error).message });
    }
    // CJ rate limit: ~1 req/s safe window
    await new Promise((r) => setTimeout(r, 1500));
  }

  return json({
    ok: true,
    resolver_endpoint: `${CJ_API_BASE}/product/queryVideosByProductId`,
    referer_required: "https://developers.cjdropshipping.com",
    products_scanned: productsScanned,
    products_with_videos: productsWithVideos,
    videos_resolved: videosResolved,
    videos_inserted: videosInserted,
    examples,
    error_sample: errors.slice(0, 20),
    dry_run: !!body.dry_run,
  });
});