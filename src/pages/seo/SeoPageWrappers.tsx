/**
 * Wrapper components for lazy-loaded SEO pages.
 * Needed because React.lazy doesn't support passing props to default exports.
 */
import { lazy, Suspense } from 'react';

// Inline lazy loaders
const SeoPillarPageLazy = lazy(() => import('./SeoPillarPage'));
const SeoIntentPageLazy = lazy(() => import('./SeoIntentPage'));

export function DogPillarPage() {
  return <SeoPillarPageLazy namespace="dog" />;
}

export function CatPillarPage() {
  return <SeoPillarPageLazy namespace="cat" />;
}

export function DogIntentPage() {
  return <SeoIntentPageLazy namespace="dog" />;
}

export function CatIntentPage() {
  return <SeoIntentPageLazy namespace="cat" />;
}
