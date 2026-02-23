/**
 * MidContentCTA — Mid-content call-to-action block.
 * Reduces pogo-sticking by presenting clear next action.
 */

import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

interface Props {
  headline: string;
  subtext: string;
  ctaText: string;
  ctaHref: string;
}

export function MidContentCTA({ headline, subtext, ctaText, ctaHref }: Props) {
  return (
    <div className="my-12 bg-primary/5 border border-primary/20 rounded-2xl p-6 md:p-8 text-center">
      <h3 className="text-lg md:text-xl font-semibold mb-2">{headline}</h3>
      <p className="text-muted-foreground text-sm mb-4 max-w-xl mx-auto">{subtext}</p>
      <Button asChild>
        <a href={ctaHref}>{ctaText} <ArrowRight className="w-4 h-4 ml-1" /></a>
      </Button>
    </div>
  );
}
