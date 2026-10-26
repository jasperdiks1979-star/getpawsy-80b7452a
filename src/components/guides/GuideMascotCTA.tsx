import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, X } from 'lucide-react';
import { KittenMascot } from '@/components/v2/storefront/KittenMascot';
import { useEligiblePool } from '@/components/v2/storefront/PetFinder';
import { V2ProductCard } from '@/components/v2/storefront/V2ProductCard';
import type { FinderRow } from '@/lib/petFinder';
import { trackEvent } from '@/lib/analytics';

export type GuidePetContext = 'cat' | 'dog' | 'general';

/** Infer cat/dog context from guide text; ambiguous → general. */
export function guidePetContext(...texts: (string | undefined | null)[]): GuidePetContext {
  const t = texts.filter(Boolean).join(' ').toLowerCase();
  const cat = /\b(cat|cats|kitten|kittens|litter|feline)\b/.test(t);
  const dog = /\b(dog|dogs|puppy|puppies|canine)\b/.test(t);
  if (cat && !dog) return 'cat';
  if (dog && !cat) return 'dog';
  return 'general';
}

export function guideMascotLinks(ctx: GuidePetContext) {
  if (ctx === 'cat') return { headline: 'Find products for your cat', shop: { to: '/collections/cats', label: 'Shop cat essentials' } };
  if (ctx === 'dog') return { headline: 'Find products for your dog', shop: { to: '/collections/dogs', label: 'Shop dog essentials' } };
  return { headline: 'Meet more happy pets', shop: { to: '/collections/cats', label: 'Shop for cats' }, shop2: { to: '/collections/dogs', label: 'Shop for dogs' } };
}

/** Up to `limit` real eligible picks for the guide context (species match, ≥$15). */
export function guidePicks(rows: FinderRow[], ctx: GuidePetContext, limit = 3): FinderRow[] {
  return rows
    .filter((r) => Number(r.stock) > 0 && r.image_url && r.slug && r.price >= 15)
    .filter((r) => ctx === 'general' || r.primary_species === ctx || r.primary_species === 'both')
    .slice(0, limit);
}

const WELCOME_KEY = 'gp-guide-welcome-seen';

/** One per page. In-flow (no sticky/overlay). */
export function GuideMascotCTA({ context, source, className = '' }: { context: GuidePetContext; source: string; className?: string }) {
  const l = guideMascotLinks(context);
  const { data: pool = [] } = useEligiblePool(true);
  const picks = guidePicks(pool, context);
  const [welcome, setWelcome] = useState(false);
  useEffect(() => {
    try {
      if (!sessionStorage.getItem(WELCOME_KEY)) { setWelcome(true); sessionStorage.setItem(WELCOME_KEY, '1'); }
    } catch { /* storage blocked: no bubble */ }
  }, []);
  const track = (target: string) => trackEvent('guide_mascot_cta_click', { source, target, context });
  return (
    <aside aria-label="Explore GetPawsy" className={`not-prose rounded-3xl bg-secondary p-4 sm:p-5 ${className}`}>
      <div className="flex items-center gap-4">
        <KittenMascot size="sm" />
        <div className="min-w-0 flex-1">
          {welcome && (
            <p className="mb-1 inline-flex items-center gap-1 rounded-full bg-background px-3 py-1 text-xs font-semibold text-foreground shadow-sm">
              Hi! Enjoy the guide 🐾
              <button type="button" onClick={() => setWelcome(false)} aria-label="Dismiss greeting" className="ml-1 rounded-full p-0.5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X className="h-3 w-3" /></button>
            </p>
          )}
          <p className="font-display text-base font-bold text-foreground sm:text-lg">{l.headline}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">In-stock picks, free US shipping over $35 and 30-day returns.</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
            <Link to={l.shop.to} onClick={() => track(l.shop.to)} className="inline-flex items-center gap-1 text-primary hover:underline">
              {l.shop.label} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
            {'shop2' in l && l.shop2 && (
              <Link to={l.shop2.to} onClick={() => track(l.shop2!.to)} className="inline-flex items-center gap-1 text-primary hover:underline">
                {l.shop2.label} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            )}
            <Link to="/" onClick={() => track('/')} className="inline-flex items-center gap-1 text-foreground hover:text-primary hover:underline">
              Explore GetPawsy <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
      {picks.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3" onClickCapture={() => track('pick')}>
          {picks.map((p) => <V2ProductCard key={p.id} product={p} />)}
        </div>
      )}
    </aside>
  );
}
