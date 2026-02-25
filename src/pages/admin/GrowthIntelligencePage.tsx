import { Helmet } from "react-helmet-async";
import { GrowthIntelligenceDashboard } from "@/components/admin/GrowthIntelligenceDashboard";

export default function GrowthIntelligencePage() {
  return (
    <>
      <Helmet>
        <title>Growth Intelligence | GetPawsy Admin</title>
      </Helmet>
      <GrowthIntelligenceDashboard />
    </>
  );
}
