import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE_URL = "https://getpawsy.pet";

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    // Get visitor activity for current period (last 24h)
    const { data: currentActivity } = await supabase
      .from("visitor_activity")
      .select("activity_type, page_path")
      .gte("created_at", twentyFourHoursAgo.toISOString())
      .lt("created_at", now.toISOString());

    // Get visitor activity for baseline period (24-48h ago)
    const { data: baselineActivity } = await supabase
      .from("visitor_activity")
      .select("activity_type, page_path")
      .gte("created_at", fortyEightHoursAgo.toISOString())
      .lt("created_at", twentyFourHoursAgo.toISOString());

    const calculateMetrics = (activities: typeof currentActivity) => {
      if (!activities || activities.length === 0) return { addToCart: 0, checkout: 0, purchase: 0, productViews: 0 };
      
      const productViews = activities.filter(a => a.activity_type === 'product_view').length;
      const addToCart = activities.filter(a => a.activity_type === 'add_to_cart').length;
      const checkout = activities.filter(a => a.activity_type === 'checkout').length;
      const purchase = activities.filter(a => a.activity_type === 'purchase').length;
      
      return {
        productViews,
        addToCart,
        checkout,
        purchase,
        addToCartRate: productViews > 0 ? (addToCart / productViews) * 100 : 0,
        checkoutStartRate: addToCart > 0 ? (checkout / addToCart) * 100 : 0,
      };
    };

    const currentMetrics = calculateMetrics(currentActivity);
    const baselineMetrics = calculateMetrics(baselineActivity);

    const alerts: Array<{ metric: string; currentValue: number; baselineValue: number; dropPercent: number }> = [];

    // Check for significant drops (≥30%)
    if (baselineMetrics.addToCartRate && baselineMetrics.addToCartRate > 0) {
      const drop = ((baselineMetrics.addToCartRate - (currentMetrics.addToCartRate || 0)) / baselineMetrics.addToCartRate) * 100;
      if (drop >= 30 && currentMetrics.productViews >= baselineMetrics.productViews * 0.8) {
        alerts.push({
          metric: 'add_to_cart_rate',
          currentValue: currentMetrics.addToCartRate || 0,
          baselineValue: baselineMetrics.addToCartRate,
          dropPercent: drop
        });
      }
    }

    if (baselineMetrics.checkoutStartRate && baselineMetrics.checkoutStartRate > 0) {
      const drop = ((baselineMetrics.checkoutStartRate - (currentMetrics.checkoutStartRate || 0)) / baselineMetrics.checkoutStartRate) * 100;
      if (drop >= 30 && currentMetrics.addToCart >= baselineMetrics.addToCart * 0.8) {
        alerts.push({
          metric: 'checkout_start_rate',
          currentValue: currentMetrics.checkoutStartRate || 0,
          baselineValue: baselineMetrics.checkoutStartRate,
          dropPercent: drop
        });
      }
    }

    // Update baselines
    for (const metric of ['add_to_cart_rate', 'checkout_start_rate', 'product_view_count']) {
      const value = metric === 'add_to_cart_rate' ? currentMetrics.addToCartRate :
                    metric === 'checkout_start_rate' ? currentMetrics.checkoutStartRate :
                    currentMetrics.productViews;
      
      await supabase.from("monitoring_conversion_baselines").upsert({
        metric_name: metric,
        page_type: 'all',
        baseline_value: value || 0,
        current_value: value || 0,
        sample_size: currentActivity?.length || 0,
        baseline_period_start: twentyFourHoursAgo.toISOString(),
        baseline_period_end: now.toISOString(),
        last_updated_at: now.toISOString(),
      }, { onConflict: 'metric_name,page_type' });
    }

    // Create P1 alerts for significant drops
    if (alerts.length > 0) {
      for (const alert of alerts) {
        await supabase.from("monitoring_alerts").upsert({
          alert_key: `conversion_drop_${alert.metric}`,
          severity: 'P1',
          category: 'conversion',
          title: `${alert.metric.replace(/_/g, ' ')} dropped ${alert.dropPercent.toFixed(1)}%`,
          description: `${alert.metric} dropped from ${alert.baselineValue.toFixed(1)}% to ${alert.currentValue.toFixed(1)}% (${alert.dropPercent.toFixed(1)}% drop) with stable traffic.`,
          affected_urls: [`${SITE_URL}/products`, `${SITE_URL}/bestsellers`],
          suggested_fix: 'Check for UX issues, broken add-to-cart buttons, or checkout blockers',
          last_detected_at: now.toISOString(),
          is_active: true,
        }, { onConflict: 'alert_key' });
      }

      // Send email alert
      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
      if (RESEND_API_KEY) {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "Monitoring <alerts@getpawsy.pet>",
            to: ["support@getpawsy.pet"],
            subject: `⚠️ Conversion Drop Alert - GetPawsy`,
            html: `<div style="font-family: sans-serif; max-width: 600px;">
              <h2 style="color: #f59e0b;">⚠️ Conversion Rate Drop Detected</h2>
              ${alerts.map(a => `<p><strong>${a.metric}:</strong> ${a.baselineValue.toFixed(1)}% → ${a.currentValue.toFixed(1)}% (${a.dropPercent.toFixed(1)}% drop)</p>`).join('')}
              <p>Traffic volume is stable, suggesting a UX or technical issue.</p>
            </div>`,
          }),
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      current_metrics: currentMetrics,
      baseline_metrics: baselineMetrics,
      alerts_triggered: alerts.length,
      alerts,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Conversion tracker error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});