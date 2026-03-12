import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Shield, ShieldAlert, ShieldCheck, ScanSearch, Wrench,
  Image as ImageIcon, AlertTriangle, CheckCircle, XCircle,
  RefreshCw, Eye
} from "lucide-react";

interface ComplianceRecord {
  id: string;
  product_id: string;
  image_url: string;
  image_position: number;
  quality_score: string;
  violations: Array<{ type: string; detail: string; severity: string }>;
  is_compliant: boolean;
  scanned_at: string;
}

interface ComplianceReport {
  total_images: number;
  compliant_images: number;
  quality_breakdown: { high: number; medium: number; low: number; pending: number };
  violations_by_type: Record<string, number>;
  total_products_scanned: number;
  fully_compliant_products: number;
  products_with_issues: number;
  records: ComplianceRecord[];
}

export default function ImageCompliancePage() {
  const queryClient = useQueryClient();
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState("");
  const [batchSize, setBatchSize] = useState(10);

  const { data: report, isLoading } = useQuery<ComplianceReport>({
    queryKey: ["image-compliance-report"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await supabase.functions.invoke("image-compliance-scanner", {
        body: { action: "report" },
      });
      if (res.error) throw res.error;
      return res.data?.report;
    },
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      setScanning(true);
      setScanProgress("Starting scan...");
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await supabase.functions.invoke("image-compliance-scanner", {
        body: { action: "scan", batch_size: batchSize },
      });
      if (res.error) throw res.error;
      return res.data?.report;
    },
    onSuccess: (data) => {
      setScanning(false);
      setScanProgress("");
      toast.success(`Scanned ${data?.images_scanned || 0} images across ${data?.products_scanned || 0} products`);
      queryClient.invalidateQueries({ queryKey: ["image-compliance-report"] });
    },
    onError: (err) => {
      setScanning(false);
      setScanProgress("");
      toast.error(`Scan failed: ${err.message}`);
    },
  });

  const autoFixMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await supabase.functions.invoke("image-compliance-scanner", {
        body: { action: "auto_fix" },
      });
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(`Auto-fixed ${data?.fixed || 0} primary images`);
      queryClient.invalidateQueries({ queryKey: ["image-compliance-report"] });
    },
    onError: (err) => toast.error(`Auto-fix failed: ${err.message}`),
  });

  const totalScanned = report?.total_images || 0;
  const complianceRate = totalScanned > 0
    ? Math.round((report!.compliant_images / totalScanned) * 100)
    : 0;

  const getScoreBadge = (score: string) => {
    switch (score) {
      case "high": return <Badge className="bg-green-600 text-white">High</Badge>;
      case "medium": return <Badge className="bg-yellow-500 text-white">Medium</Badge>;
      case "low": return <Badge variant="destructive">Low</Badge>;
      default: return <Badge variant="outline">Pending</Badge>;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "high": return "text-red-500";
      case "medium": return "text-yellow-500";
      case "low": return "text-blue-500";
      default: return "text-muted-foreground";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" /> Image Compliance Scanner
          </h1>
          <p className="text-sm text-muted-foreground">
            AI-powered Google Merchant Center image policy compliance
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={batchSize}
            onChange={(e) => setBatchSize(Number(e.target.value))}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value={5}>5 products</option>
            <option value={10}>10 products</option>
            <option value={25}>25 products</option>
            <option value={50}>50 products</option>
          </select>
          <Button onClick={() => scanMutation.mutate()} disabled={scanning} className="gap-2">
            <ScanSearch className="h-4 w-4" />
            {scanning ? "Scanning..." : "Scan Images"}
          </Button>
          <Button
            variant="outline"
            onClick={() => autoFixMutation.mutate()}
            disabled={autoFixMutation.isPending}
            className="gap-2"
          >
            <Wrench className="h-4 w-4" />
            Auto-Fix Primary
          </Button>
        </div>
      </div>

      {scanning && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <RefreshCw className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm font-medium">{scanProgress || "Scanning product images with AI vision..."}</span>
            </div>
            <Progress value={undefined} className="mt-3" />
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ImageIcon className="h-4 w-4" /> Images Scanned
            </div>
            <p className="text-2xl font-bold mt-1">{totalScanned}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-green-600" /> Compliance Rate
            </div>
            <p className="text-2xl font-bold mt-1">{complianceRate}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle className="h-4 w-4 text-green-600" /> Fully Compliant
            </div>
            <p className="text-2xl font-bold mt-1">{report?.fully_compliant_products || 0}</p>
            <p className="text-xs text-muted-foreground">products</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldAlert className="h-4 w-4 text-red-500" /> Issues Found
            </div>
            <p className="text-2xl font-bold mt-1">{report?.products_with_issues || 0}</p>
            <p className="text-xs text-muted-foreground">products</p>
          </CardContent>
        </Card>
      </div>

      {/* Quality Breakdown */}
      {report && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quality Distribution</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500" /> High (Merchant Safe)
                </span>
                <span className="font-bold">{report.quality_breakdown.high}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-yellow-500" /> Medium (Acceptable)
                </span>
                <span className="font-bold">{report.quality_breakdown.medium}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500" /> Low (Risk of Disapproval)
                </span>
                <span className="font-bold">{report.quality_breakdown.low}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-gray-300" /> Pending
                </span>
                <span className="font-bold">{report.quality_breakdown.pending}</span>
              </div>

              {totalScanned > 0 && (
                <div className="mt-4">
                  <div className="flex gap-0.5 h-4 rounded-full overflow-hidden">
                    {report.quality_breakdown.high > 0 && (
                      <div
                        className="bg-green-500"
                        style={{ width: `${(report.quality_breakdown.high / totalScanned) * 100}%` }}
                      />
                    )}
                    {report.quality_breakdown.medium > 0 && (
                      <div
                        className="bg-yellow-500"
                        style={{ width: `${(report.quality_breakdown.medium / totalScanned) * 100}%` }}
                      />
                    )}
                    {report.quality_breakdown.low > 0 && (
                      <div
                        className="bg-red-500"
                        style={{ width: `${(report.quality_breakdown.low / totalScanned) * 100}%` }}
                      />
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Violations by Type</CardTitle>
            </CardHeader>
            <CardContent>
              {report.violations_by_type && Object.keys(report.violations_by_type).length > 0 ? (
                <div className="space-y-2">
                  {Object.entries(report.violations_by_type)
                    .sort(([, a], [, b]) => b - a)
                    .map(([type, count]) => (
                      <div key={type} className="flex items-center justify-between text-sm">
                        <span className="capitalize">{type.replace(/_/g, " ")}</span>
                        <Badge variant="outline">{count}</Badge>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No violations detected yet. Run a scan first.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Image Details Table */}
      {report?.records && report.records.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Eye className="h-5 w-5" /> Scanned Images
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {report.records
                .filter(r => !r.is_compliant)
                .slice(0, 50)
                .map((record) => (
                  <div
                    key={record.id}
                    className="flex gap-3 p-3 rounded-lg border bg-card"
                  >
                    <img
                      src={record.image_url}
                      alt="Product"
                      className="w-16 h-16 object-cover rounded border"
                      onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {getScoreBadge(record.quality_score)}
                        <Badge variant="outline" className="text-xs">
                          {record.image_position === 0 ? "Primary" : `Additional #${record.image_position}`}
                        </Badge>
                        {record.is_compliant ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                      </div>
                      {record.violations?.length > 0 && (
                        <div className="space-y-0.5">
                          {record.violations.map((v, i) => (
                            <div key={i} className="flex items-start gap-1">
                              <AlertTriangle className={`h-3 w-3 mt-0.5 flex-shrink-0 ${getSeverityColor(v.severity)}`} />
                              <span className="text-xs text-muted-foreground">
                                <strong className="capitalize">{v.type.replace(/_/g, " ")}</strong>: {v.detail}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              {report.records.filter(r => !r.is_compliant).length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <ShieldCheck className="h-8 w-8 mx-auto mb-2 text-green-500" />
                  <p>All scanned images are compliant!</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {!report && !isLoading && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <ScanSearch className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="font-semibold mb-2">No compliance data yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Run a scan to analyze your product images for Google Shopping compliance.
            </p>
            <Button onClick={() => scanMutation.mutate()} disabled={scanning}>
              Start First Scan
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
