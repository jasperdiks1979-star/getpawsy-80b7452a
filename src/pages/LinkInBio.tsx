/**
 * LinkInBio (/go) — TikTok cold-traffic single-product funnel.
 *
 * Mini sales page (NOT a nav hub) for the self-cleaning litter box.
 * Visual hierarchy: HOOK → PRODUCT → CTA → BENEFITS → TRUST.
 * One action only. Mobile-first. Sticky CTA. Preserves UTM attribution.
 *
 * SEO: noindex (paid/social traffic only).
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TikTokDeepLinkButton } from '@/components/marketing/TikTokDeepLinkButton';

const PRODUCT_IMAGE =
  'https://getpawsy.pet/images/products/128e0207-8a94-4d71-b428-5b7f5002528f.png';

export default function LinkInBio() {
  const [showSticky, setShowSticky] = useState(false);

  useEffect(() => {
    document.title = 'GetPawsy — Shop the viral self-cleaning litter box';
    let robots = document.querySelector('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement('meta');
      robots.setAttribute('name', 'robots');
      document.head.appendChild(robots);
    }
    robots.setAttribute('content', 'noindex,nofollow');
  }, []);

  // Show sticky CTA after the user scrolls past the hero CTA
  useEffect(() => {
    const onScroll = () => setShowSticky(window.scrollY > 420);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5 px-5 pt-6 pb-28">
      <div className="mx-auto max-w-md flex flex-col items-center text-center gap-4">
        {/* Brand mark — minimal, no nav */}
        <Link to="/" className="inline-flex items-center gap-2" aria-label="GetPawsy home">
          <span className="text-lg font-display font-extrabold tracking-tight text-foreground">
            Get<span className="text-[hsl(25,95%,53%)]">Pawsy</span>
          </span>
        </Link>

        {/* HOOK — matches TikTok video */}
        <h1 className="text-3xl sm:text-4xl font-display font-extrabold leading-[1.1] text-foreground tracking-tight">
          I haven&apos;t scooped in 3 months…
          <br />
          <span className="text-[hsl(25,95%,53%)]">Here&apos;s why 👇</span>
        </h1>

        {/* PRODUCT VISUAL — single, large, centered */}
        <div className="w-full mt-1">
          <img
            src={PRODUCT_IMAGE}
            alt="GetPawsy automatic self-cleaning cat litter box"
            width={640}
            height={640}
            fetchPriority="high"
            decoding="async"
            className="w-full max-w-[360px] mx-auto aspect-square object-contain rounded-2xl bg-card shadow-md"
          />
        </div>

        {/* PRIMARY CTA — above the fold */}
        <div className="w-full pt-1">
          <TikTokDeepLinkButton
            label="Get Yours Now →"
            campaign="tt_bio_link"
            content="bio_primary"
            className="h-14 text-lg w-full"
          />
        </div>

        {/* BENEFIT BULLETS — short, scannable */}
        <ul className="w-full text-left grid gap-1.5 text-[15px] font-medium text-foreground pt-2">
          <li className="flex items-center gap-2"><span className="text-[hsl(25,95%,53%)] font-bold">✔</span> Cleans itself automatically</li>
          <li className="flex items-center gap-2"><span className="text-[hsl(25,95%,53%)] font-bold">✔</span> No smell, ever</li>
          <li className="flex items-center gap-2"><span className="text-[hsl(25,95%,53%)] font-bold">✔</span> Works with most cat litter</li>
          <li className="flex items-center gap-2"><span className="text-[hsl(25,95%,53%)] font-bold">✔</span> App-controlled</li>
        </ul>

        {/* TRUST STRIP — minimal */}
        <ul className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground pt-3 border-t border-border/40 w-full mt-2 pt-3">
          <li>✓ Free US Shipping $35+</li>
          <li>✓ 30-Day Returns</li>
          <li>✓ Secure Checkout</li>
        </ul>

        {/* Micro-CTA */}
        <div className="pt-3">
          <TikTokDeepLinkButton
            label="See how it works →"
            campaign="tt_bio_link"
            content="bio_micro"
            className="!bg-transparent hover:!bg-transparent !text-muted-foreground !shadow-none !h-auto !px-0 !text-sm !font-medium underline underline-offset-4"
          />
        </div>

        <p className="pt-4 text-[11px] text-muted-foreground">
          © {new Date().getFullYear()} GetPawsy
        </p>
      </div>

      {/* STICKY CTA — appears on scroll */}
      <div
        className={`fixed bottom-0 inset-x-0 z-50 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-background/95 backdrop-blur border-t border-border/60 transition-transform duration-300 ${
          showSticky ? 'translate-y-0' : 'translate-y-full'
        }`}
        aria-hidden={!showSticky}
      >
        <div className="mx-auto max-w-md">
          <TikTokDeepLinkButton
            label="Get Yours Now →"
            campaign="tt_bio_link"
            content="bio_sticky"
            className="h-13 text-base w-full"
          />
        </div>
      </div>
    </main>
  );
}
