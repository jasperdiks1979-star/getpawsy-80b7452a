/**
 * ReassuranceCallout — scroll-triggered emotional reassurance line shown on
 * mobile between the description and the deeper PDP sections.
 *
 * Uses a single IntersectionObserver (lazy mount, no animation libraries) so
 * it adds zero LCP weight and a fixed min-height to prevent CLS.
 */
import { useEffect, useRef, useState } from 'react';
import { Heart } from 'lucide-react';
import { getEmotionalCopy } from '@/lib/categoryEmotional';
import { getConversionFlag } from '@/lib/conversionFlags';

interface Props {
  category?: string | null;
  productName?: string | null;
}

export function ReassuranceCallout({ category, productName }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setSeen(true);
            io.disconnect();
            return;
          }
        }
      },
      { rootMargin: '0px 0px -20% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (!getConversionFlag('reassuranceCallout')) return null;
  const { reassurance } = getEmotionalCopy(category, productName);

  return (
    <div
      ref={ref}
      className="md:hidden my-6 min-h-[68px]"
      style={{ contain: 'layout' }}
    >
      <div
        className={`flex items-start gap-3 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 transition-opacity duration-500 ${
          seen ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <Heart className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" aria-hidden />
        <p className="text-sm leading-snug text-foreground">{reassurance}</p>
      </div>
    </div>
  );
}

export default ReassuranceCallout;