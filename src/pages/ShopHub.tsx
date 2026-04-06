import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/layout/Layout';
import { SITE_URL } from '@/lib/constants';
import { ArrowRight } from 'lucide-react';

const CATEGORY_SECTIONS = [
  {
    title: '🐕 Dog Supplies',
    categories: [
      { name: 'Dog Toys', slug: 'dog-toys', description: 'Interactive & durable toys for every breed' },
      { name: 'Dog Beds', slug: 'dog-beds', description: 'Orthopedic, elevated & calming beds' },
      { name: 'Dog Carriers', slug: 'dog-carriers', description: 'Travel carriers, strollers & car seats' },
      { name: 'Collars & Leashes', slug: 'dog-collars-leashes', description: 'Training collars, harnesses & leashes' },
      { name: 'Dog Bowls', slug: 'dog-bowls', description: 'Slow feeders, elevated bowls & fountains' },
      { name: 'Dog Grooming', slug: 'dog-grooming', description: 'Brushes, shampoos & grooming tools' },
    ],
  },
  {
    title: '🐈 Cat Supplies',
    categories: [
      { name: 'Cat Toys', slug: 'cat-toys', description: 'Feather teasers, laser & interactive toys' },
      { name: 'Cat Trees & Condos', slug: 'cat-trees-and-condos', description: 'Scratching posts, towers & condos' },
      { name: 'Cat Litter Boxes', slug: 'cat-litter-boxes', description: 'Self-cleaning & enclosed litter solutions' },
      { name: 'Cat Carriers', slug: 'cat-carriers', description: 'Backpack carriers & travel crates' },
      { name: 'Cat Feeders', slug: 'automatic-cat-feeders', description: 'Automatic feeders & water fountains' },
    ],
  },
];

export default function ShopHub() {
  const { data: featuredProducts } = useQuery({
    queryKey: ['shop-hub-featured'],
    queryFn: async () => {
      const { data } = await supabase
        .from('products_public')
        .select('id, name, slug, price, image_url, category')
        .eq('is_active', true)
        .not('image_url', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(12);
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const canonicalUrl = `${SITE_URL}/shop`;

  return (
    <Layout>
      <Helmet>
        <title>Shop Pet Supplies – Dog & Cat Products | GetPawsy</title>
        <meta name="description" content="Browse all pet supplies at GetPawsy. Shop dog toys, beds, carriers, cat trees, litter boxes and more. Free shipping on qualifying orders." /><meta name="robots" content="index, follow" />
      </Helmet>

      <div className="max-w-7xl mx-auto px-4 py-8 sm:py-12">
        {/* Hero */}
        <header className="text-center mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-3">
            Shop All Pet Supplies
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto text-base sm:text-lg">
            Discover premium dog and cat products — from interactive toys and orthopedic beds to travel carriers and grooming essentials. Everything your pet needs, all in one place.
          </p>
          <div className="flex justify-center gap-4 mt-6">
            <Link to="/products" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition">
              Browse All Products <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </header>

        {/* Category Sections */}
        {CATEGORY_SECTIONS.map((section) => (
          <section key={section.title} className="mb-12">
            <h2 className="text-2xl font-bold text-foreground mb-6">{section.title}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {section.categories.map((cat) => (
                <Link
                  key={cat.slug}
                  to={`/collections/${cat.slug}`}
                  className="group p-4 rounded-xl border border-border bg-card hover:border-primary/50 hover:shadow-md transition-all duration-200"
                >
                  <h3 className="font-semibold text-foreground text-sm group-hover:text-primary transition-colors">{cat.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{cat.description}</p>
                </Link>
              ))}
            </div>
          </section>
        ))}

        {/* Featured Products */}
        {featuredProducts && featuredProducts.length > 0 && (
          <section className="mb-12">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-foreground">Featured Products</h2>
              <Link to="/products" className="text-sm text-primary hover:underline flex items-center gap-1">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {featuredProducts.map((product) => (
                <Link
                  key={product.id}
                  to={`/product/${product.slug || product.id}`}
                  className="group rounded-xl border border-border bg-card overflow-hidden hover:shadow-md transition-shadow"
                >
                  {product.image_url && (
                    <div className="aspect-square bg-muted overflow-hidden">
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                        width={300}
                        height={300}
                      />
                    </div>
                  )}
                  <div className="p-3">
                    <h3 className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors">{product.name}</h3>
                    <p className="text-sm font-bold text-foreground mt-1">${(Number(product.price) || 0).toFixed(2)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Quick Links for SEO */}
        <section className="border-t border-border pt-8">
          <h2 className="text-lg font-bold text-foreground mb-4">Quick Links</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Link to="/trending-pet-products" className="text-primary hover:underline">Trending Products</Link>
            <Link to="/recent-products" className="text-primary hover:underline">Recent Products</Link>
            <Link to="/bestsellers" className="text-primary hover:underline">Bestsellers</Link>
            <Link to="/guides" className="text-primary hover:underline">Pet Care Guides</Link>
            <Link to="/collections/dog" className="text-primary hover:underline">Dog Training Guides</Link>
            <Link to="/collections/dog" className="text-primary hover:underline">Dog Travel Guides</Link>
            <Link to="/collections/cat" className="text-primary hover:underline">Cat Training Guides</Link>
            <Link to="/collections/cat" className="text-primary hover:underline">Cat Travel Guides</Link>
            <Link to="/blog" className="text-primary hover:underline">Pet Care Blog</Link>
            <Link to="/products" className="text-primary hover:underline">All Products</Link>
          </div>
        </section>
      </div>
    </Layout>
  );
}
