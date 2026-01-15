import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Heart, ShoppingCart, Trash2, ArrowLeft, ArrowUpDown, Filter } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useWishlist } from '@/contexts/WishlistContext';
import { useCart } from '@/contexts/CartContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type SortOption = 'added-desc' | 'added-asc' | 'price-asc' | 'price-desc';

const Wishlist = () => {
  const { wishlist, removeFromWishlist, clearWishlist, getAddedAt } = useWishlist();
  const { addItem } = useCart();
  const [sortBy, setSortBy] = useState<SortOption>('added-desc');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const { data: products, isLoading } = useQuery({
    queryKey: ['wishlist-products', wishlist],
    queryFn: async () => {
      if (wishlist.length === 0) return [];
      
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .in('id', wishlist);
      
      if (error) throw error;
      return data;
    },
    enabled: wishlist.length > 0,
  });

  // Get unique categories from products
  const categories = useMemo(() => {
    if (!products) return [];
    const cats = products
      .map(p => p.category)
      .filter((cat): cat is string => !!cat);
    return [...new Set(cats)].sort();
  }, [products]);

  const sortedProducts = useMemo(() => {
    if (!products) return [];
    
    // First filter by category
    let filtered = [...products];
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(p => p.category === categoryFilter);
    }
    
    // Then sort
    return filtered.sort((a, b) => {
      switch (sortBy) {
        case 'price-asc':
          return Number(a.price) - Number(b.price);
        case 'price-desc':
          return Number(b.price) - Number(a.price);
        case 'added-asc': {
          const addedAtA = getAddedAt(a.id) || 0;
          const addedAtB = getAddedAt(b.id) || 0;
          return addedAtA - addedAtB;
        }
        case 'added-desc':
        default: {
          const addedAtA = getAddedAt(a.id) || 0;
          const addedAtB = getAddedAt(b.id) || 0;
          return addedAtB - addedAtA;
        }
      }
    });
  }, [products, sortBy, categoryFilter, getAddedAt]);

  const handleAddToCart = (product: any) => {
    addItem({
      id: product.id,
      name: product.name,
      price: Number(product.price),
      image: product.image_url || '/placeholder.svg',
    });
    toast.success(`${product.name} toegevoegd aan winkelwagen!`);
  };

  const handleAddAllToCart = () => {
    if (!products || products.length === 0) return;
    
    products.forEach((product) => {
      addItem({
        id: product.id,
        name: product.name,
        price: Number(product.price),
        image: product.image_url || '/placeholder.svg',
      });
    });
    toast.success(`${products.length} ${products.length === 1 ? 'product' : 'producten'} toegevoegd aan winkelwagen!`);
  };

  const handleRemove = (productId: string, productName: string) => {
    removeFromWishlist(productId);
    toast.success(`${productName} verwijderd uit wishlist`);
  };

  if (wishlist.length === 0) {
    return (
      <Layout>
        <div className="container px-4 md:px-6 py-16 text-center">
          <div className="max-w-md mx-auto">
            <Heart className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h1 className="text-2xl font-bold mb-2">Je wishlist is leeg</h1>
            <p className="text-muted-foreground mb-6">
              Voeg producten toe aan je wishlist door op het hartje te klikken.
            </p>
            <Link to="/products">
              <Button className="gap-2">
                <ArrowLeft className="w-4 h-4" />
                Bekijk producten
              </Button>
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container px-4 md:px-6 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <Heart className="w-8 h-8 text-primary fill-primary" />
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">Mijn Wishlist</h1>
              <p className="text-muted-foreground">
                {wishlist.length} {wishlist.length === 1 ? 'product' : 'producten'} opgeslagen
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              className="gap-2"
              onClick={handleAddAllToCart}
              disabled={isLoading || !products?.length}
            >
              <ShoppingCart className="w-4 h-4" />
              Alles toevoegen aan winkelwagen
            </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="w-4 h-4" />
                Leeg wishlist
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Wishlist legen?</AlertDialogTitle>
                <AlertDialogDescription>
                  Weet je zeker dat je alle {wishlist.length} producten uit je wishlist wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuleren</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => {
                    clearWishlist();
                    toast.success('Wishlist geleegd');
                  }}
                >
                  Ja, leeg wishlist
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          </div>
        </div>

        {/* Filter & Sort */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          {/* Category Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Alle categorieën" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle categorieën</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {categoryFilter !== 'all' && (
              <span className="text-sm text-muted-foreground">
                ({sortedProducts.length} {sortedProducts.length === 1 ? 'product' : 'producten'})
              </span>
            )}
          </div>

          {/* Sort */}
          <div className="flex items-center gap-2">
            <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
            <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Sorteer op" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="added-desc">Laatst toegevoegd</SelectItem>
                <SelectItem value="added-asc">Eerst toegevoegd</SelectItem>
                <SelectItem value="price-asc">Prijs: laag naar hoog</SelectItem>
                <SelectItem value="price-desc">Prijs: hoog naar laag</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[...Array(wishlist.length)].map((_, i) => (
              <div key={i} className="bg-card rounded-xl overflow-hidden animate-pulse">
                <div className="aspect-square bg-muted" />
                <div className="p-4 space-y-3">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-4 bg-muted rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            <AnimatePresence mode="popLayout">
              {sortedProducts.map((product) => (
                <motion.div
                  key={product.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                  transition={{ duration: 0.3 }}
                  className="bg-card rounded-xl overflow-hidden shadow-card group"
                >
                  {/* Image */}
                  <Link to={`/product/${product.id}`}>
                    <div className="relative aspect-square overflow-hidden bg-muted">
                      <img
                        src={product.image_url || '/placeholder.svg'}
                        alt={product.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                    </div>
                  </Link>

                  {/* Content */}
                  <div className="p-4">
                    <Link to={`/product/${product.id}`}>
                      {product.category && (
                        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                          {product.category}
                        </p>
                      )}
                      <h3 className="font-semibold text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                        {product.name}
                      </h3>
                    </Link>

                    {/* Price */}
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-lg font-bold text-primary">
                        ${Number(product.price).toFixed(2)}
                      </span>
                      {product.compare_at_price && (
                        <span className="text-sm text-muted-foreground line-through">
                          ${Number(product.compare_at_price).toFixed(2)}
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 mt-4">
                      <Button
                        className="flex-1 gap-2"
                        size="sm"
                        onClick={() => handleAddToCart(product)}
                      >
                        <ShoppingCart className="w-4 h-4" />
                        Toevoegen
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 flex-shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleRemove(product.id, product.name)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Continue Shopping */}
        <div className="mt-8 text-center">
          <Link to="/products">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Verder winkelen
            </Button>
          </Link>
        </div>
      </div>
    </Layout>
  );
};

export default Wishlist;
