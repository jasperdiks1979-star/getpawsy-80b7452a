import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Package, CheckCircle, XCircle, AlertTriangle, ArrowUpCircle } from 'lucide-react';
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch';
import { toast } from 'sonner';

interface ProductResult {
  productId: string;
  productName: string;
  cjProductId: string;
  previousStock: number;
  previousStatus: string | null;
  newStock: number | null;
  newStatus: string;
  warehouse: string;
  action: string;
  error?: string;
}

interface BatchResponse {
  success: boolean;
  done: boolean;
  summary: {
    total: number;
    processed: number;
    batchSize: number;
    restoredToStock: number;
    confirmedOos: number;
    discontinued: number;
    errors: number;
    hasMore: boolean;
    nextOffset: number | null;
  };
  products: ProductResult[];
}

interface CountResponse {
  count: number;
  statusBreakdown: Record<string, number>;
}

export const OosResyncAudit = () => {
  const { invokeFunction } = useAuthenticatedFetch();
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<ProductResult[]>([]);
  const [summary, setSummary] = useState<{
    total: number;
    restoredToStock: number;
    confirmedOos: number;
    discontinued: number;
    errors: number;
  } | null>(null);
  const [countInfo, setCountInfo] = useState<CountResponse | null>(null);

  const fetchCount = async () => {
    const res = await invokeFunction<CountResponse>('resync-oos-products', {
      body: { action: 'count' },
    });
    if (res.data) {
      setCountInfo(res.data);
      toast.info(`${res.data.count} out-of-stock products found`);
    }
  };

  const runResync = async () => {
    setIsRunning(true);
    setResults([]);
    setSummary(null);

    try {
      // Get count first
      const countRes = await invokeFunction<CountResponse>('resync-oos-products', {
        body: { action: 'count' },
      });
      if (!countRes.data || countRes.data.count === 0) {
        toast.info('No out-of-stock products to re-sync');
        setIsRunning(false);
        return;
      }

      const totalCount = countRes.data.count;
      setProgress({ current: 0, total: totalCount });
      setCountInfo(countRes.data);

      const batchSize = 5;
      let allResults: ProductResult[] = [];
      let totalRestored = 0;
      let totalConfirmedOos = 0;
      let totalDiscontinued = 0;
      let totalErrors = 0;

      for (let offset = 0; offset < totalCount; offset += batchSize) {
        const batchRes = await invokeFunction<BatchResponse>('resync-oos-products', {
          body: { action: 'resync', offset, limit: batchSize },
        });

        if (batchRes.error) {
          console.error(`Batch at offset ${offset} failed:`, batchRes.error);
          totalErrors += batchSize;
          continue;
        }

        if (batchRes.data?.products) {
          allResults = [...allResults, ...batchRes.data.products];
          totalRestored += batchRes.data.summary.restoredToStock;
          totalConfirmedOos += batchRes.data.summary.confirmedOos;
          totalDiscontinued += batchRes.data.summary.discontinued;
          totalErrors += batchRes.data.summary.errors;
        }

        setProgress({ current: Math.min(offset + batchSize, totalCount), total: totalCount });
        setResults(allResults);
      }

      setSummary({
        total: totalCount,
        restoredToStock: totalRestored,
        confirmedOos: totalConfirmedOos,
        discontinued: totalDiscontinued,
        errors: totalErrors,
      });

      if (totalRestored > 0) {
        toast.success(`🟢 ${totalRestored} products restored to in-stock!`);
      } else {
        toast.info('All products confirmed out of stock at CJ');
      }
    } catch (error) {
      toast.error(`Re-sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsRunning(false);
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'restored_to_stock':
        return <Badge className="bg-green-600">Restored ✓</Badge>;
      case 'confirmed_oos':
        return <Badge variant="secondary">Confirmed OOS</Badge>;
      case 'confirmed_discontinued':
        return <Badge variant="destructive">Discontinued</Badge>;
      case 'no_data_kept_previous':
        return <Badge variant="outline">No Data</Badge>;
      case 'sync_error':
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="outline">{action}</Badge>;
    }
  };

  const restoredResults = results.filter(r => r.action === 'restored_to_stock');
  const confirmedOosResults = results.filter(r => r.action === 'confirmed_oos');
  const discontinuedResults = results.filter(r => r.action === 'confirmed_discontinued');
  const errorResults = results.filter(r => r.action === 'sync_error' || r.action === 'no_data_kept_previous');

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            OOS Product Re-Sync (CJ Dropshipping)
          </CardTitle>
          <CardDescription>
            Re-verify all canonical out-of-stock products against CJ Dropshipping API.
            Products with restored stock will become purchasable again.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              This checks each OOS product against CJ's live inventory API. 
              US warehouse stock is prioritized. Products confirmed OOS keep their status.
              API errors do NOT overwrite existing stock values.
            </AlertDescription>
          </Alert>

          {countInfo && (
            <div className="text-sm text-muted-foreground space-y-1">
              <p><strong>{countInfo.count}</strong> out-of-stock products to check</p>
              <p className="text-xs">
                Status breakdown: {Object.entries(countInfo.statusBreakdown).map(([k, v]) => `${k}: ${v}`).join(', ')}
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <Button onClick={fetchCount} variant="outline" disabled={isRunning}>
              <Package className="mr-2 h-4 w-4" />
              Check Count
            </Button>
            <Button onClick={runResync} disabled={isRunning} size="lg">
              {isRunning ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Re-syncing... ({progress.current}/{progress.total})
                </>
              ) : (
                <>
                  <ArrowUpCircle className="mr-2 h-4 w-4" />
                  Re-Sync All OOS Products
                </>
              )}
            </Button>
          </div>

          {isRunning && (
            <div className="space-y-2">
              <Progress value={(progress.current / Math.max(progress.total, 1)) * 100} className="h-2" />
              <p className="text-sm text-muted-foreground">
                Processing {progress.current} of {progress.total} products (~{Math.ceil((progress.total - progress.current) * 3 / 5)}s remaining)
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {summary && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <ArrowUpCircle className="h-8 w-8 text-green-600" />
                  <div>
                    <p className="text-2xl font-bold text-green-700">{summary.restoredToStock}</p>
                    <p className="text-sm text-green-600">Restored to Stock</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-8 w-8 text-muted-foreground" />
                  <div>
                    <p className="text-2xl font-bold">{summary.confirmedOos}</p>
                    <p className="text-sm text-muted-foreground">Confirmed OOS</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/20">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <XCircle className="h-8 w-8 text-orange-600" />
                  <div>
                    <p className="text-2xl font-bold text-orange-700">{summary.discontinued}</p>
                    <p className="text-sm text-orange-600">Discontinued</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {summary.errors > 0 && (
              <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-8 w-8 text-red-600" />
                    <div>
                      <p className="text-2xl font-bold text-red-700">{summary.errors}</p>
                      <p className="text-sm text-red-600">Errors / No Data</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Restored products first */}
          {restoredResults.length > 0 && (
            <Card className="border-green-200">
              <CardHeader>
                <CardTitle className="text-lg text-green-700">🟢 Restored to Stock ({restoredResults.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[200px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>New Stock</TableHead>
                        <TableHead>Warehouse</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {restoredResults.map(r => (
                        <TableRow key={r.productId}>
                          <TableCell className="font-medium max-w-[300px] truncate">{r.productName}</TableCell>
                          <TableCell className="text-green-600 font-bold">{r.newStock}</TableCell>
                          <TableCell>{r.warehouse}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {/* Full results */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">All Results ({results.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Previous</TableHead>
                      <TableHead>New Stock</TableHead>
                      <TableHead>Warehouse</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map(r => (
                      <TableRow key={r.productId} className={r.action === 'restored_to_stock' ? 'bg-green-50 dark:bg-green-950/20' : ''}>
                        <TableCell>
                          {r.action === 'restored_to_stock' ? <ArrowUpCircle className="h-4 w-4 text-green-600" /> :
                           r.action === 'confirmed_oos' ? <CheckCircle className="h-4 w-4 text-muted-foreground" /> :
                           r.action === 'confirmed_discontinued' ? <XCircle className="h-4 w-4 text-orange-600" /> :
                           <AlertTriangle className="h-4 w-4 text-red-600" />}
                        </TableCell>
                        <TableCell className="max-w-[250px]">
                          <p className="font-medium truncate">{r.productName}</p>
                          <p className="text-xs text-muted-foreground truncate">{r.cjProductId}</p>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{r.previousStock}</TableCell>
                        <TableCell className={r.newStock && r.newStock > 0 ? 'text-green-600 font-bold' : ''}>
                          {r.newStock ?? '—'}
                        </TableCell>
                        <TableCell>{r.warehouse}</TableCell>
                        <TableCell>{getActionBadge(r.action)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default OosResyncAudit;
