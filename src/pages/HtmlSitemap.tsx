import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { SITE_URL } from '@/lib/constants';
import { CANONICAL_CATEGORIES } from '@/lib/canonical-category-registry';

/**
 * HTML Sitemap — crawlable directory of all indexable pages.
 * Linked from footer, helps search engines discover deep pages.
 */
export default function HtmlSitemap() {
  const { data: products = [] } = useQuery({
    queryKey: ['html-sitemap-products'],
    queryFn: async () => {
      const { data } = await supabase
        .from('products_public')
        .select('name, slug')
        .eq('is_active', true)
        .not('slug', 'is', null)
        .order('name')
        .limit(500);
      return data || [];
    },
    staleTime: 10 * 60 * 1000,
  });

  // Only show categories with confirmed inventory from the canonical registry
  const categories = CANONICAL_CATEGORIES
    .filter(c => c.active && c.hasInventory)
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map(c => ({ name: c.label, slug: c.key, url: c.url }));

  const { data: guides = [] } = useQuery({
    queryKey: ['html-sitemap-guides'],
    queryFn: async () => {
      const { data } = await supabase
        .from('published_guides')
        .select('title, slug')
        .eq('is_published', true)
        .order('published_at', { ascending: false })
        .limit(200);
      return data || [];
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data: blogPosts = [] } = useQuery({
    queryKey: ['html-sitemap-blog'],
    queryFn: async () => {
      const { data } = await supabase
        .from('blog_posts')
        .select('title, slug')
        .eq('is_published', true)
        .order('published_at', { ascending: false })
        .limit(200);
      return data || [];
    },
    staleTime: 10 * 60 * 1000,
  });

  const staticPages = [
    { label: 'Home', href: '/' },
    { label: 'Shop All', href: '/shop' },
    { label: 'All Products', href: '/products' },
    { label: 'Trending Products', href: '/trending-pet-products' },
    { label: 'Recent Products', href: '/recent-products' },
    { label: 'Bestsellers', href: '/bestsellers' },
    { label: 'Pet Care Guides', href: '/guides' },
    { label: 'Blog', href: '/blog' },
    { label: 'About Us', href: '/about' },
    { label: 'Contact', href: '/contact' },
    { label: 'FAQ', href: '/faq' },
    { label: 'Help Center', href: '/help' },
    { label: 'Shipping Policy', href: '/shipping' },
    { label: 'Returns & Refunds', href: '/returns' },
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Terms of Service', href: '/terms' },
    { label: 'Dog Hub', href: '/dog' },
    { label: 'Cat Hub', href: '/cat' },
  ];

  const canonicalUrl = `${SITE_URL}/site-map`;

  return (
    <>
      <Helmet>
        <title>Site Map | GetPawsy – All Pages Directory</title>
        <meta name="description" content="Browse the full GetPawsy site directory. Find all products, collections, pet care guides, and informational pages in one place." /><meta name="robots" content="index,follow" />
      </Helmet>

      <div className="container px-4 py-12 max-w-5xl">
        <h1 className="text-3xl font-display font-bold mb-2">Site Map</h1>
        <p className="text-muted-foreground mb-10">
          A complete directory of all pages on GetPawsy.pet.
        </p>

        <div className="grid md:grid-cols-2 gap-10">
          {/* Static Pages */}
          <section>
            <h2 className="text-xl font-semibold mb-4 border-b pb-2">Main Pages</h2>
            <ul className="space-y-1.5">
              {staticPages.map(page => (
                <li key={page.href}>
                  <Link to={page.href} className="text-primary hover:underline text-sm">
                    {page.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {/* Collections */}
          <section>
            <h2 className="text-xl font-semibold mb-4 border-b pb-2">Collections ({categories.length})</h2>
            <ul className="space-y-1.5">
              {categories.map(cat => (
                <li key={cat.slug}>
                  <Link to={cat.url} className="text-primary hover:underline text-sm">
                    {cat.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {/* Guides */}
          <section>
            <h2 className="text-xl font-semibold mb-4 border-b pb-2">Pet Care Guides ({guides.length})</h2>
            <ul className="space-y-1.5">
              {guides.map(guide => (
                <li key={guide.slug}>
                  <Link to={`/guides/${guide.slug}`} className="text-primary hover:underline text-sm">
                    {guide.title || guide.slug}
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {/* Blog */}
          <section>
            <h2 className="text-xl font-semibold mb-4 border-b pb-2">Blog Posts ({blogPosts.length})</h2>
            <ul className="space-y-1.5">
              {blogPosts.map(post => (
                <li key={post.slug}>
                  <Link to={`/blog/${post.slug}`} className="text-primary hover:underline text-sm">
                    {post.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {/* Products */}
          <section className="md:col-span-2">
            <h2 className="text-xl font-semibold mb-4 border-b pb-2">Products ({products.length})</h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5">
              {products.map(product => (
                <li key={product.slug}>
                  <Link to={`/product/${product.slug}`} className="text-primary hover:underline text-sm">
                    {product.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
