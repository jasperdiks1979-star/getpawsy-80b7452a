import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import { Filter, SlidersHorizontal, Loader2, X, Eye, Clock, Home } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { ProductCard, Product } from '@/components/products/ProductCard';
import { ProductGridSkeleton } from '@/components/products/ProductCardSkeleton';
import { QuickViewModal } from '@/components/products/QuickViewModal';
import { SubcategoryGrid } from '@/components/products/SubcategoryGrid';
import { CategoryEmptyState } from '@/components/products/CategoryEmptyState';
import { DidYouMeanSection } from '@/components/products/DidYouMeanSection';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { EnhancedSearch } from '@/components/search/EnhancedSearch';
import { CategoryFilter } from '@/components/products/CategoryFilter';
import { supabase } from '@/integrations/supabase/client';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed';
import { useProductRatings } from '@/hooks/useProductRatings';
import { CategorySchema } from '@/components/seo/CategorySchema';
import { generateCategoryMetaDescription, getKeywordsForCategory } from '@/lib/seo-keywords';
import { trackViewItemList } from '@/lib/analytics';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
const sortOptions = [
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'name', label: 'Name: A-Z' },
];

const Products = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const categoryParam = searchParams.get('category');
  const searchParam = searchParams.get('search');
  
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    categoryParam ? [categoryParam] : []
  );
  const [sortBy, setSortBy] = useState('newest');
  const [searchQuery, setSearchQuery] = useState(searchParam || '');
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 500]);
  const [maxPrice, setMaxPrice] = useState(500);
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const { getRecentlyViewedIds } = useRecentlyViewed();
  const recentlyViewedIds = getRecentlyViewedIds();
  const hasTrackedImpressions = useRef(false);

  // Helper function to convert display name to slug
  // IMPORTANT: This must match exactly how category slugs are stored in database
  const toSlug = (str: string): string => {
    return str
      .toLowerCase()
      .trim()
      .replace(/&/g, '') // Remove ampersand entirely to match database slugs
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  };
  
  // Normalize category for comparison - handles both "Dog Collars & Leashes" and "dog-collars-leashes"
  // Also handles spaces vs hyphens and case differences
  const normalizeCategory = (str: string): string => {
    return str
      .toLowerCase()
      .replace(/&/g, 'and')     // Normalize ampersand to 'and'
      .replace(/\s+/g, '-')     // Convert spaces to hyphens
      .replace(/[^\w-]/g, '')   // Remove other special chars
      .replace(/-+/g, '-')      // Collapse multiple hyphens
      .replace(/^-|-$/g, '');   // Remove leading/trailing hyphens
  };

  // Alternative normalization that removes 'and' for matching variations
  const normalizeCategoryAlt = (str: string): string => {
    return str
      .toLowerCase()
      .replace(/&/g, '')        // Remove ampersand
      .replace(/\band\b/g, '')  // Remove word 'and'
      .replace(/\s+/g, '-')     // Convert spaces to hyphens
      .replace(/[^\w-]/g, '')   // Remove other special chars
      .replace(/-+/g, '-')      // Collapse multiple hyphens
      .replace(/^-|-$/g, '');   // Remove leading/trailing hyphens
  };

  // Check if category param needs redirect to slug format
  // Redirect URLs with spaces/special chars to SEO-friendly slug format
  useEffect(() => {
    if (categoryParam) {
      const slug = toSlug(categoryParam);
      // If the category contains spaces, uppercase, or special chars, redirect to slug version
      if (categoryParam !== slug && categoryParam.includes(' ') || categoryParam !== categoryParam.toLowerCase()) {
        const newParams = new URLSearchParams(searchParams);
        newParams.set('category', slug);
        navigate(`/products?${newParams.toString()}`, { replace: true });
      }
    }
  }, [categoryParam, navigate, searchParams]);

  // Fetch products from database
  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products_public')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      // DROPSHIPPING MODEL: stock=0 does NOT mean out of stock
      // Only is_active=false marks a product as unavailable
      return data;
    },
  });

  // Get all product IDs for ratings query
  const productIds = useMemo(() => products?.map(p => p.id).filter((id): id is string => !!id) || [], [products]);
  
  // Fetch ratings for all products
  const { data: ratingsMap } = useProductRatings(productIds);

  // Set max price based on products
  useEffect(() => {
    if (products && products.length > 0) {
      const max = Math.ceil(Math.max(...products.map(p => Number(p.price))));
      setMaxPrice(max);
      setPriceRange([0, max]);
    }
  }, [products]);

  // Track previous category to detect navigation
  const prevCategoryRef = useRef<string | null>(null);
  
  // Sync category filter with URL params and reset other filters on category change
  useEffect(() => {
    if (categoryParam) {
      // If navigating to a NEW category, reset price and search filters
      if (prevCategoryRef.current !== null && prevCategoryRef.current !== categoryParam) {
        setPriceRange([0, maxPrice]);
        setSearchQuery('');
        console.log('[Category Navigation] Reset filters - navigated from', prevCategoryRef.current, 'to', categoryParam);
      }
      setSelectedCategories([categoryParam]);
    } else {
      // Only clear if we had a category param before and now it's gone
      setSelectedCategories([]);
    }
    prevCategoryRef.current = categoryParam;
  }, [categoryParam, maxPrice]);

  // Update search from URL params
  useEffect(() => {
    if (searchParam) {
      setSearchQuery(searchParam);
    } else {
      setSearchQuery('');
    }
  }, [searchParam]);

  // Fetch categories from database with parent info
  const { data: categories, isLoading: categoriesLoading } = useQuery({
    queryKey: ['categories-with-parents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, slug, parent_id, image_url')
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  // Calculate product counts per category
  const productCounts = useMemo(() => {
    if (!products) return {};
    const counts: Record<string, number> = {};
    
    products.forEach((product) => {
      if (product.category) {
        // Match by category name
        const category = categories?.find(
          (c) => c.name.toLowerCase() === product.category?.toLowerCase() ||
                 c.slug === product.category?.toLowerCase()
        );
        if (category) {
          counts[category.name] = (counts[category.name] || 0) + 1;
        }
      }
    });
    
    return counts;
  }, [products, categories]);

  // Fetch recently viewed products
  const { data: recentlyViewedProducts } = useQuery({
    queryKey: ['recently-viewed-products', recentlyViewedIds],
    queryFn: async () => {
      if (recentlyViewedIds.length === 0) return [];
      
      const { data, error } = await supabase
        .from('products_public')
        .select('*')
        .eq('is_active', true)
        .in('id', recentlyViewedIds);
      
      if (error) throw error;
      
      // Sort by the order in recentlyViewedIds
      return data?.sort((a, b) => 
        recentlyViewedIds.indexOf(a.id!) - recentlyViewedIds.indexOf(b.id!)
      ) || [];
    },
    enabled: recentlyViewedIds.length > 0,
  });

  // Fetch bestsellers for empty state fallback
  const { data: bestsellers } = useQuery({
    queryKey: ['bestsellers-products-fallback'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bestsellers')
        .select(`
          id,
          rank,
          product:products!bestsellers_product_id_fkey (
            id,
            name,
            slug,
            price,
            compare_at_price,
            image_url,
            images,
            category,
            is_active,
            stock
          )
        `)
        .eq('is_active', true)
        .order('rank', { ascending: true })
        .limit(8);
      
      if (error) throw error;
      
      // Extract and filter active products
      return data
        ?.map(b => b.product)
        .filter((p): p is NonNullable<typeof p> => p !== null && p.is_active === true)
        || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Build a map of category slugs to ALL their descendant slugs (recursive)
  // CRITICAL: This map MUST include the actual category NAMES that products use
  // Products are assigned categories like "Hamster Cages" (name), not "hamster-cages" (slug)
  const categoryToDescendants = useMemo(() => {
    if (!categories) return {};
    const map: Record<string, Set<string>> = {};
    
    // Helper function to recursively collect all descendant category identifiers
    // Returns both names and slugs for flexible matching
    const collectDescendants = (categoryId: string): Set<string> => {
      const directChildren = categories.filter(c => c.parent_id === categoryId);
      const descendants = new Set<string>();
      
      directChildren.forEach(child => {
        // Add both slug and name (in various formats for matching)
        descendants.add(child.slug);
        descendants.add(child.slug.toLowerCase());
        descendants.add(child.name);
        descendants.add(child.name.toLowerCase());
        
        // Recursively get grandchildren and their variations
        const grandchildren = collectDescendants(child.id);
        grandchildren.forEach(gc => descendants.add(gc));
      });
      
      return descendants;
    };
    
    // Build map for all categories (not just parents)
    categories.forEach(category => {
      const descendants = collectDescendants(category.id);
      if (descendants.size > 0) {
        // Store as Set for O(1) lookups, keyed by multiple formats
        map[category.slug] = descendants;
        map[category.slug.toLowerCase()] = descendants;
        map[category.name] = descendants;
        map[category.name.toLowerCase()] = descendants;
      }
    });
    
    return map;
  }, [categories]);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    let result = [...products];

    // Filter by search - use multi-word matching (OR logic)
    // This allows long search queries like "car dog bed rear seat" to find products
    // that match ANY of the significant words (length > 2)
    if (searchQuery) {
      const query = searchQuery.toLowerCase().trim();
      
      // Split into words and filter out common stopwords and short words
      const stopwords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'for', 'with', 'in', 'on', 'at', 'to', 'of', 'is', 'are', 'was', 'pet', 'pets']);
      const searchWords = query
        .split(/\s+/)
        .filter(word => word.length > 2 && !stopwords.has(word));
      
      if (searchWords.length > 0) {
        result = result.filter(p => {
          const name = p.name?.toLowerCase() || '';
          const description = p.description?.toLowerCase() || '';
          const category = p.category?.toLowerCase() || '';
          const combinedText = `${name} ${description} ${category}`;
          
          // Score each product by how many search words it matches
          const matchCount = searchWords.filter(word => combinedText.includes(word)).length;
          
          // Require at least 1 word match, or 2 if many search words
          const minMatches = searchWords.length >= 4 ? 2 : 1;
          return matchCount >= minMatches;
        });
        
        // Sort by match relevance (more matches = higher)
        result.sort((a, b) => {
          const aText = `${a.name?.toLowerCase() || ''} ${a.description?.toLowerCase() || ''} ${a.category?.toLowerCase() || ''}`;
          const bText = `${b.name?.toLowerCase() || ''} ${b.description?.toLowerCase() || ''} ${b.category?.toLowerCase() || ''}`;
          
          const aMatches = searchWords.filter(word => aText.includes(word)).length;
          const bMatches = searchWords.filter(word => bText.includes(word)).length;
          
          return bMatches - aMatches;
        });
      }
    }

    // Filter by price range
    result = result.filter(p => {
      const price = Number(p.price);
      return price >= priceRange[0] && price <= priceRange[1];
    });

    // Filter by category - match against both name and slug formats
    // Also include products from subcategories when a parent category is selected
    // Uses flexible matching: case-insensitive, hyphen/space normalized
    if (selectedCategories.length > 0) {
      const matchedProductIds: string[] = []; // For logging
      
      result = result.filter(p => {
        if (!p.category) return false;
        
        // Normalize the product's category for consistent matching (both methods)
        const productCategoryNormalized = normalizeCategory(p.category);
        const productCategoryAlt = normalizeCategoryAlt(p.category);
        
        const matches = selectedCategories.some(selected => {
          // Normalize the selected filter (both methods)
          const selectedNormalized = normalizeCategory(selected);
          const selectedAlt = normalizeCategoryAlt(selected);
          
          // Direct match using either normalization method
          if (productCategoryNormalized === selectedNormalized ||
              productCategoryAlt === selectedAlt ||
              productCategoryNormalized === selectedAlt ||
              productCategoryAlt === selectedNormalized) {
            return true;
          }
          
          // Check if selected is a parent category - if so, include products from its subcategories
          const selectedSlug = toSlug(selected);
          const subcategorySet = categoryToDescendants[selectedSlug] || 
                                   categoryToDescendants[selected.toLowerCase()] || 
                                   categoryToDescendants[selectedNormalized] ||
                                   null;
          if (subcategorySet && subcategorySet.size > 0) {
            // Check if product's category matches any subcategory (direct set lookup)
            if (subcategorySet.has(p.category) || 
                subcategorySet.has(p.category.toLowerCase()) ||
                subcategorySet.has(productCategoryNormalized) ||
                subcategorySet.has(productCategoryAlt)) {
              return true;
            }
            
            // Also check with normalized versions in case of edge cases
            return Array.from(subcategorySet).some(subCat => {
              const subNormalized = normalizeCategory(subCat);
              const subAlt = normalizeCategoryAlt(subCat);
              return productCategoryNormalized === subNormalized || productCategoryAlt === subAlt;
            });
          }
          
          return false;
        });
        
        if (matches && p.id) {
          matchedProductIds.push(p.id);
        }
        
        return matches;
      });
      
      // Temporary logging for debugging
      console.log('[Category Filter Debug]', {
        categorySlug: selectedCategories[0],
        matchedCount: matchedProductIds.length,
        matchedIds: matchedProductIds.slice(0, 5), // First 5 for brevity
        totalProducts: products?.length,
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
  }, [products, searchQuery, selectedCategories, sortBy, priceRange, categoryToDescendants]);

  // Infinite scroll
  const {
    visibleItems,
    hasMore,
    isLoading: isLoadingMore,
    loaderRef,
    displayCount,
    totalCount,
  } = useInfiniteScroll({
    items: filteredProducts,
    itemsPerPage: 12,
  });

  // Track product impressions for GA4 enhanced ecommerce
  useEffect(() => {
    if (visibleItems.length > 0 && !hasTrackedImpressions.current) {
      const listId = categoryParam 
        ? `products_${categoryParam.toLowerCase().replace(/\s+/g, '_')}` 
        : searchQuery 
          ? `products_search_${searchQuery.toLowerCase().replace(/\s+/g, '_')}` 
          : 'all_products';
      
      const listName = categoryParam 
        ? `Products - ${categoryParam}` 
        : searchQuery 
          ? `Products - Search: ${searchQuery}` 
          : 'All Products';
      
      trackViewItemList(
        listId,
        listName,
        visibleItems.map((product, index) => ({
          id: product.id || '',
          name: product.name || '',
          price: Number(product.price) || 0,
          category: product.category || undefined,
          position: index,
        }))
      );
      hasTrackedImpressions.current = true;
    }
  }, [visibleItems, categoryParam, searchQuery]);

  // Reset tracking when filters change
  useEffect(() => {
    hasTrackedImpressions.current = false;
  }, [selectedCategories, searchQuery, priceRange]);

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
    // Convert to slug format for URL consistency
    const categorySlug = toSlug(categoryName);
    setSelectedCategories(prev =>
      prev.some(c => toSlug(c) === categorySlug)
        ? prev.filter(c => toSlug(c) !== categorySlug)
        : [...prev, categorySlug]
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
            <span className="font-medium">${priceRange[0]}</span>
            <span className="text-muted-foreground">-</span>
            <span className="font-medium">${priceRange[1]}</span>
          </div>
        </div>
      </div>

      {/* Categories with Subcategories */}
      <div>
        <h3 className="font-semibold mb-3">Categories</h3>
        {categories && (
          <CategoryFilter
            categories={categories}
            selectedCategories={selectedCategories}
            onToggleCategory={toggleCategory}
            onClearCategories={() => setSelectedCategories([])}
            productCounts={productCounts}
          />
        )}
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

  // Convert slug to display name (e.g., "dog-beds" -> "Dog Beds")
  const getCategoryDisplayName = (slug: string): string => {
    // Try to find the category in the database first
    const category = categories?.find(c => c.slug === slug || c.name.toLowerCase() === slug.toLowerCase());
    if (category) return category.name;
    // Fallback: convert slug format to title case
    return slug.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const categoryDisplayName = categoryParam ? getCategoryDisplayName(categoryParam) : null;

  // Generate dynamic SEO content
  const pageTitle = categoryDisplayName 
    ? `${categoryDisplayName} - Premium Pet Products | GetPawsy`
    : searchQuery 
      ? `Search: "${searchQuery}" | GetPawsy Pet Store`
      : 'All Products - Premium Pet Supplies | GetPawsy';

  const metaDescription = categoryDisplayName
    ? generateCategoryMetaDescription(categoryDisplayName)
    : searchQuery
      ? `Find "${searchQuery}" at GetPawsy. Browse our collection of premium pet products. Free US shipping on orders over $35. Quality supplies for dogs, cats & more.`
      : 'Shop premium pet products at GetPawsy. Quality supplies for dogs, cats & more. From cozy beds to durable toys, we have everything your furry friend needs. Free US shipping over $35!';

  const metaKeywords = categoryDisplayName
    ? getKeywordsForCategory(categoryDisplayName).slice(0, 15).join(', ')
    : 'pet supplies, dog products, cat products, pet accessories, premium pet store, GetPawsy, pet shop online';

  return (
    <Layout>
      {/* CategorySchema handles canonical URL, structured data, and noindex for search pages */}
      <CategorySchema 
        categoryName={categoryDisplayName || undefined}
        searchQuery={searchQuery || undefined}
        productCount={totalCount}
        products={visibleItems.slice(0, 10).map(p => ({
          id: p.id,
          name: p.name || '',
          slug: p.slug,
          price: Number(p.price),
          image_url: p.image_url,
        }))}
      />
      {/* Additional meta tags not in CategorySchema */}
      <Helmet>
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:type" content="website" />
      </Helmet>
      <div className="container px-4 md:px-6 py-8">
        {/* Breadcrumbs */}
        <Breadcrumb className="mb-6">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/" className="flex items-center gap-1">
                  <Home className="h-3.5 w-3.5" />
                  <span className="sr-only sm:not-sr-only">Home</span>
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            {categoryDisplayName ? (
              <>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link to="/products">Products</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{categoryDisplayName}</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            ) : searchQuery ? (
              <>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link to="/products">Products</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Search: "{searchQuery}"</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            ) : (
              <BreadcrumbItem>
                <BreadcrumbPage>All Products</BreadcrumbPage>
              </BreadcrumbItem>
            )}
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">
            {categoryDisplayName || (searchQuery ? `Search: "${searchQuery}"` : 'All Products')}
          </h1>
          <p className="text-muted-foreground">
            Showing {displayCount > totalCount ? totalCount : displayCount} of {totalCount} product{totalCount !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Subcategory Grid - Show when viewing a parent category */}
        {categoryParam && categories && (() => {
          // Find the current category
          const currentCategory = categories.find(c => 
            c.slug === categoryParam || c.name.toLowerCase() === categoryParam.toLowerCase()
          );
          
          // If it's a parent category (no parent_id), show its subcategories
          if (currentCategory && !currentCategory.parent_id) {
            const subcategories = categories
              .filter(c => c.parent_id === currentCategory.id)
              .map(c => ({
                ...c,
                productCount: productCounts[c.name] || 0
              }))
              .sort((a, b) => (b.productCount || 0) - (a.productCount || 0));
            
            if (subcategories.length > 0) {
              return (
                <SubcategoryGrid 
                  subcategories={subcategories} 
                  parentCategoryName={currentCategory.name} 
                />
              );
            }
          }
          return null;
        })()}

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
                ${priceRange[0]} - ${priceRange[1]}
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

        {/* Did You Mean Section - Shows when search param is present */}
        {searchParam && categories && products && (
          <DidYouMeanSection
            searchQuery={searchQuery}
            categories={categories}
            products={products as any}
            resultsCount={totalCount}
          />
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
            {isLoading && <ProductGridSkeleton count={12} />}

            {/* Products */}
            {!isLoading && visibleItems.length > 0 && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                  {visibleItems.map((product, index) => {
                    const listId = categoryParam 
                      ? `products_${categoryParam.toLowerCase().replace(/\s+/g, '_')}` 
                      : searchQuery 
                        ? `products_search` 
                        : 'all_products';
                    const listName = categoryParam 
                      ? `Products - ${categoryParam}` 
                      : searchQuery 
                        ? `Products - Search: ${searchQuery}` 
                        : 'All Products';
                    
                    const productRating = product.id ? ratingsMap?.[product.id] : undefined;
                    
                    return (
                      <div
                        key={product.id}
                        className="relative group"
                      >
                        <ProductCard 
                          product={product as Product} 
                          listId={listId}
                          listName={listName}
                          position={index}
                          rating={productRating?.averageRating}
                          reviewCount={productRating?.reviewCount}
                        />
                      {/* Quick View Button */}
                      <Button
                        variant="secondary"
                        size="sm"
                        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity rounded-full gap-1.5 z-10 shadow-lg"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setQuickViewProduct(product as Product);
                        }}
                      >
                        <Eye className="w-4 h-4" />
                        Quick View
                      </Button>
                      </div>
                    );
                  })}
                </div>
                
                {/* Infinite Scroll Loader */}
                <div ref={loaderRef} className="flex justify-center py-8 min-h-[1px]">
                  {isLoadingMore && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Loading more products...</span>
                    </div>
                  )}
                  {!hasMore && totalCount > 12 && (
                    <p className="text-muted-foreground text-sm">
                      You've seen all {totalCount} products
                    </p>
                  )}
                </div>
              </>
            )}

            {/* Empty State - Enhanced with recommendations */}
            {!isLoading && filteredProducts.length === 0 && (
              (() => {
                // Get parent category info for recommendations
                const currentCategory = categoryParam ? categories?.find(c => 
                  c.slug === categoryParam || normalizeCategory(c.name) === normalizeCategory(categoryParam)
                ) : null;
                
                // Get parent category if current is a subcategory
                const parentCategory = currentCategory?.parent_id 
                  ? categories?.find(c => c.id === currentCategory.parent_id)
                  : currentCategory;
                
                // Get subcategories of the parent
                const relatedSubcategories = parentCategory 
                  ? categories?.filter(c => c.parent_id === parentCategory.id).map(c => ({
                      ...c,
                      productCount: productCounts[c.name] || 0
                    }))
                  : [];
                
                // Get recommended products from parent category or popular products
                const recommendedProducts = products
                  ?.filter(p => {
                    if (!parentCategory) return true; // Show popular if no parent
                    const productCategoryNormalized = normalizeCategory(p.category || '');
                    const parentNormalized = normalizeCategory(parentCategory.name);
                    const parentDescendantsSet = categoryToDescendants[parentCategory.slug];
                    if (!parentDescendantsSet) return productCategoryNormalized === parentNormalized;
                    const parentDescendants = Array.from(parentDescendantsSet);
                    return productCategoryNormalized === parentNormalized ||
                           parentDescendants.some(d => normalizeCategory(d) === productCategoryNormalized);
                  })
                  .slice(0, 8) || [];

                return (
                  <CategoryEmptyState
                    categoryName={categoryDisplayName || undefined}
                    recommendedProducts={recommendedProducts as Product[]}
                    bestsellers={(bestsellers as Product[]) || []}
                    subcategories={relatedSubcategories}
                    onClearFilters={clearAllFilters}
                    hasActiveFilters={activeFiltersCount > 0}
                  />
                );
              })()
            )}
          </div>
        </div>
      </div>

      {/* Recently Viewed Products */}
      {recentlyViewedProducts && recentlyViewedProducts.length > 0 && (
        <section className="border-t border-border bg-muted/30 py-12">
          <div className="container px-4 md:px-6">
            <div className="flex items-center gap-2 mb-6">
              <Clock className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-display font-semibold">Recently Viewed</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {recentlyViewedProducts.slice(0, 4).map((recentProduct) => {
                const productRating = recentProduct.id ? ratingsMap?.[recentProduct.id] : undefined;
                return (
                  <ProductCard 
                    key={recentProduct.id} 
                    product={recentProduct as Product}
                    rating={productRating?.averageRating}
                    reviewCount={productRating?.reviewCount}
                  />
                );
              })}
            </div>
          </div>
        </section>
      )}
      
      {/* Quick View Modal */}
      <QuickViewModal
        product={quickViewProduct}
        isOpen={!!quickViewProduct}
        onClose={() => setQuickViewProduct(null)}
      />
    </Layout>
  );
};

export default Products;
