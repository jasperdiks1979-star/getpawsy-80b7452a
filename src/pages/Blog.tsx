import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PopularGuidesBlock } from '@/components/seo/PopularGuidesBlock';
import { Helmet } from 'react-helmet-async';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, ArrowRight, BookOpen, Sparkles, Loader2, Home, ImagePlus } from 'lucide-react';
import { format } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { SEO_KEYWORDS } from '@/lib/seo-keywords';
import { BlogGridSkeleton } from '@/components/blog/BlogPostSkeleton';
import { StaggeredGrid, StaggeredItem } from '@/components/ui/staggered-animation';
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
  featured_image: string | null;
  category: string;
  tags: string[];
  author_name: string;
  published_at: string | null;
  created_at?: string;
  reading_time_minutes: number;
  meta_title: string | null;
  meta_description: string | null;
}

const categoryColors: Record<string, string> = {
  Dogs: 'bg-amber-100 text-amber-700',
  Cats: 'bg-pink-100 text-pink-700',
  Fish: 'bg-blue-100 text-blue-700',
  General: 'bg-emerald-100 text-emerald-700',
  Health: 'bg-red-100 text-red-700',
  Guides: 'bg-purple-100 text-purple-700',
};

const Blog = () => {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [generatingImageFor, setGeneratingImageFor] = useState<string | null>(null);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ generated: number; remaining: number; totalGenerated: number } | null>(null);
  const [batchPaused, setBatchPaused] = useState(false);
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();

  // Auto-continue batch generation
  const runBatchGeneration = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/batch-generate-blog-images`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ limit: 5 }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to generate images');
    }

    return response.json();
  };

  const handleBatchGenerate = async () => {
    setIsBatchGenerating(true);
    setBatchPaused(false);
    let totalGenerated = 0;
    let remaining = 1; // Start with non-zero to enter loop

    try {
      while (remaining > 0 && !batchPaused) {
        const data = await runBatchGeneration();
        totalGenerated += data.generated;
        remaining = data.remaining;
        
        setBatchProgress({ 
          generated: data.generated, 
          remaining: data.remaining,
          totalGenerated 
        });
        queryClient.invalidateQueries({ queryKey: ['blog-posts'] });

        if (remaining > 0) {
          toast.success(`Batch complete: ${data.generated} images`, {
            description: `Total: ${totalGenerated} generated, ${remaining} remaining. Waiting 10s...`,
          });
          // Wait 10 seconds between batches to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
      }

      if (remaining === 0) {
        toast.success('All images generated!', {
          description: `Successfully generated ${totalGenerated} featured images for all blog posts.`,
        });
      }
    } catch (error) {
      toast.error('Batch generation failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsBatchGenerating(false);
    }
  };

  const handleStopBatch = () => {
    setBatchPaused(true);
    toast.info('Stopping after current batch...');
  };

  const { data: posts, isLoading } = useQuery({
    queryKey: ['blog-posts', selectedCategory],
    queryFn: async () => {
      let query = supabase
        .from('blog_posts')
        .select('id, title, slug, excerpt, featured_image, category, tags, author_name, published_at, created_at, reading_time_minutes, meta_title, meta_description')
        .eq('is_published', true)
        .order('created_at', { ascending: false });

      if (selectedCategory) {
        query = query.eq('category', selectedCategory);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as BlogPost[];
    },
  });

  const generateImageMutation = useMutation({
    mutationFn: async (post: BlogPost) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-blog-image`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            postId: post.id,
            title: post.title,
            category: post.category,
            excerpt: post.excerpt,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate image');
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast.success('Image generated!', {
        description: 'The blog image has been created successfully.',
      });
      queryClient.invalidateQueries({ queryKey: ['blog-posts'] });
    },
    onError: (error: Error) => {
      toast.error('Generation failed', {
        description: error.message,
      });
    },
    onSettled: () => {
      setGeneratingImageFor(null);
    },
  });

  const handleGenerateImage = (e: React.MouseEvent, post: BlogPost) => {
    e.preventDefault();
    e.stopPropagation();
    setGeneratingImageFor(post.id);
    generateImageMutation.mutate(post);
  };

  const categories = ['Dogs', 'Cats', 'Fish', 'Health', 'Guides', 'General'];

  // Generate dynamic SEO based on selected category
  const seoContent = useMemo(() => {
    const categoryDescriptions: Record<string, { title: string; description: string; keywords: string[] }> = {
      Dogs: {
        title: 'Dog Care Blog 2026 | Training, Nutrition & Health Tips | GetPawsy',
        description: 'Expert dog care guides: puppy training tips, best dog food recommendations, health advice & behavior solutions. Trusted by 10,000+ pet parents. Start reading now!',
        keywords: [...SEO_KEYWORDS.dog.general.slice(0, 6), 'dog care blog', 'puppy training guide', 'dog nutrition tips', 'dog health advice', 'dog behavior tips', 'best dog products 2026'],
      },
      Cats: {
        title: 'Cat Care Blog 2026 | Health, Behavior & Nutrition Guides | GetPawsy',
        description: 'Complete cat care articles: feline health tips, cat behavior explained, nutrition guides & product reviews. Expert advice for happy, healthy cats!',
        keywords: [...SEO_KEYWORDS.cat.general.slice(0, 6), 'cat care blog', 'cat health tips', 'cat behavior guide', 'cat nutrition advice', 'indoor cat tips', 'best cat products 2026'],
      },
      Fish: {
        title: 'Aquarium Blog 2026 | Fish Care, Tank Setup & Maintenance | GetPawsy',
        description: 'Beginner-friendly aquarium guides: fish tank setup, tropical fish care, water quality tips & maintenance schedules. Create your perfect underwater world!',
        keywords: ['aquarium blog', 'fish care guide', 'aquarium setup for beginners', 'tropical fish care', 'aquarium maintenance tips', 'fish tank ideas', 'aquarium water quality'],
      },
      Health: {
        title: 'Pet Health Blog 2026 | Wellness, Nutrition & Vet Tips | GetPawsy',
        description: 'Comprehensive pet health resources: preventive care tips, nutrition advice, common illness guides & hand-selected wellness strategies. Keep your pet thriving!',
        keywords: ['pet health blog', 'pet wellness tips', 'vet advice for pets', 'pet nutrition guide', 'pet preventive care', 'common pet illnesses', 'pet health 2026'],
      },
      Guides: {
        title: 'Pet Care Guides 2026 | Step-by-Step How-To Articles | GetPawsy',
        description: 'Ultimate pet care guides: from first-time owner basics to advanced training techniques. Clear, actionable steps for dogs, cats & more. Start your journey!',
        keywords: ['pet care guides', 'pet how-to articles', 'first-time pet owner guide', 'pet training guides', 'pet product guides', 'comprehensive pet care', 'pet owner tips'],
      },
      General: {
        title: 'Pet Blog 2026 | Expert Tips for Dogs, Cats & More | GetPawsy',
        description: 'Your ultimate pet resource: care tips, product reviews, training advice & health guides for all pets. Expert knowledge for devoted pet parents!',
        keywords: [...SEO_KEYWORDS.primary.slice(0, 8), 'pet blog', 'pet care tips', 'pet owner advice', 'pet lifestyle'],
      },
    };

    if (selectedCategory && categoryDescriptions[selectedCategory]) {
      return categoryDescriptions[selectedCategory];
    }

    return {
      title: 'Pet Care Blog 2026 | Expert Tips & Guides for Pet Parents | GetPawsy',
      description: 'Discover 100+ expert pet care articles: dog training, cat health, nutrition guides & product reviews. Trusted advice for happy, healthy pets. Read free today!',
      keywords: ['pet care blog', 'pet tips and advice', 'dog care articles', 'cat care guides', 'pet health blog', 'pet nutrition tips', 'pet owner resources 2026'],
    };
  }, [selectedCategory]);

  return (
    <Layout>
      <Helmet>
        <title>{seoContent.title}</title>
        <meta name="description" content={seoContent.description} />
        <meta name="keywords" content={seoContent.keywords.join(', ')} />{/* Hreflang Tags */}
        <link rel="alternate" hrefLang="en" href="https://getpawsy.pet/blog" />
        <link rel="alternate" hrefLang="x-default" href="https://getpawsy.pet/blog" />
        
        {/* Open Graph */}
        <meta property="og:title" content={seoContent.title} />
        <meta property="og:description" content={seoContent.description} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://getpawsy.pet/blog" />
        <meta property="og:site_name" content="GetPawsy" />
        
        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={seoContent.title} />
        <meta name="twitter:description" content={seoContent.description} />
        
        {/* Additional SEO */}
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
        <meta name="author" content="GetPawsy Pet Experts" />
      </Helmet>

      <div className="container py-8 md:py-12">
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
            {selectedCategory ? (
              <>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link to="/blog">Blog</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{selectedCategory}</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            ) : (
              <BreadcrumbItem>
                <BreadcrumbPage>Blog</BreadcrumbPage>
              </BreadcrumbItem>
            )}
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-4">
            <BookOpen className="w-4 h-4" />
            Pet Blog
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-bold mb-4">
            Tips & Advice for Pet Owners
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Expert articles on care, nutrition, and training for your pets.
          </p>
        </div>

        {/* Admin: Batch Generate Images Button */}
        {isAdmin && (
          <div className="flex justify-center gap-2 mb-6">
            <Button
              onClick={handleBatchGenerate}
              disabled={isBatchGenerating}
              variant="outline"
              className="gap-2"
            >
              {isBatchGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating... {batchProgress && `(${batchProgress.totalGenerated} done, ${batchProgress.remaining} left)`}
                </>
              ) : (
                <>
                  <ImagePlus className="w-4 h-4" />
                  Generate All Missing Blog Images
                  {batchProgress && batchProgress.remaining > 0 && ` (${batchProgress.remaining} left)`}
                </>
              )}
            </Button>
            {isBatchGenerating && (
              <Button
                onClick={handleStopBatch}
                variant="destructive"
                size="sm"
              >
                Stop
              </Button>
            )}
          </div>
        )}

        {/* Category Filter */}
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              !selectedCategory ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'
            }`}
          >
            All articles
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                selectedCategory === cat ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {isLoading ? (
          <BlogGridSkeleton count={6} />
        ) : posts && posts.length > 0 ? (
          <StaggeredGrid className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((post) => (
              <StaggeredItem key={post.id}>
                <Link to={`/blog/${post.slug}`}>
                  <Card className="overflow-hidden h-full hover:shadow-lg transition-shadow group">
                    <div className="aspect-video bg-muted relative overflow-hidden">
                      {post.featured_image ? (
                        <img
                          src={post.featured_image}
                          alt={post.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-accent/20">
                          <BookOpen className="w-12 h-12 text-primary/50" />
                        </div>
                      )}
                      {isAdmin && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                          onClick={(e) => handleGenerateImage(e, post)}
                          disabled={generatingImageFor === post.id}
                        >
                          {generatingImageFor === post.id ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                              Generating...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4 mr-1" />
                              {post.featured_image ? 'New image' : 'Generate image'}
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                    <CardContent className="p-5">
                      <Badge className={`mb-3 ${categoryColors[post.category] || 'bg-muted'}`}>
                        {post.category}
                      </Badge>
                      <h2 className="font-semibold text-lg mb-2 line-clamp-2 group-hover:text-primary transition-colors">
                        {post.title}
                      </h2>
                      <p className="text-muted-foreground text-sm line-clamp-2 mb-4">
                        {post.excerpt}
                      </p>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {post.published_at && new Date(post.published_at).getFullYear() > 1971
                              ? format(new Date(post.published_at), 'MMM d, yyyy', { locale: enUS })
                              : format(new Date(post.created_at || Date.now()), 'MMM d, yyyy', { locale: enUS })}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {post.reading_time_minutes} min
                          </span>
                        </div>
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </StaggeredItem>
            ))}
          </StaggeredGrid>
        ) : (
          <div className="text-center py-12">
            <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No articles in this category yet.</p>
          </div>
        )}
        {/* Popular Buying Guides — cornerstone authority block */}
        <PopularGuidesBlock />
      </div>
    </Layout>
  );
};

export default Blog;
