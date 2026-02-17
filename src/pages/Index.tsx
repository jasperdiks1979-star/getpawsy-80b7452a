import { Link } from 'react-router-dom';
import catDogsImg from '@/assets/categories/dogs.jpg';
import catCatsImg from '@/assets/categories/cats.jpg';
import catBirdsImg from '@/assets/categories/birds.jpg';
import catSmallPetsImg from '@/assets/categories/small-pets-new.jpg';
import catReptilesImg from '@/assets/categories/reptiles.jpg';
import catFishImg from '@/assets/categories/fish.jpg';
import guideCatLitterImg from '@/assets/guides/guide-cat-litter.jpg';
import guideDogBedsImg from '@/assets/guides/guide-dog-beds.jpg';
import guideLitterFurnitureImg from '@/assets/guides/guide-litter-furniture.jpg';
import { Helmet } from 'react-helmet-async';
import { ArrowRight, Loader2, Star, Clock, BookOpen, Truck, ShieldCheck, RotateCcw, Heart } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Layout } from '@/components/layout/Layout';
import { ProductCard } from '@/components/products/ProductCard';
import { Button } from '@/components/ui/button';
import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from '@/components/ui/carousel';
import { supabase } from '@/integrations/supabase/client';
import { dedupeProducts } from '@/lib/dedupe-products';
import { useState, useEffect, useRef, useMemo } from 'react';
import type { CarouselApi } from '@/components/ui/carousel';
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed';
import { trackNewsletterSignup } from '@/lib/analytics';
import { toast } from 'sonner';

import { BestsellersSection } from '@/components/home/BestsellersSection';
import { AnimatedTrustBadges } from '@/components/home/AnimatedTrustBadges';
import { PremiumNicheGrid } from '@/components/home/PremiumNicheGrid';
import { SectionErrorBoundary } from '@/components/ui/section-error-boundary';
import { WebsiteSchema, LocalBusinessSchema } from '@/components/seo';
import { safeString, safePrice, safeNumber, safeProduct, SafeProduct } from '@/lib/safe-render';
import { initPageDebug, logDataSanitization, createSectionDebugger } from '@/lib/debug-logger';
import { useCriticalImagePreload, prefetchImages } from '@/hooks/useCriticalImagePreload';
import { getAnchorText } from '@/lib/anchor-text-helper';
// FREE_SHIPPING_THRESHOLD and RETURN_WINDOW_DAYS are now used directly in AnimatedTrustBadges

