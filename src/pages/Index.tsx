import { Link } from 'react-router-dom';
import { ArrowRight, ArrowDown, Truck, Shield, HeartHandshake, Sparkles, Loader2, Star, Leaf, Quote, Clock } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Layout } from '@/components/layout/Layout';
import { ProductCard } from '@/components/products/ProductCard';
import { Button } from '@/components/ui/button';
import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from '@/components/ui/carousel';
import { supabase } from '@/integrations/supabase/client';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { CarouselApi } from '@/components/ui/carousel';
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed';
import { trackNewsletterSignup } from '@/lib/analytics';
import { toast } from 'sonner';
import { useVisitorTracking } from '@/hooks/useVisitorTracking';
import { BestsellersSection } from '@/components/home/BestsellersSection';
import { AnimatedTrustBadges } from '@/components/home/AnimatedTrustBadges';
import { SectionErrorBoundary } from '@/components/ui/section-error-boundary';
import { WebsiteSchema } from '@/components/seo/WebsiteSchema';
import { safeString, safePrice, safeNumber, safeProduct, SafeProduct } from '@/lib/safe-render';
import { initPageDebug, logDataSanitization, createSectionDebugger } from '@/lib/debug-logger';
import { useCriticalImagePreload, prefetchImages } from '@/hooks/useCriticalImagePreload';

// Debug loggers for each section
const categoriesDebug = createSectionDebugger('Categories');
const productsDebug = createSectionDebugger('FeaturedProducts');
const recentlyViewedDebug = createSectionDebugger('RecentlyViewed');
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
    text: 'My dog absolutely loves the organic treats! Great quality and fast shipping. The delivery was super quick and the packaging was eco-friendly too!',
    rating: 5,
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&q=80',
  },
  {
    name: 'Michael T.',
    pet: 'Cat Parent',
    text: 'Finally found a store that cares about pet health as much as I do. Highly recommend! My cats have never been happier with their new toys.',
    rating: 5,
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&q=80',
  },
  {
    name: 'Emma L.',
    pet: 'Multi-Pet Household',
    text: 'Beautiful products, amazing customer service. Our pets are so happy! The variety is incredible and everything arrives in perfect condition.',
    rating: 5,
    avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&q=80',
  },
  {
    name: 'David K.',
    pet: 'Labrador Owner',
    text: 'The quality of products here is unmatched. My Lab loves every single treat and toy we have ordered. Will definitely keep coming back!',
    rating: 5,
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&q=80',
  },
  {
    name: 'Lisa R.',
    pet: 'Persian Cat Mom',
    text: 'As a picky cat owner, I was impressed by the premium grooming supplies. My Persian has never looked better. Excellent products!',
    rating: 5,
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&q=80',
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { 
      duration: 0.6,
      ease: "easeOut" as const
    },
  },
};

const featureVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { 
      duration: 0.5,
      ease: "easeOut" as const
    },
  },
};

