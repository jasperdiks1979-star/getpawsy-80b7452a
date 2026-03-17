import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Performance budget thresholds (in ms, except CLS which is unitless)
const BUDGETS = {
  LCP: { warning: 2500, critical: 4000 },
  FID: { warning: 100, critical: 300 },
  CLS: { warning: 0.1, critical: 0.25 },
  FCP: { warning: 1800, critical: 3000 },
  TTFB: { warning: 800, critical: 1800 },
  INP: { warning: 200, critical: 500 },
};

// Minimum samples before sending alert (to avoid noise)
const MIN_SAMPLES_FOR_ALERT = 10;

// Cooldown period between alerts (1 hour)
const ALERT_COOLDOWN_MS = 60 * 60 * 1000;

interface MetricReport {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  pageUrl?: string;
  sessionId?: string;
  userAgent?: string;
}

interface AlertCheckResult {
  shouldAlert: boolean;
  thresholdType: 'warning' | 'critical' | null;
  avgValue: number;
  sampleCount: number;
}

async function checkIfShouldAlert(
  supabase: ReturnType<typeof createClient>,
  metricName: string
): Promise<AlertCheckResult> {
  // Get metrics from last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  
  const { data: recentMetrics, error } = await supabase
    .from('performance_metrics')
    .select('metric_value')
    .eq('metric_name', metricName)
    .gte('created_at', oneHourAgo);

  if (error || !recentMetrics || recentMetrics.length < MIN_SAMPLES_FOR_ALERT) {
    return { shouldAlert: false, thresholdType: null, avgValue: 0, sampleCount: 0 };
  }

  const avgValue = (recentMetrics as Array<{ metric_value: number }>).reduce((sum, m) => sum + Number(m.metric_value), 0) / recentMetrics.length;
  const budget = BUDGETS[metricName as keyof typeof BUDGETS];
  
  if (!budget) {
    return { shouldAlert: false, thresholdType: null, avgValue, sampleCount: recentMetrics.length };
  }

  // Check if we recently sent an alert
  const { data: recentAlert } = await supabase
    .from('performance_alerts')
    .select('notified_at')
    .eq('metric_name', metricName)
    .order('notified_at', { ascending: false })
    .limit(1)
    .single();

  if (recentAlert && recentAlert.notified_at) {
    const lastAlertTime = new Date(recentAlert.notified_at as string).getTime();
    if (Date.now() - lastAlertTime < ALERT_COOLDOWN_MS) {
      return { shouldAlert: false, thresholdType: null, avgValue, sampleCount: recentMetrics.length };
    }
  }

  // Determine threshold type
  if (avgValue >= budget.critical) {
    return { shouldAlert: true, thresholdType: 'critical', avgValue, sampleCount: recentMetrics.length };
  }
  if (avgValue >= budget.warning) {
    return { shouldAlert: true, thresholdType: 'warning', avgValue, sampleCount: recentMetrics.length };
  }

  return { shouldAlert: false, thresholdType: null, avgValue, sampleCount: recentMetrics.length };
}

