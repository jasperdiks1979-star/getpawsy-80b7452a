/**
 * /debug/perf — admin-only performance testing guide.
 * Shows instructions for running ?perf=1 tests and PSI benchmarks.
 */
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';

const steps = [
  {
    step: '1',
    title: 'Console Logger (instant)',
    description: 'Open the homepage in an incognito tab on mobile (or Chrome DevTools → mobile simulation).',
    action: 'Open /?perf=1 in incognito',
    href: '/?perf=1',
    detail: 'Open DevTools → Console. You will see colour-coded timing for TTFB, DCL, LCP, FID/INP, and the top 10 JS bundle sizes sorted by gzip.',
  },
  {
    step: '2',
    title: 'PageSpeed Insights — Homepage',
    description: 'Runs a real Lighthouse audit on getpawsy.pet from Google infrastructure.',
    action: 'Run PSI on Homepage',
    href: 'https://pagespeed.web.dev/analysis?url=https%3A%2F%2Fgetpawsy.pet%2F',
    detail: 'Focus on: LCP (target < 2.5s, ideal < 1.8s), TBT (target < 200ms), CLS (target < 0.1). Check "Opportunities" for remaining blocking resources.',
  },
  {
    step: '3',
    title: 'PageSpeed Insights — Category Page',
    description: 'Test a real product listing page which loads heavier JS (Radix selects, product grid).',
    action: 'Run PSI on /products',
    href: 'https://pagespeed.web.dev/analysis?url=https%3A%2F%2Fgetpawsy.pet%2Fproducts',
    detail: 'Compare LCP and TBT with the homepage. If gap > 500ms, the category-specific bundle chunk needs splitting.',
  },
  {
    step: '4',
    title: 'Bundle Composition (local)',
    description: 'Run the production build locally and inspect chunk sizes.',
    action: null,
    href: null,
    detail: 'Run: bun run build\nInspect dist/assets/ — look for:\n  • react-vendor-*.js (target < 50KB gzip)\n  • router-*.js (target < 15KB gzip)\n  • radix-ui-*.js (should NOT appear in initial network waterfall)\n  • icons-*.js (target < 10KB gzip on homepage)\n  • Main app chunk — target < 80KB gzip',
  },
  {
    step: '5',
    title: 'LCP Trace (advanced)',
    description: 'Activate the detailed pre-React timeline tracer to see exact parse/hydration gaps.',
    action: 'Open /?lcpTrace=1',
    href: '/?lcpTrace=1',
    detail: 'Open DevTools → Console before the page loads. Each log is prefixed 🔴 [LCP-WINDOW] (< 2s) or 🟢 [POST-LCP] (> 2s).',
  },
];

const thresholds = [
  { metric: 'LCP',  good: '< 1.8s',   target: '< 2.5s',   poor: '> 4.0s' },
  { metric: 'FCP',  good: '< 1.0s',   target: '< 1.8s',   poor: '> 3.0s' },
  { metric: 'CLS',  good: '< 0.05',   target: '< 0.1',    poor: '> 0.25' },
  { metric: 'INP',  good: '< 100ms',  target: '< 200ms',  poor: '> 500ms' },
  { metric: 'TTFB', good: '< 200ms',  target: '< 600ms',  poor: '> 1800ms' },
  { metric: 'TBT',  good: '< 100ms',  target: '< 200ms',  poor: '> 600ms' },
];

export default function PerfDebugPage() {
  return (
    <>
      <Helmet>
        <title>Perf Debug — GetPawsy Admin</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="max-w-3xl mx-auto p-6 space-y-8">
        <div>
          <h1 className="text-2xl font-bold mb-1">Performance Testing Guide</h1>
          <p className="text-muted-foreground text-sm">
            Internal tool — not indexed by search engines. Use the steps below to measure real-world CWV.
          </p>
        </div>

        {/* Thresholds */}
        <div className="rounded-xl border overflow-hidden">
          <div className="px-4 py-3 bg-muted/50 border-b">
            <h2 className="font-semibold text-sm">Target Thresholds</h2>
          </div>
          <div className="divide-y">
            {thresholds.map(t => (
              <div key={t.metric} className="grid grid-cols-4 px-4 py-2.5 text-sm">
                <span className="font-mono font-bold">{t.metric}</span>
                <span className="text-[hsl(142,71%,45%)] font-medium">{t.good}</span>
                <span className="text-[hsl(48,96%,53%)] font-medium">{t.target}</span>
                <span className="text-destructive font-medium">{t.poor}</span>
              </div>
            ))}
            <div className="grid grid-cols-4 px-4 py-2 text-xs text-muted-foreground bg-muted/30">
              <span>Metric</span>
              <span className="text-[hsl(142,71%,45%)]">Good</span>
              <span className="text-[hsl(48,96%,53%)]">Needs Work</span>
              <span className="text-destructive">Poor</span>
            </div>
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-4">
          {steps.map(s => (
            <div key={s.step} className="rounded-xl border p-5">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                  {s.step}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold mb-1">{s.title}</h3>
                  <p className="text-sm text-muted-foreground mb-3">{s.description}</p>
                  {s.href && (
                    <Button
                      size="sm"
                      variant="outline"
                      asChild
                      className="mb-3"
                    >
                      <a href={s.href} target="_blank" rel="noopener noreferrer">
                        {s.action} ↗
                      </a>
                    </Button>
                  )}
                  <pre className="text-xs bg-muted rounded-lg p-3 whitespace-pre-wrap font-mono leading-relaxed">
                    {s.detail}
                  </pre>
                </div>
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground text-center pb-8">
          This page is only accessible via /debug/perf. It renders with no tracking, no analytics, no heavy JS.
        </p>
      </div>
    </>
  );
}
