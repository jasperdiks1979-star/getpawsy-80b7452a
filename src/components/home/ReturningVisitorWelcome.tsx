import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, PackageCheck } from 'lucide-react';
import { getConversionFlag } from '@/lib/conversionFlags';

/**
 * CI-13 — quiet "welcome back" strip shown above the homepage hero for
 * visitors with a recent successful purchase (≤30 days). Dismissible per
 * device. Pure presentation; no tracking changes. Hidden when the
 * premiumPostPurchase flag is off or no recent purchase is stored.
 */
const RECENT_PURCHASE_KEY = 'gp_recent_purchase_ts';
const DISMISS_KEY = 'gp_recent_purchase_welcome_dismissed';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function ReturningVisitorWelcome() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!getConversionFlag('premiumPostPurchase')) return;
    try {
      const ts = Number(window.localStorage.getItem(RECENT_PURCHASE_KEY) || 0);
      const dismissed = window.localStorage.getItem(DISMISS_KEY) === String(ts);
      if (!ts || dismissed) return;
      if (Date.now() - ts > MAX_AGE_MS) return;
      setVisible(true);
    } catch {
      /* storage blocked — silently skip */
    }
  }, []);

  if (!visible) return null;

  const handleDismiss = () => {
    try {
      const ts = window.localStorage.getItem(RECENT_PURCHASE_KEY) || '';
      window.localStorage.setItem(DISMISS_KEY, ts);
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

  return (
    <div className="border-b border-border/50 bg-muted/30">
      <div className="container px-4 md:px-6 py-2.5 flex items-center gap-3 text-xs md:text-sm">
        <PackageCheck className="w-4 h-4 text-[hsl(var(--success))] shrink-0" strokeWidth={1.75} />
        <span className="text-foreground truncate">
          Welcome back — your recent order is on its way.{' '}
          <Link to="/orders" className="underline underline-offset-2 hover:text-primary">
            Track it
          </Link>
        </span>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss welcome strip"
          className="ml-auto p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-3.5 h-3.5" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}

export default ReturningVisitorWelcome;