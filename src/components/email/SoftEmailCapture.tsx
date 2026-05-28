import { useState } from 'react';
import { Mail, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { trackNewsletterSignup } from '@/lib/analytics';
import { toast } from 'sonner';
import { getConversionFlag } from '@/lib/conversionFlags';

interface SoftEmailCaptureProps {
  /** The context where this capture appears */
  variant: 'blog' | 'collection';
  /** Optional custom headline */
  headline?: string;
  /** Optional custom description */
  description?: string;
  /** Optional className for styling */
  className?: string;
}

/**
 * Soft, trust-based email capture component for organic SEO traffic.
 * 
 * Design principles:
 * - No popups on page load
 * - No aggressive discounts
 * - Trust-first language
 * - Calm, non-salesy tone
 */
export function SoftEmailCapture({ 
  variant, 
  headline, 
  description,
  className = ''
}: SoftEmailCaptureProps) {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const premium = getConversionFlag('premiumNewsletter');

  // Default copy based on variant
  const defaultContent = {
    blog: {
      headline: 'Get helpful pet care tips',
      description: 'Practical advice and product guides — no spam, just helpful content for pet parents.',
    },
    collection: {
      headline: 'Stay updated on new arrivals',
      description: 'Get updates on new pet essentials and helpful guides.',
    },
  };

  const content = {
    headline: headline || defaultContent[variant].headline,
    description: description || defaultContent[variant].description,
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !email.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }

    setIsLoading(true);

    try {
      // Add to newsletter subscribers
      const { error } = await supabase
        .from('newsletter_subscribers')
        .upsert(
          { 
            email,
            preferences: {
              promotions: false, // Soft capture = no promos by default
              new_arrivals: true,
              pet_care_tips: true,
              product_updates: true,
            }
          },
          { onConflict: 'email' }
        );

      if (error) {
        if (error.code === '23505') {
          toast.info('You\'re already subscribed!');
          setIsSuccess(true);
        } else {
          throw error;
        }
      } else {
        // Add to SEO nurture queue for the 3-email flow
        await supabase
          .from('seo_nurture_queue')
          .upsert(
            {
              email,
              signup_source: variant,
              welcome_sent: true, // Welcome email sent immediately
              welcome_sent_at: new Date().toISOString(),
            },
            { onConflict: 'email' }
          );

        // Send welcome email immediately via edge function
        supabase.functions.invoke('send-seo-nurture-email', {
          body: { email, emailType: 'welcome' }
        }).catch(err => console.error('Welcome email error:', err));

        toast.success('Thanks for subscribing!');
        trackNewsletterSignup(email);
        setIsSuccess(true);
      }
      
      setEmail('');
    } catch (error) {
      console.error('Newsletter signup error:', error);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className={`${premium ? 'border border-border/60' : 'rounded-2xl bg-primary/5 border border-primary/10'} p-6 md:p-8 text-center ${className}`}>
        <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full mb-4 ${premium ? 'border border-border/60 text-foreground/70' : 'bg-primary/10 text-primary'}`}>
          <Sparkles className="w-6 h-6" />
        </div>
        <h3 className={`mb-2 ${premium ? 'font-display text-[17px] tracking-tight' : 'text-lg font-semibold'}`}>You're all set!</h3>
        <p className="text-muted-foreground text-sm">
          We'll send you helpful tips and updates — no spam, ever.
        </p>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl bg-muted/40 border p-6 md:p-8 ${className}`}>
      <div className="flex flex-col md:flex-row md:items-center gap-6">
        {/* Icon */}
        <div className="flex-shrink-0 hidden md:flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 text-primary">
          <Mail className="w-7 h-7" />
        </div>

        {/* Content */}
        <div className="flex-grow">
          <h3 className="text-lg font-semibold mb-1">
            {content.headline}
          </h3>
          <p className="text-muted-foreground text-sm">
            {content.description}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-shrink-0 w-full md:w-auto">
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="Your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-w-[200px] md:min-w-[240px]"
              disabled={isLoading}
              required
            />
            <Button type="submit" disabled={isLoading} className="whitespace-nowrap">
              {isLoading ? 'Joining...' : 'Subscribe'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
