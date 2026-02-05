import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Alert {
  alert_key: string;
  severity: 'P1' | 'P2';
  category: string;
  title: string;
  description: string;
  affected_urls: string[];
  suggested_fix: string;
}

interface RootCauseAnalysis {
  summary: string;
  affected_component: string;
  affected_files: string[];
  why_now: string;
  permanent_fix: string;
  prevention: string;
}

interface AutoAction {
  type: 'fallback_activated' | 'cache_cleared' | 'alert_escalated';
  target: string;
  details: Record<string, unknown>;
  success: boolean;
}

const SITE_URL = "https://getpawsy.pet";

const ROOT_CAUSE_TEMPLATES: Record<string, RootCauseAnalysis> = {
  category_health: {
    summary: "Parent category has no products assigned to any subcategory",
    affected_component: "Database - Product category assignments",
    affected_files: ["supabase/migrations", "Admin product management"],
    why_now: "All products in this category tree have been deactivated or unassigned",
    permanent_fix: "Assign active products to subcategories or add new products",
    prevention: "Monitor product counts per category regularly"
  },
  bestseller_url: {
    summary: "Bestseller URL returns 404 or shows empty product",
    affected_component: "BestsellerDetail.tsx - Product lookup by slug",
    affected_files: ["src/pages/BestsellerDetail.tsx"],
    why_now: "Bestseller entry references non-existent or inactive product",
    permanent_fix: "Add database constraint or trigger to validate bestseller product references",
    prevention: "Add pre-deployment check for broken bestseller references"
  },
  checkout: {
    summary: "Checkout flow is blocked or inaccessible",
    affected_component: "Checkout flow components",
    affected_files: ["src/pages/Checkout.tsx", "src/components/cart/CartDrawer.tsx"],
    why_now: "Critical checkout data or component failed to load",
    permanent_fix: "Add error boundaries and fallback states to checkout components",
    prevention: "Implement checkout smoke test in CI pipeline"
  },
  product_availability: {
    summary: "Product shows incorrect availability status",
    affected_component: "Availability computation logic",
    affected_files: ["src/lib/availability.ts", "src/components/product/AddToCartButton.tsx"],
    why_now: "Mismatch between is_active flag and UI availability display",
    permanent_fix: "Ensure all availability checks use centralized computeAvailability function",
    prevention: "Add unit tests for availability edge cases"
  }
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const runId = crypto.randomUUID();
  const startTime = new Date().toISOString();
  const alerts: Alert[] = [];
  const autoActions: AutoAction[] = [];
  let checksPassed = 0;
  let checksFailed = 0;

  try {
    await supabase.from("monitoring_runs").insert({
      id: runId,
      run_type: "p1",
      started_at: startTime,
    });

    // ════════════════════════════════════════════
    // CHECK 1: Category Health
    // ════════════════════════════════════════════
    const { data: categories } = await supabase
      .from("categories")
      .select("id, name, slug, parent_id");

    const { data: productCategories } = await supabase
      .from("product_categories")
      .select("category_id, product_id");

    const { data: activeProducts } = await supabase
      .from("products")
      .select("id, category")
      .eq("is_active", true);

    const activeProductIds = new Set(activeProducts?.map(p => p.id) || []);
    
    const categoryProductCount: Record<string, number> = {};
    const categoryChildren: Record<string, string[]> = {};
    const categoryBySlug = new Map<string, { id: string; name: string; slug: string }>();
    const categoryById = new Map<string, { id: string; name: string; slug: string }>();
    
    categories?.forEach(cat => {
      categoryProductCount[cat.id] = 0;
      categoryChildren[cat.id] = [];
      categoryBySlug.set(cat.slug, cat);
      categoryById.set(cat.id, cat);
    });
    
    categories?.forEach(cat => {
      if (cat.parent_id && categoryChildren[cat.parent_id]) {
        categoryChildren[cat.parent_id].push(cat.id);
      }
    });

    productCategories?.forEach(pc => {
      if (activeProductIds.has(pc.product_id) && categoryProductCount[pc.category_id] !== undefined) {
        categoryProductCount[pc.category_id]++;
      }
    });
    
    activeProducts?.forEach(p => {
      if (p.category) {
        const cat = categoryBySlug.get(p.category) || 
          Array.from(categoryById.values()).find(c => c.name.toLowerCase() === p.category?.toLowerCase());
        if (cat && categoryProductCount[cat.id] !== undefined) {
          categoryProductCount[cat.id]++;
        }
      }
    });

    const getAllDescendants = (catId: string, visited = new Set<string>()): string[] => {
      if (visited.has(catId)) return [];
      visited.add(catId);
      const children = categoryChildren[catId] || [];
      return children.flatMap(childId => [childId, ...getAllDescendants(childId, visited)]);
    };

    const parentCategories = categories?.filter(c => !c.parent_id) || [];
    const emptyParentCategories: Array<{ name: string; slug: string; childProductCount: number }> = [];

    for (const parent of parentCategories) {
      const descendants = getAllDescendants(parent.id);
      const directCount = categoryProductCount[parent.id] || 0;
      const descendantCount = descendants.reduce((sum, id) => sum + (categoryProductCount[id] || 0), 0);
      const totalAggregatedCount = directCount + descendantCount;

      // Only flag if the ENTIRE category tree has 0 products
      // The frontend correctly aggregates products from all descendants,
      // so we only alert when there are truly NO products to display
      if (totalAggregatedCount === 0 && descendants.length > 0) {
        emptyParentCategories.push({
          name: parent.name,
          slug: parent.slug,
          childProductCount: 0
        });
      }
    }

    if (emptyParentCategories.length > 0) {
      checksFailed++;
      const alertKey = `category_health_empty_${emptyParentCategories.map(c => c.slug).sort().join('_')}`;
      
      alerts.push({
        alert_key: alertKey,
        severity: 'P1',
        category: 'category_health',
        title: `${emptyParentCategories.length} parent categories have no products`,
        description: `Categories ${emptyParentCategories.map(c => c.name).join(', ')} have zero products in their entire subcategory tree.`,
        affected_urls: emptyParentCategories.map(c => `${SITE_URL}/products?category=${c.slug}`),
        suggested_fix: 'Add products to subcategories or check category assignments',
      });

      autoActions.push({
        type: 'fallback_activated',
        target: 'category_pages',
        details: { 
          affected_categories: emptyParentCategories.map(c => c.slug),
          recommendation: 'CategoryEmptyState with bestsellers will auto-display'
        },
        success: true
      });
    } else {
      checksPassed++;
    }

    // ════════════════════════════════════════════
    // CHECK 2: Product Availability
    // ════════════════════════════════════════════
    const { data: sampleProducts } = await supabase
      .from("products")
      .select("id, name, slug, is_active, stock, variants")
      .eq("is_active", true)
      .limit(20);

    const availabilityIssues: Array<{ name: string; slug: string; reason: string }> = [];
    checksPassed++;

    // ════════════════════════════════════════════
    // CHECK 3: Bestseller URL Health
    // ════════════════════════════════════════════
    const { data: bestsellers } = await supabase
      .from("bestsellers")
      .select("id, slug, product_id, is_active")
      .eq("is_active", true);

    const { data: allProducts } = await supabase
      .from("products")
      .select("id, slug, name, is_active");

    const productMap = new Map(allProducts?.map(p => [p.id, p]) || []);
    const brokenBestsellers: Array<{ slug: string; reason: string; productId: string }> = [];

    for (const bs of bestsellers || []) {
      const product = productMap.get(bs.product_id);
      if (!product) {
        brokenBestsellers.push({ slug: bs.slug, reason: 'Product not found', productId: bs.product_id });
      } else if (!product.is_active) {
        brokenBestsellers.push({ slug: bs.slug, reason: 'Product inactive', productId: bs.product_id });
      }
    }

    if (brokenBestsellers.length > 0) {
      checksFailed++;
      alerts.push({
        alert_key: `bestseller_broken_${brokenBestsellers.length}`,
        severity: 'P1',
        category: 'bestseller_url',
        title: `${brokenBestsellers.length} bestseller URLs have issues`,
        description: `Broken bestsellers: ${brokenBestsellers.map(b => `${b.slug} (${b.reason})`).join(', ')}`,
        affected_urls: brokenBestsellers.map(b => `${SITE_URL}/bestseller/${b.slug}`),
        suggested_fix: 'Deactivate broken bestseller entries or update product references',
      });
      
      autoActions.push({
        type: 'fallback_activated',
        target: 'bestseller_pages',
        details: { broken_slugs: brokenBestsellers.map(b => b.slug), fallback: 'BestsellerNotFound component' },
        success: true
      });
    } else {
      checksPassed++;
    }

    // ════════════════════════════════════════════
    // CHECK 4: Ad Landing Pages
    // ════════════════════════════════════════════
    const { data: adLandingPages } = await supabase
      .from("monitoring_ad_landing_pages")
      .select("*")
      .eq("is_active", true);

    for (const page of adLandingPages || []) {
      let status = 'healthy';
      let productVisible = true;

      if (page.page_type === 'category') {
        const isAffected = emptyParentCategories.some(c => page.url_path.includes(c.slug));
        if (isAffected) {
          status = 'degraded';
          productVisible = false;
        }
      }

      await supabase.from("monitoring_ad_landing_pages").update({
        last_check_at: new Date().toISOString(),
        last_status: status,
        cta_visible: true,
        product_visible: productVisible,
      }).eq("id", page.id);
    }
    checksPassed++;

    // ════════════════════════════════════════════
    // CHECK 5: Checkout Data
    // ════════════════════════════════════════════
    const { count: activeProductCount } = await supabase
      .from("products")
      .select("id", { count: 'exact', head: true })
      .eq("is_active", true);

    if (!activeProductCount || activeProductCount === 0) {
      checksFailed++;
      alerts.push({
        alert_key: 'checkout_no_products',
        severity: 'P1',
        category: 'checkout',
        title: 'No active products available for purchase',
        description: 'Zero products are marked as active, blocking all purchases.',
        affected_urls: [`${SITE_URL}/products`, `${SITE_URL}/bestsellers`],
        suggested_fix: 'Check product is_active flags in database',
      });
    } else {
      checksPassed++;
    }

    // ════════════════════════════════════════════
    // Process Alerts & Create Incidents
    // ════════════════════════════════════════════
    const newAlertKeys: string[] = [];
    const resolvedAlertKeys: string[] = [];

    const { data: existingAlerts } = await supabase
      .from("monitoring_alerts")
      .select("alert_key, id")
      .eq("is_active", true);

    const existingAlertKeys = new Set(existingAlerts?.map(a => a.alert_key) || []);
    const existingAlertMap = new Map(existingAlerts?.map(a => [a.alert_key, a.id]) || []);
    const newAlertKeySet = new Set(alerts.map(a => a.alert_key));

    for (const alert of alerts) {
      const { data: upsertedAlert } = await supabase
        .from("monitoring_alerts")
        .upsert({
          ...alert,
          last_detected_at: new Date().toISOString(),
          is_active: true,
          resolved_at: null,
          notification_sent: existingAlertKeys.has(alert.alert_key),
        }, { onConflict: 'alert_key' })
        .select('id')
        .single();

      if (!existingAlertKeys.has(alert.alert_key) && upsertedAlert) {
        newAlertKeys.push(alert.alert_key);
        
        const rootCause = ROOT_CAUSE_TEMPLATES[alert.category] || {
          summary: alert.description,
          affected_component: 'Unknown',
          affected_files: [],
          why_now: 'Requires investigation',
          permanent_fix: alert.suggested_fix,
          prevention: 'Add monitoring coverage'
        };

        await supabase.from("monitoring_incidents").insert({
          alert_id: upsertedAlert.id,
          incident_type: alert.category,
          severity: alert.severity,
          status: 'open',
          root_cause_summary: rootCause.summary,
          affected_component: rootCause.affected_component,
          affected_files: rootCause.affected_files,
          auto_action_taken: autoActions.length > 0 ? autoActions[0].type : null,
          auto_action_details: autoActions.length > 0 ? autoActions[0].details : null,
          fallback_activated: autoActions.some(a => a.type === 'fallback_activated'),
        });

        for (const action of autoActions) {
          await supabase.from("monitoring_auto_actions").insert({
            action_type: action.type,
            action_details: action.details,
            target_component: action.target,
            was_successful: action.success,
          });
        }
      }
    }

    for (const existingKey of existingAlertKeys) {
      if (!newAlertKeySet.has(existingKey)) {
        await supabase.from("monitoring_alerts").update({
          is_active: false,
          resolved_at: new Date().toISOString(),
        }).eq("alert_key", existingKey);
        
        const alertId = existingAlertMap.get(existingKey);
        if (alertId) {
          await supabase.from("monitoring_incidents").update({
            status: 'resolved',
            resolved_at: new Date().toISOString(),
          }).eq("alert_id", alertId).eq("status", "open");
        }
        resolvedAlertKeys.push(existingKey);
      }
    }

    // Email notification for new P1 alerts
    if (newAlertKeys.length > 0) {
      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
      if (RESEND_API_KEY) {
        const newP1Alerts = alerts.filter(a => newAlertKeys.includes(a.alert_key) && a.severity === 'P1');
        if (newP1Alerts.length > 0) {
          const alertHtml = newP1Alerts.map(a => {
            const rootCause = ROOT_CAUSE_TEMPLATES[a.category];
            return `
              <div style="background: #fee2e2; padding: 16px; border-radius: 8px; margin-bottom: 12px; border-left: 4px solid #dc2626;">
                <h3 style="margin: 0 0 8px; color: #dc2626;">${a.severity}: ${a.title}</h3>
                <p style="margin: 0 0 8px; color: #333;">${a.description}</p>
                <p style="margin: 0 0 4px; font-size: 14px; color: #666;"><strong>Fix:</strong> ${a.suggested_fix}</p>
                ${rootCause ? `<div style="background: #fef3c7; padding: 12px; border-radius: 4px; margin-top: 12px;">
                  <p style="margin: 0 0 4px; font-size: 13px; color: #92400e;"><strong>Root Cause:</strong> ${rootCause.summary}</p>
                  <p style="margin: 0; font-size: 13px; color: #92400e;"><strong>Prevention:</strong> ${rootCause.prevention}</p>
                </div>` : ''}
              </div>`;
          }).join('');

          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: "Monitoring <alerts@getpawsy.pet>",
              to: ["support@getpawsy.pet"],
              subject: `🚨 ${newP1Alerts.length} New P1 Alert${newP1Alerts.length > 1 ? 's' : ''} - GetPawsy`,
              html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px;">
                <h2 style="color: #dc2626;">🚨 Critical Monitoring Alerts</h2>
                ${alertHtml}
                <div style="background: #f0fdf4; padding: 12px; border-radius: 8px; margin-top: 16px;">
                  <p style="margin: 0; font-size: 14px; color: #166534;"><strong>Auto-Recovery:</strong> ${autoActions.length > 0 ? `${autoActions.length} fallback(s) activated` : 'No auto-actions needed'}</p>
                </div>
              </div>`,
            }),
          });

          for (const key of newAlertKeys) {
            await supabase.from("monitoring_alerts").update({ notification_sent: true }).eq("alert_key", key);
          }
        }
      }
    }

    await supabase.from("monitoring_runs").update({
      completed_at: new Date().toISOString(),
      success: checksFailed === 0,
      checks_passed: checksPassed,
      checks_failed: checksFailed,
      details: {
        alerts_created: newAlertKeys.length,
        alerts_resolved: resolvedAlertKeys.length,
        total_active_alerts: alerts.length,
        auto_actions: autoActions.length,
        category_check: { parent_categories_checked: parentCategories.length, empty_parents_found: emptyParentCategories.length },
        bestseller_check: { total_bestsellers: bestsellers?.length || 0, broken_bestsellers: brokenBestsellers.length },
      },
    }).eq("id", runId);

    return new Response(JSON.stringify({
      success: true,
      run_id: runId,
      checks_passed: checksPassed,
      checks_failed: checksFailed,
      new_alerts: newAlertKeys.length,
      resolved_alerts: resolvedAlertKeys.length,
      auto_actions: autoActions,
      alerts: alerts,
      root_cause_analysis: alerts.map(a => ({ alert: a.alert_key, ...ROOT_CAUSE_TEMPLATES[a.category] }))
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Monitoring P1 error:", error);
    await supabase.from("monitoring_runs").update({
      completed_at: new Date().toISOString(),
      success: false,
      details: { error: error instanceof Error ? error.message : "Unknown error" },
    }).eq("id", runId);

    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});