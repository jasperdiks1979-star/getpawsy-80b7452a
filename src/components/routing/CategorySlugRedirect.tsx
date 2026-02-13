import { useParams, Navigate } from 'react-router-dom';

/**
 * Maps clean category slugs to the internal ?category= parameter.
 * E.g. /cat-trees-condos → /products?category=cat-trees-and-condos
 */
const CATEGORY_SLUG_MAP: Record<string, string> = {
  'cat-trees-condos': 'cat-trees-and-condos',
  'dog-beds': 'dog-beds',
  'cat-litter-boxes': 'cat-litter-boxes',
  'dog-toys': 'dog-toys',
  'cat-toys': 'cat-toys',
  'dog-collars-leashes': 'dog-collars-leashes',
  'dog-carriers': 'dog-carriers',
  'cat-carriers': 'cat-carriers',
  'dog-grooming': 'dog-grooming',
  'guinea-pig-cages': 'guinea-pig-cages',
};

export function isCategorySlug(slug: string): boolean {
  return slug in CATEGORY_SLUG_MAP;
}

const CategorySlugRedirect = () => {
  const { slug } = useParams<{ slug: string }>();
  const mapped = slug ? CATEGORY_SLUG_MAP[slug] : undefined;

  if (mapped) {
    return <Navigate to={`/products?category=${mapped}`} replace />;
  }

  return null;
};

export default CategorySlugRedirect;
