import { lazy, Suspense } from 'react';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart3, AlertTriangle, Image, Tag, TrendingUp, DollarSign } from 'lucide-react';

interface ProductRow {
  id: string;
  name: string;
  price: number;
  compare_at_price: number | null;
  image_url: string | null;
  images: string[] | null;
  sku: string | null;
  category: string | null;
  stock: number | null;
}

const FREE_SHIPPING_THRESHOLD = 35;

export default function FeedInsightsPage() {
  const { data: products = [], isLoading } = useQuery({
    queryKey: ['feed-insights-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products_public' as any)
        .select('id, name, price, compare_at_price, image_url, images, sku, category, stock')
        .eq('is_active', true)
        .eq('is_duplicate', false)
        .order('price', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data || []) as unknown as ProductRow[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Margin analysis
  const withMargin = products
    .filter(p => p.compare_at_price && p.compare_at_price > 0 && p.compare_at_price > p.price)
    .map(p => ({
      ...p,
      margin: ((p.compare_at_price! - p.price) / p.compare_at_price!) * 100,
      profit: p.compare_at_price! - p.price,
    }))
    .sort((a, b) => b.margin - a.margin);

  const marginBuckets = {
    high: withMargin.filter(p => p.margin >= 40).length,
    mid: withMargin.filter(p => p.margin >= 20 && p.margin < 40).length,
    low: withMargin.filter(p => p.margin < 20).length,
  };

  const noGtin = products.filter(p => !p.sku);
  const noSecondaryImages = products.filter(p => !p.images || p.images.length <= 1);
  const shortTitles = products.filter(p => p.name.length < 50);
  const noComparePrice = products.filter(p => !p.compare_at_price || p.compare_at_price <= 0);

  if (isLoading) {
    return (
      <div className="container py-8 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
        <title>Feed Insights | Admin</title>
      </Helmet>
      <div className="container py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Merchant Feed Insights
          </h1>
          <p className="text-muted-foreground">Product feed health & optimization opportunities</p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Products</CardDescription>
              <CardTitle className="text-2xl">{products.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Missing GTIN/SKU</CardDescription>
              <CardTitle className="text-2xl text-destructive">{noGtin.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>No Secondary Images</CardDescription>
              <CardTitle className="text-2xl text-amber-600">{noSecondaryImages.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>No Compare Price</CardDescription>
              <CardTitle className="text-2xl text-amber-600">{noComparePrice.length}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Margin Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Margin Distribution
            </CardTitle>
            <CardDescription>{withMargin.length} products with margin data</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 mb-4">
              <Badge variant="default" className="bg-green-600">{marginBuckets.high} High (≥40%)</Badge>
              <Badge variant="secondary">{marginBuckets.mid} Mid (20-40%)</Badge>
              <Badge variant="outline">{marginBuckets.low} Low (&lt;20%)</Badge>
            </div>
            {/* Bar visualization */}
            <div className="flex h-6 rounded-full overflow-hidden bg-muted">
              {withMargin.length > 0 && (
                <>
                  <div className="bg-green-600 transition-all" style={{ width: `${(marginBuckets.high / withMargin.length) * 100}%` }} />
                  <div className="bg-amber-500 transition-all" style={{ width: `${(marginBuckets.mid / withMargin.length) * 100}%` }} />
                  <div className="bg-muted-foreground/30 transition-all" style={{ width: `${(marginBuckets.low / withMargin.length) * 100}%` }} />
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Top 10 Highest Margin */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Top 10 Highest Margin Products
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Compare At</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {withMargin.slice(0, 10).map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="max-w-[300px] truncate font-medium">{p.name}</TableCell>
                    <TableCell className="text-right">${p.price.toFixed(2)}</TableCell>
                    <TableCell className="text-right">${p.compare_at_price!.toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={p.margin >= 40 ? 'default' : 'secondary'} className={p.margin >= 40 ? 'bg-green-600' : ''}>
                        {p.margin.toFixed(1)}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* CTR Opportunity: Short Titles */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              CTR Opportunity — Short Titles (&lt;50 chars)
            </CardTitle>
            <CardDescription>{shortTitles.length} products may benefit from richer titles</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Title Length</TableHead>
                  <TableHead>Category</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shortTitles.slice(0, 20).map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="max-w-[350px] truncate">{p.name}</TableCell>
                    <TableCell className="text-right">{p.name.length}</TableCell>
                    <TableCell className="text-muted-foreground">{p.category || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Products without secondary images */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Image className="h-5 w-5" />
              Missing Secondary Images
            </CardTitle>
            <CardDescription>{noSecondaryImages.length} products with only 1 or no images</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Products with multiple images have higher CTR in Google Shopping.
              Top {Math.min(20, noSecondaryImages.length)} shown.
            </p>
            <div className="mt-3 space-y-1">
              {noSecondaryImages.slice(0, 20).map(p => (
                <div key={p.id} className="text-sm py-1 border-b border-border/50 flex justify-between">
                  <span className="truncate max-w-[400px]">{p.name}</span>
                  <Badge variant="outline" className="shrink-0">{p.images?.length || 0} img</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
