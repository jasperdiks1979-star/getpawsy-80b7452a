/**
 * DeepLinkInspectorPage — paste any URL (or query string) and see exactly
 * which PDP variant hooks would activate. Mirrors the live logic of:
 *   - useTikTokLanding  (utm_source=tiktok | ad=tt|tiktok | src=tiktok)
 *   - useAdIntent       (?hook= | ?utm_hook= | ?kw= → INTENT_MAP key)
 *
 * Admin-only utility for QA-ing TikTok / Pinterest / Google Ads deep links
 * before they ship to creatives. No DB writes, pure client-side parser.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, XCircle, Link2, Copy, Activity, AlertTriangle, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

/** Subset mirror of INTENT_MAP keys in src/hooks/useAdIntent.ts. Keep in sync. */
const INTENT_KEYS = new Set([
  'large-dogs', 'cooling', 'orthopedic', 'travel', 'outdoor', 'senior',
  'puppy', 'cat-tree', 'litter-box',
  'problem', 'solution', 'comparison', 'transformation',
]);

/**
 * GA4 event schemas — what each event MUST send to GA4 to be useful.
 *
 * `required` fields fail validation when missing/null/empty. `optional` fields
 * only fail when the type is wrong (e.g. a number where a string is expected).
 * GA4 itself accepts anything, but our reports / Looker Studio dashboards
 * depend on these shapes.
 */
type GA4Type = 'string' | 'number' | 'boolean' | 'string|null';
interface FieldSpec { name: string; type: GA4Type; required: boolean; note?: string }

const EVENT_SCHEMAS: Record<string, FieldSpec[]> = {
  tiktok_deep_link_click: [
    { name: 'link_url', type: 'string', required: true },
    { name: 'product_slug', type: 'string', required: true },
    { name: 'utm_source', type: 'string', required: true, note: 'must be "tiktok"' },
    { name: 'utm_medium', type: 'string', required: true },
    { name: 'utm_campaign', type: 'string|null', required: true },
    { name: 'utm_content', type: 'string|null', required: false },
    { name: 'ad', type: 'string', required: true, note: 'must be "tt"' },
    { name: 'label', type: 'string', required: true },
    { name: 'placement', type: 'string|null', required: true },
  ],
  pdp_variant_activated: [
    { name: 'variant', type: 'string', required: true },
    { name: 'product_slug', type: 'string', required: true },
    { name: 'is_tiktok', type: 'boolean', required: true },
    { name: 'is_litter_box', type: 'boolean', required: true },
    { name: 'intent_keyword', type: 'string|null', required: false },
    { name: 'intent_source', type: 'string|null', required: false },
    { name: 'utm_source', type: 'string|null', required: false },
    { name: 'landing_url', type: 'string|null', required: true },
  ],
};

interface ValidationIssue {
  field: string;
  severity: 'error' | 'warning';
  message: string;
}

