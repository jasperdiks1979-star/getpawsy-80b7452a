import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Calculator } from 'lucide-react';
import { Slider } from '@/components/ui/slider';

interface Scenario {
  label: string;
  visitors: number;
  convRate: number;
  aov: number;
}

// Keyword-based revenue projections
// Formula: keywords × avgVolume × CTR → visitors × convRate × AOV
const SCENARIOS: Scenario[] = [
  { label: 'Conservative', visitors: 2000, convRate: 1.0, aov: 165 },
  { label: 'Moderate', visitors: 7200, convRate: 2.0, aov: 175 },
  { label: 'Aggressive', visitors: 24000, convRate: 3.0, aov: 185 },
];

// Keyword-count scenario breakdown for display
const KEYWORD_SCENARIOS = [
  { label: 'Conservative', keywords: 5, ctr: 2, conv: 1, aov: 165 },
  { label: 'Moderate', keywords: 10, ctr: 3, conv: 2, aov: 175 },
  { label: 'Aggressive', keywords: 20, ctr: 5, conv: 3, aov: 185 },
];

const CTR_CURVE: Record<string, number> = {
  '1-3': 28.5,
  '4-10': 6.2,
  '11-20': 1.8,
  '21-40': 0.4,
};

const POSITION_BUCKETS = [
  { range: '1–3', key: '1-3', color: 'bg-green-500' },
  { range: '4–10', key: '4-10', color: 'bg-blue-500' },
  { range: '11–20', key: '11-20', color: 'bg-yellow-500' },
  { range: '21–40', key: '21-40', color: 'bg-red-400' },
];

export function RevenueSimulationWidget() {
  const [kwTop10, setKwTop10] = useState(10);
  const [avgVolume, setAvgVolume] = useState(200);
  const [convRate, setConvRate] = useState(2.0);
  const [aov, setAov] = useState(175);

  // Estimate: if kwTop10 keywords reach avg position 7 → CTR ~6.2%
  const estimatedTraffic = Math.round(kwTop10 * avgVolume * (CTR_CURVE['4-10'] / 100));
  const estimatedRevenue = Math.round(estimatedTraffic * (convRate / 100) * aov);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Calculator className="h-4 w-4 text-primary" />
          Revenue Projection Simulator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Preset Scenarios */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Preset Scenarios</p>
          <div className="grid grid-cols-3 gap-2">
            {SCENARIOS.map(s => {
              const rev = Math.round(s.visitors * (s.convRate / 100) * s.aov);
              return (
                <div key={s.label} className="rounded-lg border p-2.5 text-center">
                  <Badge variant={s.label === 'Conservative' ? 'secondary' : s.label === 'Moderate' ? 'default' : 'destructive'} className="text-[10px] mb-1.5">
                    {s.label}
                  </Badge>
              <div className="text-lg font-bold">${rev.toLocaleString()}</div>
                  <div className="text-[10px] text-muted-foreground">/month</div>
                  {(() => {
                    const ks = KEYWORD_SCENARIOS.find(k => k.label === s.label);
                    return ks ? (
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {ks.keywords} kw Top 10 · {ks.ctr}% CTR · {ks.conv}% CR
                      </div>
                    ) : null;
                  })()}
                </div>
              );
            })}
          </div>
        </div>

        {/* Custom Simulation */}
        <div className="space-y-3 pt-2 border-t">
          <p className="text-xs font-medium text-muted-foreground">Custom Simulation</p>
          
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span>Keywords in Top 10</span>
              <span className="font-mono font-bold">{kwTop10}</span>
            </div>
            <Slider value={[kwTop10]} onValueChange={([v]) => setKwTop10(v)} min={1} max={50} step={1} />
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span>Avg. Monthly Search Volume</span>
              <span className="font-mono font-bold">{avgVolume}</span>
            </div>
            <Slider value={[avgVolume]} onValueChange={([v]) => setAvgVolume(v)} min={50} max={1000} step={10} />
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span>Conversion Rate</span>
              <span className="font-mono font-bold">{convRate}%</span>
            </div>
            <Slider value={[convRate * 10]} onValueChange={([v]) => setConvRate(v / 10)} min={5} max={50} step={1} />
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span>Average Order Value</span>
              <span className="font-mono font-bold">${aov}</span>
            </div>
            <Slider value={[aov]} onValueChange={([v]) => setAov(v)} min={50} max={500} step={5} />
          </div>

          {/* Result */}
          <div className="rounded-lg bg-primary/10 p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mb-1">
              <TrendingUp className="h-3 w-3" /> Projected Monthly
            </div>
            <div className="text-2xl font-bold text-primary">${estimatedRevenue.toLocaleString()}</div>
            <div className="text-[10px] text-muted-foreground mt-1">
              ~{estimatedTraffic.toLocaleString()} monthly visitors · {(convRate).toFixed(1)}% CR · ${aov} AOV
            </div>
          </div>
        </div>

        {/* CTR Curve Reference */}
        <div className="pt-2 border-t">
          <p className="text-xs font-medium text-muted-foreground mb-2">CTR by Position (Google Organic)</p>
          <div className="grid grid-cols-4 gap-1.5">
            {POSITION_BUCKETS.map(b => (
              <div key={b.key} className="text-center">
                <div className={`${b.color} text-white text-[10px] rounded py-0.5 mb-0.5`}>Pos {b.range}</div>
                <div className="text-xs font-bold">{CTR_CURVE[b.key]}%</div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
