import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 15;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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
    const limitProducts = body.limit ?? 0; // 0 = all

    // Fetch active products
    let query = adminSupabase
      .from("products")
      .select("id, name, category, original_name")
      .eq("is_active", true)
      .order("name");

    if (limitProducts > 0) {
      query = query.limit(limitProducts);
    }

    const { data: products, error: fetchError } = await query;
    if (fetchError) throw new Error(`Fetch error: ${fetchError.message}`);
    if (!products || products.length === 0) {
      return new Response(JSON.stringify({ error: "No products found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Processing ${products.length} products (dryRun=${dryRun})`);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const results: Array<{ id: string; original: string; optimized: string; category: string }> = [];
    let errorCount = 0;

    // Process in batches
    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      const batch = products.slice(i, i + BATCH_SIZE);
      console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(products.length / BATCH_SIZE)}`);

      const productList = batch
        .map((p, idx) => `${idx + 1}. [ID:${p.id}] Category: ${p.category || "General"}\n   Current: ${p.name}`)
        .join("\n");

      const prompt = `Optimize these product titles for Google Shopping. Return ONLY a JSON array of objects with "id" and "title" fields.

RULES:
- Max 150 characters
- Structure: Primary Keyword + Product Type + Key Feature + Pet Type
- Remove keyword stuffing and duplicate words
- Ensure readable, natural titles
- Prioritize high-intent shopping keywords
- Use title case
- Remove leading numbers, measurements at start unless critical
- Remove brand names from start (they'll be separate field)

KEYWORD GUIDELINES:
- Dog products: interactive, chew, training, puzzle, enrichment, durable
- Cat products: interactive, automatic, LED, motion sensor, teaser, enrichment
- Bird products: perch, stand, cage, feeder
- Small animal products: habitat, cage, hutch, enclosure

EXAMPLES:
- "Dog Puzzle Toys Interactive Treat Puzzle Dog Enrichment Toy" → "Interactive Dog Puzzle Toy – Treat Dispensing Enrichment Toy for Dogs"
- "Cat LED Ball Toy" → "Automatic LED Cat Toy – Interactive Motion Sensor Ball for Cats"
- "3 In 1 Cat Steam Brush..." → "Cat Steam Grooming Brush – 3-in-1 De-Shedding Spray Comb"
- "Dog Training Collar For 2 Dogs" → "Dog Training Collar – Dual Dog Remote with Vibration & Beep"

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
                content: "You are a Google Shopping title optimization expert. Return only valid JSON arrays. No markdown fences.",
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
        
        // Strip markdown fences if present
        content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

        const optimized: Array<{ id: string; title: string }> = JSON.parse(content);

        for (const item of optimized) {
          const original = batch.find((p) => p.id === item.id);
          if (original && item.title && item.title.length <= 150) {
            results.push({
              id: item.id,
              original: original.name,
              optimized: item.title,
              category: original.category || "",
            });
          }
        }
      } catch (err) {
        console.error(`Batch error:`, err);
        errorCount += batch.length;
      }

      // Small delay between batches to avoid rate limits
      if (i + BATCH_SIZE < products.length) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    // Apply updates if not dry run
    let updatedCount = 0;
    if (!dryRun && results.length > 0) {
      for (const r of results) {
        const original = products.find((p) => p.id === r.id);
        // Backup original name only if not already backed up
        const backupName = original?.original_name || r.original;

        const { error: updateError } = await adminSupabase
          .from("products")
          .update({
            name: r.optimized,
            original_name: backupName,
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
      optimizedCount: results.length,
      errorCount,
      updatedCount: dryRun ? 0 : updatedCount,
      dryRun,
      samples: results.slice(0, 10).map((r) => ({
        id: r.id,
        category: r.category,
        original: r.original,
        optimized: r.optimized,
        charCount: r.title?.length ?? r.optimized.length,
      })),
    };

    console.log(`Done: ${results.length} optimized, ${errorCount} errors, ${updatedCount} updated`);

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
