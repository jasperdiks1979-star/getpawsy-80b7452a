import { useState } from 'react';
import room from '@/assets/shop-the-room.jpg';
import { useEligiblePool } from './PetFinder';
import { ROOM_SPOTS, roomMatches } from '@/lib/shopTheRoom';
import { V2ProductCard } from './V2ProductCard';

/**
 * Shop the room — illustrative photo with hotspots per product type.
 * Hotspots open real, in-stock catalog items of that type; the pictured
 * furniture is an illustration and is not claimed to be the exact product.
 */
export function ShopTheRoom() {
  const [active, setActive] = useState(ROOM_SPOTS[0].id);
  const { data: pool = [], isError, isLoading } = useEligiblePool(true);
  const spot = ROOM_SPOTS.find((s) => s.id === active)!;
  const items = roomMatches(pool, spot);
  const avail = ROOM_SPOTS.filter((s) => isLoading || roomMatches(pool, s).length > 0);

  return (
    <section aria-labelledby="room-heading" className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 md:py-14">
      <h2 id="room-heading" className="font-display text-2xl font-bold text-foreground sm:text-3xl">Shop the room</h2>
      <p className="mt-1 text-sm text-muted-foreground">Tap a spot to see real in-stock products of that type.</p>
      <div className="mt-5 grid gap-6 md:grid-cols-[3fr_2fr]">
        <figure>
          <div className="relative overflow-hidden rounded-3xl">
            <img src={room} alt="Illustrative living room with a cat on a cat tree, a dog on a round bed, toys and bowls" width={1280} height={800} loading="lazy" decoding="async" className="h-auto w-full" />
            {avail.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActive(s.id)}
                aria-pressed={active === s.id}
                aria-label={`Show ${s.label}`}
                style={{ left: `${s.x}%`, top: `${s.y}%` }}
                className="absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className={`block h-5 w-5 rounded-full border-2 border-background shadow-md ${active === s.id ? 'bg-primary scale-125' : 'bg-background/90'} transition-transform motion-reduce:transition-none`} />
              </button>
            ))}
          </div>
          <figcaption className="mt-2 text-xs text-muted-foreground">Illustration only — pictured furniture and items are not the exact products sold. Cards show the real product photos and prices.</figcaption>
        </figure>
        <div>
          <div role="group" aria-label="Product types" className="flex flex-wrap gap-2">
            {avail.map((s) => (
              <button key={s.id} type="button" onClick={() => setActive(s.id)} aria-pressed={active === s.id}
                className="min-h-11 rounded-full border border-border bg-background px-4 text-sm font-semibold text-foreground hover:border-primary aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {s.label}
              </button>
            ))}
          </div>
          <div aria-live="polite" className="mt-4 grid min-h-[16rem] grid-cols-2 gap-3 lg:grid-cols-3">
            {isError && <p className="col-span-full text-sm text-muted-foreground">Products couldn't load right now. Please try again later.</p>}
            {!isError && !isLoading && items.length === 0 && <p className="col-span-full text-sm text-muted-foreground">No in-stock items of this type right now.</p>}
            {items.map((p) => <V2ProductCard key={p.id} product={p} />)}
          </div>
        </div>
      </div>
    </section>
  );
}
