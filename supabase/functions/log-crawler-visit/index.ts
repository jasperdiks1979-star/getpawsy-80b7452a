import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'X-Robots-Tag': 'all',
  'X-Content-Served-Identically': 'true',
};

// -----------------------------------------------------------------------------
// Runtime payload validation
// -----------------------------------------------------------------------------
// The crawler-visit endpoint is also reused by `usePdpBotRenderTrace` to ship
// PDP render-state telemetry. We enforce a strict schema so malformed payloads
// are rejected early with a clear, structured error log instead of polluting
// `crawler_visits` with bad rows.
const PayloadSchema = z.object({
  pageUrl: z
    .string({ required_error: 'pageUrl is required' })
    .trim()
    .min(1, 'pageUrl must be a non-empty string')
    .max(2048, 'pageUrl exceeds 2048 chars'),
  userAgent: z
    .string({ required_error: 'userAgent is required' })
    .trim()
    .min(1, 'userAgent must be a non-empty string')
    .max(2048, 'userAgent exceeds 2048 chars'),
  referrer: z.string().trim().max(2048).optional().nullable(),
  // Optional client-supplied idempotency key. When present, the row is
  // upserted on `idempotency_key` so retried calls (network blip, edge
  // function re-invocation, double-fired effect) collapse to a single
  // `crawler_visits` row instead of creating duplicates. Format is
  // intentionally permissive — clients compose it from a stable page-view
  // id + render stage. We cap the length so the unique index stays cheap.
  idempotencyKey: z
    .string()
    .trim()
    .min(1, 'idempotencyKey must be non-empty when provided')
    .max(200, 'idempotencyKey exceeds 200 chars')
    .regex(/^[A-Za-z0-9._:\-]+$/, 'idempotencyKey contains unsupported chars')
    .optional()
    .nullable(),
});

// Render-state tags emitted by the PDP bot-trace hook. We don't *require* a
// state tag (regular crawler visits won't have one), but if the UA *looks*
// like a pdp-render-trace ping, we validate that the state is one we expect.
const RENDER_STATE_TAG_RE = /pdp-render-trace\/([a-z0-9_-]+)/i;
const VALID_RENDER_STATES = new Set(['shell', 'rendered', 'timeout']);

