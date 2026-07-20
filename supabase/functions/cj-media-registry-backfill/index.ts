/**
 * cj-media-registry-backfill (one-shot)
 *
 * Populates cj_media_asset_registry from existing product_media rows and
 * products.image_url / images[] so the dashboard reflects historical state.
 * Safe to re-run — UNIQUE(product_id, checksum) prevents duplicates.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function sha1(input: string) {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const body = await req.json().catch(() => ({}));
  const limit = Math.min(Math.max(body.limit ?? 500, 50), 2000);
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: products, error } = await supabase
    .from("products")
    .select("id, image_url, images")
    .eq("is_active", true)
    .limit(limit);
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rows: Array<Record<string, unknown>> = [];
  for (const p of products ?? []) {
    const urls = new Set<string>();
    if (p.image_url) urls.add(p.image_url);
    if (Array.isArray(p.images)) for (const u of p.images) if (typeof u === "string") urls.add(u);
    for (const url of urls) {
      const isLocal = url.includes("/storage/v1/object/public/");
      rows.push({
        product_id: p.id,
        kind: "image",
        role: url === p.image_url ? "main" : "gallery",
        source_url: url,
        storage_path: isLocal ? new URL(url).pathname.split("/public/")[1] ?? url : url,
        public_url: url,
        checksum: (await sha1(url)).slice(0, 32),
      });
    }
  }

  let inserted = 0;
  let errors = 0;
  let lastError: string | null = null;
  // upsert in chunks
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { data, error: upErr } = await supabase
      .from("cj_media_asset_registry")
      .insert(chunk)
      .select("id");
    if (upErr) {
      errors++;
      lastError = upErr.message;
    } else {
      inserted += data?.length ?? 0;
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    products: products?.length ?? 0,
    candidate_rows: rows.length,
    inserted,
    chunk_errors: errors,
    last_error: lastError,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});