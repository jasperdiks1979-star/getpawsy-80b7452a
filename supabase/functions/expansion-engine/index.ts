import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Expansion Engine — pulls GSC data, groups into clusters,
 * scores by ExpansionScore, detects cannibalization, and returns
 * prioritized expansion opportunities.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Auth check
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ ok: false, reason: 'Unauthorized' }, 401);
  }
  const token = authHeader.replace('Bearer ', '');
  const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
  if (claimsErr || !claims?.claims?.sub) {
    return jsonResponse({ ok: false, reason: 'Invalid session' }, 401);
  }
  const userId = claims.claims.sub as string;

  const { data: roleData } = await supabase
    .from('user_roles').select('role').eq('user_id', userId).eq('role', 'admin').maybeSingle();
  if (!roleData) return jsonResponse({ ok: false, reason: 'Admin access required' });

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'scan';

    if (action === 'scan') {
      // Pull GSC keywords
      const { data: gscData } = await supabase
        .from('gsc_keywords')
        .select('query, page, clicks, impressions, ctr, position')
        .gt('impressions', 5)
        .order('impressions', { ascending: false })
        .limit(500);

      if (!gscData?.length) {
        return jsonResponse({ ok: true, clusters: [], message: 'No GSC data available' });
      }

      // Group queries by semantic similarity (simplified: by page)
      const pageMap = new Map<string, typeof gscData>();
      for (const kw of gscData) {
        const key = kw.page || 'unassigned';
        if (!pageMap.has(key)) pageMap.set(key, []);
        pageMap.get(key)!.push(kw);
      }

      // Score each cluster
      const COMMERCIAL = ['best', 'buy', 'top', 'review', 'compare', 'price', 'orthopedic', 'waterproof', 'large'];
      const clusters: Array<{
        page: string; queries: number; totalImpressions: number; avgPosition: number;
        expansionScore: number; clusterType: string; topQueries: string[];
      }> = [];

      for (const [page, keywords] of pageMap) {
        const totalImp = keywords.reduce((s, k) => s + k.impressions, 0);
        const avgPos = keywords.reduce((s, k) => s + k.position * k.impressions, 0) / totalImp;
        const avgCtr = keywords.reduce((s, k) => s + k.ctr * k.impressions, 0) / totalImp;

        // Intent weight
        const commercialCount = keywords.filter(k => COMMERCIAL.some(c => k.query.toLowerCase().includes(c))).length;
        const intentWeight = 0.6 + (commercialCount / keywords.length) * 0.9;

        // Revenue potential proxy
        const revenuePotential = intentWeight * (totalImp / 100);

        // Competition density proxy
        const compDensity = avgPos < 10 ? 8 : avgPos < 20 ? 5 : 3;

        const expansionScore = Math.min(100, Math.round(
          (totalImp * intentWeight * revenuePotential) / Math.max(1, compDensity) / 100
        ));

        // Cluster type
        let clusterType = 'revenue_weighted';
        if (avgPos >= 15 && avgPos <= 40 && totalImp >= 20) clusterType = 'emerging';
        if (avgPos >= 8 && avgPos <= 20 && avgCtr < 0.03) clusterType = 'weak';

        clusters.push({
          page,
          queries: keywords.length,
          totalImpressions: totalImp,
          avgPosition: Math.round(avgPos * 10) / 10,
          expansionScore,
          clusterType,
          topQueries: keywords.sort((a, b) => b.impressions - a.impressions).slice(0, 5).map(k => k.query),
        });
      }

      clusters.sort((a, b) => b.expansionScore - a.expansionScore);

      // Cannibalization detection
      const queryPages = new Map<string, string[]>();
      for (const kw of gscData) {
        if (!queryPages.has(kw.query)) queryPages.set(kw.query, []);
        const pages = queryPages.get(kw.query)!;
        if (!pages.includes(kw.page)) pages.push(kw.page);
      }
      const cannibalized = [...queryPages.entries()]
        .filter(([, pages]) => pages.length > 1)
        .map(([query, pages]) => ({ query, pages, pageCount: pages.length }))
        .sort((a, b) => b.pageCount - a.pageCount)
        .slice(0, 10);

      return jsonResponse({
        ok: true,
        totalClusters: clusters.length,
        topClusters: clusters.slice(0, 15),
        cannibalized,
        cannibalizationCount: cannibalized.length,
      });
    }

    return jsonResponse({ ok: false, reason: 'Unknown action' });
  } catch (err) {
    console.error('[expansion-engine] Error:', err);
    return jsonResponse({ ok: false, reason: err instanceof Error ? err.message : 'INTERNAL_ERROR' }, 500);
  }
});
