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

// ============= TYPES =============
interface RecoveryTarget {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  intent: string;
  priority: 'critical' | 'high' | 'medium';
  recovery_actions: string[];
}

interface LinkRecommendation {
  source_url: string;
  source_type: 'homepage' | 'hub' | 'cluster' | 'product';
  target_url: string;
  anchor_text: string;
  anchor_type: 'branded' | 'partial' | 'exact' | 'generic';
}

// ============= INTENT CLASSIFICATION =============
function classifyIntent(query: string): string {
  const q = query.toLowerCase();
  if (/\b(buy|order|price|cheap|discount|coupon|deal|sale|shop)\b/.test(q)) return 'transactional';
  if (/\b(best|top|review|compare|vs|alternative|recommend)\b/.test(q)) return 'commercial';
  if (/\b(getpawsy|pawsy)\b/.test(q)) return 'navigational';
  return 'informational';
}

// ============= PRIORITY SCORING =============
function calcPriority(row: { impressions: number; position: number; ctr: number }): 'critical' | 'high' | 'medium' {
  // Critical: high impressions + close to top 5
  if (row.position <= 10 && row.impressions >= 50) return 'critical';
  if (row.position <= 12 && row.impressions >= 30) return 'high';
  return 'medium';
}

// ============= RECOVERY ACTIONS =============
function determineActions(target: { position: number; impressions: number; ctr: number; intent: string }): string[] {
  const actions: string[] = [];

  // Always: add FAQ schema + H2 expansion
  actions.push('add_h2_with_primary_keyword');
  actions.push('add_3_5_faq_questions_with_schema');

  // Position 6-10: Focus on CTR optimization
  if (target.position <= 10) {
    actions.push('rewrite_title_tag_ctr_optimized');
    actions.push('add_featured_snippet_block');
  }

  // Position 11-15: Content depth + internal links
  if (target.position > 10 && target.position <= 15) {
    actions.push('add_comparison_table');
    actions.push('add_3_internal_links');
    actions.push('expand_content_300_words');
  }

  // Position 16-20: Full content overhaul
  if (target.position > 15) {
    actions.push('add_comparison_table');
    actions.push('add_structured_checklist');
    actions.push('add_5_internal_links');
    actions.push('expand_content_500_words');
  }

  // Low CTR: title rewrite
  if (target.ctr < 0.03) {
    actions.push('rewrite_meta_description');
  }

  // Commercial intent: product integration
  if (target.intent === 'commercial' || target.intent === 'transactional') {
    actions.push('add_product_comparison_block');
    actions.push('add_buying_criteria_section');
  }

  return actions;
}

// ============= ANCHOR TEXT GENERATION =============
function generateAnchors(query: string, page: string): LinkRecommendation[] {
  const links: LinkRecommendation[] = [];
  const slug = page.replace('https://getpawsy.pet', '');

  // 40% branded
  links.push({
    source_url: '/',
    source_type: 'homepage',
    target_url: slug,
    anchor_text: `GetPawsy ${query.split(' ').slice(0, 3).join(' ')}`,
    anchor_type: 'branded',
  });

  // 30% partial match
  const words = query.split(' ');
  links.push({
    source_url: slug.includes('/guides/') ? '/collections/dogs' : '/guides',
    source_type: 'hub',
    target_url: slug,
    anchor_text: words.length > 3 ? words.slice(0, 3).join(' ') : query,
    anchor_type: 'partial',
  });

  // 20% exact match
  links.push({
    source_url: '/blog',
    source_type: 'cluster',
    target_url: slug,
    anchor_text: query,
    anchor_type: 'exact',
  });

  // 10% generic
  links.push({
    source_url: slug.startsWith('/collections/') ? '/products' : '/collections/dogs',
    source_type: 'product',
    target_url: slug,
    anchor_text: 'learn more',
    anchor_type: 'generic',
  });

  return links;
}

// ============= CONTENT EXPANSION GENERATOR =============
async function generateExpansion(
  target: RecoveryTarget,
  lovableApiKey: string,
): Promise<Record<string, unknown> | null> {
  const systemPrompt = `You are an SEO content expert for GetPawsy (https://getpawsy.pet), a US-focused pet products store specializing in dog training and cat enrichment. Write helpful, practical content. No medical claims. US English only.

Return ONLY valid JSON.`;

  const userPrompt = `Generate content expansion for a page targeting "${target.query}" (current position: ${target.position}, impressions: ${target.impressions}).

Page URL: ${target.page}
Intent: ${target.intent}

Generate this JSON:
{
  "new_h2": {
    "heading": "H2 heading containing exact keyword '${target.query}'",
    "content": "200-300 word section, practical and helpful"
  },
  "faqs": [
    {"question": "FAQ about ${target.query}", "answer": "2-3 sentence helpful answer"}
  ],
  "comparison_table": {
    "title": "Comparison heading",
    "headers": ["Feature", "Option A", "Option B", "Option C"],
    "rows": [["row data"]]
  },
  "title_tag": "Optimized title under 60 chars with power words + US shipping angle",
  "meta_description": "Optimized meta under 160 chars with clear benefit + call to action",
  "checklist": {
    "title": "Checklist heading",
    "items": ["Actionable checklist item 1", "Item 2", "Item 3"]
  }
}

Include 5 FAQ items. Make comparison table have 4-5 rows. Checklist should have 6-8 items.`;

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
        temperature: 0.6,
        max_tokens: 4000,
      }),
    });

    if (!resp.ok) {
      console.error(`AI error: ${resp.status}`);
      return null;
    }

    const data = await resp.json();
    let raw = data.choices?.[0]?.message?.content || '';
    raw = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(raw);
  } catch (err) {
    console.error('Expansion generation error:', err);
    return null;
  }
}

