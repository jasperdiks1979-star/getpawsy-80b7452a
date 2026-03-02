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
interface SniperTarget {
  query: string;
  page: string;
  slug: string;
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
  intent: 'transactional' | 'commercial' | 'informational' | 'navigational';
  page_type: 'collection' | 'guide' | 'product' | 'blog' | 'homepage' | 'other';
  sniper_score: number;
  top5_probability: number;
  actions: string[];
}

interface SniperExpansion {
  title_tag: string;
  meta_description: string;
  quick_answer: string;
  new_h2: { heading: string; content: string };
  faqs: Array<{ question: string; answer: string }>;
  comparison_table: { title: string; headers: string[]; rows: string[][] } | null;
  checklist: { title: string; items: string[] } | null;
  entity_mentions: string[];
  lsi_terms: string[];
  outbound_authority_link: { url: string; anchor: string };
  internal_links: Array<{ target: string; anchor: string; anchor_type: string }>;
}

// ============= INTENT CLASSIFICATION =============
function classifyIntent(query: string): SniperTarget['intent'] {
  const q = query.toLowerCase();
  if (/\b(buy|order|price|cheap|discount|coupon|deal|sale|shop|add to cart)\b/.test(q)) return 'transactional';
  if (/\b(best|top|review|compare|vs|alternative|recommend|rated)\b/.test(q)) return 'commercial';
  if (/\b(getpawsy|pawsy)\b/.test(q)) return 'navigational';
  return 'informational';
}

function classifyPageType(url: string): SniperTarget['page_type'] {
  const slug = url.replace(/https?:\/\/[^/]+/, '');
  if (slug === '/' || slug === '') return 'homepage';
  if (slug.startsWith('/collections/') || slug.startsWith('/c/')) return 'collection';
  if (slug.startsWith('/guides/')) return 'guide';
  if (slug.startsWith('/product/') || slug.startsWith('/products/')) return 'product';
  if (slug.startsWith('/blog/')) return 'blog';
  return 'other';
}

// ============= SNIPER SCORE =============
// Higher = more likely to benefit from optimization
function calcSniperScore(row: { position: number; impressions: number; ctr: number; clicks: number }, intent: string): number {
  // Base: closer to top 5 = higher score
  const positionFactor = Math.max(0, 21 - row.position) / 15; // 0-1 range
  
  // Volume: more impressions = higher potential
  const volumeFactor = Math.min(1, row.impressions / 100);
  
  // CTR gap: low CTR with high position = biggest opportunity
  const ctrGap = row.position <= 10 ? Math.max(0, 0.08 - row.ctr) * 10 : 0;
  
  // Intent multiplier
  const intentMultiplier = intent === 'commercial' ? 1.5 
    : intent === 'transactional' ? 1.8 
    : intent === 'informational' ? 1.0 
    : 0.5;
  
  return Math.round((positionFactor * 40 + volumeFactor * 30 + ctrGap * 20) * intentMultiplier * 10) / 10;
}

// ============= TOP 5 PROBABILITY =============
function calcTop5Probability(position: number, impressions: number, intent: string): number {
  if (position <= 5) return 0.95;
  if (position <= 8) return 0.70;
  if (position <= 10) return 0.55;
  if (position <= 12) return 0.40;
  if (position <= 15) return 0.25;
  if (position <= 20) return 0.12;
  return 0.05;
}

// ============= ACTIONS =============
function determineSniperActions(target: SniperTarget): string[] {
  const actions: string[] = [];
  
  // All targets get these
  actions.push('insert_primary_keyword_first_120_words');
  actions.push('add_h2_exact_keyword_match');
  actions.push('add_image_alt_with_primary_keyword');
  actions.push('add_3_lsi_semantic_variations');
  actions.push('add_5_faq_schema_questions');
  
  // Snippet targeting
  if (target.intent === 'informational') {
    actions.push('add_numbered_list_snippet');
    actions.push('add_definition_box');
  } else if (target.intent === 'commercial') {
    actions.push('add_comparison_table');
    actions.push('add_quick_answer_40_60_words');
  }
  
  // CTR optimization
  if (target.ctr < 0.03) {
    actions.push('rewrite_title_power_words_us_shipping');
    actions.push('rewrite_meta_description_140_155_chars');
  }
  
  // Content depth
  actions.push('add_entity_mentions_3_5');
  actions.push('add_1_outbound_authority_link');
  
  // Internal linking
  actions.push('add_2_hub_contextual_links');
  if (target.intent === 'commercial' || target.intent === 'transactional') {
    actions.push('add_1_homepage_contextual_link');
  }
  actions.push('add_2_cluster_article_links');
  
  return actions;
}

