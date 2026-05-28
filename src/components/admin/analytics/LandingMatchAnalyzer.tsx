import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';

interface Score {
  headline_match: number;
  visual_match: number;
  promise_clarity: number;
  overall: number;
  verdict: 'strong' | 'mixed' | 'weak';
  ad_summary: string;
  landing_summary: string;
  mismatches: string[];
  recommendations: string[];
}

const VERDICT_TONE: Record<Score['verdict'], string> = {
  strong: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  mixed: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  weak: 'bg-destructive/10 text-destructive',
};

/**
 * CI-3 — admin tool that scores ad → landing-page continuity. Calls the
 * `ai-landing-match` edge function (Lovable AI Gemini 2.5 Flash, structured
 * JSON). Draft-only; nothing here mutates the storefront.
 */
export default function LandingMatchAnalyzer() {
  const [landingUrl, setLandingUrl] = useState('');
  const [adHook, setAdHook] = useState('');
  const [adImageUrl, setAdImageUrl] = useState('');
  const [source, setSource] = useState('pinterest');
  const [loading, setLoading] = useState(false);
  const [score, setScore] = useState<Score | null>(null);

  async function analyze() {
    if (!landingUrl || !adHook) {
      toast.error('Landing URL and ad hook are required');
      return;
    }
    setLoading(true);
    setScore(null);
    try {
      const { data, error } = await supabase.functions.invoke('ai-landing-match', {
        body: {
          landing_url: landingUrl,
          ad_hook: adHook,
          ad_image_url: adImageUrl || undefined,
          source,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || 'analysis failed');
      setScore(data.score as Score);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'analysis failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Wand2 className="h-4 w-4" /> Landing match analyzer
        </CardTitle>
        <CardDescription>
          Score ad → landing continuity before you spend more on traffic. Headline match, visual
          match, and promise clarity — with concrete fixes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 md:grid-cols-2">
          <Input
            placeholder="Landing URL (https://…)"
            value={landingUrl}
            onChange={(e) => setLandingUrl(e.target.value)}
          />
          <Input
            placeholder="Source (pinterest / google_ads / tiktok)"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
          <Input
            className="md:col-span-2"
            placeholder="Ad / Pin hook (the headline or first line of the creative)"
            value={adHook}
            onChange={(e) => setAdHook(e.target.value)}
          />
          <Input
            className="md:col-span-2"
            placeholder="Optional: ad image URL (for visual match)"
            value={adImageUrl}
            onChange={(e) => setAdImageUrl(e.target.value)}
          />
        </div>
        <Button onClick={analyze} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Wand2 className="h-4 w-4 mr-1" />}
          Analyze
        </Button>

        {score && (
          <div className="space-y-3 pt-2 border-t">
            <div className="flex flex-wrap gap-2 items-center">
              <Badge className={`${VERDICT_TONE[score.verdict]} border-0 uppercase tracking-wide`}>
                {score.verdict}
              </Badge>
              <Badge variant="outline">Overall {score.overall}/100</Badge>
              <Badge variant="outline">Headline {score.headline_match}</Badge>
              <Badge variant="outline">Visual {score.visual_match}</Badge>
              <Badge variant="outline">Promise {score.promise_clarity}</Badge>
            </div>
            <div className="grid gap-3 md:grid-cols-2 text-sm">
              <div>
                <div className="font-medium mb-1">Ad summary</div>
                <p className="text-muted-foreground">{score.ad_summary}</p>
              </div>
              <div>
                <div className="font-medium mb-1">Landing summary</div>
                <p className="text-muted-foreground">{score.landing_summary}</p>
              </div>
            </div>
            {score.mismatches?.length > 0 && (
              <div>
                <div className="text-sm font-medium mb-1">Mismatches</div>
                <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-0.5">
                  {score.mismatches.map((m, i) => <li key={i}>{m}</li>)}
                </ul>
              </div>
            )}
            {score.recommendations?.length > 0 && (
              <div>
                <div className="text-sm font-medium mb-1">Recommendations</div>
                <ul className="list-disc pl-5 text-sm space-y-0.5">
                  {score.recommendations.map((m, i) => <li key={i}>{m}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}