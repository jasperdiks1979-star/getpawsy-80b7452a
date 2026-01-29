import { Helmet } from 'react-helmet-async';

interface AggregateRatingSchemaProps {
  /** Average rating value (1-5) */
  ratingValue: number;
  /** Total number of reviews */
  reviewCount: number;
  /** Best possible rating (default: 5) */
  bestRating?: number;
  /** Worst possible rating (default: 1) */
  worstRating?: number;
  /** Base URL for the website */
  baseUrl?: string;
}

/**
 * AggregateRatingSchema - Displays aggregate review rating in search results
 * Use this on the homepage to show overall store rating
 */
export function AggregateRatingSchema({
  ratingValue,
  reviewCount,
  bestRating = 5,
  worstRating = 1,
  baseUrl = 'https://getpawsy.pet',
}: AggregateRatingSchemaProps) {
  // Don't render if there are no reviews
  if (reviewCount === 0 || !ratingValue) {
    return null;
  }

  // Clamp rating value between worst and best rating
  const clampedRating = Math.min(Math.max(ratingValue, worstRating), bestRating);

  const aggregateRatingSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${baseUrl}/#organization-rating`,
    name: 'GetPawsy',
    url: baseUrl,
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: clampedRating.toFixed(1),
      bestRating: bestRating.toString(),
      worstRating: worstRating.toString(),
      ratingCount: reviewCount,
      reviewCount: reviewCount,
    },
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(aggregateRatingSchema)}
      </script>
    </Helmet>
  );
}

/**
 * Hook to calculate aggregate rating from product reviews
 * Returns null if no reviews exist
 */
export function calculateAggregateRating(
  reviews: Array<{ rating: number }>
): { ratingValue: number; reviewCount: number } | null {
  if (!reviews || reviews.length === 0) {
    return null;
  }

  const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
  const averageRating = totalRating / reviews.length;

  return {
    ratingValue: Math.round(averageRating * 10) / 10, // Round to 1 decimal
    reviewCount: reviews.length,
  };
}
