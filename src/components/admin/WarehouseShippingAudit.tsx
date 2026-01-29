import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Warehouse, Package, Truck, CheckCircle, XCircle, RefreshCw, AlertTriangle, MapPin } from 'lucide-react';
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch';
import { toast } from 'sonner';

interface UpdateResult {
  productId: string;
  productName: string;
  success: boolean;
  oldShippingTime?: string;
  newShippingTime?: string;
  hasUSWarehouse?: boolean;
  uspsAvailable?: boolean;
  error?: string;
}

interface BatchUpdateResult {
  success: boolean;
  summary: {
    updated: number;
    failed: number;
    processedCount: number;
    limit: number;
    offset: number;
  };
  products: UpdateResult[];
}

export const WarehouseShippingAudit = () => {
  const { invokeFunction } = useAuthenticatedFetch();
  const queryClient = useQueryClient();
  const [isUpdating, setIsUpdating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<UpdateResult[]>([]);
  const [summary, setSummary] = useState<{ updated: number; failed: number; usWarehouse: number; usps: number } | null>(null);

  const runBatchUpdate = async () => {
    setIsUpdating(true);
    setProgress({ current: 0, total: 0 });
    setResults([]);
    setSummary(null);

    try {
      // First get the total count
      const countResult = await invokeFunction<{ success: boolean; count: number }>('audit-warehouse-shipping', {
        body: { action: 'count' },
      });

      if (countResult.error || !countResult.data) {
        throw new Error(countResult.error?.message || 'Failed to get product count');
      }

      const totalCount = countResult.data.count;
      if (totalCount === 0) {
        toast.info('No products to update');
        setIsUpdating(false);
        return;
      }

      setProgress({ current: 0, total: totalCount });

      // Process in batches
      const batchSize = 20;
      let allResults: UpdateResult[] = [];
      let totalUpdated = 0;
      let totalFailed = 0;
      let usWarehouseCount = 0;
      let uspsCount = 0;

      for (let offset = 0; offset < totalCount; offset += batchSize) {
        const batchResult = await invokeFunction<BatchUpdateResult>('audit-warehouse-shipping', {
          body: { action: 'update-all', limit: batchSize, offset },
        });

        if (batchResult.error) {
          console.error(`Batch at offset ${offset} failed:`, batchResult.error);
          continue;
        }

        if (batchResult.data?.products) {
          allResults = [...allResults, ...batchResult.data.products];
          totalUpdated += batchResult.data.summary.updated;
          totalFailed += batchResult.data.summary.failed;
          
          // Count US warehouse and USPS products
          batchResult.data.products.forEach(p => {
            if (p.hasUSWarehouse) usWarehouseCount++;
            if (p.uspsAvailable) uspsCount++;
          });
        }

        setProgress({ current: Math.min(offset + batchSize, totalCount), total: totalCount });
        setResults(allResults);
      }

      setSummary({
        updated: totalUpdated,
        failed: totalFailed,
        usWarehouse: usWarehouseCount,
        usps: uspsCount,
      });

      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success(`Updated ${totalUpdated} products with realistic shipping times`);
    } catch (error) {
      toast.error(`Update failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const successResults = results.filter(r => r.success);
  const failedResults = results.filter(r => !r.success);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Warehouse className="h-5 w-5" />
            Automatic Shipping Time Update
          </CardTitle>
          <CardDescription>
            Automatically checks CJ Dropshipping for each product's warehouse location and sets realistic shipping times.
            Products in the US warehouse get faster shipping times (2-7 days via USPS), while international products get 10-20 days.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <Truck className="h-4 w-4" />
            <AlertDescription>
              <strong>How it works:</strong> For each product, we check if it's available in the US warehouse. 
              If yes, we query USPS shipping options and set the fastest available time. 
              If no US warehouse, the shipping time is set to "10-20 business days".
            </AlertDescription>
          </Alert>

          <div className="flex gap-4">
            <Button onClick={runBatchUpdate} disabled={isUpdating} size="lg">
              {isUpdating ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Updating... ({progress.current}/{progress.total})
                </>
              ) : (
                <>
                  <Package className="mr-2 h-4 w-4" />
                  Update All Product Shipping Times
                </>
              )}
            </Button>
          </div>

          {isUpdating && (
            <div className="space-y-2">
              <Progress value={(progress.current / Math.max(progress.total, 1)) * 100} className="h-2" />
              <p className="text-sm text-muted-foreground">
                Processing {progress.current} of {progress.total} products...
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {summary && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                  <div>
                    <p className="text-2xl font-bold text-green-700">{summary.updated}</p>
                    <p className="text-sm text-muted-foreground">Products Updated</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <MapPin className="h-8 w-8 text-blue-600" />
                  <div>
                    <p className="text-2xl font-bold text-blue-700">{summary.usWarehouse}</p>
                    <p className="text-sm text-blue-600">US Warehouse</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-purple-200 bg-purple-50 dark:bg-purple-950/20">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Truck className="h-8 w-8 text-purple-600" />
                  <div>
                    <p className="text-2xl font-bold text-purple-700">{summary.usps}</p>
                    <p className="text-sm text-purple-600">USPS Available</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {summary.failed > 0 && (
              <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <XCircle className="h-8 w-8 text-red-600" />
                    <div>
                      <p className="text-2xl font-bold text-red-700">{summary.failed}</p>
                      <p className="text-sm text-red-600">Failed</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Results Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Update Results</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Old Shipping Time</TableHead>
                      <TableHead>New Shipping Time</TableHead>
                      <TableHead>US Warehouse</TableHead>
                      <TableHead>USPS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {successResults.map((result) => (
                      <TableRow key={result.productId}>
                        <TableCell>
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        </TableCell>
                        <TableCell>
                          <div className="max-w-[250px]">
                            <p className="font-medium truncate">{result.productName}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {result.oldShippingTime || '-'}
                        </TableCell>
                        <TableCell className="font-medium">
                          {result.newShippingTime}
                        </TableCell>
                        <TableCell>
                          {result.hasUSWarehouse ? (
                            <span className="text-green-600">✓</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {result.uspsAvailable ? (
                            <span className="text-blue-600">✓</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {failedResults.map((result) => (
                      <TableRow key={result.productId} className="bg-red-50 dark:bg-red-950/20">
                        <TableCell>
                          <XCircle className="h-4 w-4 text-red-600" />
                        </TableCell>
                        <TableCell>
                          <div className="max-w-[250px]">
                            <p className="font-medium truncate">{result.productName}</p>
                          </div>
                        </TableCell>
                        <TableCell colSpan={4} className="text-red-600">
                          {result.error}
                        </TableCell>
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

export default WarehouseShippingAudit;
