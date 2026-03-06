import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BATCH_SIZE = 20;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth + admin check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    const authSupabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await authSupabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;
    const { data: roleData } = await adminSupabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const dryRun = body.dryRun ?? true;
    const limitProducts = body.limit ?? 0;
    const offsetProducts = body.offset ?? 0;

    // Fetch active products
    let query = adminSupabase
      .from("products")
      .select("id, name, category, description, price, weight, cost_price, primary_species, product_type, google_product_category, custom_label_0")
      .eq("is_active", true)
      .order("name");

    if (limitProducts > 0) {
      query = query.range(offsetProducts, offsetProducts + limitProducts - 1);
    }

    const { data: products, error: fetchError } = await query;
    if (fetchError) throw new Error(`Fetch error: ${fetchError.message}`);
    if (!products || products.length === 0) {
      return new Response(JSON.stringify({
        totalProducts: 0, enrichedCount: 0, updatedCount: 0, errorCount: 0, dryRun, samples: [],
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Processing ${products.length} products (dryRun=${dryRun})`);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    interface EnrichedProduct {
      id: string;
      product_type: string;
      google_product_category: string;
      custom_label_0: string;
      custom_label_1: string;
      custom_label_2: string;
      custom_label_3: string;
      custom_label_4: string;
      original: { name: string; category: string };
    }

    const results: EnrichedProduct[] = [];
    let errorCount = 0;

    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      const batch = products.slice(i, i + BATCH_SIZE);
      console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(products.length / BATCH_SIZE)}`);

      const productList = batch
        .map((p, idx) => {
          const price = p.price ?? 0;
          const weight = p.weight ?? 0;
          const costPrice = p.cost_price ?? 0;
          return `${idx + 1}. [ID:${p.id}] Name: ${p.name}\n   Category: ${p.category || "Unknown"}\n   Price: $${price.toFixed(2)} | Cost: $${costPrice.toFixed(2)} | Weight: ${weight}g\n   Species: ${p.primary_species || "unknown"}`;
        })
        .join("\n");

      const prompt = `Analyze these pet products and generate Google Shopping feed attributes. Return ONLY a valid JSON array.

For each product return an object with these exact fields:
- "id": the product ID (string)
- "product_type": hierarchical product type, format: "Pet Supplies > [Animal] Supplies > [Subcategory] > [Product Type]"
- "google_product_category": Google taxonomy path, e.g. "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Toys"
- "custom_label_0": animal type — one of: "dog", "cat", "bird", "small_animal", "multi_pet", "general_pet"
- "custom_label_1": price segment — one of: "budget" (under $10), "low_price" ($10-$20), "mid_price" ($20-$40), "premium" ($40-$80), "luxury" (over $80)
- "custom_label_2": margin estimate based on cost vs price — one of: "low_margin" (under 30%), "medium_margin" (30-50%), "high_margin" (over 50%), "unknown_margin" (if no cost data)
- "custom_label_3": shipping class based on weight — one of: "small_parcel" (under 500g), "standard_parcel" (500g-2kg), "bulky_item" (over 2kg), "unknown_weight"
- "custom_label_4": product group — one of: "toys", "beds", "carriers", "grooming", "feeding", "litter", "training", "health", "clothing", "accessories", "furniture", "tech", "outdoor", "other"

RULES:
- Detect animal type from name, category, and description keywords
- Use proper Google taxonomy paths (Animals & Pet Supplies > Pet Supplies > ...)
- For product_type use: Pet Supplies > [Animal] Supplies > [Category] > [Specific Type]
- Calculate margin from price and cost_price if available
- Calculate shipping class from weight in grams

PRODUCTS:
${productList}

Return ONLY valid JSON array, no markdown, no explanation.`;

      try {
        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content: "You are a Google Merchant Center feed optimization expert. Return only valid JSON arrays. No markdown fences.",
              },
              { role: "user", content: prompt },
            ],
          }),
        });

        if (!response.ok) {
          console.error(`AI error: ${response.status}`);
          errorCount += batch.length;
          continue;
        }

        const data = await response.json();
        let content = data.choices?.[0]?.message?.content || "";
        content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

        const enriched: Array<{
          id: string;
          product_type: string;
          google_product_category: string;
          custom_label_0: string;
          custom_label_1: string;
          custom_label_2: string;
          custom_label_3: string;
          custom_label_4: string;
        }> = JSON.parse(content);

        for (const item of enriched) {
          const original = batch.find((p) => p.id === item.id);
          if (original && item.product_type && item.google_product_category) {
            results.push({
              id: item.id,
              product_type: item.product_type,
              google_product_category: item.google_product_category,
              custom_label_0: item.custom_label_0 || "general_pet",
              custom_label_1: item.custom_label_1 || "mid_price",
              custom_label_2: item.custom_label_2 || "unknown_margin",
              custom_label_3: item.custom_label_3 || "unknown_weight",
              custom_label_4: item.custom_label_4 || "other",
              original: { name: original.name, category: original.category || "" },
            });
          }
        }
      } catch (err) {
        console.error(`Batch error:`, err);
        errorCount += batch.length;
      }

      if (i + BATCH_SIZE < products.length) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    // Apply updates if not dry run
    let updatedCount = 0;
    if (!dryRun && results.length > 0) {
      for (const r of results) {
        const { error: updateError } = await adminSupabase
          .from("products")
          .update({
            product_type: r.product_type,
            google_product_category: r.google_product_category,
            custom_label_0: r.custom_label_0,
            custom_label_1: r.custom_label_1,
            custom_label_2: r.custom_label_2,
            custom_label_3: r.custom_label_3,
            custom_label_4: r.custom_label_4,
          })
          .eq("id", r.id);

        if (!updateError) {
          updatedCount++;
        } else {
          console.error(`Update failed for ${r.id}:`, updateError);
        }
      }
    }

    const report = {
      totalProducts: products.length,
      enrichedCount: results.length,
      updatedCount: dryRun ? 0 : updatedCount,
      errorCount,
      dryRun,
      samples: results.slice(0, 10).map((r) => ({
        id: r.id,
        name: r.original.name,
        category: r.original.category,
        product_type: r.product_type,
        google_product_category: r.google_product_category,
        custom_label_0: r.custom_label_0,
        custom_label_1: r.custom_label_1,
        custom_label_2: r.custom_label_2,
        custom_label_3: r.custom_label_3,
        custom_label_4: r.custom_label_4,
      })),
    };

    console.log(`Done: ${results.length} enriched, ${errorCount} errors, ${updatedCount} updated`);

    return new Response(JSON.stringify(report), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
