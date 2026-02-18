import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react";

interface AuditCheck {
  label: string;
  pass: boolean;
  detail: string;
}

export function PerfAuditWidget() {
  const [checks, setChecks] = useState<AuditCheck[]>([]);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async () => {
    setLoading(true);
    const results: AuditCheck[] = [];

    try {
      // Fetch homepage HTML
      const html = await (await fetch('/', { cache: 'no-store' })).text();

      // 1. Check preload tag for hero image
      const hasPreload = /<link[^>]+rel=["']preload["'][^>]+hero/i.test(html);
      results.push({
        label: 'Hero image preload tag in <head>',
        pass: hasPreload,
        detail: hasPreload ? 'Found preload link for hero image' : 'Missing <link rel="preload"> for hero image',
      });

      // 2. Check fetchpriority on hero img
      const hasFetchPriority = /fetchpriority=["']high["']/i.test(html) || /fetchPriority.*high/i.test(html);
      results.push({
        label: 'fetchpriority="high" on LCP image',
        pass: hasFetchPriority,
        detail: hasFetchPriority ? 'Found fetchpriority="high"' : 'Missing fetchpriority attribute',
      });

      // 3. Check no transition/hover classes on hero
      const heroSection = html.match(/hero-lcp-section[\s\S]{0,2000}/i)?.[0] || '';
      const hasTransition = /transition-opacity|transition-all|hover:scale|group-hover:scale/.test(heroSection);
      results.push({
        label: 'No animation/transition classes on LCP element',
        pass: !hasTransition,
        detail: hasTransition ? 'Found transition/hover classes near LCP element' : 'Clean — no animation classes on LCP',
      });

      // 4. Check hero has width/height
      const heroImg = html.match(/<img[^>]*hero-lcp[^>]*/i)?.[0] || '';
      const hasWidthHeight = /width=/.test(heroImg) && /height=/.test(heroImg);
      results.push({
        label: 'Hero image has width/height attributes',
        pass: hasWidthHeight,
        detail: hasWidthHeight ? 'width and height present' : 'Missing explicit dimensions',
      });

      // 5. Check loading="eager" (not lazy)
      const isLazy = /loading=["']lazy["']/i.test(heroImg);
      results.push({
        label: 'Hero image NOT lazy-loaded',
        pass: !isLazy,
        detail: isLazy ? 'ERROR: Hero image has loading="lazy"' : 'Correct: loading="eager" or default',
      });

      // 6. Check decoding="async"
      const hasDecoding = /decoding=["']async["']/i.test(heroImg);
      results.push({
        label: 'decoding="async" on hero image',
        pass: hasDecoding,
        detail: hasDecoding ? 'Present' : 'Missing decoding attribute',
      });

      // 7. Bundle size check — find JS assets
      const jsAssets = [...html.matchAll(/\/assets\/([^"']+\.js)/g)].map(m => `/assets/${m[1]}`);
      let totalJsSize = 0;
      let largestChunk = 0;
      for (const path of jsAssets.slice(0, 10)) {
        try {
          const res = await fetch(path, { method: 'HEAD', cache: 'no-store' });
          const size = parseInt(res.headers.get('content-length') || '0');
          totalJsSize += size;
          if (size > largestChunk) largestChunk = size;
        } catch { /* ignore */ }
      }
      const totalKB = Math.round(totalJsSize / 1024);
      const largestKB = Math.round(largestChunk / 1024);
      results.push({
        label: `Total JS: ${totalKB}KB (target <200KB gzip)`,
        pass: totalKB < 500, // uncompressed; gzip ~3-4x smaller
        detail: `${jsAssets.length} JS files, total ${totalKB}KB uncompressed, largest chunk ${largestKB}KB`,
      });

      // 8. Build timestamp
      results.push({
        label: 'Build info',
        pass: true,
        detail: `Audit run: ${new Date().toISOString()}, origin: ${window.location.origin}`,
      });

    } catch (e: any) {
      results.push({ label: 'Audit error', pass: false, detail: e.message });
    }

    setChecks(results);
    setLoading(false);
  }, []);

  const allPass = checks.length > 0 && checks.every(c => c.pass);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>LCP & Performance Checklist</span>
          <Button size="sm" onClick={run} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            Run Audit
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {checks.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium mb-3">
              {allPass ? '✅ All checks pass' : '⚠️ Some checks need attention'}
            </div>
            {checks.map((c, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                {c.pass ? <CheckCircle2 className="w-4 h-4 text-primary mt-0.5" /> : <XCircle className="w-4 h-4 text-destructive mt-0.5" />}
                <div>
                  <div className="font-medium">{c.label}</div>
                  <div className="text-xs text-muted-foreground">{c.detail}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
