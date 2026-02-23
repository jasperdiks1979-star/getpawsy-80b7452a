import { Layout } from "@/components/layout/Layout";
import { Helmet } from "react-helmet-async";
import { GrowthIntelligenceDashboard } from "@/components/admin/GrowthIntelligenceDashboard";

export default function GrowthIntelligencePage() {
  return (
    <Layout>
      <Helmet>
        <title>Growth Intelligence | GetPawsy Admin</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <GrowthIntelligenceDashboard />
    </Layout>
  );
}