// ============= ANCHOR TEXT DISTRIBUTION =============
function generateSniperLinks(query: string, slug: string, pageType: string): Array<{ target: string; anchor: string; anchor_type: string }> {
  const links: Array<{ target: string; anchor: string; anchor_type: string }> = [];
  const words = query.split(' ');
  
  // 40% partial match — from hub pages
  links.push({
    target: slug.includes('/guides/') || slug.includes('/blog/') 
      ? '/collections/dogs' : '/guides',
    anchor: words.slice(0, Math.ceil(words.length * 0.6)).join(' '),
    anchor_type: 'partial',
  });
  links.push({
    target: slug.includes('cat') ? '/c/cats' : '/c/dogs',
    anchor: words.slice(1).join(' '),
    anchor_type: 'partial',
  });
  
  // 30% branded
  links.push({
    target: '/',
    anchor: `GetPawsy ${words.slice(0, 2).join(' ')}`,
    anchor_type: 'branded',
  });
  
  // 20% exact match — from cluster articles
  links.push({
    target: '/blog',
    anchor: query,
    anchor_type: 'exact',
  });
  
  // 10% generic
  links.push({
    target: pageType === 'guide' ? '/collections/dogs' : '/guides',
    anchor: 'read our expert guide',
    anchor_type: 'generic',
  });
  
  return links;
}

