import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PATTERNS, ALL_NICHES, type PatternSummary } from '@/lib/pinterest-patterns-client';
import { Sparkles, Check, X } from 'lucide-react';

export default function PinterestPatternsPage() {
  const [nicheFilter, setNicheFilter] = useState<string>('all');

  const sorted = useMemo(() => {
    if (nicheFilter === 'all') return PATTERNS;
    return [...PATTERNS].sort(
      (a, b) => (b.niche_affinity[nicheFilter] ?? 0) - (a.niche_affinity[nicheFilter] ?? 0),
    );
  }, [nicheFilter]);

  return (
    <div className="container mx-auto p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-fuchsia-600" /> Pinterest Pattern Library
        </h1>
        <p className="text-sm text-muted-foreground">
          Codified winning visual patterns of high-performing US pet Pinterest pins. Each pattern is a
          fingerprint the AI Creative Director uses to constrain scene briefs, render directives, and
          quality scoring. No competitor assets are referenced or copied.
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium mr-1">Sort by niche affinity:</span>
        <Badge
          variant={nicheFilter === 'all' ? 'default' : 'outline'}
          className="cursor-pointer"
          onClick={() => setNicheFilter('all')}
        >
          all
        </Badge>
        {ALL_NICHES.map((n) => (
          <Badge
            key={n}
            variant={nicheFilter === n ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setNicheFilter(n)}
          >
            {n}
          </Badge>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {sorted.map((p) => (
          <PatternCard key={p.id} pattern={p} highlightNiche={nicheFilter !== 'all' ? nicheFilter : undefined} />
        ))}
      </div>
    </div>
  );
}

function PatternCard({ pattern, highlightNiche }: { pattern: PatternSummary; highlightNiche?: string }) {
  const topNiches = Object.entries(pattern.niche_affinity)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const highlight = highlightNiche ? pattern.niche_affinity[highlightNiche] ?? 0 : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <span>{pattern.label}</span>
          {highlight !== null && (
            <Badge variant="secondary">
              {highlightNiche}: {Math.round(highlight * 100)}%
            </Badge>
          )}
        </CardTitle>
        <p className="text-xs italic text-muted-foreground">{pattern.psychology}</p>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        <div>
          <div className="font-semibold mb-0.5">Composition</div>
          <p className="text-muted-foreground leading-snug">{pattern.composition_rule}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline">type: {pattern.typography_preference}</Badge>
          <Badge variant="outline">whitespace: {pattern.whitespace}</Badge>
          <Badge variant="outline">CTA: {pattern.cta_placement}</Badge>
        </div>
        <div>
          <div className="font-semibold mb-1">Must include</div>
          <div className="flex flex-wrap gap-1">
            {pattern.must_have.map((t) => (
              <Badge key={t} variant="outline" className="border-emerald-500 text-emerald-700">
                <Check className="h-3 w-3 mr-1" /> {t}
              </Badge>
            ))}
          </div>
        </div>
        <div>
          <div className="font-semibold mb-1">Auto-reject if present</div>
          <div className="flex flex-wrap gap-1">
            {pattern.must_avoid.map((t) => (
              <Badge key={t} variant="outline" className="border-rose-500 text-rose-700">
                <X className="h-3 w-3 mr-1" /> {t}
              </Badge>
            ))}
          </div>
        </div>
        <div>
          <div className="font-semibold mb-1">Top niches</div>
          <div className="space-y-1">
            {topNiches.map(([n, w]) => (
              <div key={n} className="flex items-center gap-2">
                <span className="w-28 text-muted-foreground">{n}</span>
                <div className="flex-1 h-1.5 bg-muted rounded overflow-hidden">
                  <div className="h-full bg-fuchsia-500" style={{ width: `${Math.round(w * 100)}%` }} />
                </div>
                <span className="w-8 text-right tabular-nums">{Math.round(w * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}