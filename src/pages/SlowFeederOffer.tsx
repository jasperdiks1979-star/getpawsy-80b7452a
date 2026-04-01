import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { Check, Gift, Heart, Brain, Timer, Shield, Truck, Star, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { trackNewsletterSignup, trackEvent } from '@/lib/analytics';
import { useNavigate, useLocation } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { useUTMTracking, type UTMParams } from '@/hooks/useUTMTracking';

const DISCOUNT_CODE = 'SLOWFEEDER25';

export default function SlowFeederOffer() {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const utmParams = useUTMTracking();

  // Track page view with UTM params
  useEffect(() => {
    if (Object.keys(utmParams).length > 0) {
      trackEvent('lead_magnet_view', {
        page: 'slow_feeder_offer',
        ...utmParams
      });
    }
  }, [utmParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !email.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }

    setIsSubmitting(true);

    try {
      // Build preferences with UTM tracking data
      const preferences = {
        dogs: true,
        promotions: true,
        new_products: true,
        lead_magnet: 'slow_feeder_25',
        signup_source: 'slow_feeder_landing_page',
        ...(utmParams.utm_source && { utm_source: utmParams.utm_source }),
        ...(utmParams.utm_medium && { utm_medium: utmParams.utm_medium }),
        ...(utmParams.utm_campaign && { utm_campaign: utmParams.utm_campaign }),
        ...(utmParams.utm_term && { utm_term: utmParams.utm_term }),
        ...(utmParams.utm_content && { utm_content: utmParams.utm_content }),
        ...(utmParams.gclid && { gclid: utmParams.gclid }),
        ...(utmParams.fbclid && { fbclid: utmParams.fbclid }),
        ...(utmParams.landing_page && { landing_page: utmParams.landing_page }),
        signup_timestamp: new Date().toISOString()
      };

      const { error } = await supabase
        .from('newsletter_subscribers')
        .insert({ 
          email, 
          is_active: true,
          preferences
        });

      if (error && error.code !== '23505') {
        throw error;
      }

      setIsSuccess(true);
      
      // Track conversion with UTM params
      trackEvent('lead_magnet_signup', {
        page: 'slow_feeder_landing_page',
        discount_code: DISCOUNT_CODE,
        ...utmParams
      });
      trackNewsletterSignup('slow_feeder_landing_page');
      localStorage.setItem('getpawsy_discount_code', DISCOUNT_CODE);

      // Send confirmation email
      try {
        await supabase.functions.invoke('send-newsletter-confirmation', {
          body: { 
            email,
            discountCode: DISCOUNT_CODE,
            source: 'slow_feeder_landing_page'
          }
        });
      } catch (emailError) {
        console.error('Failed to send confirmation email:', emailError);
      }
    } catch (error) {
      console.error('Newsletter signup error:', error);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyDiscountCode = () => {
    navigator.clipboard.writeText(DISCOUNT_CODE);
    toast.success('Discount code copied!');
  };

  const goToSlowFeeders = () => {
    navigate('/collections/best-slow-feeder-dog-bowls');
  };

  const benefits = [
    { 
      icon: Heart, 
      title: 'Prevents Bloating',
      description: 'Reduces the risk of dangerous bloat and digestive issues'
    },
    { 
      icon: Brain, 
      title: 'Mental Stimulation',
      description: 'Turns mealtime into an engaging puzzle for your dog'
    },
    { 
      icon: Timer, 
      title: 'Slows Eating 10x',
      description: 'Extends mealtime from seconds to healthy minutes'
    },
  ];

  const features = [
    'BPA-free, food-safe materials',
    'Non-slip rubber base',
    'Dishwasher safe',
    'Works for dogs & cats',
    'Multiple sizes available',
    'Vet recommended design',
  ];

  return (
    <Layout>
      <Helmet>
        <title>25% OFF Slow Feeder Bowls | GetPawsy Special Offer</title>
        <meta 
          name="description" 
          content="Get 25% off our bestselling slow feeder bowls. Prevent bloating, improve digestion, and provide mental stimulation for your dog. Limited time offer!"
        />
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="min-h-screen">
        {/* Hero Section */}
        <section className="relative py-16 md:py-24 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 via-emerald-500/5 to-teal-500/10" />
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMyMjIyMjIiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PHBhdGggZD0iTTM2IDM0YzAtMi4yMS0xLjc5LTQtNC00cy00IDEuNzktNCA0IDEuNzkgNCA0IDQgNC0xLjc5IDQtNHoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-50" />
          
          <div className="container relative z-10">
            <div className="max-w-4xl mx-auto text-center">
              {/* Badge */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <Badge 
                  className="mb-6 px-4 py-2 text-sm bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300 border-green-200 dark:border-green-800"
                >
                  <Gift className="w-4 h-4 mr-2" />
                  LIMITED TIME: First-Purchase Exclusive
                </Badge>
              </motion.div>

              {/* Headline */}
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="text-4xl md:text-6xl font-display font-bold mb-6"
              >
                Get <span className="text-green-600 dark:text-green-400">25% OFF</span>
                <br />
                Slow Feeder Bowls 🥣
              </motion.h1>

              {/* Subheadline */}
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto"
              >
                Is your dog a fast eater? Our slow feeder bowls help prevent bloating, 
                improve digestion, and provide mental stimulation during mealtime.
              </motion.p>

              {/* Form or Success */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="max-w-md mx-auto"
              >
                {!isSuccess ? (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="flex gap-2">
                      <Input
                        type="email"
                        placeholder="Enter your email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="h-14 rounded-xl text-base"
                        disabled={isSubmitting}
                      />
                      <Button
                        type="submit"
                        className="h-14 px-6 rounded-xl text-base font-semibold bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 whitespace-nowrap"
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? 'Sending...' : 'Get 25% Off'}
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Join pet owners across the US. No spam, unsubscribe anytime.
                    </p>
                  </form>
                ) : (
                  <div className="p-6 bg-card rounded-2xl border shadow-lg">
                    <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                      <Check className="w-7 h-7 text-green-600 dark:text-green-400" />
                    </div>
                    
                    <h3 className="text-xl font-bold mb-2">Your Code is Ready! 🎉</h3>
                    <p className="text-muted-foreground mb-4 text-sm">
                      Use this code at checkout for 25% off:
                    </p>

                    <button
                      onClick={copyDiscountCode}
                      className="group w-full py-4 px-6 bg-gradient-to-r from-green-100 to-emerald-100 dark:from-green-950/50 dark:to-emerald-950/50 hover:from-green-200 hover:to-emerald-200 border-2 border-dashed border-green-500 rounded-xl transition-colors mb-4"
                    >
                      <span className="text-2xl font-mono font-bold text-green-600 dark:text-green-400 tracking-wider">
                        {DISCOUNT_CODE}
                      </span>
                      <span className="block text-xs text-muted-foreground mt-1 group-hover:text-green-600 transition-colors">
                        Click to copy
                      </span>
                    </button>

                    <Button
                      onClick={goToSlowFeeders}
                      className="w-full bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
                    >
                      Shop Slow Feeder Bowls
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                )}
              </motion.div>
            </div>
          </div>
        </section>

        {/* Benefits Section */}
        <section className="py-16 bg-muted/30">
          <div className="container">
            <h2 className="text-2xl md:text-3xl font-display font-bold text-center mb-12">
              Why Your Dog Needs a Slow Feeder Bowl
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
              {benefits.map((benefit, index) => (
                <motion.div
                  key={benefit.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  viewport={{ once: true }}
                  className="text-center p-6 bg-card rounded-2xl border shadow-sm"
                >
                  <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <benefit.icon className="w-7 h-7 text-green-600 dark:text-green-400" />
                  </div>
                  <h3 className="font-bold text-lg mb-2">{benefit.title}</h3>
                  <p className="text-muted-foreground text-sm">{benefit.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-16">
          <div className="container">
            <div className="max-w-4xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                <div>
                  <h2 className="text-2xl md:text-3xl font-display font-bold mb-6">
                    Premium Quality, Happy Pets
                  </h2>
                  <div className="grid grid-cols-1 gap-3">
                    {features.map((feature) => (
                      <div key={feature} className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                          <Check className="w-3 h-3 text-green-600 dark:text-green-400" />
                        </div>
                        <span className="text-muted-foreground">{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-950/30 dark:to-emerald-950/30 rounded-2xl p-8">
                  <div className="text-center">
                    <div className="text-6xl mb-4">🥣</div>
                    <div className="flex items-center justify-center gap-1 mb-4">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star key={star} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                      ))}
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      "My dog used to finish his food in 30 seconds. Now mealtime is a 10-minute adventure!"
                    </p>
                    <p className="font-medium">— Sarah M., verified buyer</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Trust Badges */}
        <section className="py-12 bg-muted/30">
          <div className="container">
            <div className="flex flex-wrap justify-center gap-8 text-center">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Shield className="w-5 h-5" />
                <span>30-Day Returns</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Truck className="w-5 h-5" />
                <span>Free Shipping on Orders $35+</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Star className="w-5 h-5" />
                <span>Popular with Pet Owners</span>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-16">
          <div className="container">
            <div className="max-w-2xl mx-auto text-center">
              <h2 className="text-2xl md:text-3xl font-display font-bold mb-4">
                Ready to Improve Your Dog's Digestion?
              </h2>
              <p className="text-muted-foreground mb-6">
                Don't miss out on this exclusive 25% discount. Your dog's health is worth it!
              </p>
              {!isSuccess ? (
                <Button
                  onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                  size="lg"
                  className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
                >
                  Get My 25% Discount
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <Button
                  onClick={goToSlowFeeders}
                  size="lg"
                  className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
                >
                  Shop Now with 25% Off
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              )}
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
}
