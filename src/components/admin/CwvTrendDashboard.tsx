/**
 * CWV Trend Dashboard — 30-day field data p50/p75 per route group.
 * Shows improvement indicators post-deploy and GSC validation guidance.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, TrendingUp, TrendingDown, Minus, Info, Smartphone, Monitor } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface VitalRow {
  ts: string;
  path: string;
  device_hint: string | null;
  lcp_value: number | null;
  cls_value: number | null;
  inp_value: number | null;
  proxy_lcp_value: number | null;
  proxy_lcp_candidate: string | null;
  connection_type: string | null;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function normalizeRoute(path: string): string {
  if (path.startsWith('/product/')) return '/product/*';
  if (path.startsWith('/guides/')) return '/guides/*';
  if (path.includes('category=')) return '/products?category=*';
  if (path === '/products') return '/products';
  if (path === '/') return '/';
  return path;
}

function ratingColor(metric: string, value: number | null): string {
  if (value === null) return 'text-muted-foreground';
  const t: Record<string, [number, number]> = {
    lcp: [2500, 4000], cls: [0.1, 0.25], inp: [200, 500],
  };
  const th = t[metric];
  if (!th) return 'text-muted-foreground';
  if (value <= th[0]) return 'text-green-600';
  if (value <= th[1]) return 'text-yellow-600';
  return 'text-red-600';
}

function TrendIcon({ current, previous }: { current: number | null; previous: number | null }) {
  if (current === null || previous === null) return <Minus className="h-3 w-3 text-muted-foreground" />;
  const diff = ((current - previous) / previous) * 100;
  if (diff < -5) return <TrendingDown className="h-3 w-3 text-green-600" />;
  if (diff > 5) return <TrendingUp className="h-3 w-3 text-red-600" />;
  return <Minus className="h-3 w-3 text-muted-foreground" />;
}

export default function CwvTrendDashboard() {
  const [rows, setRows] = useState<VitalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [device, setDevice] = useState<'mobile' | 'desktop' | 'all'>('mobile');

  const loadData = useCallback(async () => {
    setLoading(true);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('web_vitals')
      .select('ts, path, device_hint, lcp_value, cls_value, inp_value, proxy_lcp_value, proxy_lcp_candidate, connection_type')
      .gte('ts', thirtyDaysAgo)
      .order('ts', { ascending: false })
      .limit(1000);
    setRows((data as VitalRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = useMemo(() => {
    if (device === 'all') return rows;
    return rows.filter(r => r.device_hint === device);
  }, [rows, device]);

  // Split into recent 15 days vs previous 15 days for trend comparison
  const midpoint = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).getTime();
  const recent = filtered.filter(r => new Date(r.ts).getTime() >= midpoint);
  const previous = filtered.filter(r => new Date(r.ts).getTime() < midpoint);

  // Route group aggregation
  const routeGroups = useMemo(() => {
    const groups: Record<string, { recent: VitalRow[]; previous: VitalRow[] }> = {};
    recent.forEach(r => {
      const key = normalizeRoute(r.path);
      if (!groups[key]) groups[key] = { recent: [], previous: [] };
      groups[key].recent.push(r);
    });
    previous.forEach(r => {
      const key = normalizeRoute(r.path);
      if (!groups[key]) groups[key] = { recent: [], previous: [] };
      groups[key].previous.push(r);
    });
    return groups;
  }, [recent, previous]);

  // Effective LCP: use real LCP when available, fall back to proxy_lcp_value
  function effectiveLcp(r: VitalRow): number | null {
    return r.lcp_value ?? r.proxy_lcp_value ?? null;
  }

  // Overall stats
  const overallRecent = {
    lcp: percentile(recent.map(effectiveLcp).filter((v): v is number => v !== null), 75),
    cls: percentile(recent.map(r => r.cls_value).filter((v): v is number => v !== null), 75),
    inp: percentile(recent.map(r => r.inp_value).filter((v): v is number => v !== null), 75),
  };
  const overallPrevious = {
    lcp: percentile(previous.map(effectiveLcp).filter((v): v is number => v !== null), 75),
    cls: percentile(previous.map(r => r.cls_value).filter((v): v is number => v !== null), 75),
    inp: percentile(previous.map(r => r.inp_value).filter((v): v is number => v !== null), 75),
  };

  // Proxy LCP stats
  const proxyCount = filtered.filter(r => r.proxy_lcp_value !== null && r.lcp_value === null).length;
  const realCount = filtered.filter(r => r.lcp_value !== null).length;

  const fmt = (v: number | null) => v === null ? '—' : `${Math.round(v)}ms`;
  const fmtCls = (v: number | null) => v === null ? '—' : v.toFixed(3);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          CWV Field Data Trends (30 days)
        </CardTitle>
        <div className="flex items-center gap-2">
          <div className="flex border rounded-md overflow-hidden text-xs">
            {(['mobile', 'desktop', 'all'] as const).map(f => (
              <button
                key={f}
                onClick={() => setDevice(f)}
                className={`px-3 py-1.5 flex items-center gap-1 transition-colors ${device === f ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              >
                {f === 'mobile' && <Smartphone className="h-3 w-3" />}
                {f === 'desktop' && <Monitor className="h-3 w-3" />}
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <Button size="sm" variant="ghost" onClick={loadData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-6 text-muted-foreground text-sm">Loading field data...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">No field data in the last 30 days.</div>
        ) : (
          <div className="space-y-6">
            {/* GSC Validation Guidance */}
            <div className="p-3 bg-muted/30 rounded-lg flex gap-2 items-start">
              <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="text-xs text-muted-foreground space-y-1">
                <p><strong>GSC CWV timeline:</strong> Field data in Search Console uses a rolling 28-day window from the CrUX report. After deploying fixes, it takes <strong>2–4 weeks</strong> for GSC to reflect improvements. Validation passes once 75th percentile meets thresholds across the 28-day window.</p>
                <p>Real LCP entries: <strong>{realCount}</strong> | Proxy LCP (iOS Safari SPA): <strong>{proxyCount}</strong> | Total sessions: <strong>{filtered.length}</strong></p>
              </div>
            </div>

            {/* Overall p75 with trend */}
            <div className="grid grid-cols-3 gap-4">
              {([
                { key: 'lcp', label: 'LCP', val: overallRecent.lcp, prev: overallPrevious.lcp, format: fmt },
                { key: 'cls', label: 'CLS', val: overallRecent.cls, prev: overallPrevious.cls, format: fmtCls },
                { key: 'inp', label: 'INP', val: overallRecent.inp, prev: overallPrevious.inp, format: fmt },
              ] as const).map(m => (
                <div key={m.key} className="text-center p-4 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">{m.label} p75 (recent 15d)</p>
                  <p className={`text-xl font-mono font-bold ${ratingColor(m.key, m.val)}`}>{m.format(m.val)}</p>
                  <div className="flex items-center justify-center gap-1 mt-1">
                    <TrendIcon current={m.val} previous={m.prev} />
                    <span className="text-[10px] text-muted-foreground">
                      vs prev 15d: {m.format(m.prev)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Per-route group breakdown */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Per-Route p75 (recent 15d vs previous)</p>
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {Object.entries(routeGroups)
                  .sort((a, b) => b[1].recent.length - a[1].recent.length)
                  .slice(0, 20)
                  .map(([route, data]) => {
                    const recentLcp = percentile(data.recent.map(effectiveLcp).filter((v): v is number => v !== null), 75);
                    const prevLcp = percentile(data.previous.map(effectiveLcp).filter((v): v is number => v !== null), 75);
                    const recentCls = percentile(data.recent.map(r => r.cls_value).filter((v): v is number => v !== null), 75);
                    const recentInp = percentile(data.recent.map(r => r.inp_value).filter((v): v is number => v !== null), 75);
                    return (
                      <div key={route} className="flex items-center justify-between text-xs py-1.5 border-b border-border/50">
                        <div className="flex items-center gap-2">
                          <code className="text-muted-foreground truncate max-w-[180px]">{route}</code>
                          <span className="text-[10px] text-muted-foreground">n={data.recent.length}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`font-mono ${ratingColor('lcp', recentLcp)}`}>
                            LCP: {fmt(recentLcp)}
                          </span>
                          <TrendIcon current={recentLcp} previous={prevLcp} />
                          <span className={`font-mono ${ratingColor('cls', recentCls)}`}>
                            CLS: {fmtCls(recentCls)}
                          </span>
                          <span className={`font-mono ${ratingColor('inp', recentInp)}`}>
                            INP: {fmt(recentInp)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Connection type distribution */}
            {(() => {
              const connTypes: Record<string, number> = {};
              filtered.forEach(r => {
                const ct = r.connection_type || 'unknown';
                connTypes[ct] = (connTypes[ct] || 0) + 1;
              });
              return Object.keys(connTypes).length > 1 ? (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Connection Types</p>
                  <div className="flex gap-2 flex-wrap">
                    {Object.entries(connTypes).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                      <Badge key={type} variant="secondary" className="text-[10px]">
                        {type}: {count} ({Math.round(count / filtered.length * 100)}%)
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null;
            })()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
