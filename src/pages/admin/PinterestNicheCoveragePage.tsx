import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { Loader2, RefreshCw, BarChart3, AlertTriangle } from 'lucide-react';

type Snapshot = {
  snapshot_date: string;
  niche: string;
  product_count: number;
  total_products: number;
  pct: number;
};

const PALETTE = [
  '#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e', '#10b981',
  '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#ec4899', '#f43f5e', '#64748b', '#0ea5e9', '#14b8a6', '#facc15',
  '#7c3aed', '#fb7185', '#94a3b8', '#0891b2', '#15803d', '#b45309',
];

function color(i: number) {
  return PALETTE[i % PALETTE.length];
}

export default function PinterestNicheCoveragePage() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [snapping, setSnapping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
      const { data, error: e } = await supabase
        .from('pinterest_niche_coverage_snapshots')
        .select('snapshot_date, niche, product_count, total_products, pct')
        .gte('snapshot_date', since)
        .order('snapshot_date', { ascending: true });
      if (e) throw e;
      setSnapshots((data ?? []) as Snapshot[]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [days]);

  async function snapshotNow() {
    setSnapping(true);
    try {
      const { data, error: e } = await supabase.functions.invoke(
        'pinterest-niche-coverage-snapshot',
        { body: {} },
      );
      if (e) throw e;
      const r = data as { ok: boolean; message?: string; total?: number };
      if (!r?.ok) throw new Error(r?.message || 'snapshot failed');
      toast({ title: 'Snapshot stored', description: `${r.total ?? 0} products scanned` });
      await load();
    } catch (err) {
      toast({
        title: 'Snapshot failed',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      setSnapping(false);
    }
  }

  // Latest day -> per-niche current %
  const latest = useMemo(() => {
    if (snapshots.length === 0) return null;
    const lastDate = snapshots[snapshots.length - 1].snapshot_date;
    const rows = snapshots.filter((s) => s.snapshot_date === lastDate);
    const total = rows[0]?.total_products ?? 0;
    return {
      date: lastDate,
      total,
      rows: [...rows].sort((a, b) => b.product_count - a.product_count),
    };
  }, [snapshots]);

  // Niches sorted by latest count, used to color lines consistently
  const nicheOrder = useMemo(() => {
    if (!latest) return [];
    return latest.rows.map((r) => r.niche);
  }, [latest]);

  // Reshape into chart rows: { date, [niche]: pct, ... }
  const chartData = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string>>();
    for (const s of snapshots) {
      const row = byDate.get(s.snapshot_date) ?? { date: s.snapshot_date };
      row[s.niche] = s.pct;
      byDate.set(s.snapshot_date, row);
    }
    return Array.from(byDate.values());
  }, [snapshots]);

  const genericPct = latest?.rows.find((r) => r.niche === 'generic_pet')?.pct ?? 0;

  return (
    <div className="container mx-auto p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-fuchsia-600" /> Niche coverage dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Daily snapshots of how the Pinterest Creative Director niche detector classifies the
            active catalog. Trendlines reveal whether <code className="font-mono">generic_pet</code>{' '}
            is shrinking and which niches are gaining inventory.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <Button onClick={snapshotNow} disabled={snapping} size="sm" variant="outline">
            {snapping ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Snapshot now
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-rose-200 bg-rose-50">
          <CardContent className="text-sm text-rose-700 py-3">{error}</CardContent>
        </Card>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading snapshots…
        </div>
      )}

      {!loading && snapshots.length === 0 && (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground text-center space-y-2">
            <p>No snapshots yet for this window.</p>
            <p>
              Click <strong>Snapshot now</strong> to capture the first data point. Trendlines build
              up as snapshots accumulate over the next few days.
            </p>
          </CardContent>
        </Card>
      )}

      {latest && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between gap-2">
              <span>
                Current coverage · {latest.date} · {latest.total} products
              </span>
              <Badge
                variant="outline"
                className={
                  genericPct >= 20
                    ? 'bg-rose-500/15 text-rose-700 border-rose-200'
                    : 'bg-emerald-500/15 text-emerald-700 border-emerald-200'
                }
              >
                {genericPct >= 20 && <AlertTriangle className="h-3 w-3 mr-1" />}
                generic_pet: {genericPct.toFixed(1)}%
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-xs">
            {latest.rows.map((r, i) => (
              <div key={r.niche} className="flex items-center gap-2">
                <span
                  className="inline-block h-2 w-2 rounded-full shrink-0"
                  style={{ background: color(nicheOrder.indexOf(r.niche)) }}
                />
                <span className="w-32 font-mono text-muted-foreground">{r.niche}</span>
                <div className="flex-1 h-1.5 bg-muted rounded overflow-hidden">
                  <div
                    className="h-full"
                    style={{
                      width: `${Math.min(100, r.pct)}%`,
                      background: color(nicheOrder.indexOf(r.niche)),
                    }}
                  />
                </div>
                <span className="w-16 text-right tabular-nums">
                  {r.product_count} ({r.pct.toFixed(1)}%)
                </span>
              </div>
            ))}
            {latest.rows.find((r) => r.niche === 'generic_pet') && (
              <div className="pt-2">
                <Link
                  to="/admin/pinterest-generic-niche"
                  className="text-xs text-primary hover:underline"
                >
                  → Review generic_pet products
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {chartData.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Niche % trendlines</CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ width: '100%', height: 380 }}>
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 5, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    unit="%"
                    domain={[0, (dataMax: number) => Math.max(10, Math.ceil(dataMax))]}
                  />
                  <Tooltip
                    formatter={(v: number) => `${Number(v).toFixed(1)}%`}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {nicheOrder.map((n, i) => (
                    <Line
                      key={n}
                      type="monotone"
                      dataKey={n}
                      stroke={color(i)}
                      strokeWidth={n === 'generic_pet' ? 2.5 : 1.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}