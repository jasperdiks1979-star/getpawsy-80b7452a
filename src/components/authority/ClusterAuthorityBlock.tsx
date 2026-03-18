/**
 * ClusterAuthorityBlock — "Learn more about [Cluster Topic]"
 * Placed on product pages below description, above reviews.
 * Shows 2 relevant blog posts from the same cluster.
 * Lazy-loaded, zero CLS, uses existing design tokens.
 */

import { memo } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ArrowRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getCluster, type ClusterId } from '@/lib/cluster-config';

interface ClusterAuthorityBlockProps {
  clusterId: string | null | undefined;
  productName: string;
}

export const ClusterAuthorityBlock = memo(function ClusterAuthorityBlock({
  clusterId,
  productName,
}: ClusterAuthorityBlockProps) {
  const cluster = getCluster(clusterId);

  const { data: posts } = useQuery({
    queryKey: ['cluster-authority-posts', clusterId],
    queryFn: async () => {
      if (!clusterId) return [];
      const { data } = await supabase
        .from('blog_posts')
        .select('id, title, slug, excerpt, featured_image')
        .eq('cluster_primary', clusterId)
        .eq('is_published', true)
        .not('is_noindexed', 'eq', true)
        .order('view_count', { ascending: false })
        .limit(2);
      return data ?? [];
    },
    enabled: !!clusterId,
    staleTime: 10 * 60 * 1000,
  });

  if (!cluster || !posts || posts.length === 0) return null;

  return (
    <section className="mt-12 mb-8" aria-label={`Learn more about ${cluster.label}`}>
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <BookOpen className="w-4.5 h-4.5 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-display font-bold text-foreground">
            Expert {cluster.shortLabel} Tips & Advice
          </h3>
          <p className="text-xs text-muted-foreground">{cluster.description}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {posts.map((post) => (
          <Link
            key={post.id}
            to={`/blog/${post.slug}`}
            className="group flex gap-3 p-3 rounded-xl border border-border hover:border-primary/40 bg-card transition-colors"
          >
            {post.featured_image && (
              <img
                src={post.featured_image}
                alt=""
                className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                loading="lazy"
                width={64}
                height={64}
              />
            )}
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                {post.title}
              </h4>
              <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                {post.excerpt}
              </p>
              <span className="inline-flex items-center gap-1 text-xs text-primary font-medium mt-1.5">
                Read More <ArrowRight className="w-3 h-3" />
              </span>
            </div>
          </Link>
        ))}
      </div>

      {cluster.guidePath && (
        <Link
          to={cluster.guidePath}
          className="inline-flex items-center gap-1.5 text-sm text-primary font-medium mt-4 hover:underline"
        >
          Explore all {cluster.shortLabel} guides <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      )}
    </section>
  );
});
