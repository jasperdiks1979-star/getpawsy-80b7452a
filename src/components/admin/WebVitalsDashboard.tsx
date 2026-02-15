import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, Activity, Smartphone, Monitor, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface VitalRow {
  id: string;
  ts: string;
  path: string;
  device_hint: string | null;
  lcp_value: number | null;
  lcp_element: string | null;
  cls_value: number | null;
  inp_value: number | null;
  inp_event: string | null;
  fcp_value: number | null;
  ttfb_value: number | null;
}

interface Aggregates {
  p50: number | null;
  p75: number | null;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function ratingClass(metric: string, value: number | null): string {
  if (value === null) return 'text-muted-foreground';
  const thresholds: Record<string, [number, number]> = {
    lcp: [2500, 4000],
    cls: [0.1, 0.25],
    inp: [200, 500],
    fcp: [1800, 3000],
    ttfb: [800, 1800],
  };
  const t = thresholds[metric];
  if (!t) return 'text-muted-foreground';
  if (value <= t[0]) return 'text-green-600';
  if (value <= t[1]) return 'text-yellow-600';
  return 'text-red-600';
}

function formatMs(v: number | null): string {
  if (v === null) return '—';
  return `${Math.round(v)}ms`;
}

function formatCls(v: number | null): string {
  if (v === null) return '—';
  return v.toFixed(3);
}

export default function WebVitalsDashboard() {
  const [rows, setRows] = useState<VitalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'mobile' | 'desktop'>('mobile');

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('web_vitals')
      .select('id, ts, path, device_hint, lcp_value, lcp_element, cls_value, inp_value, inp_event, fcp_value, ttfb_value')
      .order('ts', { ascending: false })
      .limit(200);
    setRows((data as VitalRow[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = rows.filter(r => {
    if (filter === 'all') return true;
    return r.device_hint === filter;
  });

  // Aggregates
  const lcpValues = filtered.map(r => r.lcp_value).filter((v): v is number => v !== null);
  const clsValues = filtered.map(r => r.cls_value).filter((v): v is number => v !== null);
  const inpValues = filtered.map(r => r.inp_value).filter((v): v is number => v !== null);
  const fcpValues = filtered.map(r => r.fcp_value).filter((v): v is number => v !== null);
  const ttfbValues = filtered.map(r => r.ttfb_value).filter((v): v is number => v !== null);

  // Top LCP element
  const lcpElements: Record<string, number> = {};
  filtered.forEach(r => {
    if (r.lcp_element) {
      lcpElements[r.lcp_element] = (lcpElements[r.lcp_element] || 0) + 1;
    }
  });
  const topLcpElement = Object.entries(lcpElements).sort((a, b) => b[1] - a[1])[0];

  // Path aggregates
  const pathGroups: Record<string, { lcp: number[]; cls: number[]; inp: number[] }> = {};
  filtered.forEach(r => {
    let key = r.path;
    if (key.startsWith('/product/')) key = '/product/*';
    else if (key.startsWith('/category/')) key = '/category/*';
    else if (key.startsWith('/guides/')) key = '/guides/*';
    if (!pathGroups[key]) pathGroups[key] = { lcp: [], cls: [], inp: [] };
    if (r.lcp_value !== null) pathGroups[key].lcp.push(r.lcp_value);
    if (r.cls_value !== null) pathGroups[key].cls.push(r.cls_value);
    if (r.inp_value !== null) pathGroups[key].inp.push(r.inp_value);
  });

  const metrics = [
    { key: 'lcp', label: 'LCP', values: lcpValues, format: formatMs },
    { key: 'cls', label: 'CLS', values: clsValues, format: formatCls },
    { key: 'inp', label: 'INP', values: inpValues, format: formatMs },
    { key: 'fcp', label: 'FCP', values: fcpValues, format: formatMs },
    { key: 'ttfb', label: 'TTFB', values: ttfbValues, format: formatMs },
  ];

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Web Vitals (Field Data)
        </CardTitle>
        <div className="flex items-center gap-2">
          <div className="flex border rounded-md overflow-hidden text-xs">
            {(['mobile', 'desktop', 'all'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 flex items-center gap-1 transition-colors ${filter === f ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
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
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No field data collected yet. Vitals are captured from real user visits.
          </p>
        ) : (
          <div className="space-y-6">
            {/* Aggregate Scores */}
            <div className="grid grid-cols-5 gap-3">
              {metrics.map(m => (
                <div key={m.key} className="text-center p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">{m.label}</p>
                  <p className={`text-lg font-mono font-bold ${ratingClass(m.key, percentile(m.values, 75))}`}>
                    {m.format(percentile(m.values, 75))}
                  </p>
                  <p className="text-[10px] text-muted-foreground">p75</p>
                  <p className={`text-sm font-mono ${ratingClass(m.key, percentile(m.values, 50))}`}>
                    {m.format(percentile(m.values, 50))}
                  </p>
                  <p className="text-[10px] text-muted-foreground">p50</p>
                  <p className="text-[10px] text-muted-foreground mt-1">n={m.values.length}</p>
                </div>
              ))}
            </div>

            {/* Top LCP Element */}
            {topLcpElement && (
              <div className="p-3 bg-muted/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Top LCP Element (by frequency)</p>
                <code className="text-xs break-all">{topLcpElement[0]}</code>
                <span className="text-xs text-muted-foreground ml-2">({topLcpElement[1]}x)</span>
              </div>
            )}

            {/* Per-Path Breakdown */}
            {Object.keys(pathGroups).length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Per-Path p75</p>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {Object.entries(pathGroups)
                    .sort((a, b) => b[1].lcp.length - a[1].lcp.length)
                    .slice(0, 15)
                    .map(([path, data]) => (
                      <div key={path} className="flex items-center justify-between text-xs py-1 border-b border-border/50">
                        <code className="text-muted-foreground truncate max-w-[200px]">{path}</code>
                        <div className="flex gap-4">
                          <span className={ratingClass('lcp', percentile(data.lcp, 75))}>
                            LCP: {formatMs(percentile(data.lcp, 75))}
                          </span>
                          <span className={ratingClass('cls', percentile(data.cls, 75))}>
                            CLS: {formatCls(percentile(data.cls, 75))}
                          </span>
                          <span className={ratingClass('inp', percentile(data.inp, 75))}>
                            INP: {formatMs(percentile(data.inp, 75))}
                          </span>
                          <span className="text-muted-foreground">n={data.lcp.length}</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Recent Rows */}
            <details>
              <summary className="text-xs text-muted-foreground cursor-pointer">
                Recent entries ({Math.min(filtered.length, 50)} shown)
              </summary>
              <div className="mt-2 max-h-64 overflow-y-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="text-muted-foreground border-b">
                      <th className="text-left py-1">Time</th>
                      <th className="text-left">Path</th>
                      <th className="text-left">Device</th>
                      <th className="text-right">LCP</th>
                      <th className="text-right">CLS</th>
                      <th className="text-right">INP</th>
                      <th className="text-right">FCP</th>
                      <th className="text-right">TTFB</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 50).map(r => (
                      <tr key={r.id} className="border-b border-border/30">
                        <td className="py-1">{new Date(r.ts).toLocaleString('nl-NL', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</td>
                        <td className="truncate max-w-[120px]">{r.path}</td>
                        <td>{r.device_hint === 'mobile' ? '📱' : '🖥️'}</td>
                        <td className={`text-right font-mono ${ratingClass('lcp', r.lcp_value)}`}>{formatMs(r.lcp_value)}</td>
                        <td className={`text-right font-mono ${ratingClass('cls', r.cls_value)}`}>{formatCls(r.cls_value)}</td>
                        <td className={`text-right font-mono ${ratingClass('inp', r.inp_value)}`}>{formatMs(r.inp_value)}</td>
                        <td className={`text-right font-mono ${ratingClass('fcp', r.fcp_value)}`}>{formatMs(r.fcp_value)}</td>
                        <td className={`text-right font-mono ${ratingClass('ttfb', r.ttfb_value)}`}>{formatMs(r.ttfb_value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
