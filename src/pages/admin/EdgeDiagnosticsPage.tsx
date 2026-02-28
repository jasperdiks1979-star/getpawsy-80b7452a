import { Helmet } from "react-helmet-async";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RedirectVerifier } from "@/components/admin/edge/RedirectVerifier";
import { EdgeHeadersReport } from "@/components/admin/edge/EdgeHeadersReport";
import { SeoGateReport } from "@/components/admin/edge/SeoGateReport";

export default function EdgeDiagnosticsPage() {
  return (
    <>
      <Helmet>
        <title>Edge Diagnostics | GetPawsy Admin</title>
      </Helmet>
      <div className="container py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Edge Diagnostics</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Verifies WWW→Apex 301 redirect correctness, cache headers, and SEO gate compliance.
            The SEO Gate tab uses server-side checks for accurate 301/302 status codes.
          </p>
        </div>

        <Tabs defaultValue="seo-gate" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="seo-gate">SEO Gate</TabsTrigger>
            <TabsTrigger value="redirects">Browser Redirects</TabsTrigger>
            <TabsTrigger value="headers">Browser Headers</TabsTrigger>
          </TabsList>

          <TabsContent value="seo-gate" className="mt-4">
            <SeoGateReport />
          </TabsContent>
          <TabsContent value="redirects" className="mt-4">
            <RedirectVerifier />
          </TabsContent>
          <TabsContent value="headers" className="mt-4">
            <EdgeHeadersReport />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
