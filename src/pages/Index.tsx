import { Link } from 'react-router-dom';
import { ArrowRight, Truck, Shield, HeartHandshake, Sparkles, Loader2, Star, Leaf } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Layout } from '@/components/layout/Layout';
import { ProductCard } from '@/components/products/ProductCard';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

const features = [
  {
    icon: Truck,
    title: 'Free Shipping',
    description: 'On orders over $50',
  },
  {
    icon: Shield,
    title: '30-Day Returns',
    description: 'Hassle-free returns',
  },
  {
    icon: HeartHandshake,
    title: 'Pet-Safe',
    description: 'Vet-approved items',
  },
  {
    icon: Leaf,
    title: 'Eco-Friendly',
    description: 'Sustainable products',
  },
];

const testimonials = [
  {
    name: 'Sarah M.',
    pet: 'Golden Retriever Owner',
    text: 'My dog absolutely loves the organic treats! Great quality and fast shipping.',
    rating: 5,
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&q=80',
  },
  {
    name: 'Michael T.',
    pet: 'Cat Parent',
    text: 'Finally found a store that cares about pet health as much as I do. Highly recommend!',
    rating: 5,
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&q=80',
  },
  {
    name: 'Emma L.',
    pet: 'Multi-Pet Household',
    text: 'Beautiful products, amazing customer service. Our pets are so happy!',
    rating: 5,
    avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&q=80',
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5 },
  },
};

