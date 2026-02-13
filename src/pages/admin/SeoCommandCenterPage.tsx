import { SeoCommandCenter } from "@/components/admin/SeoCommandCenter";
import { Layout } from "@/components/layout/Layout";
import { Helmet } from "react-helmet-async";

export default function SeoCommandCenterPage() {
  return (
    <Layout>
      <Helmet>
        <title>SEO Command Center | GetPawsy Admin</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <SeoCommandCenter />
    </Layout>
  );
}
