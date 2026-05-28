/**
 * EmotionalHook — single-line emotional headline rendered above the buy box.
 * Deterministic copy per category, gated by the `emotionalHook` flag.
 */
import { Sparkles } from 'lucide-react';
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
      className={`flex items-start gap-2 text-sm md:text-[15px] leading-snug text-muted-foreground ${className || ''}`}
    >
      <Sparkles className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" aria-hidden />
      <span className="font-medium text-foreground/90">{copy.hook}</span>
    </p>
  );
}

export default EmotionalHook;