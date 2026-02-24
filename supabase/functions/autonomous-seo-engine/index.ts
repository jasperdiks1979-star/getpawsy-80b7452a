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

const SITE = 'https://getpawsy.pet';

// ============= TYPES =============
interface GscRow { query: string; page: string; clicks: number; impressions: number; ctr: number; position: number; }
interface Cluster { label: string; intent: string; primary_keyword: string; keywords: GscRow[]; primary_url: string | null; secondary_urls: string[]; }
interface Action { action_type: string; target_url: string; cluster_id?: string; payload: Record<string, unknown>; }

// ============= CLUSTERING =============
function normalizeQuery(q: string): string {
  return q.toLowerCase().trim().replace(/\s+/g, ' ');
}

function getNgrams(text: string, n: number): Set<string> {
  const words = text.split(' ');
  const grams = new Set<string>();
  for (let i = 0; i <= words.length - n; i++) {
    grams.add(words.slice(i, i + n).join(' '));
  }
  return grams;
}

function similarity(a: string, b: string): number {
  const bigrams_a = getNgrams(a, 2);
  const bigrams_b = getNgrams(b, 2);
  if (bigrams_a.size === 0 || bigrams_b.size === 0) {
    // fallback: unigram overlap
    const ua = new Set(a.split(' '));
    const ub = new Set(b.split(' '));
    let overlap = 0;
    for (const w of ua) if (ub.has(w)) overlap++;
    return overlap / Math.max(ua.size, ub.size);
  }
  let overlap = 0;
  for (const g of bigrams_a) if (bigrams_b.has(g)) overlap++;
  return (2 * overlap) / (bigrams_a.size + bigrams_b.size);
}

function detectIntent(queries: string[]): string {
  const COMMERCIAL = ['best', 'buy', 'top', 'review', 'compare', 'price', 'cheap', 'deal', 'sale', 'shop', 'order', 'vs'];
  const NAVIGATIONAL = ['getpawsy', 'pawsy', 'login', 'account', 'cart'];
  const text = queries.join(' ').toLowerCase();
  const navCount = NAVIGATIONAL.filter(w => text.includes(w)).length;
  if (navCount >= 2) return 'navigational';
  const comCount = COMMERCIAL.filter(w => text.includes(w)).length;
  return comCount >= 2 ? 'commercial' : 'informational';
}

function clusterKeywords(rows: GscRow[]): Cluster[] {
  const normalized = rows.map(r => ({ ...r, norm: normalizeQuery(r.query) }));
  const used = new Set<number>();
  const clusters: Cluster[] = [];

  // Sort by impressions desc to seed clusters with strongest queries
  const sorted = normalized.map((r, i) => ({ ...r, idx: i })).sort((a, b) => b.impressions - a.impressions);

  for (const seed of sorted) {
    if (used.has(seed.idx)) continue;
    used.add(seed.idx);
    const members = [seed];

    for (const candidate of sorted) {
      if (used.has(candidate.idx)) continue;
      if (similarity(seed.norm, candidate.norm) >= 0.35) {
        members.push(candidate);
        used.add(candidate.idx);
      }
    }

    const intent = detectIntent(members.map(m => m.norm));
    const primaryKw = members.sort((a, b) => b.impressions - a.impressions)[0];
    
    // Pick primary URL: the page with most impressions
    const pageImps = new Map<string, number>();
    for (const m of members) {
      pageImps.set(m.page, (pageImps.get(m.page) || 0) + m.impressions);
    }
    let primaryUrl: string | null = null;
    let maxImp = 0;
    for (const [page, imp] of pageImps) {
      if (imp > maxImp) { maxImp = imp; primaryUrl = page; }
    }

    const secondaryUrls = [...pageImps.keys()].filter(p => p !== primaryUrl);

    clusters.push({
      label: primaryKw.norm,
      intent,
      primary_keyword: primaryKw.query,
      keywords: members.map(m => ({ query: m.query, page: m.page, clicks: m.clicks, impressions: m.impressions, ctr: m.ctr, position: m.position })),
      primary_url: primaryUrl,
      secondary_urls: secondaryUrls,
    });
  }

  return clusters.sort((a, b) => {
    const aImp = a.keywords.reduce((s, k) => s + k.impressions, 0);
    const bImp = b.keywords.reduce((s, k) => s + k.impressions, 0);
    return bImp - aImp;
  });
}

