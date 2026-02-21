import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Layout } from '@/components/layout/Layout';

interface ResourceInfo {
  name: string;
  initiatorType: string;
  transferKB: number;
}

interface LcpInfo {
  time: number | null;
  tagName: string | null;
  src: string | null;
  id: string | null;
  size: string | null;
}

interface PerfMetrics {
  ttfb: number | null;
  fcp: number | null;
  lcp: LcpInfo;
  domContentLoaded: number | null;
  windowLoad: number | null;
  totalTransferKB: number | null;
  jsTransferKB: number | null;
  imgTransferKB: number | null;
  cssTransferKB: number | null;
  fontTransferKB: number | null;
  resourceCount: number;
  oversizedImages: string[];
  topResources: ResourceInfo[];
  imageDetails: Array<{ name: string; transferKB: number; isOptimized: boolean }>;
}

export default function PerformanceDiagnostics() {
  const [metrics, setMetrics] = useState<PerfMetrics | null>(null);

  useEffect(() => {
    // Observe LCP
    let lcpInfo: LcpInfo = { time: null, tagName: null, src: null, id: null, size: null };
    let lcpObserver: PerformanceObserver | null = null;
    try {
      lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries.length > 0) {
          const last = entries[entries.length - 1] as any;
          lcpInfo = {
            time: Math.round(last.startTime),
            tagName: last.element?.tagName || null,
            src: last.url || last.element?.src || last.element?.currentSrc || null,
            id: last.element?.id || null,
            size: last.size ? `${last.size}px²` : null,
          };
        }
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch { /* not supported */ }

    const collect = () => {
      try {
        if (lcpObserver) lcpObserver.disconnect();
        const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
        const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];

        let totalTransfer = 0;
        let jsTransfer = 0;
        let imgTransfer = 0;
        let cssTransfer = 0;
        let fontTransfer = 0;
        const oversized: string[] = [];
        const allResources: ResourceInfo[] = [];
        const imageDetails: Array<{ name: string; transferKB: number; isOptimized: boolean }> = [];

        resources.forEach(r => {
          const size = r.encodedBodySize || r.transferSize || 0;
          totalTransfer += size;
          const sizeKB = Math.round(size / 1024);
          const shortName = r.name.split('/').pop()?.split('?')[0] || r.name;

          allResources.push({ name: shortName, initiatorType: r.initiatorType, transferKB: sizeKB });

          if (r.initiatorType === 'script' || r.name.endsWith('.js')) jsTransfer += size;
          else if (r.initiatorType === 'css' || r.name.endsWith('.css')) cssTransfer += size;
          else if (r.initiatorType === 'img' || /\.(png|jpg|jpeg|webp|avif|gif|svg)(\?|$)/i.test(r.name)) {
            imgTransfer += size;
            const isOptimized = !r.name.includes('cf.cjdropshipping.com') || r.name.includes('res.cloudinary.com') || r.name.includes('imgix');
            imageDetails.push({ name: shortName, transferKB: sizeKB, isOptimized });
            if (size > 300 * 1024) {
              oversized.push(`${shortName} (${sizeKB}KB)`);
            }
          } else if (/\.(woff2?|ttf|otf|eot)(\?|$)/i.test(r.name)) {
            fontTransfer += size;
          }
        });

        // Sort by size desc, take top 10
        allResources.sort((a, b) => b.transferKB - a.transferKB);
        const topResources = allResources.slice(0, 10);

        // FCP
        let fcp: number | null = null;
        const fcpEntries = performance.getEntriesByName('first-contentful-paint');
        if (fcpEntries.length) fcp = Math.round(fcpEntries[0].startTime);

        // If LCP not captured by observer, try getEntriesByType
        if (lcpInfo.time === null) {
          try {
            const lcpEntries = (performance as any).getEntriesByType?.('largest-contentful-paint');
            if (lcpEntries?.length) {
              const last = lcpEntries[lcpEntries.length - 1];
              lcpInfo.time = Math.round(last.startTime);
              lcpInfo.tagName = last.element?.tagName || null;
              lcpInfo.src = last.url || null;
            }
          } catch { /* */ }
        }

        // Sort images by size
        imageDetails.sort((a, b) => b.transferKB - a.transferKB);

        setMetrics({
          ttfb: nav ? Math.round(nav.responseStart) : null,
          fcp,
          lcp: lcpInfo,
          domContentLoaded: nav ? Math.round(nav.domContentLoadedEventStart) : null,
          windowLoad: nav ? Math.round(nav.loadEventStart) : null,
          totalTransferKB: Math.round(totalTransfer / 1024),
          jsTransferKB: Math.round(jsTransfer / 1024),
          imgTransferKB: Math.round(imgTransfer / 1024),
          cssTransferKB: Math.round(cssTransfer / 1024),
          fontTransferKB: Math.round(fontTransfer / 1024),
          resourceCount: resources.length,
          oversizedImages: oversized,
          topResources,
          imageDetails: imageDetails.slice(0, 15),
        });
      } catch { /* silently fail */ }
    };

    const timer = setTimeout(collect, 5000);
    return () => { clearTimeout(timer); if (lcpObserver) lcpObserver.disconnect(); };
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
      <div className="container py-8 max-w-4xl">
        <h1 className="text-2xl font-bold mb-2">Performance Diagnostics</h1>
        <p className="text-sm text-muted-foreground mb-1">
          Route tested: <code className="bg-muted px-1 rounded">{typeof window !== 'undefined' ? window.location.pathname : '/'}</code>
        </p>
        <p className="text-xs text-muted-foreground mb-6">
          Tip: Navigate to <code>/</code> first, then come here to see homepage metrics. Use <code>?lcpTrace=1</code> for detailed console logging.
        </p>

        {!metrics ? (
          <p className="text-muted-foreground">Collecting metrics (5s)…</p>
        ) : (
          <div className="space-y-6">
            {/* Core Web Vitals */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <MetricCard label="TTFB" value={metrics.ttfb} unit="ms" className={status(metrics.ttfb, 800, 1800)} target="< 800ms" />
              <MetricCard label="FCP" value={metrics.fcp} unit="ms" className={status(metrics.fcp, 1800, 3000)} target="< 1.8s" />
              <MetricCard label="LCP" value={metrics.lcp.time} unit="ms" className={status(metrics.lcp.time, 2500, 4000)} target="< 2.5s" />
              <MetricCard label="DOM Ready" value={metrics.domContentLoaded} unit="ms" className="text-foreground" />
              <MetricCard label="Window Load" value={metrics.windowLoad} unit="ms" className="text-foreground" />
            </div>

            {/* LCP Element Identification */}
            <div className="bg-card border rounded-lg p-4">
              <h2 className="text-lg font-semibold mb-2">🎯 LCP Element</h2>
              {metrics.lcp.time !== null ? (
                <div className="space-y-1 text-sm">
                  <p><span className="text-muted-foreground">Time:</span> <span className={status(metrics.lcp.time, 2500, 4000)}>{metrics.lcp.time}ms</span></p>
                  <p><span className="text-muted-foreground">Tag:</span> <code className="bg-muted px-1 rounded">{metrics.lcp.tagName || 'unknown'}</code></p>
                  {metrics.lcp.id && <p><span className="text-muted-foreground">ID:</span> <code className="bg-muted px-1 rounded">#{metrics.lcp.id}</code></p>}
                  {metrics.lcp.src && <p><span className="text-muted-foreground">URL:</span> <code className="bg-muted px-1 rounded text-xs break-all">{metrics.lcp.src}</code></p>}
                  {metrics.lcp.size && <p><span className="text-muted-foreground">Size:</span> {metrics.lcp.size}</p>}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">LCP not captured (SPA navigation or browser doesn't support buffered LCP)</p>
              )}
            </div>

            {/* Transfer sizes */}
            <div>
              <h2 className="text-lg font-semibold mb-3">Transfer Sizes</h2>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <MetricCard label="Total" value={metrics.totalTransferKB} unit="KB" className={status(metrics.totalTransferKB, 2048, 4096)} target="< 2048KB" />
                <MetricCard label="JS" value={metrics.jsTransferKB} unit="KB" className={status(metrics.jsTransferKB, 300, 500)} />
                <MetricCard label="Images" value={metrics.imgTransferKB} unit="KB" className={status(metrics.imgTransferKB, 1000, 2000)} />
                <MetricCard label="CSS" value={metrics.cssTransferKB} unit="KB" className="text-foreground" />
                <MetricCard label="Fonts" value={metrics.fontTransferKB} unit="KB" className="text-foreground" />
              </div>
              <p className="text-xs text-muted-foreground mt-2">{metrics.resourceCount} resources loaded</p>
            </div>

            {/* Top 10 Largest Resources */}
            <div>
              <h2 className="text-lg font-semibold mb-2">Top 10 Largest Resources</h2>
              <div className="bg-card border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-2 font-medium">Resource</th>
                      <th className="text-left p-2 font-medium">Type</th>
                      <th className="text-right p-2 font-medium">Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.topResources.map((r, i) => (
                      <tr key={i} className="border-t border-border/50">
                        <td className="p-2 font-mono text-xs truncate max-w-[200px]">{r.name}</td>
                        <td className="p-2 text-muted-foreground">{r.initiatorType}</td>
                        <td className={`p-2 text-right ${r.transferKB > 300 ? 'text-destructive font-semibold' : ''}`}>{r.transferKB}KB</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Image Analysis */}
            {metrics.imageDetails.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-2">Image Analysis</h2>
                <div className="bg-card border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-2 font-medium">Image</th>
                        <th className="text-right p-2 font-medium">Size</th>
                        <th className="text-center p-2 font-medium">Optimized?</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.imageDetails.map((img, i) => (
                        <tr key={i} className="border-t border-border/50">
                          <td className="p-2 font-mono text-xs truncate max-w-[250px]">{img.name}</td>
                          <td className={`p-2 text-right ${img.transferKB > 200 ? 'text-destructive font-semibold' : ''}`}>{img.transferKB}KB</td>
                          <td className="p-2 text-center">{img.isOptimized ? '✅' : '⚠️ raw'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

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
                <li>FCP: {metrics.fcp !== null && metrics.fcp <= 1800 ? '✅' : '❌'} Target &lt;1.8s — Actual: {metrics.fcp ?? '?'}ms</li>
                <li>LCP: {metrics.lcp.time !== null && metrics.lcp.time <= 2500 ? '✅' : '❌'} Target &lt;2.5s — Actual: {metrics.lcp.time ?? '?'}ms {metrics.lcp.tagName ? `(${metrics.lcp.tagName})` : ''}</li>
                <li>Payload: {metrics.totalTransferKB !== null && metrics.totalTransferKB <= 2048 ? '✅' : '❌'} Target &lt;2MB — Actual: {metrics.totalTransferKB ?? '?'}KB</li>
                <li>Hero ≤200KB: {metrics.imageDetails.length > 0 ? (metrics.imageDetails.find(i => i.name.includes('hero'))?.transferKB ?? 0) <= 200 ? '✅' : '❌' : '—'}</li>
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