const Index = () => {
  // Preload critical hero images for faster LCP
  useCriticalImagePreload([
    '/categories/dogs.jpg',
    '/categories/cats.jpg',
  ]);
  
  // Initialize debug mode on mount
  useEffect(() => {
    initPageDebug('Index/Homepage');
  }, []);
  
  // Track visitor browsing activity
  useVisitorTracking();
  
  // Parallax scroll
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"]
  });
  
  // Parallax transforms - simplified for better mobile performance
  const heroImageY = useTransform(scrollYProgress, [0, 1], [0, 100]);
  const heroContentY = useTransform(scrollYProgress, [0, 1], [0, 30]);
  const floatingCard1Y = useTransform(scrollYProgress, [0, 1], [0, 50]);
  const floatingCard2Y = useTransform(scrollYProgress, [0, 1], [0, 70]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.6], [1, 0.5]);
  
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [isSubscribing, setIsSubscribing] = useState(false);
  // Testimonials carousel state
  const [testimonialsApi, setTestimonialsApi] = useState<CarouselApi>();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [slideCount, setSlideCount] = useState(0);

  // Featured products carousel state
  const [productsApi, setProductsApi] = useState<CarouselApi>();

  const onTestimonialsSelect = useCallback(() => {
    if (!testimonialsApi) return;
    setCurrentSlide(testimonialsApi.selectedScrollSnap());
  }, [testimonialsApi]);

  useEffect(() => {
    if (!testimonialsApi) return;
    setSlideCount(testimonialsApi.scrollSnapList().length);
    onTestimonialsSelect();
    testimonialsApi.on('select', onTestimonialsSelect);
    return () => {
      testimonialsApi.off('select', onTestimonialsSelect);
    };
  }, [testimonialsApi, onTestimonialsSelect]);

  // Auto-play for testimonials carousel
  useEffect(() => {
    if (!testimonialsApi) return;
    const interval = setInterval(() => {
      if (testimonialsApi.canScrollNext()) {
        testimonialsApi.scrollNext();
      } else {
        testimonialsApi.scrollTo(0);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [testimonialsApi]);

  // Auto-play for featured products carousel
  useEffect(() => {
    if (!productsApi) return;
    const interval = setInterval(() => {
      if (productsApi.canScrollNext()) {
        productsApi.scrollNext();
      } else {
        productsApi.scrollTo(0);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [productsApi]);
  const { data: featuredProducts, isLoading: productsLoading } = useQuery({
    queryKey: ['featured-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products_public')
        .select('*')
        .eq('is_active', true)
        .gt('stock', 0)
        .order('created_at', { ascending: false })
        .limit(12);
      
      if (error) throw error;
      return data;
    },
  });

  const { data: categories, isLoading: categoriesLoading } = useQuery({
    queryKey: ['homepage-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .is('parent_id', null)
        .order('display_order', { ascending: true });
      
      if (error) throw error;
      return data;
    },
  });

  // Sanitize categories to prevent React error #310
  const safeCategories = useMemo(() => {
    if (!categories) return [];
    
    // Log original data for debugging
    categoriesDebug.logDataReceived('categories', categories);
    
    const sanitized = categories.map(cat => {
      // Check each field for objects
      categoriesDebug.warnIfObject('cat.name', cat.name);
      categoriesDebug.warnIfObject('cat.description', cat.description);
      categoriesDebug.warnIfObject('cat.image_url', cat.image_url);
      
      return {
        ...cat,
        name: safeString(cat.name),
        description: safeString(cat.description),
        image_url: safeString(cat.image_url),
        slug: safeString(cat.slug),
      };
    });
    
    logDataSanitization('categories', categories, sanitized);
    return sanitized;
  }, [categories]);

  // Sanitize featured products to prevent React error #310
  const safeFeaturedProducts = useMemo(() => {
    if (!featuredProducts) return [];
    
    // Log original data for debugging
    productsDebug.logDataReceived('featuredProducts', featuredProducts);
    
    const sanitized = featuredProducts
      .map(p => {
        // Check for object fields before sanitization
        productsDebug.warnIfObject('product.name', p.name);
        productsDebug.warnIfObject('product.description', p.description);
        productsDebug.warnIfObject('product.category', p.category);
        productsDebug.warnIfObject('product.image_url', p.image_url);
        productsDebug.warnIfObject('product.price', p.price);
        
        return safeProduct(p);
      })
      .filter((p): p is SafeProduct => p !== null);
    
    logDataSanitization('featuredProducts', featuredProducts, sanitized);
    return sanitized;
  }, [featuredProducts]);

  // Recently viewed products
  const { getRecentlyViewedIds } = useRecentlyViewed();
  const recentlyViewedIds = getRecentlyViewedIds();

  const { data: recentlyViewedProducts } = useQuery({
    queryKey: ['recently-viewed-products', recentlyViewedIds],
    queryFn: async () => {
      if (recentlyViewedIds.length === 0) return [];
      const { data, error } = await supabase
        .from('products_public')
        .select('*')
        .in('id', recentlyViewedIds)
        .eq('is_active', true)
        .gt('stock', 0);
      
      if (error) throw error;
      if (!data) return [];
      // Sort by recently viewed order and filter out any undefined products
      return recentlyViewedIds
        .map(id => data.find(p => p.id === id))
        .filter((p): p is NonNullable<typeof p> => p != null);
    },
    enabled: recentlyViewedIds.length > 0,
  });

  // Sanitize recently viewed products
  const safeRecentlyViewedProducts = useMemo(() => {
    if (!recentlyViewedProducts) return [];
    
    // Log original data for debugging
    recentlyViewedDebug.logDataReceived('recentlyViewedProducts', recentlyViewedProducts);
    
    const sanitized = recentlyViewedProducts
      .map(p => {
        // Check for object fields before sanitization
        recentlyViewedDebug.warnIfObject('product.name', p.name);
        recentlyViewedDebug.warnIfObject('product.description', p.description);
        recentlyViewedDebug.warnIfObject('product.price', p.price);
        
        return safeProduct(p);
      })
      .filter((p): p is SafeProduct => p !== null);
    
    logDataSanitization('recentlyViewedProducts', recentlyViewedProducts, sanitized);
    return sanitized;
  }, [recentlyViewedProducts]);

  const handleNewsletterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsletterEmail || !newsletterEmail.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }
    
    setIsSubscribing(true);
    try {
      const { error } = await supabase
        .from('newsletter_subscribers')
        .insert({ email: newsletterEmail });
      
      if (error) {
        if (error.code === '23505') {
          toast.info('You\'re already subscribed to our newsletter!');
        } else {
          throw error;
        }
      } else {
        toast.success('Thanks for signing up! Check your inbox for 15% off.');
        trackNewsletterSignup(newsletterEmail);
      }
      setNewsletterEmail('');
    } catch (error) {
      toast.error('Something went wrong. Please try again later.');
    } finally {
      setIsSubscribing(false);
    }
  };

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
      <WebsiteSchema />
      {/* Hero Section with Video Background */}
      <section ref={heroRef} className="relative overflow-hidden min-h-[90vh] flex items-center">
        {/* Video Background - Responsive with mobile optimization */}
        <div className="absolute inset-0 z-0">
          {/* Mobile: Show optimized poster image instead of video for performance */}
          <picture className="md:hidden absolute inset-0">
            <img
              src="https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&q=70"
              alt=""
              className="w-full h-full object-cover"
              loading="eager"
            />
          </picture>
          
          {/* Desktop: Full HD video */}
          <video
            autoPlay
            loop
            muted
            playsInline
            poster="https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=1920&q=80"
            className="hidden md:block w-full h-full object-cover"
          >
            {/* SD version for tablets (768px-1024px) */}
            <source 
              src="https://videos.pexels.com/video-files/4488282/4488282-sd_640_360_25fps.mp4" 
              type="video/mp4"
              media="(max-width: 1024px)"
            />
            {/* HD version for desktop (1024px+) */}
            <source 
              src="https://videos.pexels.com/video-files/4488282/4488282-hd_1920_1080_25fps.mp4" 
              type="video/mp4" 
            />
          </video>
          {/* Gradient overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/80 to-background/40" />
          <div className="absolute inset-0 bg-gradient-to-t from-background/50 via-transparent to-background/30" />
        </div>
        
        {/* Decorative blur elements */}
        <div className="absolute top-20 right-10 w-64 h-64 bg-primary/10 rounded-full blur-3xl z-0" />
        <div className="absolute bottom-10 left-10 w-96 h-96 bg-secondary/20 rounded-full blur-3xl z-0" />
        
        <motion.div 
          className="container relative z-10 px-4 md:px-6 py-20 md:py-32"
          style={{ opacity: heroOpacity }}
        >
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div 
              className="space-y-8"
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              style={{ y: heroContentY }}
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
                  <Button size="lg" className="gap-2 btn-organic rounded-full px-8 relative overflow-hidden group">
                    {/* Shimmer effect */}
                    <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-1000 ease-out" />
                    <span className="relative z-10 flex items-center gap-2">
                      Explore Collection
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </span>
                  </Button>
                </Link>
                <Button 
                  size="lg" 
                  variant="outline" 
                  className="gap-2 rounded-full px-8 border-2"
                  onClick={() => document.getElementById('categories')?.scrollIntoView({ behavior: 'smooth' })}
                >
                  View Categories
                  <motion.span
                    animate={{ y: [0, 4, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <ArrowDown className="w-4 h-4" />
                  </motion.span>
                </Button>
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
              className="relative py-6 px-6"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              {/* Main image with smooth parallax */}
              <motion.div 
                className="relative z-10 overflow-hidden rounded-3xl will-change-transform bg-secondary/20" 
                style={{ y: heroImageY }}
              >
                <img
                  src="https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&q=80"
                  alt="Happy dog with natural pet products"
                  className="shadow-soft-lg object-cover aspect-[4/5] w-full transition-transform duration-700 hover:scale-105 rounded-3xl"
                />
              </motion.div>
                
              {/* Floating cards with simplified parallax - positioned outside overflow container */}
              <motion.div 
                className="absolute bottom-0 left-0 bg-card p-4 rounded-2xl shadow-soft glass z-20 will-change-transform"
                style={{ y: floatingCard1Y }}
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
                className="absolute top-0 right-0 bg-card p-4 rounded-2xl shadow-soft glass z-20 will-change-transform"
                style={{ y: floatingCard2Y }}
                whileHover={{ scale: 1.05 }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
              >
                <div className="flex items-center gap-2">
                  <Leaf className="w-5 h-5 text-primary animate-pulse" />
                  <span className="font-semibold text-sm">100% Natural</span>
                </div>
              </motion.div>

              {/* Decorative blob */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-accent/30 blob-shape -z-10" />
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* Animated Trust Badges */}
      <SectionErrorBoundary sectionName="Features">
        <AnimatedTrustBadges />
      </SectionErrorBoundary>

      {/* Bestsellers Section */}
      <SectionErrorBoundary sectionName="Bestsellers">
        <BestsellersSection />
      </SectionErrorBoundary>

      {/* Categories */}
      <SectionErrorBoundary sectionName="Categorieën">
        <section id="categories" className="py-20">
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
            
            {categoriesLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="relative overflow-hidden rounded-2xl aspect-square">
                    <Skeleton className="w-full h-full" />
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <Skeleton className="h-5 w-3/4 mb-2" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <motion.div 
                className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4"
                variants={containerVariants}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
              >
                {safeCategories.map((category) => (
                  <motion.div 
                    key={category.id} 
                    variants={itemVariants}
                    whileHover={{ y: -8 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  >
                    <Link
                      to={`/products?category=${encodeURIComponent(category.name)}`}
                      className="group block relative overflow-hidden rounded-2xl aspect-square shadow-soft hover:shadow-soft-lg transition-shadow duration-300"
                    >
                      {/* Image with zoom effect - v4 forces cache refresh */}
                      <img 
                        src={`${category.image_url || categoryImages[category.name] || 'https://images.unsplash.com/photo-1450778869180-41d0601e046e?w=400&q=80'}?v=4`}
                        alt={category.name}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-115"
                        onError={(e) => { e.currentTarget.src = 'https://images.unsplash.com/photo-1450778869180-41d0601e046e?w=400&q=80'; }}
                      />
                      
                      {/* Gradient overlay with enhanced hover */}
                      <div className="absolute inset-0 bg-gradient-to-t from-foreground/90 via-foreground/30 to-transparent transition-all duration-300 group-hover:from-primary/90 group-hover:via-primary/30" />
                      
                      {/* Shine effect on hover */}
                      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out" />
                      </div>
                      
                      {/* Content with slide-up animation */}
                      <div className="absolute bottom-0 left-0 right-0 p-4 transform transition-transform duration-300">
                        <h3 className="font-display font-semibold text-lg text-white mb-1 transform translate-y-0 group-hover:-translate-y-1 transition-transform duration-300">
                          {category.name}
                        </h3>
                        <p className="text-white/0 text-sm group-hover:text-white/80 transform translate-y-4 group-hover:translate-y-0 transition-all duration-300 delay-75">
                          Bekijk producten →
                        </p>
                      </div>
                      
                      {/* Corner accent */}
                      <div className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transform scale-0 group-hover:scale-100 transition-all duration-300">
                        <ArrowRight className="w-4 h-4 text-white" />
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </div>
        </section>
      </SectionErrorBoundary>

      {/* Featured Products */}
      <SectionErrorBoundary sectionName="Uitgelichte Producten">
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
            
            {!productsLoading && safeFeaturedProducts.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
              >
                <Carousel
                  setApi={setProductsApi}
                  opts={{
                    align: "start",
                    loop: true,
                    dragFree: true,
                  }}
                  className="w-full cursor-grab active:cursor-grabbing"
                >
                  <CarouselContent className="-ml-4">
                    {safeFeaturedProducts.map((product) => (
                      <CarouselItem key={product.id} className="pl-4 basis-full sm:basis-1/2 lg:basis-1/4">
                        <ProductCard product={product as any} />
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                  <CarouselPrevious className="hidden md:flex -left-4 lg:-left-12 bg-card hover:bg-secondary border-2 border-border shadow-soft" />
                  <CarouselNext className="hidden md:flex -right-4 lg:-right-12 bg-card hover:bg-secondary border-2 border-border shadow-soft" />
                </Carousel>
              </motion.div>
            )}

            {!productsLoading && safeFeaturedProducts.length === 0 && (
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
      </SectionErrorBoundary>

      {/* Testimonials */}
      <SectionErrorBoundary sectionName="Reviews">
        <section className="py-20 overflow-hidden">
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
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="relative"
            >
              <Carousel
                setApi={setTestimonialsApi}
                opts={{
                  align: "start",
                  loop: true,
                  dragFree: true,
                }}
                className="w-full cursor-grab active:cursor-grabbing"
              >
                <CarouselContent className="-ml-4">
                  {testimonials.map((testimonial, index) => (
                    <CarouselItem key={index} className="pl-4 md:basis-1/2 lg:basis-1/3">
                      <div className="bg-card p-8 rounded-3xl shadow-soft h-full relative group hover:shadow-soft-lg transition-shadow duration-300">
                        {/* Quote icon */}
                        <div className="absolute -top-3 -left-3 w-10 h-10 rounded-full bg-primary flex items-center justify-center shadow-md">
                          <Quote className="w-5 h-5 text-primary-foreground fill-primary-foreground" />
                        </div>
                        
                        {/* Rating stars */}
                        <div className="flex items-center gap-1 mb-4 pt-2">
                          {[...Array(testimonial.rating)].map((_, i) => (
                            <Star key={i} className="w-4 h-4 fill-warning text-warning" />
                          ))}
                        </div>
                        
                        {/* Testimonial text */}
                        <p className="text-foreground mb-6 leading-relaxed text-base">
                          "{testimonial.text}"
                        </p>
                        
                        {/* Author info */}
                        <div className="flex items-center gap-3 mt-auto">
                          <div className="relative">
                            <img 
                              src={testimonial.avatar} 
                              alt={testimonial.name}
                              loading="lazy"
                              decoding="async"
                              className="w-12 h-12 rounded-full object-cover ring-2 ring-secondary"
                            />
                            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-success flex items-center justify-center">
                              <span className="text-white text-xs">✓</span>
                            </div>
                          </div>
                          <div>
                            <p className="font-semibold">{testimonial.name}</p>
                            <p className="text-sm text-muted-foreground">{testimonial.pet}</p>
                          </div>
                        </div>
                      </div>
                    </CarouselItem>
                  ))}
                </CarouselContent>
                
                {/* Navigation buttons */}
                <CarouselPrevious className="hidden md:flex -left-4 lg:-left-12 bg-card hover:bg-secondary border-2 border-border shadow-soft" />
                <CarouselNext className="hidden md:flex -right-4 lg:-right-12 bg-card hover:bg-secondary border-2 border-border shadow-soft" />
              </Carousel>

              {/* Pagination dots */}
              <div className="flex justify-center gap-2 mt-8">
                {Array.from({ length: slideCount }).map((_, index) => (
                  <button
                    key={index}
                    onClick={() => testimonialsApi?.scrollTo(index)}
                    className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                      currentSlide === index 
                        ? 'bg-primary w-8' 
                        : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
                    }`}
                    aria-label={`Go to slide ${index + 1}`}
                  />
                ))}
              </div>
            </motion.div>
          </div>
        </section>
      </SectionErrorBoundary>

      {/* Recently Viewed Products */}
      {safeRecentlyViewedProducts.length > 0 && (
        <SectionErrorBoundary sectionName="Recent Bekeken">
          <section className="py-20 bg-muted/30">
            <div className="container px-4 md:px-6">
              <motion.div 
                className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-12"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center">
                    <Clock className="w-6 h-6 text-secondary-foreground" />
                  </div>
                  <div>
                    <h2 className="text-3xl md:text-4xl font-display font-bold">Recently Viewed</h2>
                    <p className="text-muted-foreground text-lg">Pick up where you left off</p>
                  </div>
                </div>
              </motion.div>
              
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
              >
                <Carousel
                  opts={{
                    align: "start",
                    loop: false,
                    dragFree: true,
                  }}
                  className="w-full cursor-grab active:cursor-grabbing"
                >
                  <CarouselContent className="-ml-4">
                    {safeRecentlyViewedProducts.map((product) => (
                      <CarouselItem key={product.id} className="pl-4 basis-full sm:basis-1/2 lg:basis-1/4">
                        <ProductCard product={product as any} />
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                  <CarouselPrevious className="hidden md:flex -left-4 lg:-left-12 bg-card hover:bg-secondary border-2 border-border shadow-soft" />
                  <CarouselNext className="hidden md:flex -right-4 lg:-right-12 bg-card hover:bg-secondary border-2 border-border shadow-soft" />
                </Carousel>
              </motion.div>
            </div>
          </section>
        </SectionErrorBoundary>
      )}

      {/* CTA Section */}
      <SectionErrorBoundary sectionName="Nieuwsbrief">
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
                <form onSubmit={handleNewsletterSubmit} className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
                  <input
                    type="email"
                    placeholder="Enter your email"
                    value={newsletterEmail}
                    onChange={(e) => setNewsletterEmail(e.target.value)}
                    className="flex-1 px-5 py-3.5 rounded-full bg-white/15 border border-white/25 placeholder:text-white/60 text-white focus:outline-none focus:ring-2 focus:ring-white/40 backdrop-blur-sm"
                    disabled={isSubscribing}
                  />
                  <Button 
                    type="submit" 
                    variant="secondary" 
                    size="lg" 
                    className="rounded-full px-8"
                    disabled={isSubscribing}
                  >
                    {isSubscribing ? 'Subscribing...' : 'Subscribe'}
                  </Button>
                </form>
                <p className="text-sm text-primary-foreground/70 mt-4">
                  No spam, unsubscribe anytime. We respect your inbox.
                </p>
              </div>
            </motion.div>
          </div>
        </section>
      </SectionErrorBoundary>
    </Layout>
  );
};

export default Index;