// -----------------------------------------------------------------------------
// Structured error codes
// -----------------------------------------------------------------------------
// Every non-2xx response carries a stable, SCREAMING_SNAKE_CASE `code` so
// callers (tests, dashboards, log-greps) can branch on the failure reason
// without parsing the human-readable `error` string. New codes MUST be added
// here so the union stays exhaustive and grep-discoverable.
export const ERROR_CODES = {
  INVALID_JSON: 'INVALID_JSON',
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
  MISSING_FIELDS: 'MISSING_FIELDS',
  INVALID_PDP_RENDER_STATE: 'INVALID_PDP_RENDER_STATE',
  DB_INSERT_FAILED: 'DB_INSERT_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

// -----------------------------------------------------------------------------
// Lightweight validation-failure counters
// -----------------------------------------------------------------------------
// Track how often each *type* of malformed payload is rejected so we can
// quantify churn without a schema migration. The counters live in module scope
// so they accumulate per cold start; every increment also emits a structured
// `[validation-counter]` log line that can be aggregated via the
// `function_edge_logs` analytics table.
//
// Failure-type taxonomy:
//   - invalid_json          → request body wasn't valid JSON
//   - schema_page_url       → Zod rejection on `pageUrl`
//   - schema_user_agent     → Zod rejection on `userAgent`
//   - schema_referrer       → Zod rejection on `referrer`
//   - schema_other          → Zod rejection on a field we don't break out
//   - trace_missing_slug    → render-trace ping with no extractable slug
//   - trace_missing_state   → render-trace ping with no state tag in the UA
//   - trace_invalid_state   → render-trace ping with an unknown state value
//
// `getValidationCounters()` returns a snapshot for inclusion in error
// responses (so callers/tests can introspect totals without scraping logs).
type ValidationFailureType =
  | 'invalid_json'
  | 'schema_page_url'
  | 'schema_user_agent'
  | 'schema_referrer'
  | 'schema_other'
  | 'trace_missing_slug'
  | 'trace_missing_state'
  | 'trace_invalid_state';

const validationCounters: Record<ValidationFailureType, number> = {
  invalid_json: 0,
  schema_page_url: 0,
  schema_user_agent: 0,
  schema_referrer: 0,
  schema_other: 0,
  trace_missing_slug: 0,
  trace_missing_state: 0,
  trace_invalid_state: 0,
};

function recordValidationFailure(
  type: ValidationFailureType,
  context: Record<string, unknown> = {},
): void {
  validationCounters[type] = (validationCounters[type] ?? 0) + 1;
  // Structured single-line log so it can be grep'd / aggregated downstream.
  console.warn(
    `[validation-counter] ${JSON.stringify({
      type,
      count: validationCounters[type],
      ts: new Date().toISOString(),
      ...context,
    })}`,
  );
}

function getValidationCounters(): Record<ValidationFailureType, number> {
  return { ...validationCounters };
}

// Map a Zod field-error key onto our taxonomy. Keeps the counter set small
// so admins can scan the totals at a glance.
function fieldErrorToType(field: string): ValidationFailureType {
  switch (field) {
    case 'pageUrl':
      return 'schema_page_url';
    case 'userAgent':
      return 'schema_user_agent';
    case 'referrer':
      return 'schema_referrer';
    default:
      return 'schema_other';
  }
}

function extractSlug(pageUrl: string): string | null {
  try {
    const u = new URL(pageUrl, 'https://getpawsy.pet');
    const parts = u.pathname.split('/').filter(Boolean);
    // /products/:slug or /p/:slug etc — last non-empty segment is the slug.
    return parts.length > 0 ? parts[parts.length - 1] : null;
  } catch {
    return null;
  }
}

// Appeal pages that should trigger email notifications
const APPEAL_PAGES = [
  '/google-review',
  '/technical-declaration',
  '/appeal-response',
];

// -----------------------------------------------------------------------------
// Configurable log sampling
// -----------------------------------------------------------------------------
// Most page views generate a crawler-visit ping that we don't strictly need to
// persist (e.g. ordinary human traffic on a non-appeal page). To keep the
// `crawler_visits` table — and our storage costs — under control we apply a
// configurable sampling rate to "uninteresting" payloads while ALWAYS keeping
// the ones that actually matter:
//
//   * `pdp-render-trace` pings (shell/rendered/timeout) — never sampled out,
//     because they're the source of truth for the bot-trace dashboard.
//   * Verified Googlebot visits — never sampled out (rare + high signal).
//   * Visits to appeal pages — never sampled out (drives email alerts).
//   * Spoofed-Googlebot UAs — never sampled out (security signal).
//
// The sampling rate is a float in [0, 1] sourced from `site_settings`
// (key: `crawler_visit_sample_rate`) with an env-var fallback
// (`CRAWLER_VISIT_SAMPLE_RATE`) and a hard default of 1.0 (log everything).
// The value is cached per cold start for `SAMPLE_RATE_TTL_MS` so admins can
// tune it without redeploying but we don't hit the DB on every request.
const SAMPLE_RATE_KEY = 'crawler_visit_sample_rate';
const SAMPLE_RATE_TTL_MS = 60 * 1000; // 1 minute
const DEFAULT_SAMPLE_RATE = 1.0;

let cachedSampleRate: number | null = null;
let sampleRateLoadedAt = 0;

function clampSampleRate(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_SAMPLE_RATE;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getSampleRate(supabase: any, forceRefresh = false): Promise<number> {
  const now = Date.now();
  if (
    !forceRefresh &&
    cachedSampleRate !== null &&
    now - sampleRateLoadedAt < SAMPLE_RATE_TTL_MS
  ) {
    return cachedSampleRate;
  }

  let resolved = DEFAULT_SAMPLE_RATE;
  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', SAMPLE_RATE_KEY)
      .maybeSingle();
    if (!error && data?.value !== undefined && data?.value !== null) {
      resolved = clampSampleRate(data.value);
    } else {
      const envRate = Deno.env.get('CRAWLER_VISIT_SAMPLE_RATE');
      if (envRate !== undefined && envRate !== null && envRate !== '') {
        resolved = clampSampleRate(envRate);
      }
    }
  } catch (err) {
    console.warn('[log-crawler-visit] Failed to load sample rate, using default:', err);
    const envRate = Deno.env.get('CRAWLER_VISIT_SAMPLE_RATE');
    if (envRate !== undefined && envRate !== null && envRate !== '') {
      resolved = clampSampleRate(envRate);
    }
  }

  cachedSampleRate = resolved;
  sampleRateLoadedAt = now;
  return resolved;
}

// -----------------------------------------------------------------------------
// Verified-Googlebot IP allowlist
// -----------------------------------------------------------------------------
// Google publishes the canonical IP ranges for its crawlers as JSON files.
// We fetch + cache them per cold start (and refresh every 24h) so we can mark
// requests as `verified: true` only when the source IP matches one of the
// official ranges. Spoofed UAs from random IPs will be downgraded to
// `is_googlebot=false` and won't trigger notifications.
//
// Docs: https://developers.google.com/search/docs/crawling-indexing/verifying-googlebot
// -----------------------------------------------------------------------------
const GOOGLE_IP_RANGE_URLS = [
  'https://developers.google.com/static/search/apis/ipranges/googlebot.json',
  'https://developers.google.com/static/search/apis/ipranges/special-crawlers.json',
  'https://developers.google.com/static/search/apis/ipranges/user-triggered-fetchers.json',
  // Includes Search Console rendering / Inspection Tool fetchers run from GCP.
  'https://developers.google.com/static/search/apis/ipranges/user-triggered-fetchers-google.json',
];

// Optional override: comma-separated CIDRs treated as additional trusted
// rendering services (e.g. internal QA proxies). Set GOOGLEBOT_EXTRA_CIDRS.
const EXTRA_CIDRS = (Deno.env.get('GOOGLEBOT_EXTRA_CIDRS') || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

type ParsedRange = {
  version: 4 | 6;
  // For v4: 32-bit base & mask. For v6: bigint base & prefix length.
  base: number | bigint;
  mask: number | bigint;
  prefix: number;
};

let cachedRanges: ParsedRange[] | null = null;
let cachedAt = 0;
const RANGE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = (n * 256) + v;
  }
  return n >>> 0;
}

