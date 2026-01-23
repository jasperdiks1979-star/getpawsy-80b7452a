import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { RefreshCw, Play, CheckCircle, AlertCircle, ArrowRight, X, RotateCcw } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  CATEGORY_KEYWORD_MAP, 
  EXCLUSION_KEYWORDS, 
  determineProductCategory 
} from "@/lib/category-keywords";

interface Category {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
}

interface Product {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
}

interface RecategorizationResult {
  productId: string;
  productName: string;
  oldCategory: string | null;
  newCategory: string;
  newCategorySlug: string;
  score: number;
  matchedKeywords: string[];
  confidence: 'high' | 'medium' | 'low';
  changed: boolean;
}

/**
 * Matches a product to the best category using the central keyword library
 * with exclusion logic to prevent cross-species miscategorization
 */
function matchProductToCategory(
  product: Product, 
  availableCategories: Category[]
): {
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  score: number;
  matchedKeywords: string[];
  confidence: 'high' | 'medium' | 'low';
} | null {
  const availableSlugs = availableCategories.map(c => c.slug);
  const categoryBySlug = new Map(availableCategories.map(c => [c.slug, c]));
  
  // Use the centralized category determination function
  const result = determineProductCategory(
    product.name,
    product.description,
    availableSlugs
  );
  
  // Only return if we have a valid match with a category that exists
  if (result.score > 0 && categoryBySlug.has(result.category)) {
    const category = categoryBySlug.get(result.category)!;
    return {
      categoryId: category.id,
      categoryName: category.name,
      categorySlug: category.slug,
      score: result.score,
      matchedKeywords: result.keywords,
      confidence: result.confidence,
    };
  }
  
  return null;
}

