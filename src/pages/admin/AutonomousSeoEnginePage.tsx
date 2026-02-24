import { AutonomousSeoEngine } from "@/components/admin/AutonomousSeoEngineUI";
import { Layout } from "@/components/layout/Layout";
import { Helmet } from "react-helmet-async";

export default function AutonomousSeoEnginePage() {
  return (
    <Layout>
      <Helmet>
        <title>Autonomous SEO Engine | GetPawsy Admin</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <AutonomousSeoEngine />
    </Layout>
  );
}
