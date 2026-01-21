import { useState, useEffect } from 'react';
import { Clock, Truck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ShippingCountdownProps {
  cutoffHour?: number; // Hour in 24h format (default: 15 = 3 PM)
  className?: string;
}

export const ShippingCountdown = ({ cutoffHour = 15, className = '' }: ShippingCountdownProps) => {
  const [timeLeft, setTimeLeft] = useState<{ hours: number; minutes: number; seconds: number } | null>(null);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date();
      const cutoff = new Date();
      cutoff.setHours(cutoffHour, 0, 0, 0);

      // If past cutoff, set to tomorrow's cutoff
      if (now >= cutoff) {
        setIsExpired(true);
        return null;
      }

      const diff = cutoff.getTime() - now.getTime();
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      return { hours, minutes, seconds };
    };

    // Initial calculation
    setTimeLeft(calculateTimeLeft());

    // Update every second
    const interval = setInterval(() => {
      const result = calculateTimeLeft();
      setTimeLeft(result);
    }, 1000);

    return () => clearInterval(interval);
  }, [cutoffHour]);

  if (isExpired) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`flex items-center gap-2 p-3 rounded-xl bg-muted/50 border border-border ${className}`}
      >
        <Truck className="h-5 w-5 text-muted-foreground flex-shrink-0" />
        <p className="text-sm text-muted-foreground">
          Order tomorrow before {cutoffHour > 12 ? cutoffHour - 12 : cutoffHour}:00 {cutoffHour >= 12 ? 'PM' : 'AM'} for same-day shipping
        </p>
      </motion.div>
    );
  }

  if (!timeLeft) return null;

  const isUrgent = timeLeft.hours < 2;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-center gap-3 p-3 rounded-xl ${
        isUrgent 
          ? 'bg-gradient-to-r from-warning/10 to-destructive/10 border border-warning/30' 
          : 'bg-gradient-to-r from-success/10 to-primary/10 border border-success/30'
      } ${className}`}
    >
      <div className={`p-2 rounded-lg ${isUrgent ? 'bg-warning/20' : 'bg-success/20'}`}>
        <Clock className={`h-5 w-5 ${isUrgent ? 'text-warning animate-pulse' : 'text-success'}`} />
      </div>
      
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${isUrgent ? 'text-warning' : 'text-foreground'}`}>
          Order within{' '}
          <AnimatePresence mode="wait">
            <motion.span
              key={`${timeLeft.hours}-${timeLeft.minutes}-${timeLeft.seconds}`}
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              transition={{ duration: 0.2 }}
              className="inline-flex items-center gap-1 font-bold"
            >
              {timeLeft.hours > 0 && (
                <span className="tabular-nums">{timeLeft.hours}h</span>
              )}
              <span className="tabular-nums">{timeLeft.minutes}m</span>
              <span className="tabular-nums text-xs opacity-75">{timeLeft.seconds}s</span>
            </motion.span>
          </AnimatePresence>
        </p>
        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
          <Truck className="h-3 w-3" />
          for shipping today
        </p>
      </div>

      {isUrgent && (
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="px-2 py-1 rounded-full bg-warning/20 text-warning text-xs font-semibold"
        >
          Hurry!
        </motion.div>
      )}
    </motion.div>
  );
};
