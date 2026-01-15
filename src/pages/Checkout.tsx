import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CreditCard, Lock, Loader2, ShieldCheck } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
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
      toast.error('Vul een geldig e-mailadres in');
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
      toast.error('Er ging iets mis. Probeer het opnieuw.');
      setIsProcessing(false);
    }
  };

  if (items.length === 0) {
    return (
      <Layout>
        <div className="container px-4 md:px-6 py-16 text-center">
          <h1 className="text-2xl font-bold mb-4">Je winkelwagen is leeg</h1>
          <Link to="/products">
            <Button>Start met winkelen</Button>
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
          Terug naar winkelwagen
        </Link>

        <h1 className="text-3xl font-bold mb-8">Checkout</h1>

        <div className="grid lg:grid-cols-5 gap-8">
          {/* Left side - Email & Info */}
          <div className="lg:col-span-3 space-y-6">
            {/* Contact */}
            <div className="bg-card rounded-xl shadow-card p-6">
              <h2 className="text-xl font-semibold mb-4">Contactgegevens</h2>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="email">E-mailadres</Label>
                  <Input 
                    id="email" 
                    type="email" 
                    required 
                    placeholder="jouw@email.nl"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Je ontvangt hier je orderbevestiging
                  </p>
                </div>
              </div>
            </div>

            {/* Payment info */}
            <div className="bg-card rounded-xl shadow-card p-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Betaling & Verzending
              </h2>
              <div className="bg-muted/30 rounded-lg p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">Veilig betalen via Stripe</p>
                    <p className="text-sm text-muted-foreground">
                      Je wordt doorgestuurd naar een beveiligde betaalpagina waar je je 
                      adres en betaalgegevens kunt invullen.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Lock className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">SSL-versleuteling</p>
                    <p className="text-sm text-muted-foreground">
                      Al je gegevens worden versleuteld verzonden.
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Payment methods */}
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground mb-2">Geaccepteerde betaalmethoden:</p>
                <div className="flex gap-2">
                  <div className="bg-muted px-3 py-1.5 rounded text-xs font-medium">Visa</div>
                  <div className="bg-muted px-3 py-1.5 rounded text-xs font-medium">Mastercard</div>
                  <div className="bg-muted px-3 py-1.5 rounded text-xs font-medium">iDEAL</div>
                  <div className="bg-muted px-3 py-1.5 rounded text-xs font-medium">PayPal</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right side - Order Summary */}
          <div className="lg:col-span-2">
            <div className="bg-card rounded-xl shadow-card p-6 sticky top-24">
              <h2 className="text-xl font-bold mb-4">Bestelling</h2>
              
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
                        €{item.price.toFixed(2)} per stuk
                      </p>
                    </div>
                    <p className="text-sm font-medium">
                      €{(item.price * item.quantity).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>

              <Separator className="my-4" />

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotaal</span>
                  <span>€{totalPrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Verzending</span>
                  <span className="text-green-600">Gratis</span>
                </div>
              </div>

              <Separator className="my-4" />

              <div className="flex justify-between text-lg font-bold">
                <span>Totaal</span>
                <span className="text-primary">€{total.toFixed(2)}</span>
              </div>

              <Button
                size="lg"
                className="w-full mt-6 gap-2"
                disabled={isProcessing || !email}
                onClick={handleStripeCheckout}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Laden...
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    Afrekenen - €{total.toFixed(2)}
                  </>
                )}
              </Button>

              <p className="text-xs text-muted-foreground text-center mt-4">
                🔒 Beveiligde betaling via Stripe
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Checkout;
