/**
 * DogBedsClusterLinks — Internal linking block for dog bed product pages.
 * Links back to /collections/dog-beds hub and /guides/best-dog-beds-2026 pillar guide.
 * Only renders on product pages whose category matches "dog beds" or similar.
 */

import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, ShoppingBag } from 'lucide-react';

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
    <nav className="mt-8 p-5 rounded-xl border border-border/50 bg-card space-y-3" aria-label="Dog beds internal links">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        More Dog Bed Resources
      </h3>
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
          Best Dog Beds 2026 — Buying Guide
          <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
        </Link>
      </div>
    </nav>
  );
}
