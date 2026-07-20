// Inventory replacement scan — populates product_replacement_candidates
// for sold-out products with same-category, similar-price live alternatives.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const traceId = crypto.randomUUID();
  try {
    const { data: soldOut } = await sb
      .from("products")
      .select("id, category, price")
      .eq("effective_stock", 0)
      .eq("is_active", true)
      .limit(500);

    let inserted = 0;
    for (const p of soldOut ?? []) {
      if (!p.category || !p.price) continue;
      const min = Number(p.price) * 0.8;
      const max = Number(p.price) * 1.2;

      const { data: candidates } = await sb
        .from("products")
        .select("id, inventory_priority, price")
        .eq("category", p.category)
        .eq("is_active", true)
        .gt("effective_stock", 0)
        .gte("price", min)
        .lte("price", max)
        .neq("id", p.id)
        .order("inventory_priority", { ascending: false })
        .limit(3);

      for (const c of candidates ?? []) {
        const score = (c.inventory_priority ?? 0) +
          Math.max(0, 30 - Math.abs(Number(c.price) - Number(p.price)));
        await sb.from("product_replacement_candidates").upsert({
          product_id: p.id,
          candidate_product_id: c.id,
          reason: "sold_out_fallback",
          match_score: Math.round(score),
        }, { onConflict: "product_id,candidate_product_id" });
        inserted++;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, traceId, scanned: soldOut?.length ?? 0, inserted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, traceId, message: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});