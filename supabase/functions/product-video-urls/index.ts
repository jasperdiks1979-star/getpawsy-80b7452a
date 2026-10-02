// Public storefront endpoint: returns fresh short-lived signed URLs for one
// product's VIDEO media rows. Buckets stay private. The caller supplies only a
// product id; object paths are read server-side from product_media, so this
// cannot be used to sign arbitrary files. No rows are modified.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOWED_BUCKETS = new Set(["product-media", "cinematic-v3"]);
const TTL_SECONDS = 60 * 60 * 6; // 6h: covers a shopping session, limits reuse
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/** Extract { bucket, path } from a storage URL (signed or public form). */
export function parseStorageRef(url: string | null): { bucket: string; path: string } | null {
  if (!url) return null;
  const m = url.match(/\/storage\/v1\/object\/(?:sign|public)\/([^/?]+)\/([^?]+)/);
  if (!m) return null;
  return { bucket: m[1], path: decodeURIComponent(m[2]) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, message: "method not allowed" }, 405);
  try {
    const body = await req.json().catch(() => null);
    const productId = typeof body?.productId === "string" ? body.productId : "";
    if (!UUID.test(productId)) return json({ ok: false, message: "invalid productId" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: rows, error } = await admin
      .from("product_media")
      .select("id, storage_url")
      .eq("product_id", productId)
      .eq("media_type", "video")
      .limit(20);
    if (error) return json({ ok: false, message: "lookup failed" }, 500);

    const urls: Record<string, string | null> = {};
    for (const r of rows ?? []) {
      const ref = parseStorageRef(r.storage_url);
      if (!ref || !ALLOWED_BUCKETS.has(ref.bucket)) { urls[r.id] = null; continue; }
      const { data } = await admin.storage.from(ref.bucket).createSignedUrl(ref.path, TTL_SECONDS);
      urls[r.id] = data?.signedUrl ?? null; // missing object -> null (client hides it)
    }
    return json({ ok: true, urls });
  } catch {
    return json({ ok: false, message: "internal error" }, 500);
  }
});