function expandIpv6(ip: string): string | null {
  // Strip zone id if present (e.g. fe80::1%eth0)
  const clean = ip.split('%')[0];
  // Handle "::" expansion
  if (clean.indexOf(':::') !== -1) return null;
  const hasDoubleColon = clean.indexOf('::') !== -1;
  let parts: string[];
  if (hasDoubleColon) {
    const [head, tail] = clean.split('::');
    const headParts = head ? head.split(':') : [];
    const tailParts = tail ? tail.split(':') : [];
    const missing = 8 - headParts.length - tailParts.length;
    if (missing < 0) return null;
    parts = [...headParts, ...Array(missing).fill('0'), ...tailParts];
  } else {
    parts = clean.split(':');
  }
  if (parts.length !== 8) return null;
  return parts.map((p) => (p === '' ? '0' : p).padStart(4, '0')).join('');
}

function ipv6ToBigInt(ip: string): bigint | null {
  const expanded = expandIpv6(ip);
  if (!expanded) return null;
  try {
    return BigInt('0x' + expanded);
  } catch {
    return null;
  }
}

function parseCidr(cidr: string): ParsedRange | null {
  const [addr, prefixStr] = cidr.split('/');
  const prefix = Number(prefixStr);
  if (!Number.isInteger(prefix)) return null;

  if (addr.includes(':')) {
    if (prefix < 0 || prefix > 128) return null;
    const base = ipv6ToBigInt(addr);
    if (base === null) return null;
    const maskBits = prefix === 0 ? 0n : ((1n << 128n) - (1n << BigInt(128 - prefix)));
    return { version: 6, base: base & maskBits, mask: maskBits, prefix };
  }

  if (prefix < 0 || prefix > 32) return null;
  const base = ipv4ToInt(addr);
  if (base === null) return null;
  const maskBits = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return { version: 4, base: (base & maskBits) >>> 0, mask: maskBits, prefix };
}

