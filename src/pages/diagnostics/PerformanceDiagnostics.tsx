import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Layout } from '@/components/layout/Layout';

interface PerfMetrics {
  ttfb: number | null;
  fcp: number | null;
  lcp: number | null;
  domContentLoaded: number | null;
  windowLoad: number | null;
  totalTransferKB: number | null;
  jsTransferKB: number | null;
  imgTransferKB: number | null;
  cssTransferKB: number | null;
  resourceCount: number;
  oversizedImages: string[];
}

export default function PerformanceDiagnostics() {
  const [metrics, setMetrics] = useState<PerfMetrics | null>(null);

  useEffect(() => {
    const collect = () => {
      try {
        const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
        const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];

        let totalTransfer = 0;
        let jsTransfer = 0;
        let imgTransfer = 0;
        let cssTransfer = 0;
        const oversized: string[] = [];

        resources.forEach(r => {
          const size = r.encodedBodySize || r.transferSize || 0;
          totalTransfer += size;

          if (r.initiatorType === 'script' || r.name.endsWith('.js')) jsTransfer += size;
          else if (r.initiatorType === 'img' || /\.(png|jpg|jpeg|webp|avif|gif|svg)/.test(r.name)) {
            imgTransfer += size;
            if (size > 300 * 1024) {
              oversized.push(`${r.name.split('/').pop()?.split('?')[0]} (${Math.round(size / 1024)}KB)`);
            }
          }
          else if (r.initiatorType === 'css' || r.name.endsWith('.css')) cssTransfer += size;
        });

        // FCP
        let fcp: number | null = null;
        const fcpEntries = performance.getEntriesByName('first-contentful-paint');
        if (fcpEntries.length) fcp = Math.round(fcpEntries[0].startTime);

        // LCP via PerformanceObserver (already captured)
        let lcp: number | null = null;
        try {
          const lcpEntries = (performance as any).getEntriesByType?.('largest-contentful-paint');
          if (lcpEntries?.length) lcp = Math.round(lcpEntries[lcpEntries.length - 1].startTime);
        } catch { /* not available */ }

        setMetrics({
          ttfb: nav ? Math.round(nav.responseStart) : null,
          fcp,
          lcp,
          domContentLoaded: nav ? Math.round(nav.domContentLoadedEventStart) : null,
          windowLoad: nav ? Math.round(nav.loadEventStart) : null,
          totalTransferKB: Math.round(totalTransfer / 1024),
          jsTransferKB: Math.round(jsTransfer / 1024),
          imgTransferKB: Math.round(imgTransfer / 1024),
          cssTransferKB: Math.round(cssTransfer / 1024),
          resourceCount: resources.length,
          oversizedImages: oversized,
        });
      } catch { /* silently fail */ }
    };

    // Wait for LCP to settle
    const timer = setTimeout(collect, 4000);
    return () => clearTimeout(timer);
  }, []);

  const status = (val: number | null, good: number, bad: number) => {
    if (val === null) return 'text-muted-foreground';
    return val <= good ? 'text-green-600 font-semibold' : val <= bad ? 'text-amber-600 font-semibold' : 'text-destructive font-semibold';
  };

  return (
    <Layout>
      <Helmet>
        <title>Performance Diagnostics | GetPawsy</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="container py-8 max-w-3xl">
        <h1 className="text-2xl font-bold mb-2">Performance Diagnostics</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Real-time CWV approximations from Navigation Timing + PerformanceObserver.
        </p>

        {!metrics ? (
          <p className="text-muted-foreground">Collecting metrics (4s)…</p>
        ) : (
          <div className="space-y-6">
            {/* Core Web Vitals */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard label="TTFB" value={metrics.ttfb} unit="ms" className={status(metrics.ttfb, 800, 1800)} target="< 800ms" />
              <MetricCard label="FCP" value={metrics.fcp} unit="ms" className={status(metrics.fcp, 1800, 3000)} target="< 1.8s" />
              <MetricCard label="LCP" value={metrics.lcp} unit="ms" className={status(metrics.lcp, 2500, 4000)} target="< 2.5s" />
              <MetricCard label="DOM Ready" value={metrics.domContentLoaded} unit="ms" className="text-foreground" />
            </div>

            {/* Transfer sizes */}
            <div>
              <h2 className="text-lg font-semibold mb-3">Transfer Sizes</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetricCard
                  label="Total"
                  value={metrics.totalTransferKB}
                  unit="KB"
                  className={status(metrics.totalTransferKB, 2048, 4096)}
                  target="< 2048KB"
                />
                <MetricCard label="JS" value={metrics.jsTransferKB} unit="KB" className="text-foreground" />
                <MetricCard label="Images" value={metrics.imgTransferKB} unit="KB" className="text-foreground" />
                <MetricCard label="CSS" value={metrics.cssTransferKB} unit="KB" className="text-foreground" />
              </div>
              <p className="text-xs text-muted-foreground mt-2">{metrics.resourceCount} resources loaded</p>
            </div>

            {/* Oversized images */}
            {metrics.oversizedImages.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-2 text-destructive">⚠️ Oversized Images (&gt;300KB)</h2>
                <ul className="text-sm space-y-1">
                  {metrics.oversizedImages.map((img, i) => (
                    <li key={i} className="font-mono text-xs text-destructive">{img}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Targets */}
            <div className="bg-muted/50 rounded-lg p-4">
              <h2 className="text-sm font-semibold mb-2">Target Summary</h2>
              <ul className="text-xs space-y-1 text-muted-foreground">
                <li>TTFB: {metrics.ttfb !== null && metrics.ttfb <= 800 ? '✅' : '❌'} Target &lt;800ms — Actual: {metrics.ttfb ?? '?'}ms</li>
                <li>LCP: {metrics.lcp !== null && metrics.lcp <= 2500 ? '✅' : '❌'} Target &lt;2.5s — Actual: {metrics.lcp ?? '?'}ms</li>
                <li>FCP: {metrics.fcp !== null && metrics.fcp <= 1800 ? '✅' : '❌'} Target &lt;1.8s — Actual: {metrics.fcp ?? '?'}ms</li>
                <li>Payload: {metrics.totalTransferKB !== null && metrics.totalTransferKB <= 2048 ? '✅' : '❌'} Target &lt;2MB — Actual: {metrics.totalTransferKB ?? '?'}KB</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

function MetricCard({ label, value, unit, className, target }: {
  label: string;
  value: number | null;
  unit: string;
  className?: string;
  target?: string;
}) {
  return (
    <div className="bg-card border rounded-lg p-3">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-xl ${className || ''}`}>
        {value !== null ? value.toLocaleString() : '—'}
        <span className="text-xs text-muted-foreground ml-1">{unit}</span>
      </p>
      {target && <p className="text-[10px] text-muted-foreground mt-1">Target: {target}</p>}
    </div>
  );
}
