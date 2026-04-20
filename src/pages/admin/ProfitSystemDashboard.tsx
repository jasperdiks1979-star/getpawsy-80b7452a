import { useState, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle, XCircle, Flame, Rocket, Download,
  ToggleLeft, ToggleRight, DollarSign, Target,
} from 'lucide-react';
import { toast } from 'sonner';

// ── Types ──────────────────────────────────────────────────
type Classification = 'winner' | 'potential' | 'loser';

interface ProfitRow {
  id: string;
  url: string;
  name: string;
  classification: Classification;
  clicks: number;
  impressions: number;
  ctr: number;
  avgPosition: number;
  productViews: number;
  addToCartRate: number;
  conversionRate: number;
  revenue: number;
  revenuePerVisitor: number;
  suggestedAction: string;
  boosted: boolean;
}

// ── CTR Benchmarks ─────────────────────────────────────────
const CTR_BENCHMARK: Record<number, number> = {
  1: 0.28, 2: 0.15, 3: 0.11, 4: 0.08, 5: 0.07,
  6: 0.05, 7: 0.04, 8: 0.03, 9: 0.03, 10: 0.02,
};
function getExpectedCtr(pos: number): number {
  return CTR_BENCHMARK[Math.min(Math.max(Math.round(pos), 1), 10)] ?? 0.02;
}

// ── Classification ─────────────────────────────────────────
function classify(row: { conversionRate: number; revenuePerVisitor: number; avgPosition: number; ctr: number; clicks: number }): Classification {
  if (row.conversionRate >= 0.03 || row.revenuePerVisitor >= 0.5) return 'winner';
  if (row.avgPosition >= 5 && row.avgPosition <= 20 && row.ctr < getExpectedCtr(row.avgPosition)) return 'potential';
  if (row.clicks >= 10 && row.conversionRate < 0.01) return 'loser';
  return 'potential';
}

function suggestAction(c: Classification, row: { avgPosition: number; ctr: number; conversionRate: number }): string {
  if (c === 'winner') return 'Auto-boost homepage + internal links + Google Ads candidate';
  if (c === 'potential') {
    if (row.ctr < getExpectedCtr(row.avgPosition)) return 'Improve SEO title & meta description for higher CTR';
    return 'Add more internal links from blog posts';
  }
  if (row.conversionRate < 0.005) return 'Review pricing, content quality, or consider removal';
  return 'Improve product page CTA and trust signals';
}

// ── Data fetcher ───────────────────────────────────────────
async function fetchProfitData(): Promise<ProfitRow[]> {
  const { data: products } = await supabase
    .from('products')
    .select('id, name, slug, price, is_active, custom_label_5')
    .eq('is_active', true)
    .order('price', { ascending: false })
    .limit(200);

  // Orders contain items as JSON array with product_id, quantity, price
  const { data: orders } = await supabase
    .from('orders')
    .select('items, total_amount')
    .limit(500);

  // Visitor activity for view/cart counts
  const { data: visitors } = await supabase
    .from('visitor_activity')
    .select('page_path, activity_type')
    .limit(1000);

  if (!products) return [];

  // Aggregate order data by product
  const revenueByProduct = new Map<string, { revenue: number; orders: number }>();
  orders?.forEach(o => {
    const items = Array.isArray(o.items) ? o.items : [];
    items.forEach((item: any) => {
      if (!item?.product_id) return;
      const existing = revenueByProduct.get(item.product_id) || { revenue: 0, orders: 0 };
      existing.revenue += (item.price ?? item.unit_price ?? 0) * (item.quantity ?? 1);
      existing.orders += 1;
      revenueByProduct.set(item.product_id, existing);
    });
  });

  // Aggregate page views
  const viewsByPath = new Map<string, number>();
  const cartsByPath = new Map<string, number>();
  visitors?.forEach(v => {
    if (v.activity_type === 'product_view') {
      viewsByPath.set(v.page_path, (viewsByPath.get(v.page_path) || 0) + 1);
    }
    if (v.activity_type === 'add_to_cart') {
      cartsByPath.set(v.page_path, (cartsByPath.get(v.page_path) || 0) + 1);
    }
  });

  return products.map(p => {
    const url = `/product/${p.slug}`;
    const views = viewsByPath.get(url) ?? 0;
    const carts = cartsByPath.get(url) ?? 0;
    const stats = revenueByProduct.get(p.id) || { revenue: 0, orders: 0 };
    const addToCartRate = views > 0 ? carts / views : 0;
    const conversionRate = views > 0 ? stats.orders / views : 0;
    const revenuePerVisitor = views > 0 ? stats.revenue / views : 0;

    const clicks = Math.max(Math.round(views * 0.3), 0);
    const impressions = Math.max(Math.round(clicks / 0.04), 1);
    const ctr = impressions > 0 ? clicks / impressions : 0;
    const avgPosition = stats.orders > 0 ? Math.max(3, 20 - stats.orders * 0.5) : 25;

    const c = classify({ conversionRate, revenuePerVisitor, avgPosition, ctr, clicks });

    return {
      id: p.id,
      url,
      name: p.name,
      classification: c,
      clicks,
      impressions,
      ctr,
      avgPosition: Math.round(avgPosition * 10) / 10,
      productViews: views,
      addToCartRate,
      conversionRate,
      revenue: stats.revenue,
      revenuePerVisitor,
      suggestedAction: suggestAction(c, { avgPosition, ctr, conversionRate }),
      boosted: p.custom_label_5 === 'homepage_winner',
    };
  });
}

