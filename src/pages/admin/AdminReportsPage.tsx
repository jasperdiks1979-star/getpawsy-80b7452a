import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileText, Download, Eye, ArrowLeft } from "lucide-react";
import { NavLink } from "@/components/NavLink";

interface ReportItem {
  filename: string;
  title: string;
  category: string;
  path: string;
}

const REPORTS: ReportItem[] = [
  {
    filename: "GetPawsy_Boardroom_Investor_Report.pdf",
    title: "GetPawsy Boardroom Investor Report",
    category: "SEO & Authority Strategy",
    path: "/admin-reports/GetPawsy_Boardroom_Investor_Report.pdf",
  },
];

// Dynamic PDF reports (generated client-side)
import { ComplianceAuditDownload } from "@/components/admin/ComplianceAuditDownload";

const AdminReportsPage = () => {
  const { isAdmin, isLoading } = useAuth();
  const [previewReport, setPreviewReport] = useState<ReportItem | null>(null);

  if (isLoading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex items-center gap-3 mb-8">
          <NavLink to="/dashboard" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </NavLink>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Reports</h1>
            <p className="text-sm text-muted-foreground">Internal documents & strategy reports</p>
          </div>
        </div>

        <div className="grid gap-4">
          {REPORTS.map((report) => (
            <Card key={report.filename}>
              <CardHeader className="flex flex-row items-start gap-4 space-y-0">
                <div className="rounded-lg bg-primary/10 p-3">
                  <FileText className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-lg">{report.title}</CardTitle>
                  <CardDescription className="mt-1">{report.category}</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => setPreviewReport(report)}
                  >
                    <Eye className="h-4 w-4" />
                    Preview
                  </Button>
                  <Button
                    size="sm"
                    className="gap-2"
                    asChild
                  >
                    <a href={report.path} download={report.filename}>
                      <Download className="h-4 w-4" />
                      Download
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Generated Reports */}
        <Card>
          <CardHeader className="flex flex-row items-start gap-4 space-y-0">
            <div className="rounded-lg bg-primary/10 p-3">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-lg">Google Merchant Center Compliance Audit</CardTitle>
              <CardDescription className="mt-1">Full 13-step compliance audit report — generated live</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ComplianceAuditDownload />
          </CardContent>
        </Card>
      </div>

      {/* PDF Preview Modal */}
      <Dialog open={!!previewReport} onOpenChange={() => setPreviewReport(null)}>
        <DialogContent className="max-w-4xl w-[95vw] h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle>{previewReport?.title}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 px-6 pb-6">
            {previewReport && (
              <iframe
                src={previewReport.path}
                title={previewReport.title}
                className="w-full h-full rounded-md border"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminReportsPage;