function ipMatchesRange(ip: string, range: ParsedRange): boolean {
  if (range.version === 4) {
    if (ip.includes(':')) return false;
    const n = ipv4ToInt(ip);
    if (n === null) return false;
    return ((n & (range.mask as number)) >>> 0) === (range.base as number);
  }
  // v6
  if (!ip.includes(':')) return false;
  const n = ipv6ToBigInt(ip);
  if (n === null) return false;
  return (n & (range.mask as bigint)) === (range.base as bigint);
}

async function loadGoogleRanges(): Promise<ParsedRange[]> {
  const now = Date.now();
  if (cachedRanges && now - cachedAt < RANGE_TTL_MS) return cachedRanges;

  const ranges: ParsedRange[] = [];
  for (const url of GOOGLE_IP_RANGE_URLS) {
    try {
      const res = await fetch(url, { headers: { 'cache-control': 'no-cache' } });
      if (!res.ok) {
        console.warn(`[crawler-allowlist] Failed to fetch ${url}: HTTP ${res.status}`);
        continue;
      }
      const json = await res.json() as { prefixes?: Array<{ ipv4Prefix?: string; ipv6Prefix?: string }> };
      for (const p of json.prefixes || []) {
        const cidr = p.ipv4Prefix || p.ipv6Prefix;
        if (!cidr) continue;
        const parsed = parseCidr(cidr);
        if (parsed) ranges.push(parsed);
      }
    } catch (err) {
      console.warn(`[crawler-allowlist] Error fetching ${url}:`, err);
    }
  }

  for (const cidr of EXTRA_CIDRS) {
    const parsed = parseCidr(cidr);
    if (parsed) ranges.push(parsed);
    else console.warn(`[crawler-allowlist] Ignoring invalid GOOGLEBOT_EXTRA_CIDRS entry: ${cidr}`);
  }

  // If the fetch totally failed (e.g. cold start with network blip) keep the
  // previous cache to avoid flapping; otherwise replace it.
  if (ranges.length === 0 && cachedRanges) {
    console.warn('[crawler-allowlist] Range fetch returned 0 entries; keeping stale cache');
    return cachedRanges;
  }

  cachedRanges = ranges;
  cachedAt = now;
  console.log(`[crawler-allowlist] Loaded ${ranges.length} Google IP ranges`);
  return ranges;
}

async function isVerifiedGoogleIp(ip: string): Promise<boolean> {
  if (!ip || ip === 'unknown') return false;
  // Strip IPv6 brackets / port suffix if any
  const cleaned = ip.replace(/^\[/, '').replace(/\].*$/, '').split(' ')[0];
  try {
    const ranges = await loadGoogleRanges();
    if (ranges.length === 0) return false;
    for (const r of ranges) {
      if (ipMatchesRange(cleaned, r)) return true;
    }
    return false;
  } catch (err) {
    console.warn('[crawler-allowlist] Verification error:', err);
    return false;
  }
}

// Googlebot and other Google crawler User-Agent patterns
// Reference: https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers
const GOOGLE_BOT_PATTERNS = [
  // Main Googlebot (Search, Discover, Images, Video, News)
  /Googlebot\/\d/i,
  /Googlebot-Image/i,
  /Googlebot-Video/i,
  /Googlebot-News/i,
  // Google Ads bots
  /AdsBot-Google/i,
  /AdsBot-Google-Mobile/i,
  /Mediapartners-Google/i,
  // Google Shopping (Storebot)
  /Storebot-Google/i,
  // Search Console & Testing tools
  /Google-InspectionTool/i,
  // Generic crawlers (R&D, internal)
  /GoogleOther-Image/i,
  /GoogleOther-Video/i,
  /GoogleOther/i,
  // Vertex AI & Extended
  /Google-CloudVertexBot/i,
  /Google-Extended/i,
];

