import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BATCH_SIZE = 15;

const TITLE_PROMPT = `You are a Google Shopping title optimization expert for a US pet supplies store.

REWRITE every product title using this EXACT structure:
  Primary Keyword + Product Type + Key Feature + Target Animal

TARGET: 70–120 characters. Strictly enforce this range.

RULES:
1. MUST include the target animal clearly: "for Dogs", "for Cats", "for Small Dogs", "for Indoor Cats", "for Parrots", "for Hamsters", etc.
2. Use an em dash (–) to separate the main product from the feature/benefit.
3. Include ONE key feature when possible: Automatic, Interactive, Adjustable, Portable, Foldable, Breathable, Multi-Level, Anti-Slip, Heavy Duty, Retractable, Expandable, Waterproof, Non-Slip.
4. Use Title Case for all words except prepositions (for, with, and, of).
5. Titles must read naturally as a human would search Google Shopping.

REMOVE these patterns:
- "Best", "Cheap", "Hot Sale", "New 2026", "#1", "Top Rated", "Premium", "Exclusive", "Amazing"
- ALL CAPS words
- Long keyword lists or duplicate words
- Supplier/brand names at the start
- Leading numbers or measurements unless critical to the product identity
- Promotional or marketing language

HIGH-VOLUME KEYWORDS to incorporate when relevant:
- Cat: cat toy, cat tree, cat litter box, cat carrier, cat bed, cat fountain, cat scratcher
- Dog: dog leash, dog bed, dog toy, dog bowl, dog training, dog harness, dog crate
- Small Animals: hamster cage, rabbit hutch, bird feeder, bird perch, pet habitat

EXAMPLES:
Input: "Interactive Windmill Cat Toy With LED Light Ball"
Output: "Interactive Cat Toy – Windmill Spinner with LED Ball for Indoor Cats"

Input: "Pet Carrier Backpack Expandable Travel Bag"
Output: "Expandable Pet Carrier Backpack – Breathable Travel Bag for Cats & Small Dogs"

Input: "Dog Training Collar For 2 Dogs"
Output: "Dual Dog Training Collar – Remote Vibration & Beep for Medium & Large Dogs"

Input: "3 Tier Cat Tree Tower"
Output: "Multi-Level Cat Tree – 3-Tier Indoor Tower with Scratching Posts for Cats"

Input: "Automatic cat water fountain stainless steel"
Output: "Automatic Cat Water Fountain – Stainless Steel Drinking Dispenser for Cats"

Return ONLY a valid JSON array of objects with "id" and "title" fields. No markdown fences, no explanation.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    // Verify admin role
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
    const filterShort = body.filterShort ?? false; // only optimize titles < 70 chars
    const filterLong = body.filterLong ?? false;   // only optimize titles > 120 chars

    // Fetch active products
    let query = adminSupabase
      .from("products")
      .select("id, name, category, original_name")
      .eq("is_active", true)
      .order("name");

    if (limitProducts > 0) {
      query = query.range(offsetProducts, offsetProducts + limitProducts - 1);
    }

    const { data: allProducts, error: fetchError } = await query;
    if (fetchError) throw new Error(`Fetch error: ${fetchError.message}`);
    if (!allProducts || allProducts.length === 0) {
      return new Response(JSON.stringify({ totalProducts: 0, optimizedCount: 0, errorCount: 0, updatedCount: 0, dryRun, results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Apply filters
    let products = allProducts;
    if (filterShort) {
      products = products.filter((p) => p.name.length < 70);
    }
    if (filterLong) {
      products = products.filter((p) => p.name.length > 120);
    }

    console.log(`Processing ${products.length} of ${allProducts.length} products (dryRun=${dryRun}, filterShort=${filterShort}, filterLong=${filterLong})`);

    if (products.length === 0) {
      return new Response(JSON.stringify({ totalProducts: allProducts.length, filteredCount: 0, optimizedCount: 0, errorCount: 0, updatedCount: 0, dryRun, results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const results: Array<{ id: string; original: string; optimized: string; category: string; charCount: number }> = [];
    let errorCount = 0;

    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      const batch = products.slice(i, i + BATCH_SIZE);
      console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(products.length / BATCH_SIZE)}`);

      const productList = batch
        .map((p, idx) => `${idx + 1}. [ID:${p.id}] Category: ${p.category || "General"}\n   Current title: ${p.name}`)
        .join("\n");

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
              { role: "system", content: TITLE_PROMPT },
              { role: "user", content: `Optimize these product titles:\n\n${productList}` },
            ],
          }),
        });

        if (!response.ok) {
          console.error(`AI error: ${response.status} ${await response.text()}`);
          errorCount += batch.length;
          continue;
        }

        const data = await response.json();
        let content = data.choices?.[0]?.message?.content || "";
        content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

        const optimized: Array<{ id: string; title: string }> = JSON.parse(content);

        for (const item of optimized) {
          const original = batch.find((p) => p.id === item.id);
          if (!original || !item.title) continue;

          // Enforce 70-120 char range — skip if AI produced out-of-range title
          const len = item.title.length;
          if (len < 40 || len > 150) {
            console.warn(`Skipping ${item.id}: title length ${len} out of acceptable range`);
            continue;
          }

          results.push({
            id: item.id,
            original: original.name,
            optimized: item.title,
            category: original.category || "",
            charCount: len,
          });
        }
      } catch (err) {
        console.error(`Batch error:`, err);
        errorCount += batch.length;
      }

      if (i + BATCH_SIZE < products.length) {
        await new Promise((r) => setTimeout(r, 800));
      }
    }

    // Apply updates if not dry run
    let updatedCount = 0;
    if (!dryRun && results.length > 0) {
      for (const r of results) {
        const original = products.find((p) => p.id === r.id);
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
          errorCount++;
        }
      }
    }

    // Stats
    const charStats = results.length > 0 ? {
      avgLength: Math.round(results.reduce((s, r) => s + r.charCount, 0) / results.length),
      minLength: Math.min(...results.map((r) => r.charCount)),
      maxLength: Math.max(...results.map((r) => r.charCount)),
      inRange: results.filter((r) => r.charCount >= 70 && r.charCount <= 120).length,
      tooShort: results.filter((r) => r.charCount < 70).length,
      tooLong: results.filter((r) => r.charCount > 120).length,
    } : null;

    const report = {
      totalProducts: allProducts.length,
      filteredCount: products.length,
      optimizedCount: results.length,
      errorCount,
      updatedCount: dryRun ? 0 : updatedCount,
      dryRun,
      charStats,
      results: results.map((r) => ({
        id: r.id,
        category: r.category,
        original: r.original,
        optimized: r.optimized,
        charCount: r.charCount,
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
