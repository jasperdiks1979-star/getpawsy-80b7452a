import { Helmet } from "react-helmet-async";
import { GrowthIntelligenceEngine } from "@/components/admin/growth-engine/GrowthIntelligenceEngine";

export default function GrowthIntelligencePage() {
  return (
    <>
      <Helmet>
        <title>Growth Intelligence Engine | GetPawsy Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <GrowthIntelligenceEngine />
    </>
  );
}
