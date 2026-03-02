/**
 * SniperChecklist — Checkbox-style checklist for buyer decision snippets.
 * Renders as a visual checklist with check icons.
 */

import { Check } from 'lucide-react';

interface Props {
  title: string;
  items: string[];
  className?: string;
}

export function SniperChecklist({ title, items, className = '' }: Props) {
  return (
    <div className={`border rounded-xl p-4 md:p-5 mb-6 bg-card ${className}`}>
      <h3 className="text-base font-semibold mb-3">{title}</h3>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2">
            <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            <span className="text-sm">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
