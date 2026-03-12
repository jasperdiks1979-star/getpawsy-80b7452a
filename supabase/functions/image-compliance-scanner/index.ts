import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ImageAnalysis {
  is_compliant: boolean;
  quality_score: "high" | "medium" | "low";
  violations: Array<{ type: string; detail: string; severity: "high" | "medium" | "low" }>;
  recommendation: string;
}

async function analyzeImageWithAI(imageUrl: string, lovableApiKey: string): Promise<ImageAnalysis> {
  const prompt = `You are a Google Merchant Center image compliance expert. Analyze this product image for Google Shopping policy violations.

Check for these violations:
1. TEXT_OVERLAY - Any text on the image (SALE, FREE SHIPPING, discount %, promotional text)
2. PROMOTIONAL_BADGE - Sale badges, discount stickers, "NEW" labels, ribbons
3. WATERMARK - Any watermark or logo overlaid on the product
4. COLLAGE - Multiple product photos stitched together in a grid/collage layout
5. BORDER_FRAME - Decorative borders, colored frames, non-standard edges
6. PRODUCT_NOT_CENTERED - Product is off to one side or cut off
7. MULTIPLE_PRODUCTS - More than one distinct product in the image
8. SMALL_PRODUCT_AREA - Product occupies less than 60% of the image frame
9. LOW_RESOLUTION - Image appears pixelated, blurry, or very small
10. NON_WHITE_BACKGROUND - Background is not white/neutral (colored, patterned, busy)

Respond with ONLY valid JSON (no markdown):
{
  "is_compliant": true/false,
  "quality_score": "high"|"medium"|"low",
  "violations": [{"type": "text_overlay", "detail": "SALE text visible top-right", "severity": "high"}],
  "recommendation": "brief recommendation"
}

Rules:
- "high" = no violations, perfect for Google Shopping
- "medium" = minor issues that probably won't cause disapproval
- "low" = clear violations that will likely cause disapproval
- If image fails to load, mark as low with violation "broken_image"`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
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
      const errText = await response.text().catch(() => "");
      console.error(`[image-compliance] AI request failed: ${response.status} ${errText}`);
      return {
        is_compliant: false,
        quality_score: "low",
        violations: [{ type: "scan_error", detail: `AI analysis failed: HTTP ${response.status}`, severity: "high" }],
        recommendation: "Manual review required - automated scan failed",
      };
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";
    
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        is_compliant: false,
        quality_score: "low",
        violations: [{ type: "scan_error", detail: "Could not parse AI response", severity: "high" }],
        recommendation: "Manual review required",
      };
    }

    return JSON.parse(jsonMatch[0]) as ImageAnalysis;
  } catch (error) {
    console.error(`[image-compliance] Error: ${error}`);
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

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleData } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!roleData) {
      return new Response(JSON.stringify({ ok: false, error: "Admin required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || "scan";
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY && action === "scan") {
      return new Response(JSON.stringify({ ok: false, error: "LOVABLE_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ═══════════════════════════════════════════════════
    // ACTION: SCAN
    // ═══════════════════════════════════════════════════
    if (action === "scan") {
      const productIds: string[] | null = body.product_ids || null;
      const batchSize = Math.min(body.batch_size || 10, 50);
      const scanAdditional = body.scan_additional !== false;

      let query = supabase
        .from("products")
        .select("id, name, image_url, images, slug, is_active")
        .eq("is_active", true)
        .eq("is_duplicate", false);

      if (productIds?.length) {
        query = query.in("id", productIds);
      }

      const { data: products, error: prodErr } = await query.order("created_at", { ascending: false });
      if (prodErr) {
        return new Response(JSON.stringify({ ok: false, error: prodErr.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const totalProducts = products?.length || 0;
      let scannedCount = 0;
      let compliantCount = 0;
      let violationCount = 0;
      let highCount = 0, mediumCount = 0, lowCount = 0;
      const violationDetails: Array<{
        product_id: string; product_name: string;
        image_url: string; position: number; violations: unknown[];
      }> = [];

      const productsToScan = (products || []).slice(0, batchSize);

      for (const product of productsToScan) {
        // Primary image
        if (product.image_url) {
          const result = await analyzeImageWithAI(product.image_url, LOVABLE_API_KEY!);
          scannedCount++;

          await supabase.from("product_image_compliance").upsert({
            product_id: product.id,
            image_url: product.image_url,
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
            violationDetails.push({
              product_id: product.id, product_name: product.name,
              image_url: product.image_url, position: 0, violations: result.violations,
            });
          } else {
            compliantCount++;
          }
        }

        // Additional images (max 4)
        if (scanAdditional && Array.isArray(product.images)) {
          const additional = (product.images as string[]).slice(0, 4);
          for (let i = 0; i < additional.length; i++) {
            const imgUrl = additional[i];
            if (!imgUrl || imgUrl === product.image_url) continue;

            const result = await analyzeImageWithAI(imgUrl, LOVABLE_API_KEY!);
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
              violationDetails.push({
                product_id: product.id, product_name: product.name,
                image_url: imgUrl, position: i + 1, violations: result.violations,
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
          violation_details: violationDetails.slice(0, 50),
          remaining_products: totalProducts - productsToScan.length,
        },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ═══════════════════════════════════════════════════
    // ACTION: REPORT
    // ═══════════════════════════════════════════════════
    if (action === "report") {
      const { data: compliance, error } = await supabase
        .from("product_image_compliance")
        .select("*")
        .order("quality_score", { ascending: true });

      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const records = compliance || [];
      const total = records.length;
      const compliant = records.filter(r => r.is_compliant).length;
      const high = records.filter(r => r.quality_score === "high").length;
      const medium = records.filter(r => r.quality_score === "medium").length;
      const low = records.filter(r => r.quality_score === "low").length;
      const pending = records.filter(r => r.quality_score === "pending").length;

      const violationsByType: Record<string, number> = {};
      for (const r of records) {
        const v = r.violations as Array<{ type: string }>;
        if (Array.isArray(v)) {
          for (const vi of v) {
            violationsByType[vi.type] = (violationsByType[vi.type] || 0) + 1;
          }
        }
      }

      const productIds = new Set(records.map(r => r.product_id));
      const nonCompliantIds = new Set(records.filter(r => !r.is_compliant).map(r => r.product_id));
      const fullyCompliant = [...productIds].filter(id => !nonCompliantIds.has(id)).length;

      return new Response(JSON.stringify({
        ok: true,
        report: {
          total_images: total,
          compliant_images: compliant,
          quality_breakdown: { high, medium, low, pending },
          violations_by_type: violationsByType,
          total_products_scanned: productIds.size,
          fully_compliant_products: fullyCompliant,
          products_with_issues: nonCompliantIds.size,
          records: records.slice(0, 200),
        },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ═══════════════════════════════════════════════════
    // ACTION: AUTO_FIX — swap low-quality primary images
    // ═══════════════════════════════════════════════════
    if (action === "auto_fix") {
      const { data: lowPrimaries } = await supabase
        .from("product_image_compliance")
        .select("product_id, image_url, quality_score")
        .eq("image_position", 0)
        .eq("quality_score", "low");

      let fixedCount = 0;
      const fixes: Array<{ product_id: string; old_primary: string; new_primary: string }> = [];

      for (const primary of (lowPrimaries || [])) {
        const { data: alternatives } = await supabase
          .from("product_image_compliance")
          .select("image_url, quality_score")
          .eq("product_id", primary.product_id)
          .neq("image_position", 0)
          .in("quality_score", ["high", "medium"])
          .order("quality_score", { ascending: true })
          .limit(1);

        if (alternatives?.length) {
          const { error } = await supabase
            .from("products")
            .update({ image_url: alternatives[0].image_url })
            .eq("id", primary.product_id);

          if (!error) {
            fixedCount++;
            fixes.push({
              product_id: primary.product_id,
              old_primary: primary.image_url,
              new_primary: alternatives[0].image_url,
            });
          }
        }
      }

      return new Response(JSON.stringify({
        ok: true, fixed: fixedCount, fixes: fixes.slice(0, 50),
        low_primaries_found: (lowPrimaries || []).length,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ═══════════════════════════════════════════════════
    // ACTION: MERCHANT_GATE — check if product passes compliance for export
    // ═══════════════════════════════════════════════════
    if (action === "merchant_gate") {
      const productId = body.product_id;
      if (!productId) {
        return new Response(JSON.stringify({ ok: false, error: "product_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: compliance } = await supabase
        .from("product_image_compliance")
        .select("quality_score, is_compliant, image_position")
        .eq("product_id", productId);

      if (!compliance?.length) {
        // Not scanned yet — allow through but flag
        return new Response(JSON.stringify({
          ok: true, pass: true, reason: "not_scanned", compliant_images: 0,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const primary = compliance.find(c => c.image_position === 0);
      const primaryPass = primary ? primary.quality_score !== "low" : true;
      const compliantAdditional = compliance.filter(c => c.image_position > 0 && c.is_compliant).length;

      return new Response(JSON.stringify({
        ok: true,
        pass: primaryPass,
        primary_score: primary?.quality_score || "unknown",
        compliant_additional_images: compliantAdditional,
        total_images_scanned: compliance.length,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: false, error: "Unknown action. Use: scan, report, auto_fix, merchant_gate" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[image-compliance]", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
