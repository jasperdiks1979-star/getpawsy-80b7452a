import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// All cornerstone pages with their metadata
const CORNERSTONES = [
  {
    slug: "best-cat-tree-2026",
    title: "Best Cat Trees (2026) – 12 Tested Picks for Every Cat Size & Home",
    primaryKW: "best cat tree",
    cluster: "cat-furniture",
    category: "Cat Furniture",
    h2s: [
      "Why Every Cat Needs a Quality Cat Tree",
      "Types of Cat Trees Compared",
      "Our Top 12 Tested Cat Trees for 2026",
      "Best Cat Trees by Category",
      "Cat Tree Buying Guide: What to Look For",
      "How to Choose the Right Size Cat Tree",
      "Common Mistakes When Buying a Cat Tree",
    ],
    faqs: [
      "What is the best cat tree for large cats?",
      "How tall should a cat tree be?",
      "Are expensive cat trees worth it?",
      "Where should I put a cat tree in my house?",
      "How do I get my cat to use a new cat tree?",
    ],
    linkedGuides: ["best-cat-trees-small-apartments", "best-cat-tree-maine-coon", "best-cat-scratching-post", "best-floor-to-ceiling-cat-tree", "best-cat-tree-for-2-cats"],
  },
  {
    slug: "best-cat-litter-box-2026",
    title: "Best Cat Litter Box (2026) – 12 Tested Picks for Odor Control, Large & Multi-Cat Homes",
    primaryKW: "best cat litter box",
    cluster: "cat-litter",
    category: "Cat Litter",
    h2s: [
      "Why the Right Litter Box Matters More Than Litter",
      "Types of Cat Litter Boxes Compared",
      "Our Top 12 Tested Litter Boxes for 2026",
      "Best Litter Boxes by Category",
      "Litter Box Buying Guide: What to Consider",
      "How to Set Up a Litter Box for Success",
      "Common Litter Box Mistakes to Avoid",
    ],
    faqs: [
      "What is the best cat litter box for odor control?",
      "How often should you clean a litter box?",
      "How many litter boxes do I need for one cat?",
      "Is a covered or open litter box better?",
      "What size litter box do I need for my cat?",
    ],
    linkedGuides: ["how-many-litter-boxes-per-cat", "best-litter-boxes-multi-cat", "best-self-cleaning-litter-box-2026", "best-litter-box-odor-control", "best-covered-litter-box"],
  },
  {
    slug: "best-orthopedic-dog-bed-2026",
    title: "Best Orthopedic Dog Beds (2026) – Vet-Approved Picks for Joint Support",
    primaryKW: "best orthopedic dog bed",
    cluster: "dog-beds",
    category: "Dog Beds",
    h2s: [
      "Why Orthopedic Dog Beds Matter for Joint Health",
      "Memory Foam vs Standard Foam: What's the Difference",
      "Our Top 10 Tested Orthopedic Dog Beds for 2026",
      "Best Orthopedic Beds by Dog Size",
      "Orthopedic Dog Bed Buying Guide",
      "Signs Your Dog Needs an Orthopedic Bed",
      "Common Mistakes When Choosing an Orthopedic Dog Bed",
    ],
    faqs: [
      "What size dog bed should I buy?",
      "Are orthopedic dog beds worth the extra cost?",
      "What's the best dog bed for arthritis?",
      "How thick should an orthopedic dog bed be?",
      "Can puppies use orthopedic dog beds?",
    ],
    linkedGuides: ["best-dog-bed-2026", "best-orthopedic-dog-bed", "best-dog-bed-senior-dogs", "best-dog-bed-for-hip-dysplasia", "memory-foam-vs-bolster-dog-bed"],
  },
  {
    slug: "best-automatic-cat-toy-2026",
    title: "Best Automatic Cat Toys (2026) – Self-Playing Picks Tested & Ranked",
    primaryKW: "best automatic cat toy",
    cluster: "cat-enrichment",
    category: "Cat Toys",
    h2s: [
      "Why Automatic Cat Toys Are Essential for Indoor Cats",
      "Types of Automatic Cat Toys Compared",
      "Our Top 10 Tested Automatic Cat Toys for 2026",
      "Best Automatic Toys by Play Style",
      "Buying Guide: What to Look For in an Automatic Cat Toy",
      "How to Introduce an Automatic Toy to Your Cat",
      "Safety Tips and Common Mistakes",
    ],
    faqs: [
      "Are automatic cat toys safe to leave unattended?",
      "How long should a cat play with an automatic toy?",
      "What is the best automatic cat toy for lazy cats?",
      "Do automatic cat toys help with anxiety?",
      "How do I choose between laser and feather toys?",
    ],
    linkedGuides: ["best-interactive-cat-toys-that-work", "best-cat-enrichment-ideas-indoor-cats-2026"],
  },
  {
    slug: "best-pet-carrier-for-travel",
    title: "Best Pet Carriers for Travel (2026) – Airline Approved & Road Trip Picks",
    primaryKW: "best pet carrier for travel",
    cluster: "dog-travel",
    category: "Pet Travel",
    h2s: [
      "Why Choosing the Right Pet Carrier Matters",
      "Types of Pet Carriers: Soft, Hard & Backpack",
      "Our Top 10 Tested Travel Carriers for 2026",
      "Best Carriers by Travel Type",
      "Airline Pet Carrier Requirements Explained",
      "Pet Carrier Buying Guide: Size, Material & Features",
      "Common Travel Carrier Mistakes to Avoid",
    ],
    faqs: [
      "What size pet carrier do I need for airplane travel?",
      "Are soft or hard pet carriers better for flying?",
      "How do I get my cat used to a carrier?",
      "Can I bring a pet carrier as a carry-on?",
      "What is the best carrier for long car trips?",
    ],
    linkedGuides: ["dog-travel-safety-guide", "best-dog-car-seat", "best-cat-carrier-2026", "best-cat-backpack-carrier"],
  },
  {
    slug: "best-dog-leash-training-guide",
    title: "Best Dog Leash Training Guide (2026) – Stop Pulling in 7 Days",
    primaryKW: "dog leash training",
    cluster: "dog-training",
    category: "Dog Training",
    h2s: [
      "Why Leash Training Is the Foundation of Good Behavior",
      "Understanding Why Dogs Pull on the Leash",
      "Step-by-Step Leash Training Method",
      "Best Tools for Leash Training",
      "Leash Training by Dog Age and Breed",
      "Common Leash Training Mistakes",
      "When to Seek Professional Help",
    ],
    faqs: [
      "How long does it take to leash train a dog?",
      "Should I use a harness or collar for leash training?",
      "What is the best leash for a dog that pulls?",
      "Can you leash train an older dog?",
      "How do I stop my dog from pulling on walks?",
    ],
    linkedGuides: ["complete-dog-training-guide-2026", "best-no-pull-dog-harness-2026", "best-dog-training-leash-for-pullers"],
  },
  {
    slug: "best-cat-scratching-post",
    title: "Best Cat Scratching Posts (2026) – Tested for Durability & Cats That Shred",
    primaryKW: "best cat scratching post",
    cluster: "cat-furniture",
    category: "Cat Furniture",
    h2s: [
      "Why Scratching Posts Are Non-Negotiable for Cat Owners",
      "Types of Cat Scratching Posts Compared",
      "Our Top 10 Tested Scratching Posts for 2026",
      "Best Scratching Posts by Cat Behavior",
      "Scratching Post Buying Guide",
      "How to Stop Your Cat Scratching Furniture",
      "Common Mistakes When Choosing a Scratching Post",
    ],
    faqs: [
      "What material is best for a cat scratching post?",
      "How tall should a cat scratching post be?",
      "How do I get my cat to use a scratching post?",
      "How often should you replace a scratching post?",
      "Is sisal or cardboard better for cats?",
    ],
    linkedGuides: ["best-cat-trees-small-apartments", "best-cat-tree-2026", "why-does-my-cat-scratch-furniture", "best-sisal-cat-scratcher"],
  },
  {
    slug: "best-pet-stroller-guide",
    title: "Best Pet Strollers (2026) – For Dogs, Cats & Multi-Pet Families",
    primaryKW: "best pet stroller",
    cluster: "dog-travel",
    category: "Pet Travel",
    h2s: [
      "Why More Pet Parents Are Using Pet Strollers",
      "Types of Pet Strollers Compared",
      "Our Top 10 Tested Pet Strollers for 2026",
      "Best Pet Strollers by Use Case",
      "Pet Stroller Buying Guide: Weight, Wheels & Fold",
      "How to Train Your Pet to Ride in a Stroller",
      "Common Pet Stroller Mistakes to Avoid",
    ],
    faqs: [
      "Are pet strollers good for dogs?",
      "What size pet stroller do I need?",
      "Can I use a pet stroller for jogging?",
      "Are pet strollers allowed in stores?",
      "What's the best stroller for multiple pets?",
    ],
    linkedGuides: ["best-pet-carrier-for-travel", "dog-travel-safety-guide", "best-dog-car-seat"],
  },
];

