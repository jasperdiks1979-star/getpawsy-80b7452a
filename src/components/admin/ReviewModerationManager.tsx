import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Star, Check, X, Loader2, MessageSquare, BadgeCheck, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function ReviewModerationManager() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('pending');

  const { data: reviews, isLoading } = useQuery({
    queryKey: ['admin-reviews', tab],
    queryFn: async () => {
      let query = supabase
        .from('product_reviews')
        .select('*, products:product_id(name, slug)')
        .order('created_at', { ascending: false });

      if (tab === 'pending') {
        query = query.eq('is_approved', false);
      } else if (tab === 'approved') {
        query = query.eq('is_approved', true);
      }

      const { data, error } = await query.limit(100);
      if (error) throw error;
      return data;
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (reviewId: string) => {
      const { error } = await supabase
        .from('product_reviews')
        .update({ is_approved: true })
        .eq('id', reviewId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Review approved');
      queryClient.invalidateQueries({ queryKey: ['admin-reviews'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (reviewId: string) => {
      const { error } = await supabase
        .from('product_reviews')
        .delete()
        .eq('id', reviewId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Review rejected and deleted');
      queryClient.invalidateQueries({ queryKey: ['admin-reviews'] });
    },
  });

  const pendingCount = reviews?.filter(r => !r.is_approved).length ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          Review Moderation
          {pendingCount > 0 && tab !== 'pending' && (
            <Badge variant="destructive" className="ml-2">{pendingCount} pending</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="pending" className="gap-1">
              <Clock className="w-3.5 h-3.5" /> Pending
            </TabsTrigger>
            <TabsTrigger value="approved" className="gap-1">
              <Check className="w-3.5 h-3.5" /> Approved
            </TabsTrigger>
            <TabsTrigger value="all" className="gap-1">
              All
            </TabsTrigger>
          </TabsList>

          <TabsContent value={tab}>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : !reviews?.length ? (
              <div className="text-center py-12 text-muted-foreground">
                No {tab} reviews found.
              </div>
            ) : (
              <div className="space-y-3">
                {reviews.map((review: any) => (
                  <div key={review.id} className="border rounded-lg p-4 flex flex-col md:flex-row gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-medium text-sm truncate">
                          {(review.products as any)?.name || 'Unknown product'}
                        </span>
                        {review.is_verified_buyer && (
                          <Badge variant="secondary" className="gap-1 text-xs">
                            <BadgeCheck className="w-3 h-3" /> Verified
                          </Badge>
                        )}
                        {review.is_approved ? (
                          <Badge className="bg-green-500/10 text-green-700 border-green-200 text-xs">Approved</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">Pending</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5 mb-1">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star key={s} className={`w-3.5 h-3.5 ${s <= review.rating ? 'text-warning fill-warning' : 'text-muted-foreground/20'}`} />
                        ))}
                      </div>
                      <p className="font-semibold text-sm">{review.title}</p>
                      {review.content && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-3">{review.content}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                        <span>{review.reviewer_name || 'Anonymous'}</span>
                        <span>•</span>
                        <span>{formatDistanceToNow(new Date(review.created_at), { addSuffix: true })}</span>
                      </div>
                    </div>
                    <div className="flex md:flex-col gap-2 shrink-0">
                      {!review.is_approved && (
                        <Button
                          size="sm"
                          onClick={() => approveMutation.mutate(review.id)}
                          disabled={approveMutation.isPending}
                          className="gap-1"
                        >
                          <Check className="w-4 h-4" /> Approve
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => rejectMutation.mutate(review.id)}
                        disabled={rejectMutation.isPending}
                        className="gap-1"
                      >
                        <X className="w-4 h-4" /> Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
