import React, { memo } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StarRatingProps {
  rating: number;
  maxRating?: number;
  size?: 'sm' | 'md' | 'lg';
  showValue?: boolean;
  reviewCount?: number;
  className?: string;
}

export const StarRating = memo(({
  rating,
  maxRating = 5,
  size = 'sm',
  showValue = false,
  reviewCount,
  className,
}: StarRatingProps) => {
  const sizeClasses = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  const stars = [];
  for (let i = 1; i <= maxRating; i++) {
    const fillPercentage = Math.min(Math.max(rating - (i - 1), 0), 1) * 100;
    
    stars.push(
      <div key={i} className="relative">
        {/* Empty star (background) */}
        <Star className={cn(sizeClasses[size], 'text-muted-foreground/30')} />
        {/* Filled star (overlay with clip) */}
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ width: `${fillPercentage}%` }}
        >
          <Star className={cn(sizeClasses[size], 'fill-amber-400 text-amber-400')} />
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <div className="flex items-center gap-0.5">{stars}</div>
      {showValue && (
        <span className={cn(textSizeClasses[size], 'text-muted-foreground font-medium')}>
          {rating.toFixed(1)}
        </span>
      )}
      {reviewCount !== undefined && (
        <span className={cn(textSizeClasses[size], 'text-muted-foreground')}>
          ({reviewCount})
        </span>
      )}
    </div>
  );
});

StarRating.displayName = 'StarRating';
