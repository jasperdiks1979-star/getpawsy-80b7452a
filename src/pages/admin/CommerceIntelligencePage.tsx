import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Helmet } from "react-helmet-async";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, DollarSign, Megaphone, ShieldCheck, ArrowUpRight, ArrowDownRight, Minus, AlertTriangle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { generateDemandReport, type DemandPredictionReport } from "@/lib/commerce-intelligence/demand-prediction";
import { generatePricingReport, type PricingIntelligenceReport } from "@/lib/commerce-intelligence/pricing-intelligence";
import { generateAdsReport, type AdsOptimizationReport, type AdsInput } from "@/lib/commerce-intelligence/ads-optimization";
import { formatPrice } from "@/lib/pricing";

function useDemandReport() {
  return useQuery({
    queryKey: ["commerce-intelligence", "demand"],
    queryFn: () => generateDemandReport(35),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}

function usePricingReport(demandScores: Map<string, number>) {
  return useQuery({
    queryKey: ["commerce-intelligence", "pricing", demandScores.size],
    queryFn: () => generatePricingReport(demandScores),
    enabled: demandScores.size > 0,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}

// Demand Tab
function DemandTab({ report }: { report: DemandPredictionReport | undefined }) {
  if (!report) return <p className="text-muted-foreground p-4">No data yet.</p>;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Products Analyzed</p><p className="text-2xl font-bold">{report.totalProductsAnalyzed}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">30d Revenue Forecast</p><p className="text-2xl font-bold text-green-600">{formatPrice(report.revenue30dForecast)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">90d Revenue Forecast</p><p className="text-2xl font-bold text-green-600">{formatPrice(report.revenue90dForecast)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Boost Candidates</p><p className="text-2xl font-bold text-blue-600">{report.boostCandidates}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-green-600" /> Top 20 Growth Products</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left"><th className="pb-2 pr-4">Product</th><th className="pb-2 pr-4">Score</th><th className="pb-2 pr-4">Trend</th><th className="pb-2 pr-4">30d Rev</th><th className="pb-2 pr-4">90d Rev</th><th className="pb-2">Boost</th></tr></thead>
              <tbody>
                {report.top20Growth.map((p) => (
                  <tr key={p.productId} className="border-b last:border-0">
                    <td className="py-2 pr-4 max-w-[200px] truncate">{p.productName}</td>
                    <td className="py-2 pr-4"><Badge variant={p.score >= 60 ? "default" : "secondary"}>{p.score}</Badge></td>
                    <td className="py-2 pr-4">{p.trend === 'rising' ? <span className="text-green-600 flex items-center gap-1"><ArrowUpRight className="h-3 w-3" />Rising</span> : p.trend === 'declining' ? <span className="text-red-500 flex items-center gap-1"><ArrowDownRight className="h-3 w-3" />Declining</span> : <span className="text-muted-foreground flex items-center gap-1"><Minus className="h-3 w-3" />Stable</span>}</td>
                    <td className="py-2 pr-4">{formatPrice(p.revenue30d)}</td>
                    <td className="py-2 pr-4">{formatPrice(p.revenue90d)}</td>
                    <td className="py-2">{p.flaggedForBoost ? <Badge className="bg-blue-600">SEO+Ads</Badge> : <Badge variant="outline">—</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {report.decliningProducts.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-red-600"><AlertTriangle className="h-5 w-5" /> Declining Products ({report.decliningProducts.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {report.decliningProducts.slice(0, 10).map((p) => (
                <div key={p.productId} className="flex justify-between items-center text-sm border-b pb-2">
                  <span className="truncate max-w-[250px]">{p.productName}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive">Score: {p.score}</Badge>
                    <Badge variant="outline">{p.riskLevel}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Pricing Tab
function PricingTab({ report }: { report: PricingIntelligenceReport | undefined }) {
  if (!report) return <p className="text-muted-foreground p-4">Waiting for demand data…</p>;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Total Analyzed</p><p className="text-2xl font-bold">{report.totalAnalyzed}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Price Increases</p><p className="text-2xl font-bold text-green-600">{report.increaseCount}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Price Decreases</p><p className="text-2xl font-bold text-red-500">{report.decreaseCount}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Safety Status</p><p className="text-2xl font-bold">{report.safetyStatus === 'green' ? '🟢' : report.safetyStatus === 'yellow' ? '🟡' : '🔴'} {report.safetyStatus.toUpperCase()}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" /> Pricing Recommendations</CardTitle><CardDescription>Max 5% change per cycle • 25% margin floor • auto-rollback on CVR drop</CardDescription></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left"><th className="pb-2 pr-3">Product</th><th className="pb-2 pr-3">Current</th><th className="pb-2 pr-3">Recommended</th><th className="pb-2 pr-3">Change</th><th className="pb-2 pr-3">Confidence</th><th className="pb-2">Safe</th></tr></thead>
              <tbody>
                {report.recommendations.slice(0, 20).map((r) => (
                  <tr key={r.productId} className="border-b last:border-0">
                    <td className="py-2 pr-3 max-w-[180px] truncate">{r.productName}</td>
                    <td className="py-2 pr-3">{formatPrice(r.currentPrice)}</td>
                    <td className="py-2 pr-3 font-medium">{formatPrice(r.recommendedPrice)}</td>
                    <td className="py-2 pr-3">{r.changePct > 0 ? <span className="text-green-600">+{r.changePct.toFixed(1)}%</span> : <span className="text-red-500">{r.changePct.toFixed(1)}%</span>}</td>
                    <td className="py-2 pr-3"><Badge variant={r.confidenceLevel === 'high' ? 'default' : 'secondary'}>{r.confidenceLevel}</Badge></td>
                    <td className="py-2">{r.safeToApply ? <ShieldCheck className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4 text-yellow-500" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Ads Tab
function AdsTab({ report }: { report: AdsOptimizationReport | undefined }) {
  if (!report) return <p className="text-muted-foreground p-4">Waiting for demand data…</p>;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Qualified Products</p><p className="text-2xl font-bold">{report.qualifiedProducts} / {report.totalProducts}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Daily Budget</p><p className="text-2xl font-bold">{formatPrice(report.totalSuggestedDailyBudget)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">30d Projected Revenue</p><p className="text-2xl font-bold text-green-600">{formatPrice(report.totalProjectedRevenue30d)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Avg ROAS</p><p className="text-2xl font-bold">{report.avgPredictedROAS}x</p></CardContent></Card>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="border-green-200"><CardContent className="pt-4 text-center"><p className="text-sm text-muted-foreground">Scale</p><p className="text-3xl font-bold text-green-600">{report.scaleCount}</p></CardContent></Card>
        <Card className="border-blue-200"><CardContent className="pt-4 text-center"><p className="text-sm text-muted-foreground">Test</p><p className="text-3xl font-bold text-blue-600">{report.testCount}</p></CardContent></Card>
        <Card className="border-yellow-200"><CardContent className="pt-4 text-center"><p className="text-sm text-muted-foreground">Pause</p><p className="text-3xl font-bold text-yellow-600">{report.pauseCount}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Megaphone className="h-5 w-5" /> Campaign Recommendations</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left"><th className="pb-2 pr-3">Product</th><th className="pb-2 pr-3">Action</th><th className="pb-2 pr-3">ROAS</th><th className="pb-2 pr-3">Daily $</th><th className="pb-2 pr-3">30d Rev</th><th className="pb-2">Score</th></tr></thead>
              <tbody>
                {report.recommendations.slice(0, 20).map((r) => (
                  <tr key={r.productId} className="border-b last:border-0">
                    <td className="py-2 pr-3 max-w-[180px] truncate">{r.productName}</td>
                    <td className="py-2 pr-3"><Badge variant={r.campaignAction === 'scale' ? 'default' : r.campaignAction === 'test' ? 'secondary' : 'outline'} className={r.campaignAction === 'scale' ? 'bg-green-600' : ''}>{r.campaignAction}</Badge></td>
                    <td className="py-2 pr-3">{r.predictedROAS}x</td>
                    <td className="py-2 pr-3">{formatPrice(r.suggestedDailyBudget)}</td>
                    <td className="py-2 pr-3">{formatPrice(r.projectedRevenue30d)}</td>
                    <td className="py-2"><Badge variant="outline">{r.qualificationScore}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm text-muted-foreground">Auto-Stop Rules</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">{report.autoStopRules.map((r, i) => <li key={i} className="flex items-center gap-2"><ShieldCheck className="h-3 w-3 text-green-600" />{r}</li>)}</ul>
        </CardContent>
      </Card>
    </div>
  );
}

export default function CommerceIntelligencePage() {
  const [activeTab, setActiveTab] = useState("demand");
  const demandQuery = useDemandReport();

  // Build demand score map for pricing engine
  const demandScores = new Map<string, number>();
  if (demandQuery.data) {
    for (const d of [...demandQuery.data.top20Growth, ...demandQuery.data.decliningProducts, ...demandQuery.data.emergingProducts]) {
      demandScores.set(d.productId, d.score);
    }
  }

  const pricingQuery = usePricingReport(demandScores);

  // Build ads inputs from demand data
  const adsReport = demandQuery.data ? generateAdsReport(
    demandQuery.data.top20Growth.map((d) => ({
      productId: d.productId,
      productName: d.productName,
      slug: d.slug,
      demandScore: d.score,
      revenuePotential30d: d.revenue30d,
      conversionRate: d.signals.conversionRate,
      marginFactor: 0.4, // default 40% margin assumption
      currentPrice: 35, // placeholder, would come from product data
      costPrice: null,
      category: d.category,
      searchIntent: 'commercial' as const,
    }))
  ) : undefined;

  const isLoading = demandQuery.isLoading;

  return (
    <Layout>
      <Helmet>
        <title>Commerce Intelligence | GetPawsy Admin</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Commerce Intelligence Suite</h1>
            <p className="text-muted-foreground text-sm mt-1">Demand prediction • Dynamic pricing • Paid traffic optimization</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-green-600 border-green-300">System Active</Badge>
            {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-3 w-full max-w-md mb-6">
            <TabsTrigger value="demand" className="flex items-center gap-1"><TrendingUp className="h-4 w-4" />Demand</TabsTrigger>
            <TabsTrigger value="pricing" className="flex items-center gap-1"><DollarSign className="h-4 w-4" />Pricing</TabsTrigger>
            <TabsTrigger value="ads" className="flex items-center gap-1"><Megaphone className="h-4 w-4" />Ads</TabsTrigger>
          </TabsList>

          <TabsContent value="demand"><DemandTab report={demandQuery.data} /></TabsContent>
          <TabsContent value="pricing"><PricingTab report={pricingQuery.data} /></TabsContent>
          <TabsContent value="ads"><AdsTab report={adsReport} /></TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
