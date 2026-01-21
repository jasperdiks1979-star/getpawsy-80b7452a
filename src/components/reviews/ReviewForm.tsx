import { useState } from 'react';
import { Star, Send, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { z } from 'zod';

const reviewSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(100, 'Title can be at most 100 characters'),
  content: z.string().trim().max(1000, 'Review can be at most 1000 characters').optional(),
  rating: z.number().min(1, 'Please select a rating').max(5),
});

interface ReviewFormProps {
  productId: string;
  onReviewSubmitted: () => void;
}

export const ReviewForm = ({ productId, onReviewSubmitted }: ReviewFormProps) => {
  const { user } = useAuth();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; content?: string; rating?: string }>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    // Validate
    const result = reviewSchema.safeParse({ title, content: content || undefined, rating });
    if (!result.success) {
      const fieldErrors: { title?: string; content?: string; rating?: string } = {};
      result.error.errors.forEach((err) => {
        if (err.path[0] === 'title') fieldErrors.title = err.message;
        if (err.path[0] === 'content') fieldErrors.content = err.message;
        if (err.path[0] === 'rating') fieldErrors.rating = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    if (!user) {
      toast.error('You must be logged in to submit a review');
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase.from('product_reviews').insert({
        product_id: productId,
        user_id: user.id,
        rating,
        title: title.trim(),
        content: content.trim() || null,
      });

      if (error) throw error;

      toast.success('Thanks for your review! 🎉');
      setRating(0);
      setTitle('');
      setContent('');
      onReviewSubmitted();
    } catch (error: any) {
      console.error('Error submitting review:', error);
      toast.error('Something went wrong while submitting your review');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-muted/30 rounded-2xl p-6 text-center"
      >
        <p className="text-muted-foreground mb-4">
          Sign in to leave a review
        </p>
        <Link to="/auth">
          <Button className="btn-organic">Sign In</Button>
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.form
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      onSubmit={handleSubmit}
      className="bg-muted/30 rounded-2xl p-6 space-y-4"
    >
      <h3 className="font-display font-semibold text-lg text-foreground">
        Write a review
      </h3>

      {/* Star Rating */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">
          Your rating
        </label>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <motion.button
              key={star}
              type="button"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setRating(star)}
              onMouseEnter={() => setHoverRating(star)}
              onMouseLeave={() => setHoverRating(0)}
              className="p-1 focus:outline-none"
            >
              <Star
                className={`w-7 h-7 transition-colors ${
                  star <= (hoverRating || rating)
                    ? 'text-warning fill-warning'
                    : 'text-muted-foreground/30'
                }`}
              />
            </motion.button>
          ))}
          <span className="ml-2 text-sm text-muted-foreground">
            {rating > 0 ? `${rating} star${rating > 1 ? 's' : ''}` : 'Select'}
          </span>
        </div>
        {errors.rating && (
          <p className="text-xs text-destructive">{errors.rating}</p>
        )}
      </div>

      {/* Title */}
      <div className="space-y-2">
        <label htmlFor="review-title" className="text-sm font-medium text-foreground">
          Title
        </label>
        <Input
          id="review-title"
          placeholder="Give your review a title..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-xl"
          maxLength={100}
        />
        {errors.title && (
          <p className="text-xs text-destructive">{errors.title}</p>
        )}
      </div>

      {/* Content */}
      <div className="space-y-2">
        <label htmlFor="review-content" className="text-sm font-medium text-foreground">
          Your experience <span className="text-muted-foreground">(optional)</span>
        </label>
        <Textarea
          id="review-content"
          placeholder="Tell us about your experience with this product..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="rounded-xl min-h-[100px]"
          maxLength={1000}
        />
        {errors.content && (
          <p className="text-xs text-destructive">{errors.content}</p>
        )}
        <p className="text-xs text-muted-foreground text-right">
          {content.length}/1000
        </p>
      </div>

      {/* Submit */}
      <Button
        type="submit"
        disabled={isSubmitting || rating === 0}
        className="w-full btn-organic gap-2"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Submitting...
          </>
        ) : (
          <>
            <Send className="w-4 h-4" />
            Submit Review
          </>
        )}
      </Button>
    </motion.form>
  );
};
