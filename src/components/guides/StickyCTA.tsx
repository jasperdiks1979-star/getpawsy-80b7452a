import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, X } from 'lucide-react';

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
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="bg-card border border-border shadow-lg rounded-full pl-5 pr-2 py-2.5 flex items-center gap-3">
        <ShoppingBag className="w-4 h-4 text-primary flex-shrink-0" />
        <span className="text-sm text-foreground font-medium whitespace-nowrap">
          Ready to shop?
        </span>
        <Link
          to={`/products?category=${categorySlug}`}
          className="bg-primary text-primary-foreground text-sm font-medium px-4 py-1.5 rounded-full hover:opacity-90 transition-opacity whitespace-nowrap"
        >
          Browse {categoryLabel}
        </Link>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
