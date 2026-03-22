import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const ALLOWED_ORIGINS = [
  "https://getpawsy.pet",
  "https://www.getpawsy.pet",
  "https://getpawsy.lovable.app",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

// Performance scoring formula
function calculateScore(impressions: number, clicks: number, saves: number): number {
  if (impressions === 0) return 0;
  const ctr = clicks / impressions;
  const saveRate = saves / impressions;
  // Weighted: CTR 50%, Save rate 30%, Volume 20%
  const ctrScore = Math.min(ctr * 1000, 100) * 0.5; // 10% CTR = 100 points
  const saveScore = Math.min(saveRate * 500, 100) * 0.3; // 20% save rate = 100
  const volumeScore = Math.min(Math.log10(impressions + 1) * 25, 100) * 0.2;
  return Math.round((ctrScore + saveScore + volumeScore) * 100) / 100;
}

serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const { action, pinId, performanceData, productId } = await req.json();
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // ACTION: update_performance - Update pin metrics and score
    if (action === "update_performance") {
      const { impressions, clicks, saves } = performanceData;
      const ctr = impressions > 0 ? clicks / impressions : 0;
      const score = calculateScore(impressions, clicks, saves);

      const { error } = await sb.from("pinterest_pin_performance").upsert({
        pin_id: pinId,
        impressions,
        clicks,
        saves,
        ctr,
        performance_score: score,
        updated_at: new Date().toISOString(),
      }, { onConflict: "pin_id" });

      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, score, ctr }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // ACTION: analyze_and_optimize - Score all pins, generate variations for winners, replace losers
    if (action === "analyze_and_optimize") {
      const { data: pins } = await sb.from("pinterest_pin_performance")
        .select("*").eq("status", "active").order("performance_score", { ascending: false });

      if (!pins?.length) {
        return new Response(JSON.stringify({ ok: true, message: "No pins to optimize" }), {
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }

      const avgScore = pins.reduce((s, p) => s + (p.performance_score || 0), 0) / pins.length;
      const topPins = pins.filter(p => (p.performance_score || 0) > avgScore * 1.5);
      const lowPins = pins.filter(p => (p.performance_score || 0) < avgScore * 0.5 && (p.impressions || 0) > 100);

      const results: any = { topPins: topPins.length, lowPins: lowPins.length, newVariations: 0, replacements: 0 };

      // Generate variations for top performers (viral multiplier)
      if (topPins.length > 0) {
        const topPin = topPins[0];
        const viralPrompt = `You are a Pinterest marketing expert. This pin is performing well:
Title: ${topPin.pin_title}
Description: ${topPin.pin_description}
Hook: ${topPin.hook_angle}
Stats: ${topPin.impressions} impressions, ${topPin.clicks} clicks, ${topPin.saves} saves

Generate 3 VARIATIONS with different angles. Return JSON:
{
  "variations": [
    {
      "title": "max 100 chars",
      "description": "200-400 chars, Hook→Solution→✔Benefits→CTA→#hashtags",
      "hookAngle": "different angle",
      "imagePrompt": "vertical 2:3 Pinterest style",
      "overlayText": "bold headline"
    }
  ],
  "extractedKeywords": ["high-performing keywords from this pin"]
}`;

        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [{ role: "user", content: viralPrompt }],
            temperature: 0.9,
          }),
        });

        if (aiResp.ok) {
          const aiData = await aiResp.json();
          const raw = aiData.choices?.[0]?.message?.content || "";
          const jsonMatch = raw.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            // Queue variations for publishing
            for (const v of (parsed.variations || [])) {
              await sb.from("pinterest_publish_queue").insert({
                product_id: topPin.product_id,
                pin_title: v.title,
                pin_description: v.description,
                image_prompt: v.imagePrompt,
                product_url: topPin.product_url,
                hook_angle: v.hookAngle,
                overlay_text: v.overlayText,
                posting_slot: ["morning", "afternoon", "evening"][results.newVariations % 3],
                status: "queued",
              });
              results.newVariations++;
            }
            // Track extracted keywords
            for (const kw of (parsed.extractedKeywords || [])) {
              await sb.from("pinterest_keyword_performance").upsert({
                keyword: kw.toLowerCase(),
                pin_count: 1,
                updated_at: new Date().toISOString(),
              }, { onConflict: "keyword" });
            }
          }
        }
      }

      // Replace low performers
      if (lowPins.length > 0) {
        const lowPin = lowPins[0];
        const replacePrompt = `This Pinterest pin is performing poorly:
Title: ${lowPin.pin_title}
Hook: ${lowPin.hook_angle}
Stats: ${lowPin.impressions} impressions, only ${lowPin.clicks} clicks

Generate 1 REPLACEMENT pin with a completely different strategy. Return JSON:
{
  "replacement": {
    "title": "max 100 chars, stronger hook",
    "description": "200-400 chars, problem→solution format",
    "hookAngle": "new angle",
    "imagePrompt": "vertical 2:3, more eye-catching",
    "overlayText": "compelling headline",
    "newKeywords": ["3-5 better keywords"]
  }
}`;

        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [{ role: "user", content: replacePrompt }],
            temperature: 0.9,
          }),
        });

        if (aiResp.ok) {
          const aiData = await aiResp.json();
          const raw = aiData.choices?.[0]?.message?.content || "";
          const jsonMatch = raw.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const r = parsed.replacement;
            if (r) {
              // Mark old pin as replaced
              await sb.from("pinterest_pin_performance")
                .update({ status: "replaced" }).eq("id", lowPin.id);
              // Queue replacement
              await sb.from("pinterest_publish_queue").insert({
                product_id: lowPin.product_id,
                pin_title: r.title,
                pin_description: r.description,
                image_prompt: r.imagePrompt,
                product_url: lowPin.product_url,
                hook_angle: r.hookAngle,
                overlay_text: r.overlayText,
                posting_slot: "morning",
                status: "queued",
              });
              results.replacements++;
            }
          }
        }
      }

      return new Response(JSON.stringify({ ok: true, ...results, avgScore }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // ACTION: bulk_generate - Auto generate pins for products without pins
    if (action === "bulk_generate") {
      const { data: existingPins } = await sb.from("pinterest_pins").select("product_id");
      const existingIds = new Set((existingPins || []).map(p => p.product_id));

      const { data: products } = await sb.from("products")
        .select("id, name, slug, price, category, description")
        .eq("is_active", true).limit(10);

      const unprocessed = (products || []).filter(p => !existingIds.has(p.id));
      let generated = 0;

      for (const product of unprocessed.slice(0, 3)) { // Process 3 at a time
        try {
          const resp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/pinterest-pin-generator`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productId: product.id }),
          });
          if (resp.ok) generated++;
        } catch (e) {
          console.error(`Failed to generate pins for ${product.name}:`, e);
        }
      }

      return new Response(JSON.stringify({
        ok: true,
        total_products: products?.length || 0,
        already_processed: existingIds.size,
        newly_generated: generated,
      }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // ACTION: get_dashboard_stats
    if (action === "get_dashboard_stats") {
      const { data: perf } = await sb.from("pinterest_pin_performance")
        .select("*").eq("status", "active");
      const { data: queue } = await sb.from("pinterest_publish_queue")
        .select("status");
      const { data: keywords } = await sb.from("pinterest_keyword_performance")
        .select("*").order("total_clicks", { ascending: false }).limit(20);

      const totalImpressions = (perf || []).reduce((s, p) => s + (p.impressions || 0), 0);
      const totalClicks = (perf || []).reduce((s, p) => s + (p.clicks || 0), 0);
      const totalSaves = (perf || []).reduce((s, p) => s + (p.saves || 0), 0);
      const avgScore = perf?.length ? (perf.reduce((s, p) => s + (p.performance_score || 0), 0) / perf.length) : 0;
      const topPerformers = (perf || []).sort((a, b) => (b.performance_score || 0) - (a.performance_score || 0)).slice(0, 5);
      const lowPerformers = (perf || []).filter(p => (p.performance_score || 0) < avgScore * 0.5 && (p.impressions || 0) > 100);

      return new Response(JSON.stringify({
        ok: true,
        stats: {
          totalPins: perf?.length || 0,
          totalImpressions,
          totalClicks,
          totalSaves,
          avgCtr: totalImpressions > 0 ? totalClicks / totalImpressions : 0,
          avgScore: Math.round(avgScore * 100) / 100,
          queuedPins: (queue || []).filter(q => q.status === "queued").length,
          publishedPins: (queue || []).filter(q => q.status === "published").length,
        },
        topPerformers,
        lowPerformers,
        topKeywords: keywords || [],
      }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // ACTION: sync_performance - Import performance data from manual entry or Pinterest API
    if (action === "sync_performance") {
      const { pins: pinUpdates } = performanceData;
      let updated = 0;
      for (const pu of (pinUpdates || [])) {
        const ctr = pu.impressions > 0 ? pu.clicks / pu.impressions : 0;
        const score = calculateScore(pu.impressions, pu.clicks, pu.saves);
        await sb.from("pinterest_pin_performance").upsert({
          pin_id: pu.pin_id,
          product_id: pu.product_id || "unknown",
          product_url: pu.product_url || "",
          pin_title: pu.title || "",
          pin_description: pu.description || "",
          hook_angle: pu.hook_angle || "",
          impressions: pu.impressions,
          clicks: pu.clicks,
          saves: pu.saves,
          ctr,
          performance_score: score,
          status: "active",
        }, { onConflict: "pin_id" });
        updated++;
      }

      return new Response(JSON.stringify({ ok: true, updated }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (e) {
    console.error("pinterest-optimizer error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