// ============= UNDER-LINKED PAGE DETECTION =============
interface UnderLinkedPage {
  url: string;
  inbound_count: number;
  page_type: string;
  recommended_sources: LinkRecommendation[];
}

function detectUnderLinkedPages(
  gscData: Array<{ query: string; page: string; impressions: number; position: number }>,
  minLinks: number = 3,
): UnderLinkedPage[] {
  // Group by page
  const pageMap = new Map<string, { impressions: number; queries: string[] }>();
  for (const row of gscData) {
    const existing = pageMap.get(row.page) || { impressions: 0, queries: [] };
    existing.impressions += row.impressions;
    existing.queries.push(row.query);
    pageMap.set(row.page, existing);
  }

  // Pages with high impressions but few unique query entries (proxy for under-linking)
  const underLinked: UnderLinkedPage[] = [];
  for (const [page, data] of pageMap) {
    if (!page.includes('getpawsy.pet')) continue;
    const slug = page.replace('https://getpawsy.pet', '');
    
    // Heuristic: pages with < 3 unique queries ranking but high impressions are likely under-linked
    if (data.queries.length < minLinks && data.impressions > 15) {
      const pageType = slug.startsWith('/collections/') ? 'collection'
        : slug.startsWith('/guides/') ? 'guide'
        : slug.startsWith('/blog/') ? 'blog'
        : slug.startsWith('/products/') ? 'product'
        : 'other';

      underLinked.push({
        url: slug,
        inbound_count: data.queries.length,
        page_type: pageType,
        recommended_sources: generateAnchors(data.queries[0] || '', page),
      });
    }
  }

  return underLinked.sort((a, b) => a.inbound_count - b.inbound_count);
}

