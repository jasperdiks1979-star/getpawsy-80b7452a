import { RevenueScalingBlueprint } from "@/components/admin/RevenueScalingBlueprint";
import { Layout } from "@/components/layout/Layout";
import { Helmet } from "react-helmet-async";

export default function RevenueScalingPage() {
  return (
    <Layout>
      <Helmet>
        <title>12-Month Revenue Scaling | GetPawsy Admin</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <RevenueScalingBlueprint />
    </Layout>
  );
}
