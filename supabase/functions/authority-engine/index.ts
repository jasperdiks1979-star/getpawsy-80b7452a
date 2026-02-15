import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getSupabase(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
}

function getServiceSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function callAI(messages: any[], stream = false) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages,
      stream: false,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("AI error:", res.status, text);
    if (res.status === 429) throw new Error("Rate limited - try again later");
    if (res.status === 402) throw new Error("AI credits exhausted");
    throw new Error(`AI error: ${res.status}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// =================== TOPICAL MAP ===================
async function generateTopicalMap(niche: string): Promise<any> {
  const prompt = `You are an expert SEO content strategist specializing in US pet product niches.

Generate a comprehensive topical map for the niche: "${niche}"

Return a valid JSON object with this exact structure:
{
  "cornerstone": {
    "title": "Best [Niche] in 2026: Complete Buyer's Guide",
    "slug": "best-[niche-slug]-2026",
    "primaryKeyword": "[main keyword]",
    "secondaryKeywords": ["kw1", "kw2", "kw3"],
    "searchIntent": "commercial",
    "wordCountTarget": 5000,
    "role": "cornerstone"
  },
  "subtopics": [
    {
      "title": "...",
      "slug": "...",
      "primaryKeyword": "...",
      "secondaryKeywords": ["..."],
      "searchIntent": "informational|commercial",
      "wordCountTarget": 2000,
      "role": "support|micro",
      "angle": "unique angle description"
    }
  ]
}

Rules:
- Generate exactly 30 subtopics
- Mix of informational (60%) and commercial (40%) intent
- Each subtopic must have a UNIQUE angle (breed-specific, budget, comparison, how-to, seasonal, etc.)
- Slugs must be URL-safe, lowercase, hyphenated, max 60 chars
- Primary keywords must be US-centric search queries
- Include 3-5 secondary keywords per topic
- Role: "support" for main cluster guides, "micro" for long-tail specific guides
- Word count: support = 1500-2500, micro = 1000-1500
- NO duplicate angles or overlapping topics

Return ONLY valid JSON, no markdown formatting.`;

  const result = await callAI([
    { role: "system", content: "You are a JSON-only response bot. Return only valid JSON." },
    { role: "user", content: prompt },
  ]);

  // Parse JSON from response
  const cleaned = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleaned);
}

// =================== CONTENT BRIEF ===================
async function generateContentBrief(article: any, cornerstoneSlug: string, clusterArticles: any[]): Promise<any> {
  const relatedSlugs = clusterArticles
    .filter((a: any) => a.slug !== article.slug && a.slug !== cornerstoneSlug)
    .slice(0, 5)
    .map((a: any) => ({ slug: a.slug, title: a.title }));

  const prompt = `Generate a detailed content brief for an SEO-optimized article.

Topic: ${article.title}
Primary Keyword: ${article.primary_keyword}
Secondary Keywords: ${(article.secondary_keywords || []).join(", ")}
Search Intent: ${article.search_intent}
Target Word Count: ${article.article_role === "cornerstone" ? "4000-6000" : "1500-2500"}
Article Role: ${article.article_role}

Cornerstone article slug: ${cornerstoneSlug}
Related articles for internal linking: ${JSON.stringify(relatedSlugs)}

Return valid JSON:
{
  "seoTitle": "max 60 chars, include year 2026 and primary keyword",
  "metaDescription": "max 155 chars, compelling with CTA",
  "outline": [
    {"type": "h2", "text": "...", "notes": "..."},
    {"type": "h3", "text": "...", "notes": "..."}
  ],
  "faqTopics": ["question 1", "question 2", "...at least 10"],
  "keyTakeaways": ["takeaway 1", "takeaway 2", "...5-7 items"],
  "internalLinks": [
    {"targetSlug": "${cornerstoneSlug}", "anchorText": "...", "context": "link to cornerstone"},
    {"targetSlug": "...", "anchorText": "...", "context": "related guide"},
    {"targetSlug": "...", "anchorText": "...", "context": "related guide"}
  ],
  "uniqueAngle": "What makes this article different from others in the cluster",
  "targetAudience": "Who this article is for"
}

Return ONLY valid JSON.`;

  const result = await callAI([
    { role: "system", content: "You are a JSON-only response bot. Return only valid JSON." },
    { role: "user", content: prompt },
  ]);

  const cleaned = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleaned);
}

// =================== DRAFT ARTICLE ===================
async function draftArticle(article: any, brief: any): Promise<any> {
  const wordTarget = article.article_role === "cornerstone" ? "4000-6000" : "1500-2500";

  const prompt = `Write a complete, SEO-optimized article for a US pet product review website (GetPawsy.pet).

Title: ${article.title}
Primary Keyword: ${article.primary_keyword}
Secondary Keywords: ${(article.secondary_keywords || []).join(", ")}
Target Word Count: ${wordTarget}
Search Intent: ${article.search_intent}

Outline to follow:
${JSON.stringify(brief.outline, null, 2)}

FAQ Topics to answer (at least 10):
${JSON.stringify(brief.faqTopics, null, 2)}

Key Takeaways to include:
${JSON.stringify(brief.keyTakeaways, null, 2)}

Internal Links to weave in naturally:
${JSON.stringify(brief.internalLinks, null, 2)}

WRITING RULES:
- Expert, vet-informed tone without making medical claims
- Use practical, hands-on language (tested, reviewed, compared)
- Include specific examples and use cases
- NO fake statistics or unverifiable claims
- NO urgency/scarcity language
- Each H2 section should be 150-300 words
- FAQ answers: 1-3 sentences each, concise and helpful
- Include the primary keyword in H1, first H2, and first 120 words
- Write for US pet parents
- Use markdown formatting (## for H2, ### for H3)

Return valid JSON:
{
  "content": "full article in markdown",
  "seoTitle": "max 60 chars",
  "metaDescription": "max 155 chars",
  "faq": [{"question": "...", "answer": "..."}],
  "keyTakeaways": ["..."],
  "wordCount": approximate_number,
  "internalLinks": [{"targetSlug": "...", "anchorText": "...", "placement": "section where link appears"}]
}

Return ONLY valid JSON.`;

  const result = await callAI([
    { role: "system", content: "You are a JSON-only response bot. Return only valid JSON. Write comprehensive, helpful content." },
    { role: "user", content: prompt },
  ]);

  const cleaned = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleaned);
}

// =================== MAIN HANDLER ===================
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabase = getSupabase(authHeader);
    const serviceSupabase = getServiceSupabase();

    // Verify admin
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: hasAdmin } = await serviceSupabase.rpc("has_role", {
      _user_id: user.id, _role: "admin",
    });
    if (!hasAdmin) {
      return new Response(JSON.stringify({ error: "Admin required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, clusterId, articleId, niche } = body;

    // ---- GENERATE TOPICAL MAP ----
    if (action === "generate-topical-map") {
      const nicheText = niche || "Cat Litter Box + Odor Control";
      console.log(`[AuthorityEngine] Generating topical map for: ${nicheText}`);

      const topicalMap = await generateTopicalMap(nicheText);

      // Create cluster
      const { data: cluster, error: clusterErr } = await serviceSupabase
        .from("authority_clusters")
        .insert({
          niche: nicheText,
          cornerstone_slug: topicalMap.cornerstone.slug,
          cornerstone_title: topicalMap.cornerstone.title,
          topical_map: topicalMap,
          status: "draft",
          created_by: user.id,
        })
        .select()
        .single();

      if (clusterErr) throw clusterErr;

      // Create cornerstone article
      const articles = [
        {
          cluster_id: cluster.id,
          slug: topicalMap.cornerstone.slug,
          title: topicalMap.cornerstone.title,
          primary_keyword: topicalMap.cornerstone.primaryKeyword,
          secondary_keywords: topicalMap.cornerstone.secondaryKeywords,
          search_intent: topicalMap.cornerstone.searchIntent,
          article_role: "cornerstone",
          status: "planned",
          word_count: 0,
        },
        ...topicalMap.subtopics.map((s: any) => ({
          cluster_id: cluster.id,
          slug: s.slug,
          title: s.title,
          primary_keyword: s.primaryKeyword,
          secondary_keywords: s.secondaryKeywords,
          search_intent: s.searchIntent,
          article_role: s.role,
          status: "planned",
          word_count: 0,
        })),
      ];

      const { error: articlesErr } = await serviceSupabase
        .from("cluster_articles")
        .insert(articles);

      if (articlesErr) throw articlesErr;

      return new Response(JSON.stringify({
        success: true,
        clusterId: cluster.id,
        articlesCreated: articles.length,
        topicalMap,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- GENERATE CONTENT BRIEFS ----
    if (action === "generate-briefs") {
      if (!clusterId) throw new Error("clusterId required");

      const { data: cluster } = await serviceSupabase
        .from("authority_clusters")
        .select("*")
        .eq("id", clusterId)
        .single();

      if (!cluster) throw new Error("Cluster not found");

      const { data: articles } = await serviceSupabase
        .from("cluster_articles")
        .select("*")
        .eq("cluster_id", clusterId)
        .eq("status", "planned");

      if (!articles?.length) {
        return new Response(JSON.stringify({ success: true, message: "No planned articles to brief" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Process first 5 at a time to avoid rate limits
      const batch = articles.slice(0, 5);
      let processed = 0;

      for (const article of batch) {
        try {
          const brief = await generateContentBrief(article, cluster.cornerstone_slug, articles);

          await serviceSupabase
            .from("cluster_articles")
            .update({
              seo_title: brief.seoTitle,
              meta_description: brief.metaDescription,
              outline: brief,
              key_takeaways: brief.keyTakeaways || [],
              internal_links: brief.internalLinks || [],
              status: "brief",
            })
            .eq("id", article.id);

          processed++;
        } catch (e) {
          console.error(`Brief failed for ${article.slug}:`, e);
        }
      }

      return new Response(JSON.stringify({
        success: true,
        processed,
        remaining: articles.length - processed,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- DRAFT ARTICLES ----
    if (action === "draft-articles") {
      if (!clusterId) throw new Error("clusterId required");

      const { data: articles } = await serviceSupabase
        .from("cluster_articles")
        .select("*")
        .eq("cluster_id", clusterId)
        .eq("status", "brief");

      if (!articles?.length) {
        return new Response(JSON.stringify({ success: true, message: "No briefed articles to draft" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Draft 2 at a time (heavy AI call)
      const batch = articles.slice(0, 2);
      let processed = 0;

      for (const article of batch) {
        try {
          const draft = await draftArticle(article, article.outline || {});

          await serviceSupabase
            .from("cluster_articles")
            .update({
              content: draft.content,
              seo_title: draft.seoTitle || article.seo_title,
              meta_description: draft.metaDescription || article.meta_description,
              faq: draft.faq || [],
              key_takeaways: draft.keyTakeaways || article.key_takeaways,
              internal_links: draft.internalLinks || article.internal_links,
              word_count: draft.wordCount || 0,
              canonical_url: `https://getpawsy.pet/guides/${article.slug}`,
              status: "draft",
            })
            .eq("id", article.id);

          processed++;
        } catch (e) {
          console.error(`Draft failed for ${article.slug}:`, e);
        }
      }

      return new Response(JSON.stringify({
        success: true,
        processed,
        remaining: articles.length - processed,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- APPROVE ARTICLE ----
    if (action === "approve") {
      if (!articleId) throw new Error("articleId required");

      await serviceSupabase
        .from("cluster_articles")
        .update({
          approved: true,
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          status: "review",
        })
        .eq("id", articleId);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- PUBLISH ARTICLE (to guide JSON) ----
    if (action === "publish") {
      if (!articleId) throw new Error("articleId required");

      const { data: article } = await serviceSupabase
        .from("cluster_articles")
        .select("*")
        .eq("id", articleId)
        .single();

      if (!article) throw new Error("Article not found");
      if (!article.approved) throw new Error("Article must be approved first");

      // Mark as published
      await serviceSupabase
        .from("cluster_articles")
        .update({
          status: "published",
          publish_date: new Date().toISOString(),
        })
        .eq("id", articleId);

      return new Response(JSON.stringify({
        success: true,
        slug: article.slug,
        message: `Article "${article.title}" marked as published. Deploy guide JSON to complete.`,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("[AuthorityEngine] Error:", e);
    return new Response(JSON.stringify({
      error: e instanceof Error ? e.message : "Unknown error",
    }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
