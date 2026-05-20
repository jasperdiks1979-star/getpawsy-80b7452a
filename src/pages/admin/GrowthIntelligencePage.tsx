import { Helmet } from "react-helmet-async";
import { GrowthIntelligenceEngine } from "@/components/admin/growth-engine/GrowthIntelligenceEngine";
import { GrowthAutopilotConsole } from "@/components/admin/growth-intelligence/GrowthAutopilotConsole";
import { GrowthHealthPanel } from "@/components/admin/growth-intelligence/GrowthHealthPanel";
import { GrowthLearningPanel } from "@/components/admin/growth-intelligence/GrowthLearningPanel";
import { GrowthSchedulePanel } from "@/components/admin/growth-intelligence/GrowthSchedulePanel";
import { GrowthStrategyDashboard } from "@/components/admin/growth-intelligence/GrowthStrategyDashboard";

export default function GrowthIntelligencePage() {
  return (
    <>
      <Helmet>
        <title>Growth Intelligence Engine | GetPawsy Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <div className="space-y-8">
        <GrowthAutopilotConsole />
        <GrowthStrategyDashboard />
        <GrowthSchedulePanel />
        <GrowthLearningPanel />
        <GrowthHealthPanel />
        <GrowthIntelligenceEngine />
      </div>
    </>
  );
}
