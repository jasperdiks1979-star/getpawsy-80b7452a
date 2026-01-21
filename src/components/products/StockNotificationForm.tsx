import { useState } from 'react';
import { Bell, CheckCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface StockNotificationFormProps {
  productId: string;
  productName: string;
}

export function StockNotificationForm({ productId, productName }: StockNotificationFormProps) {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !email.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from('stock_notifications')
        .insert({
          product_id: productId,
          email: email.toLowerCase().trim(),
        });

      if (error) {
        // Check for duplicate
        if (error.code === '23505') {
          toast.info('You\'re already on the notification list for this product!');
          setIsSubmitted(true);
        } else {
          throw error;
        }
      } else {
        setIsSubmitted(true);
        toast.success('We\'ll notify you when this item is back in stock!');
      }
    } catch (error) {
      console.error('Error signing up for notification:', error);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl">
        <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-green-800 dark:text-green-200">
            You're on the list!
          </p>
          <p className="text-xs text-green-600 dark:text-green-400">
            We'll email you when "{productName}" is back in stock.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl">
      <div className="flex items-center gap-2 mb-3">
        <Bell className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        <h3 className="font-semibold text-amber-800 dark:text-amber-200">
          Notify me when back in stock
        </h3>
      </div>
      <p className="text-sm text-amber-700 dark:text-amber-300 mb-3">
        Enter your email and we'll let you know when this item is available again.
      </p>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 bg-white dark:bg-gray-900 border-amber-300 dark:border-amber-700"
          disabled={isSubmitting}
        />
        <Button 
          type="submit" 
          disabled={isSubmitting}
          className="bg-amber-600 hover:bg-amber-700 text-white"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            'Notify Me'
          )}
        </Button>
      </form>
    </div>
  );
}
