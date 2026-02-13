import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, X, Truck, Star } from 'lucide-react';

interface Props {
  categorySlug: string;
  categoryLabel: string;
}

export function StickyCTA({ categorySlug, categoryLabel }: Props) {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (dismissed) return;
    const handleScroll = () => {
      const scrollPercent = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
      setVisible(scrollPercent > 30 && scrollPercent < 90);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [dismissed]);

  if (dismissed || !visible) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 animate-in slide-in-from-bottom-4 fade-in duration-300 w-[calc(100%-2rem)] max-w-lg">
      <div className="bg-card border border-border shadow-lg rounded-2xl px-4 py-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-primary flex-shrink-0" />
            <span className="text-sm text-foreground font-medium">
              Ready to shop?
            </span>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/products?category=${categorySlug}`}
            className="bg-primary text-primary-foreground text-sm font-medium px-4 py-2 rounded-full hover:opacity-90 transition-opacity whitespace-nowrap flex-1 text-center"
          >
            Browse {categoryLabel}
          </Link>
        </div>
        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Truck className="w-3 h-3 text-primary" />
            Free US Shipping
          </span>
          <span className="flex items-center gap-1">
            <Star className="w-3 h-3 text-primary" />
            4.8/5 Customer Rating
          </span>
        </div>
      </div>
    </div>
  );
}
