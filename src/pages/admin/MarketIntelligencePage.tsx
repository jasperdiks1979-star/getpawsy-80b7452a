import { Helmet } from "react-helmet-async";
import { MarketIntelligenceEngine } from "@/components/admin/market-intelligence/MarketIntelligenceEngine";

export default function MarketIntelligencePage() {
  return (
    <>
      <Helmet>
        <title>US Market Intelligence | GetPawsy Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <MarketIntelligenceEngine />
    </>
  );
}