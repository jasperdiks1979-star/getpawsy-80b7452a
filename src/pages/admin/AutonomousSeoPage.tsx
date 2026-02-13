import { AutonomousSeoSystem } from "@/components/admin/AutonomousSeoSystem";
import { Layout } from "@/components/layout/Layout";
import { Helmet } from "react-helmet-async";

export default function AutonomousSeoPage() {
  return (
    <Layout>
      <Helmet>
        <title>Autonomous SEO AI | GetPawsy Admin</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <AutonomousSeoSystem />
    </Layout>
  );
}
