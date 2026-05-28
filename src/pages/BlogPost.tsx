import { useParams, Link, Navigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/layout/Layout';
import { Badge } from '@/components/ui/badge';
import { BlogProductInjector } from '@/components/authority/BlogProductInjector';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar, Clock, User, Share2, BookOpen, ShoppingBag, Home, ArrowLeft } from 'lucide-react';
import { BlogPostDetailSkeleton } from '@/components/blog/BlogPostDetailSkeleton';
import { format } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { generateBlogMetaDescription } from '@/lib/seo-keywords';
import { useInternalLinking } from '@/hooks/useInternalLinking';
import { sanitizeHtml } from '@/lib/sanitize';
import { ArticleSchema } from '@/components/seo/ArticleSchema';
import { SoftEmailCapture } from '@/components/email/SoftEmailCapture';
import { BlogCategoryLinks } from '@/components/seo/BlogCategoryLinks';
import { getBlogRedirectTarget, isBlogNoindexed } from '@/lib/blog-consolidation';
import { ReadingProgressBar } from '@/components/reading/ReadingProgressBar';
import { getConversionFlag } from '@/lib/conversionFlags';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  featured_image: string | null;
  category: string;
  tags: string[];
  author_name: string;
  published_at: string | null;
  created_at: string;
  reading_time_minutes: number;
  meta_title: string | null;
  meta_description: string | null;
  meta_keywords: string[] | null;
  cluster_primary: string | null;
}

interface Product {
  id: string;
  name: string;
  price: number;
  compare_at_price: number | null;
  image_url: string | null;
  category: string | null;
}

const categoryColors: Record<string, string> = {
  Dogs: 'bg-amber-100 text-amber-700',
  Cats: 'bg-pink-100 text-pink-700',
  Fish: 'bg-blue-100 text-blue-700',
  General: 'bg-emerald-100 text-emerald-700',
  Guides: 'bg-purple-100 text-purple-700',
  Health: 'bg-red-100 text-red-700',
};

// Map blog categories to product categories
const blogToProductCategories: Record<string, string[]> = {
  Dogs: ['Pet Food', 'Pet Toys', 'Pet Accessories', 'Pet Training'],
  Cats: ['Pet Food', 'Pet Toys', 'Cat Trees', 'Pet Accessories'],
  Fish: ['Fish Tank', 'Pet Food', 'Pet Accessories'],
  General: ['Pet Toys', 'Pet Accessories', 'Pet Food'],
  Health: ['Pet Grooming', 'Pet Accessories', 'Pet Food'],
  Guides: ['Pet Toys', 'Pet Training', 'Pet Accessories'],
};

