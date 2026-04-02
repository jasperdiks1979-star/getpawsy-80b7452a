/**
 * GuideInlineProduct — Contextual product card inserted between guide sections.
 * Shows product with trust trigger, key benefit, and CTA.
 */
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle, TrendingUp } from 'lucide-react';
import { OptimizedImage } from '@/components/ui/optimized-image';
import { Button } from '@/components/ui/button';

interface Props {
  name: string;
  image?: string;
  price: string;
  link: string;
  trustTrigger?: string; // e.g. "Most popular choice", "Best for joint support"
  benefit?: string;
}

export function GuideInlineProduct({ name, image, price, link, trustTrigger, benefit }: Props) {
  if (!name || !link?.startsWith('/product') || !image || image.startsWith('/images/guides/')) return null;

  return (
    <div className="my-8 rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/[0.04] to-card overflow-hidden">
      <div className="flex flex-col sm:flex-row gap-4 p-4 md:p-5">
        {/* Image */}
        <div className="sm:w-32 md:w-40 aspect-square bg-muted rounded-xl overflow-hidden flex-shrink-0">
          <OptimizedImage
            src={image}
            alt={name}
            aspectRatio="auto"
            containerClassName="w-full h-full"
          />
        </div>

        {/* Details */}
        <div className="flex-1 flex flex-col justify-between min-w-0">
          <div>
            {trustTrigger && (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-full mb-2">
                <TrendingUp className="w-3 h-3" />
                {trustTrigger}
              </span>
            )}
            <h4 className="font-display font-bold text-foreground text-sm md:text-base leading-snug mb-1">
              {name}
            </h4>
            <p className="text-lg font-bold text-foreground mb-2">{price}</p>
            {benefit && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground mb-3">
                <CheckCircle className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                {benefit}
              </p>
            )}
          </div>

          <Link to={link}>
            <Button size="sm" className="gap-1.5 font-semibold">
              View Product <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