// ============= MAIN HANDLER =============
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const body = await req.json().catch(() => ({}));
  const action = body.action || 'analyze';

  try {
    // ============= ACTION: analyze — Find recovery targets =============
    if (action === 'analyze') {
      const posMin = body.position_min || 6;
      const posMax = body.position_max || 20;
      const minImpressions = body.min_impressions || 20;

      const { data: gscData, error } = await supabase
        .from('gsc_keywords')
        .select('query, page, clicks, impressions, ctr, position')
        .gte('position', posMin)
        .lte('position', posMax)
        .gte('impressions', minImpressions)
        .order('impressions', { ascending: false })
        .limit(500);

      if (error) throw error;

      const targets: RecoveryTarget[] = (gscData || [])
        .filter(row => !row.query.includes('getpawsy') && !row.query.includes('pawsy'))
        .map(row => {
          const intent = classifyIntent(row.query);
          return {
            query: row.query,
            page: row.page,
            clicks: row.clicks,
            impressions: row.impressions,
            ctr: row.ctr,
            position: Math.round(row.position * 10) / 10,
            intent,
            priority: calcPriority(row),
            recovery_actions: determineActions({ ...row, intent }),
          };
        });

      // Group by priority
      const critical = targets.filter(t => t.priority === 'critical');
      const high = targets.filter(t => t.priority === 'high');
      const medium = targets.filter(t => t.priority === 'medium');

      // Under-linked detection
      const { data: allGsc } = await supabase
        .from('gsc_keywords')
        .select('query, page, impressions, position')
        .gt('impressions', 5)
        .limit(2000);

      const underLinked = detectUnderLinkedPages(allGsc || []);

      return json({
        ok: true,
        recovery_targets: {
          total: targets.length,
          critical: critical.length,
          high: high.length,
          medium: medium.length,
          targets: targets.slice(0, 50),
        },
        under_linked: {
          total: underLinked.length,
          pages: underLinked.slice(0, 30),
        },
        projected_impact: {
          estimated_top5_moves: critical.length,
          estimated_top10_moves: critical.length + Math.round(high.length * 0.5),
          estimated_impression_lift_30d: Math.round(
            targets.reduce((sum, t) => sum + t.impressions * 0.3, 0)
          ),
        },
      });
    }

    // ============= ACTION: generate_expansions — AI content for top targets =============
    if (action === 'generate_expansions') {
      const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
      if (!lovableApiKey) return json({ ok: false, error: 'LOVABLE_API_KEY not configured' }, 500);

      const limit = Math.min(body.limit || 5, 10);
      const posMin = body.position_min || 6;
      const posMax = body.position_max || 20;

      const { data: gscData } = await supabase
        .from('gsc_keywords')
        .select('query, page, clicks, impressions, ctr, position')
        .gte('position', posMin)
        .lte('position', posMax)
        .gte('impressions', 20)
        .order('impressions', { ascending: false })
        .limit(limit);

      if (!gscData?.length) return json({ ok: true, expansions: [], message: 'No targets found' });

      const expansions: Array<{
        target: RecoveryTarget;
        expansion: Record<string, unknown> | null;
        links: LinkRecommendation[];
      }> = [];

      for (const row of gscData) {
        const intent = classifyIntent(row.query);
        const target: RecoveryTarget = {
          query: row.query,
          page: row.page,
          clicks: row.clicks,
          impressions: row.impressions,
          ctr: row.ctr,
          position: Math.round(row.position * 10) / 10,
          intent,
          priority: calcPriority(row),
          recovery_actions: determineActions({ ...row, intent }),
        };

        const expansion = await generateExpansion(target, lovableApiKey);
        const links = generateAnchors(row.query, row.page);

        expansions.push({ target, expansion, links });

        // Store as content draft
        if (expansion) {
          await supabase.from('seo_content_drafts').insert({
            url: row.page,
            content_type: 'expansion',
            title: (expansion as any).title_tag || row.query,
            meta_description: (expansion as any).meta_description || '',
            markdown: JSON.stringify(expansion),
            internal_links: links,
            word_count: 300,
            status: 'draft',
          }).select();
        }
      }

      return json({
        ok: true,
        expansions_generated: expansions.length,
        expansions,
      });
    }

    // ============= ACTION: link_graph — Authority distribution analysis =============
    if (action === 'link_graph') {
      const { data: allGsc } = await supabase
        .from('gsc_keywords')
        .select('query, page, clicks, impressions, position')
        .gt('impressions', 3)
        .order('impressions', { ascending: false })
        .limit(3000);

      if (!allGsc?.length) return json({ ok: true, message: 'No data' });

      // Build page authority map
      const pageAuth = new Map<string, { impressions: number; clicks: number; queries: number; avgPos: number }>();
      for (const row of allGsc) {
        const slug = row.page.replace('https://getpawsy.pet', '');
        const existing = pageAuth.get(slug) || { impressions: 0, clicks: 0, queries: 0, avgPos: 0 };
        existing.impressions += row.impressions;
        existing.clicks += row.clicks;
        existing.queries += 1;
        existing.avgPos = (existing.avgPos * (existing.queries - 1) + row.position) / existing.queries;
        pageAuth.set(slug, existing);
      }

      // Classify pages into tiers
      const pages = [...pageAuth.entries()].map(([url, data]) => ({
        url,
        ...data,
        avgPos: Math.round(data.avgPos * 10) / 10,
        tier: url === '/' ? 'homepage'
          : url.startsWith('/collections/') ? 'hub'
          : url.startsWith('/guides/') ? 'cluster'
          : url.startsWith('/products/') ? 'product'
          : url.startsWith('/blog/') ? 'blog'
          : 'other',
      }));

      pages.sort((a, b) => b.impressions - a.impressions);

      // Authority distribution
      const totalImpressions = pages.reduce((s, p) => s + p.impressions, 0);
      const tierDistribution: Record<string, { count: number; impressions: number; pct: number }> = {};
      for (const p of pages) {
        if (!tierDistribution[p.tier]) tierDistribution[p.tier] = { count: 0, impressions: 0, pct: 0 };
        tierDistribution[p.tier].count += 1;
        tierDistribution[p.tier].impressions += p.impressions;
      }
      for (const tier of Object.values(tierDistribution)) {
        tier.pct = Math.round((tier.impressions / Math.max(1, totalImpressions)) * 100);
      }

      // Orphan detection (pages with 0 GSC data)
      const underLinked = pages.filter(p => p.queries <= 2 && p.impressions < 20);

      return json({
        ok: true,
        total_pages_with_gsc_data: pages.length,
        total_impressions: totalImpressions,
        authority_distribution: tierDistribution,
        top_pages: pages.slice(0, 20),
        under_linked_count: underLinked.length,
        under_linked: underLinked.slice(0, 30),
        health: {
          orphan_pages: underLinked.length,
          under_linked_pages: pages.filter(p => p.queries <= 3).length,
          broken_links: 0, // Would need crawl data
          sitemap_mismatch: 0, // Would need sitemap comparison
        },
      });
    }

    return json({ ok: false, error: 'Invalid action. Valid: analyze, generate_expansions, link_graph' }, 400);
  } catch (err) {
    console.error('[seo-recovery-engine] Error:', err);
    return json({ ok: false, error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
