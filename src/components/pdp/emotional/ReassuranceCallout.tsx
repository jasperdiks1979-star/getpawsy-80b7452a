/**
 * ReassuranceCallout — scroll-triggered emotional reassurance line shown on
 * mobile between the description and the deeper PDP sections.
 *
 * Uses a single IntersectionObserver (lazy mount, no animation libraries) so
 * it adds zero LCP weight and a fixed min-height to prevent CLS.
 */
import { useEffect, useRef, useState } from 'react';
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
      className="md:hidden my-8 min-h-[72px]"
      style={{ contain: 'layout' }}
    >
      <figure
        className={`text-center px-6 transition-all duration-700 ${
          seen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1.5'
        }`}
      >
        <span
          aria-hidden
          className="mx-auto block h-px w-10 bg-foreground/15 mb-4"
        />
        <blockquote className="text-[17px] leading-[1.5] tracking-[-0.01em] text-foreground/85 font-light italic">
          “{reassurance}”
        </blockquote>
        <span
          aria-hidden
          className="mx-auto block h-px w-10 bg-foreground/15 mt-4"
        />
      </figure>
    </div>
  );
}

export default ReassuranceCallout;