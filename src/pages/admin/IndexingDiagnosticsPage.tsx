import { Layout } from "@/components/layout/Layout";
import { Helmet } from "react-helmet-async";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UrlCrawler } from "@/components/admin/indexing/UrlCrawler";
import { LiveProbe } from "@/components/admin/indexing/LiveProbe";
import { StructuredDataValidator } from "@/components/admin/indexing/StructuredDataValidator";
import { HeadersReport } from "@/components/admin/indexing/HeadersReport";

export default function IndexingDiagnosticsPage() {
  return (
    <Layout>
      <Helmet>
        <title>Indexing Diagnostics | GetPawsy Admin</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="container py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Indexing Diagnostics</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Implementation Summary: Crawls sitemaps &amp; robots.txt to detect 4xx, redirect chains, soft-404s,
            canonical mismatches, and robots blocks. Schema Validator enforces penalty-safe mode (no fake reviews).
            Headers Report checks Cache-Control for HTML/XML/assets. Updated 2026-02-18.
          </p>
        </div>

        <Tabs defaultValue="crawler" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="crawler">URL Crawler</TabsTrigger>
            <TabsTrigger value="probe">Live Probe</TabsTrigger>
            <TabsTrigger value="schema">Schema Validator</TabsTrigger>
            <TabsTrigger value="headers">Headers Report</TabsTrigger>
          </TabsList>

          <TabsContent value="crawler" className="mt-4">
            <UrlCrawler />
          </TabsContent>
          <TabsContent value="probe" className="mt-4">
            <LiveProbe />
          </TabsContent>
          <TabsContent value="schema" className="mt-4">
            <StructuredDataValidator />
          </TabsContent>
          <TabsContent value="headers" className="mt-4">
            <HeadersReport />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