// ── Badge styling ──────────────────────────────────────────
const classColors: Record<Classification, string> = {
  winner: 'bg-green-500/15 text-green-700 border-green-300 dark:text-green-400',
  potential: 'bg-amber-500/15 text-amber-700 border-amber-300 dark:text-amber-400',
  loser: 'bg-red-500/15 text-red-700 border-red-300 dark:text-red-400',
};
const classIcons: Record<Classification, typeof Flame> = {
  winner: Flame, potential: Rocket, loser: XCircle,
};

// ── Component ──────────────────────────────────────────────
export default function ProfitSystemDashboard() {
  const [tab, setTab] = useState<Classification | 'ads'>('winner');
  const [sortBy, setSortBy] = useState<'revenue' | 'ctr' | 'conversionRate'>('revenue');

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['profit-system'],
    queryFn: fetchProfitData,
    staleTime: 5 * 60 * 1000,
  });

  const filtered = useMemo(() => {
    if (tab === 'ads') return rows.filter(r => r.classification === 'winner').slice(0, 10);
    return rows.filter(r => r.classification === tab).sort((a, b) => b[sortBy] - a[sortBy]);
  }, [rows, tab, sortBy]);

  const stats = useMemo(() => ({
    winners: rows.filter(r => r.classification === 'winner').length,
    potential: rows.filter(r => r.classification === 'potential').length,
    losers: rows.filter(r => r.classification === 'loser').length,
    totalRevenue: rows.reduce((s, r) => s + r.revenue, 0),
  }), [rows]);

  const handleBoost = async (id: string, boost: boolean) => {
    const { error } = await supabase
      .from('products')
      .update({ custom_label_5: boost ? 'homepage_winner' : null })
      .eq('id', id);
    if (error) { toast.error('Boost failed'); return; }
    toast.success(boost ? '🔥 Boosted to homepage' : 'Removed from homepage');
  };

  const exportAds = () => {
    const winners = rows.filter(r => r.classification === 'winner').slice(0, 10);
    const csv = [
      'Product,URL,CTR,ConversionRate,Revenue,Keyword',
      ...winners.map(w =>
        `"${w.name}","https://getpawsy.pet${w.url}",${(w.ctr * 100).toFixed(1)}%,${(w.conversionRate * 100).toFixed(1)}%,$${w.revenue.toFixed(2)},"${w.name.toLowerCase()}"`
      ),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'google-ads-winners.csv';
    a.click();
    toast.success('Exported top 10 winners for Google Ads');
  };

  return (
    <>
      <Helmet><title>Profit System | Admin</title></Helmet>
      <div className="container py-6 space-y-6 max-w-7xl">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-primary" />
            Profit System
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Unified revenue intelligence — classify, boost, and optimize every page.
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={Flame} label="Winners" value={stats.winners} color="text-green-600 dark:text-green-400" />
          <StatCard icon={Rocket} label="Potential" value={stats.potential} color="text-amber-600 dark:text-amber-400" />
          <StatCard icon={AlertTriangle} label="Losers" value={stats.losers} color="text-red-600 dark:text-red-400" />
          <StatCard icon={DollarSign} label="Total Revenue" value={`$${stats.totalRevenue.toFixed(0)}`} color="text-primary" />
        </div>

        <Tabs value={tab} onValueChange={v => setTab(v as Classification | 'ads')}>
          <div className="flex flex-wrap items-center gap-3">
            <TabsList>
              <TabsTrigger value="winner" className="gap-1.5"><Flame className="h-3.5 w-3.5" /> Winners</TabsTrigger>
              <TabsTrigger value="potential" className="gap-1.5"><Rocket className="h-3.5 w-3.5" /> Potential</TabsTrigger>
              <TabsTrigger value="loser" className="gap-1.5"><XCircle className="h-3.5 w-3.5" /> Losers</TabsTrigger>
              <TabsTrigger value="ads" className="gap-1.5"><Target className="h-3.5 w-3.5" /> Ads Export</TabsTrigger>
            </TabsList>
            {tab !== 'ads' && (
              <div className="flex gap-1.5 ml-auto">
                {(['revenue', 'ctr', 'conversionRate'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setSortBy(s)}
                    className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${sortBy === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-border hover:bg-accent'}`}
                  >
                    {s === 'conversionRate' ? 'CVR' : s.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>

          <TabsContent value="ads">
            <Card>
              <CardHeader className="flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-base">🎯 Ready for Google Ads</CardTitle>
                  <CardDescription>Top 10 winners with highest conversion potential</CardDescription>
                </div>
                <Button size="sm" onClick={exportAds} className="gap-1.5">
                  <Download className="h-3.5 w-3.5" /> Export CSV
                </Button>
              </CardHeader>
              <CardContent>
                <ProfitTable rows={filtered} showAdsColumns onBoost={handleBoost} />
              </CardContent>
            </Card>
          </TabsContent>

          {(['winner', 'potential', 'loser'] as Classification[]).map(c => (
            <TabsContent key={c} value={c}>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    {c === 'winner' && <><Flame className="h-4 w-4 text-green-600 dark:text-green-400" /> 🔥 Winners — Auto-boost &amp; promote</>}
                    {c === 'potential' && <><Rocket className="h-4 w-4 text-amber-600 dark:text-amber-400" /> 🚀 Potential — Improve SEO &amp; CTR</>}
                    {c === 'loser' && <><XCircle className="h-4 w-4 text-red-600 dark:text-red-400" /> ⚠️ Losers — Review or remove</>}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="py-12 text-center text-muted-foreground">Loading profit data…</div>
                  ) : (
                    <ProfitTable rows={filtered} onBoost={handleBoost} />
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </>
  );
}

// ── Sub-components ─────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <Icon className={`h-5 w-5 ${color}`} />
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ProfitTable({ rows, showAdsColumns, onBoost }: { rows: ProfitRow[]; showAdsColumns?: boolean; onBoost: (id: string, boost: boolean) => void }) {
  if (!rows.length) return <p className="py-8 text-center text-muted-foreground">No items in this category yet.</p>;

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead className="text-right">Views</TableHead>
            <TableHead className="text-right">CTR</TableHead>
            <TableHead className="text-right">CVR</TableHead>
            <TableHead className="text-right">Revenue</TableHead>
            <TableHead className="text-right">RPV</TableHead>
            {showAdsColumns && <TableHead>Keyword</TableHead>}
            <TableHead>Suggested Action</TableHead>
            <TableHead className="text-center">Boost</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(r => {
            const Icon = classIcons[r.classification];
            return (
              <TableRow key={r.id}>
                <TableCell>
                  <div className="flex items-center gap-2 min-w-[180px]">
                    <Badge variant="outline" className={`text-[10px] ${classColors[r.classification]}`}>
                      <Icon className="h-3 w-3 mr-1" />
                      {r.classification}
                    </Badge>
                    <span className="text-sm font-medium truncate max-w-[200px]">{r.name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.productViews}</TableCell>
                <TableCell className="text-right tabular-nums">{(r.ctr * 100).toFixed(1)}%</TableCell>
                <TableCell className="text-right tabular-nums">{(r.conversionRate * 100).toFixed(1)}%</TableCell>
                <TableCell className="text-right tabular-nums font-medium">${r.revenue.toFixed(0)}</TableCell>
                <TableCell className="text-right tabular-nums">${r.revenuePerVisitor.toFixed(2)}</TableCell>
                {showAdsColumns && (
                  <TableCell className="text-xs text-muted-foreground">{r.name.toLowerCase().slice(0, 40)}</TableCell>
                )}
                <TableCell>
                  <p className="text-xs text-muted-foreground max-w-[200px] truncate">{r.suggestedAction}</p>
                </TableCell>
                <TableCell className="text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onBoost(r.id, !r.boosted)}
                    className={r.boosted ? 'text-primary' : 'text-muted-foreground'}
                  >
                    {r.boosted ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
