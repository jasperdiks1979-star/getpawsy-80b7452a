import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ============= CLUSTER DEFINITIONS =============
interface ClusterTopic {
  vertical: string;
  topic: string;
  slug: string;
  primary_keyword: string;
  secondary_keywords: string[];
  hub_url: string;
  cornerstone_url: string;
  intent: 'commercial' | 'informational';
}

const MONEY_VERTICALS: ClusterTopic[] = [
  // DOG TRAINING
  { vertical: 'dog-training', topic: 'Leash Training', slug: 'leash-training-guide', primary_keyword: 'dog leash training', secondary_keywords: ['leash training puppy', 'stop dog pulling leash', 'loose leash walking'], hub_url: '/collections/dog-leash-control', cornerstone_url: '/guides/dog-leash-training', intent: 'informational' },
  { vertical: 'dog-training', topic: 'No Pull Harness', slug: 'best-no-pull-harness', primary_keyword: 'best no pull dog harness', secondary_keywords: ['no pull harness large dogs', 'anti pull harness', 'front clip harness'], hub_url: '/collections/dog-leash-control', cornerstone_url: '/guides/best-no-pull-harness', intent: 'commercial' },
  { vertical: 'dog-training', topic: 'Puppy Biting', slug: 'stop-puppy-biting', primary_keyword: 'how to stop puppy biting', secondary_keywords: ['puppy nipping', 'puppy bite inhibition', 'teething puppy toys'], hub_url: '/collections/puppy-essentials', cornerstone_url: '/guides/puppy-biting-guide', intent: 'informational' },
  { vertical: 'dog-training', topic: 'Crate Training', slug: 'crate-training-guide', primary_keyword: 'crate training puppy', secondary_keywords: ['crate training schedule', 'best dog crate', 'crate training at night'], hub_url: '/collections/puppy-essentials', cornerstone_url: '/guides/crate-training', intent: 'informational' },
  { vertical: 'dog-training', topic: 'Potty Training', slug: 'potty-training-complete', primary_keyword: 'dog potty training', secondary_keywords: ['potty training puppy', 'house training dog', 'potty training pads'], hub_url: '/collections/dog-potty-training', cornerstone_url: '/guides/potty-training-guide', intent: 'informational' },

  // DOG BED
  { vertical: 'dog-bed', topic: 'Orthopedic Dog Bed', slug: 'best-orthopedic-dog-bed', primary_keyword: 'best orthopedic dog bed', secondary_keywords: ['memory foam dog bed', 'orthopedic bed large dogs', 'dog bed joint support'], hub_url: '/collections/orthopedic-dog-beds', cornerstone_url: '/guides/orthopedic-dog-bed-guide', intent: 'commercial' },
  { vertical: 'dog-bed', topic: 'Cooling Dog Bed', slug: 'best-cooling-dog-bed', primary_keyword: 'best cooling dog bed', secondary_keywords: ['cooling mat dogs', 'summer dog bed', 'elevated cooling bed'], hub_url: '/collections/dog-beds', cornerstone_url: '/guides/cooling-dog-bed-guide', intent: 'commercial' },
  { vertical: 'dog-bed', topic: 'Anxiety Dog Bed', slug: 'best-anxiety-dog-bed', primary_keyword: 'best dog bed for anxiety', secondary_keywords: ['calming dog bed', 'anti anxiety dog bed', 'donut dog bed'], hub_url: '/collections/dog-beds', cornerstone_url: '/guides/anxiety-dog-bed-guide', intent: 'commercial' },
  { vertical: 'dog-bed', topic: 'Large Breed Dog Bed', slug: 'best-large-breed-dog-bed', primary_keyword: 'best dog bed for large breeds', secondary_keywords: ['xl dog bed', 'extra large dog bed', 'dog bed great dane'], hub_url: '/collections/dog-beds', cornerstone_url: '/guides/large-breed-dog-bed-guide', intent: 'commercial' },

  // CAT LITTER
  { vertical: 'cat-litter', topic: 'Self Cleaning Litter Box', slug: 'best-self-cleaning-litter-box', primary_keyword: 'best self cleaning litter box', secondary_keywords: ['automatic litter box', 'self cleaning litter box multi cat', 'robot litter box'], hub_url: '/collections/self-cleaning-litter-box', cornerstone_url: '/guides/self-cleaning-litter-box-guide', intent: 'commercial' },
  { vertical: 'cat-litter', topic: 'Litter Box Furniture', slug: 'best-litter-box-furniture', primary_keyword: 'litter box furniture', secondary_keywords: ['hidden litter box', 'litter box enclosure', 'cat litter cabinet'], hub_url: '/collections/cat-litter-box-furniture-guide', cornerstone_url: '/guides/litter-box-furniture-guide', intent: 'commercial' },
  { vertical: 'cat-litter', topic: 'Odor Control Litter', slug: 'best-odor-control-cat-litter', primary_keyword: 'best cat litter for odor control', secondary_keywords: ['odor free cat litter', 'best litter smell', 'crystal cat litter'], hub_url: '/collections/best-litter-box-for-odor-control', cornerstone_url: '/guides/odor-control-litter-guide', intent: 'commercial' },
  { vertical: 'cat-litter', topic: 'Small Apartment Litter Box', slug: 'best-litter-box-small-apartment', primary_keyword: 'best litter box for small apartment', secondary_keywords: ['compact litter box', 'small space litter box', 'top entry litter box'], hub_url: '/collections/best-cat-litter-boxes', cornerstone_url: '/guides/small-apartment-litter-box-guide', intent: 'commercial' },
];

