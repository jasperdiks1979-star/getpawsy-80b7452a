import { useState, useEffect, memo } from 'react';
import { Helmet } from 'react-helmet-async';
import { PRODUCTION_DOMAINS } from '@/lib/constants';
import { Link } from 'react-router-dom';
import { CreditCard, Lock, Loader2, ShieldCheck, FileText, Home, ShoppingCart, Tag, CheckCircle, X, Truck, RotateCcw, Package } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { trackBeginCheckout } from '@/lib/analytics';
import { trackCheckoutFunnel } from '@/lib/checkoutFunnel';
import { fireCheckoutClick, fireCheckoutRedirect, fireCheckoutError, fireCheckoutEvent } from '@/lib/funnelEvents';
import { trackCci } from '@/lib/cci';
import { ttTrackInitiateCheckout } from '@/lib/tiktok-pixel';
import { supabase } from '@/integrations/supabase/client';
import { mirrorLpFunnelEvent } from '@/lib/lpFunnelMirror';
import { getPersistedUtm } from '@/lib/utmNormalizer';
import { CartUpsell } from '@/components/cart/CartUpsell';
import { CheckoutTrustBlock } from '@/components/checkout/CheckoutTrustBlock';
import { CheckoutSocialProof } from '@/components/checkout/CheckoutSocialProof';
import { fireMarketingAsync } from '@/lib/marketingClient';
import { useBundleABTest } from '@/hooks/useBundleABTest';
import { useKlarnaEligibility } from '@/hooks/useKlarnaEligibility';
import { splitKlarnaInstallments, formatKlarnaInstallment } from '@/lib/klarna';
import { useScrollDirection } from '@/hooks/useScrollDirection';
import { getConversionFlag } from '@/lib/conversionFlags';
import { ShippingPrecheck } from '@/components/checkout/ShippingPrecheck';
import type { CartShippingCheck, CountryCode } from '@/lib/cj-shipping-matrix';
import { SUPPORTED_COUNTRIES } from '@/lib/cj-shipping-matrix';
import { ensureGeoClassified, getCachedGeoCountry } from '@/lib/geoClassify';
import {
  FREE_SHIPPING_THRESHOLD,
  FLAT_SHIPPING_RATE,
  DELIVERY_TIME_STANDARD,
  RETURNS_POLICY_SHORT,
  getApplicableTier,
} from '@/lib/shipping-constants';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

// Checkout page skeleton component
const CheckoutSkeleton = memo(() => (
  <div className="container px-4 md:px-6 py-8 max-w-4xl">
    {/* Back link */}
    <Skeleton className="h-5 w-28 mb-6" />
    
    {/* Title */}
    <Skeleton className="h-9 w-32 mb-8" />

    <div className="grid lg:grid-cols-5 gap-8">
      {/* Left side - Forms */}
      <div className="lg:col-span-3 space-y-6">
        {/* Contact Information Card */}
        <div className="bg-card rounded-xl shadow-card p-6">
          <Skeleton className="h-7 w-48 mb-4" />
          <div className="space-y-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-3 w-64" />
          </div>
        </div>

        {/* Payment & Shipping Card */}
        <div className="bg-card rounded-xl shadow-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-7 w-44" />
          </div>
          <div className="bg-muted/30 rounded-lg p-4 space-y-4">
            <div className="flex items-start gap-3">
              <Skeleton className="w-5 h-5 rounded shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-full" />
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Skeleton className="w-5 h-5 rounded shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t">
            <Skeleton className="h-4 w-44 mb-2" />
            <div className="flex gap-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-8 w-20 rounded" />
              ))}
            </div>
          </div>
        </div>

        {/* Terms Card */}
        <div className="bg-card rounded-xl shadow-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-7 w-40" />
          </div>
          <div className="flex items-start gap-3">
            <Skeleton className="w-4 h-4 rounded shrink-0 mt-1" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Order Summary */}
      <div className="lg:col-span-2">
        <div className="bg-card rounded-xl shadow-card p-6">
          <Skeleton className="h-7 w-36 mb-4" />
          
          {/* Items */}
          <div className="space-y-3 mb-4">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="w-16 h-16 rounded-lg shrink-0" />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-4 w-14" />
              </div>
            ))}
          </div>

          <Separator className="my-4" />

          <div className="space-y-2">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-14" />
            </div>
            <div className="flex justify-between">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-10" />
            </div>
          </div>

          <Separator className="my-4" />

          <div className="flex justify-between">
            <Skeleton className="h-6 w-12" />
            <Skeleton className="h-6 w-16" />
          </div>

          <Skeleton className="h-12 w-full mt-6 rounded-md" />
          
          <Skeleton className="h-3 w-40 mx-auto mt-4" />
          
          {/* Upsell section */}
          <div className="mt-6 pt-6 border-t space-y-3">
            <Skeleton className="h-4 w-32" />
            {[...Array(2)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
                <Skeleton className="w-12 h-12 rounded-md shrink-0" />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <Skeleton className="h-8 w-8 rounded-md" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
));
CheckoutSkeleton.displayName = 'CheckoutSkeleton';

