import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, Sparkles, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

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
  // Find matching categories based on search query
  const suggestedCategories = useMemo(() => {
    if (!searchQuery || !categories) return [];
    
    const queryWords = searchQuery.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    
    return categories
      .filter(cat => {
        const catName = cat.name.toLowerCase();
        const catSlug = cat.slug.toLowerCase();
        return queryWords.some(word => 
          catName.includes(word) || catSlug.includes(word) ||
          word.includes(catName.split(' ')[0]) || word.includes(catSlug.split('-')[0])
        );
      })
      .slice(0, 4);
  }, [searchQuery, categories]);

  // Get popular products that might be relevant
  const suggestedProducts = useMemo(() => {
    if (!searchQuery || !products) return [];
    
    const queryWords = searchQuery.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    
    // First try exact matches in product name
    let matches = products.filter(p => {
      const name = p.name?.toLowerCase() || '';
      return queryWords.some(word => name.includes(word));
    });
    
    // If no matches, try category matches
    if (matches.length === 0) {
      matches = products.filter(p => {
        const category = p.category?.toLowerCase() || '';
        return queryWords.some(word => category.includes(word));
      });
    }
    
    // If still no matches and no results, show some popular products
    if (matches.length === 0 && resultsCount === 0) {
      matches = products.slice(0, 6);
    }
    
    return matches.slice(0, 6);
  }, [searchQuery, products, resultsCount]);

  // Don't show if there are many results or no suggestions
  if (resultsCount > 10 || (suggestedCategories.length === 0 && suggestedProducts.length === 0)) {
    return null;
  }

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
          {resultsCount === 0 ? 'Bedoelde je misschien...' : 'Gerelateerde suggesties'}
        </h2>
      </div>
      
      {resultsCount === 0 && (
        <p className="text-muted-foreground text-sm mb-4">
          We konden geen exacte resultaten vinden voor "{searchQuery}". 
          Bekijk deze alternatieven:
        </p>
      )}

      {/* Suggested Categories */}
      {suggestedCategories.length > 0 && (
        <div className="mb-4">
          <p className="text-sm font-medium mb-2 text-muted-foreground">Categorieën:</p>
          <div className="flex flex-wrap gap-2">
            {suggestedCategories.map((cat) => (
              <Link key={cat.id} to={`/products?category=${cat.slug}`}>
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
          <p className="text-sm font-medium mb-3 text-muted-foreground">Populaire producten:</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {suggestedProducts.map((product) => (
              <Link 
                key={product.id} 
                to={`/product/${product.id}`}
                className="group"
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
                      €{Number(product.price).toFixed(2)}
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
          <Link to="/products">
            <Button variant="outline" size="sm" className="gap-2">
              <Search className="w-4 h-4" />
              Bekijk alle producten
            </Button>
          </Link>
        </div>
      )}
    </motion.div>
  );
};
