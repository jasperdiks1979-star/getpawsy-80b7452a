import { Link } from 'react-router-dom';
import { PaymentBadges } from '@/components/shared/PaymentBadges';
import { Helmet } from 'react-helmet-async';
import { Trash2, Plus, Minus, ShoppingBag, ArrowRight, Home, Truck, ShieldCheck, Gift, Star } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { useCart } from '@/contexts/CartContext';
import { CartUpsell } from '@/components/cart/CartUpsell';
import { FreeShippingNudge } from '@/components/cart/FreeShippingNudge';
import { TieredIncentiveBar } from '@/components/cart/TieredIncentiveBar';
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

  if (items.length === 0) {
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
      <div className="container px-4 md:px-6 py-8">
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
          <h1 className="text-3xl font-bold">Shopping Cart</h1>
          <Button variant="ghost" onClick={() => clearCart()} className="text-muted-foreground">
            Clear Cart
          </Button>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Cart Items */}
          <div className="lg:col-span-2 space-y-4">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex gap-4 p-4 bg-card rounded-xl shadow-card"
              >
                <Link to={`/product/${item.id}`} className="shrink-0">
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-24 h-24 object-cover rounded-lg"
                  />
                </Link>
                <div className="flex-1 min-w-0">
                  <Link to={`/product/${item.id}`}>
                    <h3 className="font-semibold hover:text-primary transition-colors">
                      {safeString(item.name)}
                    </h3>
                  </Link>
                  {item.variant && (
                    <p className="text-sm text-muted-foreground">{safeString(item.variant)}</p>
                  )}
                  <p className="text-lg font-bold text-primary mt-1">
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
                  <div className="flex items-center border rounded-lg">
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
            
            {/* Upsell Section */}
            <div className="mt-8">
              <CartUpsell currentItemIds={items.map(item => item.id)} />
            </div>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className="bg-card rounded-xl shadow-card p-6 sticky top-24">
              <h2 className="text-xl font-bold mb-4">Order Summary</h2>
              
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

              {/* Shipping info */}
              <div className="mt-4 p-2 bg-muted/50 rounded-lg border border-border text-center">
                <div className="flex items-center justify-center gap-1 text-muted-foreground text-xs">
                  <Truck className="w-3 h-3" />
                  <span>Processing: 1–2 business days • Delivery: 5–10 business days</span>
                </div>
              </div>

              <Link to="/checkout" className="block mt-4">
                <Button size="lg" className="w-full gap-2 shadow-lg hover:shadow-xl transition-shadow">
                  Proceed to Checkout
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>

              <Link to="/products" className="block mt-3">
                <Button variant="outline" size="lg" className="w-full">
                  Continue Shopping
                </Button>
              </Link>

              {/* Enhanced Trust badges - using centralized constants */}
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
                {/* Payment method badges */}
                <PaymentBadges variant="dark" label="We accept:" className="pt-2" />
              </div>

              {/* Compact sidebar cross-sell */}
              <div className="mt-6 pt-4 border-t">
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
    </Layout>
  );
};

export default Cart;
