import { useEffect, useState } from 'react';
import Truck from 'lucide-react/dist/esm/icons/truck';
import RotateCcw from 'lucide-react/dist/esm/icons/rotate-ccw';
import ShieldCheck from 'lucide-react/dist/esm/icons/shield-check';
import MapPin from 'lucide-react/dist/esm/icons/map-pin';
import { isGdprRegion } from '@/lib/geoConsent';

/**
 * US-only trust strip — shown to non-EU visitors on the homepage.
 * Reinforces US shipping origin + trust for Pinterest US traffic.
 */
export function UsOnlyTrustStrip() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Defer to client to avoid SSR/hydration mismatch
    setShow(!isGdprRegion());
  }, []);

  if (!show) return null;

  const items = [
    { icon: Truck, text: 'Free US Shipping over $35' },
    { icon: RotateCcw, text: '30-Day Returns' },
    { icon: ShieldCheck, text: 'Secure Checkout' },
    { icon: MapPin, text: 'Ships from New York, NY' },
  ];

  return (
    <section
      className="py-3 md:py-4 bg-primary/5 border-y border-primary/10"
      aria-label="US shipping and trust information"
    >
      <div className="container px-4 md:px-6">
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs md:text-sm text-foreground/80">
          {items.map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-1.5">
              <Icon className="w-3.5 h-3.5 md:w-4 md:h-4 text-primary flex-shrink-0" />
              <span className="font-medium">{text}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default UsOnlyTrustStrip;