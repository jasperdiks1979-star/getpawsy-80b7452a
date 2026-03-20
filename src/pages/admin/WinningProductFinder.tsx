import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { findWinningProducts, type ScoredProduct } from '@/utils/winningProductScorer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trophy, Target, Megaphone, Home, AlertTriangle, ChevronDown, ChevronUp, Star } from 'lucide-react';

/* ─── tier badge ────────────────────────────────────── */

function TierBadge({ tier }: { tier: ScoredProduct['tier'] }) {
  const map = {
    winner: { label: 'Tier 1 — Winner', className: 'bg-green-600 text-white' },
    test: { label: 'Tier 2 — Test', className: 'bg-amber-500 text-white' },
    reject: { label: 'Tier 3 — Reject', className: 'bg-red-500/80 text-white' },
  } as const;
  const cfg = map[tier];
  return <Badge className={cfg.className}>{cfg.label}</Badge>;
}

/* ─── score bar ─────────────────────────────────────── */

function ScoreBar({ label, value, max = 10 }: { label: string; value: number; max?: number }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-6 text-right font-medium">{value}</span>
    </div>
  );
}

/* ─── product card (expandable) ─────────────────────── */

function ProductCard({ product }: { product: ScoredProduct }) {
  const [open, setOpen] = useState(false);

  return (
    <Card className="overflow-hidden">
      <div className="flex gap-4 p-4">
        {/* image */}
        <div className="w-20 h-20 rounded-lg overflow-hidden bg-muted shrink-0">
          <img
            src={product.image_url || '/placeholder.svg'}
            alt={product.name}
            className="w-full h-full object-cover"
          />
        </div>

        {/* info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold text-sm line-clamp-1">{product.name}</h3>
              <p className="text-xs text-muted-foreground">{product.category || 'Uncategorized'}</p>
            </div>
            <TierBadge tier={product.tier} />
          </div>

          <div className="flex items-center gap-3 mt-2">
            <span className="text-lg font-bold text-primary">{product.winningScore}</span>
            <span className="text-xs text-muted-foreground">/ 100</span>
            <span className="ml-auto font-semibold">${product.price.toFixed(2)}</span>
            {product.compare_at_price && product.compare_at_price > product.price && (
              <span className="text-xs line-through text-muted-foreground">
                ${product.compare_at_price.toFixed(2)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* expand toggle */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-center gap-1 py-2 text-xs text-muted-foreground hover:bg-muted/50 border-t transition-colors"
      >
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {open ? 'Hide Details' : 'Score Breakdown & Marketing'}
      </button>

      {open && (
        <div className="p-4 pt-2 space-y-4 border-t bg-muted/20">
          {/* breakdown */}
          <div className="space-y-1.5">
            <ScoreBar label="Problem-Solving" value={product.breakdown.problemSolving} />
            <ScoreBar label="Perceived Value" value={product.breakdown.perceivedValue} />
            <ScoreBar label="Visual Appeal" value={product.breakdown.visualAppeal} />
            <ScoreBar label="Viral Potential" value={product.breakdown.viralPotential} />
            <ScoreBar label="Margin Potential" value={product.breakdown.marginPotential} />
            <ScoreBar label="Category Strength" value={product.breakdown.categoryStrength} />
          </div>

          {/* positioning */}
          <div className="space-y-2 text-sm">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Hook</p>
              <p className="font-medium">{product.hook}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Marketing Angle</p>
              <p>{product.marketingAngle}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Emotional Trigger</p>
              <p>{product.emotionalTrigger}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Suggested Headline</p>
              <p className="font-semibold text-primary">{product.suggestedHeadline}</p>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ─── stat card ─────────────────────────────────────── */

function StatCard({ icon: Icon, label, value, color }: {
  icon: typeof Trophy;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── main page ─────────────────────────────────────── */

export default function WinningProductFinder() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['winning-product-finder'],
    queryFn: findWinningProducts,
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-bold">🏆 Winning Product Finder</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">🏆 Winning Product Finder</h1>
        <Card className="p-6 text-center text-destructive">
          Failed to load products: {(error as Error)?.message || 'Unknown error'}
        </Card>
      </div>
    );
  }

  const { all, winners, testProducts, rejects, homepagePicks, adWinners } = data;

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* header */}
      <div>
        <h1 className="text-2xl font-bold">🏆 Winning Product Finder</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Data-driven product scoring — {all.length} products analysed
        </p>
      </div>

      {/* stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Trophy} label="Winners (≥80)" value={winners.length} color="bg-green-600" />
        <StatCard icon={Target} label="Test (60-79)" value={testProducts.length} color="bg-amber-500" />
        <StatCard icon={AlertTriangle} label="Reject (<60)" value={rejects.length} color="bg-red-500" />
        <StatCard icon={Star} label="Total Scored" value={all.length} color="bg-primary" />
      </div>

      {/* tabs */}
      <Tabs defaultValue="winners" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="winners" className="gap-1">
            <Trophy className="h-3.5 w-3.5" /> Top 10 Winners
          </TabsTrigger>
          <TabsTrigger value="homepage" className="gap-1">
            <Home className="h-3.5 w-3.5" /> Homepage Picks
          </TabsTrigger>
          <TabsTrigger value="ads" className="gap-1">
            <Megaphone className="h-3.5 w-3.5" /> Ad Winners
          </TabsTrigger>
          <TabsTrigger value="test" className="gap-1">
            <Target className="h-3.5 w-3.5" /> Test Products
          </TabsTrigger>
          <TabsTrigger value="rejects" className="gap-1">
            <AlertTriangle className="h-3.5 w-3.5" /> Rejects
          </TabsTrigger>
        </TabsList>

        {/* top 10 winners */}
        <TabsContent value="winners" className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Score ≥ 80 — High potential for ads + homepage. Showing top 10.
          </p>
          {winners.slice(0, 10).map(p => (
            <ProductCard key={p.id} product={p} />
          ))}
          {winners.length === 0 && (
            <Card className="p-8 text-center text-muted-foreground">
              No products scored ≥ 80. Check "Test Products" tab for potential picks.
            </Card>
          )}
        </TabsContent>

        {/* homepage picks */}
        <TabsContent value="homepage" className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Top 5 products with best visual appeal + perceived value — ideal above the fold.
          </p>
          {homepagePicks.map((p, i) => (
            <div key={p.id} className="flex items-center gap-2">
              <span className="text-lg font-bold text-muted-foreground w-8">#{i + 1}</span>
              <div className="flex-1">
                <ProductCard product={p} />
              </div>
            </div>
          ))}
        </TabsContent>

        {/* ad winners */}
        <TabsContent value="ads" className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Top 3 products best suited for paid traffic (TikTok / Meta / Google).
          </p>
          {adWinners.map((p, i) => (
            <div key={p.id} className="flex items-center gap-2">
              <span className="text-lg font-bold text-muted-foreground w-8">#{i + 1}</span>
              <div className="flex-1">
                <ProductCard product={p} />
              </div>
            </div>
          ))}
        </TabsContent>

        {/* test products */}
        <TabsContent value="test" className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Score 60–79 — Worth testing with small ad spend or landing pages.
          </p>
          {testProducts.slice(0, 15).map(p => (
            <ProductCard key={p.id} product={p} />
          ))}
          {testProducts.length === 0 && (
            <Card className="p-8 text-center text-muted-foreground">
              No products in the test tier.
            </Card>
          )}
        </TabsContent>

        {/* rejects */}
        <TabsContent value="rejects" className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Score &lt; 60 — Consider removing or improving these products.
          </p>
          {rejects.slice(0, 20).map(p => (
            <ProductCard key={p.id} product={p} />
          ))}
          {rejects.length === 0 && (
            <Card className="p-8 text-center text-muted-foreground">
              No rejected products — your catalog is strong!
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
