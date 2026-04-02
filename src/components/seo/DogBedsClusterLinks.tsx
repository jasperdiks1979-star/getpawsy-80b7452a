/**
 * DogBedsClusterLinks — Internal linking block for dog bed product pages.
 * Links back to /collections/dog-beds hub and /guides/best-dog-bed-2026 pillar guide.
 * Only renders on product pages whose category matches "dog beds" or similar.
 */

import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, ShoppingBag, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DogBedsClusterLinksProps {
  productCategory: string | null;
  productName: string;
}

const DOG_BED_KEYWORDS = ['dog bed', 'dog beds', 'orthopedic', 'calming bed', 'elevated bed', 'cooling bed', 'memory foam bed', 'pet bed'];

function isDogBedProduct(category: string | null, name: string): boolean {
  const text = `${category || ''} ${name}`.toLowerCase();
  return DOG_BED_KEYWORDS.some(kw => text.includes(kw));
}

export function DogBedsClusterLinks({ productCategory, productName }: DogBedsClusterLinksProps) {
  if (!isDogBedProduct(productCategory, productName)) return null;

  return (
    <div className="space-y-4 mt-8">
      {/* Primary CTA — keyword-rich anchor to pillar guide */}
      <div className="rounded-2xl border-2 border-primary/20 bg-gradient-to-r from-primary/[0.06] to-card p-5 md:p-6">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <HelpCircle className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-display font-bold text-foreground text-base mb-1">
              Not sure which dog bed is best?
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Our expert guide compares the <strong className="text-foreground">best dog beds for 2026</strong> — including orthopedic, cooling, and large breed options — to help you find the perfect fit.
            </p>
          </div>
        </div>
        <Link to="/guides/best-dog-bed-2026">
          <Button variant="outline" className="gap-2 font-semibold w-full sm:w-auto">
            <BookOpen className="w-4 h-4" />
            Read: Best Dog Beds 2026 — Expert Buying Guide
            <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </div>

      {/* Secondary links */}
      <nav className="p-4 rounded-xl border border-border/50 bg-card" aria-label="Dog beds internal links">
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            to="/collections/dog-beds"
            className="group inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            <ShoppingBag className="w-4 h-4 shrink-0" />
            Browse All Dog Beds
            <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>
          <Link
            to="/guides/best-dog-bed-2026"
            className="group inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            <BookOpen className="w-4 h-4 shrink-0" />
            Best Orthopedic Dog Beds for Large Dogs
            <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>
        </div>
      </nav>
    </div>
  );
}