// ============= ACTION PLANNING =============
function planActions(clusters: Cluster[], config: Record<string, number>): Action[] {
  const maxNew = config.max_new_urls_per_week || 3;
  const maxUpdate = config.max_updates_per_week || 5;
  const minImpQuickWin = config.min_impressions_quick_win || 20;
  const qwMin = config.quick_win_pos_min || 11;
  const qwMax = config.quick_win_pos_max || 30;

  const actions: Action[] = [];
  let newCount = 0;
  let updateCount = 0;

  for (const cluster of clusters) {
    const totalImp = cluster.keywords.reduce((s, k) => s + k.impressions, 0);
    const avgPos = cluster.keywords.reduce((s, k) => s + k.position * k.impressions, 0) / Math.max(1, totalImp);
    const isQuickWin = avgPos >= qwMin && avgPos <= qwMax && totalImp >= minImpQuickWin;

    if (cluster.primary_url && cluster.primary_url.includes(SITE)) {
      // Existing page — plan update
      if (updateCount < maxUpdate && (isQuickWin || totalImp >= 30)) {
        actions.push({
          action_type: 'UPDATE',
          target_url: cluster.primary_url,
          payload: {
            cluster_label: cluster.label,
            intent: cluster.intent,
            avg_position: Math.round(avgPos * 10) / 10,
            total_impressions: totalImp,
            top_keywords: cluster.keywords.slice(0, 5).map(k => k.query),
            reason: isQuickWin ? 'quick_win' : 'high_impression',
          },
        });
        updateCount++;
      }
    } else if (!cluster.primary_url || !cluster.primary_url.includes(SITE)) {
      // No existing page — suggest new URL
      if (newCount < maxNew && totalImp >= minImpQuickWin) {
        const slug = cluster.label.replace(/[^a-z0-9]+/g, '-').slice(0, 60);
        const prefix = cluster.intent === 'commercial' ? '/collections/' : cluster.intent === 'informational' ? '/guides/' : '/blog/';
        actions.push({
          action_type: 'NEW_URL',
          target_url: `${SITE}${prefix}${slug}`,
          payload: {
            cluster_label: cluster.label,
            intent: cluster.intent,
            avg_position: Math.round(avgPos * 10) / 10,
            total_impressions: totalImp,
            top_keywords: cluster.keywords.slice(0, 5).map(k => k.query),
          },
        });
        newCount++;
      }
    }

    // Internal link action for every significant cluster
    if (totalImp >= 15) {
      actions.push({
        action_type: 'INTERNAL_LINKS',
        target_url: cluster.primary_url || `${SITE}/collections/${cluster.label.replace(/[^a-z0-9]+/g, '-').slice(0, 60)}`,
        payload: {
          cluster_label: cluster.label,
          anchor_variants: generateAnchorVariants(cluster),
          link_count: Math.min(8, cluster.keywords.length + 3),
        },
      });
    }
  }

  return actions;
}

function generateAnchorVariants(cluster: Cluster): string[] {
  const kws = cluster.keywords.slice(0, 5).map(k => k.query);
  const variants = new Set<string>();
  // Exact match (max 30%)
  variants.add(cluster.primary_keyword);
  // Partial matches
  for (const kw of kws) {
    variants.add(kw);
    const words = kw.split(' ');
    if (words.length >= 3) variants.add(words.slice(0, 3).join(' '));
  }
  // Natural variants
  variants.add(`shop ${cluster.primary_keyword}`);
  variants.add(`best ${cluster.primary_keyword}`);
  variants.add(`${cluster.primary_keyword} guide`);
  return [...variants].slice(0, 8);
}

