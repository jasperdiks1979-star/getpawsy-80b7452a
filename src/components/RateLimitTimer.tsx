import { useState, useEffect } from "react";
import { AlertCircle, Clock, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface RateLimitTimerProps {
  isRateLimited: boolean;
  onRetry: () => void;
  rateLimitDuration?: number; // Duration in seconds, default 300 (5 minutes)
}

const RATE_LIMIT_KEY = "cj_rate_limit_expires";

export function RateLimitTimer({ 
  isRateLimited, 
  onRetry, 
  rateLimitDuration = 300 
}: RateLimitTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [expiryTime, setExpiryTime] = useState<number | null>(null);
  const [showTimer, setShowTimer] = useState(false);

  // On mount, check if there's an existing rate limit in localStorage
  useEffect(() => {
    const stored = localStorage.getItem(RATE_LIMIT_KEY);
    if (stored) {
      const storedExpiry = parseInt(stored, 10);
      const now = Date.now();
      if (storedExpiry > now) {
        setExpiryTime(storedExpiry);
        setShowTimer(true);
      } else {
        // Expired, clean up
        localStorage.removeItem(RATE_LIMIT_KEY);
      }
    }
  }, []);

  // When rate limited, store the expiry time
  useEffect(() => {
    if (isRateLimited) {
      const stored = localStorage.getItem(RATE_LIMIT_KEY);
      const now = Date.now();
      
      if (stored) {
        const storedExpiry = parseInt(stored, 10);
        // If stored expiry is still in the future, use it
        if (storedExpiry > now) {
          setExpiryTime(storedExpiry);
          setShowTimer(true);
          return;
        }
      }
      
      // Otherwise set a new expiry time
      const newExpiry = now + (rateLimitDuration * 1000);
      localStorage.setItem(RATE_LIMIT_KEY, newExpiry.toString());
      setExpiryTime(newExpiry);
      setShowTimer(true);
    }
  }, [isRateLimited, rateLimitDuration]);

  // Countdown timer
  useEffect(() => {
    if (!expiryTime) return;

    const updateTimer = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((expiryTime - now) / 1000));
      setTimeRemaining(remaining);

      if (remaining <= 0) {
        // Timer expired, but keep showing so user can click retry
        localStorage.removeItem(RATE_LIMIT_KEY);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [expiryTime]);

  // Don't show if not showing timer
  if (!showTimer && !isRateLimited) {
    return null;
  }

  const progress = ((rateLimitDuration - timeRemaining) / rateLimitDuration) * 100;
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  const isExpired = timeRemaining <= 0;

  const handleRetry = () => {
    localStorage.removeItem(RATE_LIMIT_KEY);
    setExpiryTime(null);
    setTimeRemaining(0);
    setShowTimer(false);
    onRetry();
  };

  return (
    <Alert variant={isExpired ? "default" : "destructive"} className="mb-6">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle className="flex items-center gap-2">
        {isExpired ? (
          "Rate limit expired - Ready to retry!"
        ) : (
          <>
            <Clock className="h-4 w-4" />
            API Rate Limit Active
          </>
        )}
      </AlertTitle>
      <AlertDescription className="mt-3 space-y-3">
        {isExpired ? (
          <div className="flex items-center gap-3">
            <p>The cooldown period has ended. You can now retry loading the catalog.</p>
            <Button onClick={handleRetry} size="sm" className="ml-auto">
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry Now
            </Button>
          </div>
        ) : (
          <>
            <p>
              CJ Dropshipping API rate limit reached. Please wait before trying again.
            </p>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Cooldown remaining:</span>
                <span className="font-mono font-bold">
                  {minutes}:{seconds.toString().padStart(2, "0")}
                </span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
            <p className="text-sm text-muted-foreground">
              💡 Tip: Avoid refreshing the page or clicking retry until the timer expires.
            </p>
          </>
        )}
      </AlertDescription>
    </Alert>
  );
}
