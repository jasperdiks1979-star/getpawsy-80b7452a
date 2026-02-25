import { CrawlDiagnosticsDashboard } from "@/components/admin/CrawlDiagnosticsDashboard";
import { Helmet } from "react-helmet-async";

export default function CrawlDiagnosticsDashboardPage() {
  return (
    <>
      <Helmet>
        <title>Crawl Diagnostics | GetPawsy Admin</title>
        <meta name="description" content="Monitor crawl efficiency, indexation health, and duplicate suppression" />
      </Helmet>
      <CrawlDiagnosticsDashboard />
    </>
  );
}
