import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, 
  X, 
  Clock, 
  TrendingUp, 
  ArrowRight, 
  Package, 
  Tag,
  Sparkles
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { trackSearch } from '@/lib/analytics';
import { cn } from '@/lib/utils';

interface Product {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  category: string | null;
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface EnhancedSearchProps {
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  onClose?: () => void;
  variant?: 'default' | 'hero' | 'navbar';
}

const RECENT_SEARCHES_KEY = 'pawsy-recent-searches';
const MAX_RECENT_SEARCHES = 5;

const popularSearches = [
  'Cat tree',
  'Dog bed',
  'Litter box',
  'Scratching post',
  'Dog harness',
];

export const EnhancedSearch = ({
  className,
  placeholder = 'Search products...',
  autoFocus = false,
  onClose,
  variant = 'default',
}: EnhancedSearchProps) => {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const lastTrackedQuery = useRef<string>('');

  // Load recent searches from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (stored) {
      try {
        setRecentSearches(JSON.parse(stored));
      } catch {
        setRecentSearches([]);
      }
    }
  }, []);

  // Load validated categories from canonical registry (not DB)
  useEffect(() => {
    import('@/lib/canonical-category-registry').then(({ getCategoriesForSurface }) => {
      const searchCats = getCategoriesForSurface('search')
        .filter(c => c.parentKey !== null) // Only subcategories for search suggestions
        .slice(0, 6)
        .map(c => ({ id: c.key, name: c.label, slug: c.key }));
      setCategories(searchCats);
    });
  }, []);

  // Save recent search
  const saveRecentSearch = useCallback((term: string) => {
    if (!term.trim()) return;
    
    setRecentSearches(prev => {
      const filtered = prev.filter(s => s.toLowerCase() !== term.toLowerCase());
      const updated = [term, ...filtered].slice(0, MAX_RECENT_SEARCHES);
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Clear recent searches
  const clearRecentSearches = () => {
    setRecentSearches([]);
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  };

  // Fetch suggestions
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (query.trim().length < 2) {
        setSuggestions([]);
        return;
      }

      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('products_public')
          .select('id, name, price, image_url, category, stock')
          .eq('is_active', true)
          .or(`name.ilike.%${query}%,description.ilike.%${query}%,category.ilike.%${query}%`)
          .limit(5);

        if (error) throw error;
        setSuggestions(data || []);

        // Track search
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

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const totalItems = suggestions.length + (query.length >= 2 ? 1 : 0); // +1 for "all results"

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => (prev < totalItems - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : totalItems - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          handleProductSelect(suggestions[selectedIndex]);
        } else if (query.trim()) {
          handleSearch(query);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        inputRef.current?.blur();
        onClose?.();
        break;
    }
  };

  const handleSearch = (term: string) => {
    if (!term.trim()) return;
    saveRecentSearch(term.trim());
    setIsOpen(false);
    setQuery('');
    onClose?.();
    navigate(`/products?search=${encodeURIComponent(term.trim())}`);
  };

  const handleProductSelect = (product: Product) => {
    saveRecentSearch(product.name);
    setIsOpen(false);
    setQuery('');
    onClose?.();
    navigate(`/product/${product.id}`);
  };

  const handleCategorySelect = (category: Category) => {
    setIsOpen(false);
    setQuery('');
    onClose?.();
    navigate(`/collections/${category.slug}`);
  };

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const showDropdown = isOpen && (query.length > 0 || recentSearches.length > 0 || categories.length > 0);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedIndex(-1);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className={cn(
            'pl-12 pr-10 h-12 rounded-full border-2 transition-all duration-200',
            variant === 'hero' && 'h-14 text-lg shadow-soft',
            variant === 'navbar' && 'h-10',
            isOpen && 'ring-2 ring-primary/20 border-primary'
          )}
        />
        {query && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full hover:bg-muted"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Dropdown */}
      <AnimatePresence>
        {showDropdown && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 right-0 mt-2 bg-background border-2 border-border rounded-2xl shadow-lg overflow-hidden z-50 max-h-[70vh] overflow-y-auto"
          >
            {/* Loading */}
            {isLoading && query.length >= 2 && (
              <div className="p-4 flex items-center justify-center gap-2 text-muted-foreground">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Searching...</span>
              </div>
            )}

            {/* Product Suggestions */}
            {!isLoading && suggestions.length > 0 && (
              <div className="divide-y divide-border">
                {suggestions.map((product, index) => (
                  <motion.button
                    key={product.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.03 }}
                    onClick={() => handleProductSelect(product)}
                    className={cn(
                      'w-full flex items-center gap-4 p-3 hover:bg-muted/50 transition-colors text-left',
                      selectedIndex === index && 'bg-muted'
                    )}
                  >
                    <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Package className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {highlightMatch(product.name, query)}
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
                    <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 flex-shrink-0" />
                  </motion.button>
                ))}

                {/* View all results */}
                <button
                  onClick={() => handleSearch(query)}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 p-3 text-sm text-primary hover:bg-primary/5 transition-colors font-medium',
                    selectedIndex === suggestions.length && 'bg-primary/10'
                  )}
                >
                  <Search className="w-4 h-4" />
                  All results for "{query}"
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* No results */}
            {!isLoading && query.length >= 2 && suggestions.length === 0 && (
              <div className="p-6 text-center">
                <Package className="w-10 h-10 mx-auto mb-2 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground mb-3">
                  No products found for "{query}"
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setQuery('');
                    setIsOpen(false);
                    onClose?.();
                    navigate('/products');
                  }}
                >
                  View all products
                </Button>
              </div>
            )}

            {/* Recent Searches & Popular */}
            {query.length < 2 && (
              <div className="p-4 space-y-4">
                {/* Recent Searches */}
                {recentSearches.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Clock className="w-4 h-4" />
                        Recent searches
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs text-muted-foreground hover:text-foreground"
                        onClick={clearRecentSearches}
                      >
                        Clear
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {recentSearches.map((term, index) => (
                        <Badge
                          key={index}
                          variant="secondary"
                          className="cursor-pointer hover:bg-secondary/80 transition-colors"
                          onClick={() => handleSearch(term)}
                        >
                          {term}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Popular Searches */}
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
                    <TrendingUp className="w-4 h-4" />
                    Popular searches
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {popularSearches.map((term, index) => (
                      <Badge
                        key={index}
                        variant="outline"
                        className="cursor-pointer hover:bg-muted transition-colors"
                        onClick={() => handleSearch(term)}
                      >
                        <Sparkles className="w-3 h-3 mr-1" />
                        {term}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Quick Category Links */}
                {categories.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
                      <Tag className="w-4 h-4" />
                      Categories
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {categories.slice(0, 6).map((category) => (
                        <button
                          key={category.id}
                          onClick={() => handleCategorySelect(category)}
                          className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors text-left text-sm"
                        >
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Tag className="w-4 h-4 text-primary" />
                          </div>
                          <span className="truncate">{category.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Helper to highlight matching text
function highlightMatch(text: string, query: string) {
  if (!query.trim()) return text;
  
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <span key={i} className="bg-primary/20 text-primary font-semibold">
            {part}
          </span>
        ) : (
          part
        )
      )}
    </>
  );
}
