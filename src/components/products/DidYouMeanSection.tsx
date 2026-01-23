import { useMemo, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Search, Sparkles, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  trackDidYouMeanImpression,
  trackDidYouMeanCategoryClick,
  trackDidYouMeanProductClick,
  trackDidYouMeanViewAllClick
} from '@/lib/analytics';
import { findBestMatches, expandQueryWithSynonyms, hasFuzzyMatch } from '@/lib/fuzzy-search';

interface Category {
  id: string;
  name: string;
  slug: string;
  image_url?: string | null;
}

interface Product {
  id: string | null;
  name: string | null;
  price: number | null;
  image_url: string | null;
  category?: string | null;
}

interface DidYouMeanSectionProps {
  searchQuery: string;
  categories: Category[];
  products: Product[];
  resultsCount: number;
}

export const DidYouMeanSection = ({ 
  searchQuery, 
  categories, 
  products,
  resultsCount 
}: DidYouMeanSectionProps) => {
  const hasTrackedImpression = useRef(false);

  // Find matching categories using fuzzy search with synonyms
  const suggestedCategories = useMemo(() => {
    if (!searchQuery || !categories) return [];
    
    // Use fuzzy matching with synonyms for better results
    const matches = findBestMatches(
      categories,
      searchQuery,
      (cat) => `${cat.name} ${cat.slug}`,
      4
    );
    
    // If no fuzzy matches, fall back to simple includes check
    if (matches.length === 0) {
      const queryWords = searchQuery.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      const expandedTerms = expandQueryWithSynonyms(searchQuery);
      
      return categories
        .filter(cat => {
          const catText = `${cat.name} ${cat.slug}`.toLowerCase();
          return expandedTerms.some(term => catText.includes(term)) ||
                 hasFuzzyMatch(catText, queryWords, 0.7);
        })
        .slice(0, 4);
    }
    
    return matches;
  }, [searchQuery, categories]);

  // Get relevant products using fuzzy search with synonyms
  const suggestedProducts = useMemo(() => {
    if (!searchQuery || !products) return [];
    
    // Use advanced fuzzy matching with synonyms
    const matches = findBestMatches(
      products.filter(p => p.id && p.name), // Only include valid products
      searchQuery,
      (p) => `${p.name || ''} ${p.category || ''}`,
      6
    );
    
    // If no fuzzy matches, try with expanded synonyms
    if (matches.length === 0) {
      const expandedTerms = expandQueryWithSynonyms(searchQuery);
      const queryWords = searchQuery.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      
      const synonymMatches = products.filter(p => {
        if (!p.name) return false;
        const productText = `${p.name} ${p.category || ''}`.toLowerCase();
        return expandedTerms.some(term => productText.includes(term)) ||
               hasFuzzyMatch(productText, queryWords, 0.65);
      });
      
      if (synonymMatches.length > 0) {
        return synonymMatches.slice(0, 6);
      }
    }
    
    // If still no matches and no results, show popular products
    if (matches.length === 0 && resultsCount === 0) {
      return products.filter(p => p.id && p.name).slice(0, 6);
    }
    
    return matches;
  }, [searchQuery, products, resultsCount]);

  // Track impression when section becomes visible
  useEffect(() => {
    if (!hasTrackedImpression.current && 
        (suggestedCategories.length > 0 || suggestedProducts.length > 0) &&
        (resultsCount <= 10)) {
      trackDidYouMeanImpression(
        searchQuery,
        resultsCount,
        suggestedCategories.map(c => c.name),
        suggestedProducts.length
      );
      hasTrackedImpression.current = true;
    }
  }, [searchQuery, resultsCount, suggestedCategories, suggestedProducts]);

  // Don't show if there are many results or no suggestions
  if (resultsCount > 10 || (suggestedCategories.length === 0 && suggestedProducts.length === 0)) {
    return null;
  }

  const handleCategoryClick = (category: Category) => {
    trackDidYouMeanCategoryClick(
      searchQuery,
      category.name,
      category.slug,
      resultsCount
    );
  };

  const handleProductClick = (product: Product, index: number) => {
    if (product.id && product.name) {
      trackDidYouMeanProductClick(
        searchQuery,
        product.id,
        product.name,
        Number(product.price) || 0,
        index,
        resultsCount
      );
    }
  };

  const handleViewAllClick = () => {
    trackDidYouMeanViewAllClick(searchQuery, resultsCount);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-8 p-4 md:p-6 bg-gradient-to-r from-primary/5 via-primary/10 to-secondary/5 rounded-2xl border border-primary/10"
    >
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 bg-primary/10 rounded-full">
          <Sparkles className="w-4 h-4 text-primary" />
        </div>
        <h2 className="font-semibold text-lg">
          {resultsCount === 0 ? 'Did you mean...' : 'Related suggestions'}
        </h2>
      </div>
      
      {resultsCount === 0 && (
        <p className="text-muted-foreground text-sm mb-4">
          We couldn't find exact results for "{searchQuery}". 
          Check out these alternatives:
        </p>
      )}

      {/* Suggested Categories */}
      {suggestedCategories.length > 0 && (
        <div className="mb-4">
          <p className="text-sm font-medium mb-2 text-muted-foreground">Categories:</p>
          <div className="flex flex-wrap gap-2">
            {suggestedCategories.map((cat) => (
              <Link 
                key={cat.id} 
                to={`/products?category=${cat.slug}`}
                onClick={() => handleCategoryClick(cat)}
              >
                <Badge 
                  variant="secondary" 
                  className="hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer px-3 py-1.5"
                >
                  {cat.name}
                  <ArrowRight className="w-3 h-3 ml-1" />
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Suggested Products */}
      {suggestedProducts.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-3 text-muted-foreground">Popular products:</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {suggestedProducts.map((product, index) => (
              <Link 
                key={product.id} 
                to={`/product/${product.id}`}
                className="group"
                onClick={() => handleProductClick(product, index)}
              >
                <Card className="overflow-hidden hover:shadow-md transition-shadow border-primary/5 hover:border-primary/20">
                  <CardContent className="p-2">
                    <div className="aspect-square rounded-lg overflow-hidden bg-muted mb-2">
                      <img
                        src={product.image_url || '/placeholder.svg'}
                        alt={product.name || 'Product'}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                    <p className="text-xs font-medium line-clamp-2 group-hover:text-primary transition-colors">
                      {product.name}
                    </p>
                    <p className="text-xs text-primary font-semibold mt-1">
                      ${Number(product.price).toFixed(2)}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Clear search suggestion */}
      {resultsCount === 0 && (
        <div className="mt-4 pt-4 border-t border-primary/10">
          <Link to="/products" onClick={handleViewAllClick}>
            <Button variant="outline" size="sm" className="gap-2">
              <Search className="w-4 h-4" />
              View all products
            </Button>
          </Link>
        </div>
      )}
    </motion.div>
  );
};
