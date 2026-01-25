import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Eye, Clock, Edit } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";

interface BlogPostsWidgetProps {
  onNavigate?: () => void;
}

export const BlogPostsWidget = ({ onNavigate }: BlogPostsWidgetProps) => {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-blog-posts-widget"],
    queryFn: async () => {
      const { data: posts, error } = await supabase
        .from("blog_posts")
        .select("id, title, is_published, view_count, created_at, updated_at")
        .order("updated_at", { ascending: false })
        .limit(10);

      if (error) throw error;

      const published = posts?.filter(p => p.is_published) || [];
      const drafts = posts?.filter(p => !p.is_published) || [];
      const totalViews = posts?.reduce((sum, p) => sum + (p.view_count || 0), 0) || 0;

      return {
        total: posts?.length || 0,
        published: published.length,
        drafts: drafts.length,
        totalViews,
        recentDrafts: drafts.slice(0, 3),
        recentPosts: posts?.slice(0, 3) || [],
      };
    },
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-6 w-16" />
            </div>
            <Skeleton className="h-8 w-8 rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasDrafts = (data?.drafts || 0) > 0;

  return (
    <Card 
      className="cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={onNavigate}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" />
              Blog Posts
            </p>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-xl font-bold">{data?.total || 0}</p>
              <div className="flex gap-1">
                <Badge variant="secondary" className="text-xs">
                  {data?.published || 0} live
                </Badge>
                {hasDrafts && (
                  <Badge variant="outline" className="text-xs border-amber-500 text-amber-600">
                    <Edit className="h-3 w-3 mr-1" />
                    {data?.drafts} concept
                  </Badge>
                )}
              </div>
            </div>
            {data?.totalViews && data.totalViews > 0 && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <Eye className="h-3 w-3" />
                {data.totalViews.toLocaleString("nl-NL")} views
              </p>
            )}
          </div>
          <div className="p-2 bg-primary/10 rounded-lg">
            <FileText className="h-5 w-5 text-primary" />
          </div>
        </div>

        {/* Recent drafts preview */}
        {data?.recentDrafts && data.recentDrafts.length > 0 && (
          <div className="mt-3 pt-3 border-t space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Recente concepten
            </p>
            {data.recentDrafts.map((draft) => (
              <div key={draft.id} className="text-xs truncate text-foreground/80">
                • {draft.title}
              </div>
            ))}
          </div>
        )}

        {/* If no drafts, show recent posts */}
        {(!data?.recentDrafts || data.recentDrafts.length === 0) && data?.recentPosts && data.recentPosts.length > 0 && (
          <div className="mt-3 pt-3 border-t space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Recente posts</p>
            {data.recentPosts.slice(0, 2).map((post) => (
              <div key={post.id} className="text-xs truncate text-foreground/80 flex items-center justify-between gap-2">
                <span className="truncate">• {post.title}</span>
                <span className="text-muted-foreground shrink-0">
                  {formatDistanceToNow(new Date(post.updated_at), { addSuffix: true, locale: nl })}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