const Checkout = () => {
  const { items, totalPrice, setAbandonedCartEmail } = useCart();
  const { user } = useAuth();
  const abTest = useBundleABTest();
  const [isProcessing, setIsProcessing] = useState(false);
  const [email, setEmail] = useState('');
  // Pre-accepted by default — never block checkout because users missed a checkbox.
  // Users can still uncheck. Terms remain visible & linkable for compliance.
  const [acceptedTerms, setAcceptedTerms] = useState(true);
  const [discountCode, setDiscountCode] = useState('');
  const [discountApplied, setDiscountApplied] = useState<string | null>(null);
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [discountOpen, setDiscountOpen] = useState(false);

  // CJ shipping pre-check — blocks Pay when any cart item can't ship to the
  // selected destination country. Default US to keep US-first conversion.
  const [shippingCountry, setShippingCountry] = useState<CountryCode>('US');
  const [shippingCheck, setShippingCheck] = useState<CartShippingCheck | null>(null);
  const [shippingChecking, setShippingChecking] = useState(true);
  const shippingBlocked = !shippingChecking && shippingCheck !== null && !shippingCheck.ok;

  // Visitor-country auto-detect. Best-effort; never throws / blocks render.
  const [visitorCountry, setVisitorCountry] = useState<CountryCode | null>(null);
  useEffect(() => {
    ensureGeoClassified();
    try { trackCci('checkout_loaded', { funnel_stage: 'begin_checkout' }); } catch {}
    // Mark checkout as in-progress; cleared when we hand off to Stripe or
    // when /payment-success mounts. If the page unloads or the visitor
    // navigates away while still set, fire `checkout_abandoned`.
    let abandoned = false;
    try { sessionStorage.setItem('gp_cci_checkout_active', '1'); } catch {}
    const fireAbandon = () => {
      if (abandoned) return;
      try {
        if (sessionStorage.getItem('gp_cci_checkout_active') !== '1') return;
        abandoned = true;
        sessionStorage.removeItem('gp_cci_checkout_active');
        trackCci('checkout_abandoned', { funnel_stage: 'checkout_abandoned' });
      } catch { /* swallow */ }
    };
    const onHide = () => { if (document.visibilityState === 'hidden') fireAbandon(); };
    window.addEventListener('pagehide', fireAbandon);
    document.addEventListener('visibilitychange', onHide);
    const tryRead = () => {
      const raw = (getCachedGeoCountry() || '').toUpperCase();
      if (raw && SUPPORTED_COUNTRIES.some((c) => c.code === raw)) {
        setVisitorCountry(raw as CountryCode);
        return true;
      }
      return false;
    };
    if (tryRead()) return;
    const iv = window.setInterval(() => {
      if (tryRead()) window.clearInterval(iv);
    }, 400);
    const to = window.setTimeout(() => window.clearInterval(iv), 5000);
    return () => {
      window.clearInterval(iv);
      window.clearTimeout(to);
      window.removeEventListener('pagehide', fireAbandon);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, []);

  // Track `shipping_country_blocked` once whenever the blocked state flips on
  // for a given destination, so we get a clean funnel signal per attempt.
  const blockedTrackedRef = (globalThis as any).__gp_blocked_ref ||= { country: null as string | null };
  useEffect(() => {
    if (!shippingBlocked) {
      blockedTrackedRef.country = null;
      return;
    }
    if (blockedTrackedRef.country === shippingCountry) return;
    blockedTrackedRef.country = shippingCountry;
    const blockedItems = (shippingCheck?.blocked || []).map((b) => b.productId);
    trackCheckoutFunnel({
      step: 'shipping_country_blocked',
      placement: 'checkout',
      metadata: {
        destination_country: shippingCountry,
        blocked_count: blockedItems.length,
        blocked_product_ids: blockedItems.slice(0, 10),
      },
    });
  }, [shippingBlocked, shippingCountry, shippingCheck]);

  // CI-11: hide-on-scroll-down for mobile sticky checkout bar.
  const scrollDir = useScrollDirection(8);
  const premiumCheckoutV2 = getConversionFlag('premiumCheckoutV2');
  const premiumV4 = getConversionFlag('premiumCartCheckoutV4');
  const premiumV5 = getConversionFlag('premiumCartCheckoutV5');
  const hideMobileBar =
    premiumCheckoutV2 &&
    scrollDir === 'down' &&
    typeof window !== 'undefined' &&
    window.scrollY > 200;

  // Valid discount codes
  const VALID_DISCOUNT_CODES: Record<string, { discount: number; label: string }> = {
    'WELCOME10': { discount: 10, label: 'Welcome 10% Off' },
    'DONTGO15': { discount: 15, label: "Don't Go 15% Off" },
  };

  const shipping = totalPrice >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING_RATE;
  
  // Tiered incentive discount (automatic, stacks with coupon)
  const currentTier = getApplicableTier(totalPrice);
  const tierDiscountPercent = currentTier?.discountPercent ?? 0;
  const tierDiscountAmount = totalPrice * (tierDiscountPercent / 100);
  
  // Coupon discount (applied after tier discount)
  const couponDiscountPercent = discountApplied ? VALID_DISCOUNT_CODES[discountApplied]?.discount || 0 : 0;
  const couponDiscountAmount = (totalPrice * couponDiscountPercent) / 100;
  
  // Total discount = tier + coupon (no stacking conflict: tier is automatic reward, coupon is promotional)
  const totalDiscountAmount = tierDiscountAmount + couponDiscountAmount;
  const total = totalPrice - totalDiscountAmount + shipping;

  // Klarna eligibility — only show messaging when Stripe actually offers it.
  // IMPORTANT: Stripe only charges Σ(line_items) − coupon% — shipping
  // and the (frontend-only) tier discount are NOT sent to Stripe (see
  // supabase/functions/create-checkout/index.ts). The Klarna installment
  // shown to the user MUST be derived from that exact Stripe-charged
  // amount, otherwise "4 × $X.XX" would not equal what Klarna debits.
  const stripeChargedTotal = Math.max(0, totalPrice - couponDiscountAmount);
  const klarna = useKlarnaEligibility(stripeChargedTotal, { country: 'US', currency: 'usd' });
  const klarnaSplit = splitKlarnaInstallments(stripeChargedTotal, 'USD');

  // Track Klarna BNPL messaging impression on checkout (once per session/total tier).
  useEffect(() => {
    if (!klarna.eligible || total <= 0) return;
    trackCheckoutFunnel({
      step: 'klarna_message_shown',
      placement: 'checkout',
      value: Number(stripeChargedTotal.toFixed(2)),
      currency: 'USD',
      metadata: {
        installment_amount: klarnaSplit.perInstallment,
        item_count: items.reduce((s, i) => s + i.quantity, 0),
      },
    });
    // Only refire when eligibility flips or total changes meaningfully.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [klarna.eligible, Math.round(stripeChargedTotal)]);

  // Check for discount code in localStorage (from popups)
  useEffect(() => {
    const savedCode = localStorage.getItem('getpawsy_discount_code');
    if (savedCode && VALID_DISCOUNT_CODES[savedCode]) {
      setDiscountCode(savedCode);
      setDiscountApplied(savedCode);
      setDiscountOpen(true);
      localStorage.removeItem('getpawsy_discount_code'); // Use only once
    }
  }, []);

  const handleApplyDiscount = () => {
    const normalizedCode = discountCode.toUpperCase().trim();
    if (VALID_DISCOUNT_CODES[normalizedCode]) {
      setDiscountApplied(normalizedCode);
      setDiscountError(null);
    } else {
      setDiscountError('Invalid discount code');
      setDiscountApplied(null);
    }
  };

  const handleRemoveDiscount = () => {
    setDiscountApplied(null);
    setDiscountCode('');
    setDiscountError(null);
  };

  // Set email from authenticated user
  useEffect(() => {
    if (user?.email) {
      setEmail(user.email);
      setAbandonedCartEmail(user.email);
      return;
    }
    // Guest autofill: prior session email persisted from earlier checkouts
    try {
      const saved =
        localStorage.getItem('gp_guest_email') ||
        localStorage.getItem('getpawsy_last_email');
      if (saved && /@/.test(saved)) {
        setEmail(saved);
        setAbandonedCartEmail(saved);
      }
    } catch {
      /* ignore storage errors */
    }
  }, [user, setAbandonedCartEmail]);
  
  // Update abandoned cart email when user enters email
  const handleEmailChange = (newEmail: string) => {
    setEmail(newEmail);
    if (newEmail && newEmail.includes('@')) {
      setAbandonedCartEmail(newEmail);
      try { localStorage.setItem('gp_guest_email', newEmail); } catch { /* ignore */ }
    }
  };

  // Automation/e2e sync: ensure DOM-level fill() and programmatic checks
  // are mirrored into React state, even when frameworks bypass React's
  // synthetic event system. Pure listener — does not alter UI.
  useEffect(() => {
    const emailEl =
      (document.getElementById('email') as HTMLInputElement | null) ??
      (document.querySelector('input[type="email"]') as HTMLInputElement | null);

    const onEmailInput = (e: Event) => {
      const v = (e.target as HTMLInputElement)?.value ?? '';
      setEmail((prev) => {
        if (prev === v) return prev;
        if (v && v.includes('@')) setAbandonedCartEmail(v);
        return v;
      });
    };
    emailEl?.addEventListener('input', onEmailInput);
    emailEl?.addEventListener('change', onEmailInput);

    // Radix Checkbox: sync from data-state / aria-checked attribute changes.
    const termsEl = document.getElementById('terms');
    let observer: MutationObserver | null = null;
    const syncTerms = () => {
      if (!termsEl) return;
      const checked =
        termsEl.getAttribute('data-state') === 'checked' ||
        termsEl.getAttribute('aria-checked') === 'true';
      setAcceptedTerms((prev) => (prev === checked ? prev : checked));
    };
    if (termsEl) {
      observer = new MutationObserver(syncTerms);
      observer.observe(termsEl, {
        attributes: true,
        attributeFilter: ['data-state', 'aria-checked'],
      });
      termsEl.addEventListener('click', syncTerms);
      syncTerms();
    }

    return () => {
      emailEl?.removeEventListener('input', onEmailInput);
      emailEl?.removeEventListener('change', onEmailInput);
      observer?.disconnect();
      termsEl?.removeEventListener('click', syncTerms);
    };
  }, [setAbandonedCartEmail]);

  // Import shared production domains constant

  // Track checkout activity for visitor map
  const trackCheckoutActivity = async () => {
    // Only track on production domains
    if (!PRODUCTION_DOMAINS.includes(window.location.hostname)) {
      return;
    }

    try {
      let sessionId = sessionStorage.getItem("visitor_session_id");
      if (!sessionId) {
        sessionId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
        sessionStorage.setItem("visitor_session_id", sessionId);
      }
      
      let location = sessionStorage.getItem("visitor_location");
      if (!location) {
        try {
          const response = await fetch("https://ipapi.co/json/");
          if (response.ok) {
            const data = await response.json();
            location = JSON.stringify({
              latitude: data.latitude,
              longitude: data.longitude,
              country: data.country_name,
              city: data.city,
            });
            sessionStorage.setItem("visitor_location", location);
          }
        } catch {
          // Ignore location errors
        }
      }
      
      const loc = location ? JSON.parse(location) : {};
      
      await supabase.from("visitor_activity").insert({
        session_id: sessionId,
        activity_type: "checkout",
        latitude: loc.latitude || null,
        longitude: loc.longitude || null,
        country: loc.country || null,
        city: loc.city || null,
      });
    } catch {
      // Silently fail
    }
  };

  // Track begin checkout when page loads with items
  useEffect(() => {
    if (items.length > 0) {
      trackBeginCheckout(
        items.map(item => ({
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
        })),
        totalPrice
      );
      trackCheckoutActivity();

      // TikTok Pixel InitiateCheckout — completes the funnel events for retargeting
      ttTrackInitiateCheckout({
        value: totalPrice,
        currency: 'USD',
        contents: items.map(item => ({
          content_id: item.id,
          quantity: item.quantity,
          price: item.price,
        })),
      });

      // Mirror begin_checkout into lp_funnel_events so the admin
      // FunnelBySource dashboard can compute per-source conversion.
      // Uses persisted UTMs from sessionStorage via lpFunnelMirror's
      // standard param picker (caller passes UTMs explicitly).
      try {
        const utm = (() => {
          try {
            const p = getPersistedUtm();
            return {
              utm_source: p.utm_source ?? undefined,
              utm_medium: p.utm_medium ?? undefined,
              utm_campaign: p.utm_campaign ?? undefined,
              utm_content: p.utm_content ?? undefined,
            };
          } catch {
            return {};
          }
        })();
        mirrorLpFunnelEvent('begin_checkout', {
          value: totalPrice,
          items: items.map(item => ({ item_id: item.id, item_name: item.name })),
          ...utm,
        });
      } catch {
        // Non-fatal: mirror is best-effort.
      }
      
      // A/B Test: Track checkout started with variant
      abTest.trackCheckoutStarted(totalPrice);

      // Funnel: begin_checkout step (server + GA4 + TikTok mirror)
      trackCheckoutFunnel({
        step: 'begin_checkout',
        value: totalPrice,
        currency: 'USD',
        metadata: { item_count: items.reduce((s, i) => s + i.quantity, 0) },
      });

      // Pinterest DB funnel mirror — no-op if session not Pinterest
      import('@/lib/pinterestTracker')
        .then((m) => m.trackPinterestEvent('begin_checkout', { value: totalPrice, currency: 'USD' }))
        .catch(() => {});

      // Pinterest CAPI server-side mirror — no-op if no Pinterest session cookie.
      import('@/lib/pinterest-conversion-intel')
        .then((m) => m.enqueueCapiEvent('checkout', {
          value: totalPrice,
          currency: 'USD',
          custom_data: {
            item_count: items.reduce((s, i) => s + i.quantity, 0),
          },
        }))
        .catch(() => {});
      
      // Pinterest Checkout tracking — deferred, non-blocking
      // Fires as a Pinterest `custom` event (event_name: initiate_checkout)
      // so it does NOT collide with the standard `checkout` (= Purchase)
      // fired from PaymentSuccess.
      fireMarketingAsync('pinterest-initiatecheckout', async () => {
        const { trackPinterestEvent } = await import('@/hooks/usePinterestTracking');
        trackPinterestEvent('custom', {
          event_name: 'initiate_checkout',
          event_id: `initiate_checkout_${Date.now()}`,
          value: totalPrice,
          currency: 'USD',
          order_quantity: items.reduce((sum, item) => sum + item.quantity, 0),
          line_items: items.map(item => ({
            product_name: item.name,
            product_id: item.id,
            product_price: item.price,
            product_quantity: item.quantity,
          })),
        });
      }, 'pinterest');
    }
  }, []);

  const handleStripeCheckout = async () => {
    // === CHECKOUT CTA DEBUG SNAPSHOT ===========================================
    // Single-source view of *why* a click is (or isn't) reaching the funnel.
    // Inspect this in DevTools / e2e logs before chasing missing checkout_click
    // rows in `checkout_funnel_events`.
    const ctaDebug = {
      isProcessing,
      acceptedTerms,
      stateEmail: (email ?? '').trim(),
      itemsCount: items.length,
      cartValue: Number(stripeChargedTotal.toFixed(2)),
      buttonWouldBeDisabled: isProcessing || !acceptedTerms,
      disabledReason:
        isProcessing
          ? 'isProcessing'
          : !acceptedTerms
            ? 'terms_not_accepted'
            : null,
    };
    console.info('[checkout:cta] handler invoked', ctaDebug);
    // DOM fallback: automation/mobile-safari can fill inputs or toggle
    // Radix Checkbox without triggering React's controlled handlers,
    // leaving `email` / `acceptedTerms` state stale. Read live DOM values
    // as a safety net before validating, and back-sync React state so the
    // rest of the flow (and downstream funnel events) stays consistent.
    let domEmail = '';
    try {
      const el =
        (document.getElementById('email') as HTMLInputElement | null) ??
        (document.querySelector('input[type="email"]') as HTMLInputElement | null);
      domEmail = el?.value?.trim() ?? '';
    } catch {
      /* ignore */
    }

    let domTerms = false;
    try {
      const termsEl = document.getElementById('terms');
      domTerms =
        termsEl?.getAttribute('data-state') === 'checked' ||
        termsEl?.getAttribute('aria-checked') === 'true' ||
        (termsEl as HTMLInputElement | null)?.checked === true;
    } catch {
      /* ignore */
    }

    const stateEmail = (email ?? '').trim();
    const finalEmail = stateEmail || domEmail;
    const finalTerms = acceptedTerms || domTerms;

    console.info('[checkout]', {
      stateEmail,
      domEmail,
      finalEmail,
      stateTerms: acceptedTerms,
      domTerms,
      finalTerms,
    });

    // Back-sync React state when DOM was ahead (automation path).
    if (!stateEmail && domEmail) setEmail(domEmail);
    if (!acceptedTerms && domTerms) setAcceptedTerms(true);

    if (!finalEmail || !finalEmail.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }

    if (!finalTerms) {
      toast.error('Please accept the Terms of Service and Return Policy to continue');
      return;
    }

    setIsProcessing(true);

    // Hard gate — never invoke create-checkout when the destination is
    // unshippable. Show a structured message instead of the generic toast.
    if (shippingBlocked) {
      const destName =
        SUPPORTED_COUNTRIES.find((c) => c.code === shippingCountry)?.name || shippingCountry;
      const names = (shippingCheck?.blocked || []).slice(0, 2).map((b) => b.name).join(', ');
      toast.error(
        names
          ? `We can't ship to ${destName}: ${names}${
              (shippingCheck?.blocked.length || 0) > 2 ? '…' : ''
            }`
          : `This product is currently only available in the United States and Canada.`,
      );
      setIsProcessing(false);
      return;
    }

    // ✅ Real user click on the Stripe checkout button. Fired BEFORE any
    // async work so the funnel event is guaranteed to be recorded even if
    // the create-checkout invoke later fails.
    fireCheckoutClick({
      source_component: 'checkout_stripe_button',
      item_count: items.reduce((s, i) => s + i.quantity, 0),
      value: Number(stripeChargedTotal.toFixed(2)),
      currency: 'USD',
    });

    // Track that the user proceeded to Stripe Checkout while Klarna was an
    // available option — proxy for "Klarna placement shown at checkout step".
    if (klarna.eligible) {
      trackCheckoutFunnel({
        step: 'klarna_proceed',
        placement: 'checkout',
        value: Number(stripeChargedTotal.toFixed(2)),
        currency: 'USD',
        metadata: { installment_amount: klarnaSplit.perInstallment },
      });
    }

    // Always log the Stripe redirect step so we can compute drop-off
    // between InitiateCheckout and the actual Stripe-hosted page.
    trackCheckoutFunnel({
      step: 'stripe_redirect',
      placement: 'checkout',
      value: Number(stripeChargedTotal.toFixed(2)),
      currency: 'USD',
    });
    
    try {
      // Mark redirect attempt BEFORE the network call so we can measure
      // drop-off between click and Stripe response.
      fireCheckoutEvent({
        step: 'checkout_redirect_attempt',
        source_component: 'checkout_stripe_button',
        value: Number(stripeChargedTotal.toFixed(2)),
        currency: 'USD',
      });
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: {
          items: items.map(item => ({
            id: item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            image: item.image,
          })),
          customerEmail: finalEmail,
          discountCode: discountApplied || undefined,
          shippingCountry,
          // Conversion Reality: capture GA4 client/session + UTMs so the
          // Stripe webhook can fire a server-side `purchase` event via
          // Measurement Protocol even when /payment-success misses it.
          gaClientId: await (async () => {
            try {
              // Canonical GA4 web stream — see src/lib/deferred-analytics.ts.
              // Falling back to the hardcoded ID guarantees gtag('get','client_id')
              // resolves even when no env override is set, so the server-side
              // Measurement Protocol `purchase` event in stripe-webhook can be
              // attributed to the same GA4 session as the client page_view.
              const measurementId =
                (window as any).GA_MEASUREMENT_ID ||
                (import.meta as any).env?.VITE_GA4_MEASUREMENT_ID ||
                'G-5WYL8RJDZF';
              if (typeof window.gtag !== 'function' || !measurementId) return '';
              return await new Promise<string>((resolve) => {
                const t = setTimeout(() => resolve(''), 600);
                try {
                  (window.gtag as unknown as (
                    cmd: string, id: string, field: string, cb: (v: string) => void,
                  ) => void)('get', measurementId, 'client_id', (id: string) => {
                    clearTimeout(t);
                    resolve(typeof id === 'string' ? id : '');
                  });
                } catch { clearTimeout(t); resolve(''); }
              });
            } catch { return ''; }
          })(),
          gaSessionId: (() => {
            try {
              const m = document.cookie.match(/_ga_[A-Z0-9]+=GS\d+\.\d+\.(\d+)\./);
              return m ? m[1] : '';
            } catch { return ''; }
          })(),
          utm: (() => {
            try {
              const sp = new URLSearchParams(window.location.search);
              return {
                source: sp.get('utm_source') || '',
                medium: sp.get('utm_medium') || '',
                campaign: sp.get('utm_campaign') || '',
                content: sp.get('utm_content') || '',
                term: sp.get('utm_term') || '',
              };
            } catch { return {}; }
          })(),
        },
      });

      if (error) {
        // supabase-js wraps non-2xx responses as FunctionsHttpError. Try to
        // read the JSON body so we can surface our structured CJ shipping
        // message instead of "Edge Function returned a non-2xx status code".
        let parsed: { code?: string; error?: string; blocked?: Array<{ name: string }> } | null = null;
        try {
          const ctx = (error as unknown as { context?: Response }).context;
          if (ctx && typeof ctx.json === 'function') {
            parsed = await ctx.clone().json();
          }
        } catch {
          /* ignore */
        }
        if (parsed?.code === 'cj_shipping_unavailable' || parsed?.code === 'country_not_supported') {
          const destName =
            SUPPORTED_COUNTRIES.find((c) => c.code === shippingCountry)?.name || shippingCountry;
          const names = (parsed.blocked || []).slice(0, 2).map((b) => b.name).join(', ');
          const msg = names
            ? `We can't ship to ${destName}: ${names}${(parsed.blocked?.length || 0) > 2 ? '…' : ''}`
            : `This product is currently only available in the United States and Canada.`;
          trackCheckoutFunnel({
            step: 'shipping_country_blocked',
            placement: 'checkout',
            metadata: {
              destination_country: shippingCountry,
              source: 'server_reject',
              code: parsed.code,
            },
          });
          toast.error(msg);
          setIsProcessing(false);
          return;
        }
        throw new Error(error.message);
      }

      if (data?.url) {
        // Redirect to Stripe Checkout
        fireCheckoutRedirect({
          source_component: 'checkout_stripe_button',
          value: Number(stripeChargedTotal.toFixed(2)),
          currency: 'USD',
          destination_url: data.url,
        });
        try {
          trackCci('payment_redirect_started', {
            funnel_stage: 'payment_redirect',
            meta: {
              value: Number(stripeChargedTotal.toFixed(2)),
              currency: 'USD',
              provider: 'stripe',
            },
          });
        } catch { /* swallow */ }
        try { sessionStorage.removeItem('gp_cci_checkout_active'); } catch {}
        // Canonical funnel `payment` step — fires the instant we hand the
        // visitor off to Stripe. Without this, analytics_funnel_waterfall
        // shows 0 payments even though the prior audit confirmed real
        // Stripe sessions are being created. Non-blocking; never throws.
        try {
          const m = await import('@/lib/analyticsFunnel');
          m.recordFunnelStep('payment', {
            value: Number(stripeChargedTotal.toFixed(2)),
            currency: 'USD',
          });
        } catch { /* swallow */ }
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      const rawMsg = error instanceof Error ? error.message : 'Unknown error';
      // PII-safe sanitization: strip emails, bearer tokens, sk_/pk_ Stripe
      // keys, long hex/JWT-like blobs. Also cap length so the funnel row
      // never gets accidental PII or secrets.
      const safeMsg = rawMsg
        .replace(/[\w._%+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[email]')
        .replace(/\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]+/g, '[stripe_key]')
        .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [token]')
        .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[jwt]')
        .replace(/[a-f0-9]{32,}/gi, '[hash]')
        .slice(0, 200);
      fireCheckoutError({
        source_component: 'checkout_stripe_button',
        value: Number(stripeChargedTotal.toFixed(2)),
        currency: 'USD',
        error_reason: safeMsg,
      });
      toast.error("Checkout couldn't open. Please try again or contact support.");
      setIsProcessing(false);
    }
  };

  if (items.length === 0) {
    return (
      <Layout>
        <Helmet><meta name="robots" content="noindex, nofollow" /></Helmet>
        <div className="container px-4 md:px-6 py-20 text-center">
          {premiumV4 && (
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground mb-3">
              Empty cart
            </p>
          )}
          <h2 className={premiumV4 ? 'font-display text-2xl md:text-3xl font-semibold tracking-tight mb-3' : 'text-2xl font-bold mb-4'}>
            {premiumV4 ? 'Nothing here yet' : 'Your cart is empty'}
          </h2>
          {premiumV4 && (
            <p className="text-[15px] text-muted-foreground/90 mb-8 leading-relaxed max-w-sm mx-auto">
              Add a product to your cart before checking out.
            </p>
          )}
          <Link to="/products">
            <Button className={premiumV4 ? 'rounded-full px-6' : ''}>
              {premiumV4 ? 'Browse products' : 'Start Shopping'}
            </Button>
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Helmet><meta name="robots" content="noindex, nofollow" /></Helmet>
      <div className="container px-4 md:px-6 py-8 max-w-4xl w-full overflow-x-hidden box-border" style={{ maxWidth: '100%' }}>
        {/* Breadcrumbs */}
        <Breadcrumb className="mb-6">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/" className="flex items-center gap-1">
                  <Home className="h-3.5 w-3.5" />
                  <span className="sr-only sm:not-sr-only">Home</span>
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/cart" className="flex items-center gap-1">
                  <ShoppingCart className="h-3.5 w-3.5" />
                  Cart
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Checkout</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {premiumV4 ? (
          <div className="mb-8">
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground mb-2">
              Secure checkout
            </p>
            <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">
              Checkout
            </h1>
          </div>
        ) : (
          <h1 className="text-3xl font-bold mb-8">Checkout</h1>
        )}

        <div className="grid lg:grid-cols-5 gap-6 lg:gap-8">
          {/* Left side - Email & Info */}
          <div className="lg:col-span-3 space-y-6">
            {/* Contact */}
            <div className="bg-card rounded-xl shadow-card p-6">
              <h2 className="text-xl font-semibold mb-4">Contact Information</h2>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="email">Email Address</Label>
                  <Input 
                    id="email" 
                    type="email" 
                    required 
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => handleEmailChange(e.target.value)}
                    onInput={(e) => {
                      // Defensive: some automation/autofill paths dispatch
                      // `input` without React's synthetic change firing.
                      const v = (e.target as HTMLInputElement).value;
                      if (v !== email) handleEmailChange(v);
                    }}
                    onBlur={() => {
                      if (email && email.includes('@')) {
                        setAbandonedCartEmail(email);
                      }
                    }}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    You will receive your order confirmation here
                  </p>
                </div>
              </div>
            </div>

            {/* Payment info */}
            <div className="bg-card rounded-xl shadow-card p-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Payment & Shipping
              </h2>
              <div className="bg-muted/30 rounded-lg p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">Secure payment via Stripe</p>
                    <p className="text-sm text-muted-foreground">
                      You will be redirected to a secure payment page where you can 
                      enter your address and payment details.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Lock className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">SSL Encryption</p>
                    <p className="text-sm text-muted-foreground">
                      All your data is encrypted during transmission.
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Payment methods */}
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground mb-2">Express & card payments accepted:</p>
                <div className="flex flex-wrap gap-2">
                  <div className="bg-foreground text-background px-3 py-1.5 rounded text-xs font-semibold">Apple Pay</div>
                  <div className="bg-muted px-3 py-1.5 rounded text-xs font-semibold">Google Pay</div>
                  <div className="bg-muted px-3 py-1.5 rounded text-xs font-medium">Visa</div>
                  <div className="bg-muted px-3 py-1.5 rounded text-xs font-medium">Mastercard</div>
                  <div className="bg-muted px-3 py-1.5 rounded text-xs font-medium">Amex</div>
                  <div className="bg-muted px-3 py-1.5 rounded text-xs font-medium">Discover</div>
                  <div className="bg-muted px-3 py-1.5 rounded text-xs font-medium">Link</div>
                </div>
                {!premiumCheckoutV2 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Apple Pay & Google Pay appear automatically on supported devices for 1-tap checkout.
                  </p>
                )}
              </div>
            </div>

            {/* Terms and Conditions - Mobile stacked layout */}
            <div className="bg-card rounded-xl shadow-card p-4 sm:p-6 w-full">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 flex-shrink-0" />
                <span>Terms & Conditions</span>
              </h2>
              
              {/* Mobile: Stacked layout | Desktop: Inline */}
              <div className="space-y-3 w-full">
                {/* Checkbox + short agreement text */}
                <div className="flex items-start gap-3">
                  <Checkbox 
                    id="terms" 
                    checked={acceptedTerms}
                    onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
                    className="mt-0.5 flex-shrink-0"
                  />
                  <label 
                    htmlFor="terms" 
                    className="text-sm text-muted-foreground leading-relaxed cursor-pointer"
                  >
                    {/* Desktop: full inline text */}
                    <span className="hidden sm:inline">
                      I have read and agree to the{' '}
                      <Link to="/terms" target="_blank" className="text-primary hover:underline font-medium">
                        Terms of Service
                      </Link>
                      ,{' '}
                      <Link to="/privacy" target="_blank" className="text-primary hover:underline font-medium">
                        Privacy Policy
                      </Link>
                      , and{' '}
                      <Link to="/returns" target="_blank" className="text-primary hover:underline font-medium">
                        Return Policy
                      </Link>
                      . I understand that GetPawsy is not the manufacturer of the products and I 
                      accept full responsibility for the use of products purchased, including any 
                      risks to myself, others, or my pets.
                    </span>
                    
                    {/* Mobile: stacked/split text for guaranteed no clipping */}
                    <span className="sm:hidden">
                      I agree to the Terms & Conditions
                    </span>
                  </label>
                </div>
                
                {/* Mobile only: Links on separate lines */}
                <div className="sm:hidden pl-7 space-y-2">
                  <div className="flex flex-wrap gap-x-2 gap-y-1 text-sm">
                    <Link to="/terms" target="_blank" className="text-primary hover:underline font-medium">
                      Terms of Service
                    </Link>
                    <span className="text-muted-foreground">•</span>
                    <Link to="/privacy" target="_blank" className="text-primary hover:underline font-medium">
                      Privacy Policy
                    </Link>
                    <span className="text-muted-foreground">•</span>
                    <Link to="/returns" target="_blank" className="text-primary hover:underline font-medium">
                      Return Policy
                    </Link>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    I understand that GetPawsy is not the manufacturer of the products and I 
                    accept full responsibility for the use of products purchased, including any 
                    risks to myself, others, or my pets.
                  </p>
                </div>
                
                {!acceptedTerms && (
                  premiumCheckoutV2 ? (
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground border-t border-border/40 pt-3 mt-1">
                      Accept the terms above to continue
                    </p>
                  ) : (
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                      <p className="text-xs text-amber-800 dark:text-amber-200">
                        ⚠️ You must accept the terms and conditions to proceed with your order.
                      </p>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>

          {/* Right side - Order Summary */}
          <div className="lg:col-span-2">
            <div className={`bg-card p-4 sm:p-6 lg:sticky lg:top-24 max-h-[calc(100vh-6rem)] lg:max-h-none overflow-y-auto lg:overflow-visible ${premiumV5 ? 'rounded-2xl border border-border/60 shadow-none' : 'rounded-xl shadow-card'}`}>
              {premiumV5 && (
                <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground mb-1.5">Order summary</p>
              )}
              <h2 className={premiumV5 ? 'font-display text-[19px] font-semibold tracking-tight mb-4' : 'text-xl font-bold mb-4'}>
                {premiumV5 ? 'Review your order' : 'Order Summary'}
              </h2>

              {/* CJ shipping pre-check — must pass before Stripe redirect */}
              <div className="mb-4">
                <ShippingPrecheck
                  items={items.map((i) => ({ id: i.id, name: i.name }))}
                  initialCountry={visitorCountry ?? undefined}
                  onChange={({ country, check, loading }) => {
                    setShippingCountry(country);
                    setShippingCheck(check);
                    setShippingChecking(loading);
                  }}
                />
              </div>

              {/* Items */}
              <div className="space-y-3 mb-4">
                {items.map((item) => (
                  <div key={item.id} className="flex gap-3">
                    <div className="relative">
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-16 h-16 object-cover rounded-lg"
                      />
                      <span className="absolute -top-2 -right-2 w-5 h-5 bg-primary text-primary-foreground text-xs rounded-full flex items-center justify-center">
                        {item.quantity}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-tight" style={{ 
                        whiteSpace: 'normal',
                        overflowWrap: 'anywhere',
                        wordBreak: 'break-word',
                        display: 'block'
                      }}>{item.name}</p>
                      {item.variant && (
                        <p className="text-xs text-muted-foreground">{item.variant}</p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        ${item.price.toFixed(2)} each
                      </p>
                    </div>
                    <p className="text-sm font-medium">
                      ${(item.price * item.quantity).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>

              {/* Discount Code Input */}
              <div className="mb-4">
                {discountApplied ? (
                  <>
                  <Label htmlFor="discount" className="text-sm font-medium mb-2 block">Discount Code</Label>
                  <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2">
                    <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                    <span className="flex-1 text-sm font-medium text-green-700 dark:text-green-300">
                      {VALID_DISCOUNT_CODES[discountApplied].label} applied!
                    </span>
                    <button
                      onClick={handleRemoveDiscount}
                      className="p-1 hover:bg-green-200 dark:hover:bg-green-800 rounded transition-colors"
                    >
                      <X className="w-4 h-4 text-green-600 dark:text-green-400" />
                    </button>
                  </div>
                  </>
                ) : (
                  <Collapsible open={discountOpen} onOpenChange={setDiscountOpen}>
                    <CollapsibleTrigger className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors">
                      <Tag className="w-3.5 h-3.5" />
                      Have a discount code?
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="discount"
                        placeholder="Enter code"
                        value={discountCode}
                        onChange={(e) => {
                          setDiscountCode(e.target.value.toUpperCase());
                          setDiscountError(null);
                        }}
                        className="pl-9 uppercase"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleApplyDiscount}
                      disabled={!discountCode}
                    >
                      Apply
                    </Button>
                  </div>
                  {discountError && (
                    <p className="text-xs text-destructive mt-1">{discountError}</p>
                  )}
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </div>

              <Separator className="my-4" />

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>${totalPrice.toFixed(2)}</span>
                </div>
                {tierDiscountPercent > 0 && (
                  <div className="flex justify-between text-[hsl(var(--success))]">
                    <span>Tier Discount ({tierDiscountPercent}%)</span>
                    <span>-${tierDiscountAmount.toFixed(2)}</span>
                  </div>
                )}
                {discountApplied && (
                  <div className="flex justify-between text-[hsl(var(--success))]">
                    <span>Coupon ({couponDiscountPercent}%)</span>
                    <span>-${couponDiscountAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shipping</span>
                  {shipping === 0 ? (
                    <span className="text-[hsl(var(--success))]">Free</span>
                  ) : (
                    <span>${shipping.toFixed(2)}</span>
                  )}
                </div>
                {shipping > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Add ${(FREE_SHIPPING_THRESHOLD - totalPrice).toFixed(2)} more for free shipping
                  </p>
                )}
              </div>

              <Separator className="my-4" />

              <div className="flex justify-between text-lg font-bold">
                <span>Total</span>
                <span className="text-primary">${total.toFixed(2)}</span>
              </div>

              {/* Social proof above payment section */}
              <div className="mt-4">
                <CheckoutSocialProof />
              </div>

              {klarna.eligible && (
                <p className="mt-2 text-xs text-muted-foreground text-center">
                  or 4 interest-free payments of{' '}
                  <span className="font-semibold text-foreground">
                    {formatKlarnaInstallment(stripeChargedTotal, 'USD')}
                  </span>{' '}
                  with{' '}
                  <span className="font-semibold" style={{ color: '#FFA8C5' }}>Klarna</span>
                  . Select at checkout.
                </p>
              )}

              {/* Trust block directly above primary CTA */}
              <CheckoutTrustBlock />

              <div
                className="contents"
                onPointerDownCapture={() => {
                  // Fires even when the Button is disabled — disabled buttons
                  // do NOT emit onClick, so this is our only signal that a
                  // user (or automation) attempted to click.
                  console.info('[checkout:cta] pointerdown (desktop)', {
                    isProcessing,
                    acceptedTerms,
                    disabled: isProcessing || !acceptedTerms,
                    disabledReason: isProcessing
                      ? 'isProcessing'
                      : !acceptedTerms
                        ? 'terms_not_accepted'
                        : null,
                  });
                }}
              >
              <Button
                size="lg"
                className="w-full mt-4 gap-2"
                disabled={isProcessing || shippingBlocked || shippingChecking}
                onClick={handleStripeCheckout}
                data-testid="checkout-cta-desktop"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : shippingBlocked ? (
                  <>
                    <Lock className="w-4 h-4" />
                    Not shippable to selected country
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    Checkout - ${total.toFixed(2)}
                  </>
                )}
              </Button>
              </div>


              {/* Trust Signals - Checkout Reassurance */}
              {premiumCheckoutV2 ? (
                <p className="mt-4 pt-4 border-t border-border/40 text-[11px] uppercase tracking-wider text-muted-foreground text-center">
                  Secure Stripe checkout · Free US shipping ${FREE_SHIPPING_THRESHOLD}+ · {DELIVERY_TIME_STANDARD} · {RETURNS_POLICY_SHORT}
                </p>
              ) : (
                <div className="mt-4 pt-4 border-t space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Lock className="w-4 h-4 text-success flex-shrink-0" />
                    <span>Secure checkout powered by Stripe</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Truck className="w-4 h-4 text-primary flex-shrink-0" />
                    <span>Free shipping on eligible orders over ${FREE_SHIPPING_THRESHOLD} • ${FLAT_SHIPPING_RATE.toFixed(2)} flat rate under</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Package className="w-4 h-4 text-primary flex-shrink-0" />
                    <span>Shipping to the US • {DELIVERY_TIME_STANDARD}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <RotateCcw className="w-4 h-4 text-primary flex-shrink-0" />
                    <span>{RETURNS_POLICY_SHORT}</span>
                  </div>
                </div>
              )}
              
              {/* Compact Upsell */}
              <div className="mt-6 pt-6 border-t">
                <CartUpsell 
                  currentItemIds={items.map(item => item.id)} 
                  variant="compact" 
                  maxItems={3} 
                />
              </div>
            </div>
          </div>
        </div>
        
        {/* Mobile Fixed Checkout Bar - positioned above safe area */}
        <div 
          className={`fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-xl border-t border-border/40 lg:hidden z-40 transition-transform duration-300 ease-out ${hideMobileBar ? 'translate-y-full' : 'translate-y-0'}`}
          style={{ 
            width: '100%', 
            maxWidth: '100%', 
            boxSizing: 'border-box',
            padding: '12px 16px',
            paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))'
          }}
        >
          <div 
            className="flex items-center justify-between gap-4 w-full"
            style={{ maxWidth: '100%', boxSizing: 'border-box' }}
          >
            <div className="flex flex-col" style={{ flex: '0 0 auto' }}>
              <span className="text-xs text-muted-foreground">Total</span>
              <span className="text-lg font-bold text-primary">${total.toFixed(2)}</span>
            </div>
            <div
              className="contents"
              onPointerDownCapture={() => {
                console.info('[checkout:cta] pointerdown (mobile)', {
                  isProcessing,
                  acceptedTerms,
                  disabled: isProcessing || !acceptedTerms,
                  disabledReason: isProcessing
                    ? 'isProcessing'
                    : !acceptedTerms
                      ? 'terms_not_accepted'
                      : null,
                });
              }}
            >
            <Button
              size="lg"
              className="gap-2"
              style={{ 
                flex: '1 1 auto',
                minWidth: 0,
                maxWidth: '100%',
                boxSizing: 'border-box'
              }}
              disabled={isProcessing || shippingBlocked || shippingChecking}
              onClick={handleStripeCheckout}
              data-testid="checkout-cta-mobile"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                  <span className="truncate">Processing...</span>
                </>
              ) : shippingBlocked ? (
                <>
                  <Lock className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">Unavailable</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">Checkout</span>
                </>
              )}
            </Button>
            </div>
          </div>
        </div>
        
        {/* Spacer for mobile fixed bar - must match bar height + safe area */}
        <div 
          className="lg:hidden" 
          style={{ height: 'calc(88px + env(safe-area-inset-bottom, 0px))' }} 
        />
      </div>
    </Layout>
  );
};

export default Checkout;
