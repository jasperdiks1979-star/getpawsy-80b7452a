import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BookOpen, ArrowRight } from 'lucide-react';

interface CategoryRelatedGuidesProps {
  categoryName: string;
  categorySlug: string;
  primaryKeyword: string;
}

// Anchor text variations to avoid exact-match repetition
const anchorVariations = [
  (title: string) => title,
  (title: string) => `Read: ${title}`,
  (title: string) => `Guide: ${title.replace(/^Best\s+/i, '')}`,
  (title: string) => `Learn about ${title.replace(/^Best\s+|Guide$/gi, '').trim().toLowerCase()}`,
  (title: string) => `${title} – Expert Review`,
];

export function CategoryRelatedGuides({ categoryName, categorySlug, primaryKeyword }: CategoryRelatedGuidesProps) {
  const { data: guides = [] } = useQuery({
    queryKey: ['category-related-guides', categorySlug],
    queryFn: async () => {
      // Search blog posts matching category keywords
      const keywords = primaryKeyword.split(/[\s,]+/).filter(w => w.length > 3);
      
      // Try keyword-based search first
      const { data, error } = await supabase
        .from('blog_posts')
        .select('id, title, slug, excerpt, category, featured_image')
        .eq('is_published', true)
        .limit(20);

      if (error || !data) return [];

      // Score posts by keyword relevance
      const scored = data.map(post => {
        const text = `${post.title} ${post.excerpt} ${post.category}`.toLowerCase();
        let score = 0;
        for (const kw of keywords) {
          if (text.includes(kw.toLowerCase())) score += 2;
        }
        // Boost posts in matching category
        const catLower = categoryName.toLowerCase();
        if (post.category?.toLowerCase() === 'dogs' && catLower.includes('dog')) score += 3;
        if (post.category?.toLowerCase() === 'cats' && catLower.includes('cat')) score += 3;
        return { ...post, _score: score };
      })
      .filter(p => p._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);

      return scored;
    },
    staleTime: 10 * 60 * 1000,
  });

  if (guides.length === 0) return null;

  return (
    <section className="mb-12">
      <div className="flex items-center gap-2 mb-6">
        <BookOpen className="w-5 h-5 text-primary" />
        <h2 className="text-2xl font-semibold">
          Expert Guides for {categoryName.replace(/^Best\s+/i, '')}
        </h2>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {guides.map((guide, i) => (
          <Link
            key={guide.id}
            to={`/blog/${guide.slug}`}
            className="group block bg-card border rounded-xl p-5 hover:border-primary/30 hover:shadow-md transition-all"
          >
            {guide.featured_image && (
              <div className="aspect-video rounded-lg overflow-hidden mb-3">
                <img 
                  src={guide.featured_image} 
                  alt={guide.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
              </div>
            )}
            <h3 className="font-semibold text-sm mb-1 group-hover:text-primary transition-colors line-clamp-2">
              {anchorVariations[i % anchorVariations.length](guide.title)}
            </h3>
            <p className="text-xs text-muted-foreground line-clamp-2">{guide.excerpt}</p>
            <span className="inline-flex items-center gap-1 text-primary text-xs mt-2">
              Read Guide <ArrowRight className="w-3 h-3" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
