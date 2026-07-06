import { Link } from 'react-router-dom';
import { PaymentBadges } from '@/components/shared/PaymentBadges';
import { Helmet } from 'react-helmet-async';
import { Trash2, Plus, Minus, ShoppingBag, ArrowRight, Home, Truck, ShieldCheck, Gift, Star, Compass, Lock } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { useCart } from '@/contexts/CartContext';
import { useEffect } from 'react';
import { fireCartOpen, fireCheckoutClick } from '@/lib/funnelEvents';
import { trackCci } from '@/lib/cci';
import { getConversionFlag } from '@/lib/conversionFlags';
import { useScrollDirection } from '@/hooks/useScrollDirection';
import { CartUpsell } from '@/components/cart/CartUpsell';
import { FreeShippingNudge } from '@/components/cart/FreeShippingNudge';
import { TieredIncentiveBar } from '@/components/cart/TieredIncentiveBar';
import { TrustStripAboveATC } from '@/components/trust/TrustStripAboveATC';
import { safeString, safeNumber } from '@/lib/safe-render';
import {
  FREE_SHIPPING_THRESHOLD,
  FLAT_SHIPPING_RATE,
  DELIVERY_TIME_STANDARD,
  RETURNS_POLICY_SHORT,
  TRUST_BADGES,
  US_FULFILLMENT_NOTE,
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

const Cart = () => {
  const { items, removeItem, updateQuantity, totalPrice, clearCart } = useCart();
  const premium = getConversionFlag('premiumCheckoutCart');
  const premiumV3 = getConversionFlag('premiumCartV3');
  const premiumV4 = getConversionFlag('premiumCartCheckoutV4');
  const premiumV5 = getConversionFlag('premiumCartCheckoutV5');
  const scrollDir = useScrollDirection(8);
  const hideMobileBar =
    premiumV3 &&
    scrollDir === 'down' &&
    typeof window !== 'undefined' &&
    window.scrollY > 200;

  // Fire one cart_open event per session+page when the cart route mounts.
  // Dedupe handled centrally in funnelEvents (10s window per session+event).
  useEffect(() => {
    try {
      fireCartOpen({
        item_count: items.length,
        source_component: 'cart_page',
      });
      trackCci('cart_open', { funnel_stage: 'cart', meta: { item_count: items.length } });
    } catch {
      /* analytics never breaks UX */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply flat rate shipping for orders under threshold
  const shipping = totalPrice >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING_RATE;
  
  // Tiered incentive discount
  const currentTier = getApplicableTier(totalPrice);
  const tierDiscountPercent = currentTier?.discountPercent ?? 0;
  const tierDiscountAmount = totalPrice * (tierDiscountPercent / 100);
  
  const tax = (totalPrice - tierDiscountAmount) * 0.08;
  const total = totalPrice - tierDiscountAmount + shipping + tax;
  
  // Calculate progress to free shipping
  const shippingProgress = Math.min((totalPrice / FREE_SHIPPING_THRESHOLD) * 100, 100);
  const amountToFreeShipping = Math.max(FREE_SHIPPING_THRESHOLD - totalPrice, 0);

  // Shared handler: fires the cart-stage checkout intent so we can measure
  // cart → /checkout drop-off. The actual create-checkout invoke + redirect
  // events fire on the /checkout page itself.
  const handleCartCheckoutClick = (source_component: string) => {
    try {
      fireCheckoutClick({
        source_component,
        item_count: items.reduce((s, i) => s + i.quantity, 0),
        value: Number(total.toFixed(2)),
        currency: 'USD',
      });
    } catch { /* analytics never breaks UX */ }
    try {
      trackCci('checkout_click', {
        funnel_stage: 'checkout_intent',
        meta: {
          source_component,
          item_count: items.reduce((s, i) => s + i.quantity, 0),
          value: Number(total.toFixed(2)),
          currency: 'USD',
        },
      });
    } catch { /* swallow */ }
  };

  if (items.length === 0) {
    if (premiumV4) {
      return (
        <Layout>
          <Helmet><meta name="robots" content="noindex, nofollow" /></Helmet>
          <div className="container px-4 md:px-6 py-20">
            <div className="text-center max-w-md mx-auto">
              <div className="w-20 h-20 rounded-full border border-border/60 flex items-center justify-center mx-auto mb-8">
                <Compass className="w-8 h-8 text-muted-foreground" strokeWidth={1.5} />
              </div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground mb-3">
                Empty cart
              </p>
              <h1 className="font-display text-2xl md:text-3xl font-semibold tracking-tight mb-3">
                Nothing here yet
              </h1>
              <p className="text-[15px] text-muted-foreground/90 mb-8 leading-relaxed">
                Find something your pet will love. Free shipping over ${FREE_SHIPPING_THRESHOLD}.
              </p>
              <Link to="/products">
                <Button size="lg" className="gap-2 rounded-full px-6">
                  Browse products
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </Layout>
      );
    }
    return (
      <Layout>
        <Helmet><meta name="robots" content="noindex, nofollow" /></Helmet>
        <div className="container px-4 md:px-6 py-16">
          <div className="text-center max-w-md mx-auto">
            <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
              <ShoppingBag className="w-12 h-12 text-muted-foreground" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Your cart is empty</h2>
            <p className="text-muted-foreground mb-6">
              Looks like you haven't added any products yet. Let's find something for your furry friend!
            </p>
            <Link to="/products">
              <Button size="lg" className="gap-2">
                Start Shopping
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Helmet><meta name="robots" content="noindex, nofollow" /></Helmet>
      <div className={`container px-4 md:px-6 py-8 ${premium ? 'pb-28 md:pb-8' : ''}`}>
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
              <BreadcrumbPage>Shopping Cart</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex items-center justify-between mb-8">
          <div>
            {premiumV5 && (
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground mb-2">
                Your cart · {items.length} {items.length === 1 ? 'item' : 'items'}
              </p>
            )}
            <h1 className={premiumV5 ? 'font-display text-2xl md:text-3xl font-semibold tracking-tight' : 'text-3xl font-bold'}>
              {premiumV5 ? 'Shopping cart' : 'Shopping Cart'}
            </h1>
          </div>
          <Button variant="ghost" onClick={() => clearCart()} className={premiumV5 ? 'text-[12px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground' : 'text-muted-foreground'}>
            {premiumV5 ? 'Clear' : 'Clear Cart'}
          </Button>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Cart Items */}
          <div className="lg:col-span-2 space-y-4">
            {items.map((item) => (
              <div
                key={item.id}
                className={
                  premiumV4
                    ? `flex gap-4 p-4 bg-card rounded-2xl border ${premiumV5 ? 'border-border/60' : 'border-border/50'}`
                    : premium
                    ? 'flex gap-4 p-4 bg-card rounded-2xl border border-border/60'
                    : 'flex gap-4 p-4 bg-card rounded-xl shadow-card'
                }
              >
                <Link to={item.slug ? `/products/${item.slug}` : '/products'} className="shrink-0">
                  <img
                    src={item.image}
                    alt={item.name}
                    className={premium ? 'w-20 h-20 md:w-24 md:h-24 object-cover rounded-xl bg-secondary/30' : 'w-24 h-24 object-cover rounded-lg'}
                  />
                </Link>
                <div className="flex-1 min-w-0">
                  <Link to={item.slug ? `/products/${item.slug}` : '/products'}>
                    <h3 className={
                      premium
                        ? 'font-display font-semibold text-[15px] leading-snug line-clamp-2 hover:text-primary transition-colors'
                        : 'font-semibold hover:text-primary transition-colors'
                    }>
                      {safeString(item.name)}
                    </h3>
                  </Link>
                  {item.variant && (
                    <p className="text-sm text-muted-foreground">{safeString(item.variant)}</p>
                  )}
                  <p className={
                    premium
                      ? 'text-[15px] font-semibold text-foreground mt-1 tracking-tight'
                      : 'text-lg font-bold text-primary mt-1'
                  }>
                    ${safeNumber(item.price).toFixed(2)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeItem(item.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  <div className={premiumV4 ? `flex items-center border ${premiumV5 ? 'border-border/60' : 'border-border/50'} rounded-full` : 'flex items-center border rounded-lg'}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                    >
                      <Minus className="w-3 h-3" />
                    </Button>
                    <span className="w-8 text-center text-sm font-medium">
                      {item.quantity}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            
            {/* Upsell Section — height reserved to prevent CLS during async load */}
            <div className="mt-8 min-h-[520px] md:min-h-[300px]">
              <CartUpsell currentItemIds={items.map(item => item.id)} />
            </div>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className={
              premium
                ? `bg-card rounded-2xl border border-border/60 p-6 sticky top-24 ${premiumV5 ? 'shadow-none' : ''}`
                : 'bg-card rounded-xl shadow-card p-6 sticky top-24'
            }>
              {premiumV5 && (
                <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground mb-1.5">Order summary</p>
              )}
              <h2 className={premiumV5 ? 'font-display text-[19px] font-semibold tracking-tight mb-4' : 'text-xl font-bold mb-4'}>
                {premiumV5 ? 'Review your order' : 'Order Summary'}
              </h2>
              
              {/* Tiered Incentive Progress */}
              <div className="mb-4">
                <TieredIncentiveBar subtotal={totalPrice} />
                {totalPrice < FREE_SHIPPING_THRESHOLD && (
                  <FreeShippingNudge 
                    amountNeeded={amountToFreeShipping} 
                    currentItemIds={items.map(item => item.id)} 
                  />
                )}
              </div>
              
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium">${totalPrice.toFixed(2)}</span>
                </div>
                {tierDiscountPercent > 0 && (
                  <div className="flex justify-between text-[hsl(var(--success))]">
                    <span>Tier Discount ({tierDiscountPercent}%)</span>
                    <span>-${tierDiscountAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shipping</span>
                  {shipping === 0 ? (
                    <span className="font-medium text-[hsl(var(--success))]">Free</span>
                  ) : (
                    <span className="font-medium">${shipping.toFixed(2)}</span>
                  )}
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax (estimated)</span>
                  <span className="font-medium">${tax.toFixed(2)}</span>
                </div>
              </div>

              <Separator className="my-4" />

              <div className="flex justify-between text-lg font-bold">
                <span>Total</span>
                <span className="text-primary">${total.toFixed(2)}</span>
              </div>

              {/* Shipping info — hairline micro-caps in v3, legacy pill otherwise. */}
              {premiumV3 ? (
                <p className="mt-4 pt-3 border-t border-border/40 text-[11px] uppercase tracking-wider text-muted-foreground text-center">
                  Processing 1–2 days · Delivery 5–10 days
                </p>
              ) : (
                <div className="mt-4 p-2 bg-muted/50 rounded-lg border border-border text-center">
                  <div className="flex items-center justify-center gap-1 text-muted-foreground text-xs">
                    <Truck className="w-3 h-3" />
                    <span>Processing: 1–2 business days • Delivery: 5–10 business days</span>
                  </div>
                </div>
              )}

              <Link
                to="/checkout"
                className="block mt-4"
                onClick={() => handleCartCheckoutClick('cart_proceed_button')}
              >
                {/* Mission First Revenue P0.2 — trust strip directly above primary CTA */}
                <TrustStripAboveATC className="mb-3 justify-center" compact />
                <Button
                  size="lg"
                  className={
                    premium
                      ? 'w-full gap-2 rounded-full font-semibold shadow-[0_8px_24px_-12px_rgba(0,0,0,0.35)] hover:shadow-[0_10px_28px_-12px_rgba(0,0,0,0.45)] transition-shadow'
                      : 'w-full gap-2 shadow-lg hover:shadow-xl transition-shadow'
                  }
                >
                  <Lock className="w-4 h-4" aria-hidden="true" />
                  Secure Checkout
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>

              {/* Payment methods surfaced at the decision moment — reassures
                  shoppers that Apple Pay / Google Pay / Shop Pay / cards are
                  accepted before they tap through to Stripe. */}
              <PaymentBadges
                variant="dark"
                showLabel={false}
                methods={['Visa', 'Mastercard', 'Amex', 'Apple Pay', 'Google Pay', 'PayPal']}
                className="mt-3 justify-center"
              />

              <Link to="/products" className="block mt-3">
                <Button variant="outline" size="lg" className={premium ? 'w-full rounded-full' : 'w-full'}>
                  Continue Shopping
                </Button>
              </Link>

              {/* Trust row — single hairline dot-separated line in premium mode,
                  legacy triple-stack otherwise. Payment badges always shown. */}
              {premium ? (
                <div className="mt-6 pt-4 border-t">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>Secure checkout</span>
                    <span aria-hidden="true" className="opacity-60">·</span>
                    <span>{DELIVERY_TIME_STANDARD}</span>
                    <span aria-hidden="true" className="opacity-60">·</span>
                    <span>30-day returns</span>
                  </p>
                  <PaymentBadges variant="dark" label="We accept:" className="pt-3" />
                </div>
              ) : (
                <div className="mt-6 pt-4 border-t space-y-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ShieldCheck className="w-4 h-4 text-green-600" />
                    <span>{TRUST_BADGES.secure.title} • {TRUST_BADGES.secure.subtitle}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Truck className="w-4 h-4 text-primary" />
                    <span>{US_FULFILLMENT_NOTE} • {DELIVERY_TIME_STANDARD}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Star className="w-4 h-4 text-amber-500" />
                    <span>{RETURNS_POLICY_SHORT}</span>
                  </div>
                  <PaymentBadges variant="dark" label="We accept:" className="pt-2" />
                </div>
              )}

              {/* Compact sidebar cross-sell */}
              <div className={premium ? 'mt-6 pt-4 border-t hidden md:block' : 'mt-6 pt-4 border-t'}>
                <CartUpsell 
                  currentItemIds={items.map(item => item.id)} 
                  variant="compact" 
                  maxItems={3} 
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CI-8 — mobile sticky checkout bar. Always-reachable primary action
          while the user scrolls items and upsells. Desktop unaffected.
          Suppressed when premiumCheckoutCart flag is off. */}
      {premium && (
        <div
          className={`md:hidden fixed bottom-0 inset-x-0 z-40 bg-background/95 backdrop-blur-md border-t border-border/60 px-4 py-3 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.18)] transition-transform duration-300 ease-out ${hideMobileBar ? 'translate-y-full' : 'translate-y-0'}`}
          role="region"
          aria-label="Checkout summary"
        >
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</p>
              <p className="text-base font-semibold text-foreground tracking-tight">${total.toFixed(2)}</p>
            </div>
            <Link
              to="/checkout"
              className="flex-1"
              onClick={() => handleCartCheckoutClick('cart_sticky_button')}
            >
              <Button size="lg" className="w-full gap-2 rounded-full font-semibold h-12">
                Checkout
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Cart;
