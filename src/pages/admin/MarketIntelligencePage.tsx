import { Helmet } from "react-helmet-async";
import { MarketIntelligenceEngine } from "@/components/admin/market-intelligence/MarketIntelligenceEngine";
import { MarketSignalPanel } from "@/components/admin/market-intelligence/MarketSignalPanel";

export default function MarketIntelligencePage() {
  return (
    <>
      <Helmet>
        <title>US Market Intelligence | GetPawsy Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <div className="space-y-6">
        <MarketSignalPanel />
        <MarketIntelligenceEngine />
      </div>
    </>
  );
}