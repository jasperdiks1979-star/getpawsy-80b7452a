/**
 * Micro-friction reduction bullets shown below ATC button.
 * Addresses common purchase hesitations for pet products.
 */
import { CheckCircle } from 'lucide-react';

const FRICTION_POINTS = [
  'No complicated setup — ready to use',
  'Easy to clean & maintain',
  'Designed for daily use',
];

export function MicroFrictionBlock() {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1.5 pt-1">
      {FRICTION_POINTS.map((point) => (
        <span key={point} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CheckCircle className="w-3 h-3 text-primary flex-shrink-0" />
          {point}
        </span>
      ))}
    </div>
  );
}
