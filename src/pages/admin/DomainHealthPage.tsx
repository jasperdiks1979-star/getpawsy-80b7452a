import { Helmet } from "react-helmet-async";
import { DomainHealthChecker } from "@/components/admin/domain/DomainHealthChecker";

export default function DomainHealthPage() {
  return (
    <>
      <Helmet>
        <title>Domain & Redirect Health | GetPawsy Admin</title>
      </Helmet>
      <div className="container py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Domain & Redirect Health</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Server-side redirect chain checker. Verifies WWW→Apex is 301 (not 302),
            lovable.app→Apex is 301, and apex returns 200. Shows full hop chain with
            edge headers (server, cf-ray, cache-control).
          </p>
        </div>
        <DomainHealthChecker />
      </div>
    </>
  );
}
