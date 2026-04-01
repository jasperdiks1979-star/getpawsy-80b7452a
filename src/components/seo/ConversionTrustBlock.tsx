/**
 * ConversionTrustBlock — Reusable conversion layer for priority categories
 * 
 * Displays benefit blocks, trust badges, and "Why Choose GetPawsy" section.
 * Used on all 3 priority collection pages.
 */
import { Shield, Truck, RotateCcw, Star, CheckCircle, Zap } from 'lucide-react';
import { FREE_SHIPPING_THRESHOLD } from '@/lib/shipping-constants';

interface ConversionTrustBlockProps {
  categoryName: string;
}

export function ConversionTrustBlock({ categoryName }: ConversionTrustBlockProps) {
  return (
    <section className="mb-16">
      {/* Benefit Blocks */}
      <h2 className="text-2xl md:text-3xl font-display font-bold mb-6">Why Choose GetPawsy for {categoryName}</h2>
      <div className="grid sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-card border rounded-2xl p-5 text-center">
          <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-3">
            <Shield className="w-6 h-6 text-primary" />
          </div>
          <h3 className="font-semibold text-sm mb-1">Carefully Selected</h3>
          <p className="text-xs text-muted-foreground">Every product reviewed for quality, safety, and pet comfort before listing</p>
        </div>
        <div className="bg-card border rounded-2xl p-5 text-center">
          <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-3">
            <Star className="w-6 h-6 text-primary fill-primary" />
          </div>
          <h3 className="font-semibold text-sm mb-1">Customer Favorites</h3>
          <p className="text-xs text-muted-foreground">Popular products chosen by pet parents across the United States</p>
        </div>
        <div className="bg-card border rounded-2xl p-5 text-center">
          <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-3">
            <Zap className="w-6 h-6 text-primary" />
          </div>
          <h3 className="font-semibold text-sm mb-1">Practical & Reliable</h3>
          <p className="text-xs text-muted-foreground">Products evaluated for durability and everyday use — not just packaging claims</p>
        </div>
      </div>

      {/* Trust Badges Row */}
      <div className="flex flex-wrap justify-center gap-6 py-6 bg-muted/30 rounded-2xl mb-8">
        {[
          { icon: <Truck className="w-5 h-5" />, label: `Free shipping on eligible orders over $${FREE_SHIPPING_THRESHOLD}` },
          { icon: <RotateCcw className="w-5 h-5" />, label: '30-Day Return Policy' },
          { icon: <Shield className="w-5 h-5" />, label: 'Secure Stripe Checkout' },
          { icon: <CheckCircle className="w-5 h-5" />, label: 'Dedicated Customer Support' },
        ].map(badge => (
          <div key={badge.label} className="flex items-center gap-2 text-sm font-medium text-foreground/80">
            <span className="text-primary">{badge.icon}</span>
            {badge.label}
          </div>
        ))}
      </div>
    </section>
  );
}
