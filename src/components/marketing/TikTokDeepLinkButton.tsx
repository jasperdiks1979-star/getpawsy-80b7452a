/**
 * TikTokDeepLinkButton — drop-in CTA that routes to the self-cleaning litter
 * box PDP with the TikTok campaign attribution parameters pre-set. The PDP's
 * useTikTokLanding() hook detects ?utm_source=tiktok and activates the
 * TikTok-optimized hero + funnel variant.
 *
 * Usage:
 *   <TikTokDeepLinkButton />
 *   <TikTokDeepLinkButton label="Shop the viral litter box" campaign="tt_litterbox_v3" />
 */
import { Link } from 'react-router-dom';
import { ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const PRODUCT_SLUG = 'automatic-cat-litter-box-self-cleaning-app-control';

interface TikTokDeepLinkButtonProps {
  /** Visible button text. */
  label?: string;
  /** utm_campaign value — set per video/creative for granular reporting. */
  campaign?: string;
  /** utm_content value — e.g. ad variant id (v3, v4, v5). */
  content?: string;
  /** Extra Tailwind classes for layout. */
  className?: string;
  /** Render full width on mobile. Defaults to true. */
  fullWidth?: boolean;
}

export function TikTokDeepLinkButton({
  label = 'Get Yours Today',
  campaign = 'tt_litterbox',
  content,
  className,
  fullWidth = true,
}: TikTokDeepLinkButtonProps) {
  const params = new URLSearchParams({
    utm_source: 'tiktok',
    utm_medium: 'social',
    utm_campaign: campaign,
    ad: 'tt',
  });
  if (content) params.set('utm_content', content);

  const href = `/products/${PRODUCT_SLUG}?${params.toString()}`;

  return (
    <Button
      asChild
      className={cn(
        'h-12 gap-2 px-6 text-base font-bold rounded-xl shadow-md',
        'bg-[hsl(25,95%,53%)] hover:bg-[hsl(25,95%,46%)] text-white',
        fullWidth ? 'w-full md:w-auto' : '',
        className,
      )}
    >
      <Link to={href} aria-label={`${label} — opens self-cleaning litter box product page`}>
        <ShoppingCart className="w-5 h-5" aria-hidden="true" />
        {label}
      </Link>
    </Button>
  );
}

export default TikTokDeepLinkButton;
