/**
 * GuideTopPick — Hero "Editor's Pick" block at the top of pillar guides.
 * Shows #1 recommended product with image, price, benefits, and strong CTA.
 */
import { Link } from 'react-router-dom';
import { Award, CheckCircle, Truck, Shield, TrendingUp } from 'lucide-react';
import { OptimizedImage } from '@/components/ui/optimized-image';
import { Button } from '@/components/ui/button';

interface Props {
  name: string;
  image?: string;
  price: string;
  link: string;
  badge?: string;
  benefits: string[];
  trustLabel?: string;
}

export function GuideTopPick({ name, image, price, link, badge, benefits, trustLabel }: Props) {
  if (!name || !link?.startsWith('/product') || !image || image.startsWith('/images/guides/')) return null;

  return (
    <section className="mb-12 rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/[0.06] via-card to-card overflow-hidden shadow-md">
      {/* Badge header */}
      <div className="bg-primary px-5 py-2.5 flex items-center gap-2">
        <Award className="w-4 h-4 text-primary-foreground" />
        <span className="text-primary-foreground text-sm font-bold tracking-wide">
          {badge || "🏆 Editor's #1 Pick"}
        </span>
        {trustLabel && (
          <span className="ml-auto text-primary-foreground/80 text-xs font-medium">
            {trustLabel}
          </span>
        )}
      </div>

      <div className="p-5 md:p-6 flex flex-col sm:flex-row gap-5">
        {/* Product image */}
        <div className="sm:w-2/5 aspect-square sm:aspect-[4/3] bg-muted rounded-xl overflow-hidden flex-shrink-0">
          <OptimizedImage
            src={image}
            alt={name}
            aspectRatio="auto"
            containerClassName="w-full h-full"
            className="hover:scale-105 transition-transform duration-500"
          />
        </div>

        {/* Details */}
        <div className="flex-1 flex flex-col justify-between">
          <div>
            <h3 className="font-display font-bold text-foreground text-lg md:text-xl leading-snug mb-2">
              {name}
            </h3>
            <p className="text-2xl md:text-3xl font-bold text-foreground tracking-tight mb-4">
              {price}
            </p>

            {/* Benefits */}
            <ul className="space-y-2 mb-4">
              {benefits.slice(0, 4).map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>

            {/* Urgency */}
            <div className="flex items-center gap-2 text-xs text-amber-600 font-semibold mb-4">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Most popular choice — customers are buying this now</span>
            </div>
          </div>

          {/* CTA */}
          <div className="space-y-3">
            <Link to={link} className="block">
              <Button className="w-full h-12 text-base font-bold gap-2">
                Buy Now — Free Shipping Available
              </Button>
            </Link>
            <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5 text-primary" />
                Free Shipping $35+
              </span>
              <span className="flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-primary" />
                30-Day Returns
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
