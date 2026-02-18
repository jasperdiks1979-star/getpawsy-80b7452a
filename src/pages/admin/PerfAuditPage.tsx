import { Layout } from "@/components/layout/Layout";
import { Helmet } from "react-helmet-async";
import { PerfAuditWidget } from "@/components/admin/perf/PerfAuditWidget";

export default function PerfAuditPage() {
  return (
    <Layout>
      <Helmet>
        <title>Performance Audit | GetPawsy Admin</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="container py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Performance Audit</h1>
          <p className="text-sm text-muted-foreground mt-1">
            In-browser LCP/performance checks. Built 2026-02-18 for mobile 95+ Lighthouse target.
          </p>
        </div>
        <PerfAuditWidget />
      </div>
    </Layout>
  );
}
