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
import { ArrowLeft, CheckCircle2, XCircle, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/** Subset mirror of INTENT_MAP keys in src/hooks/useAdIntent.ts. Keep in sync. */
const INTENT_KEYS = new Set([
  'large-dogs', 'cooling', 'orthopedic', 'travel', 'outdoor', 'senior',
  'puppy', 'cat-tree', 'litter-box',
  'problem', 'solution', 'comparison', 'transformation',
]);

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
  const result = useMemo(() => inspect(input), [input]);

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