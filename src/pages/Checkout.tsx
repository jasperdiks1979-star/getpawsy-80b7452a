import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CreditCard, Lock, Loader2, ShieldCheck, FileText } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { trackBeginCheckout } from '@/lib/analytics';
import { supabase } from '@/integrations/supabase/client';

const Checkout = () => {
  const { items, totalPrice } = useCart();
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
    }
  }, [user]);

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
        <Link
          to="/cart"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to cart
        </Link>

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
                    onChange={(e) => setEmail(e.target.value)}
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
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Checkout;