// ============= ARTICLE GENERATOR =============
async function generateClusterArticle(
  topic: ClusterTopic,
  lovableApiKey: string,
): Promise<Record<string, unknown> | null> {
  const systemPrompt = `You are a senior pet care content strategist for GetPawsy.pet, a US-based pet supply e-commerce store. Write practical, helpful content for US pet parents. American English only. No medical claims. No fluff.

Return ONLY valid JSON matching the exact structure requested.`;

  const userPrompt = `Write a comprehensive cluster article for "${topic.primary_keyword}".

Vertical: ${topic.vertical}
Topic: ${topic.topic}
Primary keyword: ${topic.primary_keyword}
Secondary keywords: ${topic.secondary_keywords.join(', ')}
Hub URL: ${topic.hub_url}
Cornerstone URL: ${topic.cornerstone_url}
Intent: ${topic.intent}

Article requirements:
- 1200-1800 words total
- 6-10 internal links to getpawsy.pet pages
- 1 product push section recommending relevant products
- 1 link to hub: ${topic.hub_url}
- 1 link to cornerstone: ${topic.cornerstone_url}
- FAQ schema with 5 questions
- Comparison table where applicable
- Clear US intent throughout

Return this JSON structure:
{
  "title": "SEO title under 60 chars, include year 2026",
  "seo_title": "Title tag for <title>",
  "meta_description": "Under 160 chars, benefit-first, US shipping angle",
  "h1": "Main heading with primary keyword",
  "excerpt": "150 char compelling excerpt",
  "sections": [
    {"h2": "Section heading", "content": "300-400 word section with **bold** emphasis and [internal links](/path)"}
  ],
  "faqs": [
    {"question": "Question with keyword", "answer": "2-3 sentence helpful answer"}
  ],
  "comparison_table": {
    "title": "Comparison title",
    "headers": ["Feature", "Option A", "Option B", "Option C"],
    "rows": [["Feature name", "Detail A", "Detail B", "Detail C"]]
  },
  "product_push": {
    "heading": "Recommended Products",
    "products": [
      {"name": "Product Name", "description": "One sentence", "link": "/collections/relevant-slug", "badge": "Best Overall|Budget Pick|Premium"}
    ]
  },
  "internal_links": [
    {"url": "/collections/slug-or-guides/slug", "anchor": "anchor text"}
  ],
  "keywords": ["5-7 target keywords"],
  "word_count": 1400
}`;

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
        temperature: 0.7,
        max_tokens: 6000,
      }),
    });

    if (!resp.ok) {
      if (resp.status === 429) return null; // Rate limited
      console.error(`AI error: ${resp.status}`);
      return null;
    }

    const data = await resp.json();
    let raw = data.choices?.[0]?.message?.content || '';
    raw = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(raw);
  } catch (err) {
    console.error('Article generation error:', err);
    return null;
  }
}

