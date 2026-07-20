// Global inventory audit — single snapshot of warehouse coverage, sold-out
// state, mis-marked products, and estimated revenue opportunity. Admin-gated.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
  );

  const traceId = crypto.randomUUID();
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ ok: false, traceId, message: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ ok: false, traceId, message: "Forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    async function countBy(filter: (q: any) => any): Promise<number> {
      const { count } = await filter(
        admin.from("products").select("id", { count: "exact", head: true }).eq("is_active", true),
      );
      return count ?? 0;
    }

    const us_only = await countBy((q) => q.gt("us_stock", 0));
    const eu_only = await countBy((q) => q.eq("us_available", false).gt("eu_stock", 0));
    const cn_only = await countBy((q) =>
      q.eq("us_available", false).eq("eu_available", false).gt("cn_stock", 0),
    );
    const fully_sold_out = await countBy((q) => q.eq("effective_stock", 0));
    const wrongly_marked = await countBy((q) => q.eq("stock", 0).gt("effective_stock", 0));
    const reactivatable = await countBy((q) =>
      q.eq("us_available", false).gt("effective_stock", 0),
    );

    // Estimated extra Pinterest-eligible = EU + CN fallback live products.
    const extra_pinterest = eu_only + cn_only;

    // Crude revenue projection: avg price across reactivatable × 1.5% conv × 30
    const { data: priceSample } = await admin
      .from("products")
      .select("price")
      .eq("us_available", false)
      .gt("effective_stock", 0)
      .limit(200);
    const avgPrice = (priceSample ?? []).reduce((s, r) => s + Number(r.price || 0), 0) /
      Math.max(1, priceSample?.length ?? 1);
    const estimated_revenue_30d = Math.round(reactivatable * avgPrice * 0.015 * 30);

    return new Response(
      JSON.stringify({
        ok: true,
        traceId,
        snapshot: {
          us_only,
          eu_only,
          cn_only,
          fully_sold_out,
          wrongly_marked,
          reactivatable,
          extra_pinterest,
          estimated_revenue_30d,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, traceId, message: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});