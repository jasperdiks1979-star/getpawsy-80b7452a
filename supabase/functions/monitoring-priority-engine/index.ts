 import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
 
 const corsHeaders = {
   'Access-Control-Allow-Origin': '*',
   'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
 };
 
 interface PriorityItem {
   priority_rank: number;
   issue_summary: string;
   why_it_matters: string;
   estimated_impact: string;
   recommended_action: 'do_now' | 'schedule' | 'monitor';
   revenue_impact_score: number;
   ad_spend_at_risk: number;
   conversion_drop_percent: number;
   fix_complexity: 'quick_win' | 'medium' | 'heavy_work';
   affected_urls: string[];
   related_incident_id?: string;
 }
 
 Deno.serve(async (req) => {
   if (req.method === 'OPTIONS') {
     return new Response(null, { headers: corsHeaders });
   }
 
   try {
     const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
     const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
     const supabase = createClient(supabaseUrl, supabaseKey);
 
     // Gather data from multiple sources
     const [
       { data: incidents },
       { data: alerts },
       { data: landingScores },
       { data: predictiveAlerts },
       { data: qaResults }
     ] = await Promise.all([
       supabase.from('monitoring_incidents').select('*').eq('status', 'open').order('created_at', { ascending: false }).limit(20),
       supabase.from('monitoring_alerts').select('*').eq('is_active', true).order('severity', { ascending: true }),
       supabase.from('monitoring_landing_page_scores').select('*').order('overall_score', { ascending: true }).limit(10),
       supabase.from('monitoring_predictive_alerts').select('*').eq('is_active', true),
       supabase.from('product_qa_results').select('*').eq('qa_status', 'failed').limit(10)
     ]);
 
     const priorities: PriorityItem[] = [];
 
     // Priority 1: Critical landing pages (score < 70)
     const criticalPages = (landingScores || []).filter((p: any) => p.overall_score < 70);
     if (criticalPages.length > 0) {
       const worstPage = criticalPages[0];
       priorities.push({
         priority_rank: 1,
         issue_summary: `Critical landing page: ${worstPage.url_path} (Score: ${worstPage.overall_score})`,
         why_it_matters: 'Ad traffic to this page is at high risk of wasted spend. Low scores indicate conversion blockers.',
         estimated_impact: `↑ Conversion +15-25% if fixed. Current ads sending traffic here may have 0% ROI.`,
         recommended_action: 'do_now',
         revenue_impact_score: 95,
         ad_spend_at_risk: 500,
         conversion_drop_percent: 100 - worstPage.overall_score,
         fix_complexity: 'medium',
         affected_urls: [worstPage.url_path]
       });
     }
 
     // Priority 2: Open P1 incidents
     const p1Incidents = (incidents || []).filter((i: any) => i.severity === 'critical' || i.severity === 'high');
     if (p1Incidents.length > 0) {
       const topIncident = p1Incidents[0];
       priorities.push({
         priority_rank: priorities.length + 1,
         issue_summary: `Open P1 incident: ${topIncident.incident_type}`,
         why_it_matters: 'P1 incidents directly block revenue. Every hour unresolved = lost sales.',
         estimated_impact: `↓ Risk of NO-GO status. Prevents automatic ad pauses.`,
         recommended_action: 'do_now',
         revenue_impact_score: 90,
         ad_spend_at_risk: 300,
         conversion_drop_percent: 20,
         fix_complexity: topIncident.root_cause_summary ? 'quick_win' : 'medium',
         affected_urls: topIncident.affected_files || [],
         related_incident_id: topIncident.id
       });
     }
 
     // Priority 3: Predictive alerts (pre-NO-GO warnings)
     if ((predictiveAlerts || []).length > 0) {
       const topAlert = predictiveAlerts![0];
       priorities.push({
         priority_rank: priorities.length + 1,
         issue_summary: `Predicted risk: ${topAlert.alert_type} (${topAlert.estimated_hours_to_nogo}h to NO-GO)`,
         why_it_matters: 'Early intervention prevents costly NO-GO states and automatic ad pauses.',
         estimated_impact: `↓ Prevents budget taper. Maintains full ad velocity.`,
         recommended_action: 'schedule',
         revenue_impact_score: 75,
         ad_spend_at_risk: 200,
         conversion_drop_percent: 10,
         fix_complexity: 'medium',
         affected_urls: topAlert.affected_urls || []
       });
     }
 
     // Priority 4: Failed product QA
     if ((qaResults || []).length > 0) {
       const failedProducts = qaResults!.slice(0, 3);
       priorities.push({
         priority_rank: priorities.length + 1,
         issue_summary: `${failedProducts.length} products blocked from ads (QA failed)`,
         why_it_matters: 'These products cannot be promoted until QA passes. Potential revenue sitting idle.',
         estimated_impact: `↑ Unlock ${failedProducts.length} products for promotion.`,
         recommended_action: 'schedule',
         revenue_impact_score: 60,
         ad_spend_at_risk: 0,
         conversion_drop_percent: 0,
         fix_complexity: 'quick_win',
         affected_urls: failedProducts.map((p: any) => `/product/${p.product_slug}`)
       });
     }
 
     // Priority 5: At-risk landing pages (score 70-84)
     const atRiskPages = (landingScores || []).filter((p: any) => p.overall_score >= 70 && p.overall_score < 85);
     if (atRiskPages.length > 0) {
       priorities.push({
         priority_rank: priorities.length + 1,
         issue_summary: `${atRiskPages.length} landing pages at risk (Score 70-84)`,
         why_it_matters: 'These pages may degrade to critical. Proactive fixes maintain ad performance.',
         estimated_impact: `↑ Conversion +5-10%. Prevents future NO-GO.`,
         recommended_action: 'monitor',
         revenue_impact_score: 50,
         ad_spend_at_risk: 100,
         conversion_drop_percent: 5,
         fix_complexity: 'medium',
         affected_urls: atRiskPages.slice(0, 3).map((p: any) => p.url_path)
       });
     }
 
     // Ensure max 5 priorities and sort by revenue impact
     const sortedPriorities = priorities
       .sort((a, b) => b.revenue_impact_score - a.revenue_impact_score)
       .slice(0, 5)
       .map((p, index) => ({ ...p, priority_rank: index + 1 }));
 
     // Clear old active priorities and insert new ones
     await supabase.from('monitoring_priority_rankings').update({ is_active: false }).eq('is_active', true);
     
     if (sortedPriorities.length > 0) {
       await supabase.from('monitoring_priority_rankings').insert(sortedPriorities);
     }
 
     // Log to audit
     await supabase.from('monitoring_audit_logs').insert({
       action_type: 'priority_calculation',
       action_taken: `Generated ${sortedPriorities.length} priority items`,
       trigger_condition: 'scheduled_or_manual',
       severity: sortedPriorities.length > 0 && sortedPriorities[0].recommended_action === 'do_now' ? 'high' : 'info',
       affected_urls: sortedPriorities.flatMap(p => p.affected_urls),
       metadata: { priorities: sortedPriorities }
     });
 
     return new Response(JSON.stringify({
       success: true,
       priorities: sortedPriorities,
       generated_at: new Date().toISOString()
     }), {
       headers: { ...corsHeaders, 'Content-Type': 'application/json' }
     });
 
   } catch (error: unknown) {
     console.error('Priority engine error:', error);
     return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
       status: 500,
       headers: { ...corsHeaders, 'Content-Type': 'application/json' }
     });
   }
 });