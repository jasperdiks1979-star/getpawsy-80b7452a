// Read-only shadow diff: for N sample products fetches the processed product
// from Merchant API v1 and diffs against DB source-of-truth. No writes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";
import { MerchantApiClient, readEnabled, mlog } from "../_shared/merchant-api.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  if (!readEnabled()) return json({ ok: false, error: "MERCHANT_API_READ_ENABLED_false" }, 403);

  const authz = req.headers.get("Authorization");
  if (!authz) return json({ ok: false, error: "missing_auth" }, 401);
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: claims, error: cerr } = await supabase.auth.getClaims(authz.replace("Bearer ", ""));
  if (cerr || !claims?.claims?.sub) return json({ ok: false, error: "invalid_auth" }, 401);

  const { data: products } = await supabase
    .from("products_public")
    .select("id, slug, name, price, image_url, is_active")
    .eq("is_active", true)
    .limit(10);
  if (!products || products.length === 0) return json({ ok: false, error: "no_products" }, 404);

  const client = new MerchantApiClient({ supabase });
  const diffs: Array<Record<string, unknown>> = [];
  for (const p of products) {
    const offerId = `getpawsy_${p.id}`;
    try {
      const remote = await client.getProduct({ contentLanguage: "en", feedLabel: "US", offerId }) as Record<string, unknown>;
      const attrs = (remote.attributes ?? {}) as Record<string, unknown>;
      const price = attrs.price as { amountMicros?: string } | undefined;
      const priceUsd = price?.amountMicros ? Number(price.amountMicros) / 1_000_000 : null;
      diffs.push({
        offerId,
        db: { name: p.name, price: p.price, image: p.image_url },
        remote: { title: attrs.title, priceUsd, image: attrs.imageLink, availability: attrs.availability, link: attrs.link },
        titleMatch: attrs.title === p.name,
        priceMatch: priceUsd === Number(p.price),
      });
    } catch (e) {
      const err = e as Error & { status?: number };
      diffs.push({ offerId, error: err.message, status: err.status });
    }
  }

  mlog("shadow_ok", { count: diffs.length });
  return json({ ok: true, generated_at: new Date().toISOString(), sample_size: diffs.length, diffs });
});