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
import { Link, useSearchParams } from 'react-router-dom';
import { ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { trackEvent } from '@/lib/analytics';

const PRODUCT_SLUG = 'automatic-cat-litter-box-self-cleaning-app-control';

interface TikTokDeepLinkButtonProps {
  /** Visible button text. */
  label?: string;
  /** Fallback utm_campaign — only used when the current URL has no utm_campaign. */
  campaign?: string;
  /** Fallback utm_content — only used when the current URL has no utm_content. */
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
  // Read UTMs from the current landing-page URL so ad-level attribution
  // (utm_campaign / utm_content set by the TikTok ad) is preserved through
  // the CTA click. Hardcoded `campaign`/`content` props act ONLY as
  // fallbacks for organic visits with no UTMs in the URL.
  const [searchParams] = useSearchParams();

  const utmSource = searchParams.get('utm_source') || 'tiktok';
  const utmMedium = searchParams.get('utm_medium') || 'social';
  const utmCampaign = searchParams.get('utm_campaign') || campaign;
  const utmContent = searchParams.get('utm_content') || content || null;
  const utmTerm = searchParams.get('utm_term');
  const adParam = searchParams.get('ad') || 'tt';

  const params = new URLSearchParams({
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: utmCampaign,
    ad: adParam,
  });
  if (utmContent) params.set('utm_content', utmContent);
  if (utmTerm) params.set('utm_term', utmTerm);

  const href = `/products/${PRODUCT_SLUG}?${params.toString()}`;

  // Capture every TikTok deep-link click with the EXACT URL the user follows.
  // Lets GA4 segment hero vs bio vs ad placements without trusting only UTMs
  // (GA4 strips/normalizes some params, so we send `link_url` raw).
  const handleClick = () => {
    trackEvent('tiktok_deep_link_click', {
      link_url: href,
      product_slug: PRODUCT_SLUG,
      utm_source: utmSource,
      utm_medium: utmMedium,
      utm_campaign: utmCampaign,
      utm_content: utmContent,
      utm_term: utmTerm,
      ad: adParam,
      label,
      // Placement reflects WHERE the CTA lives (hardcoded prop), independent
      // of the ad-level utm_campaign that came from the URL.
      placement: content || campaign,
    });
  };

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
      <Link to={href} onClick={handleClick} aria-label={`${label} — opens self-cleaning litter box product page`}>
        <ShoppingCart className="w-5 h-5" aria-hidden="true" />
        {label}
      </Link>
    </Button>
  );
}

export default TikTokDeepLinkButton;
