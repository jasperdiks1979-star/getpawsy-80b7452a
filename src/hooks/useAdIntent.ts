/**
 * Detects ad keyword intent from URL ?kw= param or product category.
 * Returns intent-matched headline and "Best for" overrides for PDP personalization.
 */
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

interface AdIntent {
  keyword: string | null;
  headline: string;
  bestFor: string[];
}

const INTENT_MAP: Record<string, { headline: string; bestFor: string[] }> = {
  'large-dogs': {
    headline: 'Perfect Comfort for Large Dogs',
    bestFor: ['Large & extra-large breeds', 'Heavy-duty support', 'Daily indoor comfort'],
  },
  'cooling': {
    headline: 'Cooling Comfort for Warm Weather',
    bestFor: ['Warm climates & summer', 'Indoor & outdoor use', 'Heat-sensitive breeds'],
  },
  'orthopedic': {
    headline: 'Supportive Comfort for Joint Relief',
    bestFor: ['Senior dogs', 'Joint & hip support', 'Post-surgery recovery'],
  },
  'travel': {
    headline: 'Travel-Ready Comfort for Your Pet',
    bestFor: ['Road trips & errands', 'Airline travel', 'On-the-go pet owners'],
  },
  'outdoor': {
    headline: 'Built for Outdoor Adventures',
    bestFor: ['Outdoor & patio use', 'Weather-resistant design', 'Active dogs'],
  },
  'senior': {
    headline: 'Gentle Support for Senior Pets',
    bestFor: ['Aging dogs & cats', 'Joint comfort', 'Restful recovery sleep'],
  },
  'puppy': {
    headline: 'Safe & Cozy for Growing Puppies',
    bestFor: ['New puppies', 'Durable & chew-resistant', 'Easy to clean'],
  },
  'cat-tree': {
    headline: 'The Ultimate Play Space for Cats',
    bestFor: ['Active indoor cats', 'Multi-cat households', 'Scratching & climbing'],
  },
  'litter-box': {
    headline: 'Effortless Litter Management',
    bestFor: ['Busy cat owners', 'Multi-cat homes', 'Odor-free living'],
  },
};

function detectIntentFromCategory(category: string): string | null {
  const c = category.toLowerCase();
  if (/litter/i.test(c)) return 'litter-box';
  if (/cat\s*tree|cat\s*condo/i.test(c)) return 'cat-tree';
  if (/cooling|elevated/i.test(c)) return 'cooling';
  if (/orthopedic|memory\s*foam/i.test(c)) return 'orthopedic';
  if (/travel|carrier|stroller/i.test(c)) return 'travel';
  if (/outdoor/i.test(c)) return 'outdoor';
  return null;
}

export function useAdIntent(category?: string | null): AdIntent {
  const [searchParams] = useSearchParams();

  return useMemo(() => {
    const kw = searchParams.get('kw');
    const intentKey = kw || (category ? detectIntentFromCategory(category) : null);

    if (intentKey && INTENT_MAP[intentKey]) {
      return {
        keyword: intentKey,
        headline: INTENT_MAP[intentKey].headline,
        bestFor: INTENT_MAP[intentKey].bestFor,
      };
    }

    return { keyword: null, headline: '', bestFor: [] };
  }, [searchParams, category]);
}
