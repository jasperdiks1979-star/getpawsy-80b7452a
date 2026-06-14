/**
 * Edge Functions Health
 *
 * Boot-pings every deployed edge function with an OPTIONS request and
 * reports per-function runtime status. A function that fails to import
 * (TypeScript runtime error, missing secret at top-level, etc.) returns
 * 5xx with a `BOOT_ERROR` body — that's the signal we surface as `error`.
 *
 * Auth: admin only.
 * Concurrency: capped (default 8) to avoid hammering the platform.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Hardcoded list of all edge functions in this project. Kept here (rather
// than read from disk) so the function works in the deployed sandbox where
// the filesystem is read-only and other function sources aren't reachable.
const FUNCTIONS: string[] = [
  "add-internal-links-to-blogs","admin-payments","ai-balance-check","ai-content-expansion",
  "ai-content-generate","ai-content-generator","ai-conversion-engine","ai-homepage-engine",
  "ai-homepage-event","ai-insights-generate","ai-landing-match","ai-priority-engine",
  "ai-revenue-insights","ai-traffic-classify","analyze-competitors","api-health",
  "attribution-health-test","audit-warehouse-shipping","authority-engine","auto-publish-guides",
  "autonomous-seo-engine","background-batch-runner","batch-cluster-pipeline","batch-generate-blog-images",
  "cancel-run","check-klarna-eligibility","cinematic-ad-alert-monitor","cinematic-ad-approve",
  "cinematic-ad-auto-approve","cinematic-ad-autopilot","cinematic-ad-autopublish","cinematic-ad-claim-job",
  "cinematic-ad-complete-job","cinematic-ad-dispatch","cinematic-ad-dna-bias","cinematic-ad-e2e-test",
  "cinematic-ad-e2e-verify","cinematic-ad-e2e-verify-disable","cinematic-ad-fail-job","cinematic-ad-hook-generator",
  "cinematic-ad-hook-optimizer","cinematic-ad-intelligence","cinematic-ad-kick-pending","cinematic-ad-operator",
  "cinematic-ad-plan","cinematic-ad-preflight","cinematic-ad-prepare","cinematic-ad-prepare-for-render",
  "cinematic-ad-push-pinterest","cinematic-ad-queue-render","cinematic-ad-recover-requeue","cinematic-ad-regenerate",
  "cinematic-ad-render-webhook","cinematic-ad-repair-job","cinematic-ad-rescore-bulk","cinematic-ad-smoke-test",
  "cinematic-ad-storyboard","cinematic-ad-test-batch","cinematic-ad-validate","cinematic-ad-watchdog",
  "cinematic-ad-worker-control","cinematic-ad-worker-health","cinematic-ads-archive-stale","cinematic-campaign-12pack",
  "cinematic-director-decide","cinematic-director-feedback","cinematic-fidelity-auto-regen","cinematic-fidelity-check",
  "cinematic-force-approve-batch","cinematic-hook-engine","cinematic-job-verify","cinematic-motion-engine",
  "cinematic-performance-ingest","cinematic-pin-performance-sync","cinematic-pinterest-perf","cinematic-runway-approve",
  "cinematic-runway-finalize","cinematic-runway-generate","cinematic-runway-merge","cinematic-runway-poll",
  "cinematic-runway-voiceover","cinematic-story-arc","cinematic-style-performance-rollup","cinematic-system-truth",
  "cinematic-voice-engine","cinematic-voice-selector","cinematic-voiceover-alert","cinematic-voiceover-backfill",
  "cinematic-voiceover-generate","cj-backfill-media-variants","cj-dropshipping","cj-google-sync",
  "cj-health-check","cj-inventory-sync","cj-media-driver","cj-nightly-product-sync",
  "cj-payload-audit","cj-register-webhook","cj-rehost-existing-videos","cj-rehost-product-images",
  "cj-stock-reconcile","cj-sync-packaging-stock","cj-upload-packaging-design","cj-us-hunter",
  "cj-variant-repair","cj-video-diagnostic","cj-video-ingest-worker","cj-video-resolve",
  "cj-warehouse-normalize","cj-webhook","cohort-copy-winner-pin","collect-vitals",
  "compare-user-agents","create-checkout","create-cj-order","create-test-checkout",
  "credential-health-check","cta-copy-winner-elector","cta-copy-winner-elector-by-hook","cta-variant-rollback-guard",
  "deploy-verify","domain-health-check","edge-functions-health","elevenlabs-key-test",
  "execution-governor","executive-revenue-report","expansion-engine","export-cwv-evidence",
  "export-diagnostics","export-logs","export-merchant-feed","export-products-csv",
  "export-to-sheets","feed-gap-report","feed-health","fetch-keyword-rankings",
  "fix-variant-data","fix-variant-prices","full-diagnostics","ga4-analytics",
  "generate-bestseller-seo","generate-blog-image","generate-cornerstone","generate-gap-guide",
  "generate-google-ads","generate-newsletter-content","generate-product-summary","generate-seo-text",
  "geo-classify","get-mapbox-token","gh-pat-check","github-sync-check",
  "google-shopping-feed","googlebot-validate","growth-brain","growth-channel-allocator",
  "growth-channel-ingest","growth-dna-evaluate","growth-dna-mutate","growth-forecast-compute",
  "growth-learning-loop","growth-perf-snapshot","growth-produce-creative","growth-publish-tick",
  "growth-schedule-pins","growth-score-products","growth-select-daily","growth-self-heal",
  "growth-weekly-report","gsc-keyword-intelligence","hot-product-engine","image-compliance-scanner",
  "import-supplier-csv","indexation-accelerator","indexnow-ping","job-status",
  "job-worker","log-crawler-visit","lookup-guest-order","manage-dispute",
  "market-cluster-trends","market-competitor-scan","market-dna-enrich","market-gap-actions-generate",
  "market-gap-detect","market-priority-sync","market-recommendations-route","market-recommendations-synthesize",
  "market-score-products","market-signal-ingest","market-trends-ingest","marketing-proxy",
  "media-integrity-scan","media-master-pipeline","merchant-audit","merchant-cleanup",
  "merchant-debug-sync","merchant-health","merchant-oauth-callback","merchant-oauth-start",
  "merchant-reachability","merchant-secrets-status","merchant-self-heal","merchant-status",
  "merchant-summary","merchant-sync","mi-arm-guardrails","mi-audience-cluster",
  "mi-auto-tune","mi-autorun","mi-bandit-allocator","mi-budget-allocator",
  "mi-budget-shifter","mi-bulk-variants","mi-compliance-gate","mi-detect-opportunities",
  "mi-experiment-autocreate","mi-experiment-ingest","mi-experiment-tracker","mi-fatigue-detector",
  "mi-feedback-loop","mi-forecast-seasonal","mi-ingest-internal","mi-promote-recommendations",
  "mi-rank-next-creatives","mi-remix-draft","mi-revenue-attribution","mi-tiktok-ingest",
  "mi-visitor-hook","monitoring-ad-pause-controller","monitoring-ads-health-map","monitoring-ai-summary",
  "monitoring-alerting-hub","monitoring-budget-taper","monitoring-conversion-tracker","monitoring-daily-go-nogo",
  "monitoring-daily-summary","monitoring-founder-snapshot","monitoring-landing-page-scores","monitoring-nightly-order-test",
  "monitoring-p1-checks","monitoring-p2-checks","monitoring-predictive-alerts","monitoring-priority-engine",
  "monitoring-product-qa","monitoring-realtime-alerts","monitoring-release-guard","monitoring-tracking-heartbeat",
  "newsletter-preferences","notify-contact-message","notify-delivery-issue","notify-loss-products",
  "optimize-merchant-feed","optimize-product-feed","optimize-product-titles","pinterest-analytics-sync",
  "pinterest-attribution-validation","pinterest-auto-evolve","pinterest-automation","pinterest-autopilot",
  "pinterest-autopilot-generate-schedule","pinterest-autopilot-run-one","pinterest-autopilot-scheduler","pinterest-benchmarks-rollup",
  "pinterest-capi-health","pinterest-capi-relay","pinterest-catalog-sync","pinterest-cleanup-audit",
  "pinterest-competitor-intel","pinterest-content-correction","pinterest-content-director","pinterest-content-refresh",
  "pinterest-conversion-audit","pinterest-conversion-nightly","pinterest-conversion-repair","pinterest-creative-director",
  "pinterest-creative-variety","pinterest-creative-variety-audit","pinterest-cron-debug","pinterest-cron-diagnostic",
  "pinterest-cron-worker","pinterest-diversity-cleanup-execute","pinterest-diversity-governor","pinterest-diversity-replacement-worker",
  "pinterest-diversity-simulate","pinterest-domain-health-check","pinterest-draft-validator","pinterest-emergency-publish",
  "pinterest-feed","pinterest-final-prod-audit","pinterest-growth-brain","pinterest-growth-engine",
  "pinterest-growth-orchestrator","pinterest-historical-cleanup","pinterest-image-product-match","pinterest-integrity-audit",
  "pinterest-intelligence-api","pinterest-landing-resolver","pinterest-learning-rollup","pinterest-live-pin-audit",
  "pinterest-live-pin-repair-cleanup-duplicates","pinterest-live-pin-repair-execute","pinterest-live-pin-repair-generate","pinterest-live-pin-repair-internal",
  "pinterest-live-pin-repair-render-overlays","pinterest-live-pin-repair-revalidate","pinterest-niche-coverage-snapshot","pinterest-oauth-callback",
  "pinterest-oauth-start","pinterest-ocr-cleanup-audit","pinterest-ops-dashboard","pinterest-optimizer",
  "pinterest-pattern-research","pinterest-perf-backfill","pinterest-pilot-audit","pinterest-pin-attribution",
  "pinterest-pin-backfill","pinterest-pin-bulk-delete","pinterest-pin-deletion-verify","pinterest-pin-generator",
  "pinterest-pin-repair","pinterest-preview-styles","pinterest-product-conversion-score","pinterest-proof-of-life",
  "pinterest-protection-audit","pinterest-publish-now","pinterest-publishing-health","pinterest-redirect",
  "pinterest-refresh-failed-queue","pinterest-rescore-queue","pinterest-revenue-ai","pinterest-revenue-alerts",
  "pinterest-revenue-attribution-v3","pinterest-revenue-brain","pinterest-revenue-engine","pinterest-revenue-engine-loop",
  "pinterest-revenue-engine-v2","pinterest-schedule-optimizer","pinterest-scheduler","pinterest-track",
  "pinterest-trend-harvester","pinterest-trend-intelligence","pinterest-url-audit","pinterest-variety-engine-audit",
  "pinterest-video-cleanup","pinterest-video-clone-top-performers","pinterest-video-discovery","pinterest-video-metrics-sync",
  "pinterest-video-publisher","pinterest-video-score-assets","pinterest-viral-batch","pinterest-warmup-orchestrator",
  "pinterest-warmup-regenerate","pinterest-winner-detector","pinterest-zap","position-sniper",
  "process-scheduled-campaigns","process-seo-nurture-queue","product-media-audit","product-optimizer-pipeline",
  "product-prerender","product-seo-optimize","profit-engine-decide","profit-engine-health",
  "profit-engine-sync","rank-harvest-cron","recategorize-products","referral-lookup",
  "render-forensics","report-web-vitals","request-indexing","resolve-product-slug",
  "resync-oos-products","revenue-accelerator","rss-feed","run-all",
  "self-improvement-loop","send-abandoned-cart-email","send-ads-csv-email","send-claim-followup",
  "send-delivery-notification","send-email-campaign","send-newsletter-confirmation","send-order-confirmation",
  "send-packaging-alert","send-remarketing-email","send-replenishment-reminder","send-review-request",
  "send-seo-nurture-email","send-shipping-notification","send-stock-notification","seo-diagnostics",
  "seo-recovery-engine","shopping-assistant","shopping-optimizer","shopping-traffic-engine",
  "site-monitor","sitemap-blog","sitemap-diagnostics","sitemap-guides",
  "sitemap-health","sitemap-ping","sitemap-products","stock-refresh-monitor",
  "stripe-apple-pay-status","stripe-webhook","sync-cj-tracking","sync-ga4-daily",
  "sync-stock","test-adsbot-access","tests","tiktok-content-generator",
  "tiktok-events-dedup-test","tiktok-events-test-fire","tiktok-oauth-callback","tiktok-oauth-config-inspect",
  "tiktok-oauth-diagnose","tiktok-oauth-smoke-test","tiktok-oauth-start","tiktok-oauth-status",
  "tiktok-publisher","tiktok-video-generator","tiktok-video-test-upload","token-health",
  "track-checkout-funnel","track-email-event","track-remarketing-event","tracking-session-validator",
  "unsubscribe-newsletter","url-triage","validate-merchant-feed","verify-oos-stock",
  "webauthn-authenticate","webauthn-register","webhook-health","worker-debug",
  "worker-health","world-map-debug",
];

// This function itself — exclude from the probe so we don't recursively
// call ourselves (would cause runaway concurrency and skewed timing).
const SELF = "edge-functions-health";

type ProbeStatus = "success" | "error" | "skipped";

interface ProbeResult {
  name: string;
  status: ProbeStatus;
  httpStatus: number | null;
  durationMs: number;
  bootError: boolean;
  errorSnippet: string | null;
}

function classify(httpStatus: number | null, body: string): {
  status: ProbeStatus;
  bootError: boolean;
  errorSnippet: string | null;
} {
  // OPTIONS preflight should always succeed if the function booted.
  // 2xx/3xx → success. 401/403/404 → success (function booted, just rejected
  // the unauthenticated probe). 5xx with BOOT_ERROR-like body → error.
  if (httpStatus === null) {
    return { status: "error", bootError: true, errorSnippet: body.slice(0, 200) || "network_error" };
  }
  if (httpStatus >= 200 && httpStatus < 500) {
    return { status: "success", bootError: false, errorSnippet: null };
  }
  // 5xx — inspect body for boot-error markers.
  const lower = body.toLowerCase();
  const isBootError =
    lower.includes("boot_error") ||
    lower.includes("bootimporterror") ||
    lower.includes("worker_limit") ||
    lower.includes("syntaxerror") ||
    lower.includes("typeerror: cannot find module") ||
    lower.includes("module not found");
  return {
    status: "error",
    bootError: isBootError,
    errorSnippet: body.slice(0, 300) || `http_${httpStatus}`,
  };
}

async function probe(supabaseUrl: string, name: string, timeoutMs: number): Promise<ProbeResult> {
  const url = `${supabaseUrl}/functions/v1/${name}`;
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: "OPTIONS",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text().catch(() => "");
    const cls = classify(res.status, text);
    return {
      name,
      status: cls.status,
      httpStatus: res.status,
      durationMs: Date.now() - start,
      bootError: cls.bootError,
      errorSnippet: cls.errorSnippet,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      name,
      status: "error",
      httpStatus: null,
      durationMs: Date.now() - start,
      bootError: true,
      errorSnippet: msg.slice(0, 200),
    };
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth: admin only — same pattern used by run-all and tiktok-oauth-start.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ ok: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const anon = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authErr } = await anon.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authErr || !user) {
      return new Response(
        JSON.stringify({ ok: false, error: "Invalid auth token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) {
      return new Response(
        JSON.stringify({ ok: false, error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Optional knobs via query string or JSON body.
    const url = new URL(req.url);
    let only: string[] | null = null;
    let concurrency = Math.max(1, Math.min(16, parseInt(url.searchParams.get("concurrency") || "8", 10) || 8));
    let timeoutMs = Math.max(1000, Math.min(30000, parseInt(url.searchParams.get("timeoutMs") || "8000", 10) || 8000));
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({} as Record<string, unknown>));
      if (Array.isArray(body.only)) only = body.only.filter((s: unknown): s is string => typeof s === "string");
      if (typeof body.concurrency === "number") {
        concurrency = Math.max(1, Math.min(16, Math.floor(body.concurrency)));
      }
      if (typeof body.timeoutMs === "number") {
        timeoutMs = Math.max(1000, Math.min(30000, Math.floor(body.timeoutMs)));
      }
    }

    const targets = (only && only.length > 0 ? only : FUNCTIONS).filter((n) => n !== SELF);

    const startedAt = Date.now();
    const results = await runWithConcurrency(targets, (n) => probe(supabaseUrl, n, timeoutMs), concurrency);
    const finishedAt = Date.now();

    const summary = {
      total: results.length,
      success: results.filter((r) => r.status === "success").length,
      error: results.filter((r) => r.status === "error").length,
      bootErrors: results.filter((r) => r.bootError).length,
    };

    // Sort: errors first, then by name for stable UI.
    results.sort((a, b) => {
      if (a.status !== b.status) return a.status === "error" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    console.log(
      `[edge-functions-health] checked=${summary.total} ok=${summary.success} err=${summary.error} bootErr=${summary.bootErrors} in ${finishedAt - startedAt}ms`,
    );

    return new Response(
      JSON.stringify({
        ok: true,
        startedAt: new Date(startedAt).toISOString(),
        finishedAt: new Date(finishedAt).toISOString(),
        durationMs: finishedAt - startedAt,
        concurrency,
        timeoutMs,
        summary,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[edge-functions-health] Error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});