import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Violation types we check for ──
const VIOLATION_TYPES = [
  "text_overlay",
  "promotional_badge",
  "watermark",
  "collage",
  "border_frame",
  "product_not_centered",
  "multiple_products",
  "small_product_area",
  "low_resolution",
  "non_white_background",
] as const;

interface ImageAnalysis {
  is_compliant: boolean;
  quality_score: "high" | "medium" | "low";
  violations: Array<{ type: string; detail: string; severity: "high" | "medium" | "low" }>;
  recommendation: string;
}

async function analyzeImageWithAI(imageUrl: string, apiKey: string): Promise<ImageAnalysis> {
  const prompt = `You are a Google Merchant Center image compliance expert. Analyze this product image for Google Shopping policy violations.

Check for these violations:
1. TEXT OVERLAY - Any text on the image (SALE, FREE SHIPPING, discount %, brand watermarks, promotional text)
2. PROMOTIONAL BADGE - Sale badges, discount stickers, "NEW" labels, ribbons
3. WATERMARK - Any watermark or logo overlaid on the product
4. COLLAGE - Multiple product photos stitched together in a grid/collage layout
5. BORDER/FRAME - Decorative borders, colored frames, non-standard edges
6. PRODUCT NOT CENTERED - Product is off to one side or cut off
7. MULTIPLE PRODUCTS - More than one distinct product in the image
8. SMALL PRODUCT AREA - Product occupies less than 60% of the image frame
9. LOW RESOLUTION - Image appears pixelated, blurry, or very small
10. NON-WHITE BACKGROUND - Background is not white/neutral (colored, patterned, busy)

Respond with ONLY valid JSON (no markdown):
{
  "is_compliant": true/false,
  "quality_score": "high"|"medium"|"low",
  "violations": [{"type": "text_overlay", "detail": "SALE text visible top-right", "severity": "high"}],
  "recommendation": "brief recommendation"
}

Rules:
- "high" quality = no violations, perfect for Google Shopping
- "medium" quality = minor issues (slightly off-center, slightly busy background) that probably won't cause disapproval
- "low" quality = clear violations that will likely cause disapproval
- If image fails to load or is broken, mark as low with violation "broken_image"`;

  try {
    const response = await fetch("https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/ai-proxy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      console.error(`[image-compliance] AI request failed: ${response.status}`);
      return {
        is_compliant: false,
        quality_score: "low",
        violations: [{ type: "scan_error", detail: `AI analysis failed: HTTP ${response.status}`, severity: "high" }],
        recommendation: "Manual review required - automated scan failed",
      };
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";
    
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        is_compliant: false,
        quality_score: "low",
        violations: [{ type: "scan_error", detail: "Could not parse AI response", severity: "high" }],
        recommendation: "Manual review required",
      };
    }

    const parsed = JSON.parse(jsonMatch[0]) as ImageAnalysis;
    return parsed;
  } catch (error) {
    console.error(`[image-compliance] Error analyzing image: ${error}`);
    return {
      is_compliant: false,
      quality_score: "low",
      violations: [{ type: "scan_error", detail: `Error: ${String(error).substring(0, 200)}`, severity: "high" }],
      recommendation: "Manual review required",
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Auth check
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Admin check
    const { data: roleData } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!roleData) {
      return new Response(JSON.stringify({ ok: false, error: "Admin required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || "scan";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    if (action === "scan") {
      // Scan all active products or specific product_ids
      const productIds: string[] | null = body.product_ids || null;
      const batchSize = body.batch_size || 10;
      const scanAdditional = body.scan_additional !== false;

      let query = supabase
        .from("products")
        .select("id, name, image_url, images, slug, is_active")
        .eq("is_active", true)
        .eq("is_duplicate", false);

      if (productIds && productIds.length > 0) {
        query = query.in("id", productIds);
      }

      const { data: products, error: prodErr } = await query.order("created_at", { ascending: false });
      if (prodErr) {
        return new Response(JSON.stringify({ ok: false, error: prodErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const totalProducts = products?.length || 0;
      let scannedCount = 0;
      let compliantCount = 0;
      let violationCount = 0;
      let highCount = 0;
      let mediumCount = 0;
      let lowCount = 0;
      const violations: Array<{ product_id: string; product_name: string; image_url: string; position: number; violations: unknown[] }> = [];

      // Process in batches to avoid timeouts
      const productsToScan = (products || []).slice(0, batchSize);

      for (const product of productsToScan) {
        // Scan primary image
        const primaryUrl = product.image_url;
        if (primaryUrl) {
          const result = await analyzeImageWithAI(primaryUrl, anonKey);
          scannedCount++;

          await supabase.from("product_image_compliance").upsert({
            product_id: product.id,
            image_url: primaryUrl,
            image_position: 0,
            quality_score: result.quality_score,
            violations: result.violations,
            is_compliant: result.is_compliant,
            scan_model: "gemini-2.5-flash",
            scan_result: result as unknown as Record<string, unknown>,
            scanned_at: new Date().toISOString(),
          }, { onConflict: "product_id,image_url" });

          if (result.quality_score === "high") highCount++;
          else if (result.quality_score === "medium") mediumCount++;
          else lowCount++;

          if (!result.is_compliant) {
            violationCount++;
            violations.push({
              product_id: product.id,
              product_name: product.name,
              image_url: primaryUrl,
              position: 0,
              violations: result.violations,
            });
          } else {
            compliantCount++;
          }
        }

        // Scan additional images
        if (scanAdditional && product.images && Array.isArray(product.images)) {
          const additionalImages = (product.images as string[]).slice(0, 4);
          for (let i = 0; i < additionalImages.length; i++) {
            const imgUrl = additionalImages[i];
            if (!imgUrl || imgUrl === primaryUrl) continue;

            const result = await analyzeImageWithAI(imgUrl, anonKey);
            scannedCount++;

            await supabase.from("product_image_compliance").upsert({
              product_id: product.id,
              image_url: imgUrl,
              image_position: i + 1,
              quality_score: result.quality_score,
              violations: result.violations,
              is_compliant: result.is_compliant,
              scan_model: "gemini-2.5-flash",
              scan_result: result as unknown as Record<string, unknown>,
              scanned_at: new Date().toISOString(),
            }, { onConflict: "product_id,image_url" });

            if (result.quality_score === "high") highCount++;
            else if (result.quality_score === "medium") mediumCount++;
            else lowCount++;

            if (!result.is_compliant) {
              violationCount++;
              violations.push({
                product_id: product.id,
                product_name: product.name,
                image_url: imgUrl,
                position: i + 1,
                violations: result.violations,
              });
            } else {
              compliantCount++;
            }
          }
        }
      }

      return new Response(JSON.stringify({
        ok: true,
        report: {
          total_products: totalProducts,
          products_scanned: productsToScan.length,
          images_scanned: scannedCount,
          compliant: compliantCount,
          violations: violationCount,
          quality_breakdown: { high: highCount, medium: mediumCount, low: lowCount },
          violation_details: violations.slice(0, 50),
          remaining_products: totalProducts - productsToScan.length,
        },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "report") {
      // Get full compliance report from stored data
      const { data: compliance, error } = await supabase
        .from("product_image_compliance")
        .select("*")
        .order("quality_score", { ascending: true });

      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const records = compliance || [];
      const total = records.length;
      const compliant = records.filter(r => r.is_compliant).length;
      const high = records.filter(r => r.quality_score === "high").length;
      const medium = records.filter(r => r.quality_score === "medium").length;
      const low = records.filter(r => r.quality_score === "low").length;
      const pending = records.filter(r => r.quality_score === "pending").length;

      // Group violations by type
      const violationsByType: Record<string, number> = {};
      for (const r of records) {
        const v = r.violations as Array<{ type: string }>;
        if (Array.isArray(v)) {
          for (const violation of v) {
            violationsByType[violation.type] = (violationsByType[violation.type] || 0) + 1;
          }
        }
      }

      // Products with all compliant images
      const productIds = new Set(records.map(r => r.product_id));
      const nonCompliantProductIds = new Set(records.filter(r => !r.is_compliant).map(r => r.product_id));
      const fullyCompliant = [...productIds].filter(id => !nonCompliantProductIds.has(id)).length;

      return new Response(JSON.stringify({
        ok: true,
        report: {
          total_images: total,
          compliant_images: compliant,
          quality_breakdown: { high, medium, low, pending },
          violations_by_type: violationsByType,
          total_products_scanned: productIds.size,
          fully_compliant_products: fullyCompliant,
          products_with_issues: nonCompliantProductIds.size,
          records: records.slice(0, 200),
        },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "auto_fix") {
      // Auto-fix: for products with non-compliant primary images,
      // swap with the highest-scoring additional image
      const { data: lowPrimaries } = await supabase
        .from("product_image_compliance")
        .select("product_id, image_url, quality_score")
        .eq("image_position", 0)
        .eq("quality_score", "low");

      let fixedCount = 0;
      const fixes: Array<{ product_id: string; old_primary: string; new_primary: string }> = [];

      for (const primary of (lowPrimaries || [])) {
        // Find best alternative
        const { data: alternatives } = await supabase
          .from("product_image_compliance")
          .select("image_url, quality_score")
          .eq("product_id", primary.product_id)
          .neq("image_position", 0)
          .in("quality_score", ["high", "medium"])
          .order("quality_score", { ascending: true }) // high first
          .limit(1);

        if (alternatives && alternatives.length > 0) {
          const newPrimary = alternatives[0].image_url;
          
          // Update product's primary image
          const { error } = await supabase
            .from("products")
            .update({ image_url: newPrimary })
            .eq("id", primary.product_id);

          if (!error) {
            fixedCount++;
            fixes.push({
              product_id: primary.product_id,
              old_primary: primary.image_url,
              new_primary: newPrimary,
            });
          }
        }
      }

      return new Response(JSON.stringify({
        ok: true,
        fixed: fixedCount,
        fixes: fixes.slice(0, 50),
        low_primaries_found: (lowPrimaries || []).length,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: false, error: "Unknown action. Use: scan, report, auto_fix" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[image-compliance]", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
