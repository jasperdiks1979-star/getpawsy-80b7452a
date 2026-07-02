import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Keyword database and topical authority map embedded for edge function use
const SEO_KEYWORDS: Record<string, string[]> = {
  "cat-toys": [
    "best cat toys for indoor cats", "automatic cat toys", "interactive cat toys",
    "cat toys for bored cats", "puzzle toys for cats", "laser toys for cats",
    "cat enrichment toys", "cat toys for kittens", "durable cat toys",
    "electronic cat toys", "cat toys that move", "cat teaser toys",
    "cat toys for lazy cats", "cat toys with feathers", "best toys for active cats",
    "best toys for indoor kittens", "interactive toys for bored cats",
    "smart cat toys", "self play cat toys", "treat puzzle toys for cats",
    "stimulating toys for cats", "cat toys for mental stimulation",
  ],
  "cat-litter": [
    "best cat litter for odor", "self cleaning litter box", "cat litter box furniture",
    "hidden litter box ideas", "best litter box for apartments", "automatic litter box guide",
    "litter box odor solutions", "large cat litter boxes", "best litter for multiple cats",
    "eco friendly cat litter", "low dust cat litter", "natural cat litter options",
    "best clumping litter", "litter box cleaning tips", "best litter for sensitive cats",
  ],
  "cat-trees": [
    "best cat trees for large cats", "modern cat tree furniture", "small apartment cat trees",
    "wall mounted cat trees", "best cat towers", "cat trees for multiple cats",
    "minimalist cat trees", "cat climbing furniture", "best cat tree for kittens",
    "luxury cat trees", "wooden cat trees", "space saving cat trees",
  ],
  "dog-training": [
    "best dog training toys", "dog puzzle toys", "dog enrichment toys",
    "interactive toys for dogs", "toys for smart dogs", "dog mental stimulation toys",
    "treat puzzle toys for dogs", "training toys for puppies", "dog brain games",
    "dog boredom toys", "dog toys that dispense treats",
  ],
  "dog-travel": [
    "best dog car seats", "dog travel carriers", "dog seat belt harness",
    "travel crate for dogs", "dog travel safety", "portable dog carriers",
    "dog travel backpacks", "best airline dog carriers", "dog road trip gear",
  ],
  "dog-grooming": [
    "dog grooming tools", "dog nail clipping guide", "best dog brushes",
    "how to groom a dog at home", "dog shedding solutions", "dog grooming kits",
    "dog grooming tips for beginners", "dog coat care guide", "dog grooming routine",
  ],
};

const CLUSTER_H2S: Record<string, string[]> = {
  "cat-toys": ["Why Cat Enrichment Matters", "Types of Cat Toys Compared", "Best Products for This Use Case", "What to Look for When Buying", "Common Mistakes Cat Owners Make"],
  "cat-litter": ["Why Choosing the Right Litter Matters", "Types of Litter Compared", "Best Products for Your Situation", "Buying Guide", "Mistakes That Cause Litter Problems"],
  "cat-trees": ["Why Cats Need Vertical Space", "Types of Cat Trees", "Best Products for Different Cats", "Key Features to Look For", "Common Buying Mistakes"],
  "dog-training": ["Why the Right Tools Matter", "Types of Training Equipment", "Best Products for Training", "What to Look for When Choosing", "Training Mistakes to Avoid"],
  "dog-travel": ["Why Safe Travel Gear Matters", "Types of Travel Products", "Best Products for Car Travel", "What to Check Before Buying", "Travel Mistakes to Avoid"],
  "dog-grooming": ["Why Regular Grooming Matters", "Types of Grooming Tools", "Best Products for Home Use", "What to Look for in Equipment", "Grooming Mistakes to Avoid"],
};

const CLUSTER_FAQS: Record<string, string[]> = {
  "cat-toys": ["How often should I rotate toys?", "Are automatic toys safe unattended?", "What toys work best for indoor cats?", "How do I know if my cat is bored?"],
  "cat-litter": ["How often should I change litter?", "Is clumping or non-clumping better?", "How many litter boxes do I need?", "What's the best litter for odor?"],
  "cat-trees": ["How tall should a cat tree be?", "Can large cats use standard trees?", "Where should I place a cat tree?", "How to get my cat to use a cat tree?"],
  "dog-training": ["What age to start training?", "Are puzzle toys good for training?", "How long should sessions last?", "Best method for puppies?"],
  "dog-travel": ["Are dog car seats crash tested?", "Can I use a regular harness?", "What size car seat for my dog?", "How to help car anxiety?"],
  "dog-grooming": ["How often should I groom?", "Can I use human shampoo?", "What brush for my dog's coat?", "How to trim nails safely?"],
};

