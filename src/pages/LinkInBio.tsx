/**
 * LinkInBio (/go) — TikTok @getpawsy bio landing page.
 *
 * One-screen, mobile-first hub that funnels TikTok visitors to the
 * self-cleaning litter box PDP (primary CTA) plus a few secondary links.
 * Every product link uses TikTokDeepLinkButton so utm_source=tiktok flips
 * the PDP into its high-converting variant automatically.
 *
 * SEO: noindex (paid/social traffic only — no SEO value, avoids thin-content flag).
 */
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, Sparkles, Cat } from 'lucide-react';
import { TikTokDeepLinkButton } from '@/components/marketing/TikTokDeepLinkButton';

const SECONDARY_LINKS = [
  { to: '/collections/cat-trees', label: 'Shop Cat Trees', icon: Cat },
  { to: '/bestsellers', label: 'See Bestsellers', icon: Sparkles },
  { to: '/collections/all', label: 'Browse All Products', icon: ShoppingBag },
];

export default function LinkInBio() {
  useEffect(() => {
    // Override default page title for share previews
    document.title = 'GetPawsy — Shop the viral self-cleaning litter box';
    // Force noindex even if a global policy adds index
    let robots = document.querySelector('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement('meta');
      robots.setAttribute('name', 'robots');
      document.head.appendChild(robots);
    }
    robots.setAttribute('content', 'noindex,nofollow');
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5 px-5 py-10">
      <div className="mx-auto max-w-md flex flex-col items-center text-center gap-5">
        {/* Brand mark */}
        <Link to="/" className="inline-flex items-center gap-2" aria-label="GetPawsy home">
          <span className="text-2xl font-display font-extrabold tracking-tight text-foreground">
            Get<span className="text-[hsl(25,95%,53%)]">Pawsy</span>
          </span>
        </Link>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          @getpawsy on TikTok
        </p>

        {/* H1 — single per page */}
        <h1 className="text-3xl font-display font-extrabold leading-tight text-foreground">
          Shop the viral self-cleaning litter box
        </h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          Stop scooping. Keep your home fresh 24/7. Free US shipping on orders $35+ with 30-day returns.
        </p>

        {/* Primary CTA — full-width, big, branded */}
        <div className="w-full pt-2">
          <TikTokDeepLinkButton
            label="Shop the Litter Box →"
            campaign="tt_bio_link"
            content="bio_primary"
            className="h-14 text-lg w-full"
          />
        </div>

        {/* Trust line — verifiable signals only */}
        <ul className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <li>✓ Free US Shipping $35+</li>
          <li>✓ 30-Day Returns</li>
          <li>✓ Secure Checkout</li>
        </ul>

        {/* Secondary links */}
        <div className="w-full flex flex-col gap-2 pt-4">
          {SECONDARY_LINKS.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={`${to}?utm_source=tiktok&utm_medium=social&utm_campaign=tt_bio_link&ad=tt`}
              className="flex items-center justify-center gap-2 h-12 rounded-xl border border-border/60 bg-card hover:bg-muted/50 transition-colors text-sm font-semibold text-foreground"
            >
              <Icon className="w-4 h-4 text-[hsl(25,95%,53%)]" aria-hidden="true" />
              {label}
            </Link>
          ))}
        </div>

        <p className="pt-6 text-[11px] text-muted-foreground">
          © {new Date().getFullYear()} GetPawsy · Premium pet essentials, shipped from the US.
        </p>
      </div>
    </main>
  );
}