function actualType(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function typeMatches(spec: GA4Type, v: unknown): boolean {
  if (spec === 'string|null') return v === null || typeof v === 'string';
  if (spec === 'string') return typeof v === 'string';
  if (spec === 'number') return typeof v === 'number' && Number.isFinite(v);
  if (spec === 'boolean') return typeof v === 'boolean';
  return false;
}

function validateEvent(eventName: string, params: Record<string, unknown>): ValidationIssue[] {
  const schema = EVENT_SCHEMAS[eventName];
  if (!schema) return [];
  const issues: ValidationIssue[] = [];
  const knownFields = new Set(schema.map((f) => f.name));

  for (const f of schema) {
    const present = Object.prototype.hasOwnProperty.call(params, f.name);
    const v = params[f.name];
    const isEmpty = !present || v === undefined || v === '' || (f.type !== 'string|null' && v === null);

    if (f.required && isEmpty) {
      issues.push({ field: f.name, severity: 'error', message: `Missing required field${f.note ? ` (${f.note})` : ''}.` });
      continue;
    }
    if (!isEmpty && !typeMatches(f.type, v)) {
      issues.push({
        field: f.name,
        severity: 'error',
        message: `Expected ${f.type}, got ${actualType(v)} (${JSON.stringify(v)}).`,
      });
      continue;
    }
    // Note-driven value checks (cheap, schema-local rules)
    if (f.note?.startsWith('must be "') && typeof v === 'string') {
      const expected = f.note.slice('must be "'.length, -1);
      if (v !== expected) {
        issues.push({ field: f.name, severity: 'error', message: `Expected exact value "${expected}", got "${v}".` });
      }
    }
  }

  // Unknown extras → warn (GA4 accepts them but they break dashboards / hit the 25-param limit faster).
  for (const key of Object.keys(params)) {
    if (!knownFields.has(key) && key !== 'traffic_type') {
      issues.push({ field: key, severity: 'warning', message: 'Unknown param — not in schema. Will be sent but unmapped in dashboards.' });
    }
  }
  return issues;
}

interface InspectionResult {
  inputValid: boolean;
  pathname: string;
  isProductPdp: boolean;
  productSlug: string | null;
  params: Array<{ key: string; value: string }>;
  tiktok: { active: boolean; matchedOn: string[] };
  adIntent: { keyword: string | null; source: 'pinterest' | 'ad' | null };
  warnings: string[];
}

function inspect(raw: string): InspectionResult {
  const warnings: string[] = [];
  let url: URL | null = null;
  let pathname = '';
  let search = '';

  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      inputValid: false, pathname: '', isProductPdp: false, productSlug: null,
      params: [], tiktok: { active: false, matchedOn: [] },
      adIntent: { keyword: null, source: null }, warnings: [],
    };
  }

  // Accept full URLs, path-only ("/products/foo?x=1"), or bare query strings ("?x=1" | "x=1").
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      url = new URL(trimmed);
      pathname = url.pathname;
      search = url.search;
    } else if (trimmed.startsWith('/')) {
      url = new URL(trimmed, 'https://placeholder.local');
      pathname = url.pathname;
      search = url.search;
    } else {
      // Treat as bare query string
      search = trimmed.startsWith('?') ? trimmed : `?${trimmed}`;
    }
  } catch {
    return {
      inputValid: false, pathname: '', isProductPdp: false, productSlug: null,
      params: [], tiktok: { active: false, matchedOn: [] },
      adIntent: { keyword: null, source: null },
      warnings: ['Could not parse input as a URL or query string.'],
    };
  }

  const sp = new URLSearchParams(search);
  const params = Array.from(sp.entries()).map(([key, value]) => ({ key, value }));

  // PDP route check — must be /products/{slug} per project routing rule.
  const productMatch = pathname.match(/^\/products\/([^/?#]+)\/?$/);
  const isProductPdp = !!productMatch;
  const productSlug = productMatch ? productMatch[1] : null;

  if (pathname && pathname.startsWith('/product/')) {
    warnings.push('Path uses singular "/product/" — must be plural "/products/{slug}".');
  }
  if (pathname && !isProductPdp && pathname !== '/' && !pathname.startsWith('/products/')) {
    warnings.push('Path is not a product PDP — TikTok / ad-intent hooks only fire on /products/{slug}.');
  }

  // useTikTokLanding mirror
  const utm = (sp.get('utm_source') || '').toLowerCase();
  const ad = (sp.get('ad') || '').toLowerCase();
  const src = (sp.get('src') || '').toLowerCase();
  const matchedOn: string[] = [];
  if (utm.includes('tiktok')) matchedOn.push(`utm_source="${utm}"`);
  if (ad === 'tt' || ad === 'tiktok') matchedOn.push(`ad="${ad}"`);
  if (src.includes('tiktok')) matchedOn.push(`src="${src}"`);
  const tiktokActive = matchedOn.length > 0;

  // useAdIntent mirror
  const hookParam = (sp.get('hook') || sp.get('utm_hook') || '').toLowerCase().trim();
  const kwParam = (sp.get('kw') || '').toLowerCase().trim();
  let intentKey: string | null = null;
  let intentSource: 'pinterest' | 'ad' | null = null;
  if (hookParam && INTENT_KEYS.has(hookParam)) {
    intentKey = hookParam;
    intentSource = utm.includes('pinterest') ? 'pinterest' : 'ad';
  } else if (kwParam && INTENT_KEYS.has(kwParam)) {
    intentKey = kwParam;
    intentSource = 'ad';
  }
  if (hookParam && !INTENT_KEYS.has(hookParam)) {
    warnings.push(`hook="${hookParam}" is not a known INTENT_MAP key — falls back to category.`);
  }
  if (kwParam && !INTENT_KEYS.has(kwParam)) {
    warnings.push(`kw="${kwParam}" is not a known INTENT_MAP key — falls back to category.`);
  }

  return {
    inputValid: true,
    pathname,
    isProductPdp,
    productSlug,
    params,
    tiktok: { active: tiktokActive, matchedOn },
    adIntent: { keyword: intentKey, source: intentSource },
    warnings,
  };
}

const PRESETS: Array<{ label: string; url: string }> = [
  {
    label: 'TikTok homepage hero',
    url: '/products/automatic-cat-litter-box-self-cleaning-app-control?utm_source=tiktok&utm_medium=social&utm_campaign=tt_home_hero&ad=tt&utm_content=home_hero_desktop',
  },
  {
    label: 'TikTok link-in-bio',
    url: '/products/automatic-cat-litter-box-self-cleaning-app-control?utm_source=tiktok&utm_medium=social&utm_campaign=tt_bio_link&ad=tt&utm_content=bio_primary',
  },
  {
    label: 'Pinterest hook=problem',
    url: '/products/automatic-cat-litter-box-self-cleaning-app-control?utm_source=pinterest&hook=problem',
  },
  {
    label: 'Google Ads kw=cooling',
    url: '/products/orthopedic-cooling-dog-bed?utm_source=google&utm_medium=cpc&kw=cooling',
  },
];

export default function DeepLinkInspectorPage() {
  const [input, setInput] = useState('');
  const [ga4Format, setGa4Format] = useState(true);
  const result = useMemo(() => inspect(input), [input]);

  // Build the predicted analytics payloads using the same shape that
  // TikTokDeepLinkButton (click) and ProductDetail (load) emit. Mirrors the
  // live event-shaping logic so QA matches what GA4 will actually receive.
  const payloads = useMemo(() => {
    if (!result.inputValid) return null;
    const sp = new URLSearchParams(
      result.params.reduce<Record<string, string>>((acc, { key, value }) => {
        acc[key] = value;
        return acc;
      }, {}),
    );

    // tiktok_deep_link_click — only synthesizable when the URL is shaped like
    // a TikTok deep-link (i.e. utm_source=tiktok). Otherwise mark N/A.
    const isTikTokShaped = (sp.get('utm_source') || '').toLowerCase().includes('tiktok');
    const click = isTikTokShaped
      ? {
          link_url: input.includes('?') || input.startsWith('/')
            ? (input.startsWith('http') ? new URL(input).pathname + new URL(input).search : input)
            : `?${input}`,
          product_slug: result.productSlug,
          utm_source: 'tiktok',
          utm_medium: sp.get('utm_medium') || 'social',
          utm_campaign: sp.get('utm_campaign') || null,
          utm_content: sp.get('utm_content') || null,
          ad: sp.get('ad') || 'tt',
          label: '<button label>',
          placement: sp.get('utm_content') || sp.get('utm_campaign') || null,
        }
      : null;

    // pdp_variant_activated — mirrors the variant-resolution ladder in PDP.
    const variant = result.tiktok.active && result.productSlug?.includes('litter')
      ? 'tiktok_litterbox'
      : result.tiktok.active
        ? 'tiktok_param_no_match'
        : result.adIntent.keyword
          ? `intent_${result.adIntent.keyword}`
          : 'standard';

    const landingUrl = result.pathname
      ? `${result.pathname}${result.params.length ? '?' + new URLSearchParams(sp).toString() : ''}`
      : null;

    const activation = {
      variant,
      product_id: '<resolved at runtime>',
      product_slug: result.productSlug,
      product_name: '<resolved at runtime>',
      is_tiktok: result.tiktok.active,
      is_litter_box: !!result.productSlug?.includes('litter'),
      intent_keyword: result.adIntent.keyword,
      intent_source: result.adIntent.source,
      utm_source: sp.get('utm_source'),
      utm_medium: sp.get('utm_medium'),
      utm_campaign: sp.get('utm_campaign'),
      utm_content: sp.get('utm_content'),
      ad: sp.get('ad'),
      landing_url: landingUrl,
    };

    return { click, activation };
  }, [input, result]);

  /**
   * Wrap a raw event payload in the canonical GA4 envelope our `trackEvent`
   * helper produces at runtime: `gtag('event', name, { ...params, traffic_type })`.
   * Splits out `user_properties` (only `traffic_type` today) so it matches
   * what GA4 DebugView actually shows.
   */
  const toGa4 = (eventName: string, params: Record<string, unknown>) => ({
    command: 'event',
    event_name: eventName,
    params: {
      ...params,
      // Auto-tagged by trackEvent() — see src/lib/analytics.ts
      traffic_type: '<resolved at runtime: organic|paid|founder|...>',
    },
    user_properties: {
      // Only set when Founder Mode is active (suppressed in many cases)
      gp_client: '<set to "founder" when Founder Mode is active, else omitted>',
    },
  });

  const formatPayload = (eventName: string, params: Record<string, unknown> | null) => {
    if (!params) return null;
    return ga4Format ? toGa4(eventName, params) : params;
  };

  const copyJson = (obj: unknown, label: string) => {
    navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
    toast.success(`Copied ${label} payload`);
  };

  return (
    <div className="container max-w-3xl py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Deep-Link Inspector</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Paste a deep-link URL or query string. See which PDP variant hooks would activate.
          </p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin"><ArrowLeft className="w-4 h-4 mr-1" /> Admin</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="w-4 h-4" /> Input
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="https://getpawsy.pet/products/...?utm_source=tiktok&ad=tt"
            className="font-mono text-xs"
            autoFocus
          />
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <Button
                key={p.label}
                size="sm"
                variant="outline"
                onClick={() => setInput(p.url)}
                className="text-xs"
              >
                {p.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {input && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Detected variants</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Route */}
            <Row
              label="PDP route"
              ok={result.isProductPdp}
              detail={
                result.isProductPdp
                  ? `slug: ${result.productSlug}`
                  : result.pathname
                    ? `pathname: ${result.pathname}`
                    : 'no path provided (query-only)'
              }
            />

            {/* TikTok variant */}
            <Row
              label="useTikTokLanding (TikTok PDP variant)"
              ok={result.tiktok.active}
              detail={
                result.tiktok.active
                  ? `MATCH on ${result.tiktok.matchedOn.join(', ')}`
                  : 'No TikTok params (utm_source=tiktok | ad=tt | src=tiktok).'
              }
            />

            {/* useAdIntent */}
            <Row
              label="useAdIntent (intent-matched headline)"
              ok={!!result.adIntent.keyword}
              detail={
                result.adIntent.keyword
                  ? `intent="${result.adIntent.keyword}" · source=${result.adIntent.source}`
                  : 'No hook= / utm_hook= / kw= match. Falls back to category.'
              }
            />

            {/* Params dump */}
            <div className="pt-2 border-t">
              <div className="text-xs font-semibold mb-2 text-muted-foreground">Query params ({result.params.length})</div>
              {result.params.length === 0 ? (
                <div className="text-xs text-muted-foreground italic">none</div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {result.params.map(({ key, value }) => (
                    <Badge key={`${key}=${value}`} variant="secondary" className="font-mono text-[11px]">
                      {key}={value}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Warnings */}
            {result.warnings.length > 0 && (
              <div className="pt-2 border-t space-y-1">
                <div className="text-xs font-semibold text-amber-600">Warnings</div>
                <ul className="text-xs text-amber-700 list-disc list-inside space-y-0.5">
                  {result.warnings.map((w) => <li key={w}>{w}</li>)}
                </ul>
              </div>
            )}

            {!result.inputValid && (
              <div className="text-xs text-destructive">Invalid input — paste a URL or `key=value&...` query string.</div>
            )}
          </CardContent>
        </Card>
      )}

      {input && payloads && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="w-4 h-4" /> Predicted analytics payloads
              </CardTitle>
              <div className="flex items-center gap-2">
                <Label htmlFor="ga4-format" className="text-xs cursor-pointer">
                  {ga4Format ? 'GA4-ready format' : 'Raw params'}
                </Label>
                <Switch
                  id="ga4-format"
                  checked={ga4Format}
                  onCheckedChange={setGa4Format}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* tiktok_deep_link_click */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <code className="text-xs font-semibold">tiktok_deep_link_click</code>
                {payloads.click && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => copyJson(
                      formatPayload('tiktok_deep_link_click', payloads.click),
                      'tiktok_deep_link_click',
                    )}
                  >
                    <Copy className="w-3 h-3 mr-1" /> Copy
                  </Button>
                )}
              </div>
              {payloads.click ? (
                <pre className="text-[11px] font-mono bg-muted/60 rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-all">
{JSON.stringify(formatPayload('tiktok_deep_link_click', payloads.click), null, 2)}
                </pre>
              ) : (
                <div className="text-xs text-muted-foreground italic px-1">
                  Not fired — URL is not shaped as a TikTok deep-link (needs <code>utm_source=tiktok</code>).
                </div>
              )}
            </div>

            {/* pdp_variant_activated */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <code className="text-xs font-semibold">pdp_variant_activated</code>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => copyJson(
                    formatPayload('pdp_variant_activated', payloads.activation),
                    'pdp_variant_activated',
                  )}
                >
                  <Copy className="w-3 h-3 mr-1" /> Copy
                </Button>
              </div>
              <pre className="text-[11px] font-mono bg-muted/60 rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-all">
{JSON.stringify(formatPayload('pdp_variant_activated', payloads.activation), null, 2)}
              </pre>
              <p className="text-[11px] text-muted-foreground px-1">
                <code>product_id</code> / <code>product_name</code> are resolved at runtime once the PDP loads the product.
              </p>
            </div>

            {ga4Format && (
              <p className="text-[11px] text-muted-foreground border-t pt-3">
                GA4 format mirrors what <code>trackEvent()</code> sends via{' '}
                <code>gtag('event', name, params)</code>. The auto-tagged{' '}
                <code>traffic_type</code> param and Founder Mode <code>gp_client</code> user property are added at runtime.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="flex items-start gap-3">
      {ok
        ? <CheckCircle2 className="w-5 h-5 text-success shrink-0 mt-0.5" />
        : <XCircle className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground font-mono break-all">{detail}</div>
      </div>
    </div>
  );
}