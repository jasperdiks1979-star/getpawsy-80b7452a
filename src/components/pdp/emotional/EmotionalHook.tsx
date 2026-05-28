/**
 * EmotionalHook — single-line emotional headline rendered above the buy box.
 * Deterministic copy per category, gated by the `emotionalHook` flag.
 */
import { getEmotionalCopy } from '@/lib/categoryEmotional';
import { getConversionFlag } from '@/lib/conversionFlags';

interface Props {
  category?: string | null;
  productName?: string | null;
  className?: string;
}

export function EmotionalHook({ category, productName, className }: Props) {
  if (!getConversionFlag('emotionalHook')) return null;
  const copy = getEmotionalCopy(category, productName);
  return (
    <p
      className={`relative pl-3 text-[15px] md:text-base leading-snug text-foreground/85 italic font-light tracking-[-0.005em] before:content-[''] before:absolute before:left-0 before:top-1 before:bottom-1 before:w-[2px] before:rounded-full before:bg-primary/60 ${className || ''}`}
    >
      {copy.hook}
    </p>
  );
}

export default EmotionalHook;