function keywordToSlug(keyword: string): string {
  return keyword.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const guard = await requireInternalOrAdmin(req);
  if (guard) return guard;

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const maxGuides = body.limit || 3;
    const targetCluster = body.cluster || null;

    // Get existing published guide slugs
    const { data: existingGuides } = await supabase
      .from("published_guides")
      .select("slug");
    const existingSlugs = new Set((existingGuides || []).map((g: any) => g.slug));

    // Find missing keywords
    const missingKeywords: { keyword: string; cluster: string }[] = [];
    const clusters = targetCluster ? { [targetCluster]: SEO_KEYWORDS[targetCluster] || [] } : SEO_KEYWORDS;

    for (const [cluster, keywords] of Object.entries(clusters)) {
      for (const keyword of keywords) {
        const slug = keywordToSlug(keyword);
        if (!existingSlugs.has(slug)) {
          missingKeywords.push({ keyword, cluster });
        }
      }
    }

    // Pick up to maxGuides
    const toGenerate = missingKeywords.slice(0, maxGuides);
    const results: any[] = [];
    const errors: string[] = [];
    let guidesGenerated = 0;

    for (const { keyword, cluster } of toGenerate) {
      const slug = keywordToSlug(keyword);
      const h1 = `Best ${keyword.replace(/^best\s+/i, "")} — Complete Guide for Pet Parents (2026)`;
      const h2s = CLUSTER_H2S[cluster] || CLUSTER_H2S["cat-toys"];
      const faqs = CLUSTER_FAQS[cluster] || CLUSTER_FAQS["cat-toys"];

      // Get internal link targets from existing guides in same cluster
      const { data: clusterGuides } = await supabase
        .from("published_guides")
        .select("slug")
        .eq("cluster", cluster)
        .neq("slug", slug)
        .limit(6);
      const internalLinkTargets = (clusterGuides || []).map((g: any) => g.slug);

      try {
        // Call the existing generate-gap-guide function logic inline
        const systemPrompt = `You are a senior pet care content strategist writing for GetPawsy.pet, an online pet supply e-commerce store serving US customers.
STRICT RULES:
- Write for US pet parents. American English.
- NEVER make veterinary or medical claims.
- No fluff. Every sentence must be useful.
- Write in experienced, practical tone.
- Target 2,000-2,500 words total.
- Include specific details: measurements, weights, materials, prices.
- Internal links use markdown: [anchor text](/guides/slug/)
- No external links.

OUTPUT FORMAT: Return valid JSON:
{
  "slug": "string",
  "title": "string (H1, include year 2026)",
  "excerpt": "string (150 chars max)",
  "quickAnswer": "string (40-60 words)",
  "category": "string",
  "keywords": ["5-7 keywords"],
  "publishedAt": "${new Date().toISOString().split("T")[0]}",
  "updatedAt": "${new Date().toISOString().split("T")[0]}",
  "featuredImage": "/images/guides/placeholder.jpg",
  "readingTime": number,
  "relatedCategories": ["category-slug"],
  "whoThisIsFor": ["3-4 bullet points"],
  "sections": [{ "heading": "H2 title", "content": "300-500 word section" }],
  "comparisonProducts": [{ "name": "string", "price": "$XX", "description": "string", "advantages": ["3"], "link": "/products?category=x", "badge": "Best Overall|Budget Pick|Premium", "availability": "InStock" }],
  "buyingCriteria": { "title": "What to Look For", "criteria": [{ "name": "string", "description": "string" }] },
  "prosAndCons": { "pros": ["4-5"], "cons": ["3-4"] },
  "commonMistakes": [{ "mistake": "string", "whyItMatters": "string" }],
  "faq": [{ "question": "string", "answer": "2-3 sentence answer" }]
}`;

        const clusterMap: Record<string, string> = {
          "cat-toys": "Cat Toys", "cat-litter": "Cat Litter", "cat-trees": "Cat Trees",
          "dog-training": "Dog Training", "dog-travel": "Dog Travel", "dog-grooming": "Dog Grooming",
        };
        const category = clusterMap[cluster] || "Pet Care";

        const userPrompt = `Generate a comprehensive SEO guide for: "${keyword}"
Slug: ${slug}
H1: ${h1}
Required H2 sections:
${h2s.map((h: string, i: number) => `${i + 1}. ${h}`).join("\n")}
Required FAQ questions:
${faqs.map((f: string, i: number) => `${i + 1}. ${f}`).join("\n")}
Category: ${category}
Internal links to include:
${internalLinkTargets.map((t: string) => `- [relevant anchor](/guides/${t}/)`).join("\n")}
Remember: 2,000-2,500 words. Practical tone. No medical claims. US audience.`;

        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
            temperature: 0.7,
            max_tokens: 8000,
          }),
        });

        if (!aiResponse.ok) {
          if (aiResponse.status === 429) {
            errors.push(`${keyword}: Rate limited`);
            break; // Stop generating on rate limit
          }
          if (aiResponse.status === 402) {
            errors.push(`${keyword}: Credits exhausted`);
            break;
          }
          errors.push(`${keyword}: AI error ${aiResponse.status}`);
          continue;
        }

        const aiResult = await aiResponse.json();
        const rawContent = aiResult.choices?.[0]?.message?.content || "";

        let guideJson: any;
        try {
          const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
          const jsonStr = jsonMatch ? jsonMatch[1].trim() : rawContent.trim();
          guideJson = JSON.parse(jsonStr);
        } catch {
          errors.push(`${keyword}: Invalid JSON from AI`);
          continue;
        }

        // Ensure required fields
        guideJson.slug = slug;
        guideJson.publishedAt = new Date().toISOString().split("T")[0];
        guideJson.updatedAt = guideJson.publishedAt;
        if (!guideJson.readingTime) guideJson.readingTime = 12;
        if (!guideJson.featuredImage) guideJson.featuredImage = "/images/guides/placeholder.jpg";

        // Count links
        const contentStr = JSON.stringify(guideJson.sections || []);
        const internalLinksCount = (contentStr.match(/\/guides\//g) || []).length;
        const productsLinked = (guideJson.comparisonProducts?.length || 0);

        // Store in database
        const { error: insertError } = await supabase.from("published_guides").upsert({
          slug,
          title: guideJson.title || h1,
          excerpt: guideJson.excerpt || "",
          category: category,
          keywords: guideJson.keywords || [keyword],
          published_at: new Date().toISOString(),
          featured_image: guideJson.featuredImage,
          reading_time: guideJson.readingTime,
          related_categories: guideJson.relatedCategories || [cluster],
          guide_data: guideJson,
          cluster,
          is_published: true,
          internal_links_count: internalLinksCount,
          products_linked: productsLinked,
          generation_source: "auto",
        }, { onConflict: "slug" });

        if (insertError) {
          errors.push(`${keyword}: DB insert error: ${insertError.message}`);
          continue;
        }

        guidesGenerated++;
        results.push({ slug, title: guideJson.title, cluster, internalLinksCount, productsLinked });

        // Delay between generations
        await new Promise((r) => setTimeout(r, 3000));
      } catch (err) {
        errors.push(`${keyword}: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    // Log the run
    await supabase.from("guide_generation_log").insert({
      guides_generated: guidesGenerated,
      guides_failed: errors.length,
      keywords_processed: toGenerate.map((t) => t.keyword),
      errors: errors,
      duration_ms: Date.now() - startTime,
      triggered_by: body.triggered_by || "api",
    });

    // Request Google Indexing API + IndexNow for new guides
    if (guidesGenerated > 0) {
      for (const result of results) {
        try {
          await fetch(`${supabaseUrl}/functions/v1/request-indexing`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slug: result.slug }),
          });
        } catch { /* best effort */ }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      guidesGenerated,
      guidesFailed: errors.length,
      totalMissing: missingKeywords.length,
      remainingAfterRun: missingKeywords.length - guidesGenerated,
      results,
      errors: errors.length > 0 ? errors : undefined,
      durationMs: Date.now() - startTime,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("auto-publish-guides error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
