import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Filter, SlidersHorizontal, Loader2, X } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { ProductCard } from '@/components/products/ProductCard';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { EnhancedSearch } from '@/components/search/EnhancedSearch';
import { supabase } from '@/integrations/supabase/client';

const sortOptions = [
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'name', label: 'Name: A-Z' },
];

const Products = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryParam = searchParams.get('category');
  const searchParam = searchParams.get('search');
  
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    categoryParam ? [categoryParam] : []
  );
  const [sortBy, setSortBy] = useState('newest');
  const [searchQuery, setSearchQuery] = useState(searchParam || '');
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 500]);
  const [maxPrice, setMaxPrice] = useState(500);

  // Fetch products from database
  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products_public')
        .select('*')
        .eq('is_active', true)
        .gt('stock', 0)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  // Set max price based on products
  useEffect(() => {
    if (products && products.length > 0) {
      const max = Math.ceil(Math.max(...products.map(p => Number(p.price))));
      setMaxPrice(max);
      setPriceRange([0, max]);
    }
  }, [products]);

  // Update search from URL params
  useEffect(() => {
    if (searchParam) {
      setSearchQuery(searchParam);
    }
  }, [searchParam]);

  // Fetch categories from database
  const { data: categories, isLoading: categoriesLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    let result = [...products];

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(p =>
        p.name?.toLowerCase().includes(query) ||
        (p.description?.toLowerCase().includes(query)) ||
        (p.category?.toLowerCase().includes(query))
      );
    }

    // Filter by price range
    result = result.filter(p => {
      const price = Number(p.price);
      return price >= priceRange[0] && price <= priceRange[1];
    });

    // Filter by category - exact match or partial match
    if (selectedCategories.length > 0) {
      result = result.filter(p => {
        if (!p.category) return false;
        const productCategory = p.category.toLowerCase();
        
        return selectedCategories.some(selected => {
          const selectedLower = selected.toLowerCase();
          // Exact match or partial match
          return productCategory === selectedLower || 
                 productCategory.includes(selectedLower) ||
                 selectedLower.includes(productCategory);
        });
      });
    }

    // Sort
    switch (sortBy) {
      case 'price-asc':
        result.sort((a, b) => Number(a.price) - Number(b.price));
        break;
      case 'price-desc':
        result.sort((a, b) => Number(b.price) - Number(a.price));
        break;
      case 'name':
        result.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        break;
      case 'newest':
      default:
        result.sort((a, b) => 
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        );
    }

    return result;
  }, [products, searchQuery, selectedCategories, sortBy, priceRange]);

  const clearAllFilters = () => {
    setSelectedCategories([]);
    setPriceRange([0, maxPrice]);
    setSearchQuery('');
    setSearchParams({});
  };

  const activeFiltersCount = selectedCategories.length + 
    (priceRange[0] > 0 || priceRange[1] < maxPrice ? 1 : 0) +
    (searchQuery ? 1 : 0);

  const toggleCategory = (categoryName: string) => {
    setSelectedCategories(prev =>
      prev.includes(categoryName)
        ? prev.filter(c => c !== categoryName)
        : [...prev, categoryName]
    );
  };

  const FilterContent = () => (
    <div className="space-y-6">
      {/* Price Range */}
      <div>
        <h3 className="font-semibold mb-3">Price Range</h3>
        <div className="px-2">
          <Slider
            value={priceRange}
            min={0}
            max={maxPrice}
            step={5}
            onValueChange={(value) => setPriceRange(value as [number, number])}
            className="mb-4"
          />
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">€{priceRange[0]}</span>
            <span className="text-muted-foreground">-</span>
            <span className="font-medium">€{priceRange[1]}</span>
          </div>
        </div>
      </div>

      {/* Categories */}
      <div>
        <h3 className="font-semibold mb-3">Categories</h3>
        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
          {categories?.map((category) => (
            <label
              key={category.id}
              className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-2 rounded-lg transition-colors"
            >
              <Checkbox
                checked={selectedCategories.includes(category.name)}
                onCheckedChange={() => toggleCategory(category.name)}
              />
              <span className="text-sm">{category.name}</span>
            </label>
          ))}
        </div>
      </div>

      <Button
        variant="outline"
        className="w-full"
        onClick={clearAllFilters}
      >
        Clear Filters
      </Button>
    </div>
  );

  const isLoading = productsLoading || categoriesLoading;

  return (
    <Layout>
      <div className="container px-4 md:px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">
            {categoryParam || (searchQuery ? `Search: "${searchQuery}"` : 'All Products')}
          </h1>
          <p className="text-muted-foreground">
            {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''} found
          </p>
        </div>

        {/* Active Filters */}
        {activeFiltersCount > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {searchQuery && (
              <Badge variant="secondary" className="gap-1">
                Search: {searchQuery}
                <X 
                  className="w-3 h-3 cursor-pointer" 
                  onClick={() => {
                    setSearchQuery('');
                    setSearchParams({});
                  }} 
                />
              </Badge>
            )}
            {selectedCategories.map(cat => (
              <Badge key={cat} variant="secondary" className="gap-1">
                {cat}
                <X 
                  className="w-3 h-3 cursor-pointer" 
                  onClick={() => toggleCategory(cat)} 
                />
              </Badge>
            ))}
            {(priceRange[0] > 0 || priceRange[1] < maxPrice) && (
              <Badge variant="secondary" className="gap-1">
                €{priceRange[0]} - €{priceRange[1]}
                <X 
                  className="w-3 h-3 cursor-pointer" 
                  onClick={() => setPriceRange([0, maxPrice])} 
                />
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={clearAllFilters}
            >
              Clear All
            </Button>
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Desktop Filters */}
          <aside className="hidden lg:block w-64 shrink-0">
            <div className="sticky top-24">
              <h2 className="font-semibold mb-4 flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4" />
                Filters
                {activeFiltersCount > 0 && (
                  <Badge variant="secondary" className="ml-auto">
                    {activeFiltersCount}
                  </Badge>
                )}
              </h2>
              <FilterContent />
            </div>
          </aside>

          {/* Products Grid */}
          <div className="flex-1">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-4 mb-6">
              {/* Mobile Filter */}
              <Sheet>
                <SheetTrigger asChild className="lg:hidden">
                  <Button variant="outline" size="sm" className="gap-2">
                    <Filter className="w-4 h-4" />
                    Filters
                    {activeFiltersCount > 0 && (
                      <Badge variant="secondary" className="ml-1">
                        {activeFiltersCount}
                      </Badge>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent side="left">
                  <SheetHeader>
                    <SheetTitle>Filters</SheetTitle>
                  </SheetHeader>
                  <div className="mt-6">
                    <FilterContent />
                  </div>
                </SheetContent>
              </Sheet>

              {/* Search */}
              <div className="flex-1 max-w-md">
                <EnhancedSearch
                  variant="navbar"
                  placeholder="Search products..."
                />
              </div>

              {/* Sort */}
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  {sortOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Loading State */}
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            )}

            {/* Products */}
            {!isLoading && filteredProducts.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredProducts.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            )}

            {/* Empty State */}
            {!isLoading && filteredProducts.length === 0 && (
              <div className="text-center py-12">
                <p className="text-lg text-muted-foreground mb-4">
                  {products?.length === 0 
                    ? 'No products yet. Import products via the admin page.'
                    : 'No products found with these filters'}
                </p>
                {products && products.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={clearAllFilters}
                  >
                    Clear All Filters
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Products;