// Debug loggers for each section
const categoriesDebug = createSectionDebugger('Categories');
const productsDebug = createSectionDebugger('FeaturedProducts');
const recentlyViewedDebug = createSectionDebugger('RecentlyViewed');


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

  // Featured products carousel state
  const [productsApi, setProductsApi] = useState<CarouselApi>();

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
        .order('created_at', { ascending: false })
        .limit(12);
      
      if (error) throw error;
      return dedupeProducts(data || []);
    },
  });

   const { data: categories, isLoading: categoriesLoading } = useQuery({
     queryKey: ['homepage-categories'],
     queryFn: async () => {
       // Fetch parent categories
       const { data: categoriesData, error } = await supabase
         .from('categories')
         .select('*')
         .is('parent_id', null)
         .order('display_order', { ascending: true });
       
       if (error) throw error;
       if (!categoriesData) return [];
 
       // Fetch active products to calculate counts
       // products_public view already filters is_active=true AND is_duplicate=false
        const { data: productsData } = await supabase
          .from('products_public')
          .select('category');
 
       // Fetch all subcategories to map products to parent categories
       const { data: allCategories } = await supabase
         .from('categories')
         .select('id, parent_id, name, slug');
 
        // Build a recursive mapping to find the ROOT parent category for any category
        // This handles multi-level hierarchies (e.g., Small Pets > Hamsters > Hamster Cages)
        const findRootParent = (categoryId: string, visited = new Set<string>()): string | null => {
          if (visited.has(categoryId)) return null; // Prevent infinite loops
          visited.add(categoryId);
          
          const cat = allCategories?.find(c => c.id === categoryId);
          if (!cat) return null;
          if (!cat.parent_id) return categoryId; // This is a root category
          return findRootParent(cat.parent_id, visited);
        };
        
        // Build a mapping of category name/slug to ROOT parent category ID
        const catToRootParentMap: Record<string, string> = {};
        allCategories?.forEach(cat => {
          const rootParentId = findRootParent(cat.id);
          if (rootParentId && rootParentId !== cat.id) {
            // Map by both name and slug for flexible matching
            catToRootParentMap[cat.name.toLowerCase().trim()] = rootParentId;
            if (cat.slug) {
              catToRootParentMap[cat.slug.toLowerCase().trim()] = rootParentId;
            }
          }
        });
 
       // Count products per parent category
       const parentCountMap: Record<string, number> = {};
       productsData?.forEach(p => {
         if (p.category) {
           const normalizedCat = p.category.toLowerCase().trim();
           
           // Check if this is a direct match to a parent category
           const parentMatch = categoriesData.find(
             parent => parent.name.toLowerCase().trim() === normalizedCat ||
                       parent.slug?.toLowerCase().trim() === normalizedCat
           );
           
           if (parentMatch) {
             parentCountMap[parentMatch.id] = (parentCountMap[parentMatch.id] || 0) + 1;
           } else {
              // Check if product category matches any descendant category
              const parentId = catToRootParentMap[normalizedCat];
             if (parentId) {
               parentCountMap[parentId] = (parentCountMap[parentId] || 0) + 1;
             }
           }
         }
       });
 
       // Add product counts to categories
       const categoriesWithCounts = categoriesData.map(cat => ({
         ...cat,
         product_count: parentCountMap[cat.id] || 0,
       }));
 
       // Only return categories with at least 1 product
       // This prevents "dead end" navigation
        return categoriesWithCounts.filter(cat => cat.product_count > 0);
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
        .eq('is_active', true);
      
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
    'Dogs': catDogsImg,
    'Cats': catCatsImg,
    'Birds': catBirdsImg,
    'Fish & Aquarium': catFishImg,
    'Small Pets': catSmallPetsImg,
    'Reptiles': catReptilesImg,
    'Toys': '/categories/toys.jpg',
    'Food': '/categories/food.jpg',
    'Grooming': '/categories/grooming.jpg',
    'Accessories': '/categories/accessories.jpg',
  };

  return (
    <Layout>
      <Helmet>
        <title>GetPawsy | Trusted Pet Products with Fast US Shipping</title>
        <meta name="description" content="Shop thoughtfully selected pet products for dogs and cats. Fast US shipping, free over $35, and 30-day hassle-free returns." />
        <link rel="canonical" href="https://getpawsy.pet" />
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
        <meta property="og:title" content="GetPawsy | Trusted Pet Products with Fast US Shipping" />
        <meta property="og:description" content="Shop thoughtfully selected pet products for dogs and cats. Fast US shipping, free over $35, and 30-day hassle-free returns." />
        <meta property="og:url" content="https://getpawsy.pet" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="GetPawsy | Trusted Pet Products with Fast US Shipping" />
        <meta name="twitter:description" content="Shop thoughtfully selected pet products for dogs and cats. Fast US shipping, free over $35, and 30-day hassle-free returns." />
      </Helmet>
      <WebsiteSchema />
      <LocalBusinessSchema />
      {/* Hero Section - Clean, Premium, Trust-Building */}
      <section ref={heroRef} className="relative overflow-hidden min-h-[85vh] flex items-center">
        {/* Lifestyle Background - Calm home setting with pet */}
        <div className="absolute inset-0 z-0">
          <img
            src="https://images.unsplash.com/photo-1601758174114-e711c0cbaa69?w=1200&q=80&auto=format"
            srcSet="https://images.unsplash.com/photo-1601758174114-e711c0cbaa69?w=640&q=75&auto=format 640w, https://images.unsplash.com/photo-1601758174114-e711c0cbaa69?w=1024&q=80&auto=format 1024w, https://images.unsplash.com/photo-1601758174114-e711c0cbaa69?w=1920&q=85&auto=format 1920w"
            sizes="100vw"
            alt="Happy dog relaxing at home with premium pet products"
            width={1920}
            height={1080}
            className="w-full h-full object-cover object-center"
            loading="eager"
            fetchPriority="high"
            decoding="async"
            style={{ aspectRatio: '16/9' }}
          />
          {/* Warm, soft gradient overlay - not harsh */}
          <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/75 to-background/30" />
          <div className="absolute inset-0 bg-gradient-to-t from-background/40 via-transparent to-transparent" />
        </div>
        
        {/* Subtle warm blur accents */}
        <div className="absolute top-1/4 right-1/4 w-72 h-72 bg-sand/40 rounded-full blur-3xl z-0" />
        <div className="absolute bottom-1/3 left-1/6 w-96 h-96 bg-secondary/20 rounded-full blur-3xl z-0" />
        
        <motion.div 
          className="container relative z-10 px-4 md:px-6 py-16 md:py-24"
          style={{ opacity: heroOpacity }}
        >
          <div className="max-w-2xl">
            <motion.div 
              className="space-y-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              style={{ y: heroContentY }}
            >
              {/* Simple, warm headline */}
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold text-foreground leading-[1.1] tracking-tight">
                Trusted Pet Products,
                <br />
                <span className="text-primary">Delivered Fast</span>
              </h1>
              
              {/* Clear, benefit-focused subline */}
              <p className="text-lg md:text-xl text-muted-foreground max-w-lg leading-relaxed">
                Premium everyday essentials for dogs and cats. 
                Free US shipping over $35. 30-day hassle-free returns.
              </p>
              
              {/* Primary CTAs — authority flow to cornerstones */}
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <Link to="/bestsellers">
                  <Button size="lg" className="gap-2 rounded-full px-10 py-6 text-base font-semibold shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105">
                    Shop Bestsellers
                    <ArrowRight className="w-5 h-5" />
                  </Button>
                </Link>
                <Link to="/products">
                  <Button size="lg" variant="outline" className="gap-2 rounded-full px-8 py-6 text-base font-semibold">
                    Browse All
                  </Button>
                </Link>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* Animated Trust Badges */}
      <SectionErrorBoundary sectionName="Features">
        <AnimatedTrustBadges />
      </SectionErrorBoundary>

      {/* Popular Guides - SEO Authority Injection */}
      <SectionErrorBoundary sectionName="Popular Guides">
        <section className="py-20 bg-sand/30">
          <div className="container px-4 md:px-6">
            <motion.div
              className="text-center mb-12"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-3xl md:text-4xl font-display font-bold mb-3">Trusted Buying Guides</h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                Vet-backed & updated 2026 — expert-tested picks for your pet
              </p>
            </motion.div>
            <motion.div
              className="grid grid-cols-1 md:grid-cols-3 gap-6"
              variants={containerVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
            >
              {[
                {
                  slug: 'best-cat-litter-box-2026',
                  title: 'Best Cat Litter Boxes (2026)',
                  desc: '12 tested picks for odor control, large cats & multi-cat homes.',
                  image: guideCatLitterImg,
                },
                {
                  slug: 'best-dog-bed-2026',
                  title: 'Best Dog Beds (2026)',
                  desc: 'Orthopedic, calming & durable picks tested by real dog owners.',
                  image: guideDogBedsImg,
                },
                {
                  slug: 'best-cat-litter-box-furniture-enclosures-2026',
                  title: 'Best Litter Box Furniture (2026)',
                  desc: 'Hidden enclosures & cabinets that blend into your home décor.',
                  image: guideLitterFurnitureImg,
                },
              ].map((guide) => (
                <motion.div key={guide.slug} variants={itemVariants}>
                  <Link
                    to={`/guides/${guide.slug}`}
                    className="group block bg-card rounded-2xl overflow-hidden shadow-soft hover:shadow-soft-lg transition-all duration-500 hover:-translate-y-1.5 border border-border/50"
                  >
                    <div className="relative aspect-[16/10] overflow-hidden">
                      <img
                        src={guide.image}
                        alt={guide.title}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                        loading="lazy"
                        decoding="async"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                    </div>
                    <div className="p-6">
                      <h3 className="font-display font-bold text-lg text-foreground group-hover:text-primary transition-colors mb-2 leading-snug">
                        {getAnchorText(guide.slug, 'hero-insert')}
                      </h3>
                      <p className="text-sm text-muted-foreground leading-relaxed mb-4">{guide.desc}</p>
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary group-hover:gap-2.5 transition-all duration-300">
                        Read Guide <ArrowRight className="w-4 h-4" />
                      </span>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </motion.div>
            <div className="text-center mt-10">
              <Link to="/guides">
                <Button variant="outline" className="gap-2 rounded-full">
                  View All Guides
                  <BookOpen className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </SectionErrorBoundary>

      {/* Bestsellers Section */}
      <SectionErrorBoundary sectionName="Bestsellers">
        <BestsellersSection />
      </SectionErrorBoundary>

      {/* Categories */}
      <SectionErrorBoundary sectionName="Categories">
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
                      {/* Image with zoom effect - use categoryImages map as primary source */}
                      <img 
                        src={categoryImages[category.name] || category.image_url || '/categories/dogs.jpg'}
                        alt={`${category.name} - Shop premium ${category.name.toLowerCase()} products for pets`}
                        width={400}
                        height={400}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-115"
                        onError={(e) => { e.currentTarget.src = '/placeholder.svg'; }}
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
                          View products →
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
      <SectionErrorBoundary sectionName="Featured Products">
        <section className="py-20 bg-sand/40">
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
                <Link to="/dashboard">
                  <Button className="rounded-full">Go to Admin</Button>
                </Link>
              </div>
            )}
          </div>
        </section>
      </SectionErrorBoundary>


      {/* Why Choose GetPawsy — Trust & Value Props */}
      <SectionErrorBoundary sectionName="Why Choose">
        <section className="py-20 bg-sand/30">
          <div className="container px-4 md:px-6">
            <motion.div 
              className="text-center mb-12"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-3xl md:text-4xl font-display font-bold mb-3">Why Pet Parents Choose GetPawsy</h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                We believe every pet deserves quality — without the premium markup
              </p>
            </motion.div>

            <motion.div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              {[
                {
                  icon: ShieldCheck,
                  title: 'Tested & Vetted',
                  desc: 'Every product is researched and evaluated before it hits our shelves. No filler, no junk.',
                },
                {
                  icon: Truck,
                  title: 'Free US Shipping Over $35',
                  desc: 'Fast, reliable delivery across the US. Most orders ship within 1–2 business days.',
                },
                {
                  icon: RotateCcw,
                  title: '30-Day Easy Returns',
                  desc: 'Not the right fit? Send it back hassle-free. We make returns simple and painless.',
                },
                {
                  icon: Heart,
                  title: 'Built for Pet Parents',
                  desc: 'Our buying guides, expert reviews, and hand-picked products help you choose with confidence.',
                },
              ].map((item, i) => (
                <motion.div
                  key={item.title}
                  className="bg-card rounded-2xl p-6 shadow-soft hover:shadow-soft-lg transition-shadow duration-300 border border-border/50 text-center"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.1 }}
                >
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <item.icon className="w-7 h-7 text-primary" />
                  </div>
                  <h3 className="font-display font-semibold text-lg mb-2">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>
      </SectionErrorBoundary>

      {/* Revenue Niches — Premium Lifestyle Grid */}
      <SectionErrorBoundary sectionName="Revenue Niches">
        <PremiumNicheGrid />
      </SectionErrorBoundary>

      {safeRecentlyViewedProducts.length > 0 && (
        <SectionErrorBoundary sectionName="Recently Viewed">
          <section className="py-20 bg-sand/40">
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

      {/* Explore Our Expert Pet Guides — Mid-Page Authority Grid (6 links) */}
      <SectionErrorBoundary sectionName="Expert Guides">
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
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <BookOpen className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-3xl md:text-4xl font-display font-bold">Explore Our Expert Pet Guides</h2>
                  <p className="text-muted-foreground text-lg">In-depth buying guides tested by real pet owners</p>
                </div>
              </div>
              <Link to="/guides" className="group flex items-center gap-2 text-primary font-semibold hover:underline">
                View all guides <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </motion.div>

            <motion.div
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              {/* Cornerstones — semantic anchors */}
              {[
                { slug: 'best-cat-litter-box-2026', badge: 'Cornerstone Guide', desc: '12 tested picks for odor control, large cats & multi-cat homes — with pros & cons.' },
                { slug: 'best-dog-bed-2026', badge: 'Cornerstone Guide', desc: 'Orthopedic, calming & durable beds tested with real dogs of all sizes.' },
                { slug: 'best-cat-trees-2026', badge: 'Cornerstone Guide', desc: '9 cat trees tested for stability, enrichment & value. Large cats, budget picks & condos vs trees.' },
              ].map((guide) => (
                <Link
                  key={guide.slug}
                  to={`/guides/${guide.slug}`}
                  className="group bg-card rounded-2xl border border-border p-6 hover:border-primary/30 hover:shadow-soft transition-all"
                >
                  <span className="text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-full">{guide.badge}</span>
                  <h3 className="font-display font-bold text-lg mt-3 mb-2 group-hover:text-primary transition-colors">
                    {getAnchorText(guide.slug, 'mid-page-cornerstone')}
                  </h3>
                  <p className="text-sm text-muted-foreground line-clamp-2">{guide.desc}</p>
                </Link>
              ))}
              {/* Hubs — partial anchors */}
              {[
                { slug: 'how-many-litter-boxes-per-cat', badge: 'Expert Advice', desc: 'The vet-backed n+1 rule explained with real placement tips.' },
                { slug: 'best-orthopedic-dog-bed', badge: 'Buying Guide', desc: 'Joint-support beds tested for senior dogs and large breeds.' },
                { slug: 'best-cat-trees-small-apartments', badge: 'Space-Saving', desc: '7 compact cat trees tested in real apartments under 600 sq ft.' },
                { slug: 'best-cat-litter-box-furniture-enclosures-2026', badge: 'Buying Guide', desc: '8 litter box enclosures tested for odor control and home décor.' },
              ].map((guide) => (
                <Link
                  key={guide.slug}
                  to={`/guides/${guide.slug}`}
                  className="group bg-card rounded-2xl border border-border p-6 hover:border-primary/30 hover:shadow-soft transition-all"
                >
                  <span className="text-xs font-medium text-accent-foreground bg-accent/60 px-2.5 py-1 rounded-full">{guide.badge}</span>
                  <h3 className="font-display font-bold text-lg mt-3 mb-2 group-hover:text-primary transition-colors">
                    {getAnchorText(guide.slug, 'mid-page-hub')}
                  </h3>
                  <p className="text-sm text-muted-foreground line-clamp-2">{guide.desc}</p>
                </Link>
              ))}
            </motion.div>
          </div>
        </section>
      </SectionErrorBoundary>

      {/* CTA Section */}
      <SectionErrorBoundary sectionName="Newsletter">
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