// ============= CONTENT GENERATION =============
async function generateContent(
  action: Action & { id: string },
  cluster: Cluster,
  config: Record<string, number>,
  lovableApiKey: string | undefined,
): Promise<{ title: string; meta_description: string; markdown: string; schema_json: Record<string, unknown>; internal_links: Array<{ url: string; anchor: string }>; word_count: number } | null> {
  if (!lovableApiKey) return null;

  const minWords = action.payload.intent === 'informational' ? (config.min_words_guide || 900) : (config.min_words_blog || 600);
  const kws = (action.payload.top_keywords as string[]) || [];

  const systemPrompt = `You are an SEO content expert for GetPawsy (https://getpawsy.pet), a pet products e-commerce site. Write helpful, comprehensive content. Use natural language. Include internal links to https://getpawsy.pet/* pages. Never use www. or lovable.app domains.`;

  const userPrompt = `Create a ${action.payload.intent === 'commercial' ? 'collection guide' : 'informational guide'} page for "${cluster.primary_keyword}".

Target keywords: ${kws.join(', ')}
Intent: ${action.payload.intent}
Min words: ${minWords}

Return ONLY valid JSON with this structure:
{
  "title": "Page title (under 60 chars)",
  "meta_description": "Meta description (under 160 chars)",
  "h1": "Main heading",
  "sections": [{"h2": "heading", "content": "paragraph content"}],
  "faqs": [{"question": "...", "answer": "..."}],
  "internal_links": [{"url": "https://getpawsy.pet/...", "anchor": "anchor text"}]
}

Include 5-8 FAQ items. Include 6-8 internal links to relevant pages on getpawsy.pet. Sections should total at least ${minWords} words.`;

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
      }),
    });

    if (!resp.ok) {
      console.error(`AI error: ${resp.status}`);
      return null;
    }

    const data = await resp.json();
    let raw = data.choices?.[0]?.message?.content || '';
    // Strip markdown code fences
    raw = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    const parsed = JSON.parse(raw);
    
    // Build markdown
    let md = `# ${parsed.h1 || parsed.title}\n\n`;
    for (const s of (parsed.sections || [])) {
      md += `## ${s.h2}\n\n${s.content}\n\n`;
    }
    if (parsed.faqs?.length) {
      md += `## Frequently Asked Questions\n\n`;
      for (const faq of parsed.faqs) {
        md += `### ${faq.question}\n\n${faq.answer}\n\n`;
      }
    }

    const wordCount = md.split(/\s+/).length;
    const internalLinks = (parsed.internal_links || []).filter((l: { url: string }) => l.url.startsWith(SITE));

    // Build FAQPage schema
    const schemaJson = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": (parsed.faqs || []).map((f: { question: string; answer: string }) => ({
        "@type": "Question",
        "name": f.question,
        "acceptedAnswer": { "@type": "Answer", "text": f.answer },
      })),
    };

    return {
      title: parsed.title || cluster.primary_keyword,
      meta_description: parsed.meta_description || `Learn about ${cluster.primary_keyword} at GetPawsy.`,
      markdown: md,
      schema_json: schemaJson,
      internal_links: internalLinks,
      word_count: wordCount,
    };
  } catch (err) {
    console.error('Content generation error:', err);
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

  // Auth: accept user JWT or pipeline source
  const authHeader = req.headers.get('Authorization');
  let userId: string | null = null;
  const body = await req.json().catch(() => ({}));

  if (body.source === 'cron' || body.source === 'pipeline_run') {
    userId = 'system';
  } else {
    if (!authHeader?.startsWith('Bearer ')) return json({ ok: false, reason: 'Unauthorized' }, 401);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return json({ ok: false, reason: 'Invalid session' }, 401);
    userId = user.id;
    const { data: role } = await supabase
      .from('user_roles').select('role').eq('user_id', userId).eq('role', 'admin').maybeSingle();
    if (!role) return json({ ok: false, reason: 'Admin required' }, 403);
  }

  const mode = body.mode || 'dry_run'; // dry_run | plan_only | plan_generate | plan_publish_index

  try {
    // Load config
    const { data: configRow } = await supabase.from('seo_engine_config').select('*').single();
    const config = configRow || {};

    // Create run record
    const { data: run, error: runErr } = await supabase
      .from('seo_engine_runs')
      .insert({ mode, status: 'running', triggered_by: userId === 'system' ? null : userId })
      .select()
      .single();
    if (runErr || !run) return json({ ok: false, reason: 'Failed to create run', error: runErr?.message }, 500);
    const runId = run.id;

    // Step 1: Pull GSC data
    const { data: gscData } = await supabase
      .from('gsc_keywords')
      .select('query, page, clicks, impressions, ctr, position')
      .gt('impressions', 3)
      .order('impressions', { ascending: false })
      .limit(1000);

    if (!gscData?.length) {
      await supabase.from('seo_engine_runs').update({
        status: 'completed', finished_at: new Date().toISOString(),
        summary: { message: 'No GSC data available', clusters_found: 0 },
        clusters_found: 0,
      }).eq('id', runId);
      return json({ ok: true, run_id: runId, message: 'No GSC data', mode });
    }

    // Step 2: Cluster keywords
    const clusters = clusterKeywords(gscData);

    // Step 3: Store clusters
    for (const c of clusters.slice(0, 50)) {
      await supabase.from('seo_clusters').upsert({
        label: c.label,
        intent: c.intent,
        primary_keyword: c.primary_keyword,
        keywords: c.keywords,
        primary_url: c.primary_url,
        secondary_urls: c.secondary_urls,
        status: 'active',
      }, { onConflict: 'label' }).select();
    }

    // Step 4: Plan actions
    const actions = planActions(clusters, config);

    // Store actions
    const storedActions: Array<Action & { id: string }> = [];
    for (const a of actions) {
      // Find matching cluster ID
      const { data: clusterRow } = await supabase
        .from('seo_clusters').select('id').eq('label', a.payload.cluster_label).maybeSingle();

      const { data: actionRow } = await supabase.from('seo_actions_queue').insert({
        run_id: runId,
        action_type: a.action_type,
        target_url: a.target_url,
        cluster_id: clusterRow?.id || null,
        payload: a.payload,
        status: 'planned',
      }).select().single();

      if (actionRow) storedActions.push({ ...a, id: actionRow.id });
    }

    let draftsGenerated = 0;

    // Step 5: Generate content (only in plan_generate or plan_publish_index mode)
    if (mode === 'plan_generate' || mode === 'plan_publish_index') {
      const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
      const contentActions = storedActions.filter(a => a.action_type === 'NEW_URL' || a.action_type === 'UPDATE');

      for (const action of contentActions.slice(0, 5)) {
        const matchingCluster = clusters.find(c => c.label === action.payload.cluster_label);
        if (!matchingCluster) continue;

        const content = await generateContent(action, matchingCluster, config, lovableApiKey);
        if (!content) continue;

        await supabase.from('seo_content_drafts').insert({
          run_id: runId,
          action_id: action.id,
          cluster_id: null,
          url: action.target_url,
          content_type: action.payload.intent === 'commercial' ? 'hub_section' : 'guide',
          title: content.title,
          meta_description: content.meta_description,
          markdown: content.markdown,
          schema_json: content.schema_json,
          internal_links: content.internal_links,
          word_count: content.word_count,
          status: config.auto_publish && !config.approval_required ? 'approved' : 'draft',
        });
        draftsGenerated++;
      }
    }

    // Update run summary
    const summary = {
      total_gsc_rows: gscData.length,
      clusters_found: clusters.length,
      top_clusters: clusters.slice(0, 10).map(c => ({
        label: c.label,
        intent: c.intent,
        impressions: c.keywords.reduce((s, k) => s + k.impressions, 0),
        avg_position: Math.round(
          c.keywords.reduce((s, k) => s + k.position * k.impressions, 0) /
          Math.max(1, c.keywords.reduce((s, k) => s + k.impressions, 0)) * 10
        ) / 10,
        primary_url: c.primary_url,
      })),
      actions_by_type: {
        NEW_URL: actions.filter(a => a.action_type === 'NEW_URL').length,
        UPDATE: actions.filter(a => a.action_type === 'UPDATE').length,
        INTERNAL_LINKS: actions.filter(a => a.action_type === 'INTERNAL_LINKS').length,
      },
      drafts_generated: draftsGenerated,
    };

    await supabase.from('seo_engine_runs').update({
      status: 'completed',
      finished_at: new Date().toISOString(),
      summary,
      clusters_found: clusters.length,
      actions_planned: actions.length,
      drafts_generated: draftsGenerated,
    }).eq('id', runId);

    return json({
      ok: true,
      run_id: runId,
      mode,
      clusters_found: clusters.length,
      actions_planned: actions.length,
      drafts_generated: draftsGenerated,
      summary,
    });

  } catch (err) {
    console.error('[autonomous-seo-engine] Error:', err);
    return json({ ok: false, reason: err instanceof Error ? err.message : 'INTERNAL_ERROR' }, 500);
  }
});
