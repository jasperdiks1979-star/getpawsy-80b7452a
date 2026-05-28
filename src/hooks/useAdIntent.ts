/**
 * Detects landing-page intent from URL params (Pinterest hooks, ad keywords)
 * or product category. Returns intent-matched headline, benefit subline, and
 * "Best for" overrides for PDP personalization.
 *
 * Supported URL params (priority order):
 *   ?hook=...         Pinterest hook group (problem|solution|comparison|transformation)
 *   ?utm_hook=...     Same as ?hook= (Pinterest UTM convention)
 *   ?kw=...           Google Ads keyword cluster (existing)
 *
 * Falls back to category-based detection when no param is present.
 */
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export interface AdIntent {
  keyword: string | null;
  headline: string;
  subline: string;
  bestFor: string[];
  source: 'pinterest' | 'ad' | 'category' | null;
}

const INTENT_MAP: Record<string, { headline: string; subline: string; bestFor: string[] }> = {
  'large-dogs': {
    headline: 'Perfect Comfort for Large Dogs',
    subline: 'Built to support bigger breeds — every nap, every night.',
    bestFor: ['Large & extra-large breeds', 'Heavy-duty support', 'Daily indoor comfort'],
  },
  'cooling': {
    headline: 'Cooling Comfort for Warm Weather',
    subline: 'Keeps your pet cool when temperatures rise — indoors or out.',
    bestFor: ['Warm climates & summer', 'Indoor & outdoor use', 'Heat-sensitive breeds'],
  },
  'orthopedic': {
    headline: 'Supportive Comfort for Joint Relief',
    subline: 'Designed to ease pressure on aging hips and joints.',
    bestFor: ['Senior dogs', 'Joint & hip support', 'Post-surgery recovery'],
  },
  'travel': {
    headline: 'Travel-Ready Comfort for Your Pet',
    subline: 'Stress-free trips, safer rides, happier arrivals.',
    bestFor: ['Road trips & errands', 'Airline travel', 'On-the-go pet owners'],
  },
  'outdoor': {
    headline: 'Built for Outdoor Adventures',
    subline: 'Tough enough for the patio, the yard, and the trail.',
    bestFor: ['Outdoor & patio use', 'Weather-resistant design', 'Active dogs'],
  },
  'senior': {
    headline: 'Gentle Support for Senior Pets',
    subline: 'A little extra comfort for the pets who gave you everything.',
    bestFor: ['Aging dogs & cats', 'Joint comfort', 'Restful recovery sleep'],
  },
  'puppy': {
    headline: 'Safe & Cozy for Growing Puppies',
    subline: 'Built for little paws, tough on chewing, easy to clean.',
    bestFor: ['New puppies', 'Durable & chew-resistant', 'Easy to clean'],
  },
  'cat-tree': {
    headline: 'The Ultimate Play Space for Cats',
    subline: 'Climbing, scratching, lounging — all in one sturdy spot.',
    bestFor: ['Active indoor cats', 'Multi-cat households', 'Scratching & climbing'],
  },
  'litter-box': {
    headline: 'Effortless Litter Management',
    subline: 'Less scooping. Less smell. More time with your cat.',
    bestFor: ['Busy cat owners', 'Multi-cat homes', 'Odor-free living'],
  },
  // Pinterest hook groups (matches mem://marketing/pinterest-content-and-hook-strategy)
  'problem': {
    headline: 'The Fix Pet Owners Wish They Found Sooner',
    subline: 'A simple solution to the daily frustration you already know too well.',
    bestFor: ['Pet owners tired of mess', 'Daily routine simplifiers', 'Real-world fixes'],
  },
  'solution': {
    headline: 'The Easier Way to Care for Your Pet',
    subline: 'Designed to make daily pet life smoother — without the guesswork.',
    bestFor: ['Busy households', 'Time-strapped owners', 'Practical pet parents'],
  },
  'comparison': {
    headline: 'Why Pet Owners Are Switching to This',
    subline: 'A smarter pick than the usual options — built for real pets, real homes.',
    bestFor: ['Smart shoppers', 'Quality-first buyers', 'Long-term value seekers'],
  },
  'transformation': {
    headline: 'A Small Change. A Big Difference.',
    subline: 'See why pet owners say this changed their daily routine.',
    bestFor: ['Lifestyle upgrades', 'Routine improvers', 'Calmer home seekers'],
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
    const hookParam = (searchParams.get('hook') || searchParams.get('utm_hook') || '').toLowerCase().trim();
    const kwParam = (searchParams.get('kw') || '').toLowerCase().trim();
    const utmSource = (searchParams.get('utm_source') || '').toLowerCase();

    let intentKey: string | null = null;
    let source: AdIntent['source'] = null;

    if (hookParam && INTENT_MAP[hookParam]) {
      intentKey = hookParam;
      source = utmSource.includes('pinterest') ? 'pinterest' : 'ad';
    } else if (kwParam && INTENT_MAP[kwParam]) {
      intentKey = kwParam;
      source = 'ad';
    } else if (category) {
      intentKey = detectIntentFromCategory(category);
      if (intentKey) source = 'category';
    }

    if (intentKey && INTENT_MAP[intentKey]) {
      return {
        keyword: intentKey,
        headline: INTENT_MAP[intentKey].headline,
        subline: INTENT_MAP[intentKey].subline,
        bestFor: INTENT_MAP[intentKey].bestFor,
        source,
      };
    }

    return { keyword: null, headline: '', subline: '', bestFor: [], source: null };
  }, [searchParams, category]);
}
