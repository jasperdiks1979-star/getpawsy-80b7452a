import { CRODashboard } from "@/components/admin/CRODashboard";
import { Layout } from "@/components/layout/Layout";
import { Helmet } from "react-helmet-async";

export default function CRODashboardPage() {
  return (
    <Layout>
      <Helmet>
        <title>CRO & Revenue Dashboard | GetPawsy Admin</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <CRODashboard />
    </Layout>
  );
}
