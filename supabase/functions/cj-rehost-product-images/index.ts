/**
 * cj-rehost-product-images
 *
 * Downloads every product image currently hosted on cjdropshipping.com /
 * cf.cjdropshipping.com / oss-cf.cjdropshipping.com and rehosts it to the
 * public `product-images` bucket, then rewrites products.image_url and
 * products.images[] in place.
 *
 * Body: { limit?: number (default 25), dryRun?: boolean }
 * Returns: { ok, scanned, products_updated, images_rehosted, failures, remaining }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "product-images";

const CJ_HOSTS = ["cjdropshipping.com", "cf.cjdropshipping.com", "oss-cf.cjdropshipping.com"];

function isCjUrl(u: unknown): u is string {
  if (typeof u !== "string" || !u) return false;
  try {
    const h = new URL(u).host.toLowerCase();
    return CJ_HOSTS.some((c) => h.endsWith(c));
  } catch {
    return false;
  }
}

function publicUrl(path: string) {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

function extFromUrl(u: string, contentType?: string): string {
  try {
    const p = new URL(u).pathname;
    const m = p.match(/\.([a-zA-Z0-9]{2,5})$/);
    if (m) return m[1].toLowerCase().replace("jpeg", "jpg");
  } catch { /* ignore */ }
  if (contentType?.includes("png")) return "png";
  if (contentType?.includes("webp")) return "webp";
  return "jpg";
}

async function sha1(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function rehostOne(supabase: ReturnType<typeof createClient>, productId: string, srcUrl: string, cache: Map<string, string>): Promise<string | null> {
  if (cache.has(srcUrl)) return cache.get(srcUrl)!;
  try {
    const r = await fetch(srcUrl, { headers: { "User-Agent": "GetPawsyImageMigrator/1.0" } });
    if (!r.ok) {
      console.warn(`[rehost] fetch ${r.status} ${srcUrl}`);
      return null;
    }
    const ct = r.headers.get("content-type") || undefined;
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.byteLength < 1024) return null; // junk
    const hash = (await sha1(srcUrl)).slice(0, 16);
    const ext = extFromUrl(srcUrl, ct);
    const path = `rehosted/${productId}/${hash}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: ct || "image/jpeg",
      upsert: true,
      cacheControl: "31536000, immutable",
    });
    if (error) {
      console.error(`[rehost] upload error ${path}`, error.message);
      return null;
    }
    const url = publicUrl(path);
    cache.set(srcUrl, url);
    return url;
  } catch (e) {
    console.error(`[rehost] exception ${srcUrl}`, (e as Error).message);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(Math.max(Number(body.limit) || 25, 1), 100);
  const dryRun = body.dryRun === true;
  const productIds: string[] | undefined = Array.isArray(body.productIds) ? body.productIds.slice(0, 100) : undefined;

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Pull next batch of products with any CJ-hosted image
  let query = supabase
    .from("products")
    .select("id, slug, image_url, images")
    .eq("is_active", true);
  if (productIds && productIds.length) {
    query = query.in("id", productIds);
  } else {
    query = query.ilike("image_url", "%cjdropshipping%").order("id").limit(limit);
  }
  const { data: products, error } = await query;

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let imagesRehosted = 0;
  let productsUpdated = 0;
  let failures = 0;
  const cache = new Map<string, string>();

  for (const p of products ?? []) {
    const oldImages: string[] = Array.isArray(p.images) ? p.images.filter(Boolean) : [];
    const allUrls = Array.from(new Set([p.image_url, ...oldImages].filter(Boolean) as string[]));
    const newMap = new Map<string, string>();

    // Concurrency 4
    const queue = [...allUrls];
    const workers = Array.from({ length: 4 }, async () => {
      while (queue.length) {
        const u = queue.shift()!;
        if (!isCjUrl(u)) { newMap.set(u, u); continue; }
        const rehosted = await rehostOne(supabase, p.id, u, cache);
        if (rehosted) { newMap.set(u, rehosted); imagesRehosted++; }
        else { failures++; }
      }
    });
    await Promise.all(workers);

    const newImages = allUrls.map((u) => newMap.get(u)).filter((v): v is string => !!v && !isCjUrl(v));
    if (newImages.length === 0) continue;

    const newPrimary = !isCjUrl(p.image_url) && p.image_url ? p.image_url : newImages[0];

    if (!dryRun) {
      const { error: upErr } = await supabase
        .from("products")
        .update({ image_url: newPrimary, images: newImages })
        .eq("id", p.id);
      if (upErr) { failures++; console.error(`[rehost] update ${p.id}`, upErr.message); continue; }
    }
    productsUpdated++;
  }

  // Remaining count
  const { count: remaining } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true)
    .ilike("image_url", "%cjdropshipping%");

  return new Response(JSON.stringify({
    ok: true,
    scanned: products?.length ?? 0,
    products_updated: productsUpdated,
    images_rehosted: imagesRehosted,
    failures,
    remaining: remaining ?? null,
    dryRun,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});