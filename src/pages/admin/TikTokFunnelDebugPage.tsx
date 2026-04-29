/**
 * TikTokFunnelDebugPage — admin viewer for the per-session UTM checkpoint
 * log captured by `src/lib/utmDebugLog.ts`.
 *
 * Workflow:
 *   1. Open any landing page with `?debug_utm=1` (or click "Enable" here).
 *      The flag sticks for the rest of the tab.
 *   2. Walk the funnel: /go → CTA → product page.
 *   3. Refresh this page to see one row per checkpoint and immediately
 *      spot which step dropped utm_campaign / utm_content.
 *
 * The "resolved_from" column flags rescued UTMs:
 *   - "url"      → param was on the request URL (healthy)
 *   - "session"  → param was rescued from sessionStorage (a redirect or
 *                  link upstream stripped it)
 *   - "inferred" → no source UTM at all; tracker guessed (e.g. came from
 *                  /go ⇒ tiktok)
 *   - "missing"  → no value anywhere (this is your leak)
 */
import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  readUtmDebugLog,
  clearUtmDebugLog,
  enableUtmDebug,
  disableUtmDebug,
  isUtmDebugEnabled,
  type UtmDebugEntry,
} from '@/lib/utmDebugLog';
import { UTM_KEYS } from '@/lib/utmNormalizer';

const SOURCE_TONE: Record<string, string> = {
  url: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
  session: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
  inferred: 'bg-sky-500/15 text-sky-700 border-sky-500/30',
  fallback: 'bg-violet-500/15 text-violet-700 border-violet-500/30',
  missing: 'bg-destructive/15 text-destructive border-destructive/40',
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

export default function TikTokFunnelDebugPage() {
  const [entries, setEntries] = useState<UtmDebugEntry[]>([]);
  const [enabled, setEnabled] = useState<boolean>(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setEntries(readUtmDebugLog());
    setEnabled(isUtmDebugEnabled());
  }, [tick]);

  // Auto-refresh while open so a parallel tab walking the funnel shows up.
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 2000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="space-y-6">
      <Helmet>
        <title>TikTok Funnel Debug — UTM Checkpoints</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">TikTok Funnel Debug</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Per-session UTM checkpoints captured at <code>/go</code> mount, CTA click and PDP load.
            Use this to localize where <code>utm_campaign</code> or <code>utm_content</code>
            disappears between steps.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={enabled ? 'border-emerald-500/40 text-emerald-700' : 'border-muted-foreground/40 text-muted-foreground'}>
            {enabled ? 'Debug ON' : 'Debug OFF'}
          </Badge>
          {enabled ? (
            <Button variant="outline" size="sm" onClick={() => { disableUtmDebug(); setTick((n) => n + 1); }}>
              Disable
            </Button>
          ) : (
            <Button variant="default" size="sm" onClick={() => { enableUtmDebug(); setTick((n) => n + 1); }}>
              Enable
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => { clearUtmDebugLog(); setTick((n) => n + 1); }}>
            Clear
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">How to use</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            1. Click <strong>Enable</strong> above (or open any URL with <code>?debug_utm=1</code>).
            The flag persists for the rest of this tab.
          </p>
          <p>
            2. In a NEW tab on the same browser, visit a TikTok landing URL like{' '}
            <code>/go?utm_source=tiktok&amp;utm_campaign=hook1&amp;utm_content=test</code>,
            click the CTA, and let the product page load.
          </p>
          <p>
            3. Return here — entries auto-refresh every 2s. Look for any row where{' '}
            <span className="text-destructive font-semibold">missing</span> appears in the
            "resolved from" column. That checkpoint is the leak.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Checkpoints {entries.length > 0 ? <span className="text-muted-foreground font-normal">({entries.length})</span> : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              No checkpoints recorded in this tab yet. Enable debug and walk the funnel.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border/60 text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Time</th>
                    <th className="py-2 pr-3 font-medium">Checkpoint</th>
                    <th className="py-2 pr-3 font-medium">Path</th>
                    {UTM_KEYS.map((k) => (
                      <th key={k} className="py-2 pr-3 font-medium">{k.replace('utm_', '')}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries
                    .slice()
                    .reverse()
                    .map((e, i) => (
                      <tr key={i} className="border-b border-border/30 align-top">
                        <td className="py-2 pr-3 whitespace-nowrap font-mono text-muted-foreground">
                          {formatTime(e.ts)}
                        </td>
                        <td className="py-2 pr-3">
                          <Badge variant="outline" className="font-mono text-[11px]">
                            {e.checkpoint}
                          </Badge>
                        </td>
                        <td className="py-2 pr-3 font-mono text-muted-foreground max-w-[280px] truncate" title={e.path + e.search}>
                          {e.path}
                          {e.search ? <span className="text-foreground/50">{e.search}</span> : null}
                        </td>
                        {UTM_KEYS.map((k) => {
                          const value = e.utm[k];
                          const source = e.resolved_from[k] || 'missing';
                          return (
                            <td key={k} className="py-2 pr-3">
                              <div className="font-mono text-[11px] text-foreground">
                                {value ?? <span className="text-muted-foreground">—</span>}
                              </div>
                              <div className={`mt-0.5 inline-block px-1.5 py-0.5 rounded border text-[10px] uppercase tracking-wide ${SOURCE_TONE[source]}`}>
                                {source}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
