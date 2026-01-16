import { useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { motion } from 'framer-motion';
import { Package, Search, Truck, CheckCircle, Clock, MapPin, ExternalLink, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';

interface OrderResult {
  id: string;
  status: string;
  created_at: string;
  tracking_number: string | null;
  tracking_carrier: string | null;
  customer_email: string | null;
  total_amount: number;
}

const CARRIER_TRACKING_URLS: Record<string, string> = {
  usps: 'https://tools.usps.com/go/TrackConfirmAction?tLabels=',
  ups: 'https://www.ups.com/track?tracknum=',
  fedex: 'https://www.fedex.com/fedextrack/?trknbr=',
  dhl: 'https://www.dhl.com/us-en/home/tracking.html?tracking-id=',
  ontrac: 'https://www.ontrac.com/tracking/?number=',
  lasership: 'https://www.lasership.com/track/',
};

const CARRIER_LABELS: Record<string, string> = {
  usps: 'USPS',
  ups: 'UPS',
  fedex: 'FedEx',
  dhl: 'DHL',
  ontrac: 'OnTrac',
  lasership: 'LaserShip',
};

const STATUS_STEPS = [
  { key: 'pending', label: 'Order Placed', icon: Clock },
  { key: 'processing', label: 'Processing', icon: Package },
  { key: 'shipped', label: 'Shipped', icon: Truck },
  { key: 'delivered', label: 'Delivered', icon: CheckCircle },
];

const TrackOrder = () => {
  const [orderNumber, setOrderNumber] = useState('');
  const [email, setEmail] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [orderResult, setOrderResult] = useState<OrderResult | null>(null);
  const [notFound, setNotFound] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!orderNumber.trim()) {
      toast.error('Please enter an order number');
      return;
    }

    if (!email.trim() || !email.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }

    setIsSearching(true);
    setNotFound(false);
    setOrderResult(null);

    try {
      const { data, error } = await supabase
        .from('orders')
        .select('id, status, created_at, tracking_number, tracking_carrier, customer_email, total_amount')
        .eq('id', orderNumber.trim())
        .eq('customer_email', email.trim().toLowerCase())
        .single();

      if (error || !data) {
        setNotFound(true);
      } else {
        setOrderResult(data);
      }
    } catch (error) {
      console.error('Track order error:', error);
      setNotFound(true);
    } finally {
      setIsSearching(false);
    }
  };

  const getStatusIndex = (status: string) => {
    const statusMap: Record<string, number> = {
      pending: 0,
      processing: 1,
      shipped: 2,
      delivered: 3,
    };
    return statusMap[status] ?? 0;
  };

  const getTrackingUrl = (carrier: string, trackingNumber: string) => {
    const baseUrl = CARRIER_TRACKING_URLS[carrier];
    if (baseUrl) {
      return `${baseUrl}${trackingNumber}`;
    }
    return null;
  };

  return (
    <Layout>
      <div className="min-h-screen py-16 lg:py-24">
        <div className="container px-4 md:px-6 max-w-2xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            {/* Header */}
            <div className="text-center mb-12">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-6">
                <Package className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-4">
                Track Your Order
              </h1>
              <p className="text-muted-foreground text-lg">
                Enter your order number and email to track your shipment.
              </p>
            </div>

            {/* Search Form */}
            <div className="bg-card rounded-2xl shadow-card p-6 md:p-8 mb-8">
              <form onSubmit={handleSearch} className="space-y-6">
                <div>
                  <Label htmlFor="orderNumber">Order Number</Label>
                  <Input
                    id="orderNumber"
                    placeholder="e.g., abc12345-6789-..."
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    You can find this in your order confirmation email
                  </p>
                </div>
                <div>
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="The email used for your order"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <Button 
                  type="submit" 
                  size="lg" 
                  className="w-full gap-2"
                  disabled={isSearching}
                >
                  {isSearching ? (
                    'Searching...'
                  ) : (
                    <>
                      <Search className="w-4 h-4" />
                      Track Order
                    </>
                  )}
                </Button>
              </form>
            </div>

            {/* Not Found */}
            {notFound && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-6 text-center"
              >
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">Order Not Found</h3>
                <p className="text-muted-foreground mb-4">
                  We could not find an order matching that information. Please check your order 
                  number and email address and try again.
                </p>
                <Button asChild variant="outline">
                  <Link to="/contact">Contact Support</Link>
                </Button>
              </motion.div>
            )}

            {/* Order Result */}
            {orderResult && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-card rounded-2xl shadow-card p-6 md:p-8"
              >
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-semibold text-foreground">Order Status</h2>
                    <p className="text-sm text-muted-foreground">
                      Order #{orderResult.id.substring(0, 8)}...
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Order Date</p>
                    <p className="font-medium">
                      {new Date(orderResult.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {/* Status Timeline */}
                <div className="mb-8">
                  <div className="flex items-center justify-between relative">
                    {/* Progress Line */}
                    <div className="absolute top-5 left-0 right-0 h-1 bg-muted">
                      <div 
                        className="h-full bg-primary transition-all duration-500"
                        style={{ 
                          width: `${(getStatusIndex(orderResult.status) / (STATUS_STEPS.length - 1)) * 100}%` 
                        }}
                      />
                    </div>
                    
                    {STATUS_STEPS.map((step, index) => {
                      const isCompleted = index <= getStatusIndex(orderResult.status);
                      const isCurrent = index === getStatusIndex(orderResult.status);
                      
                      return (
                        <div key={step.key} className="relative flex flex-col items-center z-10">
                          <div 
                            className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              isCompleted 
                                ? 'bg-primary text-primary-foreground' 
                                : 'bg-muted text-muted-foreground'
                            } ${isCurrent ? 'ring-4 ring-primary/20' : ''}`}
                          >
                            <step.icon className="w-5 h-5" />
                          </div>
                          <span className={`text-xs mt-2 ${
                            isCompleted ? 'text-foreground font-medium' : 'text-muted-foreground'
                          }`}>
                            {step.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Tracking Info */}
                {orderResult.tracking_number && (
                  <div className="bg-muted/30 rounded-xl p-4 mb-6">
                    <div className="flex items-start gap-4">
                      <Truck className="w-6 h-6 text-primary flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <h3 className="font-semibold text-foreground mb-1">Tracking Information</h3>
                        <p className="text-sm text-muted-foreground mb-2">
                          Carrier: {CARRIER_LABELS[orderResult.tracking_carrier || 'usps'] || orderResult.tracking_carrier}
                        </p>
                        <p className="text-sm font-mono text-foreground mb-3">
                          {orderResult.tracking_number}
                        </p>
                        {orderResult.tracking_carrier && getTrackingUrl(orderResult.tracking_carrier, orderResult.tracking_number) && (
                          <Button asChild size="sm" variant="outline" className="gap-2">
                            <a 
                              href={getTrackingUrl(orderResult.tracking_carrier, orderResult.tracking_number)!}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Track on {CARRIER_LABELS[orderResult.tracking_carrier]}
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* No Tracking Yet */}
                {!orderResult.tracking_number && orderResult.status !== 'delivered' && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mb-6">
                    <div className="flex items-start gap-3">
                      <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">
                          Tracking Not Yet Available
                        </p>
                        <p className="text-sm text-amber-700 dark:text-amber-300">
                          Your order is being processed. Tracking information will be available once your order ships.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Order Total */}
                <div className="border-t pt-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Order Total</span>
                    <span className="font-semibold text-foreground">
                      ${orderResult.total_amount.toFixed(2)}
                    </span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Help Section */}
            <div className="mt-12 text-center">
              <h3 className="text-lg font-semibold text-foreground mb-4">Need Help?</h3>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button asChild variant="outline">
                  <Link to="/faq">View FAQ</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/contact">Contact Support</Link>
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </Layout>
  );
};

export default TrackOrder;
