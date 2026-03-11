import { useState } from 'react';
import {
  fetchProductsForOptimization,
  optimizeProductSEO,
  optimizeProductsBatch,
  type ProductSeoInput,
  type OptimizationResult,
  type BatchResult,
} from '@/lib/seo/productSeoEngine';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Sparkles, Loader2, CheckCircle2, XCircle, FileText, Link2, HelpCircle, Tag } from 'lucide-react';
import { toast } from 'sonner';

export default function ProductSeoPage() {
  const [products, setProducts] = useState<ProductSeoInput[]>([]);
  const [loading, setLoading] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const [singleResults, setSingleResults] = useState<OptimizationResult[]>([]);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const data = await fetchProductsForOptimization(50);
      setProducts(data);
      toast.success(`Loaded ${data.length} products`);
    } catch (err) {
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const optimizeSingle = async (product: ProductSeoInput) => {
    setOptimizing(true);
    try {
      const result = await optimizeProductSEO(product);
      setSingleResults(prev => [result, ...prev]);
      if (result.success) {
        toast.success(`Optimized: ${product.name}`);
      } else {
        toast.error(`Failed: ${result.error}`);
      }
    } catch {
      toast.error('Optimization failed');
    } finally {
      setOptimizing(false);
    }
  };

  const optimizeAll = async () => {
    if (products.length === 0) return;
    setOptimizing(true);
    setTotal(products.length);
    setProgress(0);
    setBatchResult(null);

    try {
      const result = await optimizeProductsBatch(products, (completed, t) => {
        setProgress(completed);
        setTotal(t);
      });
      setBatchResult(result);
      setSingleResults(result.results);
      toast.success(`Optimized ${result.productsOptimized} products`);
    } catch {
      toast.error('Batch optimization failed');
    } finally {
      setOptimizing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Product SEO Engine</h1>
          <p className="text-muted-foreground">AI-powered SEO optimization for product pages.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadProducts} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
            Load Products
          </Button>
          <Button onClick={optimizeAll} disabled={optimizing || products.length === 0}>
            {optimizing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Optimize All
          </Button>
        </div>
      </div>

      {/* Progress */}
      {optimizing && total > 0 && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">Optimizing products...</p>
              <p className="text-sm font-medium text-foreground">{progress}/{total}</p>
            </div>
            <Progress value={(progress / total) * 100} />
          </CardContent>
        </Card>
      )}

      {/* Batch Summary */}
      {batchResult && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-2xl font-bold text-primary">{batchResult.productsOptimized}</p>
              <p className="text-xs text-muted-foreground">Products Optimized</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-2xl font-bold text-primary">{batchResult.seoTitlesGenerated}</p>
              <p className="text-xs text-muted-foreground">SEO Titles</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-2xl font-bold text-primary">{batchResult.metaDescriptionsGenerated}</p>
              <p className="text-xs text-muted-foreground">Meta Descriptions</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-2xl font-bold text-primary">{batchResult.faqSectionsCreated}</p>
              <p className="text-xs text-muted-foreground">FAQ Sections</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-2xl font-bold text-primary">{batchResult.internalLinksAdded}</p>
              <p className="text-xs text-muted-foreground">Internal Links</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-2xl font-bold text-primary">{batchResult.structuredDataReady}</p>
              <p className="text-xs text-muted-foreground">Schema Ready</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Product List */}
      {products.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Products ({products.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {products.slice(0, 30).map(product => {
              const result = singleResults.find(r => r.productId === product.id);
              return (
                <div key={product.id} className="flex items-center justify-between border-b border-border/50 pb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{product.name}</p>
                    <p className="text-xs text-muted-foreground">{product.category || 'Uncategorized'} · /{product.slug}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {result ? (
                      result.success ? (
                        <Badge variant="secondary" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Done
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="gap-1">
                          <XCircle className="h-3 w-3" /> Failed
                        </Badge>
                      )
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => optimizeSingle(product)} disabled={optimizing}>
                        <Sparkles className="h-3 w-3 mr-1" /> Optimize
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Results Detail */}
      {singleResults.filter(r => r.success).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Optimization Results</CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="multiple">
              {singleResults.filter(r => r.success && r.data).map(result => (
                <AccordionItem key={result.productId} value={result.productId}>
                  <AccordionTrigger className="text-sm">
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      {result.productName}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 text-sm">
                    <div>
                      <p className="font-medium text-foreground flex items-center gap-1"><Tag className="h-3 w-3" /> SEO Title</p>
                      <p className="text-muted-foreground">{result.data!.seoTitle}</p>
                    </div>
                    <div>
                      <p className="font-medium text-foreground flex items-center gap-1"><FileText className="h-3 w-3" /> Meta Description</p>
                      <p className="text-muted-foreground">{result.data!.metaDescription}</p>
                    </div>
                    <div>
                      <p className="font-medium text-foreground flex items-center gap-1"><HelpCircle className="h-3 w-3" /> FAQ ({result.data!.faq?.length || 0} items)</p>
                      <ul className="list-disc pl-4 text-muted-foreground">
                        {result.data!.faq?.map((f, i) => <li key={i}>{f.question}</li>)}
                      </ul>
                    </div>
                    <div>
                      <p className="font-medium text-foreground flex items-center gap-1"><Link2 className="h-3 w-3" /> Internal Links</p>
                      <ul className="list-disc pl-4 text-muted-foreground">
                        {result.data!.internalLinks?.guides?.map((g, i) => (
                          <li key={i}>/guides/{g.slug} → "{g.anchor}"</li>
                        ))}
                        {result.data!.internalLinks?.collection && (
                          <li>/collections/{result.data!.internalLinks.collection.slug}</li>
                        )}
                      </ul>
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Keywords</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {result.data!.keywords?.map((kw, i) => (
                          <Badge key={i} variant="outline" className="text-xs">{kw}</Badge>
                        ))}
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
