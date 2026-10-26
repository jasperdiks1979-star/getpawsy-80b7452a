import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { X, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { finderMatches, NEEDS, type Budget, type FinderRow, type Need, type Pet } from '@/lib/petFinder';
import { displayName } from '@/lib/displayName';
import { cardTitle } from '@/lib/cardTitle';
import { KittenMascot } from './KittenMascot';

const BUDGETS: { id: Budget; label: string }[] = [
  { id: 'under50', label: 'Under $50' },
  { id: '50to100', label: '$50 – $100' },
  { id: 'any', label: 'Any budget' },
];

export function useEligiblePool(enabled = true) {
  return useQuery({
    queryKey: ['v2-pet-finder-pool'],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<FinderRow[]> => {
      const { data, error } = await supabase
        .from('products_public')
        .select('id, slug, name, price, image_url, stock, primary_species')
        .eq('is_active', true)
        .gt('stock', 0)
        .not('is_duplicate', 'is', true)
        .eq('merch_hidden', false)
        .neq('merch_role', 'blocked')
        .not('image_url', 'is', null)
        .limit(200);
      if (error) throw error;
      return (data ?? []) as FinderRow[];
    },
  });
}

const chip =
  'min-h-11 rounded-full border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground motion-reduce:transition-none';

export function PetFinder() {
  const [open, setOpen] = useState(false);
  const [pet, setPet] = useState<Pet | null>(null);
  const [need, setNeed] = useState<Need | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);
  const { data: pool = [], isLoading, isError } = useEligiblePool(open);
  const reset = () => { setPet(null); setNeed(null); setBudget(null); };
  const results = pet && need && budget ? finderMatches(pool, pet, need, budget) : null;

  return (
    <section aria-labelledby="finder-heading" className="mx-auto w-full max-w-6xl px-4 pb-4 sm:px-6">
      <div className="relative overflow-hidden rounded-3xl bg-secondary p-5 sm:p-8">
        <div className="flex items-center gap-4">
          <KittenMascot />
          <div className="min-w-0 flex-1">
            <h2 id="finder-heading" className="font-display text-xl font-bold text-foreground sm:text-2xl">Not sure where to start?</h2>
            <p className="mt-1 text-sm text-muted-foreground">Answer 3 quick questions and we'll show in-stock items that fit.</p>
          </div>
          {open && (
            <button type="button" onClick={() => { setOpen(false); reset(); }} aria-label="Close product finder" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>

        {!open ? (
          <button type="button" onClick={() => setOpen(true)} className="mt-5 min-h-12 rounded-full bg-primary px-6 text-base font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            Find a match
          </button>
        ) : (
          <div className="mt-6 space-y-5">
            <fieldset>
              <legend className="text-sm font-semibold text-foreground">1. Who are you shopping for?</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {(['cat', 'dog'] as Pet[]).map((p) => (
                  <button key={p} type="button" aria-pressed={pet === p} onClick={() => { setPet(p); setNeed(null); }} className={chip}>{p === 'cat' ? 'My cat' : 'My dog'}</button>
                ))}
              </div>
            </fieldset>
            {pet && (
              <fieldset>
                <legend className="text-sm font-semibold text-foreground">2. What do you need?</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {NEEDS[pet].map((n) => (
                    <button key={n.id} type="button" aria-pressed={need === n.id} onClick={() => setNeed(n.id)} className={chip}>{n.label}</button>
                  ))}
                </div>
              </fieldset>
            )}
            {pet && need && (
              <fieldset>
                <legend className="text-sm font-semibold text-foreground">3. Your budget?</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {BUDGETS.map((b) => (
                    <button key={b.id} type="button" aria-pressed={budget === b.id} onClick={() => setBudget(b.id)} className={chip}>{b.label}</button>
                  ))}
                </div>
              </fieldset>
            )}

            <div aria-live="polite">
              {results && isLoading && <p className="text-sm text-muted-foreground">Checking what's in stock…</p>}
              {results && isError && <p className="text-sm text-muted-foreground">We couldn't load products right now. <Link to="/products" className="font-semibold text-primary underline">Browse all products</Link>.</p>}
              {results && !isLoading && !isError && results.length === 0 && (
                <p className="text-sm text-muted-foreground">No in-stock items match all three answers right now. Try another budget, or <Link to={pet === 'dog' ? '/collections/dogs' : '/collections/cats'} className="font-semibold text-primary underline">browse the full range</Link>.</p>
              )}
              {results && results.length > 0 && (
                <>
                  <p className="text-sm font-semibold text-foreground">{results.length} in-stock match{results.length === 1 ? '' : 'es'}</p>
                  <ul className="mt-3 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-4">
                    {results.map((r) => (
                      <li key={r.id}>
                        <Link to={`/products/${r.slug}`} className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <img src={r.image_url!} alt={displayName(r)} width={240} height={240} loading="lazy" decoding="async" className="aspect-square w-full bg-background object-contain p-2" />
                          <span className="line-clamp-2 px-3 pt-2 text-sm font-medium text-foreground">{cardTitle(displayName(r))}</span>
                          <span className="mt-auto px-3 pb-3 pt-1 text-sm font-semibold text-primary">See price &amp; options</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            {(pet || need || budget) && (
              <button type="button" onClick={reset} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
                <RotateCcw className="h-4 w-4" aria-hidden="true" /> Start over
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