const Index = () => {
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

  const categoryImages: Record<string, string> = {
    'Dogs': 'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=400&q=80',
    'Cats': 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=400&q=80',
    'Toys': 'https://images.unsplash.com/photo-1535294435445-d7249524ef2e?w=400&q=80',
    'Food': 'https://images.unsplash.com/photo-1568640347023-a616a30bc3bd?w=400&q=80',
    'Grooming': 'https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?w=400&q=80',
    'Accessories': 'https://images.unsplash.com/photo-1601758124510-52d02ddb7cbd?w=400&q=80',
  };

  return (
    <Layout>
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Decorative background elements */}
        <div className="absolute inset-0 gradient-hero" />
        <div className="absolute top-20 right-10 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-10 left-10 w-96 h-96 bg-secondary/30 rounded-full blur-3xl" />
        
        <div className="container relative px-4 md:px-6 py-20 md:py-32">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div 
              className="space-y-8"
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              <motion.div 
                className="inline-flex items-center gap-2 bg-secondary text-secondary-foreground px-4 py-2 rounded-full text-sm font-medium"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.4 }}
              >
                <Sparkles className="w-4 h-4" />
                Naturally crafted for happy pets
              </motion.div>
              
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold text-foreground leading-tight text-balance">
                Where Love Meets{' '}
                <span className="text-primary relative">
                  Quality Care
                  <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 200 12" fill="none">
                    <path d="M2 10C50 2 150 2 198 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-primary/30"/>
                  </svg>
                </span>
              </h1>
              
              <p className="text-lg text-muted-foreground max-w-lg leading-relaxed">
                Discover premium, eco-friendly products that your furry friends will adore. 
                From organic treats to cozy beds, we bring nature's best to your doorstep.
              </p>
              
              <div className="flex flex-wrap gap-4">
                <Link to="/products">
                  <Button size="lg" className="gap-2 btn-organic rounded-full px-8">
                    Explore Collection
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
                <Link to="/products?category=Dogs">
                  <Button size="lg" variant="outline" className="rounded-full px-8 border-2">
                    Shop for Dogs
                  </Button>
                </Link>
              </div>

              {/* Trust badges */}
              <div className="flex items-center gap-6 pt-4">
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-5 h-5 fill-warning text-warning" />
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">4.9/5</span> from 2,000+ happy pet parents
                </p>
              </div>
            </motion.div>
            
            <motion.div 
              className="relative"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              {/* Main image */}
              <div className="relative z-10">
                <img
                  src="https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&q=80"
                  alt="Happy dog with natural pet products"
                  className="rounded-3xl shadow-soft-lg object-cover aspect-[4/5] w-full"
                />
                
                {/* Floating cards */}
                <motion.div 
                  className="absolute -bottom-6 -left-6 bg-card p-4 rounded-2xl shadow-soft glass"
                  animate={{ y: [0, -8, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
                      <Truck className="w-6 h-6 text-secondary-foreground" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Free Shipping</p>
                      <p className="text-xs text-muted-foreground">On orders $50+</p>
                    </div>
                  </div>
                </motion.div>

                <motion.div 
                  className="absolute -top-4 -right-4 bg-card p-4 rounded-2xl shadow-soft glass"
                  animate={{ y: [0, 8, 0] }}
                  transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                >
                  <div className="flex items-center gap-2">
                    <Leaf className="w-5 h-5 text-primary" />
                    <span className="font-semibold text-sm">100% Natural</span>
                  </div>
                </motion.div>
              </div>

              {/* Decorative blob */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-accent/30 blob-shape -z-10" />
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Bar */}
      <section className="border-y bg-card/50">
        <div className="container px-4 md:px-6 py-8">
          <motion.div 
            className="grid grid-cols-2 md:grid-cols-4 gap-8"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            {features.map((feature) => (
              <motion.div 
                key={feature.title} 
                className="flex items-center gap-4"
                variants={itemVariants}
              >
                <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-secondary shadow-inner-soft">
                  <feature.icon className="w-6 h-6 text-secondary-foreground" />
                </div>
                <div>
                  <p className="font-semibold">{feature.title}</p>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-20">
        <div className="container px-4 md:px-6">
          <motion.div 
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">Shop by Category</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Find exactly what your beloved companion needs, from nutritious food to cozy accessories
            </p>
          </motion.div>
          
          <motion.div 
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            {categories?.map((category) => (
              <motion.div key={category.id} variants={itemVariants}>
                <Link
                  to={`/products?category=${category.name}`}
                  className="group block relative overflow-hidden rounded-2xl aspect-square"
                >
                  <img 
                    src={categoryImages[category.name] || 'https://images.unsplash.com/photo-1450778869180-41d0601e046e?w=400&q=80'}
                    alt={category.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-foreground/80 via-foreground/20 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <h3 className="font-display font-semibold text-lg text-white group-hover:translate-y-0 transition-transform">
                      {category.name}
                    </h3>
                  </div>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Featured Products */}
      <section className="py-20 bg-muted/30">
        <div className="container px-4 md:px-6">
          <motion.div 
            className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div>
              <h2 className="text-3xl md:text-4xl font-display font-bold mb-2">Featured Favorites</h2>
              <p className="text-muted-foreground text-lg">Handpicked selections loved by pets everywhere</p>
            </div>
            <Link to="/products">
              <Button variant="outline" className="gap-2 rounded-full">
                View All Products
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </motion.div>
          
          {productsLoading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          )}
          
          {!productsLoading && featuredProducts && featuredProducts.length > 0 && (
            <motion.div 
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
              variants={containerVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
            >
              {featuredProducts.map((product) => (
                <motion.div key={product.id} variants={itemVariants}>
                  <ProductCard product={product} />
                </motion.div>
              ))}
            </motion.div>
          )}

          {!productsLoading && (!featuredProducts || featuredProducts.length === 0) && (
            <div className="text-center py-16 bg-card rounded-3xl shadow-soft">
              <p className="text-muted-foreground mb-4">
                No products available yet. Import products via the admin page.
              </p>
              <Link to="/admin">
                <Button className="rounded-full">Go to Admin</Button>
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20">
        <div className="container px-4 md:px-6">
          <motion.div 
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">Loved by Pet Parents</h2>
            <p className="text-muted-foreground text-lg">See what our community has to say</p>
          </motion.div>

          <motion.div 
            className="grid md:grid-cols-3 gap-6"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            {testimonials.map((testimonial, index) => (
              <motion.div 
                key={index}
                className="bg-card p-8 rounded-3xl shadow-soft"
                variants={itemVariants}
              >
                <div className="flex items-center gap-1 mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-warning text-warning" />
                  ))}
                </div>
                <p className="text-foreground mb-6 leading-relaxed">"{testimonial.text}"</p>
                <div className="flex items-center gap-3">
                  <img 
                    src={testimonial.avatar} 
                    alt={testimonial.name}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                  <div>
                    <p className="font-semibold">{testimonial.name}</p>
                    <p className="text-sm text-muted-foreground">{testimonial.pet}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container px-4 md:px-6">
          <motion.div 
            className="relative overflow-hidden rounded-3xl gradient-warm p-10 md:p-16 text-center"
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            {/* Decorative elements */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
            
            <div className="relative z-10">
              <h2 className="text-3xl md:text-4xl font-display font-bold mb-4 text-primary-foreground">
                Join Our Pack! 🐾
              </h2>
              <p className="text-lg text-primary-foreground/90 mb-8 max-w-2xl mx-auto">
                Subscribe to our newsletter and get 15% off your first order, 
                plus exclusive deals and pet care tips from our experts.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
                <input
                  type="email"
                  placeholder="Enter your email"
                  className="flex-1 px-5 py-3.5 rounded-full bg-white/15 border border-white/25 placeholder:text-white/60 text-white focus:outline-none focus:ring-2 focus:ring-white/40 backdrop-blur-sm"
                />
                <Button variant="secondary" size="lg" className="rounded-full px-8">
                  Subscribe
                </Button>
              </div>
              <p className="text-sm text-primary-foreground/70 mt-4">
                No spam, unsubscribe anytime. We respect your inbox.
              </p>
            </div>
          </motion.div>
        </div>
      </section>
    </Layout>
  );
};

export default Index;
