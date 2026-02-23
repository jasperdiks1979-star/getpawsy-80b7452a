/**
 * ConversionTrustBlock — Reusable conversion layer for priority categories
 * 
 * Displays benefit blocks, trust badges, and "Why Choose GetPawsy" section.
 * Used on all 3 priority collection pages.
 */
import { Shield, Truck, RotateCcw, Star, CheckCircle, Zap } from 'lucide-react';

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
          <h3 className="font-semibold text-sm mb-1">Expert Vetted</h3>
          <p className="text-xs text-muted-foreground">Every product reviewed by pet care specialists for safety and quality</p>
        </div>
        <div className="bg-card border rounded-2xl p-5 text-center">
          <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-3">
            <Star className="w-6 h-6 text-primary fill-primary" />
          </div>
          <h3 className="font-semibold text-sm mb-1">4.8/5 Average Rating</h3>
          <p className="text-xs text-muted-foreground">Trusted by thousands of US pet parents with verified reviews</p>
        </div>
        <div className="bg-card border rounded-2xl p-5 text-center">
          <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-3">
            <Zap className="w-6 h-6 text-primary" />
          </div>
          <h3 className="font-semibold text-sm mb-1">Real Testing, Not Marketing</h3>
          <p className="text-xs text-muted-foreground">Products tested under real conditions — not just manufacturer claims</p>
        </div>
      </div>

      {/* Trust Badges Row */}
      <div className="flex flex-wrap justify-center gap-6 py-6 bg-muted/30 rounded-2xl mb-8">
        {[
          { icon: <Truck className="w-5 h-5" />, label: 'Free US Shipping Over $35' },
          { icon: <RotateCcw className="w-5 h-5" />, label: '30-Day Money-Back Guarantee' },
          { icon: <Shield className="w-5 h-5" />, label: 'Secure Stripe Checkout' },
          { icon: <CheckCircle className="w-5 h-5" />, label: 'US-Based Support' },
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
