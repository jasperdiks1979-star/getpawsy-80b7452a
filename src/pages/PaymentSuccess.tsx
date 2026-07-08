import { useEffect, useState, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { CheckCircle, Package, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { useCart } from '@/contexts/CartContext';
import { trackPurchase, trackGoogleAdsConversion, trackGoogleAdsPageView } from '@/lib/analytics';
import { ttTrackPurchase } from '@/lib/tiktok-pixel';
import { trackVisitorEvent } from '@/hooks/useVisitorTracking';
import { fireMarketingAsync } from '@/lib/marketingClient';
import { mirrorLpFunnelEvent } from '@/lib/lpFunnelMirror';
import { getPersistedUtm } from '@/lib/utmNormalizer';
import { trackCheckoutFunnel } from '@/lib/checkoutFunnel';
import { firePaymentSuccess } from '@/lib/funnelEvents';
import { trackCci } from '@/lib/cci';
import { useBundleABTest } from '@/hooks/useBundleABTest';
import { ReferralShareWidget } from '@/components/referral/ReferralShareWidget';
import { PostPurchaseOffer } from '@/components/cart/PostPurchaseOffer';
import { getConversionFlag } from '@/lib/conversionFlags';
import { SoftEmailCapture } from '@/components/email/SoftEmailCapture';

const PaymentSuccess = () => {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const { items, totalPrice, clearCart } = useCart();
  const abTest = useBundleABTest();
  const [tracked, setTracked] = useState(false);
  const purchasedIdsRef = useRef<string[]>([]);
  const lpFiredRef = useRef(false);
  const premiumThankYou = getConversionFlag('premiumThankYou');
  const premiumPostPurchase = getConversionFlag('premiumPostPurchase');

  // Mark a recent successful purchase so the homepage can show a quiet
  // returning-visitor welcome strip for ~30 days. Storage only — no PII.
  useEffect(() => {
    if (!sessionId) return;
    try {
      window.localStorage.setItem('gp_recent_purchase_ts', String(Date.now()));
    } catch {
      /* ignore quota / privacy mode */
    }
  }, [sessionId]);

  // Fire lp_funnel_events `payment_success` once per mount with the
  // Stripe session id from the URL. Purely additive — does NOT modify
  // Stripe webhook, checkout, or refund logic. Reliable conversion truth
  // still comes from the server-side webhook; this is for client-side
  // funnel-completion visibility in the /admin/funnel-health and
  // /admin/ai-revenue dashboards (checkout → payment ratio).
  useEffect(() => {
    if (lpFiredRef.current) return;
    if (!sessionId) return;
    // Cross-mount idempotency: refresh / back-button must not re-fire
    // payment_success or the canonical purchase mirror for the same
    // Stripe session. Keyed by session_id so distinct orders still fire.
    const lpKey = `gp_purchase_lp_fired_${sessionId}`;
    try {
      if (window.localStorage.getItem(lpKey)) {
        lpFiredRef.current = true;
        return;
      }
      window.localStorage.setItem(lpKey, String(Date.now()));
    } catch {
      /* storage unavailable — fall through, ref still guards in-mount */
    }
    lpFiredRef.current = true;
    try {
      firePaymentSuccess({
        order_total: typeof totalPrice === 'number' ? totalPrice : undefined,
        currency: 'USD',
        stripe_session_id: sessionId,
      });
      try {
        sessionStorage.removeItem('gp_cci_checkout_active');
        trackCci('payment_success', {
          funnel_stage: 'payment_success',
          meta: {
            order_total: typeof totalPrice === 'number' ? totalPrice : undefined,
            currency: 'USD',
            stripe_session_id: sessionId,
          },
        });
        trackCci('purchase_confirmed', {
          funnel_stage: 'purchase_confirmed',
          meta: {
            order_total: typeof totalPrice === 'number' ? totalPrice : undefined,
            currency: 'USD',
            stripe_session_id: sessionId,
            item_count: items.length,
          },
        });
      } catch { /* swallow */ }
      // Canonical waterfall `purchase` step — the ONLY way
      // analytics_funnel_waterfall.purchase_at gets stamped. Without this
      // the funnel reports 0 purchases even when Stripe confirms revenue.
      // Non-blocking, idempotent (guarded by lpKey above).
      import('@/lib/analyticsFunnel')
        .then((m) => m.recordFunnelStep('purchase', {
          value: typeof totalPrice === 'number' ? totalPrice : undefined,
          currency: 'USD',
          stripe_session_id: sessionId,
        }))
        .catch(() => {});
      // Also mirror a canonical `purchase` event so the AI revenue
      // dashboard can compute checkout→payment ratios even when the
      // cart was cleared by a page refresh (no items in scope).
      const utm = {
        utm_source: sessionStorage.getItem('gp_utm_utm_source') ?? undefined,
        utm_medium: sessionStorage.getItem('gp_utm_utm_medium') ?? undefined,
        utm_campaign: sessionStorage.getItem('gp_utm_utm_campaign') ?? undefined,
        utm_content: sessionStorage.getItem('gp_utm_utm_content') ?? undefined,
      };
      mirrorLpFunnelEvent('purchase', {
        value: typeof totalPrice === 'number' ? totalPrice : undefined,
        items: items.map(item => ({ item_id: item.id, item_name: item.name })),
        stripe_session_id: sessionId,
        ...utm,
      });
      // Pinterest DB funnel mirror — no-op if session not Pinterest
      import('@/lib/pinterestTracker')
        .then((m) => m.trackPinterestEvent('purchase', {
          value: typeof totalPrice === 'number' ? totalPrice : null,
          currency: 'USD',
        }))
        .catch(() => {});
      // Pinterest CAPI server-side mirror — no-op if no Pinterest session cookie.
      import('@/lib/pinterest-conversion-intel')
        .then((m) => m.enqueueCapiEvent('purchase', {
          value: typeof totalPrice === 'number' ? totalPrice : null,
          currency: 'USD',
          custom_data: {
            order_id: sessionId,
            item_count: items.reduce((s, i) => s + i.quantity, 0),
          },
        }))
        .catch(() => {});
    } catch {
      /* analytics never breaks UX */
    }
  }, [sessionId, totalPrice, items]);

  useEffect(() => {
    // Track purchase conversion and clear cart only once
    if (!tracked && sessionId && items.length > 0) {
      // Cross-mount idempotency for GA4 / Google Ads / Pinterest / TikTok
      // purchase conversion. Without this, a refresh on /payment-success
      // with items still in the cart (rare but possible before clearCart
      // commits) would double-fire `purchase` into GA4 + Ads.
      const convKey = `gp_purchase_conv_fired_${sessionId}`;
      try {
        if (window.localStorage.getItem(convKey)) {
          setTracked(true);
          return;
        }
        window.localStorage.setItem(convKey, String(Date.now()));
      } catch {
        /* storage unavailable — `tracked` state still guards in-mount */
      }
      // Capture product IDs for post-purchase offer before cart is cleared
      purchasedIdsRef.current = items.map(item => item.id);
      // Track GA4 purchase event
      trackPurchase(
        sessionId,
        items.map(item => ({
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
        })),
        totalPrice
      );

      // Track Google Ads purchase conversion with enhanced data
      trackGoogleAdsConversion({
        transactionId: sessionId,
        value: totalPrice,
        currency: 'USD',
        items: items.map(item => ({
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
        })),
      });

      // Track Google Ads remarketing page view
      trackGoogleAdsPageView('purchase', items.map(item => ({
        id: item.id,
        name: item.name,
        price: item.price,
      })));

      // TikTok Pixel Purchase — closes the loop for TikTok ad attribution
      ttTrackPurchase({
        orderId: sessionId,
        value: totalPrice,
        currency: 'USD',
        contents: items.map(item => ({
          content_id: item.id,
          quantity: item.quantity,
          price: item.price,
          content_name: item.name,
        })),
      });

      // Track in visitor_activity for internal funnel analysis
      trackVisitorEvent('purchase', {
        orderId: sessionId,
        orderValue: totalPrice,
      });

      // Purchase mirror into lp_funnel_events is fired unconditionally
      // in the earlier useEffect (handles cart-cleared refresh case too).

      // Pinterest purchase tracking — deferred, non-blocking
      fireMarketingAsync('pinterest-purchase', async () => {
        const { trackPinterestEvent } = await import('@/hooks/usePinterestTracking');
        trackPinterestEvent('checkout', {
          event_id: sessionId,
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

      // A/B Test: Track purchase completed with variant
      abTest.trackPurchaseCompleted({
        orderValueUsd: totalPrice,
        numberOfItems: items.reduce((sum, item) => sum + item.quantity, 0),
      });

      clearCart(true); // Mark as recovered
      setTracked(true);

      // Generic complete_payment funnel step — Klarna detection happens
      // server-side in the Stripe webhook (where the actual payment
      // method is known) and is mirrored as a 'klarna_purchase' step.
      trackCheckoutFunnel({
        step: 'complete_payment',
        value: totalPrice,
        currency: 'USD',
        stripeSessionId: sessionId || undefined,
      });
      
      console.debug('[PaymentSuccess] Conversion tracking completed:', {
        sessionId,
        totalPrice,
        itemCount: items.length,
        abVariant: abTest.variant,
      });
    } else if (!tracked && sessionId && items.length === 0) {
      // Cart already cleared (e.g., page refresh after purchase)
      // Still track the page view for remarketing
      trackGoogleAdsPageView('purchase');
      setTracked(true);
    }
  }, [sessionId, items, totalPrice, clearCart, tracked]);

  if (!sessionId) {
    return (
      <Layout>
        <Helmet><meta name="robots" content="noindex, nofollow" /></Helmet>
        <div className="container px-4 md:px-6 py-16 text-center">
          <h2 className="text-2xl font-bold mb-4">Invalid Session</h2>
          <p className="text-muted-foreground mb-8">
            We couldn't find your order. Please contact support if you believe this is an error.
          </p>
          <Link to="/">
            <Button>Return Home</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Helmet><meta name="robots" content="noindex, nofollow" /></Helmet>
      <div className="container px-4 md:px-6 py-16">
        <motion.div 
          className="max-w-2xl mx-auto text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            className={
              premiumThankYou
                ? 'w-20 h-20 mx-auto mb-8 rounded-full bg-[hsl(var(--success))/0.12] flex items-center justify-center'
                : 'w-24 h-24 mx-auto mb-8 rounded-full bg-green-100 flex items-center justify-center'
            }
          >
            <CheckCircle
              className={
                premiumThankYou
                  ? 'w-10 h-10 text-[hsl(var(--success))]'
                  : 'w-12 h-12 text-green-600'
              }
              strokeWidth={premiumThankYou ? 1.75 : 2}
            />
          </motion.div>

          <h1
            className={
              premiumThankYou
                ? 'text-3xl md:text-4xl font-display font-semibold tracking-tight mb-3'
                : 'text-3xl md:text-4xl font-display font-bold mb-4'
            }
          >
            {premiumThankYou ? 'Thank you for your order' : 'Thank You for Your Order! 🎉'}
          </h1>

          <p
            className={
              premiumThankYou
                ? 'text-base md:text-lg text-muted-foreground mb-8 max-w-lg mx-auto leading-relaxed'
                : 'text-lg text-muted-foreground mb-8'
            }
          >
            Your order has been successfully placed. You'll receive a confirmation
            email shortly with your order details.
          </p>

          {premiumThankYou ? (
            <div className="border border-border/50 rounded-2xl p-6 mb-8 text-left max-w-lg mx-auto bg-card/40">
              <div className="flex items-center gap-2 mb-4">
                <Package className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} />
                <h2 className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
                  What happens next
                </h2>
              </div>
              <ol className="space-y-3 text-sm text-foreground">
                <li className="flex items-start gap-3">
                  <span className="text-muted-foreground tabular-nums w-5">01</span>
                  <span>Order confirmation arrives in your inbox</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-muted-foreground tabular-nums w-5">02</span>
                  <span>We prepare and ship your order within 1–2 business days</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-muted-foreground tabular-nums w-5">03</span>
                  <span>A tracking link follows once it's on the way</span>
                </li>
              </ol>
            </div>
          ) : (
            <div className="bg-muted/50 rounded-2xl p-6 mb-8">
              <div className="flex items-center justify-center gap-3 mb-4">
                <Package className="w-6 h-6 text-primary" />
                <h2 className="text-lg font-semibold">What happens next?</h2>
              </div>
              <ul className="text-left space-y-3 text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">1.</span>
                  You'll receive an order confirmation via email
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">2.</span>
                  We'll prepare your order and ship it as soon as possible
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">3.</span>
                  You'll receive a tracking code once your package is on its way
                </li>
              </ul>
            </div>
          )}

          {/* Post-Purchase Offer */}
          {purchasedIdsRef.current.length > 0 && (
            <div className="max-w-md mx-auto mb-8">
              <PostPurchaseOffer purchasedProductIds={purchasedIdsRef.current} />
            </div>
          )}

          {/* CI-13: soft email capture — trust-first, no popup. Shown only
              when the premium post-purchase flag is on. */}
          {premiumPostPurchase && (
            <div className="max-w-md mx-auto mb-8 text-left">
              <SoftEmailCapture
                variant="collection"
                headline="Want updates on your order?"
                description="Optional — drop your email for shipping updates and the occasional helpful guide. No spam."
              />
            </div>
          )}

          {/* Referral program widget */}
          <div className="max-w-md mx-auto mb-8">
            <ReferralShareWidget customerEmail="" />
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/products">
              <Button size="lg" className="gap-2">
                Continue Shopping
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link to="/">
              <Button size="lg" variant="outline">
                Back to Home
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>
    </Layout>
  );
};

export default PaymentSuccess;