async function sendPerformanceAlert(
  metricName: string,
  thresholdType: 'warning' | 'critical',
  currentValue: number,
  thresholdValue: number,
  sampleCount: number
): Promise<void> {
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY not configured');
    return;
  }

  const isWarning = thresholdType === 'warning';
  const emoji = isWarning ? '⚠️' : '🚨';
  const severity = isWarning ? 'Warning' : 'Critical';
  const unit = metricName === 'CLS' ? '' : 'ms';

  const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: ${isWarning ? '#f59e0b' : '#dc2626'}; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
        .metric-box { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid ${isWarning ? '#f59e0b' : '#dc2626'}; }
        .metric-name { font-size: 18px; font-weight: bold; color: #111; }
        .metric-value { font-size: 24px; font-weight: bold; color: ${isWarning ? '#f59e0b' : '#dc2626'}; }
        .threshold { color: #6b7280; font-size: 14px; }
        .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${emoji} Performance ${severity}: ${metricName}</h1>
        </div>
        <div class="content">
          <p>De Core Web Vital <strong>${metricName}</strong> heeft de ${thresholdType} drempel overschreden op GetPawsy.</p>
          
          <div class="metric-box">
            <div class="metric-name">${metricName}</div>
            <div class="metric-value">${metricName === 'CLS' ? currentValue.toFixed(3) : Math.round(currentValue)}${unit}</div>
            <div class="threshold">
              Budget: ${metricName === 'CLS' ? thresholdValue.toFixed(2) : thresholdValue}${unit} | 
              Gebaseerd op ${sampleCount} metingen (laatste uur)
            </div>
          </div>

          <h3>Aanbevolen acties:</h3>
          <ul>
            ${metricName === 'LCP' ? `
              <li>Optimaliseer hero afbeeldingen (compressie, WebP formaat)</li>
              <li>Implementeer lazy loading voor niet-kritieke afbeeldingen</li>
              <li>Gebruik preload voor kritieke resources</li>
            ` : ''}
            ${metricName === 'FID' || metricName === 'INP' ? `
              <li>Minimaliseer JavaScript bundle grootte</li>
              <li>Gebruik code splitting en lazy loading</li>
              <li>Vermijd lange JavaScript taken</li>
            ` : ''}
            ${metricName === 'CLS' ? `
              <li>Specificeer afmetingen voor afbeeldingen en iframes</li>
              <li>Reserveer ruimte voor dynamische content</li>
              <li>Vermijd het toevoegen van content boven bestaande content</li>
            ` : ''}
            ${metricName === 'FCP' ? `
              <li>Optimaliseer kritieke CSS</li>
              <li>Verminder render-blocking resources</li>
              <li>Gebruik font-display: swap voor webfonts</li>
            ` : ''}
            ${metricName === 'TTFB' ? `
              <li>Controleer server responstijden</li>
              <li>Implementeer CDN caching</li>
              <li>Optimaliseer database queries</li>
            ` : ''}
          </ul>

          <div class="footer">
            <p>Deze alert wordt automatisch verzonden door het GetPawsy performance monitoring systeem.</p>
            <p>Alerts worden maximaal 1x per uur per metric verzonden om spam te voorkomen.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Performance Alerts <alerts@getpawsy.pet>',
      to: ['support@getpawsy.pet'],
      subject: `${emoji} ${severity}: ${metricName} overschrijdt ${thresholdType} drempel`,
      html: emailHtml,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Failed to send alert email: ${response.status} - ${errorText}`);
  } else {
    console.log(`Performance alert sent for ${metricName}`);
  }
}

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json();
    const metrics: MetricReport[] = Array.isArray(body) ? body : [body];

    // Insert all metrics
    const metricsToInsert = metrics.map(m => ({
      metric_name: m.name,
      metric_value: m.value,
      rating: m.rating,
      page_url: m.pageUrl,
      session_id: m.sessionId,
      user_agent: m.userAgent,
    }));

    const { error: insertError } = await supabase
      .from('performance_metrics')
      .insert(metricsToInsert);

    if (insertError) {
      console.error('Error inserting metrics:', insertError);
    }

    // Check for alerts (only for poor ratings)
    for (const metric of metrics) {
      if (metric.rating === 'poor') {
        const alertCheck = await checkIfShouldAlert(supabase as ReturnType<typeof createClient>, metric.name);
        
        if (alertCheck.shouldAlert && alertCheck.thresholdType) {
          const budget = BUDGETS[metric.name as keyof typeof BUDGETS];
          const thresholdValue = alertCheck.thresholdType === 'critical' 
            ? budget.critical 
            : budget.warning;

          // Record the alert
          await supabase.from('performance_alerts').insert({
            metric_name: metric.name,
            threshold_type: alertCheck.thresholdType,
            current_value: alertCheck.avgValue,
            threshold_value: thresholdValue,
            sample_count: alertCheck.sampleCount,
          });

          // Send email alert
          await sendPerformanceAlert(
            metric.name,
            alertCheck.thresholdType,
            alertCheck.avgValue,
            thresholdValue,
            alertCheck.sampleCount
          );
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed: metrics.length }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in report-web-vitals:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
