import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Copy,
  Check,
  Download,
  Clock,
  Sparkles,
  ExternalLink,
  ImageIcon,
} from 'lucide-react';
import { toast } from 'sonner';

type ManualPost = {
  id: string;
  product_name: string;
  product_slug: string | null;
  post_variant: string;
  caption: string;
  hashtags: string[];
  thumbnail_url: string | null;
  video_url: string | null;
  media_urls: string[] | null;
  destination_link: string | null;
  scheduled_at: string | null;
  tracking_params?: any;
};

const VARIANT_TIPS: Record<string, string> = {
  pattern_interrupt:
    'Open with confused/shocked face. Wait 0.5s before reveal. This template averages 80%+ retention.',
  pov_relatable:
    'Film from your pet\'s POV. Add text "POV:" in top-third. Use trending audio for +2x reach.',
  problem_agitate_solve:
    'Show the problem first (3s), then transition to product solution. Use a "wait for it" hook.',
  social_proof_fomo:
    'Mention "selling out" or "restocked" — creates urgency. Show product close-up at the end.',
  demo_transformation:
    'Before/after split-screen works best. Use a beat-drop trending sound at the reveal moment.',
  question_hook:
    'Ask the question on-screen for first 2s. End with "comment below" CTA — boosts comments 3x.',
  list_curiosity:
    'Use big numbered text overlay (1, 2, 3). Keep each point under 4 seconds.',
};

function formatDateForUser(iso: string | null): { local: string; est: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  const local = d.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  // EST formatting
  const est = d.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }) + ' EST';
  return { local, est };
}

async function downloadFromUrl(url: string, filename: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch (e) {
    toast.error('Download failed — try right-click → Save image');
    window.open(url, '_blank');
  }
}

export function ManualPostingHelper({ post }: { post: ManualPost }) {
  const [copied, setCopied] = useState<string | null>(null);

  const hookText: string = post.tracking_params?.hook_text || '';
  const variantLabel: string = post.tracking_params?.template_label || post.post_variant;
  const tip = VARIANT_TIPS[post.post_variant] || 'Hook viewers in 3 seconds. End with link-in-bio CTA.';
  const fullCaption = post.caption;
  const hashtagsLine = (post.hashtags || []).join(' ');
  const captionWithoutHashtags = fullCaption.split('\n').filter(l => !l.trim().startsWith('#')).join('\n').trim();
  const times = formatDateForUser(post.scheduled_at);
  const mediaCount = post.media_urls?.length || 0;
  const hasVideo = !!post.video_url;

  const copy = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    toast.success(`${label} copied`);
    setTimeout(() => setCopied(null), 2000);
  };

  const downloadAll = async () => {
    const urls = [
      ...(post.video_url ? [post.video_url] : []),
      ...(post.media_urls || []),
    ];
    if (urls.length === 0) {
      toast.error('No media to download — generate media first');
      return;
    }
    for (let i = 0; i < urls.length; i++) {
      const ext = urls[i].split('.').pop()?.split('?')[0] || 'jpg';
      const slug = post.product_slug || 'pawsy';
      await downloadFromUrl(urls[i], `${slug}-${i + 1}.${ext}`);
      // small delay between downloads
      await new Promise(r => setTimeout(r, 300));
    }
    toast.success(`Downloaded ${urls.length} file(s)`);
  };

  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardContent className="py-3 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Manual Posting Helper · 🇺🇸 US Targeted</p>
          <Badge variant="outline" className="text-[10px] ml-auto">{variantLabel}</Badge>
        </div>

        {/* Hook (on-screen overlay text) */}
        {hookText && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                On-screen hook (first 3 seconds)
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => copy(hookText, 'Hook')}
              >
                {copied === 'Hook' ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                Copy
              </Button>
            </div>
            <p className="text-sm font-medium bg-background/70 rounded px-2 py-1.5 border">
              "{hookText}"
            </p>
          </div>
        )}

        {/* Caption */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
              Caption
            </p>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => copy(fullCaption, 'Full caption')}
            >
              {copied === 'Full caption' ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
              Copy full
            </Button>
          </div>
          <p className="text-xs whitespace-pre-line bg-background/70 rounded px-2 py-1.5 border max-h-32 overflow-y-auto">
            {captionWithoutHashtags || fullCaption}
          </p>
        </div>

        {/* Hashtags */}
        {post.hashtags?.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                Hashtags ({post.hashtags.length})
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => copy(hashtagsLine, 'Hashtags')}
              >
                {copied === 'Hashtags' ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                Copy
              </Button>
            </div>
            <p className="text-xs text-primary bg-background/70 rounded px-2 py-1.5 border">
              {hashtagsLine}
            </p>
          </div>
        )}

        {/* Best post time */}
        {times && (
          <div className="flex items-start gap-2 bg-background/70 rounded px-2 py-1.5 border">
            <Clock className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
            <div className="text-xs space-y-0.5">
              <p className="font-medium">Best posting window</p>
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">{times.est}</span>
                <span className="mx-1">·</span>
                <span>Your time: {times.local}</span>
              </p>
              <p className="text-[10px] text-muted-foreground">
                Optimized for US East Coast prime-time scrolling
              </p>
            </div>
          </div>
        )}

        {/* Media download */}
        <div className="flex items-center gap-2 flex-wrap pt-1 border-t">
          <Button size="sm" variant="default" onClick={downloadAll} disabled={!hasVideo && mediaCount === 0}>
            <Download className="h-3 w-3 mr-1" />
            Download {hasVideo ? 'video' : `${mediaCount} slide${mediaCount === 1 ? '' : 's'}`}
          </Button>
          {post.thumbnail_url && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadFromUrl(post.thumbnail_url!, `${post.product_slug || 'pawsy'}-thumb.jpg`)}
            >
              <ImageIcon className="h-3 w-3 mr-1" /> Thumbnail
            </Button>
          )}
          {post.destination_link && (
            <Button size="sm" variant="ghost" asChild>
              <a href={post.destination_link} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3 w-3 mr-1" /> Test link
              </a>
            </Button>
          )}
        </div>

        {/* Variant-specific tip */}
        <div className="text-[11px] text-muted-foreground bg-background/50 rounded px-2 py-1.5 border-l-2 border-primary">
          💡 <strong>{variantLabel}:</strong> {tip}
        </div>
      </CardContent>
    </Card>
  );
}
