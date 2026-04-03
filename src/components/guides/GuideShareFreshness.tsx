import { Share2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface GuideShareFreshnessProps {
  title: string;
  url: string;
  updatedAt: string;
  className?: string;
}

/**
 * Share buttons + content freshness signal for guide pages.
 * Sends trust signals to both users and Google (dateModified alignment).
 */
export function GuideShareFreshness({ title, url, updatedAt, className = '' }: GuideShareFreshnessProps) {
  const year = new Date(updatedAt).getFullYear() || 2026;
  const formattedDate = new Date(updatedAt).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const handleShare = async () => {
    const shareUrl = `https://getpawsy.pet${url}`;
    if (navigator.share) {
      try {
        await navigator.share({ title, url: shareUrl });
      } catch {
        // User cancelled
      }
    } else {
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Link copied to clipboard');
    }
  };

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 ${className}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <RefreshCw className="w-3.5 h-3.5 text-primary" />
        <span>
          Last updated: <span className="font-semibold text-foreground">{formattedDate}</span>
          {' · '}Updated with latest {year} recommendations
        </span>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleShare}
        className="h-8 text-xs gap-1.5"
      >
        <Share2 className="w-3.5 h-3.5" />
        Share this guide
      </Button>
    </div>
  );
}