// ============= AI EXPANSION GENERATOR =============
async function generateSniperExpansion(
  target: SniperTarget,
  lovableApiKey: string,
): Promise<SniperExpansion | null> {
  const systemPrompt = `You are an elite SEO content strategist for GetPawsy (https://getpawsy.pet), a US dog & cat training specialist. Write helpful, authoritative content. No medical claims. US English.

CRITICAL RULES:
- Title tags: EXACTLY 50-60 characters. Formula: [Primary Keyword] + Benefit + US Shipping Angle
- Meta descriptions: EXACTLY 140-155 characters. Include benefit + soft CTA + US angle
- Quick answer: EXACTLY 40-60 words for featured snippet capture
- FAQs: 5 questions, practical and specific
- Entity mentions: real brands, materials, certifications (not made up)
- LSI terms: semantically related terms from the same topical cluster

Return ONLY valid JSON. No markdown wrapping.`;

  const snippetType = target.intent === 'informational' 
    ? 'numbered_list' 
    : target.intent === 'commercial' 
    ? 'comparison_table' 
    : 'checklist';

  const userPrompt = `Generate a COMPLETE sniper expansion for targeting "${target.query}" (position ${target.position}, ${target.impressions} impressions, ${target.intent} intent).

URL: ${target.page}
Page type: ${target.page_type}
Current CTR: ${(target.ctr * 100).toFixed(2)}%

Generate this exact JSON structure:
{
  "title_tag": "50-60 char title with primary keyword + benefit + US shipping angle",
  "meta_description": "140-155 char description with benefit + CTA + US angle",
  "quick_answer": "40-60 word direct answer for featured snippet. Start with the answer, not a question.",
  "new_h2": {
    "heading": "H2 containing exact keyword '${target.query}'",
    "content": "250-400 word practical section with the keyword in the first sentence"
  },
  "faqs": [
    {"question": "Specific FAQ about ${target.query}", "answer": "2-3 sentence helpful answer"}
  ],
  ${snippetType === 'comparison_table' ? `"comparison_table": {
    "title": "Comparison of top options",
    "headers": ["Feature", "Option A", "Option B", "Option C"],
    "rows": [["row"]]
  },
  "checklist": null,` : `"comparison_table": null,
  "checklist": {
    "title": "Checklist heading",
    "items": ["6-8 actionable items"]
  },`}
  "entity_mentions": ["3-5 real entity mentions: brand names, materials, certifications"],
  "lsi_terms": ["3-5 semantically related terms"],
  "outbound_authority_link": {
    "url": "https://real-authority-source.com/relevant-page",
    "anchor": "descriptive anchor text"
  },
  "internal_links": []
}

Include exactly 5 FAQ items. Comparison table should have 4-5 rows. Do NOT invent fake brand names.`;

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
        temperature: 0.5,
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
    const parsed = JSON.parse(raw);
    
    // Inject internal links
    parsed.internal_links = generateSniperLinks(target.query, target.slug, target.page_type);
    
    return parsed as SniperExpansion;
  } catch (err) {
    console.error('Sniper expansion error:', err);
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
  const action = body.action || 'scan';

  try {
    // ============= ACTION: scan — Identify sniper targets =============
    if (action === 'scan') {
      const posMin = body.position_min ?? 6;
      const posMax = body.position_max ?? 20;
      const minImpressions = body.min_impressions ?? 1;

      const { data: gscData, error } = await supabase
        .from('gsc_keywords')
        .select('query, page, clicks, impressions, ctr, position')
        .gte('position', posMin)
        .lte('position', posMax)
        .gte('impressions', minImpressions)
        .order('impressions', { ascending: false })
        .limit(500);

      if (error) throw error;

      // Filter brand queries
      const filtered = (gscData || []).filter(
        row => !/\b(getpawsy|pawsy|get pawsy)\b/i.test(row.query)
      );

      const targets: SniperTarget[] = filtered.map(row => {
        const intent = classifyIntent(row.query);
        const slug = row.page.replace(/https?:\/\/[^/]+/, '');
        const pageType = classifyPageType(row.page);
        const sniperScore = calcSniperScore(row, intent);
        
        const target: SniperTarget = {
          query: row.query,
          page: row.page,
          slug,
          impressions: row.impressions,
          clicks: row.clicks,
          ctr: row.ctr,
          position: Math.round(row.position * 10) / 10,
          intent,
          page_type: pageType,
          sniper_score: sniperScore,
          top5_probability: calcTop5Probability(row.position, row.impressions, intent),
          actions: [],
        };
        target.actions = determineSniperActions(target);
        return target;
      });

      // Sort by sniper score
      targets.sort((a, b) => b.sniper_score - a.sniper_score);

      // Authority distribution
      const avgPos = targets.length > 0
        ? targets.reduce((s, t) => s + t.position, 0) / targets.length
        : 0;

      return json({
        ok: true,
        scan_params: { posMin, posMax, minImpressions },
        targets_found: targets.length,
        avg_position: Math.round(avgPos * 10) / 10,
        top_targets: targets.slice(0, 30),
        by_intent: {
          commercial: targets.filter(t => t.intent === 'commercial').length,
          informational: targets.filter(t => t.intent === 'informational').length,
          transactional: targets.filter(t => t.intent === 'transactional').length,
          navigational: targets.filter(t => t.intent === 'navigational').length,
        },
        by_page_type: {
          collection: targets.filter(t => t.page_type === 'collection').length,
          guide: targets.filter(t => t.page_type === 'guide').length,
          product: targets.filter(t => t.page_type === 'product').length,
          blog: targets.filter(t => t.page_type === 'blog').length,
          homepage: targets.filter(t => t.page_type === 'homepage').length,
          other: targets.filter(t => t.page_type === 'other').length,
        },
        estimated_30d_impression_lift: Math.round(
          targets.reduce((sum, t) => sum + t.impressions * t.top5_probability * 2, 0)
        ),
      });
    }

    // ============= ACTION: fire — Generate AI expansions for top targets =============
    if (action === 'fire') {
      const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
      if (!lovableApiKey) return json({ ok: false, error: 'LOVABLE_API_KEY not configured' }, 500);

      const limit = Math.min(body.limit || 5, 10);
      const posMin = body.position_min ?? 6;
      const posMax = body.position_max ?? 20;

      const { data: gscData } = await supabase
        .from('gsc_keywords')
        .select('query, page, clicks, impressions, ctr, position')
        .gte('position', posMin)
        .lte('position', posMax)
        .gte('impressions', body.min_impressions ?? 1)
        .order('impressions', { ascending: false })
        .limit(100);

      const filtered = (gscData || [])
        .filter(row => !/\b(getpawsy|pawsy)\b/i.test(row.query))
        .slice(0, limit);

      if (!filtered.length) return json({ ok: true, expansions: [], message: 'No targets in strike zone' });

      const results: Array<{
        target: SniperTarget;
        expansion: SniperExpansion | null;
        status: string;
      }> = [];

      for (const row of filtered) {
        const intent = classifyIntent(row.query);
        const slug = row.page.replace(/https?:\/\/[^/]+/, '');
        const target: SniperTarget = {
          query: row.query,
          page: row.page,
          slug,
          impressions: row.impressions,
          clicks: row.clicks,
          ctr: row.ctr,
          position: Math.round(row.position * 10) / 10,
          intent,
          page_type: classifyPageType(row.page),
          sniper_score: calcSniperScore(row, intent),
          top5_probability: calcTop5Probability(row.position, row.impressions, intent),
          actions: [],
        };
        target.actions = determineSniperActions(target);

        const expansion = await generateSniperExpansion(target, lovableApiKey);
        
        // Store draft
        if (expansion) {
          await supabase.from('seo_content_drafts').upsert({
            url: row.page,
            content_type: 'sniper_expansion',
            title: expansion.title_tag,
            meta_description: expansion.meta_description,
            markdown: JSON.stringify(expansion),
            internal_links: expansion.internal_links,
            word_count: expansion.new_h2.content.split(' ').length + 60,
            status: 'draft',
          }, { onConflict: 'url' }).select();
        }

        results.push({
          target,
          expansion,
          status: expansion ? 'generated' : 'failed',
        });
      }

      return json({
        ok: true,
        total_fired: results.length,
        successful: results.filter(r => r.status === 'generated').length,
        failed: results.filter(r => r.status === 'failed').length,
        results,
      });
    }

    // ============= ACTION: report — Full status report =============
    if (action === 'report') {
      // Pull all GSC data
      const { data: allGsc } = await supabase
        .from('gsc_keywords')
        .select('query, page, clicks, impressions, ctr, position')
        .order('impressions', { ascending: false })
        .limit(1000);

      if (!allGsc?.length) return json({ ok: true, message: 'No GSC data available' });

      const nonBrand = allGsc.filter(r => !/\b(getpawsy|pawsy)\b/i.test(r.query));

      // Position distribution
      const zones = {
        top5: nonBrand.filter(r => r.position <= 5),
        pos6_10: nonBrand.filter(r => r.position > 5 && r.position <= 10),
        pos11_20: nonBrand.filter(r => r.position > 10 && r.position <= 20),
        pos21_50: nonBrand.filter(r => r.position > 20 && r.position <= 50),
        pos50plus: nonBrand.filter(r => r.position > 50),
      };

      const totalImpressions = nonBrand.reduce((s, r) => s + r.impressions, 0);
      const totalClicks = nonBrand.reduce((s, r) => s + r.clicks, 0);

      // Sniper targets in pos 6-20
      const strikeZone = nonBrand
        .filter(r => r.position >= 6 && r.position <= 20)
        .sort((a, b) => b.impressions - a.impressions);

      // Check drafts
      const { data: drafts } = await supabase
        .from('seo_content_drafts')
        .select('url, status, content_type')
        .eq('content_type', 'sniper_expansion');

      return json({
        ok: true,
        report_date: new Date().toISOString(),
        total_queries: nonBrand.length,
        total_impressions: totalImpressions,
        total_clicks: totalClicks,
        overall_ctr: totalImpressions > 0 ? Math.round((totalClicks / totalImpressions) * 10000) / 100 : 0,
        position_distribution: {
          top5: { count: zones.top5.length, impressions: zones.top5.reduce((s, r) => s + r.impressions, 0) },
          pos6_10: { count: zones.pos6_10.length, impressions: zones.pos6_10.reduce((s, r) => s + r.impressions, 0) },
          pos11_20: { count: zones.pos11_20.length, impressions: zones.pos11_20.reduce((s, r) => s + r.impressions, 0) },
          pos21_50: { count: zones.pos21_50.length, impressions: zones.pos21_50.reduce((s, r) => s + r.impressions, 0) },
          pos50plus: { count: zones.pos50plus.length, impressions: zones.pos50plus.reduce((s, r) => s + r.impressions, 0) },
        },
        strike_zone_targets: strikeZone.slice(0, 20).map(r => ({
          query: r.query,
          page: r.page.replace(/https?:\/\/[^/]+/, ''),
          position: Math.round(r.position * 10) / 10,
          impressions: r.impressions,
          top5_probability: calcTop5Probability(r.position, r.impressions, classifyIntent(r.query)),
        })),
        content_drafts: {
          total: drafts?.length || 0,
          pending: drafts?.filter(d => d.status === 'draft').length || 0,
          approved: drafts?.filter(d => d.status === 'approved').length || 0,
        },
        recommended_next_actions: [
          strikeZone.length > 0 ? `Fire sniper expansions for ${strikeZone.length} strike zone targets` : 'No strike zone targets — focus on content creation to build impressions',
          zones.pos50plus.length > 10 ? `${zones.pos50plus.length} pages in pos 50+ — consider content rewrites or merges` : null,
          totalClicks === 0 ? 'ZERO CLICKS across all queries — prioritize title tag rewrites with power words' : null,
        ].filter(Boolean),
      });
    }

    return json({ ok: false, error: 'Invalid action. Valid: scan, fire, report' }, 400);
  } catch (err) {
    console.error('[position-sniper] Error:', err);
    return json({ ok: false, error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
