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
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { trackBeginCheckout } from '@/lib/analytics';
import { supabase } from '@/integrations/supabase/client';
import { CartUpsell } from '@/components/cart/CartUpsell';
import { fireMarketingAsync } from '@/lib/marketingClient';
import { useBundleABTest } from '@/hooks/useBundleABTest';
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
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [discountCode, setDiscountCode] = useState('');
  const [discountApplied, setDiscountApplied] = useState<string | null>(null);
  const [discountError, setDiscountError] = useState<string | null>(null);

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

  // Check for discount code in localStorage (from popups)
  useEffect(() => {
    const savedCode = localStorage.getItem('getpawsy_discount_code');
    if (savedCode && VALID_DISCOUNT_CODES[savedCode]) {
      setDiscountCode(savedCode);
      setDiscountApplied(savedCode);
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
    }
  }, [user, setAbandonedCartEmail]);
  
  // Update abandoned cart email when user enters email
  const handleEmailChange = (newEmail: string) => {
    setEmail(newEmail);
    if (newEmail && newEmail.includes('@')) {
      setAbandonedCartEmail(newEmail);
    }
  };

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
      
      // A/B Test: Track checkout started with variant
      abTest.trackCheckoutStarted(totalPrice);
      
      // Pinterest Checkout tracking — deferred, non-blocking
      fireMarketingAsync('pinterest-checkout', async () => {
        const { trackPinterestEvent } = await import('@/hooks/usePinterestTracking');
        trackPinterestEvent('checkout', {
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
    if (!email || !email.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }

    if (!acceptedTerms) {
      toast.error('Please accept the Terms of Service and Return Policy to continue');
      return;
    }

    setIsProcessing(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: {
          items: items.map(item => ({
            id: item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            image: item.image,
          })),
          customerEmail: email,
          discountCode: discountApplied || undefined,
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data?.url) {
        // Redirect to Stripe Checkout
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      toast.error('Something went wrong. Please try again.');
      setIsProcessing(false);
    }
  };

  if (items.length === 0) {
    return (
      <Layout>
        <Helmet><meta name="robots" content="noindex, nofollow" /></Helmet>
        <div className="container px-4 md:px-6 py-16 text-center">
          <h2 className="text-2xl font-bold mb-4">Your cart is empty</h2>
          <Link to="/products">
            <Button>Start Shopping</Button>
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

        <h1 className="text-3xl font-bold mb-8">Checkout</h1>

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
                <p className="text-xs text-muted-foreground mt-2">
                  Apple Pay & Google Pay appear automatically on supported devices for 1-tap checkout.
                </p>
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
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                    <p className="text-xs text-amber-800 dark:text-amber-200">
                      ⚠️ You must accept the terms and conditions to proceed with your order.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right side - Order Summary */}
          <div className="lg:col-span-2">
            <div className="bg-card rounded-xl shadow-card p-4 sm:p-6 lg:sticky lg:top-24 max-h-[calc(100vh-6rem)] lg:max-h-none overflow-y-auto lg:overflow-visible">
              <h2 className="text-xl font-bold mb-4">Order Summary</h2>
              
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
                <Label htmlFor="discount" className="text-sm font-medium mb-2 block">Discount Code</Label>
                {discountApplied ? (
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
                ) : (
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
                )}
                {discountError && (
                  <p className="text-xs text-destructive mt-1">{discountError}</p>
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

              <Button
                size="lg"
                className="w-full mt-6 gap-2"
                disabled={isProcessing || !email || !acceptedTerms}
                onClick={handleStripeCheckout}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    Checkout - ${total.toFixed(2)}
                  </>
                )}
              </Button>

              {!acceptedTerms && (
                <p className="text-xs text-amber-600 dark:text-amber-400 text-center mt-3">
                  Please accept the terms above to continue
                </p>
              )}

              {/* Trust Signals - Checkout Reassurance */}
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
          className="fixed bottom-0 left-0 right-0 bg-background border-t shadow-lg lg:hidden z-40"
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
            <Button
              size="lg"
              className="gap-2"
              style={{ 
                flex: '1 1 auto',
                minWidth: 0,
                maxWidth: '100%',
                boxSizing: 'border-box'
              }}
              disabled={isProcessing || !email || !acceptedTerms}
              onClick={handleStripeCheckout}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                  <span className="truncate">Processing...</span>
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
