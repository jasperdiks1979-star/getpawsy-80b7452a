/**
 * FeaturedSnippetBlock — Direct answer + quick comparison table + bullet USPs.
 * Placed immediately below H1 to capture featured snippets.
 */

import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import type { DirectAnswerConfig, QuickComparisonRow, BulletUSP } from '@/data/domination-config';

interface Props {
  directAnswer: DirectAnswerConfig;
  bulletUSPs: BulletUSP[];
  quickComparison: QuickComparisonRow[];
  shopAnchor?: string;
}

export function FeaturedSnippetBlock({ directAnswer, bulletUSPs, quickComparison, shopAnchor = '#products' }: Props) {
  return (
    <div className="mb-10 space-y-6">
      {/* Direct Answer — 40-60 word block for featured snippet capture */}
      <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 md:p-6">
        <p className="text-base md:text-lg leading-relaxed">
          <strong>{directAnswer.answer}</strong>
        </p>
      </div>

      {/* Bullet USPs */}
      <div className="flex flex-wrap gap-3">
        {bulletUSPs.map((usp) => (
          <span key={usp.text} className="inline-flex items-center gap-1.5 text-sm bg-muted/50 border rounded-full px-3 py-1.5">
            <span>{usp.icon}</span> {usp.text}
          </span>
        ))}
      </div>

      {/* Quick Comparison Table */}
      {quickComparison.length > 0 && (
        <div className="overflow-x-auto border rounded-2xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left p-3 font-semibold">Type</th>
                <th className="text-left p-3 font-semibold">Best For</th>
                <th className="text-left p-3 font-semibold">Key Feature</th>
                <th className="text-left p-3 font-semibold">Price</th>
              </tr>
            </thead>
            <tbody>
              {quickComparison.map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-card' : 'bg-muted/20'}>
                  <td className="p-3 font-medium whitespace-nowrap">
                    {row.model}
                    {row.badge && <Badge className="ml-2 text-[10px]" variant={row.badge.includes('Best') || row.badge.includes('Most') ? 'default' : 'secondary'}>{row.badge}</Badge>}
                  </td>
                  <td className="p-3 text-muted-foreground">{row.bestFor}</td>
                  <td className="p-3 text-muted-foreground text-xs">{row.keyFeature}</td>
                  <td className="p-3">{row.price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
