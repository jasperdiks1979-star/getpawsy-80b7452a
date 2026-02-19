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
 * GrowthBrain Orchestrator — discovers opportunities, scores them,
 * and produces a prioritized action batch. Phase 1 = OBSERVE mode only.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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
    const action = body.action || 'scan'; // scan | status | update_mode

    // Load AGM config
    const { data: config } = await supabase
      .from('agm_config').select('*').limit(1).maybeSingle();
    const executionMode = config?.execution_mode || 'observe';

    if (action === 'status') {
      // Return current state
      const { count: totalNodes } = await supabase
        .from('agm_opportunity_nodes').select('id', { count: 'exact', head: true });
      const { count: totalActions } = await supabase
        .from('agm_actions').select('id', { count: 'exact', head: true });
      const { count: queuedActions } = await supabase
        .from('agm_actions').select('id', { count: 'exact', head: true }).eq('status', 'queued');
      const { count: executedActions } = await supabase
        .from('agm_actions').select('id', { count: 'exact', head: true }).eq('status', 'executed');
      const { count: activeExperiments } = await supabase
        .from('agm_experiments').select('id', { count: 'exact', head: true }).eq('status', 'active');

      // Recent impact summary
      const { data: recentImpact } = await supabase
        .from('agm_impact_tracking')
        .select('baseline_impressions, day14_impressions, anomaly_detected')
        .not('day14_impressions', 'is', null)
        .order('created_at', { ascending: false })
        .limit(20);

      const totalUplift = (recentImpact || []).reduce((sum, r) => 
        sum + ((r.day14_impressions || 0) - (r.baseline_impressions || 0)), 0);
      const anomalies = (recentImpact || []).filter(r => r.anomaly_detected).length;

      return jsonResponse({
        ok: true, executionMode, config,
        stats: {
          totalNodes: totalNodes || 0,
          totalActions: totalActions || 0,
          queuedActions: queuedActions || 0,
          executedActions: executedActions || 0,
          activeExperiments: activeExperiments || 0,
          recentImpactUplift: totalUplift,
          anomalies,
        },
      });
    }

    if (action === 'update_mode') {
      const newMode = body.mode;
      if (!['observe', 'assisted', 'autonomous_safe', 'autonomous_full'].includes(newMode)) {
        return jsonResponse({ ok: false, reason: 'Invalid mode' });
      }
      await supabase.from('agm_config')
        .update({ execution_mode: newMode, updated_by: userId })
        .eq('id', config?.id);
      return jsonResponse({ ok: true, mode: newMode });
    }

    // ==========================================
    // SCAN: Discover opportunities from GSC data
    // ==========================================

    // 1. Fetch GSC keywords for opportunity scoring
    const { data: gscData } = await supabase
      .from('gsc_keywords')
      .select('query, page, clicks, impressions, ctr, position')
      .gt('impressions', 5)
      .order('impressions', { ascending: false })
      .limit(200);

    if (!gscData || gscData.length === 0) {
      return jsonResponse({ ok: true, opportunities: 0, message: 'No GSC data available for opportunity scanning.' });
    }

    // 2. Score each keyword-page pair
    const opportunities: Array<{
      nodeRef: string;
      nodeType: string;
      title: string;
      score: number;
      signals: Record<string, unknown>;
      suggestedActions: string[];
    }> = [];

    const playbook = config?.playbook_weights as Record<string, number> || {};

    for (const kw of gscData) {
      let score = 0;
      const signals: Record<string, unknown> = {};
      const suggestedActions: string[] = [];

      // Search demand proxy (0-30)
      const demandScore = Math.min(30, Math.log10(Math.max(1, kw.impressions)) * 10);
      score += demandScore;
      signals.demandScore = Math.round(demandScore * 10) / 10;

      // Low-hanging fruit: pos 4-20 (0-25)
      if (kw.position >= 4 && kw.position <= 20) {
        const fruitScore = 25 * (1 - (kw.position - 4) / 16);
        score += fruitScore;
        signals.lowHangingFruit = Math.round(fruitScore * 10) / 10;
        suggestedActions.push('CONTENT_REFRESH');
      }

      // High impressions + low CTR (0-20)
      if (kw.impressions > 20 && kw.ctr < 0.02) {
        const ctrOppScore = Math.min(20, (0.02 - kw.ctr) * 1000);
        score += ctrOppScore;
        signals.ctrOpportunity = Math.round(ctrOppScore * 10) / 10;
        suggestedActions.push('CONTENT_REFRESH');
      }

      // Position 6-25 ranking push zone (0-15)
      if (kw.position >= 6 && kw.position <= 25) {
        score += 15;
        signals.rankingPushZone = true;
        suggestedActions.push('INTERNAL_LINK_PATCH');
        suggestedActions.push('STRUCTURED_DATA_PATCH');
      }

      // Revenue intent proxy — commercial terms (0-10)
      const commercialTerms = ['best', 'buy', 'top', 'review', 'compare', 'price', 'cheap', 'deal'];
      if (commercialTerms.some(t => kw.query.toLowerCase().includes(t))) {
        score += 10;
        signals.commercialIntent = true;
      }

      // Apply playbook weights
      const primaryAction = suggestedActions[0] || 'CONTENT_REFRESH';
      const actionKey = primaryAction.toLowerCase();
      const weight = playbook[actionKey] || 1.0;
      score *= weight;

      // Cap at 100
      score = Math.min(100, Math.round(score * 10) / 10);

      if (score > 15) {
        opportunities.push({
          nodeRef: kw.page,
          nodeType: 'page',
          title: kw.query,
          score,
          signals: { ...signals, query: kw.query, impressions: kw.impressions, clicks: kw.clicks, ctr: kw.ctr, position: kw.position },
          suggestedActions: [...new Set(suggestedActions)],
        });
      }
    }

    // Sort by score descending
    opportunities.sort((a, b) => b.score - a.score);

    // Take top N based on daily budget
    const budget = config?.daily_action_budget || 10;
    const topOpportunities = opportunities.slice(0, budget * 2); // 2x for selection pool

    // 3. Upsert opportunity nodes
    const batchId = `scan_${Date.now().toString(36)}`;
    for (const opp of topOpportunities) {
      // Upsert into opportunity_nodes
      const { data: existing } = await supabase
        .from('agm_opportunity_nodes')
        .select('id, version')
        .eq('node_ref', opp.nodeRef)
        .eq('node_type', opp.nodeType)
        .maybeSingle();

      if (existing) {
        await supabase.from('agm_opportunity_nodes').update({
          opportunity_score: opp.score,
          signals: opp.signals as any,
          version: (existing.version || 1) + 1,
          title: opp.title,
        }).eq('id', existing.id);
      } else {
        await supabase.from('agm_opportunity_nodes').insert({
          node_type: opp.nodeType,
          node_ref: opp.nodeRef,
          title: opp.title,
          opportunity_score: opp.score,
          signals: opp.signals as any,
        });
      }

      // Create queued actions (observe mode = no execution)
      if (executionMode !== 'observe') {
        for (const actionType of opp.suggestedActions.slice(0, 2)) {
          const riskScore = actionType === 'INDEXING_SUBMIT' ? 8 
            : actionType === 'CONTENT_CREATE' ? 6 
            : actionType === 'CONTENT_REFRESH' ? 4
            : actionType === 'INTERNAL_LINK_PATCH' ? 2
            : actionType === 'STRUCTURED_DATA_PATCH' ? 3 : 5;

          // Only queue if risk is within mode allowance
          const maxRisk = executionMode === 'autonomous_safe' ? 5 : executionMode === 'autonomous_full' ? 8 : 10;
          if (riskScore <= maxRisk) {
            await supabase.from('agm_actions').insert({
              action_type: actionType,
              target_ref: opp.nodeRef,
              target_type: 'page',
              hypothesis: `Opportunity score ${opp.score}: ${Object.entries(opp.signals).filter(([k, v]) => v === true).map(([k]) => k).join(', ')}`,
              risk_score: riskScore,
              expected_uplift: { impressions_delta: Math.round(opp.score * 2), ctr_delta: 0.005 } as any,
              rollback_plan: `Revert ${actionType.toLowerCase()} changes on ${opp.nodeRef}`,
              execution_mode: executionMode,
              batch_id: batchId,
              priority: Math.round(opp.score),
            });
          }
        }
      }
    }

    return jsonResponse({
      ok: true,
      executionMode,
      opportunitiesFound: opportunities.length,
      topOpportunities: topOpportunities.slice(0, 10).map(o => ({
        page: o.nodeRef,
        query: o.title,
        score: o.score,
        suggestedActions: o.suggestedActions,
      })),
      actionsQueued: executionMode !== 'observe' ? topOpportunities.length : 0,
      batchId,
    });
  } catch (err) {
    console.error('[growth-brain] Error:', err);
    return jsonResponse({
      ok: false,
      reason: err instanceof Error ? err.message : 'INTERNAL_ERROR',
    }, 500);
  }
});