// ============= MAIN HANDLER =============
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const body = await req.json().catch(() => ({}));
  const action = body.action || 'list_topics';

  try {
    // ============= ACTION: list_topics — Show available cluster topics =============
    if (action === 'list_topics') {
      const verticalFilter = body.vertical || null;
      const topics = verticalFilter
        ? MONEY_VERTICALS.filter(t => t.vertical === verticalFilter)
        : MONEY_VERTICALS;

      // Check which already have articles in DB
      const slugs = topics.map(t => t.slug);
      const { data: existing } = await supabase
        .from('cluster_articles')
        .select('slug, status, word_count')
        .in('slug', slugs);

      const existingMap = new Map((existing || []).map(e => [e.slug, e]));

      const enriched = topics.map(t => ({
        ...t,
        has_article: existingMap.has(t.slug),
        article_status: existingMap.get(t.slug)?.status || null,
        article_words: existingMap.get(t.slug)?.word_count || null,
      }));

      const byVertical: Record<string, typeof enriched> = {};
      for (const t of enriched) {
        if (!byVertical[t.vertical]) byVertical[t.vertical] = [];
        byVertical[t.vertical].push(t);
      }

      return json({
        ok: true,
        total_topics: topics.length,
        topics_with_articles: enriched.filter(t => t.has_article).length,
        topics_missing: enriched.filter(t => !t.has_article).length,
        by_vertical: byVertical,
        all_topics: enriched,
      });
    }

    // ============= ACTION: generate_batch — Generate articles for missing topics =============
    if (action === 'generate_batch') {
      const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
      if (!lovableApiKey) return json({ ok: false, error: 'LOVABLE_API_KEY not configured' }, 500);

      const verticalFilter = body.vertical || null;
      const batchSize = Math.min(body.batch_size || 3, 5); // Max 5 per batch

      // Find topics without articles
      const candidates = verticalFilter
        ? MONEY_VERTICALS.filter(t => t.vertical === verticalFilter)
        : MONEY_VERTICALS;

      const slugs = candidates.map(t => t.slug);
      const { data: existing } = await supabase
        .from('cluster_articles')
        .select('slug')
        .in('slug', slugs);

      const existingSlugs = new Set((existing || []).map(e => e.slug));
      const missing = candidates.filter(t => !existingSlugs.has(t.slug));

      if (missing.length === 0) {
        return json({ ok: true, message: 'All topics already have articles', generated: 0 });
      }

      const batch = missing.slice(0, batchSize);
      const results: Array<{ topic: string; slug: string; success: boolean; error?: string }> = [];

      // Get or create a default cluster
      const { data: defaultCluster } = await supabase
        .from('authority_clusters')
        .select('id')
        .limit(1)
        .maybeSingle();

      for (const topic of batch) {
        console.log(`[batch-cluster] Generating: ${topic.slug}`);
        const article = await generateClusterArticle(topic, lovableApiKey);

        if (!article) {
          results.push({ topic: topic.topic, slug: topic.slug, success: false, error: 'AI generation failed' });
          continue;
        }

        // Build markdown from sections
        let markdown = `# ${(article as any).h1 || topic.topic}\n\n`;
        for (const s of ((article as any).sections || [])) {
          markdown += `## ${s.h2}\n\n${s.content}\n\n`;
        }
        if ((article as any).faqs?.length) {
          markdown += `## Frequently Asked Questions\n\n`;
          for (const faq of (article as any).faqs) {
            markdown += `### ${faq.question}\n\n${faq.answer}\n\n`;
          }
        }

        const wordCount = markdown.split(/\s+/).length;

        // Build FAQ schema
        const faqSchema = {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": ((article as any).faqs || []).map((f: { question: string; answer: string }) => ({
            "@type": "Question",
            "name": f.question,
            "acceptedAnswer": { "@type": "Answer", "text": f.answer },
          })),
        };

        // Insert into cluster_articles
        const { error: insertErr } = await supabase.from('cluster_articles').insert({
          cluster_id: defaultCluster?.id || null,
          slug: topic.slug,
          title: (article as any).title || topic.topic,
          seo_title: (article as any).seo_title || (article as any).title,
          meta_description: (article as any).meta_description || '',
          content: markdown,
          primary_keyword: topic.primary_keyword,
          secondary_keywords: topic.secondary_keywords,
          internal_links: (article as any).internal_links || [],
          faq: faqSchema,
          word_count: wordCount,
          status: 'draft',
          article_role: topic.intent === 'commercial' ? 'commercial_hub' : 'informational_pillar',
          search_intent: topic.intent,
        });

        if (insertErr) {
          console.error(`Insert error for ${topic.slug}:`, insertErr.message);
          results.push({ topic: topic.topic, slug: topic.slug, success: false, error: insertErr.message });
        } else {
          results.push({ topic: topic.topic, slug: topic.slug, success: true });
        }
      }

      return json({
        ok: true,
        batch_requested: batch.length,
        generated: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        remaining: missing.length - batch.length,
        results,
      });
    }

    // ============= ACTION: status — Pipeline status overview =============
    if (action === 'status') {
      const { data: articles, error } = await supabase
        .from('cluster_articles')
        .select('slug, status, word_count, article_role, primary_keyword, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const byStatus: Record<string, number> = {};
      const byRole: Record<string, number> = {};
      for (const a of (articles || [])) {
        byStatus[a.status] = (byStatus[a.status] || 0) + 1;
        byRole[a.article_role || 'unknown'] = (byRole[a.article_role || 'unknown'] || 0) + 1;
      }

      return json({
        ok: true,
        total_articles: (articles || []).length,
        target: 150,
        progress_pct: Math.round(((articles || []).length / 150) * 100),
        by_status: byStatus,
        by_role: byRole,
        recent: (articles || []).slice(0, 10),
        verticals_defined: MONEY_VERTICALS.length,
      });
    }

    return json({ ok: false, error: 'Invalid action. Valid: list_topics, generate_batch, status' }, 400);
  } catch (err) {
    console.error('[batch-cluster-pipeline] Error:', err);
    return json({ ok: false, error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
