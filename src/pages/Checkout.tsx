import { useState, useEffect, memo } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, Lock, Loader2, ShieldCheck, FileText, Home, ShoppingCart } from 'lucide-react';
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
  const [isProcessing, setIsProcessing] = useState(false);
  const [email, setEmail] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const shipping = 0; // Free shipping on all orders
  const total = totalPrice + shipping;

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

  // Track checkout activity for visitor map
  const trackCheckoutActivity = async () => {
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
        <div className="container px-4 md:px-6 py-16 text-center">
          <h1 className="text-2xl font-bold mb-4">Your cart is empty</h1>
          <Link to="/products">
            <Button>Start Shopping</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container px-4 md:px-6 py-8 max-w-4xl">
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

        <div className="grid lg:grid-cols-5 gap-8">
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
                <p className="text-sm text-muted-foreground mb-2">Accepted payment methods:</p>
                <div className="flex gap-2">
                  <div className="bg-muted px-3 py-1.5 rounded text-xs font-medium">Visa</div>
                  <div className="bg-muted px-3 py-1.5 rounded text-xs font-medium">Mastercard</div>
                  <div className="bg-muted px-3 py-1.5 rounded text-xs font-medium">Amex</div>
                  <div className="bg-muted px-3 py-1.5 rounded text-xs font-medium">PayPal</div>
                </div>
              </div>
            </div>

            {/* Terms and Conditions */}
            <div className="bg-card rounded-xl shadow-card p-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Terms & Conditions
              </h2>
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <Checkbox 
                    id="terms" 
                    checked={acceptedTerms}
                    onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
                    className="mt-1"
                  />
                  <label 
                    htmlFor="terms" 
                    className="text-sm text-muted-foreground leading-relaxed cursor-pointer"
                  >
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
                  </label>
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
            <div className="bg-card rounded-xl shadow-card p-6 sticky top-24">
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
                      <p className="text-sm font-medium truncate">{item.name}</p>
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

              <Separator className="my-4" />

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>${totalPrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shipping</span>
                  <span className="text-green-600">Free</span>
                </div>
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

              <p className="text-xs text-muted-foreground text-center mt-4">
                🔒 Secure payment via Stripe
              </p>
              
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
      </div>
    </Layout>
  );
};

export default Checkout;
