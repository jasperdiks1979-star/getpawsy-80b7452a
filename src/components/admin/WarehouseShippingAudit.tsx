import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Warehouse, Package, Truck, Clock, CheckCircle, XCircle, RefreshCw, AlertTriangle, MapPin } from 'lucide-react';
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch';
import { toast } from 'sonner';

interface ShippingOption {
  logisticName: string;
  logisticPrice: number;
  logisticAging: string;
  isUSPS: boolean;
}

interface ProductAudit {
  productId: string;
  productName: string;
  cjProductId: string;
  hasUSWarehouse: boolean;
  usInventory: number;
  warehouses: string[];
  uspsAvailable: boolean;
  uspsShippingDays: string | null;
  uspsShippingPrice: number | null;
  allShippingOptions: ShippingOption[];
  recommendedShippingTime: string;
  currentShippingTime: string | null;
}

interface AuditSummary {
  totalAudited: number;
  usWarehouseCount: number;
  noUSWarehouseCount: number;
  uspsAvailableCount: number;
  usWarehousePercentage: number;
}

interface AuditResult {
  success: boolean;
  summary: AuditSummary;
  products: ProductAudit[];
  productIds: {
    usWarehouse: string[];
    noUSWarehouse: string[];
    uspsAvailable: string[];
  };
}

