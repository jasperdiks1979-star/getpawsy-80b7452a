import { Helmet } from "react-helmet-async";
import { GrowthIntelligenceEngine } from "@/components/admin/growth-engine/GrowthIntelligenceEngine";
import { GrowthAutopilotConsole } from "@/components/admin/growth-intelligence/GrowthAutopilotConsole";

export default function GrowthIntelligencePage() {
  return (
    <>
      <Helmet>
        <title>Growth Intelligence Engine | GetPawsy Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <div className="space-y-8">
        <GrowthAutopilotConsole />
        <GrowthIntelligenceEngine />
      </div>
    </>
  );
}
