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
  return (
    <div
      className="md:hidden -mx-4 px-4 mb-3 overflow-x-auto scrollbar-hide min-h-[36px]"
      style={{ WebkitOverflowScrolling: 'touch', contain: 'layout' }}
      aria-label="Key benefits"
    >
      <ul className="flex gap-2 w-max">
        {benefits.map((b) => (
          <li
            key={b}
            className="whitespace-nowrap rounded-full border border-border bg-secondary/40 px-3 py-1 text-xs font-medium text-secondary-foreground"
          >
            {b}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default SwipeBenefitChips;