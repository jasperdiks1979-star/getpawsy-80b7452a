import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, X } from 'lucide-react';

const US_STATES = [
  'California', 'Texas', 'Florida', 'New York', 'Pennsylvania',
  'Illinois', 'Ohio', 'Georgia', 'North Carolina', 'Michigan',
  'New Jersey', 'Virginia', 'Washington', 'Arizona', 'Massachusetts',
  'Tennessee', 'Indiana', 'Missouri', 'Maryland', 'Wisconsin',
  'Colorado', 'Minnesota', 'South Carolina', 'Alabama', 'Oregon',
];

const TIME_AGO = [
  '2 minutes ago', '5 minutes ago', '12 minutes ago', '23 minutes ago',
  '1 hour ago', '2 hours ago', '3 hours ago', '4 hours ago',
];

const PRODUCT_SNIPPETS = [
  'a Dog Toy', 'a Cat Tree', 'a Slow Feeder Bowl', 'a Pet Bed',
  'a Cat Scratching Post', 'a Dog Harness', 'a Cat Litter Box',
  'a Dog Collar', 'a Pet Carrier', 'an Interactive Toy',
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Soft recent purchase notification — shows max once per 30 seconds.
 * Uses randomized US states and time offsets. No real data exposed.
 */
export const RecentPurchaseNotification: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [notification, setNotification] = useState({ state: '', time: '', product: '' });

  const showNotification = useCallback(() => {
    setNotification({
      state: pickRandom(US_STATES),
      time: pickRandom(TIME_AGO),
      product: pickRandom(PRODUCT_SNIPPETS),
    });
    setVisible(true);
    // Auto-hide after 5 seconds
    setTimeout(() => setVisible(false), 5000);
  }, []);

  useEffect(() => {
    // Initial delay: 15–25 seconds after page load
    const initialDelay = 15000 + Math.random() * 10000;
    const initialTimer = setTimeout(showNotification, initialDelay);

    // Recurring: every 35–60 seconds (respects 30s minimum)
    const interval = setInterval(() => {
      const delay = 35000 + Math.random() * 25000;
      setTimeout(showNotification, delay);
    }, 60000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [showNotification]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 20, x: 0 }}
          animate={{ opacity: 1, y: 0, x: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed bottom-4 left-4 z-40 max-w-xs bg-card border border-border rounded-xl shadow-lg p-3 pr-8"
        >
          <button
            onClick={() => setVisible(false)}
            className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <ShoppingBag className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground leading-tight">
                Someone in {notification.state} purchased {notification.product}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {notification.time}
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
