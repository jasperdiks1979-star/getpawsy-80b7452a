import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, ArrowRight, BookOpen, Sparkles, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { SEO_KEYWORDS } from '@/lib/seo-keywords';

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  featured_image: string | null;
  category: string;
  tags: string[];
  author_name: string;
  published_at: string;
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
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const { data: posts, isLoading } = useQuery({
    queryKey: ['blog-posts', selectedCategory],
    queryFn: async () => {
      let query = supabase
        .from('blog_posts')
        .select('id, title, slug, excerpt, featured_image, category, tags, author_name, published_at, reading_time_minutes, meta_title, meta_description')
        .eq('is_published', true)
        .order('published_at', { ascending: false });

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
        title: 'Dog Blog | Expert Tips & Advice | GetPawsy',
        description: '🐕 Discover expert tips on dog food, puppy training, health & behavior. Practical advice from professionals for your loyal companion.',
        keywords: [...SEO_KEYWORDS.dog.general.slice(0, 6), 'dog blog', 'puppy tips', 'dog training', 'dog food'],
      },
      Cats: {
        title: 'Cat Blog | Care & Behavior Tips | GetPawsy',
        description: '🐱 Everything about cat care, food, behavior & health. Expert articles for the best care for your cat.',
        keywords: [...SEO_KEYWORDS.cat.general.slice(0, 6), 'cat blog', 'cat care', 'cat behavior', 'cat food'],
      },
      Fish: {
        title: 'Aquarium Blog | Beginners Guide & Tips | GetPawsy',
        description: '🐠 From aquarium setup to fish care. Complete guide for beginners and experienced aquarium enthusiasts.',
        keywords: ['aquarium tips', 'fish care', 'aquarium beginners', 'tropical fish', 'aquarium maintenance'],
      },
      Health: {
        title: 'Pet Health Blog | Wellness Tips & Advice | GetPawsy',
        description: '🏥 Expert pet health advice and wellness tips. Learn about common health issues and preventive care for your pets.',
        keywords: ['pet health', 'pet wellness', 'vet advice', 'pet care tips', 'pet nutrition'],
      },
      Guides: {
        title: 'Pet Guides | Complete How-To Articles | GetPawsy',
        description: '📚 Comprehensive pet guides for every pet owner. From first-time tips to advanced care techniques.',
        keywords: ['pet guides', 'pet how-to', 'pet care guides', 'first-time pet owner', 'pet tips'],
      },
      General: {
        title: 'Pet Blog | General Tips & Advice | GetPawsy',
        description: '🐾 General pet care tips for all animal types. From nutrition to wellness - everything you need to know.',
        keywords: [...SEO_KEYWORDS.primary.slice(0, 8), 'pet tips', 'animal care'],
      },
    };

    if (selectedCategory && categoryDescriptions[selectedCategory]) {
      return categoryDescriptions[selectedCategory];
    }

    return {
      title: 'Blog | Pet Care Tips & Advice | GetPawsy',
      description: 'Discover expert tips on pet care. Articles about dog food, cat care, aquarium tips and more. Free advice for pet owners.',
      keywords: ['pet blog', 'dog food tips', 'cat care', 'aquarium beginners', 'puppy training', 'pet advice'],
    };
  }, [selectedCategory]);

  return (
    <Layout>
      <Helmet>
        <title>{seoContent.title}</title>
        <meta name="description" content={seoContent.description} />
        <meta name="keywords" content={seoContent.keywords.join(', ')} />
        <link rel="canonical" href={`https://getpawsy.lovable.app/blog${selectedCategory ? `?category=${selectedCategory}` : ''}`} />
        <meta property="og:title" content={seoContent.title} />
        <meta property="og:description" content={seoContent.description} />
        <meta property="og:type" content="website" />
      </Helmet>

      <div className="container py-8 md:py-12">
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

        {/* Posts Grid */}
        {isLoading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="overflow-hidden">
                <Skeleton className="h-48 w-full" />
                <CardContent className="p-5">
                  <Skeleton className="h-4 w-20 mb-3" />
                  <Skeleton className="h-6 w-full mb-2" />
                  <Skeleton className="h-4 w-full mb-1" />
                  <Skeleton className="h-4 w-3/4" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : posts && posts.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((post) => (
              <Link key={post.id} to={`/blog/${post.slug}`}>
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
                          {format(new Date(post.published_at), 'MMM d, yyyy', { locale: enUS })}
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
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No articles in this category yet.</p>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Blog;