function detectBotType(userAgent: string): { isGooglebot: boolean; botType: string | null } {
  for (const pattern of GOOGLE_BOT_PATTERNS) {
    if (pattern.test(userAgent)) {
      const match = userAgent.match(pattern);
      return {
        isGooglebot: true,
        botType: match ? match[0] : 'Googlebot',
      };
    }
  }
  
  // Check for other common bots
  if (/bingbot/i.test(userAgent)) {
    return { isGooglebot: false, botType: 'Bingbot' };
  }
  if (/Slurp/i.test(userAgent)) {
    return { isGooglebot: false, botType: 'Yahoo Slurp' };
  }
  if (/DuckDuckBot/i.test(userAgent)) {
    return { isGooglebot: false, botType: 'DuckDuckBot' };
  }
  if (/facebookexternalhit/i.test(userAgent)) {
    return { isGooglebot: false, botType: 'Facebook' };
  }
  if (/Twitterbot/i.test(userAgent)) {
    return { isGooglebot: false, botType: 'Twitter' };
  }
  if (/LinkedInBot/i.test(userAgent)) {
    return { isGooglebot: false, botType: 'LinkedIn' };
  }
  
  return { isGooglebot: false, botType: null };
}

function isAppealPage(pageUrl: string): boolean {
  try {
    const url = new URL(pageUrl);
    return APPEAL_PAGES.some(page => url.pathname === page || url.pathname.startsWith(page));
  } catch {
    // If not a valid URL, check if it matches as a path
    return APPEAL_PAGES.some(page => pageUrl === page || pageUrl.startsWith(page));
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getNotificationEmail(supabase: any): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'googlebot_notification_email')
      .single();

    if (error || !data) {
      console.log('Using default notification email');
      return 'support@getpawsy.pet';
    }
    return data.value || 'support@getpawsy.pet';
  } catch {
    return 'support@getpawsy.pet';
  }
}

