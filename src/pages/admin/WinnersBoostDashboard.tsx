import { useState, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trophy, TrendingUp, Star, Zap, ArrowUp, ArrowDown, Search, ExternalLink, Eye, ShoppingCart, DollarSign, Percent } from 'lucide-react';
import { toast } from 'sonner';

interface ProductWinner {
  id: string;
  name: string;
  slug: string;
  price: number;
  image_url: string | null;
  stock: number;
  is_active: boolean;
  category: string | null;
  view_count: number;
  orders_count: number;
  revenue: number;
  conversion_rate: number;
  score: number;
}

const WinnersBoostDashboard = () => {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');

  // Fetch products with order data
  const { data: products = [], isLoading } = useQuery({
    queryKey: ['winners-dashboard', timeRange],
    queryFn: async () => {
      const daysAgo = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
      const since = new Date(Date.now() - daysAgo * 86400000).toISOString();

      const [productsRes, ordersRes] = await Promise.all([
        supabase
          .from('products')
          .select('id, name, slug, price, image_url, stock, is_active, category')
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('orders')
          .select('items, total_amount, created_at')
          .gte('created_at', since)
          .neq('status', 'cancelled'),
      ]);

      if (productsRes.error) throw productsRes.error;
      const prods = productsRes.data || [];
      const orders = ordersRes.data || [];

      // Aggregate order data per product
      const productStats = new Map<string, { orders: number; revenue: number }>();
      orders.forEach((order) => {
        const items = order.items as any[];
        if (!Array.isArray(items)) return;
        items.forEach((item: any) => {
          const pid = item.product_id || item.id;
          if (!pid) return;
          const existing = productStats.get(pid) || { orders: 0, revenue: 0 };
          existing.orders += item.quantity || 1;
          existing.revenue += (item.price || 0) * (item.quantity || 1);
          productStats.set(pid, existing);
        });
      });

      return prods.map((p: any): ProductWinner => {
        const stats = productStats.get(p.id) || { orders: 0, revenue: 0 };
        const views = 0; // view_count not available on products table
        const convRate = stats.orders > 0 ? (stats.orders / Math.max(stats.orders, 1)) * 100 : 0;
        // Composite score: revenue (40%) + orders (30%) + views (20%) + conversion (10%)
        const score =
          (stats.revenue * 0.4) +
          (stats.orders * 30 * 0.3) +
          (views * 0.2) +
          (convRate * 100 * 0.1);

        return {
          id: p.id,
          name: p.name,
          slug: p.slug || '',
          price: p.price,
          image_url: p.image_url,
          stock: p.stock ?? 0,
          is_active: p.is_active ?? true,
          category: p.category,
          view_count: views,
          orders_count: stats.orders,
          revenue: stats.revenue,
          conversion_rate: convRate,
          score,
        };
      }).sort((a, b) => b.score - a.score);
    },
  });

  const boostProduct = useMutation({
    mutationFn: async ({ id, boost }: { id: string; boost: boolean }) => {
      // Set custom_label_5 for homepage boost visibility
      const { error } = await supabase
        .from('products')
        .update({ custom_label_5: boost ? 'homepage_winner' : null } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, { boost }) => {
      toast.success(boost ? 'Product boosted to homepage' : 'Product removed from homepage boost');
      qc.invalidateQueries({ queryKey: ['winners-dashboard'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    if (!search) return products;
    const q = search.toLowerCase();
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q)
    );
  }, [products, search]);

  const topWinners = filtered.slice(0, 10);
  const risingStar = filtered.filter((p) => p.conversion_rate > 2 && p.orders_count >= 2).slice(0, 5);
  const lowPerformers = [...filtered].sort((a, b) => a.score - b.score).slice(0, 5);

  const totalRevenue = products.reduce((s, p) => s + p.revenue, 0);
  const totalOrders = products.reduce((s, p) => s + p.orders_count, 0);
  const avgConversion = products.length > 0
    ? products.reduce((s, p) => s + p.conversion_rate, 0) / products.length
    : 0;

  return (
    <>
      <Helmet><title>Winners Auto-Boost | Admin</title></Helmet>
      <div className="container px-4 md:px-6 py-8 max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="w-6 h-6 text-amber-500" /> Winners Auto-Boost
          </h1>
          <p className="text-sm text-muted-foreground">
            Identify top-performing products and boost them to homepage prominence
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <DollarSign className="w-3.5 h-3.5" /> Revenue
              </div>
              <p className="text-xl font-bold">${totalRevenue.toFixed(0)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <ShoppingCart className="w-3.5 h-3.5" /> Orders
              </div>
              <p className="text-xl font-bold">{totalOrders}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Eye className="w-3.5 h-3.5" /> Avg Views
              </div>
              <p className="text-xl font-bold">
                {products.length > 0 ? Math.round(products.reduce((s, p) => s + p.view_count, 0) / products.length) : 0}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Percent className="w-3.5 h-3.5" /> Avg CVR
              </div>
              <p className="text-xl font-bold">{avgConversion.toFixed(2)}%</p>
            </CardContent>
          </Card>
        </div>

        {/* Time Range + Search */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            {(['7d', '30d', '90d'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  timeRange === range ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : '90 Days'}
              </button>
            ))}
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <Tabs defaultValue="winners" className="space-y-4">
          <TabsList>
            <TabsTrigger value="winners" className="gap-1.5"><Trophy className="w-3.5 h-3.5" /> Top Winners</TabsTrigger>
            <TabsTrigger value="rising" className="gap-1.5"><TrendingUp className="w-3.5 h-3.5" /> Rising Stars</TabsTrigger>
            <TabsTrigger value="underperformers" className="gap-1.5"><ArrowDown className="w-3.5 h-3.5" /> Underperformers</TabsTrigger>
          </TabsList>

          <TabsContent value="winners">
            <ProductTable
              products={topWinners}
              isLoading={isLoading}
              onBoost={(id, boost) => boostProduct.mutate({ id, boost })}
              emptyMessage="No winning products found for this period"
              badgeColor="text-amber-600 bg-amber-50 border-amber-200"
            />
          </TabsContent>

          <TabsContent value="rising">
            <ProductTable
              products={risingStar}
              isLoading={isLoading}
              onBoost={(id, boost) => boostProduct.mutate({ id, boost })}
              emptyMessage="No rising stars yet — check back after more sales"
              badgeColor="text-emerald-600 bg-emerald-50 border-emerald-200"
            />
          </TabsContent>

          <TabsContent value="underperformers">
            <ProductTable
              products={lowPerformers}
              isLoading={isLoading}
              onBoost={(id, boost) => boostProduct.mutate({ id, boost })}
              emptyMessage="No underperformers detected"
              badgeColor="text-red-600 bg-red-50 border-red-200"
              showWarning
            />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
};

interface ProductTableProps {
  products: ProductWinner[];
  isLoading: boolean;
  onBoost: (id: string, boost: boolean) => void;
  emptyMessage: string;
  badgeColor: string;
  showWarning?: boolean;
}

const ProductTable = ({ products, isLoading, onBoost, emptyMessage, badgeColor, showWarning }: ProductTableProps) => {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <p>{emptyMessage}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {products.map((p, i) => (
        <Card key={p.id} className="hover:shadow-md transition-shadow">
          <CardContent className="p-4 flex items-center gap-4">
            {/* Rank */}
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border ${badgeColor}`}>
              {i + 1}
            </div>

            {/* Image */}
            {p.image_url && (
              <img
                src={p.image_url}
                alt={p.name}
                className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                loading="lazy"
              />
            )}

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <h3 className="font-semibold text-sm truncate">{p.name}</h3>
                {p.stock < 5 && p.stock > 0 && (
                  <Badge variant="outline" className="text-amber-600 text-[10px]">Low Stock</Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />${p.revenue.toFixed(0)} rev</span>
                <span className="flex items-center gap-1"><ShoppingCart className="w-3 h-3" />{p.orders_count} orders</span>
                <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{p.view_count} views</span>
                <span className="flex items-center gap-1"><Percent className="w-3 h-3" />{p.conversion_rate.toFixed(1)}% CVR</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="text-right">
                <p className="text-xs font-medium">Score</p>
                <p className="text-sm font-bold">{Math.round(p.score)}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1 text-xs"
                onClick={() => onBoost(p.id, true)}
              >
                <Zap className="w-3.5 h-3.5" /> Boost
              </Button>
              {p.slug && (
                <a
                  href={`/product/${p.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default WinnersBoostDashboard;
