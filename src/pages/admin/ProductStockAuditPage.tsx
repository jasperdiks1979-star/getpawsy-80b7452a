import { useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface AuditRow {
  total_products: number;
  active_products: number;
  in_stock_products: number;
  out_of_stock_products: number;
  visible_out_of_stock_products: number;
  feed_out_of_stock_products: number;
  atc_enabled_out_of_stock_products: number;
  computed_at: string;
}

function Metric({
  label,
  value,
  invariantZero,
}: { label: string; value: number; invariantZero?: boolean }) {
  const isViolation = invariantZero === true && value > 0;
  const isClean = invariantZero === true && value === 0;
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        {isClean && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
        {isViolation && <AlertTriangle className="w-4 h-4 text-destructive" />}
      </div>
      <p
        className={`text-2xl font-bold ${
          isViolation
            ? 'text-destructive'
            : isClean
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-foreground'
        }`}
      >
        {value.toLocaleString()}
      </p>
    </div>
  );
}

export default function ProductStockAuditPage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['product-stock-audit'],
    queryFn: async (): Promise<AuditRow | null> => {
      const { data, error } = await (supabase as any)
        .from('product_stock_audit')
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return data as AuditRow | null;
    },
    staleTime: 60_000,
  });

  return (
    <div className="container max-w-5xl py-8">
      <Helmet>
        <title>Product Stock Audit · Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Product Stock Audit</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Verifies that no out-of-stock products leak into storefront, feed, or Add-to-Cart surfaces.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="px-3 py-2 text-sm rounded-md border border-border bg-card hover:bg-accent"
        >
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading audit…
        </div>
      )}

      {error && (
        <Card className="border-destructive">
          <CardContent className="p-4 text-sm text-destructive">
            Failed to load audit: {(error as Error).message}
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Catalog Snapshot</CardTitle>
              <CardDescription>
                Computed {new Date(data.computed_at).toLocaleString()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Metric label="Total Products" value={data.total_products} />
                <Metric label="Active" value={data.active_products} />
                <Metric label="In Stock" value={data.in_stock_products} />
                <Metric label="Out of Stock" value={data.out_of_stock_products} />
              </div>
            </CardContent>
          </Card>

          <Card className="mt-5">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">Exposure Invariants</CardTitle>
                {data.visible_out_of_stock_products === 0 &&
                data.feed_out_of_stock_products === 0 &&
                data.atc_enabled_out_of_stock_products === 0 ? (
                  <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    All clear
                  </Badge>
                ) : (
                  <Badge variant="destructive">Violation</Badge>
                )}
              </div>
              <CardDescription>
                These must all be 0. If any value is non-zero, an OOS product is reaching shoppers.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Metric
                  label="Visible OOS (storefront)"
                  value={data.visible_out_of_stock_products}
                  invariantZero
                />
                <Metric
                  label="Feed OOS (Google/Pinterest)"
                  value={data.feed_out_of_stock_products}
                  invariantZero
                />
                <Metric
                  label="ATC-Enabled OOS"
                  value={data.atc_enabled_out_of_stock_products}
                  invariantZero
                />
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}