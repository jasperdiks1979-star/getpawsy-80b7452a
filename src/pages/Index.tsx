import { Link } from 'react-router-dom';
import { ArrowRight, Truck, Shield, HeartHandshake, Sparkles } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { ProductCard } from '@/components/products/ProductCard';
import { Button } from '@/components/ui/button';
import { categories, getFeaturedProducts } from '@/data/products';

const features = [
  {
    icon: Truck,
    title: 'Free US Shipping',
    description: 'Free shipping on orders over $50',
  },
  {
    icon: Shield,
    title: '30-Day Returns',
    description: 'Hassle-free returns guaranteed',
  },
  {
    icon: HeartHandshake,
    title: 'Pet-Safe Products',
    description: 'All products are vet-approved',
  },
  {
    icon: Sparkles,
    title: 'Premium Quality',
    description: 'Only the best for your pets',
  },
];

const Index = () => {
  const featuredProducts = getFeaturedProducts();

  return (
    <Layout>
      {/* Hero Section */}
      <section className="relative gradient-hero overflow-hidden">
        <div className="container px-4 md:px-6 py-16 md:py-24">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium">
                <Sparkles className="w-4 h-4" />
                New arrivals just dropped!
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground leading-tight">
                Happy Pets,{' '}
                <span className="text-primary">Happy Life</span>
              </h1>
              <p className="text-lg text-muted-foreground max-w-md">
                Premium pet products delivered to your door. From cozy beds to tasty treats, 
                we've got everything your furry friends need.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link to="/products">
                  <Button size="lg" className="gap-2">
                    Shop Now
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
                <Link to="/products?category=dogs">
                  <Button size="lg" variant="outline">
                    Shop for Dogs 🐕
                  </Button>
                </Link>
              </div>
            </div>
            <div className="relative">
              <img
                src="https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&q=80"
                alt="Happy dog with toy"
                className="rounded-2xl shadow-2xl"
              />
              <div className="absolute -bottom-4 -left-4 bg-card p-4 rounded-xl shadow-lg">
                <p className="text-sm font-medium">🇺🇸 Ships from USA</p>
                <p className="text-xs text-muted-foreground">Fast & reliable delivery</p>
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
            <h2 className="text-3xl font-bold mb-3">Shop by Category</h2>
            <p className="text-muted-foreground">Find exactly what your pet needs</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {categories.map((category) => (
              <Link
                key={category.id}
                to={`/products?category=${category.id}`}
                className="group p-6 bg-card rounded-xl shadow-card hover:shadow-card-hover transition-all duration-300 hover:-translate-y-1 text-center"
              >
                <span className="text-4xl block mb-3">{category.icon}</span>
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
              <h2 className="text-3xl font-bold mb-2">Featured Products</h2>
              <p className="text-muted-foreground">Top picks for your furry friends</p>
            </div>
            <Link to="/products">
              <Button variant="outline" className="gap-2">
                View All
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {featuredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16">
        <div className="container px-4 md:px-6">
          <div className="bg-primary rounded-2xl p-8 md:p-12 text-center text-primary-foreground">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Join the Pawsy Family! 🐾
            </h2>
            <p className="text-lg opacity-90 mb-6 max-w-2xl mx-auto">
              Subscribe to our newsletter and get 15% off your first order, 
              plus exclusive deals and pet care tips.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
              <input
                type="email"
                placeholder="Enter your email"
                className="flex-1 px-4 py-3 rounded-lg bg-white/10 border border-white/20 placeholder:text-white/60 text-white focus:outline-none focus:ring-2 focus:ring-white/30"
              />
              <Button variant="secondary" size="lg">
                Subscribe
              </Button>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default Index;
