import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, CheckCircle2, Wrench, RefreshCw, Eye, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { Json } from '@/integrations/supabase/types';
import { formatDistanceToNow } from 'date-fns';
import { nl } from 'date-fns/locale';

interface ProductVariant {
  vid: string;
  pid: string;
  variantNameEn: string | null;
  variantKey: string | null;
  variantSku: string;
  variantImage?: string;
  variantSellPrice?: number;
}

interface ProductWithIssues {
  id: string;
  name: string;
  variants: ProductVariant[];
  issues: {
    missingNameEn: number;
    missingKey: number;
    total: number;
  };
}

const VariantDataValidator = () => {
  const queryClient = useQueryClient();
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());

  // Fetch latest cron job run for variant fix
  const { data: lastCronRun } = useQuery({
    queryKey: ['last-variant-fix-cron'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cron_job_logs')
        .select('*')
        .eq('job_name', 'nightly-variant-data-fix')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });

  // Fetch products with variant issues
  const { data: productsWithIssues, isLoading, refetch } = useQuery({
    queryKey: ['variant-issues'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, variants')
        .not('variants', 'eq', '[]')
        .not('variants', 'is', null);

      if (error) throw error;

      const issues: ProductWithIssues[] = [];

      for (const product of data || []) {
        if (!product.variants || !Array.isArray(product.variants)) continue;

        const variants = product.variants as unknown as ProductVariant[];
        let missingNameEn = 0;
        let missingKey = 0;

        for (const variant of variants) {
          if (!variant.variantNameEn || variant.variantNameEn === null) {
            missingNameEn++;
          }
          if (!variant.variantKey || variant.variantKey === null) {
            missingKey++;
          }
        }

        if (missingNameEn > 0 || missingKey > 0) {
          issues.push({
            id: product.id,
            name: product.name,
            variants,
            issues: {
              missingNameEn,
              missingKey,
              total: variants.length,
            },
          });
        }
      }

      return issues;
    },
  });

  // Fix variant names mutation
  const fixVariantsMutation = useMutation({
    mutationFn: async (productId: string) => {
      // Get the product
      const { data: product, error: fetchError } = await supabase
        .from('products')
        .select('variants')
        .eq('id', productId)
        .single();

      if (fetchError) throw fetchError;
      if (!product?.variants) throw new Error('No variants found');

      const variants = product.variants as unknown as ProductVariant[];
      
      // Fix variants by using variantKey as fallback for variantNameEn
      const fixedVariants = variants.map(variant => ({
        ...variant,
        variantNameEn: variant.variantNameEn || variant.variantKey || variant.variantSku || 'Option',
        variantKey: variant.variantKey || variant.variantNameEn || variant.variantSku || 'Option',
      }));

      // Update the product
      const { error: updateError } = await supabase
        .from('products')
        .update({ variants: fixedVariants as unknown as Json })
        .eq('id', productId);

      if (updateError) throw updateError;

      return productId;
    },
    onSuccess: (productId) => {
      toast.success('Variant names fixed successfully');
      queryClient.invalidateQueries({ queryKey: ['variant-issues'] });
      queryClient.invalidateQueries({ queryKey: ['product', productId] });
    },
    onError: (error) => {
      toast.error(`Failed to fix variants: ${error.message}`);
    },
  });

  // Fix all variants mutation
  const fixAllMutation = useMutation({
    mutationFn: async () => {
      if (!productsWithIssues) return;

      for (const product of productsWithIssues) {
        await fixVariantsMutation.mutateAsync(product.id);
      }
    },
    onSuccess: () => {
      toast.success('All variant names fixed successfully');
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to fix all variants: ${error.message}`);
    },
  });

  const toggleExpanded = (productId: string) => {
    setExpandedProducts(prev => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const totalIssues = productsWithIssues?.reduce((sum, p) => sum + p.issues.missingNameEn + p.issues.missingKey, 0) || 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="w-5 h-5" />
              Variant Data Validator
            </CardTitle>
          <CardDescription className="flex items-center gap-4">
            <span>Identify and fix products with missing variant names to prevent React errors</span>
            {lastCronRun && (
              <span className="flex items-center gap-1.5 text-xs bg-muted px-2 py-1 rounded-md">
                <Clock className="w-3 h-3" />
                Laatste auto-fix: {formatDistanceToNow(new Date(lastCronRun.started_at), { addSuffix: true, locale: nl })}
                {lastCronRun.success !== null && (
                  lastCronRun.success ? (
                    <CheckCircle2 className="w-3 h-3 text-green-600 ml-1" />
                  ) : (
                    <AlertTriangle className="w-3 h-3 text-destructive ml-1" />
                  )
                )}
              </span>
            )}
          </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            {productsWithIssues && productsWithIssues.length > 0 && (
              <Button
                size="sm"
                onClick={() => fixAllMutation.mutate()}
                disabled={fixAllMutation.isPending}
              >
                {fixAllMutation.isPending ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                )}
                Fix All ({productsWithIssues.length})
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-muted/50 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">Products with Issues</p>
            <p className="text-2xl font-bold text-foreground">
              {productsWithIssues?.length || 0}
            </p>
          </div>
          <div className="bg-muted/50 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">Total Missing Names</p>
            <p className="text-2xl font-bold text-destructive">
              {totalIssues}
            </p>
          </div>
          <div className="bg-muted/50 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">Status</p>
            <p className="text-2xl font-bold">
              {totalIssues === 0 ? (
                <span className="text-green-600 flex items-center gap-2">
                  <CheckCircle2 className="w-6 h-6" />
                  All Good
                </span>
              ) : (
                <span className="text-amber-600 flex items-center gap-2">
                  <AlertTriangle className="w-6 h-6" />
                  Needs Fix
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Products Table */}
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading products...
          </div>
        ) : productsWithIssues && productsWithIssues.length > 0 ? (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-center">Variants</TableHead>
                  <TableHead className="text-center">Missing Names</TableHead>
                  <TableHead className="text-center">Missing Keys</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productsWithIssues.map((product) => (
                  <>
                    <TableRow key={product.id} className="hover:bg-muted/50">
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleExpanded(product.id)}
                        >
                          {expandedProducts.has(product.id) ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[300px]">
                          <p className="font-medium truncate">{product.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{product.id}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline">{product.issues.total}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {product.issues.missingNameEn > 0 ? (
                          <Badge variant="destructive">{product.issues.missingNameEn}</Badge>
                        ) : (
                          <Badge variant="secondary">0</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {product.issues.missingKey > 0 ? (
                          <Badge variant="destructive">{product.issues.missingKey}</Badge>
                        ) : (
                          <Badge variant="secondary">0</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            asChild
                          >
                            <a href={`/products/${product.id}`} target="_blank" rel="noopener noreferrer">
                              <Eye className="w-4 h-4" />
                            </a>
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => fixVariantsMutation.mutate(product.id)}
                            disabled={fixVariantsMutation.isPending}
                          >
                            Fix
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedProducts.has(product.id) && (
                      <TableRow key={`${product.id}-details`}>
                        <TableCell colSpan={6} className="bg-muted/30 p-4">
                          <div className="space-y-2">
                            <p className="text-sm font-medium mb-2">Variant Details:</p>
                            <div className="grid gap-2">
                              {product.variants.map((variant, idx) => (
                                <div 
                                  key={variant.vid || idx}
                                  className="flex items-center gap-4 p-2 bg-background rounded border text-sm"
                                >
                                  {variant.variantImage && (
                                    <img 
                                      src={variant.variantImage} 
                                      alt="" 
                                      className="w-10 h-10 rounded object-cover"
                                    />
                                  )}
                                  <div className="flex-1 grid grid-cols-3 gap-4">
                                    <div>
                                      <span className="text-muted-foreground">variantNameEn:</span>{' '}
                                      {variant.variantNameEn ? (
                                        <span className="text-foreground">{variant.variantNameEn}</span>
                                      ) : (
                                        <Badge variant="destructive" className="text-xs">null</Badge>
                                      )}
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">variantKey:</span>{' '}
                                      {variant.variantKey ? (
                                        <span className="text-foreground">{variant.variantKey}</span>
                                      ) : (
                                        <Badge variant="destructive" className="text-xs">null</Badge>
                                      )}
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">SKU:</span>{' '}
                                      <span className="text-foreground font-mono text-xs">{variant.variantSku}</span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-12 bg-muted/30 rounded-lg">
            <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-4" />
            <p className="text-lg font-medium text-foreground">All variants are valid!</p>
            <p className="text-sm text-muted-foreground">
              No products have missing variant names or keys.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default VariantDataValidator;
