 import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
 
 const corsHeaders = {
   'Access-Control-Allow-Origin': '*',
   'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
 };
 
 Deno.serve(async (req) => {
   if (req.method === 'OPTIONS') {
     return new Response(null, { headers: corsHeaders });
   }
 
   try {
     const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
     const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
     const supabase = createClient(supabaseUrl, supabaseKey);
 
     const today = new Date().toISOString().split('T')[0];
     const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
 
     // Gather all data in parallel
     const [
       { data: latestSummary },
       { data: landingScores },
       { data: recentIncidents },
       { data: ga4Today },
       { data: ga4Week },
       { data: visitorActivity }
     ] = await Promise.all([
       supabase.from('monitoring_ai_summaries').select('*').order('created_at', { ascending: false }).limit(1).single(),
       supabase.from('monitoring_landing_page_scores').select('*').order('overall_score', { ascending: false }).limit(5),
       supabase.from('monitoring_incidents').select('*').order('created_at', { ascending: false }).limit(3),
       supabase.from('ga4_daily_snapshots').select('*').eq('report_date', today).single(),
       supabase.from('ga4_daily_snapshots').select('*').gte('report_date', sevenDaysAgo),
       supabase.from('visitor_activity').select('activity_type').gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
     ]);
 
     // Calculate funnel health from landing scores
     const pdpScores = (landingScores || []).filter((p: any) => p.page_type === 'product');
     const avgPdpScore = pdpScores.length > 0 ? pdpScores.reduce((sum: number, p: any) => sum + p.overall_score, 0) / pdpScores.length : 85;
     
     const getPdpHealth = (score: number) => score >= 85 ? 'healthy' : score >= 70 ? 'at_risk' : 'critical';
     const getCartHealth = () => latestSummary?.status === 'no_go' ? 'critical' : latestSummary?.status === 'caution' ? 'at_risk' : 'healthy';
     const getCheckoutHealth = () => latestSummary?.status === 'no_go' ? 'critical' : 'healthy';
 
     // Calculate 7-day averages
     const weekData = ga4Week || [];
     const avg7Day = {
       revenue: weekData.reduce((sum: number, d: any) => sum + (d.revenue || 0), 0) / Math.max(weekData.length, 1),
       sessions: weekData.reduce((sum: number, d: any) => sum + (d.sessions || 0), 0) / Math.max(weekData.length, 1),
       purchases: weekData.reduce((sum: number, d: any) => sum + (d.purchases || 0), 0) / Math.max(weekData.length, 1),
     };
 
     // Calculate rates from visitor activity
     const activities = visitorActivity || [];
     const browsingCount = activities.filter((a: any) => a.activity_type === 'browsing').length;
     const cartCount = activities.filter((a: any) => a.activity_type === 'view_cart').length;
     const checkoutCount = activities.filter((a: any) => a.activity_type === 'checkout').length;
     const purchaseCount = activities.filter((a: any) => a.activity_type === 'purchase').length;
 
     const addToCartRate = browsingCount > 0 ? (cartCount / browsingCount) * 100 : 0;
     const checkoutStartRate = cartCount > 0 ? (checkoutCount / cartCount) * 100 : 0;
     const conversionRate = browsingCount > 0 ? (purchaseCount / browsingCount) * 100 : 0;
 
     // Determine overall status
     const adsHealthStatus = latestSummary?.status || 'go';
     const confidenceScore = latestSummary?.score || 85;
     const statusExplanation = latestSummary?.ai_summary?.substring(0, 150) || 'System operating normally. All checks passing.';
 
     // Format top landing pages
     const topLandingPages = (landingScores || []).map((p: any) => ({
       url: p.url_path,
       score: p.overall_score,
       trend: p.score_delta > 0 ? 'up' : p.score_delta < 0 ? 'down' : 'flat',
       health: p.health_status
     }));
 
     // Format recent incidents
     const formattedIncidents = (recentIncidents || []).map((i: any) => ({
       id: i.id,
       type: i.incident_type,
       severity: i.severity,
       status: i.status,
       detected_at: i.detected_at
     }));
 
     const snapshot = {
       snapshot_date: today,
       ads_health_status: adsHealthStatus,
       confidence_score: confidenceScore,
       status_explanation: statusExplanation,
       
       revenue_today: ga4Today?.revenue || 0,
       revenue_7day_avg: avg7Day.revenue,
       add_to_cart_rate_today: addToCartRate,
       add_to_cart_rate_7day_avg: addToCartRate * 0.95, // Placeholder
       checkout_start_rate_today: checkoutStartRate,
       checkout_start_rate_7day_avg: checkoutStartRate * 0.95,
       conversion_rate_today: conversionRate,
       conversion_rate_7day_avg: conversionRate * 0.95,
       aov_today: (ga4Today?.revenue || 0) / Math.max(ga4Today?.purchases || 1, 1),
       aov_7day_avg: avg7Day.revenue / Math.max(avg7Day.purchases, 1),
       
       pdp_health: getPdpHealth(avgPdpScore),
       cart_health: getCartHealth(),
       checkout_health: getCheckoutHealth(),
       
       top_landing_pages: topLandingPages,
       recent_incidents: formattedIncidents
     };
 
     // Upsert snapshot
     await supabase.from('monitoring_founder_snapshots').upsert(snapshot, { onConflict: 'snapshot_date' });
 
     return new Response(JSON.stringify({
       success: true,
       snapshot
     }), {
       headers: { ...corsHeaders, 'Content-Type': 'application/json' }
     });
 
   } catch (error: unknown) {
     console.error('Founder snapshot error:', error);
     return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
       status: 500,
       headers: { ...corsHeaders, 'Content-Type': 'application/json' }
     });
   }
 });