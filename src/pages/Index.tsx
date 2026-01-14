import { Link } from 'react-router-dom';
import { ArrowRight, Truck, Shield, HeartHandshake, Sparkles, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Layout } from '@/components/layout/Layout';
import { ProductCard } from '@/components/products/ProductCard';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

const features = [
  {
    icon: Truck,
    title: 'Gratis Verzending',
    description: 'Bij bestellingen boven €50',
  },
  {
    icon: Shield,
    title: '30 Dagen Retour',
    description: 'Zorgeloos retourneren',
  },
  {
    icon: HeartHandshake,
    title: 'Dierenvriendelijk',
    description: 'Veilige producten',
  },
  {
    icon: Sparkles,
    title: 'Premium Kwaliteit',
    description: 'Alleen het beste',
  },
];

const Index = () => {
  // Fetch featured products from database
  const { data: featuredProducts, isLoading: productsLoading } = useQuery({
    queryKey: ['featured-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(4);
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch categories from database
  const { data: categories } = useQuery({
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

  const categoryIcons: Record<string, string> = {
    'Honden': '🐕',
    'Katten': '🐱',
    'Speelgoed': '🎾',
    'Voeding': '🦴',
    'Verzorging': '🧴',
    'Accessoires': '🎀',
  };

  return (
    <Layout>
      {/* Hero Section */}
      <section className="relative gradient-hero overflow-hidden">
        <div className="container px-4 md:px-6 py-16 md:py-24">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium">
                <Sparkles className="w-4 h-4" />
                Nieuwe collectie beschikbaar!
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground leading-tight">
                Blije Huisdieren,{' '}
                <span className="text-primary">Blij Leven</span>
              </h1>
              <p className="text-lg text-muted-foreground max-w-md">
                Premium huisdierproducten bezorgd aan je deur. Van knusse bedjes tot lekkere snacks, 
                wij hebben alles wat je harige vrienden nodig hebben.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link to="/products">
                  <Button size="lg" className="gap-2">
                    Shop Nu
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
                <Link to="/products?category=Honden">
                  <Button size="lg" variant="outline">
                    Shop voor Honden 🐕
                  </Button>
                </Link>
              </div>
            </div>
            <div className="relative">
              <img
                src="https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&q=80"
                alt="Blije hond met speeltje"
                className="rounded-2xl shadow-2xl"
              />
              <div className="absolute -bottom-4 -left-4 bg-card p-4 rounded-xl shadow-lg">
                <p className="text-sm font-medium">🇳🇱 Verzending vanuit NL</p>
                <p className="text-xs text-muted-foreground">Snelle & betrouwbare levering</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-b">
        <div className="container px-4 md:px-6 py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {features.map((feature) => (
              <div key={feature.title} className="flex items-center gap-3">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-sm">{feature.title}</p>
                  <p className="text-xs text-muted-foreground">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-16">
        <div className="container px-4 md:px-6">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold mb-3">Shop per Categorie</h2>
            <p className="text-muted-foreground">Vind precies wat je huisdier nodig heeft</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {categories?.map((category) => (
              <Link
                key={category.id}
                to={`/products?category=${category.name}`}
                className="group p-6 bg-card rounded-xl shadow-card hover:shadow-card-hover transition-all duration-300 hover:-translate-y-1 text-center"
              >
                <span className="text-4xl block mb-3">
                  {categoryIcons[category.name] || '🐾'}
                </span>
                <h3 className="font-semibold group-hover:text-primary transition-colors">
                  {category.name}
                </h3>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Products */}
      <section className="py-16 bg-muted/50">
        <div className="container px-4 md:px-6">
          <div className="flex items-center justify-between mb-10">
            <div>
              <h2 className="text-3xl font-bold mb-2">Uitgelichte Producten</h2>
              <p className="text-muted-foreground">Top keuzes voor je harige vrienden</p>
            </div>
            <Link to="/products">
              <Button variant="outline" className="gap-2">
                Bekijk Alles
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
          
          {productsLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          )}
          
          {!productsLoading && featuredProducts && featuredProducts.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {featuredProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}

          {!productsLoading && (!featuredProducts || featuredProducts.length === 0) && (
            <div className="text-center py-12 bg-card rounded-xl">
              <p className="text-muted-foreground mb-4">
                Nog geen producten beschikbaar. Importeer producten via de admin pagina.
              </p>
              <Link to="/admin">
                <Button>Ga naar Admin</Button>
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16">
        <div className="container px-4 md:px-6">
          <div className="bg-primary rounded-2xl p-8 md:p-12 text-center text-primary-foreground">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Word lid van de Pawsy Familie! 🐾
            </h2>
            <p className="text-lg opacity-90 mb-6 max-w-2xl mx-auto">
              Schrijf je in voor onze nieuwsbrief en krijg 15% korting op je eerste bestelling, 
              plus exclusieve aanbiedingen en verzorgingstips.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
              <input
                type="email"
                placeholder="Voer je e-mail in"
                className="flex-1 px-4 py-3 rounded-lg bg-white/10 border border-white/20 placeholder:text-white/60 text-white focus:outline-none focus:ring-2 focus:ring-white/30"
              />
              <Button variant="secondary" size="lg">
                Inschrijven
              </Button>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default Index;
