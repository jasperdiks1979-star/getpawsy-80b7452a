/**
 * PinterestLandingBanner — subtle continuity strip shown when a visitor
 * arrives from a Pinterest pin (?utm_source=pinterest or ?hook=...).
 *
 * Goal: reinforce the pin → page promise within the first 2 seconds and
 * lower bounce rate by acknowledging the source. No hype, no fake urgency.
 */
import { Sparkles } from 'lucide-react';

interface PinterestLandingBannerProps {
  hook?: string | null;
}

const HOOK_LABEL: Record<string, string> = {
  problem: 'You found the fix',
  solution: "Here's the easier way",
  comparison: "Here's what owners are switching to",
  transformation: 'See the difference for yourself',
};

export function PinterestLandingBanner({ hook }: PinterestLandingBannerProps) {
  const label = hook && HOOK_LABEL[hook] ? HOOK_LABEL[hook] : 'Welcome from Pinterest';

  return (
    <div
      role="note"
      aria-label="Continuity from Pinterest"
      className="flex items-center gap-2 rounded-lg bg-primary/8 border border-primary/20 px-3 py-2 text-xs text-foreground/90"
    >
      <Sparkles className="w-3.5 h-3.5 text-primary flex-shrink-0" aria-hidden="true" />
      <span className="font-medium">{label}.</span>
      <span className="text-muted-foreground hidden sm:inline">
        Free US shipping on eligible orders · 30-day returns
      </span>
    </div>
  );
}

export default PinterestLandingBanner;