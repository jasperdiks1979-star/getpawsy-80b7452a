import { Helmet } from "react-helmet-async";
import { MarketIntelligenceEngine } from "@/components/admin/market-intelligence/MarketIntelligenceEngine";
import { MarketCompetitorPanel } from "@/components/admin/market-intelligence/MarketCompetitorPanel";
import { MarketSignalPanel } from "@/components/admin/market-intelligence/MarketSignalPanel";
import { MarketTrendsPanel } from "@/components/admin/market-intelligence/MarketTrendsPanel";
import { MarketRecommendationsPanel } from "@/components/admin/market-intelligence/MarketRecommendationsPanel";
import { MarketGapActionsPanel } from "@/components/admin/market-intelligence/MarketGapActionsPanel";

export default function MarketIntelligencePage() {
  return (
    <>
      <Helmet>
        <title>US Market Intelligence | GetPawsy Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <div className="space-y-6">
        <MarketSignalPanel />
        <MarketCompetitorPanel />
        <MarketGapActionsPanel />
        <MarketTrendsPanel />
        <MarketRecommendationsPanel />
        <MarketIntelligenceEngine />
      </div>
    </>
  );
}