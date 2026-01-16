import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { 
  ShoppingCart, 
  Heart, 
  Truck, 
  Shield, 
  Star, 
  ChevronRight,
  Check,
  ArrowLeft,
  Sparkles,
  Award,
  Clock,
  Package
} from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useCart } from '@/contexts/CartContext';
import { useWishlist } from '@/contexts/WishlistContext';
import { useHaptic } from '@/hooks/useHaptic';
import { toast } from 'sonner';

interface SellingPoint {
  icon: string;
  title: string;
  description: string;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  heart: Heart,
  shield: Shield,
  star: Star,
  truck: Truck,
  check: Check,
  sparkles: Sparkles,
  award: Award,
  clock: Clock,
  package: Package,
};

const BestsellerDetail = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { addItem } = useCart();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const { trigger } = useHaptic();

  // Fetch bestseller with product data
  const { data: bestseller, isLoading, error } = useQuery({
    queryKey: ['bestseller', slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bestsellers')
        .select(`
          *,
          products:product_id (
            id,
            name,
            price,
            compare_at_price,
            image_url,
            images,
            description,
            category,
            stock,
            shipping_time
          )
        `)
        .eq('slug', slug)
        .eq('is_active', true)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!slug,
  });

  const product = bestseller?.products;
  const sellingPoints: SellingPoint[] = bestseller?.selling_points 
    ? (bestseller.selling_points as unknown as SellingPoint[])
    : [];

  const handleAddToCart = () => {
    if (!product) return;
    trigger('medium');
    addItem({
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.image_url || '/placeholder.svg',
    });
  };

  const handleToggleWishlist = () => {
    if (!product) return;
    trigger('light');
    toggleWishlist(product.id);
    toast.success(
      isInWishlist(product.id) 
        ? 'Verwijderd uit verlanglijst' 
        : 'Toegevoegd aan verlanglijst'
    );
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="container px-4 py-20">
          <div className="animate-pulse space-y-8">
            <div className="h-8 bg-muted rounded w-1/3" />
            <div className="grid lg:grid-cols-2 gap-12">
              <div className="aspect-square bg-muted rounded-3xl" />
              <div className="space-y-4">
                <div className="h-12 bg-muted rounded w-3/4" />
                <div className="h-6 bg-muted rounded w-1/2" />
                <div className="h-32 bg-muted rounded" />
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !bestseller || !product) {
    return (
      <Layout>
        <div className="container px-4 py-20 text-center">
          <h1 className="text-2xl font-bold mb-4">Product niet gevonden</h1>
          <Button onClick={() => navigate('/products')}>
            Bekijk alle producten
          </Button>
        </div>
      </Layout>
    );
  }

  const discount = product.compare_at_price 
    ? Math.round((1 - product.price / product.compare_at_price) * 100)
    : 0;

  return (
    <>
      <Layout>
        {/* Breadcrumb */}
        <div className="bg-muted/30 border-b">
          <div className="container px-4 py-3">
            <nav className="flex items-center gap-2 text-sm text-muted-foreground">
              <Link to="/" className="hover:text-primary transition-colors">Home</Link>
              <ChevronRight className="w-4 h-4" />
              <Link to="/products" className="hover:text-primary transition-colors">Producten</Link>
              <ChevronRight className="w-4 h-4" />
              <span className="text-foreground font-medium truncate">{product.name}</span>
            </nav>
          </div>
        </div>

        {/* Hero Section */}
        <section className="bg-gradient-to-b from-primary/5 to-background py-8 lg:py-16">
          <div className="container px-4">
            <div className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-start">
              {/* Product Image */}
              <motion.div 
                className="relative"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5 }}
              >
                {/* Bestseller Badge */}
                <div className="absolute top-4 left-4 z-10 flex gap-2">
                  <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 px-4 py-2 text-sm font-semibold shadow-lg">
                    <Award className="w-4 h-4 mr-1" />
                    Bestseller #{bestseller.rank}
                  </Badge>
                  {discount > 0 && (
                    <Badge variant="destructive" className="px-3 py-2">
                      -{discount}%
                    </Badge>
                  )}
                </div>

                {/* Main Image */}
                <div className="aspect-square rounded-3xl overflow-hidden bg-white shadow-2xl">
                  <img
                    src={product.image_url || '/placeholder.svg'}
                    alt={product.name}
                    className="w-full h-full object-contain p-8"
                  />
                </div>

                {/* Thumbnail Gallery */}
                {product.images && product.images.length > 1 && (
                  <div className="flex gap-3 mt-4 overflow-x-auto pb-2">
                    {product.images.slice(0, 5).map((img, idx) => (
                      <button
                        key={idx}
                        className="w-20 h-20 rounded-xl overflow-hidden border-2 border-border hover:border-primary transition-colors flex-shrink-0"
                      >
                        <img src={img} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>

              {/* Product Info */}
              <motion.div 
                className="space-y-6"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                {/* Category */}
                {product.category && (
                  <Link 
                    to={`/products?category=${encodeURIComponent(product.category)}`}
                    className="text-primary text-sm font-medium hover:underline"
                  >
                    {product.category}
                  </Link>
                )}

                {/* Headline */}
                <h1 className="text-3xl lg:text-4xl xl:text-5xl font-display font-bold leading-tight">
                  {bestseller.hero_headline || product.name}
                </h1>

                {/* Subheadline */}
                {bestseller.hero_subheadline && (
                  <p className="text-lg text-muted-foreground">
                    {bestseller.hero_subheadline}
                  </p>
                )}

                {/* Rating */}
                <div className="flex items-center gap-2">
                  <div className="flex">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-5 h-5 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    4.9 (128+ reviews)
                  </span>
                </div>

                {/* Price */}
                <div className="flex items-baseline gap-3">
                  <span className="text-4xl font-bold text-primary">
                    €{product.price.toFixed(2)}
                  </span>
                  {product.compare_at_price && (
                    <span className="text-xl text-muted-foreground line-through">
                      €{product.compare_at_price.toFixed(2)}
                    </span>
                  )}
                </div>

                {/* Stock Status */}
                <div className="flex items-center gap-2">
                  {product.stock && product.stock > 0 ? (
                    <>
                      <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-sm text-green-600 font-medium">
                        Op voorraad - Direct leverbaar
                      </span>
                    </>
                  ) : (
                    <>
                      <div className="w-3 h-3 rounded-full bg-red-500" />
                      <span className="text-sm text-red-600 font-medium">
                        Uitverkocht
                      </span>
                    </>
                  )}
                </div>

                {/* Shipping Info */}
                {product.shipping_time && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Truck className="w-4 h-4" />
                    <span>Levertijd: {product.shipping_time}</span>
                  </div>
                )}

                <Separator />

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <Button 
                    size="lg" 
                    className="flex-1 h-14 text-lg btn-organic gap-2"
                    onClick={handleAddToCart}
                    disabled={!product.stock || product.stock <= 0}
                  >
                    <ShoppingCart className="w-5 h-5" />
                    In winkelwagen
                  </Button>
                  <Button 
                    size="lg" 
                    variant="outline" 
                    className="h-14 w-14"
                    onClick={handleToggleWishlist}
                  >
                    <Heart 
                      className={`w-5 h-5 ${isInWishlist(product.id) ? 'fill-accent text-accent' : ''}`} 
                    />
                  </Button>
                </div>

                {/* Trust Badges */}
                <div className="grid grid-cols-2 gap-4 pt-4">
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
                    <Truck className="w-5 h-5 text-primary" />
                    <div className="text-sm">
                      <p className="font-medium">Gratis verzending</p>
                      <p className="text-muted-foreground">Vanaf €50</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
                    <Shield className="w-5 h-5 text-primary" />
                    <div className="text-sm">
                      <p className="font-medium">30 dagen retour</p>
                      <p className="text-muted-foreground">Niet goed? Geld terug</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Selling Points */}
        {sellingPoints.length > 0 && (
          <section className="py-16 bg-muted/30">
            <div className="container px-4">
              <h2 className="text-2xl lg:text-3xl font-bold text-center mb-12">
                Waarom dit product?
              </h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {sellingPoints.map((point, idx) => {
                  const IconComponent = iconMap[point.icon] || Star;
                  return (
                    <motion.div
                      key={idx}
                      className="bg-background p-6 rounded-2xl shadow-soft text-center"
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: idx * 0.1 }}
                    >
                      <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center">
                        <IconComponent className="w-7 h-7 text-primary" />
                      </div>
                      <h3 className="font-semibold mb-2">{point.title}</h3>
                      <p className="text-sm text-muted-foreground">{point.description}</p>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* Long Description */}
        {bestseller.long_description && (
          <section className="py-16">
            <div className="container px-4">
              <div className="max-w-4xl mx-auto">
                <h2 className="text-2xl lg:text-3xl font-bold mb-8">
                  Over dit product
                </h2>
                <div 
                  className="prose prose-lg max-w-none text-muted-foreground leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: bestseller.long_description.replace(/\n/g, '<br/>') }}
                />
              </div>
            </div>
          </section>
        )}

        {/* CTA Section */}
        <section className="py-16 bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10">
          <div className="container px-4 text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <Sparkles className="w-12 h-12 mx-auto mb-4 text-primary" />
              <h2 className="text-2xl lg:text-3xl font-bold mb-4">
                Klaar om je huisdier te verwennen?
              </h2>
              <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
                Bestel nu en geef je trouwe viervoeter de verzorging die hij verdient. 
                Gratis verzending vanaf €50.
              </p>
              <Button 
                size="lg" 
                className="h-14 px-8 text-lg btn-organic gap-2"
                onClick={handleAddToCart}
                disabled={!product.stock || product.stock <= 0}
              >
                <ShoppingCart className="w-5 h-5" />
                Bestel nu - €{product.price.toFixed(2)}
              </Button>
            </motion.div>
          </div>
        </section>

        {/* Back to products */}
        <div className="container px-4 py-8">
          <Button 
            variant="ghost" 
            onClick={() => navigate('/products')}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Terug naar alle producten
          </Button>
        </div>
      </Layout>
    </>
  );
};

export default BestsellerDetail;
