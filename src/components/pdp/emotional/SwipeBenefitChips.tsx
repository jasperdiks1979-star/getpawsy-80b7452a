/**
 * SwipeBenefitChips — horizontally-scrollable benefit chips shown on mobile
 * above the product gallery. Pure presentation, no analytics, no AI.
 * Height is reserved via `min-h` to prevent CLS during hydration.
 */
import { getEmotionalCopy } from '@/lib/categoryEmotional';
import { getConversionFlag } from '@/lib/conversionFlags';

interface Props {
  category?: string | null;
  productName?: string | null;
}

export function SwipeBenefitChips({ category, productName }: Props) {
  if (!getConversionFlag('swipeBenefitChips')) return null;
  const { benefits } = getEmotionalCopy(category, productName);
  // De-dupe anything already covered by MobileStickyTrustBar so we never
  // repeat trust microcopy on the same screen — premium brands earn each line.
  const REDUNDANT = /free\s+(us\s+)?shipping|30-?day\s+returns|secure\s+checkout/i;
  const refined = benefits.filter((b) => !REDUNDANT.test(b));
  if (refined.length === 0) return null;
  return (
    <div
      className="md:hidden -mx-4 px-4 mb-3 overflow-x-auto scrollbar-hide min-h-[36px]"
      style={{ WebkitOverflowScrolling: 'touch', contain: 'layout' }}
      aria-label="Key benefits"
    >
      <ul className="flex gap-2 w-max">
        {refined.map((b) => (
          <li
            key={b}
            className="whitespace-nowrap rounded-full border border-border/60 bg-background/60 px-3.5 py-1.5 text-[11px] font-medium tracking-[0.02em] text-foreground/75"
          >
            {b}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default SwipeBenefitChips;