// Cluster guide definitions for batch generation
const CLUSTER_GUIDES = [
  // Cat litter cluster
  { slug: "how-to-clean-cat-litter-box", title: "How to Clean a Cat Litter Box – Step-by-Step Deep Clean Guide", primaryKW: "how to clean cat litter box", cluster: "cat-litter", category: "Cat Litter", linkedGuides: ["best-cat-litter-box-2026", "how-often-change-cat-litter"] },
  { slug: "low-tracking-litter-box-guide", title: "Best Low-Tracking Litter Boxes (2026) – No More Mess", primaryKW: "low tracking litter box", cluster: "cat-litter", category: "Cat Litter", linkedGuides: ["best-cat-litter-box-2026", "how-to-stop-litter-tracking"] },
  { slug: "best-litter-for-odor-control", title: "Best Cat Litter for Odor Control (2026) – Tested for Real Homes", primaryKW: "best cat litter for odor control", cluster: "cat-litter", category: "Cat Litter", linkedGuides: ["best-cat-litter-box-2026", "best-litter-box-odor-control"] },
  { slug: "automatic-vs-manual-litter-box", title: "Automatic vs Manual Litter Box – Which Is Worth It?", primaryKW: "automatic vs manual litter box", cluster: "cat-litter", category: "Cat Litter", linkedGuides: ["best-self-cleaning-litter-box-2026", "best-cat-litter-box-2026"] },
  { slug: "litter-box-for-small-apartment", title: "Best Litter Box Solutions for Small Apartments (2026)", primaryKW: "litter box for small apartment", cluster: "cat-litter", category: "Cat Litter", linkedGuides: ["best-litter-box-for-small-apartment", "best-cat-litter-box-2026"] },
  // Dog bed cluster
  { slug: "orthopedic-dog-bed-benefits", title: "Orthopedic Dog Bed Benefits – Why Your Dog Needs One", primaryKW: "orthopedic dog bed benefits", cluster: "dog-beds", category: "Dog Beds", linkedGuides: ["best-orthopedic-dog-bed-2026", "best-dog-bed-2026"] },
  { slug: "memory-foam-dog-bed-guide", title: "Memory Foam Dog Beds – Complete Buying Guide (2026)", primaryKW: "memory foam dog bed guide", cluster: "dog-beds", category: "Dog Beds", linkedGuides: ["best-orthopedic-dog-bed-2026", "best-dog-bed-2026"] },
  { slug: "best-dog-bed-for-large-dogs", title: "Best Dog Beds for Large Dogs (2026) – XL & XXL Picks", primaryKW: "best dog bed for large dogs", cluster: "dog-beds", category: "Dog Beds", linkedGuides: ["best-orthopedic-dog-bed-2026", "best-dog-bed-2026"] },
  { slug: "waterproof-dog-bed-guide", title: "Waterproof Dog Beds – Complete Guide for Puppies & Seniors", primaryKW: "waterproof dog bed guide", cluster: "dog-beds", category: "Dog Beds", linkedGuides: ["best-waterproof-dog-bed", "best-orthopedic-dog-bed-2026"] },
  { slug: "dog-bed-size-chart", title: "Dog Bed Size Chart – Find the Perfect Fit by Breed & Weight", primaryKW: "dog bed size chart", cluster: "dog-beds", category: "Dog Beds", linkedGuides: ["dog-bed-size-guide", "best-dog-bed-2026"] },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || "list"; // list | generate | generate-cluster | status
    const slug = body.slug;
    const batchSize = body.batchSize || 1;

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonRes({ ok: false, reason: "Unauthorized" }, 401);
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: userData } = await supabase.auth.getUser(token);
    if (!userData?.user) return jsonRes({ ok: false, reason: "Invalid session" }, 401);

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleData) return jsonRes({ ok: false, reason: "Admin access required" }, 403);

    if (action === "list") {
      // Return all cornerstones and their publication status
      const slugs = [...CORNERSTONES.map(c => c.slug), ...CLUSTER_GUIDES.map(c => c.slug)];
      const { data: existing } = await supabase
        .from("published_guides")
        .select("slug, is_published, published_at, updated_at")
        .in("slug", slugs);

      const existingMap = new Map((existing || []).map(e => [e.slug, e]));

      return jsonRes({
        ok: true,
        cornerstones: CORNERSTONES.map(c => ({
          ...c,
          status: existingMap.has(c.slug) ? "published" : "pending",
          publishedAt: existingMap.get(c.slug)?.published_at,
        })),
        clusterGuides: CLUSTER_GUIDES.map(c => ({
          slug: c.slug,
          title: c.title,
          cluster: c.cluster,
          status: existingMap.has(c.slug) ? "published" : "pending",
          publishedAt: existingMap.get(c.slug)?.published_at,
        })),
      });
    }

    if (action === "generate" || action === "generate-cluster") {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

      const targets = action === "generate"
        ? (slug ? CORNERSTONES.filter(c => c.slug === slug) : CORNERSTONES.slice(0, batchSize))
        : (slug ? CLUSTER_GUIDES.filter(c => c.slug === slug) : CLUSTER_GUIDES.slice(0, batchSize));

      if (targets.length === 0) return jsonRes({ ok: false, reason: "No matching guides found" });

      const results: Array<{ slug: string; success: boolean; error?: string }> = [];

      for (const target of targets) {
        try {
          // Check if already exists
          const { data: existing } = await supabase
            .from("published_guides")
            .select("slug")
            .eq("slug", target.slug)
            .maybeSingle();

          if (existing) {
            results.push({ slug: target.slug, success: true, error: "Already exists" });
            continue;
          }

          const isCornerstone = "h2s" in target;
          const wordTarget = isCornerstone ? "2,500-3,000" : "1,000-1,500";

          const systemPrompt = `You are a senior pet care content strategist writing for GetPawsy.pet, a premium pet supply e-commerce store serving US customers.

STRICT RULES:
- Write for US pet parents. Use American English.
- NEVER make veterinary or medical claims.
- No fluff, no generic filler. Every sentence must deliver value.
- Write in an experienced, practical tone — you've hands-on tested these products.
- Target ${wordTarget} words total across all sections.
- Include specific details: measurements, weights, materials, price ranges.
- Internal links use markdown: [anchor text](/guides/slug/)
- Product links use: [product name](/products?category=relevant-category)
- No external links. No affiliate disclaimers.
${isCornerstone ? "- This is a CORNERSTONE page — it must be the definitive resource on this topic." : "- This is a CLUSTER SUPPORT page — it should link back to the cornerstone and provide focused depth."}

OUTPUT FORMAT: Return valid JSON:
{
  "slug": "${target.slug}",
  "title": "${target.title}",
  "excerpt": "150 chars max, compelling meta description",
  "seoTitle": "Title Tag optimized for CTR – include year, benefit, brand",
  "seoDescription": "155 char meta description with primary keyword and benefit",
  "quickAnswer": "40-60 words, featured snippet optimized",
  "category": "${target.category}",
  "keywords": ["5-8 primary and secondary keywords"],
  "publishedAt": "${new Date().toISOString().split("T")[0]}",
  "updatedAt": "${new Date().toISOString().split("T")[0]}",
  "featuredImage": "/og-image.png",
  "readingTime": ${isCornerstone ? 15 : 8},
  "relatedCategories": ["category-slug-1", "category-slug-2"],
  "whoThisIsFor": ["4 bullet points describing target audience"],
  "sections": [
    { "heading": "H2 title", "content": "${isCornerstone ? "400-600" : "200-400"} word section with **bold** key points, bullet lists, and [internal links](/guides/slug/)" }
  ],
  "comparisonProducts": [
    { "name": "Product Name", "price": "$XX.XX", "description": "One compelling sentence", "advantages": ["3-4 advantages"], "link": "/products?category=relevant", "badge": "Best Overall|Budget Pick|Premium|Editor's Choice", "availability": "InStock" }
  ],
  "buyingCriteria": {
    "title": "What to Look For When Buying",
    "criteria": [{ "name": "Criterion Name", "description": "Why it matters and what to check" }]
  },
  "prosAndCons": { "pros": ["5 pros"], "cons": ["3-4 cons"] },
  "commonMistakes": [
    { "mistake": "Mistake title", "whyItMatters": "2-3 sentence explanation" }
  ],
  "faq": [
    { "question": "Specific FAQ question with keyword", "answer": "3-4 sentence thorough answer" }
  ]
}`;

          const linkedGuidesStr = (target.linkedGuides || [])
            .map((g: string) => `- [relevant anchor](/guides/${g}/)`)
            .join("\n");

          const h2sStr = isCornerstone && "h2s" in target
            ? (target as any).h2s.map((h: string, i: number) => `${i + 1}. ${h}`).join("\n")
            : `1. Why ${target.primaryKW} Matters\n2. Types & Options Compared\n3. Best Products for This Use Case\n4. Buying Guide\n5. Common Mistakes to Avoid`;

          const faqsStr = isCornerstone && "faqs" in target
            ? (target as any).faqs.map((f: string, i: number) => `${i + 1}. ${f}`).join("\n")
            : `1. What is the best ${target.primaryKW}?\n2. How do I choose the right ${target.primaryKW}?\n3. Is it worth spending more on ${target.primaryKW}?`;

          const userPrompt = `Generate a comprehensive, ${isCornerstone ? "cornerstone" : "supporting cluster"} SEO guide for: "${target.primaryKW}"

Title: ${target.title}
Slug: ${target.slug}
Category: ${target.category}

Required H2 sections (expand each to ${isCornerstone ? "400-600" : "200-400"} words):
${h2sStr}

Required FAQ questions (write 3-4 sentence answers each):
${faqsStr}

Internal links to weave naturally into content:
${linkedGuidesStr}

Include 5-8 comparison products with realistic prices. Use [product name](/products?category=${target.category.toLowerCase().replace(/\s+/g, "-")}) format.

Remember: ${wordTarget} words total. Practical, tested tone. No medical claims. US audience. Include comparison tables where relevant.`;

          const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
              ],
              temperature: 0.7,
              max_tokens: 12000,
            }),
          });

          if (!aiResponse.ok) {
            const status = aiResponse.status;
            if (status === 429) { results.push({ slug: target.slug, success: false, error: "Rate limited – try again later" }); continue; }
            if (status === 402) { results.push({ slug: target.slug, success: false, error: "Credits exhausted" }); continue; }
            throw new Error(`AI gateway error: ${status}`);
          }

          const aiResult = await aiResponse.json();
          const rawContent = aiResult.choices?.[0]?.message?.content || "";

          let guideJson: any;
          try {
            const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
            const jsonStr = jsonMatch ? jsonMatch[1].trim() : rawContent.trim();
            guideJson = JSON.parse(jsonStr);
          } catch {
            results.push({ slug: target.slug, success: false, error: "AI returned invalid JSON" });
            continue;
          }

          // Ensure required fields
          guideJson.slug = target.slug;
          guideJson.publishedAt = new Date().toISOString().split("T")[0];
          guideJson.updatedAt = guideJson.publishedAt;
          if (!guideJson.readingTime) guideJson.readingTime = isCornerstone ? 15 : 8;
          if (!guideJson.featuredImage) guideJson.featuredImage = "/og-image.png";

          // Insert into published_guides
          const { error: insertError } = await supabase.from("published_guides").insert({
            slug: target.slug,
            title: guideJson.title || target.title,
            excerpt: guideJson.excerpt || "",
            category: target.category,
            cluster: target.cluster,
            keywords: guideJson.keywords || [],
            featured_image: guideJson.featuredImage,
            reading_time: guideJson.readingTime,
            related_categories: guideJson.relatedCategories || [],
            guide_data: guideJson,
            is_published: true,
            published_at: new Date().toISOString(),
            generation_source: isCornerstone ? "cornerstone-engine" : "cluster-engine",
            internal_links_count: (target.linkedGuides || []).length,
            products_linked: (guideJson.comparisonProducts || []).length,
          });

          if (insertError) {
            results.push({ slug: target.slug, success: false, error: insertError.message });
          } else {
            results.push({ slug: target.slug, success: true });

            // Ping IndexNow for the new page
            try {
              await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/indexnow-ping`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ guideSlug: target.slug }),
              });
            } catch { /* non-critical */ }
          }

          // Rate limit: wait 2s between AI calls
          if (targets.indexOf(target) < targets.length - 1) {
            await new Promise(r => setTimeout(r, 2000));
          }
        } catch (err) {
          results.push({ slug: target.slug, success: false, error: err instanceof Error ? err.message : "Unknown error" });
        }
      }

      const succeeded = results.filter(r => r.success).length;
      return jsonRes({
        ok: true,
        generated: succeeded,
        failed: results.length - succeeded,
        results,
      });
    }

    if (action === "status") {
      const allSlugs = [...CORNERSTONES.map(c => c.slug), ...CLUSTER_GUIDES.map(c => c.slug)];
      const { data: published } = await supabase
        .from("published_guides")
        .select("slug, is_published, published_at, internal_links_count, products_linked")
        .in("slug", allSlugs);

      const publishedSlugs = new Set((published || []).map(p => p.slug));
      const cornerstonesDone = CORNERSTONES.filter(c => publishedSlugs.has(c.slug)).length;
      const clustersDone = CLUSTER_GUIDES.filter(c => publishedSlugs.has(c.slug)).length;

      return jsonRes({
        ok: true,
        totalCornerstones: CORNERSTONES.length,
        cornerstonesPublished: cornerstonesDone,
        totalClusterGuides: CLUSTER_GUIDES.length,
        clusterGuidesPublished: clustersDone,
        totalInternalLinks: (published || []).reduce((sum, p) => sum + (p.internal_links_count || 0), 0),
        totalProductsLinked: (published || []).reduce((sum, p) => sum + (p.products_linked || 0), 0),
        overallProgress: `${cornerstonesDone + clustersDone}/${CORNERSTONES.length + CLUSTER_GUIDES.length}`,
      });
    }

    return jsonRes({ ok: false, reason: "Unknown action" });
  } catch (err) {
    console.error("generate-cornerstone error:", err);
    return jsonRes({ ok: false, reason: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});

function jsonRes(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
