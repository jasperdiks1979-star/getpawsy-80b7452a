import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * AI Content Auto-Expansion Engine
 * 
 * Cron-triggered edge function that:
 * 1. Reads GSC keyword data for pages ranking 6–20
 * 2. Identifies semantic gaps and thin content
 * 3. Uses Lovable AI to generate expansion content (FAQs, sections, comparisons)
 * 4. Stores generated content for admin review/approval
 */

interface ExpansionCandidate {
  page: string;
  query: string;
  position: number;
  impressions: number;
  clicks: number;
  ctr: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const guard = await requireInternalOrAdmin(req);
  if (guard) return guard;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Step 1: Pull GSC keywords in the strike zone (positions 6–20)
    const { data: gscData, error: gscError } = await supabase
      .from("gsc_keywords")
      .select("page, query, position, impressions, clicks, ctr")
      .gte("position", 6)
      .lte("position", 20)
      .gte("impressions", 50)
      .order("impressions", { ascending: false })
      .limit(30);

    if (gscError) {
      console.error("GSC fetch error:", gscError);
      return new Response(JSON.stringify({ ok: false, error: "GSC data fetch failed" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const candidates: ExpansionCandidate[] = gscData || [];
    console.log(`Found ${candidates.length} expansion candidates`);

    if (candidates.length === 0) {
      return new Response(JSON.stringify({ 
        ok: true, 
        message: "No expansion candidates found",
        generated: 0 
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: Group by page and pick top 5 pages
    const pageGroups = new Map<string, ExpansionCandidate[]>();
    for (const c of candidates) {
      const group = pageGroups.get(c.page) || [];
      group.push(c);
      pageGroups.set(c.page, group);
    }

    const topPages = Array.from(pageGroups.entries())
      .sort((a, b) => {
        const aImp = a[1].reduce((s, c) => s + c.impressions, 0);
        const bImp = b[1].reduce((s, c) => s + c.impressions, 0);
        return bImp - aImp;
      })
      .slice(0, 5);

    const results: Array<{ page: string; queries: string[]; contentType: string; status: string }> = [];

    // Step 3: Generate expansion content for each page
    for (const [pageUrl, queries] of topPages) {
      const topQueries = queries.slice(0, 5);
      const queryList = topQueries.map(q => `"${q.query}" (pos ${q.position}, ${q.impressions} imp)`).join("\n");

      // Determine content type based on page URL
      const isCollection = pageUrl.includes("/collections/");
      const isBlog = pageUrl.includes("/blog/") || pageUrl.includes("/guides/");
      const isTraining = pageUrl.includes("/training") || pageUrl.includes("/harness") || pageUrl.includes("/leash");

      const contentType = isCollection ? "faq_and_comparison" : isBlog ? "section_expansion" : "faq_block";

      if (!lovableApiKey) {
        // No AI key — log intent and skip generation
        results.push({ page: pageUrl, queries: topQueries.map(q => q.query), contentType, status: "skipped_no_api_key" });
        continue;
      }

      try {
        const systemPrompt = `You are an SEO content expert for GetPawsy, a pet products e-commerce site. Generate high-quality, helpful content expansions for product pages to improve search rankings. Always write in a friendly, expert tone. Focus on answering real user questions comprehensively.`;

        let userPrompt = "";
        if (contentType === "faq_and_comparison") {
          userPrompt = `Generate 8 FAQ questions and answers for a product collection page. The page URL is: ${pageUrl}\n\nTarget keywords ranking 6-20:\n${queryList}\n\nReturn JSON with format: {"faqs": [{"question": "...", "answer": "..."}], "comparison_intro": "A 2-3 sentence intro for a comparison section"}`;
        } else if (contentType === "section_expansion") {
          userPrompt = `Generate 2 new content sections to add to an existing guide/blog post to improve depth. Page: ${pageUrl}\n\nTarget keywords:\n${queryList}\n\nReturn JSON: {"sections": [{"heading": "H2 heading", "content": "300-500 word section"}]}`;
        } else {
          userPrompt = `Generate 10 FAQ questions and detailed answers for this page: ${pageUrl}\n\nTarget keywords:\n${queryList}\n\nReturn JSON: {"faqs": [{"question": "...", "answer": "..."}]}`;
        }

        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
          }),
        });

        if (!aiResponse.ok) {
          const errText = await aiResponse.text();
          console.error(`AI error for ${pageUrl}:`, aiResponse.status, errText);
          results.push({ page: pageUrl, queries: topQueries.map(q => q.query), contentType, status: `ai_error_${aiResponse.status}` });
          continue;
        }

        const aiData = await aiResponse.json();
        const generatedContent = aiData.choices?.[0]?.message?.content || "";

        // Store in content_queue for admin review
        const { error: insertError } = await supabase
          .from("cluster_articles")
          .insert({
            cluster_id: "00000000-0000-0000-0000-000000000000", // placeholder
            slug: `auto-expansion-${Date.now()}-${pageUrl.replace(/[^a-z0-9]/gi, "-").slice(0, 50)}`,
            title: `Auto-Expansion: ${pageUrl}`,
            content: generatedContent,
            status: "draft",
            primary_keyword: topQueries[0]?.query || "",
            secondary_keywords: topQueries.map(q => q.query),
            article_role: "auto_expansion",
          });

        if (insertError) {
          console.error("Insert error:", insertError);
          results.push({ page: pageUrl, queries: topQueries.map(q => q.query), contentType, status: "insert_error" });
        } else {
          results.push({ page: pageUrl, queries: topQueries.map(q => q.query), contentType, status: "generated" });
        }
      } catch (aiErr) {
        console.error(`AI generation error for ${pageUrl}:`, aiErr);
        results.push({ page: pageUrl, queries: topQueries.map(q => q.query), contentType, status: "error" });
      }
    }

    // Log the run
    await supabase.from("cron_job_logs").insert({
      job_name: "ai-content-expansion",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      status: "completed",
      success: true,
      items_processed: results.length,
      details: { results },
    });

    return new Response(JSON.stringify({
      ok: true,
      message: `Processed ${results.length} pages for content expansion`,
      results,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("ai-content-expansion error:", error);
    return new Response(JSON.stringify({ 
      ok: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
