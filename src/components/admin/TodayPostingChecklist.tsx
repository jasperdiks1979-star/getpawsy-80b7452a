import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Clock, Flame, Sparkles, CheckCircle2, ArrowDown } from 'lucide-react';

type Post = {
  id: string;
  product_name: string;
  post_variant: string;
  caption: string;
  hashtags: string[];
  media_urls: string[] | null;
  status: string;
};

interface Props {
  posts: Post[];
  onSelectPost: (postId: string) => void;
}

/**
 * US Prime-Time slots (NL local time → EST conversion)
 * - 12pm EST (lunch US East) = 18:00 NL (winter) / 17:00 NL (summer)
 * - 7pm EST (evening US East) = 01:00 NL (winter) / 00:00 NL (summer)
 * - 9pm EST (prime time)      = 03:00 NL (winter) / 02:00 NL (summer)
 *
 * For practicality we use TikTok's in-app scheduler — admin only needs to know
 * WHICH post to schedule for WHICH slot.
 */
const TIME_SLOTS = [
  {
    id: 'slot-1',
    label: '🥪 Lunch US (12pm EST)',
    nlTime: '18:00 NL',
    description: 'Office workers scrolling on lunch break — high reach, good for product showcases',
    priority: 'medium',
    recommendedTemplates: ['benefit', 'demo', 'problem_solution'],
  },
  {
    id: 'slot-2',
    label: '🌆 Avond US (7pm EST)',
    nlTime: '01:00 NL',
    description: 'After-work scroll session — peak engagement window',
    priority: 'high',
    recommendedTemplates: ['hook', 'pov', 'pattern_interrupt'],
  },
  {
    id: 'slot-3',
    label: '🔥 Prime Time US (9pm EST)',
    nlTime: '03:00 NL',
    description: 'Highest viral chance — couch scrollers, longest watch times',
    priority: 'critical',
    recommendedTemplates: ['pattern_interrupt', 'pov', 'trending'],
  },
];

const VARIANT_LABELS: Record<string, string> = {
  hook: '🎣 Hook',
  problem_solution: '💡 Problem/Solution',
  benefit: '❤️ Benefit',
  demo: '🎬 Demo',
  trending: '🔥 Trending',
  pov: '👀 POV',
  pattern_interrupt: '⚡ Pattern Interrupt',
};

export function TodayPostingChecklist({ posts, onSelectPost }: Props) {
  const today = new Date().toISOString().split('T')[0];
  const storageKey = `tiktok-checklist-${today}`;

  const [completed, setCompleted] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || '{}');
    } catch {
      return {};
    }
  });

  const toggleComplete = (slotId: string) => {
    const next = { ...completed, [slotId]: !completed[slotId] };
    setCompleted(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };

  // Match posts to slots based on template + ready-to-post status
  const readyPosts = useMemo(
    () =>
      posts.filter(
        (p) =>
          (p.status === 'queued' || p.status === 'draft') &&
          p.media_urls &&
          p.media_urls.length > 0,
      ),
    [posts],
  );

  const assignments = useMemo(() => {
    const used = new Set<string>();
    return TIME_SLOTS.map((slot) => {
      // Prefer a post matching one of the recommended templates
      let match = readyPosts.find(
        (p) => !used.has(p.id) && slot.recommendedTemplates.includes(p.post_variant),
      );
      // Fallback to any unused ready post
      if (!match) match = readyPosts.find((p) => !used.has(p.id));
      if (match) used.add(match.id);
      return { slot, post: match };
    });
  }, [readyPosts]);

  const completedCount = Object.values(completed).filter(Boolean).length;
  const totalSlots = TIME_SLOTS.length;
  const progressPct = Math.round((completedCount / totalSlots) * 100);

  return (
    <Card className="border-primary/40 bg-gradient-to-br from-background to-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Vandaag Posten — US Prime Time Schedule
            </CardTitle>
            <CardDescription>
              3 posts/dag op de juiste tijden = maximale viral kans. Vink af na elke post.
            </CardDescription>
          </div>
          <Badge variant={completedCount === totalSlots ? 'default' : 'secondary'} className="shrink-0">
            {completedCount}/{totalSlots} klaar
          </Badge>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden mt-2">
          <div
            className="h-full bg-gradient-to-r from-primary to-primary/70 transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {readyPosts.length === 0 && (
          <div className="text-center py-6 text-sm text-muted-foreground border border-dashed rounded-lg">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Nog geen posts met media klaar.</p>
            <p className="text-xs mt-1">
              Klik op <strong>"Generate Complete TikTok Feed"</strong> hierboven om te beginnen.
            </p>
          </div>
        )}

        {readyPosts.length > 0 &&
          assignments.map(({ slot, post }, idx) => {
            const isDone = !!completed[slot.id];
            const isPriority = slot.priority === 'critical';

            return (
              <div
                key={slot.id}
                className={`relative rounded-lg border p-3 transition-all ${
                  isDone
                    ? 'bg-muted/40 border-muted opacity-60'
                    : isPriority
                    ? 'border-primary/50 bg-primary/5 shadow-sm'
                    : 'border-border bg-card'
                }`}
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={isDone}
                    onCheckedChange={() => toggleComplete(slot.id)}
                    className="mt-1"
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-semibold text-sm ${isDone ? 'line-through' : ''}`}>
                        {slot.label}
                      </span>
                      <Badge variant="outline" className="text-[10px] h-5">
                        {slot.nlTime}
                      </Badge>
                      {isPriority && !isDone && (
                        <Badge className="text-[10px] h-5 bg-primary">
                          <Flame className="h-2.5 w-2.5 mr-0.5" />
                          BEST
                        </Badge>
                      )}
                      {isDone && (
                        <Badge variant="secondary" className="text-[10px] h-5">
                          <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                          Geplaatst
                        </Badge>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground mt-1">{slot.description}</p>

                    {post ? (
                      <div className="mt-2 p-2 rounded-md bg-background border border-border/60">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="text-xs font-medium truncate">{post.product_name}</p>
                          <Badge variant="outline" className="text-[10px] h-4 shrink-0">
                            {VARIANT_LABELS[post.post_variant] || post.post_variant}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground line-clamp-2">
                          {post.caption}
                        </p>
                        <Button
                          size="sm"
                          variant="default"
                          className="mt-2 h-7 text-xs w-full"
                          onClick={() => onSelectPost(post.id)}
                        >
                          <ArrowDown className="h-3 w-3 mr-1" />
                          Open Copy & Post Helper
                        </Button>
                      </div>
                    ) : (
                      <div className="mt-2 p-2 rounded-md bg-muted/40 border border-dashed text-center">
                        <p className="text-[11px] text-muted-foreground">
                          Geen extra post beschikbaar — genereer er meer hierboven
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

        {readyPosts.length > 0 && (
          <div className="text-[11px] text-muted-foreground pt-2 border-t space-y-0.5">
            <p>💡 <strong>Tip:</strong> Gebruik TikTok's in-app scheduler zodat je niet 's nachts wakker hoeft.</p>
            <p>📈 Reageer binnen 1 uur op comments voor extra algoritme-boost.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
