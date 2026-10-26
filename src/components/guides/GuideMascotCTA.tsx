import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { KittenMascot } from '@/components/v2/storefront/KittenMascot';
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

/** One per page. In-flow (no sticky/overlay), fixed height → no layout shift. */
export function GuideMascotCTA({ context, source, className = '' }: { context: GuidePetContext; source: string; className?: string }) {
  const l = guideMascotLinks(context);
  const track = (target: string) => trackEvent('guide_mascot_cta_click', { source, target, context });
  return (
    <aside aria-label="Explore GetPawsy" className={`not-prose flex items-center gap-4 rounded-3xl bg-secondary p-4 sm:p-5 ${className}`}>
      <KittenMascot size="sm" />
      <div className="min-w-0 flex-1">
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
    </aside>
  );
}
