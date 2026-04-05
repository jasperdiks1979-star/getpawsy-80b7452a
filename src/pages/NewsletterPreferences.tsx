import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useSearchParams, Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { motion } from 'framer-motion';
import { 
  Settings, 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  ArrowLeft,
  Package,
  Heart,
  Gift,
  Sparkles,
  Save
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type PageStatus = 'loading' | 'ready' | 'saving' | 'saved' | 'error' | 'invalid';

interface Preferences {
  product_updates: boolean;
  pet_care_tips: boolean;
  promotions: boolean;
  new_arrivals: boolean;
}

const preferenceOptions = [
  {
    key: 'product_updates' as keyof Preferences,
    icon: Package,
    title: 'Product Updates',
    description: 'Get notified about product improvements and restocks',
    color: 'text-blue-500'
  },
  {
    key: 'pet_care_tips' as keyof Preferences,
    icon: Heart,
    title: 'Pet Care Tips',
    description: 'Receive helpful tips and guides for your furry friends',
    color: 'text-pink-500'
  },
  {
    key: 'promotions' as keyof Preferences,
    icon: Gift,
    title: 'Promotions & Deals',
    description: 'Be the first to know about sales and exclusive offers',
    color: 'text-green-500'
  },
  {
    key: 'new_arrivals' as keyof Preferences,
    icon: Sparkles,
    title: 'New Arrivals',
    description: 'Discover new products added to our collection',
    color: 'text-purple-500'
  }
];

const NewsletterPreferences = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<PageStatus>('loading');
  const [email, setEmail] = useState<string>('');
  const [isActive, setIsActive] = useState<boolean>(true);
  const [preferences, setPreferences] = useState<Preferences>({
    product_updates: true,
    pet_care_tips: true,
    promotions: true,
    new_arrivals: true
  });
  const [initialPreferences, setInitialPreferences] = useState<Preferences | null>(null);

  const token = searchParams.get('token');

  useEffect(() => {
    if (!token) {
      setStatus('invalid');
      return;
    }

    const fetchPreferences = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('newsletter-preferences', {
          body: { token, action: 'get' },
        });

        if (error) throw error;

        if (data.success) {
          setEmail(data.email);
          setPreferences(data.preferences);
          setInitialPreferences(data.preferences);
          setIsActive(data.is_active);
          setStatus('ready');
        } else {
          throw new Error(data.error || 'Failed to fetch preferences');
        }
      } catch (error: any) {
        console.error('Error fetching preferences:', error);
        setStatus('invalid');
      }
    };

    fetchPreferences();
  }, [token]);

  const handleToggle = (key: keyof Preferences) => {
    setPreferences(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleSelectAll = () => {
    setPreferences({
      product_updates: true,
      pet_care_tips: true,
      promotions: true,
      new_arrivals: true
    });
  };

  const handleDeselectAll = () => {
    setPreferences({
      product_updates: false,
      pet_care_tips: false,
      promotions: false,
      new_arrivals: false
    });
  };

  const hasChanges = initialPreferences && JSON.stringify(preferences) !== JSON.stringify(initialPreferences);

  const handleSave = async () => {
    if (!token) return;

    setStatus('saving');

    try {
      const { data, error } = await supabase.functions.invoke('newsletter-preferences', {
        body: { token, action: 'update', preferences },
      });

      if (error) throw error;

      setInitialPreferences(preferences);
      setStatus('saved');
      toast.success('Preferences saved successfully!');
      
      // Reset to ready after showing saved state
      setTimeout(() => setStatus('ready'), 2000);
    } catch (error: any) {
      console.error('Error saving preferences:', error);
      toast.error('Failed to save preferences. Please try again.');
      setStatus('ready');
    }
  };

  if (status === 'loading') {
    return (
      <Layout>
        <Helmet><meta name="robots" content="noindex, nofollow" /></Helmet>
        <div className="min-h-screen py-20 lg:py-32">
          <div className="container px-4 md:px-6 max-w-2xl mx-auto text-center">
            <Loader2 className="w-16 h-16 text-primary mx-auto mb-6 animate-spin" />
            <div className="text-2xl font-display font-bold text-foreground mb-2">
              Loading preferences...
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (status === 'invalid') {
    return (
      <Layout>
        <div className="min-h-screen py-20 lg:py-32">
          <div className="container px-4 md:px-6 max-w-2xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <div className="w-20 h-20 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="w-10 h-10 text-yellow-600" />
              </div>
              <h1 className="text-3xl font-display font-bold text-foreground mb-4">
                Invalid Link
              </h1>
              <p className="text-muted-foreground text-lg mb-8">
                This preference link appears to be invalid or expired.
                Please use the link from your most recent newsletter email.
              </p>
              <Button asChild size="lg">
                <Link to="/">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Homepage
                </Link>
              </Button>
            </motion.div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Helmet><meta name="robots" content="noindex, nofollow" /></Helmet>
      <div className="min-h-screen py-20 lg:py-32">
        <div className="container px-4 md:px-6 max-w-2xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {/* Header */}
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Settings className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-3xl font-display font-bold text-foreground mb-2">
                Newsletter Preferences
              </h1>
              <p className="text-muted-foreground">
                Manage your email preferences for <strong>{email}</strong>
              </p>
              {!isActive && (
                <div className="mt-4 p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                  <p className="text-yellow-800 dark:text-yellow-200 text-sm">
                    You're currently unsubscribed. <Link to={`/unsubscribe?token=${token}`} className="underline font-medium">Re-subscribe</Link> to receive emails.
                  </p>
                </div>
              )}
            </div>

            {/* Preference Cards */}
            <Card className="mb-6">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Email Categories</CardTitle>
                    <CardDescription>Choose which types of emails you'd like to receive</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={handleSelectAll}>
                      Select All
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleDeselectAll}>
                      Deselect All
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {preferenceOptions.map((option) => {
                  const Icon = option.icon;
                  return (
                    <motion.div
                      key={option.key}
                      className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${
                        preferences[option.key] 
                          ? 'bg-primary/5 border-primary/20' 
                          : 'bg-muted/30 border-border'
                      }`}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full bg-background flex items-center justify-center ${option.color}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div>
                          <Label htmlFor={option.key} className="text-base font-medium cursor-pointer">
                            {option.title}
                          </Label>
                          <p className="text-sm text-muted-foreground">
                            {option.description}
                          </p>
                        </div>
                      </div>
                      <Switch
                        id={option.key}
                        checked={preferences[option.key]}
                        onCheckedChange={() => handleToggle(option.key)}
                        disabled={!isActive}
                      />
                    </motion.div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Save Button */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                onClick={handleSave} 
                size="lg" 
                disabled={!hasChanges || status === 'saving' || !isActive}
                className="gap-2"
              >
                {status === 'saving' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : status === 'saved' ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Saved!
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Preferences
                  </>
                )}
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Homepage
                </Link>
              </Button>
            </div>

            {/* Unsubscribe Link */}
            <p className="text-center text-sm text-muted-foreground mt-8">
              Want to stop all emails?{' '}
              <Link 
                to={`/unsubscribe?token=${token}`} 
                className="text-destructive hover:underline"
              >
                Unsubscribe completely
              </Link>
            </p>
          </motion.div>
        </div>
      </div>
    </Layout>
  );
};

export default NewsletterPreferences;
