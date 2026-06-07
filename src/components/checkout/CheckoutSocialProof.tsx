import { Star } from 'lucide-react';

const REVIEWS = [
  { stars: 5, text: 'Best purchase we made for our cat.', name: 'Sarah', loc: 'Texas' },
  { stars: 5, text: 'The app works great and cleanup is effortless.', name: 'Michael', loc: 'Florida' },
  { stars: 5, text: 'No smell and no daily scooping anymore.', name: 'Amanda', loc: 'California' },
];

/**
 * CheckoutSocialProof — short social-proof line + 3 verified review cards.
 * Rendered above the order summary's payment section to reinforce the
 * decision to complete checkout.
 */
export function CheckoutSocialProof() {
  return (
    <section
      aria-label="What other cat owners are saying"
      className="rounded-xl border border-border/50 bg-card p-4 sm:p-5"
    >
      <p className="text-sm text-foreground leading-relaxed mb-4">
        Cat owners are switching to self-cleaning litter boxes to eliminate
        daily scooping.
      </p>
      <ul className="space-y-3 list-none p-0 m-0">
        {REVIEWS.map((r) => (
          <li key={r.name} className="rounded-lg bg-muted/40 px-3 py-2.5">
            <div className="flex items-center gap-0.5 mb-1" aria-label={`${r.stars} out of 5 stars`}>
              {Array.from({ length: r.stars }).map((_, i) => (
                <Star key={i} className="w-3.5 h-3.5 text-amber-500 fill-amber-500" aria-hidden />
              ))}
            </div>
            <p className="text-[13px] text-foreground leading-snug">"{r.text}"</p>
            <p className="text-[11px] text-muted-foreground mt-1">— {r.name}, {r.loc}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default CheckoutSocialProof;