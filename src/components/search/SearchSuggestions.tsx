import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ArrowRight, Package } from 'lucide-react';
// ⚡ supabase NOT imported at top-level — dynamic import keeps ~138KB off critical path
const getSupabase = () => import('@/integrations/supabase/client').then(m => m.supabase);
import { trackSearch } from '@/lib/analytics';
import { buildOptimizedImageUrl } from '@/lib/image-optimizer';

interface Product {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  category: string | null;
}

interface SearchSuggestionsProps {
  query: string;
  onSelect: () => void;
  isVisible: boolean;
}

export const SearchSuggestions = ({ query, onSelect, isVisible }: SearchSuggestionsProps) => {
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const lastTrackedQuery = useRef<string>('');

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (query.trim().length < 2) {
        setSuggestions([]);
        return;
      }

      setIsLoading(true);
      try {
        const supabase = await getSupabase();
        const { data, error } = await supabase
          .from('products_public')
          .select('id, name, price, image_url, category, stock')
          .eq('is_active', true)
          .or(`name.ilike.%${query}%,description.ilike.%${query}%,category.ilike.%${query}%`)
          .limit(5);

        if (error) throw error;
        setSuggestions(data || []);
        
        // Track search after debounce (only once per unique query)
        if (query.trim().length >= 3 && query !== lastTrackedQuery.current) {
          trackSearch(query.trim());
          lastTrackedQuery.current = query;
        }
      } catch (error) {
        console.error('Error fetching suggestions:', error);
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    };

    const debounceTimer = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(debounceTimer);
  }, [query]);

  if (!isVisible || query.trim().length < 2) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="absolute top-full left-0 right-0 mt-2 bg-background border border-border rounded-2xl shadow-lg overflow-hidden z-50"
      >
        {isLoading ? (
          <div className="p-4 flex items-center justify-center gap-2 text-muted-foreground">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Searching...</span>
          </div>
        ) : suggestions.length > 0 ? (
          <div className="divide-y divide-border">
            {suggestions.map((product, index) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Link
                  to={`/products/${product.id}`}
                  onClick={onSelect}
                  className="flex items-center gap-4 p-3 hover:bg-muted/50 transition-colors group"
                >
                  <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                    {product.image_url ? (
                      <img
                        src={buildOptimizedImageUrl(product.image_url, { w: 96, q: 'auto' })}
                        alt={product.name}
                        width={48}
                        height={48}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <Package className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                      {product.name}
                    </p>
                    {product.category && (
                      <p className="text-xs text-muted-foreground">{product.category}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-semibold text-sm text-primary">
                      ${product.price.toFixed(2)}
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </Link>
              </motion.div>
            ))}
            
            {/* View all results link */}
            <Link
              to={`/products?search=${encodeURIComponent(query)}`}
              onClick={onSelect}
              className="flex items-center justify-center gap-2 p-3 text-sm text-primary hover:bg-primary/5 transition-colors font-medium"
            >
              <Search className="w-4 h-4" />
              All results for "{query}"
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <div className="p-6 text-center">
            <Package className="w-10 h-10 mx-auto mb-2 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              No products found for "{query}"
            </p>
            <Link
              to="/products"
              onClick={onSelect}
              className="inline-flex items-center gap-1 mt-2 text-sm text-primary hover:underline"
            >
              View all products
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};
