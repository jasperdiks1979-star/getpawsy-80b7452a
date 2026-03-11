import { useState, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, FileText, Link2, ShoppingBag, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import {
  generateGuide,
  generateMissingGuides,
  getAllKeywords,
  getMissingKeywords,
  type GuideGenerationResult,
  type BatchGenerationResult,
} from '@/lib/ai-guide-generator';

const CLUSTERS = [
  { value: 'cat-toys', label: 'Cat Toys' },
  { value: 'cat-litter', label: 'Cat Litter' },
  { value: 'cat-trees', label: 'Cat Trees' },
  { value: 'dog-training', label: 'Dog Training' },
  { value: 'dog-travel', label: 'Dog Travel' },
  { value: 'dog-grooming', label: 'Dog Grooming' },
];

export default function GuideGeneratorPage() {
  const [keyword, setKeyword] = useState('');
  const [cluster, setCluster] = useState('cat-toys');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [lastResult, setLastResult] = useState<GuideGenerationResult | null>(null);
  const [batchResult, setBatchResult] = useState<BatchGenerationResult | null>(null);

  const missingKeywords = getMissingKeywords();
  const totalMissing = Object.values(missingKeywords).flat().length;
  const allKeywords = getAllKeywords();
  const totalKeywords = Object.values(allKeywords).flat().length;

  const handleGenerate = useCallback(async () => {
    if (!keyword.trim()) {
      toast.error('Enter a keyword');
      return;
    }
    setIsGenerating(true);
    setLastResult(null);
    try {
      const result = await generateGuide({ keyword: keyword.trim(), cluster });
      setLastResult(result);
      if (result.success) {
        toast.success(`Guide generated: ${result.guide?.title}`);
      } else {
        toast.error(result.error || 'Generation failed');
      }
    } catch (err) {
      toast.error('Unexpected error');
    } finally {
      setIsGenerating(false);
    }
  }, [keyword, cluster]);

  const handleBatchGenerate = useCallback(async (targetCluster?: string) => {
    setIsBatchRunning(true);
    setBatchResult(null);
    try {
      const result = await generateMissingGuides(targetCluster);
      setBatchResult(result);
      toast.success(`Batch complete: ${result.guidesCreated} guides created`);
    } catch (err) {
      toast.error('Batch generation failed');
    } finally {
      setIsBatchRunning(false);
    }
  }, []);

  return (
    <>
      <Helmet>
        <title>AI Guide Generator | Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="space-y-6 p-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">AI Guide Generator</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generate SEO-optimized pet care guides with internal links and product recommendations.
          </p>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{totalKeywords}</p>
              <p className="text-xs text-muted-foreground">Total Keywords</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-primary">{totalMissing}</p>
              <p className="text-xs text-muted-foreground">Missing Guides</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{totalKeywords - totalMissing}</p>
              <p className="text-xs text-muted-foreground">Existing Guides</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{CLUSTERS.length}</p>
              <p className="text-xs text-muted-foreground">Clusters</p>
            </CardContent>
          </Card>
        </div>

        {/* Single Generation */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-primary" />
              Generate Single Guide
            </CardTitle>
            <CardDescription>Enter a keyword and cluster to generate an optimized guide.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                placeholder="e.g. best automatic cat toys"
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                className="flex-1"
              />
              <Select value={cluster} onValueChange={setCluster}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLUSTERS.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleGenerate} disabled={isGenerating}>
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Generate
              </Button>
            </div>

            {lastResult && (
              <div className={`p-4 rounded-lg border ${lastResult.success ? 'border-primary/30 bg-primary/5' : 'border-destructive/30 bg-destructive/5'}`}>
                {lastResult.success ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="font-semibold text-foreground">{lastResult.guide?.title}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge variant="secondary">
                        <Link2 className="h-3 w-3 mr-1" />{lastResult.stats?.internalLinksAdded} links
                      </Badge>
                      <Badge variant="secondary">
                        <ShoppingBag className="h-3 w-3 mr-1" />{lastResult.stats?.productsConnected} products
                      </Badge>
                      <Badge variant="secondary">
                        <FileText className="h-3 w-3 mr-1" />SEO meta ✓
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">/guides/{lastResult.guide?.slug}</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-destructive" />
                    <span className="text-sm text-destructive">{lastResult.error}</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Batch Generation */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5 text-primary" />
              Batch Generate Missing Guides
            </CardTitle>
            <CardDescription>Generate all missing guides for a cluster or all clusters at once.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {CLUSTERS.map(c => {
                const missing = missingKeywords[c.value]?.length || 0;
                return (
                  <Button
                    key={c.value}
                    variant="outline"
                    size="sm"
                    disabled={isBatchRunning || missing === 0}
                    onClick={() => handleBatchGenerate(c.value)}
                  >
                    {c.label}
                    {missing > 0 && <Badge variant="destructive" className="ml-2 text-xs">{missing}</Badge>}
                  </Button>
                );
              })}
              <Button
                variant="default"
                size="sm"
                disabled={isBatchRunning || totalMissing === 0}
                onClick={() => handleBatchGenerate()}
              >
                {isBatchRunning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Generate All ({totalMissing})
              </Button>
            </div>

            {batchResult && (
              <div className="p-4 rounded-lg border border-border bg-card space-y-3">
                <h3 className="font-semibold text-foreground">Batch Results</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                  <div>
                    <p className="text-xl font-bold text-primary">{batchResult.guidesCreated}</p>
                    <p className="text-xs text-muted-foreground">Guides Created</p>
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
                    <p className="text-xs text-muted-foreground">SEO Meta Generated</p>
                  </div>
                </div>
                {batchResult.errors.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> {batchResult.errors.length} errors:
                    </p>
                    <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
                      {batchResult.errors.slice(0, 5).map((e, i) => (
                        <li key={i}>• {e}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Missing Keywords by Cluster */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Keyword Coverage by Cluster</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {CLUSTERS.map(c => {
                const all = allKeywords[c.value] || [];
                const missing = missingKeywords[c.value] || [];
                const existing = all.length - missing.length;
                return (
                  <div key={c.value} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">{c.label}</span>
                      <span className="text-xs text-muted-foreground">{existing}/{all.length} guides</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: all.length > 0 ? `${(existing / all.length) * 100}%` : '0%' }}
                      />
                    </div>
                    {missing.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {missing.map(kw => (
                          <Badge key={kw} variant="outline" className="text-xs cursor-pointer"
                            onClick={() => { setKeyword(kw); setCluster(c.value); }}>
                            {kw}
                          </Badge>
                        ))}
                      </div>
                    )}
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
