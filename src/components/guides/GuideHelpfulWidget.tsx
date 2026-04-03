import { useState } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';

interface GuideHelpfulWidgetProps {
  guideSlug: string;
  className?: string;
}

/**
 * "Was this guide helpful?" micro-engagement widget.
 * Increases dwell time, interaction signals, and user satisfaction data.
 * State is local-only (no backend needed for MVP).
 */
export function GuideHelpfulWidget({ guideSlug, className = '' }: GuideHelpfulWidgetProps) {
  const [vote, setVote] = useState<'yes' | 'no' | null>(null);

  const handleVote = (choice: 'yes' | 'no') => {
    setVote(choice);
    // Store locally so widget stays voted on revisit
    try {
      localStorage.setItem(`guide-helpful-${guideSlug}`, choice);
    } catch {}
  };

  if (vote) {
    return (
      <div className={`flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm ${className}`}>
        <span className="text-primary font-medium">
          {vote === 'yes' ? '👍 Thanks for your feedback!' : '🙏 Thanks — we\'ll work on improving this.'}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-center gap-4 rounded-xl border border-border bg-card px-4 py-3 ${className}`}>
      <span className="text-sm text-muted-foreground font-medium">Was this guide helpful?</span>
      <div className="flex gap-2">
        <button
          onClick={() => handleVote('yes')}
          className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-border bg-background hover:border-primary/40 hover:text-primary transition-all"
          aria-label="Yes, this was helpful"
        >
          <ThumbsUp className="w-3.5 h-3.5" /> Yes
        </button>
        <button
          onClick={() => handleVote('no')}
          className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-border bg-background hover:border-destructive/40 hover:text-destructive transition-all"
          aria-label="No, this was not helpful"
        >
          <ThumbsDown className="w-3.5 h-3.5" /> No
        </button>
      </div>
    </div>
  );
}