export const WarehouseShippingAudit = () => {
  const { invokeFunction } = useAuthenticatedFetch();
  const queryClient = useQueryClient();
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditProgress, setAuditProgress] = useState(0);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [auditResults, setAuditResults] = useState<AuditResult | null>(null);

  const runAudit = async () => {
    setIsAuditing(true);
    setAuditProgress(0);
    setAuditResults(null);

    try {
      // Run audit in batches
      let allProducts: ProductAudit[] = [];
      let offset = 0;
      const batchSize = 20;
      let totalCount = 0;
      let summary: AuditSummary | null = null;
      const allProductIds = {
        usWarehouse: [] as string[],
        noUSWarehouse: [] as string[],
        uspsAvailable: [] as string[],
      };

      // First batch to get total count
      const firstResult = await invokeFunction<AuditResult>('audit-warehouse-shipping', {
        body: { action: 'audit-batch', limit: batchSize, offset: 0 },
      });

      if (firstResult.error || !firstResult.data) {
        throw new Error(firstResult.error?.message || 'Failed to run audit');
      }

      allProducts = firstResult.data.products;
      summary = firstResult.data.summary;
      totalCount = summary.totalAudited;
      Object.assign(allProductIds, firstResult.data.productIds);
      
      setAuditProgress(Math.min(100, (allProducts.length / Math.max(totalCount, 1)) * 100));

      // Continue fetching if there are more products
      while (allProducts.length < totalCount && offset + batchSize < 1000) {
        offset += batchSize;
        
        const batchResult = await invokeFunction<AuditResult>('audit-warehouse-shipping', {
          body: { action: 'audit-batch', limit: batchSize, offset },
        });

        if (batchResult.data?.products) {
          allProducts = [...allProducts, ...batchResult.data.products];
          allProductIds.usWarehouse.push(...(batchResult.data.productIds?.usWarehouse || []));
          allProductIds.noUSWarehouse.push(...(batchResult.data.productIds?.noUSWarehouse || []));
          allProductIds.uspsAvailable.push(...(batchResult.data.productIds?.uspsAvailable || []));
        }

        setAuditProgress(Math.min(100, (allProducts.length / Math.max(totalCount, 1)) * 100));
      }

      // Update summary with final counts
      const finalSummary: AuditSummary = {
        totalAudited: allProducts.length,
        usWarehouseCount: allProductIds.usWarehouse.length,
        noUSWarehouseCount: allProductIds.noUSWarehouse.length,
        uspsAvailableCount: allProductIds.uspsAvailable.length,
        usWarehousePercentage: Math.round((allProductIds.usWarehouse.length / allProducts.length) * 100),
      };

      setAuditResults({
        success: true,
        summary: finalSummary,
        products: allProducts,
        productIds: allProductIds,
      });

      toast.success(`Audit complete: ${finalSummary.usWarehouseCount} products with US warehouse`);
    } catch (error) {
      toast.error(`Audit failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsAuditing(false);
      setAuditProgress(100);
    }
  };

  const updateShippingTimes = useMutation({
    mutationFn: async (productUpdates: Array<{ productId: string; shippingTime: string }>) => {
      const result = await invokeFunction('audit-warehouse-shipping', {
        body: { action: 'update-shipping-times', productUpdates },
      });
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: (data: any) => {
      toast.success(`Updated ${data.updated} product shipping times`);
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (error) => {
      toast.error(`Failed to update shipping times: ${error.message}`);
    },
  });

  const handleSelectAll = (productIds: string[]) => {
    const newSelected = new Set(selectedProducts);
    productIds.forEach(id => newSelected.add(id));
    setSelectedProducts(newSelected);
  };

  const handleDeselectAll = () => {
    setSelectedProducts(new Set());
  };

  const handleUpdateSelected = () => {
    if (!auditResults) return;

    const updates = auditResults.products
      .filter(p => selectedProducts.has(p.productId) && p.hasUSWarehouse)
      .map(p => ({
        productId: p.productId,
        shippingTime: p.recommendedShippingTime,
      }));

    if (updates.length === 0) {
      toast.error('No US warehouse products selected');
      return;
    }

    updateShippingTimes.mutate(updates);
  };

  const handleUpdateAllUSWarehouse = () => {
    if (!auditResults) return;

    const updates = auditResults.products
      .filter(p => p.hasUSWarehouse)
      .map(p => ({
        productId: p.productId,
        shippingTime: p.recommendedShippingTime,
      }));

    updateShippingTimes.mutate(updates);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Warehouse className="h-5 w-5" />
            US Warehouse & USPS Shipping Audit
          </CardTitle>
          <CardDescription>
            Check which products are available in the US warehouse and can ship via USPS with faster delivery times
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <Button onClick={runAudit} disabled={isAuditing}>
              {isAuditing ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Auditing...
                </>
              ) : (
                <>
                  <Package className="mr-2 h-4 w-4" />
                  Run Warehouse Audit
                </>
              )}
            </Button>

            {auditResults && auditResults.summary.usWarehouseCount > 0 && (
              <Button 
                variant="default" 
                onClick={handleUpdateAllUSWarehouse}
                disabled={updateShippingTimes.isPending}
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Update All US Warehouse Products ({auditResults.summary.usWarehouseCount})
              </Button>
            )}
          </div>

          {isAuditing && (
            <div className="space-y-2">
              <Progress value={auditProgress} className="h-2" />
              <p className="text-sm text-muted-foreground">
                Checking warehouse availability and shipping options...
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {auditResults && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Package className="h-8 w-8 text-muted-foreground" />
                  <div>
                    <p className="text-2xl font-bold">{auditResults.summary.totalAudited}</p>
                    <p className="text-sm text-muted-foreground">Products Audited</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <MapPin className="h-8 w-8 text-green-600" />
                  <div>
                    <p className="text-2xl font-bold text-green-700">{auditResults.summary.usWarehouseCount}</p>
                    <p className="text-sm text-green-600">US Warehouse ({auditResults.summary.usWarehousePercentage}%)</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Truck className="h-8 w-8 text-blue-600" />
                  <div>
                    <p className="text-2xl font-bold text-blue-700">{auditResults.summary.uspsAvailableCount}</p>
                    <p className="text-sm text-blue-600">USPS Available</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/20">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-8 w-8 text-orange-600" />
                  <div>
                    <p className="text-2xl font-bold text-orange-700">{auditResults.summary.noUSWarehouseCount}</p>
                    <p className="text-sm text-orange-600">No US Warehouse</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Results Tabs */}
          <Card>
            <CardContent className="pt-6">
              <Tabs defaultValue="us-warehouse">
                <TabsList className="mb-4">
                  <TabsTrigger value="us-warehouse" className="gap-2">
                    <CheckCircle className="h-4 w-4" />
                    US Warehouse ({auditResults.summary.usWarehouseCount})
                  </TabsTrigger>
                  <TabsTrigger value="usps-available" className="gap-2">
                    <Truck className="h-4 w-4" />
                    USPS Available ({auditResults.summary.uspsAvailableCount})
                  </TabsTrigger>
                  <TabsTrigger value="no-us-warehouse" className="gap-2">
                    <XCircle className="h-4 w-4" />
                    No US Warehouse ({auditResults.summary.noUSWarehouseCount})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="us-warehouse">
                  <ProductAuditTable
                    products={auditResults.products.filter(p => p.hasUSWarehouse)}
                    selectedProducts={selectedProducts}
                    onToggleSelect={(id) => {
                      const newSelected = new Set(selectedProducts);
                      if (newSelected.has(id)) {
                        newSelected.delete(id);
                      } else {
                        newSelected.add(id);
                      }
                      setSelectedProducts(newSelected);
                    }}
                    onSelectAll={() => handleSelectAll(auditResults.productIds.usWarehouse)}
                    onDeselectAll={handleDeselectAll}
                    onUpdateSelected={handleUpdateSelected}
                    isUpdating={updateShippingTimes.isPending}
                  />
                </TabsContent>

                <TabsContent value="usps-available">
                  <ProductAuditTable
                    products={auditResults.products.filter(p => p.uspsAvailable)}
                    selectedProducts={selectedProducts}
                    onToggleSelect={(id) => {
                      const newSelected = new Set(selectedProducts);
                      if (newSelected.has(id)) {
                        newSelected.delete(id);
                      } else {
                        newSelected.add(id);
                      }
                      setSelectedProducts(newSelected);
                    }}
                    onSelectAll={() => handleSelectAll(auditResults.productIds.uspsAvailable)}
                    onDeselectAll={handleDeselectAll}
                    onUpdateSelected={handleUpdateSelected}
                    isUpdating={updateShippingTimes.isPending}
                    showUSPSDetails
                  />
                </TabsContent>

                <TabsContent value="no-us-warehouse">
                  <Alert className="mb-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      These products will ship from China or other warehouses with longer delivery times (7-21 days).
                      Consider finding US warehouse alternatives or adjusting pricing.
                    </AlertDescription>
                  </Alert>
                  <ProductAuditTable
                    products={auditResults.products.filter(p => !p.hasUSWarehouse)}
                    selectedProducts={new Set()}
                    onToggleSelect={() => {}}
                    onSelectAll={() => {}}
                    onDeselectAll={() => {}}
                    onUpdateSelected={() => {}}
                    isUpdating={false}
                    readOnly
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

interface ProductAuditTableProps {
  products: ProductAudit[];
  selectedProducts: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onUpdateSelected: () => void;
  isUpdating: boolean;
  showUSPSDetails?: boolean;
  readOnly?: boolean;
}

const ProductAuditTable = ({
  products,
  selectedProducts,
  onToggleSelect,
  onSelectAll,
  onDeselectAll,
  onUpdateSelected,
  isUpdating,
  showUSPSDetails,
  readOnly,
}: ProductAuditTableProps) => {
  const selectedCount = products.filter(p => selectedProducts.has(p.productId)).length;

  return (
    <div className="space-y-4">
      {!readOnly && (
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={onSelectAll}>
              Select All
            </Button>
            <Button size="sm" variant="outline" onClick={onDeselectAll}>
              Deselect All
            </Button>
          </div>
          {selectedCount > 0 && (
            <Button size="sm" onClick={onUpdateSelected} disabled={isUpdating}>
              {isUpdating ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="mr-2 h-4 w-4" />
              )}
              Update {selectedCount} Selected
            </Button>
          )}
        </div>
      )}

      <ScrollArea className="h-[500px]">
        <Table>
          <TableHeader>
            <TableRow>
              {!readOnly && <TableHead className="w-12"></TableHead>}
              <TableHead>Product</TableHead>
              <TableHead>Warehouses</TableHead>
              {showUSPSDetails && <TableHead>USPS Details</TableHead>}
              <TableHead>Current</TableHead>
              <TableHead>Recommended</TableHead>
              <TableHead>Shipping Options</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => (
              <TableRow key={product.productId}>
                {!readOnly && (
                  <TableCell>
                    <Checkbox
                      checked={selectedProducts.has(product.productId)}
                      onCheckedChange={() => onToggleSelect(product.productId)}
                    />
                  </TableCell>
                )}
                <TableCell>
                  <div className="max-w-[200px]">
                    <p className="font-medium truncate">{product.productName}</p>
                    <p className="text-xs text-muted-foreground">{product.cjProductId}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {product.warehouses.map((wh) => (
                      <Badge
                        key={wh}
                        variant={wh === 'US' ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {wh}
                        {wh === 'US' && product.usInventory > 0 && ` (${product.usInventory})`}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                {showUSPSDetails && (
                  <TableCell>
                    {product.uspsAvailable ? (
                      <div className="text-sm">
                        <p className="font-medium text-blue-600">{product.uspsShippingDays}</p>
                        <p className="text-muted-foreground">${product.uspsShippingPrice?.toFixed(2)}</p>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                )}
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {product.currentShippingTime || '7-21 days'}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="gap-1">
                    <Clock className="h-3 w-3" />
                    {product.recommendedShippingTime}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1 max-w-[200px]">
                    {product.allShippingOptions.slice(0, 3).map((opt, idx) => (
                      <Badge
                        key={idx}
                        variant={opt.isUSPS ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {opt.logisticName.substring(0, 15)}
                        {opt.logisticName.length > 15 && '...'}
                      </Badge>
                    ))}
                    {product.allShippingOptions.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{product.allShippingOptions.length - 3}
                      </Badge>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
};

export default WarehouseShippingAudit;