export function ProductRecategorizer() {
  const queryClient = useQueryClient();
  const [results, setResults] = useState<RecategorizationResult[]>([]);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Fetch all categories
  const { data: categories = [] } = useQuery({
    queryKey: ['categories-for-recategorization'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, slug, parent_id');
      if (error) throw error;
      return data as Category[];
    },
  });

  // Fetch all products (including description for better matching)
  const { data: products = [] } = useQuery({
    queryKey: ['products-for-recategorization'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, category, description');
      if (error) throw error;
      return data as Product[];
    },
  });

  // Analyze products using the central keyword library
  const analyzeProducts = () => {
    setIsAnalyzing(true);
    setResults([]);
    setExcludedIds(new Set()); // Reset exclusions on new analysis
    setProgress(0);

    const newResults: RecategorizationResult[] = [];
    
    products.forEach((product, index) => {
      const match = matchProductToCategory(product, categories);
      
      if (match) {
        newResults.push({
          productId: product.id,
          productName: product.name,
          oldCategory: product.category,
          newCategory: match.categoryName,
          newCategorySlug: match.categorySlug,
          score: match.score,
          matchedKeywords: match.matchedKeywords,
          confidence: match.confidence,
          changed: product.category !== match.categoryName,
        });
      }
      
      setProgress(((index + 1) / products.length) * 100);
    });

    setResults(newResults);
    setIsAnalyzing(false);
  };

  // Toggle exclusion for a product
  const toggleExclusion = (productId: string) => {
    setExcludedIds(prev => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  // Apply recategorization (excluding excluded products)
  const applyMutation = useMutation({
    mutationFn: async () => {
      const changedProducts = results.filter(r => r.changed && !excludedIds.has(r.productId));
      let completed = 0;

      for (const result of changedProducts) {
        // Find the category ID
        const category = categories.find(c => c.slug === result.newCategorySlug);
        if (!category) continue;

        // Update product category
        const { error: updateError } = await supabase
          .from('products')
          .update({ category: result.newCategory })
          .eq('id', result.productId);

        if (updateError) {
          console.error(`Error updating product ${result.productId}:`, updateError);
          continue;
        }

        // Delete existing category links
        await supabase
          .from('product_categories')
          .delete()
          .eq('product_id', result.productId);

        // Insert new category link
        const { error: linkError } = await supabase
          .from('product_categories')
          .insert({
            product_id: result.productId,
            category_id: category.id,
          });

        if (linkError) {
          console.error(`Error linking product ${result.productId} to category:`, linkError);
        }

        completed++;
        setProgress((completed / changedProducts.length) * 100);
      }

      return completed;
    },
    onSuccess: (count) => {
      toast.success(`${count} producten succesvol gehercategoriseerd!`);
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (error) => {
      toast.error('Fout bij hercategoriseren: ' + error.message);
    },
  });

  const changedCount = results.filter(r => r.changed && !excludedIds.has(r.productId)).length;
  const excludedCount = results.filter(r => r.changed && excludedIds.has(r.productId)).length;
  const unchangedCount = results.filter(r => !r.changed).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5" />
          Product Hercategorisatie
        </CardTitle>
        <CardDescription>
          Analyseer en hercategoriseer alle producten naar de nieuwe diersoort-specifieke subcategorieën.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button 
            onClick={analyzeProducts} 
            disabled={isAnalyzing || products.length === 0}
          >
            {isAnalyzing ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Analyseren...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Analyseer {products.length} Producten
              </>
            )}
          </Button>

          {results.length > 0 && changedCount > 0 && (
            <Button 
              onClick={() => applyMutation.mutate()}
              disabled={applyMutation.isPending}
              variant="default"
            >
              {applyMutation.isPending ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Toepassen...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Pas {changedCount} Wijzigingen Toe
                </>
              )}
            </Button>
          )}
        </div>

        {(isAnalyzing || applyMutation.isPending) && (
          <Progress value={progress} className="w-full" />
        )}

        {results.length > 0 && (
          <div className="space-y-4">
            <div className="flex gap-4 flex-wrap items-center">
              <Badge variant="default" className="text-sm">
                <CheckCircle className="mr-1 h-3 w-3" />
                {changedCount} te wijzigen
              </Badge>
              {excludedCount > 0 && (
                <Badge variant="outline" className="text-sm border-destructive text-destructive">
                  <X className="mr-1 h-3 w-3" />
                  {excludedCount} uitgesloten
                </Badge>
              )}
              <Badge variant="secondary" className="text-sm">
                {unchangedCount} ongewijzigd
              </Badge>
              <div className="flex gap-2 items-center text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  High: {results.filter(r => r.changed && !excludedIds.has(r.productId) && r.confidence === 'high').length}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-yellow-500" />
                  Medium: {results.filter(r => r.changed && !excludedIds.has(r.productId) && r.confidence === 'medium').length}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-orange-500" />
                  Low: {results.filter(r => r.changed && !excludedIds.has(r.productId) && r.confidence === 'low').length}
                </span>
              </div>
              {excludedCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setExcludedIds(new Set())}
                  className="text-xs h-6"
                >
                  <RotateCcw className="mr-1 h-3 w-3" />
                  Reset exclusies
                </Button>
              )}
            </div>

            <ScrollArea className="h-[400px] rounded-md border">
              <div className="p-4 space-y-2">
                {results.filter(r => r.changed).slice(0, 100).map((result) => {
                  const isExcluded = excludedIds.has(result.productId);
                  return (
                    <div 
                      key={result.productId}
                      className={`flex items-center gap-2 p-2 rounded-lg text-sm transition-all ${
                        isExcluded 
                          ? 'bg-destructive/10 opacity-60 line-through' 
                          : 'bg-muted/50'
                      }`}
                    >
                      <Checkbox
                        checked={!isExcluded}
                        onCheckedChange={() => toggleExclusion(result.productId)}
                        className="shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{result.productName}</p>
                        <div className="flex items-center gap-2 text-muted-foreground text-xs">
                          <span className="text-destructive">{result.oldCategory || 'Geen'}</span>
                          <ArrowRight className="h-3 w-3" />
                          <span className="text-primary font-medium">{result.newCategory}</span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 items-end">
                        <Badge 
                          variant="outline" 
                          className={`text-xs ${
                            result.confidence === 'high' 
                              ? 'border-green-500 text-green-700 bg-green-50' 
                              : result.confidence === 'medium'
                              ? 'border-yellow-500 text-yellow-700 bg-yellow-50'
                              : 'border-orange-500 text-orange-700 bg-orange-50'
                          }`}
                        >
                          {result.confidence === 'high' ? '✓ High' : result.confidence === 'medium' ? '◐ Medium' : '◯ Low'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">Score: {result.score}</span>
                      </div>
                    </div>
                  );
                })}
                {results.filter(r => r.changed).length > 100 && (
                  <p className="text-center text-muted-foreground text-sm py-2">
                    ... en {results.filter(r => r.changed).length - 100} meer
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        {results.length === 0 && !isAnalyzing && products.length > 0 && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            Klik op "Analyseer" om te beginnen
          </div>
        )}
      </CardContent>
    </Card>
  );
}
