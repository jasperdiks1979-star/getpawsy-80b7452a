import { useParams, Link } from 'react-router-dom';
import { ShoppingCart, Heart, Truck, Shield, ArrowLeft, Minus, Plus, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Layout } from '@/components/layout/Layout';
import { ProductCard } from '@/components/products/ProductCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCart } from '@/contexts/CartContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const ProductDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [selectedImage, setSelectedImage] = useState(0);

  // Fetch product from database
  const { data: product, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch related products
  const { data: relatedProducts } = useQuery({
    queryKey: ['related-products', product?.category],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .eq('category', product?.category || '')
        .neq('id', id || '')
        .limit(4);
      
      if (error) throw error;
      return data;
    },
    enabled: !!product?.category,
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="container px-4 md:px-6 py-16 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
        </div>
      </Layout>
    );
  }

  if (!product) {
    return (
      <Layout>
        <div className="container px-4 md:px-6 py-16 text-center">
          <h1 className="text-2xl font-bold mb-4">Product niet gevonden</h1>
          <Link to="/products">
            <Button>Terug naar Producten</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  const handleAddToCart = () => {
    for (let i = 0; i < quantity; i++) {
      addItem({
        id: product.id,
        name: product.name,
        price: Number(product.price),
        image: product.image_url || '/placeholder.svg',
      });
    }
    toast.success(`${quantity}x ${product.name} toegevoegd aan winkelwagen!`);
  };

  const discount = product.compare_at_price
    ? Math.round((1 - Number(product.price) / Number(product.compare_at_price)) * 100)
    : null;

  const images = product.images && product.images.length > 0 
    ? product.images 
    : [product.image_url || '/placeholder.svg'];

  const inStock = product.stock !== null && product.stock > 0;

  return (
    <Layout>
      <div className="container px-4 md:px-6 py-8">
        {/* Breadcrumb */}
        <Link
          to="/products"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Terug naar Producten
        </Link>

        <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
          {/* Images */}
          <div className="space-y-4">
            <div className="aspect-square rounded-xl overflow-hidden bg-muted">
              <img
                src={images[selectedImage]}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            </div>
            {images.length > 1 && (
              <div className="flex gap-2">
                {images.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedImage(idx)}
                    className={`w-20 h-20 rounded-lg overflow-hidden border-2 transition-colors ${
                      selectedImage === idx ? 'border-primary' : 'border-transparent'
                    }`}
                  >
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="space-y-6">
            <div>
              {product.category && (
                <p className="text-sm text-muted-foreground uppercase tracking-wider mb-2">
                  {product.category}
                </p>
              )}
              <h1 className="text-3xl font-bold mb-2">{product.name}</h1>
            </div>

            {/* Price */}
            <div className="flex items-center gap-3">
              <span className="text-3xl font-bold text-primary">
                €{Number(product.price).toFixed(2)}
              </span>
              {product.compare_at_price && (
                <>
                  <span className="text-xl text-muted-foreground line-through">
                    €{Number(product.compare_at_price).toFixed(2)}
                  </span>
                  <Badge variant="destructive">Bespaar {discount}%</Badge>
                </>
              )}
            </div>

            {/* Description */}
            {product.description && (
              <p className="text-muted-foreground">{product.description}</p>
            )}

            {/* Stock */}
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${inStock ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-sm font-medium">
                {inStock ? `Op voorraad (${product.stock})` : 'Uitverkocht'}
              </span>
            </div>

            {/* Shipping Time */}
            {product.shipping_time && (
              <p className="text-sm text-muted-foreground">
                Verwachte levertijd: {product.shipping_time}
              </p>
            )}

            {/* Quantity & Add to Cart */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center border rounded-lg">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                >
                  <Minus className="w-4 h-4" />
                </Button>
                <span className="w-12 text-center font-medium">{quantity}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setQuantity(quantity + 1)}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              <Button
                size="lg"
                className="flex-1 gap-2"
                onClick={handleAddToCart}
                disabled={!inStock}
              >
                <ShoppingCart className="w-5 h-5" />
                In Winkelwagen
              </Button>

              <Button 
                variant="outline" 
                size="lg"
                onClick={() => toast.info('Toegevoegd aan wishlist!')}
              >
                <Heart className="w-5 h-5" />
              </Button>
            </div>

            {/* Features */}
            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Truck className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">Gratis Verzending</p>
                  <p className="text-xs text-muted-foreground">Boven €50</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">30 Dagen Retour</p>
                  <p className="text-xs text-muted-foreground">Zorgeloos</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-12">
          <Tabs defaultValue="description">
            <TabsList>
              <TabsTrigger value="description">Beschrijving</TabsTrigger>
              <TabsTrigger value="shipping">Verzending</TabsTrigger>
            </TabsList>
            <TabsContent value="description" className="mt-4">
              <p className="text-muted-foreground">
                {product.description || 'Geen beschrijving beschikbaar.'}
              </p>
            </TabsContent>
            <TabsContent value="shipping" className="mt-4">
              <div className="space-y-3 text-muted-foreground">
                <p>🇳🇱 Verzending vanuit Nederland/Europa</p>
                <p>📦 Standaard verzending: 5-10 werkdagen</p>
                <p>🚀 Express verzending: 3-5 werkdagen</p>
                <p>✨ Gratis verzending bij bestellingen boven €50</p>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Related Products */}
        {relatedProducts && relatedProducts.length > 0 && (
          <div className="mt-16">
            <h2 className="text-2xl font-bold mb-6">Dit Vind Je Misschien Ook Leuk</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {relatedProducts.map((relatedProduct) => (
                <ProductCard key={relatedProduct.id} product={relatedProduct} />
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default ProductDetail;
