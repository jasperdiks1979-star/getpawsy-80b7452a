import { useMemo, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Copy, Check, RefreshCw, Sparkles, Flag, Clock, Hash, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Daily Caption Generator
 * --------------------------------------------------
 * Fully client-side, zero-DB helper for the admin to grab 3-5 fresh,
 * US-targeted TikTok captions every day while waiting on TikTok API approval.
 *
 * - Captions + hashtags assembled from rotating viral templates
 * - Each card: one-click "Copy everything" → clipboard
 * - Embedded US-targeting checklist (geo lock, language, location tag)
 * - Persists today's checklist progress in localStorage
 */

// ---------- Viral caption templates (US-tone, $ pricing, US slang) ----------

type Niche = 'cat' | 'dog' | 'mixed';

type CaptionTemplate = {
  variant: string;
  label: string;
  emoji: string;
  build: (niche: Niche) => { hook: string; caption: string };
};

const NICHE_NOUN: Record<Niche, string> = {
  cat: 'cat',
  dog: 'dog',
  mixed: 'pet',
};

const NICHE_PLURAL: Record<Niche, string> = {
  cat: 'cat owners',
  dog: 'dog owners',
  mixed: 'pet parents',
};

const TEMPLATES: CaptionTemplate[] = [
  {
    variant: 'pattern_interrupt',
    label: 'Pattern Interrupt',
    emoji: '🤯',
    build: (n) => ({
      hook: `I can't believe this ${NICHE_NOUN[n]} thing actually works...`,
      caption: `Y'all I was NOT expecting this 😭 Best ${NICHE_NOUN[n]} purchase of 2025 hands down. Link in bio 🔗`,
    }),
  },
  {
    variant: 'pov_relatable',
    label: 'POV / Relatable',
    emoji: '👀',
    build: (n) => ({
      hook: `POV: your ${NICHE_NOUN[n]} finally has the thing they've been begging for`,
      caption: `Tell me why ${n === 'cat' ? 'she' : 'he'}'s obsessed 😂 Got this from GetPawsy and now it's ${n === 'cat' ? 'her' : 'his'} whole personality`,
    }),
  },
  {
    variant: 'problem_solve',
    label: 'Problem → Solution',
    emoji: '💡',
    build: (n) => ({
      hook: `Stop buying cheap ${NICHE_NOUN[n]} stuff that breaks in 2 weeks`,
      caption: `Found the one ${NICHE_PLURAL[n]} actually keep recommending. Ships from the US, no sketchy 6-week wait. Link 🔗`,
    }),
  },
  {
    variant: 'social_proof',
    label: 'Social Proof / FOMO',
    emoji: '🔥',
    build: (n) => ({
      hook: `This is selling out again — getting it before it's gone`,
      caption: `Restocked at GetPawsy and ${NICHE_PLURAL[n]} are losing it 😭 Grabbed mine before it sells out again. Link in bio`,
    }),
  },
  {
    variant: 'transformation',
    label: 'Before → After',
    emoji: '✨',
    build: (n) => ({
      hook: `Before vs after — wait for it...`,
      caption: `Didn't think a ${NICHE_NOUN[n]} product could actually change our routine but here we are 🥹 Linked in bio`,
    }),
  },
  {
    variant: 'list_curiosity',
    label: 'List / Curiosity',
    emoji: '📋',
    build: (n) => ({
      hook: `3 things every ${NICHE_NOUN[n]} owner needs in 2025`,
      caption: `Saving this for every new ${NICHE_NOUN[n]} parent 🐾 Number 2 changed everything for us. All linked in bio at GetPawsy`,
    }),
  },
  {
    variant: 'question_hook',
    label: 'Question Hook',
    emoji: '❓',
    build: (n) => ({
      hook: `Does your ${NICHE_NOUN[n]} do this too or is it just mine?`,
      caption: `Comment if your ${NICHE_NOUN[n]} acts like this 👇 We finally found something that actually helps. Link in bio`,
    }),
  },
];

// ---------- Hashtag pools (US-targeted) ----------

const HASHTAGS_BASE = ['#fyp', '#foryou', '#petsoftiktok'];
const HASHTAGS_BY_NICHE: Record<Niche, string[]> = {
  cat: ['#catsoftiktok', '#catlovers', '#catlife', '#catmom', '#kittensoftiktok', '#cattoy', '#catlitterbox'],
  dog: ['#dogsoftiktok', '#doglovers', '#doglife', '#dogmom', '#puppylove', '#dogtoy', '#dogbed'],
  mixed: ['#petproducts', '#petcare', '#petparents', '#petlovers', '#petlife'],
};
const HASHTAGS_GEO = ['#usa', '#smallbusinessusa', '#shoppingusa'];

function pickHashtags(niche: Niche, seed: number): string[] {
  // 7-9 hashtags is TikTok's sweet spot
  const niche_pool = [...HASHTAGS_BY_NICHE[niche], ...HASHTAGS_BY_NICHE.mixed];
  // pseudo-random shuffle based on seed for stable per-card hashtags
  const shuffled = niche_pool
    .map((tag, i) => ({ tag, sort: ((seed * 9301 + i * 49297) % 233280) / 233280 }))
    .sort((a, b) => a.sort - b.sort)
    .map((x) => x.tag);
  return [...HASHTAGS_BASE, ...shuffled.slice(0, 4), ...HASHTAGS_GEO.slice(0, 1)];
}

// ---------- US prime-time slots ----------

const TIME_SLOTS = [
  { label: '🥪 12pm EST (US lunch)', est: '12:00 PM EST', priority: 'medium' as const },
  { label: '🌆 7pm EST (peak)', est: '7:00 PM EST', priority: 'high' as const },
  { label: '🌙 9pm EST (prime)', est: '9:00 PM EST', priority: 'high' as const },
  { label: '☕ 8am EST (commute)', est: '8:00 AM EST', priority: 'medium' as const },
  { label: '🍔 5pm EST (after-work)', est: '5:00 PM EST', priority: 'medium' as const },
];

// ---------- US Targeting Checklist (persisted per-day) ----------

const CHECKLIST_ITEMS = [
  { id: 'lang', label: 'Phone language set to English (US)', critical: true },
  { id: 'geo_tag', label: 'Tagged a US city as location (e.g. New York, Austin)', critical: true },
  { id: 'no_nl_tag', label: 'Removed any NL/Apeldoorn location tag', critical: true },
  { id: 'us_caption', label: 'Caption uses US English ($ pricing, "y\'all", "fall")', critical: false },
  { id: 'us_hashtags', label: 'At least 1 US-geo hashtag (#usa / #shoppingusa)', critical: false },
  { id: 'us_sound', label: 'Picked a sound trending in US (not NL trending)', critical: false },
  { id: 'no_promote_app', label: 'Did NOT use in-app "Promote" (defaults to NL — use Ads Manager instead)', critical: true },
];

const todayKey = () => `tiktok-daily-checklist-${new Date().toISOString().slice(0, 10)}`;

function loadChecklist(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(todayKey());
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveChecklist(state: Record<string, boolean>) {
  try {
    localStorage.setItem(todayKey(), JSON.stringify(state));
  } catch {
    /* localStorage disabled */
  }
}

// ---------- Main component ----------

export function DailyCaptionGenerator() {
  const [niche, setNiche] = useState<Niche>('mixed');
  const [count, setCount] = useState<number>(5);
  const [seed, setSeed] = useState<number>(Date.now());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<Record<string, boolean>>(loadChecklist);

  const cards = useMemo(() => {
    // Pick `count` distinct templates, rotated by seed so re-roll feels fresh
    const offset = Math.floor(seed / 1000) % TEMPLATES.length;
    const out = [];
    for (let i = 0; i < count; i++) {
      const tpl = TEMPLATES[(offset + i) % TEMPLATES.length];
      const slot = TIME_SLOTS[i % TIME_SLOTS.length];
      const tags = pickHashtags(niche, seed + i);
      const built = tpl.build(niche);
      const fullCaption = `${built.caption}\n\n${tags.join(' ')}`;
      out.push({
        id: `${tpl.variant}-${i}`,
        ...tpl,
        slot,
        hashtags: tags,
        hook: built.hook,
        captionOnly: built.caption,
        fullCaption,
      });
    }
    return out;
  }, [niche, count, seed]);

  const reroll = useCallback(() => {
    setSeed(Date.now());
    toast.success('Fresh caption ideas generated');
  }, []);

  const copy = useCallback(async (text: string, id: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      toast.success(`${label} copied to clipboard`);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      toast.error('Clipboard access blocked — long-press to copy manually');
    }
  }, []);

  const toggleCheck = useCallback((id: string) => {
    setChecklist((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      saveChecklist(next);
      return next;
    });
  }, []);

  const checklistDone = CHECKLIST_ITEMS.filter((i) => checklist[i.id]).length;
  const criticalDone = CHECKLIST_ITEMS.filter((i) => i.critical && checklist[i.id]).length;
  const criticalTotal = CHECKLIST_ITEMS.filter((i) => i.critical).length;
  const allCriticalDone = criticalDone === criticalTotal;

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-background to-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Daily Caption Generator
              <Badge variant="outline" className="text-[10px] gap-1">
                <Flag className="h-3 w-3" /> US Targeted
              </Badge>
            </CardTitle>
            <CardDescription>
              Fresh viral-template captions + hashtags. Tap to copy → paste in TikTok app.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={niche} onValueChange={(v) => setNiche(v as Niche)}>
              <SelectTrigger className="w-28 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cat">🐱 Cat</SelectItem>
                <SelectItem value="dog">🐶 Dog</SelectItem>
                <SelectItem value="mixed">🐾 Mixed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={String(count)} onValueChange={(v) => setCount(Number(v))}>
              <SelectTrigger className="w-20 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[3, 4, 5].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n} posts</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={reroll} className="h-8">
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Re-roll
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* US Targeting Checklist */}
        <div className="rounded-lg border bg-card p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold flex items-center gap-2">
              <Flag className="h-4 w-4 text-primary" />
              US Targeting Checklist
            </p>
            <Badge
              variant={allCriticalDone ? 'default' : 'secondary'}
              className="text-[10px]"
            >
              {checklistDone}/{CHECKLIST_ITEMS.length} done
              {!allCriticalDone && ` · ${criticalTotal - criticalDone} critical left`}
            </Badge>
          </div>
          <div className="grid gap-1.5">
            {CHECKLIST_ITEMS.map((item) => (
              <label
                key={item.id}
                htmlFor={`chk-${item.id}`}
                className="flex items-start gap-2 text-xs cursor-pointer hover:bg-muted/50 rounded px-1.5 py-1"
              >
                <Checkbox
                  id={`chk-${item.id}`}
                  checked={!!checklist[item.id]}
                  onCheckedChange={() => toggleCheck(item.id)}
                  className="mt-0.5"
                />
                <span className={checklist[item.id] ? 'line-through text-muted-foreground' : ''}>
                  {item.label}
                  {item.critical && (
                    <Badge variant="destructive" className="ml-1.5 text-[9px] px-1 py-0">
                      critical
                    </Badge>
                  )}
                </span>
              </label>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground pt-1 border-t">
            ✓ Checklist resets daily. Saved locally in your browser.
          </p>
        </div>

        {/* Caption cards */}
        <div className="space-y-3">
          {cards.map((card, idx) => (
            <Card key={card.id} className="border-l-4 border-l-primary">
              <CardContent className="py-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      Post {idx + 1}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {card.emoji} {card.label}
                    </Badge>
                    <Badge
                      variant={card.slot.priority === 'high' ? 'default' : 'outline'}
                      className="text-[10px] gap-1"
                    >
                      <Clock className="h-2.5 w-2.5" />
                      {card.slot.label}
                    </Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="default"
                    className="h-7 text-xs"
                    onClick={() => copy(`${card.hook}\n\n${card.fullCaption}`, `${card.id}-all`, 'Hook + caption')}
                  >
                    {copiedId === `${card.id}-all` ? (
                      <Check className="h-3 w-3 mr-1" />
                    ) : (
                      <Copy className="h-3 w-3 mr-1" />
                    )}
                    Copy everything
                  </Button>
                </div>

                {/* On-screen hook */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium flex items-center gap-1">
                      <MessageSquare className="h-2.5 w-2.5" />
                      On-screen hook (first 3s)
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px]"
                      onClick={() => copy(card.hook, `${card.id}-hook`, 'Hook')}
                    >
                      {copiedId === `${card.id}-hook` ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
                    </Button>
                  </div>
                  <p className="text-sm font-medium bg-muted/40 rounded px-2 py-1.5 border">
                    "{card.hook}"
                  </p>
                </div>

                {/* Caption */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                      Caption
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px]"
                      onClick={() => copy(card.captionOnly, `${card.id}-cap`, 'Caption')}
                    >
                      {copiedId === `${card.id}-cap` ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
                    </Button>
                  </div>
                  <p className="text-xs bg-muted/40 rounded px-2 py-1.5 border whitespace-pre-line">
                    {card.captionOnly}
                  </p>
                </div>

                {/* Hashtags */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium flex items-center gap-1">
                      <Hash className="h-2.5 w-2.5" />
                      Hashtags ({card.hashtags.length})
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px]"
                      onClick={() => copy(card.hashtags.join(' '), `${card.id}-tags`, 'Hashtags')}
                    >
                      {copiedId === `${card.id}-tags` ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
                    </Button>
                  </div>
                  <p className="text-xs text-primary bg-muted/40 rounded px-2 py-1.5 border break-words">
                    {card.hashtags.join(' ')}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="text-[10px] text-muted-foreground text-center pt-1">
          💡 Use these while you wait on TikTok API approval. Pair with the Ads Manager workflow above for paid US reach.
        </p>
      </CardContent>
    </Card>
  );
}