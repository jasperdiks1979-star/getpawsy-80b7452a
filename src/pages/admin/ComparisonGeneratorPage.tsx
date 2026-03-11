import { useState, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, FileText, Link2, ShoppingBag, CheckCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import {
  generateMissingComparisonPages,
  getComparisonStats,
  getMissingComparisonPages,
  type ComparisonPageConfig,
} from '@/lib/seo/programmaticComparisonGenerator';
import type { BatchGenerationResult } from '@/lib/ai-guide-generator';

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  'cat-toys': 'Cat Toys',
  'cat-litter': 'Cat Litter',
  'cat-trees': 'Cat Trees',
  'cat-scratching-posts': 'Cat Scratching Posts',
  'dog-training-toys': 'Dog Training Toys',
  'dog-car-seats': 'Dog Car Seats',
  'dog-grooming-tools': 'Dog Grooming Tools',
  'dog-travel': 'Dog Travel',
};

export default function ComparisonGeneratorPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchGenerationResult | null>(null);

  const stats = getComparisonStats();
  const missing = getMissingComparisonPages();

  const handleGenerate = useCallback(async (productType?: string) => {
    setIsRunning(true);
    setBatchResult(null);
    try {
      const result = await generateMissingComparisonPages(productType);
      setBatchResult(result);
      toast.success(`Generated ${result.guidesCreated} comparison pages`);
    } catch {
      toast.error('Generation failed');
    } finally {
      setIsRunning(false);
    }
  }, []);

  return (
    <>
      <Helmet>
        <title>Comparison Page Generator | Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="space-y-6 p-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Programmatic Comparison Pages</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Auto-generate "Best X for Y" SEO pages targeting long-tail buying intent.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{stats.totalPages}</p>
            <p className="text-xs text-muted-foreground">Total Combinations</p>
          </CardContent></Card>
          <Card><CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">{stats.missingPages}</p>
            <p className="text-xs text-muted-foreground">Missing Pages</p>
          </CardContent></Card>
          <Card><CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{stats.existingPages}</p>
            <p className="text-xs text-muted-foreground">Existing Pages</p>
          </CardContent></Card>
          <Card><CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{Object.keys(stats.byType).length}</p>
            <p className="text-xs text-muted-foreground">Product Types</p>
          </CardContent></Card>
        </div>

        {/* Generate by Type */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-primary" />
              Generate Comparison Pages
            </CardTitle>
            <CardDescription>Generate missing "Best X for Y" pages by product type.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.byType).map(([type, data]) => (
                <Button
                  key={type}
                  variant="outline"
                  size="sm"
                  disabled={isRunning || data.missing === 0}
                  onClick={() => handleGenerate(type)}
                >
                  {PRODUCT_TYPE_LABELS[type] || type}
                  {data.missing > 0 && <Badge variant="destructive" className="ml-2 text-xs">{data.missing}</Badge>}
                </Button>
              ))}
              <Button variant="default" size="sm" disabled={isRunning || stats.missingPages === 0} onClick={() => handleGenerate()}>
                {isRunning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Generate All ({stats.missingPages})
              </Button>
            </div>

            {batchResult && (
              <div className="p-4 rounded-lg border border-border bg-card space-y-3">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-primary" /> Results
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                  <div>
                    <p className="text-xl font-bold text-primary">{batchResult.guidesCreated}</p>
                    <p className="text-xs text-muted-foreground">Pages Created</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-foreground">{batchResult.internalLinksAdded}</p>
                    <p className="text-xs text-muted-foreground">Internal Links</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-foreground">{batchResult.productsConnected}</p>
                    <p className="text-xs text-muted-foreground">Products Connected</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-foreground">{batchResult.seoMetaGenerated}</p>
                    <p className="text-xs text-muted-foreground">SEO Meta</p>
                  </div>
                </div>
                {batchResult.errors.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> {batchResult.errors.length} errors
                    </p>
                    <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
                      {batchResult.errors.slice(0, 5).map((e, i) => <li key={i}>• {e}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Missing Pages Preview */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Missing Comparison Pages ({missing.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(stats.byType).map(([type, data]) => {
                const typeMissing = missing.filter(p => p.productType === type);
                if (typeMissing.length === 0) return null;
                return (
                  <div key={type} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">{PRODUCT_TYPE_LABELS[type] || type}</span>
                      <span className="text-xs text-muted-foreground">{data.total - data.missing}/{data.total}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${((data.total - data.missing) / data.total) * 100}%` }} />
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {typeMissing.map(p => (
                        <Badge key={p.slug} variant="outline" className="text-xs">/guides/{p.slug}</Badge>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
