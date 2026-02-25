import { Helmet } from "react-helmet-async";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RedirectVerifier } from "@/components/admin/edge/RedirectVerifier";
import { EdgeHeadersReport } from "@/components/admin/edge/EdgeHeadersReport";

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
            Implementation Summary: Verifies WWW→Apex 301 redirect correctness (single-hop),
            deterministic Cache-Control headers for HTML/XML/assets, and flags 302s or multi-hop chains.
            Built 2026-02-18 for GSC redirect-error and cache-header compliance.
          </p>
        </div>

        <Tabs defaultValue="redirects" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="redirects">Redirect Verifier</TabsTrigger>
            <TabsTrigger value="headers">Headers Report</TabsTrigger>
          </TabsList>

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
