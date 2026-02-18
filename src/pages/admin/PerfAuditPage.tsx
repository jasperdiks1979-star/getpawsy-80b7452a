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
            Implementation Summary: Verifies LCP element has fetchpriority="high", loading="eager",
            decoding="async", width/height set, no transition/hover classes, and preload tag present.
            Checks initial JS bundle size against 200KB gzip budget. Updated 2026-02-18.
          </p>
        </div>
        <PerfAuditWidget />
      </div>
    </Layout>
  );
}
