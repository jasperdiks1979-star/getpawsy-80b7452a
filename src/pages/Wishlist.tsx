import { Link } from 'react-router-dom';
import { Heart, ShoppingCart, Trash2, ArrowLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { useWishlist } from '@/contexts/WishlistContext';
import { useCart } from '@/contexts/CartContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const Wishlist = () => {
  const { wishlist, removeFromWishlist, clearWishlist } = useWishlist();
  const { addItem } = useCart();

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

  const handleAddToCart = (product: any) => {
    addItem({
      id: product.id,
      name: product.name,
      price: Number(product.price),
      image: product.image_url || '/placeholder.svg',
    });
    toast.success(`${product.name} toegevoegd aan winkelwagen!`);
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
          <Button
            variant="outline"
            className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => {
              clearWishlist();
              toast.success('Wishlist geleegd');
            }}
          >
            <Trash2 className="w-4 h-4" />
            Leeg wishlist
          </Button>
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
            {products?.map((product) => (
              <div
                key={product.id}
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
              </div>
            ))}
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