const BlogPostPage = () => {
  const { slug } = useParams<{ slug: string }>();

  // Blog pruning: redirect consolidated slugs to canonical target
  const redirectTarget = slug ? getBlogRedirectTarget(slug) : null;

  // Check if this post should be noindexed (thin/low-value content)
  const shouldNoindex = slug ? isBlogNoindexed(slug) : false;

  const { data: post, isLoading, error } = useQuery({
    queryKey: ['blog-post', slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blog_posts')
        .select('*')
        .eq('slug', slug)
        .eq('is_published', true)
        .single();

      if (error) throw error;
      return data as BlogPost;
    },
    enabled: !!slug,
  });

  // Fetch related blog posts (same category, different slug)
  const { data: relatedPosts } = useQuery({
    queryKey: ['related-posts', post?.category, post?.slug],
    queryFn: async () => {
      if (!post?.category || !post?.slug) return [];
      
      const { data, error } = await supabase
        .from('blog_posts')
        .select('id, title, slug, excerpt, featured_image, category, reading_time_minutes, published_at')
        .eq('is_published', true)
        .eq('category', post.category)
        .neq('slug', post.slug)
        .order('published_at', { ascending: false })
        .limit(3);

      if (error) {
        // Fallback: get any published posts except current
        const { data: fallbackData } = await supabase
          .from('blog_posts')
          .select('id, title, slug, excerpt, featured_image, category, reading_time_minutes, published_at')
          .eq('is_published', true)
          .neq('slug', post.slug)
          .order('published_at', { ascending: false })
          .limit(3);
        return fallbackData || [];
      }
      
      // If not enough posts in same category, get more from other categories
      if (data.length < 3) {
        const { data: morePosts } = await supabase
          .from('blog_posts')
          .select('id, title, slug, excerpt, featured_image, category, reading_time_minutes, published_at')
          .eq('is_published', true)
          .neq('slug', post.slug)
          .neq('category', post.category)
          .order('published_at', { ascending: false })
          .limit(3 - data.length);
        
        return [...data, ...(morePosts || [])];
      }
      
      return data;
    },
    enabled: !!post?.category && !!post?.slug,
  });

  // Fetch related products based on blog category
  const { data: relatedProducts } = useQuery({
    queryKey: ['related-products', post?.category],
    queryFn: async () => {
      if (!post?.category) return [];
      
      const relevantCategories = blogToProductCategories[post.category] || [];
      
      // Fetch products that match the relevant categories
      let query = supabase
        .from('products_public')
        .select('id, name, price, compare_at_price, image_url, category')
        .eq('is_active', true)
        .limit(8);

      // If we have relevant categories, filter by them
      if (relevantCategories.length > 0) {
        // Use ilike for case-insensitive matching
        const categoryFilters = relevantCategories.map(cat => `category.ilike.%${cat}%`);
        query = supabase
          .from('products_public')
          .select('id, name, price, compare_at_price, image_url, category')
          .eq('is_active', true)
          .or(categoryFilters.join(','))
          .limit(8);
      }

      const { data, error } = await query;
      if (error) {
        // Fallback: get any active products
        const { data: fallbackData } = await supabase
          .from('products_public')
          .select('id, name, price, compare_at_price, image_url, category')
          .eq('is_active', true)
          .limit(8);
        return (fallbackData || []) as Product[];
      }
      
      return (data || []) as Product[];
    },
    enabled: !!post?.category,
  });

  const handleShare = async () => {
    if (navigator.share && post) {
      await navigator.share({
        title: post.title,
        text: post.excerpt,
        url: window.location.href,
      });
    }
  };

  // Apply internal linking to content for better SEO
  // IMPORTANT: This hook MUST be called unconditionally before any early returns
  const { processedContent: linkedContent } = useInternalLinking(post?.content || '', {
    maxLinksPerKeyword: 2,  // Allow same keyword to be linked twice for longer articles
    maxTotalLinks: 12,      // More links for comprehensive SEO coverage
    minWordsBetweenLinks: 30, // Reduced for more natural linking in longer content
    enabled: !!post?.content,
  });

  // Render content - supports both HTML (from rich text editor) and legacy markdown
  // This is a regular function, not a hook, so it can be defined anywhere
  const renderContent = (content: string) => {
    // Use linked content for HTML content
    const contentToRender = linkedContent || content;
    
    // Check if content is HTML (from rich text editor)
    if (contentToRender.includes('<p>') || contentToRender.includes('<h1>') || contentToRender.includes('<h2>') || contentToRender.includes('<ul>') || contentToRender.includes('<ol>')) {
      return (
        <div 
          className="blog-content"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(contentToRender) }}
        />
      );
    }
    
    // Legacy markdown-like content parsing
    return content
      .split('\n')
      .map((line, i) => {
        if (line.startsWith('## ')) {
          return <h2 key={i} className="text-2xl font-bold mt-8 mb-4">{line.slice(3)}</h2>;
        }
        if (line.startsWith('### ')) {
          return <h3 key={i} className="text-xl font-semibold mt-6 mb-3">{line.slice(4)}</h3>;
        }
        if (line.startsWith('#### ')) {
          return <h4 key={i} className="text-lg font-semibold mt-4 mb-2">{line.slice(5)}</h4>;
        }
        if (line.startsWith('- ')) {
          return <li key={i} className="ml-6 mb-1">{line.slice(2)}</li>;
        }
        if (line.startsWith('✅ ') || line.startsWith('⚠️ ') || line.startsWith('🐠 ') || line.startsWith('🐕 ') || line.startsWith('🌟 ') || line.startsWith('🛁 ')) {
          return <p key={i} className="mb-2">{line}</p>;
        }
        if (line.match(/^\d+\. /)) {
          return <li key={i} className="ml-6 mb-1 list-decimal">{line.replace(/^\d+\. /, '')}</li>;
        }
        if (line.startsWith('**') && line.endsWith('**')) {
          return <p key={i} className="font-bold mb-2">{line.slice(2, -2)}</p>;
        }
        if (line.startsWith('|')) {
          return null; // Skip table rows for simplicity
        }
        if (line.trim() === '') {
          return <br key={i} />;
        }
        // Handle inline bold
        const formattedLine = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        return <p key={i} className="mb-3" dangerouslySetInnerHTML={{ __html: sanitizeHtml(formattedLine) }} />;
      });
  };

  // Early returns MUST be after all hooks to comply with React hooks rules
  // Blog consolidation redirect (after all hooks)
  if (redirectTarget) {
    return <Navigate to={`/blog/${redirectTarget}`} replace />;
  }

  if (isLoading) {
    return (
      <Layout>
        <BlogPostDetailSkeleton />
      </Layout>
    );
  }

  if (error || !post) {
    return (
      <Layout>
        <div className="container py-12 text-center">
          <BookOpen className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Article Not Found</h2>
          <p className="text-muted-foreground mb-6">This article doesn't exist or is no longer available.</p>
          <Link to="/blog">
            <Button>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Blog
            </Button>
          </Link>
        </div>
      </Layout>
    );
  }

  // jsonLd is now handled by ArticleSchema component

  // Generate smart meta description using the new function
  const metaDescription = post.meta_description || generateBlogMetaDescription(post.title, post.excerpt, post.category);

  return (
    <Layout>
      <Helmet>
        <title>{post.meta_title || post.title} | GetPawsy Blog</title>
        <meta name="description" content={metaDescription} />
        <meta name="keywords" content={post.meta_keywords?.join(', ') || post.tags.join(', ')} />{/* Hreflang Tags */}
        <link rel="alternate" hrefLang="en" href={`https://getpawsy.pet/blog/${post.slug}`} />
        <link rel="alternate" hrefLang="x-default" href={`https://getpawsy.pet/blog/${post.slug}`} />
        
        {/* Open Graph Article */}
        <meta property="og:type" content="article" />
        <meta property="og:title" content={post.meta_title || post.title} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:url" content={`https://getpawsy.pet/blog/${post.slug}`} />
        <meta property="og:site_name" content="GetPawsy" />
        {post.featured_image && <meta property="og:image" content={post.featured_image} />}
        {post.featured_image && <meta property="og:image:alt" content={post.title} />}
        <meta property="article:published_time" content={post.published_at} />
        <meta property="article:author" content={post.author_name} />
        <meta property="article:section" content={post.category} />
        {post.tags.map((tag) => (
          <meta key={tag} property="article:tag" content={tag} />
        ))}
        
        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={post.meta_title || post.title} />
        <meta name="twitter:description" content={metaDescription} />
        {post.featured_image && <meta name="twitter:image" content={post.featured_image} />}
        
        {/* Additional SEO — noindex non-core verticals + pruned thin content */}
        <meta name="robots" content={
          shouldNoindex || ['Fish', 'Birds', 'Reptiles', 'Small Pets'].includes(post.category)
            ? 'noindex, follow'
            : 'index, follow, max-image-preview:large, max-snippet:-1'
        } />
        <meta name="author" content={post.author_name} />
        <meta name="article:modified_time" content={post.published_at} />
        
      </Helmet>
      <ArticleSchema 
        article={{
          title: post.title,
          slug: post.slug,
          excerpt: post.excerpt,
          content: post.content,
          featuredImage: post.featured_image,
          category: post.category,
          tags: post.tags,
          authorName: post.author_name,
          publishedAt: post.published_at,
          readingTimeMinutes: post.reading_time_minutes,
        }}
      />

      <article className="container max-w-4xl py-8">
        <ReadingProgressBar />
        {/* Breadcrumbs */}
        <Breadcrumb className="mb-6">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/" className="flex items-center gap-1">
                  <Home className="h-3.5 w-3.5" />
                  <span className="sr-only sm:not-sr-only">Home</span>
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/blog">Blog</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to={`/blog?category=${post.category}`}>{post.category}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="max-w-[200px] truncate">{post.title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <header className="mb-8">
          {getConversionFlag('premiumReading') ? (
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground mb-4 capitalize">
              {post.category}
            </p>
          ) : (
            <Badge className={`mb-4 capitalize ${categoryColors[post.category] || 'bg-muted'}`}>
              {post.category}
            </Badge>
          )}
          <h1 className={
            getConversionFlag('premiumReading')
              ? 'text-3xl md:text-5xl font-display font-semibold tracking-tight leading-[1.15] mb-4'
              : 'text-3xl md:text-4xl font-display font-bold mb-4'
          }>
            {post.title}
          </h1>
          <p className={
            getConversionFlag('premiumReading')
              ? 'text-base md:text-lg text-muted-foreground mb-6 leading-relaxed max-w-2xl'
              : 'text-lg text-muted-foreground mb-6'
          }>
            {post.excerpt}
          </p>
          <div className={
            getConversionFlag('premiumReading')
              ? 'flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground pt-4 border-t border-border/40'
              : 'flex flex-wrap items-center gap-4 text-sm text-muted-foreground'
          }>
            <span className="flex items-center gap-1">
              <User className="w-3.5 h-3.5" strokeWidth={1.75} />
              {post.author_name}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" strokeWidth={1.75} />
              {post.published_at && new Date(post.published_at).getFullYear() > 1971
                ? format(new Date(post.published_at), 'MMMM d, yyyy', { locale: enUS })
                : format(new Date(post.created_at), 'MMMM d, yyyy', { locale: enUS })}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" strokeWidth={1.75} />
              {post.reading_time_minutes} min read
            </span>
            <Button variant="ghost" size="sm" onClick={handleShare} className="ml-auto">
              <Share2 className="w-4 h-4 mr-2" />
              Share
            </Button>
          </div>
        </header>

        {/* Featured Image */}
        {post.featured_image && (
          <div className="aspect-video rounded-2xl overflow-hidden mb-8">
            <img
              src={post.featured_image}
              alt={post.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Content */}
        <div className="prose prose-lg max-w-none blog-article-content">
          {renderContent(post.content)}
        </div>

        {/* Cluster-matched product recommendations — auto blog↔product linking */}
        {post.cluster_primary && (
          <BlogProductInjector
            clusterId={post.cluster_primary}
            injectorIndex={0}
          />
        )}

        {/* Soft Email Capture for SEO Traffic */}
        <SoftEmailCapture 
          variant="blog" 
          className="mt-12"
        />

        {/* Tags */}
        {post.tags.length > 0 && (
          <div className="mt-12 pt-8 border-t">
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">Tags</h3>
            <div className="flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="capitalize">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Related Products */}
        {relatedProducts && relatedProducts.length > 0 && (
          <div className="mt-12 pt-8 border-t">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-semibold flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-primary" />
                  Recommended Products
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Products related to this article
                </p>
              </div>
              <Link to="/products">
                <Button variant="outline" size="sm">
                  View All
                  <ArrowLeft className="w-4 h-4 ml-2 rotate-180" />
                </Button>
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {relatedProducts.slice(0, 4).map((product) => (
                <Link key={product.id} to={`/product/${product.id}`}>
                  <Card className="overflow-hidden h-full hover:shadow-lg transition-shadow group">
                    <div className="aspect-square bg-muted relative overflow-hidden">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ShoppingBag className="w-8 h-8 text-muted-foreground/50" />
                        </div>
                      )}
                      {product.compare_at_price && product.compare_at_price > product.price && (
                        <Badge className="absolute top-2 right-2 bg-red-500 text-white">
                          -{Math.round((1 - product.price / product.compare_at_price) * 100)}%
                        </Badge>
                      )}
                    </div>
                    <CardContent className="p-3">
                      <h4 className="font-medium text-sm line-clamp-2 mb-2 group-hover:text-primary transition-colors">
                        {product.name}
                      </h4>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-primary">
                          ${product.price.toFixed(2)}
                        </span>
                        {product.compare_at_price && product.compare_at_price > product.price && (
                          <span className="text-xs text-muted-foreground line-through">
                            ${product.compare_at_price.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Related Posts */}
        {relatedPosts && relatedPosts.length > 0 && (
          <div className="mt-12 pt-8 border-t">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-semibold flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-primary" />
                  More Articles
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Discover more interesting content
                </p>
              </div>
              <Link to="/blog">
                <Button variant="outline" size="sm">
                  View All Articles
                  <ArrowLeft className="w-4 h-4 ml-2 rotate-180" />
                </Button>
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {relatedPosts.map((relatedPost) => (
                <Link key={relatedPost.id} to={`/blog/${relatedPost.slug}`}>
                  <Card className="overflow-hidden h-full hover:shadow-lg transition-shadow group">
                    <div className="aspect-video bg-muted relative overflow-hidden">
                      {relatedPost.featured_image ? (
                        <img
                          src={relatedPost.featured_image}
                          alt={relatedPost.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">
                          <BookOpen className="w-8 h-8 text-muted-foreground/50" />
                        </div>
                      )}
                      <Badge className={`absolute top-2 left-2 capitalize ${categoryColors[relatedPost.category] || 'bg-muted'}`}>
                        {relatedPost.category}
                      </Badge>
                    </div>
                    <CardContent className="p-4">
                      <h4 className="font-semibold line-clamp-2 mb-2 group-hover:text-primary transition-colors">
                        {relatedPost.title}
                      </h4>
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                        {relatedPost.excerpt}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {format(new Date(relatedPost.published_at), 'MMM d, yyyy', { locale: enUS })}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {relatedPost.reading_time_minutes} min
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Category Collection & Guide Links — internal linking authority */}
        {post.category && (
          <BlogCategoryLinks blogCategory={post.category} />
        )}

        {/* CTA */}
        <div className="mt-12 p-6 bg-primary/5 rounded-2xl text-center">
          <h3 className="text-xl font-semibold mb-2">Looking for the best for your pet?</h3>
          <p className="text-muted-foreground mb-4">Browse our selection of premium pet products.</p>
          <Link to="/products">
            <Button>
              Shop Now
              <ArrowLeft className="w-4 h-4 ml-2 rotate-180" />
            </Button>
          </Link>
        </div>
      </article>
    </Layout>
  );
};

export default BlogPostPage;
