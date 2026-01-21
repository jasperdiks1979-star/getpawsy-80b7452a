import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle, Package, ArrowRight, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { useCart } from '@/contexts/CartContext';
import { trackPurchase } from '@/lib/analytics';

const PaymentSuccess = () => {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const { items, totalPrice, clearCart } = useCart();
  const [tracked, setTracked] = useState(false);

  useEffect(() => {
    // Track purchase conversion and clear cart only once
    if (!tracked && sessionId && items.length > 0) {
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
      clearCart(true); // Mark as recovered
      setTracked(true);
    } else if (!tracked && sessionId && items.length === 0) {
      // Cart already cleared (e.g., page refresh after purchase)
      setTracked(true);
    }
  }, [sessionId, items, totalPrice, clearCart, tracked]);

  if (!sessionId) {
    return (
      <Layout>
        <div className="container px-4 md:px-6 py-16 text-center">
          <h1 className="text-2xl font-bold mb-4">Invalid Session</h1>
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
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="w-24 h-24 mx-auto mb-8 rounded-full bg-green-100 flex items-center justify-center"
          >
            <CheckCircle className="w-12 h-12 text-green-600" />
          </motion.div>

          <h1 className="text-3xl md:text-4xl font-display font-bold mb-4">
            Thank You for Your Order! 🎉
          </h1>
          
          <p className="text-lg text-muted-foreground mb-8">
            Your order has been successfully placed. You'll receive a confirmation email 
            shortly with your order details.
          </p>

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
