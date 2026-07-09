import { Star, User, ThumbsUp, Trash2, BadgeCheck, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getConversionFlag } from '@/lib/conversionFlags';

interface Review {
  id: string;
  user_id?: string;
  rating: number;
  title: string;
  content: string | null;
  created_at: string;
  helpful_count: number;
  is_verified_buyer?: boolean;
  reviewer_name?: string | null;
}

interface ReviewsListProps {
  reviews: Review[];
  onReviewDeleted: () => void;
}

export const ReviewsList = ({ reviews, onReviewDeleted }: ReviewsListProps) => {
  const { user } = useAuth();
  const premium = getConversionFlag('premiumReviews');

  const handleDelete = async (reviewId: string) => {
    try {
      const { error } = await supabase
        .from('product_reviews')
        .delete()
        .eq('id', reviewId);

      if (error) throw error;

      toast.success('Review deleted');
      onReviewDeleted();
    } catch (error) {
      console.error('Error deleting review:', error);
      toast.error('Could not delete review');
    }
  };

  const handleHelpful = async (reviewId: string, currentCount: number) => {
    try {
      const { error } = await supabase
        .from('product_reviews')
        .update({ helpful_count: currentCount + 1 })
        .eq('id', reviewId);

      if (error) throw error;
      
      toast.success('Thanks for your feedback!');
      onReviewDeleted(); // Refresh reviews
    } catch (error) {
      console.error('Error updating helpful count:', error);
    }
  };

  if (reviews.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-center py-12"
      >
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
          <MessageSquare className="w-8 h-8 text-muted-foreground" />
        </div>
        <h4 className="font-semibold text-foreground mb-2">No reviews yet</h4>
        <p className="text-muted-foreground mb-4">
          Be the first to review this product.
        </p>
        <p className="text-sm text-muted-foreground/70">
          Your honest feedback helps other pet parents make informed decisions.
        </p>
      </motion.div>
    );
  }

  // Calculate average rating
  const averageRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

  // Rating distribution
  const ratingDistribution = [5, 4, 3, 2, 1].map((rating) => ({
    rating,
    count: reviews.filter((r) => r.rating === rating).length,
    percentage: (reviews.filter((r) => r.rating === rating).length / reviews.length) * 100,
  }));

  return (
    <div className="space-y-8">
      {/* Summary */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={premium ? 'rounded-2xl border border-border/50 p-6' : 'bg-muted/30 rounded-2xl p-6'}
      >
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          {/* Average Rating */}
          <div className="text-center md:text-left md:pr-8 md:border-r border-border/50">
            <div className="text-5xl font-display font-bold text-foreground mb-1">
              {averageRating.toFixed(1)}
            </div>
            <div className="flex items-center justify-center md:justify-start gap-0.5 mb-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`w-5 h-5 ${
                    star <= Math.round(averageRating)
                      ? 'text-warning fill-warning'
                      : 'text-muted-foreground/30'
                  }`}
                />
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              {reviews.length} review{reviews.length !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Rating Distribution */}
          <div className="flex-1 space-y-2">
            {ratingDistribution.map(({ rating, count, percentage }) => (
              <div key={rating} className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground w-12">
                  {rating} star{rating !== 1 ? 's' : ''}
                </span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${percentage}%` }}
                    transition={{ delay: 0.2 + rating * 0.1, duration: 0.5 }}
                    className="h-full bg-warning rounded-full"
                  />
                </div>
                <span className="text-sm text-muted-foreground w-8">
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Reviews List */}
      <AnimatePresence mode="popLayout">
        {reviews.map((review, idx) => {
          const displayName = review.reviewer_name || 'Customer';
          const isVerified = review.is_verified_buyer;
          const isOwner = user?.id === review.user_id;

          return (
            <motion.div
              key={review.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ delay: idx * 0.05 }}
              className={premium
                ? 'bg-background rounded-2xl border border-border/50 p-6'
                : 'bg-background rounded-2xl border border-border/50 p-6 shadow-soft'}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5 text-primary" />
                  </div>

                  <div className="flex-1">
                    {/* Header */}
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="font-semibold text-foreground">
                        {displayName}
                      </span>
                      {isVerified && (
                        premium ? (
                          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium">
                            <BadgeCheck className="w-3 h-3" />
                            Verified buyer
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-primary font-medium bg-primary/10 px-2 py-0.5 rounded-full">
                            <BadgeCheck className="w-3 h-3" />
                            Verified Buyer
                          </span>
                        )
                      )}
                      <span className="text-sm text-muted-foreground">•</span>
                      <span className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(review.created_at), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>

                    {/* Rating */}
                    <div className={premium ? 'flex items-center gap-0.5 mb-2' : 'flex items-center gap-0.5 mb-3'}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`${premium ? 'w-3.5 h-3.5' : 'w-4 h-4'} ${
                            star <= review.rating
                              ? 'text-warning fill-warning'
                              : 'text-muted-foreground/30'
                          }`}
                        />
                      ))}
                    </div>

                    {/* Title */}
                    <h4 className={premium ? 'font-display font-semibold text-foreground tracking-tight mb-1.5' : 'font-semibold text-foreground mb-2'}>
                      {review.title}
                    </h4>

                    {/* Content */}
                    {review.content && (
                      <p className="text-muted-foreground leading-relaxed">
                        {review.content}
                      </p>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-4 mt-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-foreground gap-2"
                        onClick={() => handleHelpful(review.id, review.helpful_count)}
                      >
                        <ThumbsUp className="w-4 h-4" />
                        Helpful ({review.helpful_count})
                      </Button>

                      {isOwner && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-2"
                          onClick={() => handleDelete(review.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Trust footer */}
      <p className="text-xs text-muted-foreground text-center pt-4 border-t border-border/30">
        Based on customer feedback · All reviews are from verified purchases
      </p>
    </div>
  );
};