async function sendGooglebotNotification(
  pageUrl: string, 
  botType: string, 
  ipAddress: string,
  notificationEmail: string
): Promise<void> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) {
    console.log('RESEND_API_KEY not configured, skipping notification');
    return;
  }

  const timestamp = new Date().toLocaleString('nl-NL', { 
    timeZone: 'Europe/Amsterdam',
    dateStyle: 'full',
    timeStyle: 'long'
  });

  const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f5; margin: 0; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 32px; text-align: center;">
          <div style="font-size: 48px; margin-bottom: 16px;">🎉</div>
          <h1 style="color: white; margin: 0; font-size: 24px;">Google heeft je pagina bekeken!</h1>
        </div>
        
        <!-- Content -->
        <div style="padding: 32px;">
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
            <p style="margin: 0; color: #166534; font-weight: 600;">
              ✅ Dit is een positief signaal voor je Google Ads appeal!
            </p>
          </div>
          
          <h2 style="color: #1f2937; font-size: 18px; margin-bottom: 16px;">Bezoek Details</h2>
          
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #6b7280; width: 120px;">Bot Type</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #1f2937; font-weight: 600;">${botType}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Pagina</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #1f2937;">
                <code style="background: #f3f4f6; padding: 4px 8px; border-radius: 4px; font-size: 14px;">${pageUrl}</code>
              </td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Tijdstip</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #1f2937;">${timestamp}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; color: #6b7280;">IP Adres</td>
              <td style="padding: 12px 0; color: #1f2937;">${ipAddress}</td>
            </tr>
          </table>
          
          <div style="margin-top: 24px; padding: 16px; background: #eff6ff; border-radius: 8px;">
            <p style="margin: 0; color: #1e40af; font-size: 14px;">
              <strong>💡 Tip:</strong> Dit bezoek is automatisch opgeslagen in je Crawler Analytics dashboard voor verdere analyse.
            </p>
          </div>
        </div>
        
        <!-- Footer -->
        <div style="background: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="margin: 0; color: #6b7280; font-size: 14px;">
            Bekijk alle crawler bezoeken in je 
            <a href="https://getpawsy.pet/admin/crawler-analytics" style="color: #10b981; text-decoration: none;">Analytics Dashboard</a>
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Alerts <alerts@getpawsy.pet>',
        to: [notificationEmail],
        subject: `🤖 ${botType} heeft je appeal pagina bezocht!`,
        html: emailHtml,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Resend API error:', response.status, errorText);
      return;
    }

    console.log(`Notification email sent for Googlebot visit to ${pageUrl}`);
  } catch (error) {
    console.error('Failed to send notification email:', error);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // -------------------------------------------------------------------------
    // Admin probe: GET ?probe=sample-rate[&refresh=1]
    // -------------------------------------------------------------------------
    // Returns the sample rate the function would currently use for a *normal*
    // (sampled) request. Lets the admin control page verify that updates to
    // `site_settings.crawler_visit_sample_rate` have propagated past the
    // 60-second in-memory cache. Pass `refresh=1` to force a cache bypass.
    const url = new URL(req.url);
    if (req.method === 'GET' && url.searchParams.get('probe') === 'sample-rate') {
      const forceRefresh = url.searchParams.get('refresh') === '1';
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const cachedBefore = cachedSampleRate;
      const cachedAge =
        cachedSampleRate !== null ? Date.now() - sampleRateLoadedAt : null;
      const effective = await getSampleRate(supabase, forceRefresh);
      return new Response(
        JSON.stringify({
          ok: true,
          probe: 'sample-rate',
          effectiveSampleRate: effective,
          cachedBefore,
          cachedAgeMs: cachedAge,
          cacheTtlMs: SAMPLE_RATE_TTL_MS,
          forcedRefresh: forceRefresh,
          ts: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch (parseErr) {
      console.error('[log-crawler-visit] Malformed JSON body:', parseErr);
      recordValidationFailure('invalid_json', {
        error: parseErr instanceof Error ? parseErr.message : String(parseErr),
      });
      return new Response(
        JSON.stringify({
          error: 'Invalid JSON body',
          code: ERROR_CODES.INVALID_JSON,
          validationCounters: getValidationCounters(),
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const parsed = PayloadSchema.safeParse(rawBody);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      console.error(
        '[log-crawler-visit] Rejecting malformed payload:',
        JSON.stringify({ fieldErrors, received: rawBody }),
      );
      // Increment one counter per offending field so a single bad payload
      // hitting two fields gets credited to both buckets.
      const offendingFields = Object.keys(fieldErrors);
      if (offendingFields.length === 0) {
        recordValidationFailure('schema_other', { reason: 'unknown_zod_shape' });
      } else {
        for (const field of offendingFields) {
          recordValidationFailure(fieldErrorToType(field), {
            field,
            messages: fieldErrors[field as keyof typeof fieldErrors],
          });
        }
      }
      return new Response(
        JSON.stringify({
          error: 'Invalid payload',
          code: ERROR_CODES.INVALID_PAYLOAD,
          fieldErrors,
          validationCounters: getValidationCounters(),
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const { pageUrl, userAgent, referrer, idempotencyKey } = parsed.data;

    // If this looks like a pdp-render-trace ping, enforce that both a slug
    // (extractable from pageUrl) and a recognised state tag are present.
    const renderTagMatch = userAgent.match(RENDER_STATE_TAG_RE);
    const looksLikeTrace = userAgent.toLowerCase().includes('pdp-render-trace');
    if (looksLikeTrace) {
      const slug = extractSlug(pageUrl);
      const stateTag = renderTagMatch?.[1]?.toLowerCase() ?? null;
      const missing: string[] = [];
      if (!slug) {
        missing.push('slug (from pageUrl)');
        recordValidationFailure('trace_missing_slug', { pageUrl });
      }
      if (!stateTag) {
        missing.push('pdp-render-trace state tag (from userAgent)');
        recordValidationFailure('trace_missing_state', { userAgent });
      } else if (!VALID_RENDER_STATES.has(stateTag)) {
        missing.push(`valid pdp-render-trace state (got "${stateTag}")`);
        recordValidationFailure('trace_invalid_state', { stateTag });
      }
      if (missing.length > 0) {
        console.error(
          '[log-crawler-visit] pdp-render-trace payload missing required fields:',
          JSON.stringify({ missing, pageUrl, userAgent }),
        );
        // Prefer INVALID_PDP_RENDER_STATE when the *only* problem is a
        // bad/unknown state value; otherwise treat it as MISSING_FIELDS.
        const onlyInvalidState =
          stateTag !== null &&
          !VALID_RENDER_STATES.has(stateTag) &&
          slug !== null;
        const code: ErrorCode = onlyInvalidState
          ? ERROR_CODES.INVALID_PDP_RENDER_STATE
          : ERROR_CODES.MISSING_FIELDS;
        return new Response(
          JSON.stringify({
            error: 'Invalid pdp-render-trace payload',
            code,
            missing,
            validationCounters: getValidationCounters(),
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // Get IP from headers (Cloudflare/proxy headers)
    const ipAddress = req.headers.get('cf-connecting-ip') || 
                      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                      req.headers.get('x-real-ip') ||
                      'unknown';

    const { isGooglebot: uaIsGooglebot, botType } = detectBotType(userAgent);

    // Verify against Google's official published IP ranges.
    // - If UA claims Googlebot AND the IP matches → fully trusted.
    // - If UA claims Googlebot but IP does NOT match → spoofed; downgrade
    //   `is_googlebot` to false so dashboards don't get polluted.
    // - Other bots / humans pass through unchanged.
    let verifiedGoogleIp = false;
    if (uaIsGooglebot) {
      verifiedGoogleIp = await isVerifiedGoogleIp(ipAddress);
    }
    const isGooglebot = uaIsGooglebot && verifiedGoogleIp;
    const spoofedGooglebot = uaIsGooglebot && !verifiedGoogleIp;

    if (spoofedGooglebot) {
      console.warn(
        `[crawler-allowlist] Spoofed Googlebot UA from non-Google IP ${ipAddress} → ${pageUrl}`,
      );
    }

    // Initialize Supabase client with service role for insert
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Log the visit. We tag spoofed UAs in the `bot_type` column so they're
    // still searchable but won't be treated as real Googlebot traffic.
    const loggedBotType = spoofedGooglebot
      ? `${botType ?? 'Googlebot'} (spoofed-ua)`
      : botType;

    // -------------------------------------------------------------------------
    // Sampling decision
    // -------------------------------------------------------------------------
    // Anything carrying a render-trace tag, hitting an appeal page, or coming
    // from verified/spoofed Googlebot is "always log". Everything else is
    // probabilistically sampled using the configured rate. We still return a
    // 200 OK for sampled-out requests so the client never sees errors.
    const isAppeal = isAppealPage(pageUrl);
    const alwaysLog = looksLikeTrace || isGooglebot || spoofedGooglebot || isAppeal;
    let sampleRate = 1;
    let sampledOut = false;
    let sampleRoll: number | null = null;
    if (!alwaysLog) {
      sampleRate = await getSampleRate(supabase);
      if (sampleRate <= 0) {
        sampledOut = true;
      } else if (sampleRate < 1) {
        sampleRoll = Math.random();
        if (sampleRoll >= sampleRate) sampledOut = true;
      }
    }

    // -------------------------------------------------------------------------
    // Structured sampling-decision audit log
    // -------------------------------------------------------------------------
    // Every decision (logged OR sampled-out) gets recorded in
    // `crawler_sampling_decisions` so admins can later answer:
    //   * "Why didn't this URL get persisted?"
    //   * "How many requests are we always-logging vs sampling?"
    //   * "How often do spoofed Googlebot UAs hit us?"
    // The reason taxonomy is intentionally narrow so the dashboard can
    // group cleanly without parsing free-form text.
    const renderState = renderTagMatch?.[1]?.toLowerCase() ?? null;
    let decisionReason:
      | 'render_trace'
      | 'appeal_page'
      | 'verified_googlebot'
      | 'spoofed_googlebot'
      | 'sampled_in'
      | 'sampled_out';
    if (sampledOut) {
      decisionReason = 'sampled_out';
    } else if (looksLikeTrace) {
      decisionReason = 'render_trace';
    } else if (isGooglebot) {
      decisionReason = 'verified_googlebot';
    } else if (spoofedGooglebot) {
      decisionReason = 'spoofed_googlebot';
    } else if (isAppeal) {
      decisionReason = 'appeal_page';
    } else {
      decisionReason = 'sampled_in';
    }

    // Fire-and-forget — never block the response on the audit insert.
    // The `crawler_sampling_decisions` table has its own indexes for
    // dashboard queries; failures are logged but don't poison the request.
    supabase
      .from('crawler_sampling_decisions')
      .insert({
        page_url: pageUrl,
        user_agent: userAgent,
        ip_address: ipAddress,
        outcome: sampledOut ? 'sampled_out' : 'logged',
        always_log: alwaysLog,
        reason: decisionReason,
        looks_like_render_trace: looksLikeTrace,
        render_trace_state: renderState,
        is_appeal_page: isAppeal,
        ua_claims_googlebot: uaIsGooglebot,
        verified_googlebot: isGooglebot,
        spoofed_googlebot: spoofedGooglebot,
        bot_type: loggedBotType ?? null,
        sample_rate: alwaysLog ? null : sampleRate,
        sample_roll: sampleRoll,
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((res: any) => {
        if (res?.error) {
          console.warn(
            '[log-crawler-visit] Failed to persist sampling decision:',
            res.error,
          );
        }
      });

    // Single-line structured log line so admins can grep edge logs even if
    // the audit insert fails. Keys are stable & SCREAMING_snake-friendly.
    console.log(
      `[sampling-decision] ${JSON.stringify({
        outcome: sampledOut ? 'sampled_out' : 'logged',
        reason: decisionReason,
        always_log: alwaysLog,
        render_trace: looksLikeTrace,
        render_state: renderState,
        appeal: isAppeal,
        ua_claims_googlebot: uaIsGooglebot,
        verified_googlebot: isGooglebot,
        spoofed_googlebot: spoofedGooglebot,
        bot_type: loggedBotType ?? null,
        sample_rate: alwaysLog ? null : sampleRate,
        sample_roll: sampleRoll,
        page_url: pageUrl,
      })}`,
    );

    if (sampledOut) {
      return new Response(
        JSON.stringify({
          success: true,
          isGooglebot,
          botType,
          verified: verifiedGoogleIp,
          spoofed: spoofedGooglebot,
          sampled: false,
          sampleRate,
          decision: {
            reason: decisionReason,
            alwaysLog,
            sampleRoll,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { error } = await supabase
      .from('crawler_visits')
      .insert({
        page_url: pageUrl,
        user_agent: userAgent,
        is_googlebot: isGooglebot,
        bot_type: loggedBotType,
        ip_address: ipAddress,
        referrer: referrer || null,
      });

    if (error) {
      console.error('Failed to log crawler visit:', error);
      return new Response(
        JSON.stringify({
          error: 'Failed to log visit',
          code: ERROR_CODES.DB_INSERT_FAILED,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(
      `Logged visit: ${pageUrl} | Bot: ${loggedBotType || 'None'} | VerifiedGooglebot: ${isGooglebot}`,
    );

    // Send email notification only for verified Googlebot visits to appeal pages.
    if (isGooglebot && isAppealPage(pageUrl)) {
      console.log(`Googlebot visited appeal page: ${pageUrl} - sending notification`);
      const notificationEmail = await getNotificationEmail(supabase);
      await sendGooglebotNotification(pageUrl, botType || 'Googlebot', ipAddress, notificationEmail);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        isGooglebot,
        botType,
        verified: verifiedGoogleIp,
        spoofed: spoofedGooglebot,
        sampled: true,
        sampleRate,
        decision: {
          reason: decisionReason,
          alwaysLog,
          sampleRoll,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in log-crawler-visit:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        code: ERROR_CODES.INTERNAL_ERROR,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
