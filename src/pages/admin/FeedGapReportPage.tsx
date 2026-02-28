import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Navigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, RefreshCw, Loader2, FileDown, AlertTriangle, Package } from "lucide-react";
import { toast } from "sonner";

interface GapProduct {
  id: string;
  title: string;
  reason: string;
  in_stock: boolean;
  price: number | null;
  image_count: number;
  feed_included: boolean;
}

interface GapReport {
  generated_at: string;
  totalProducts: number;
  inFeed: number;
  missingFromFeed: number;
  missingProducts: GapProduct[];
}

const REASON_LABELS: Record<string, string> = {
  is_duplicate: "Duplicate (hidden)",
  out_of_stock: "Out of Stock",
  missing_price: "Missing Price",
  missing_image: "Missing Image",
  inactive: "Inactive",
  other: "Other / Excluded",
};

export default function FeedGapReportPage() {
  const { isAdmin } = useAuth();
  const [report, setReport] = useState<GapReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  if (!isAdmin) return <Navigate to="/" replace />;

  const fetchReport = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/feed-gap-report`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setReport(data);
    } catch (err: any) {
      toast.error(err.message);
    }
    setLoading(false);
  };

  const downloadCsv = async () => {
    setDownloading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/feed-gap-report?format=csv`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `feed-gap-report-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("CSV downloaded");
    } catch (err: any) {
      toast.error(err.message);
    }
    setDownloading(false);
  };

  // Group by reason
  const grouped = report?.missingProducts.reduce<Record<string, GapProduct[]>>((acc, p) => {
    (acc[p.reason] = acc[p.reason] || []).push(p);
    return acc;
  }, {}) || {};

  return (
    <div className="min-h-screen bg-background p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/admin/diagnostics">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <h1 className="text-2xl font-bold">Feed Gap Report</h1>
      </div>

      {/* Summary */}
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Package className="h-5 w-5" />
            Product vs Feed Comparison
          </CardTitle>
          <div className="flex gap-2">
            <Button size="sm" onClick={fetchReport} disabled={loading}>
              {loading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
              Generate Report
            </Button>
            {report && (
              <Button size="sm" variant="outline" onClick={downloadCsv} disabled={downloading}>
                {downloading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <FileDown className="h-3 w-3 mr-1" />}
                Download CSV
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!report && !loading && (
            <p className="text-sm text-muted-foreground">Click "Generate Report" to compare DB products against the live merchant feed.</p>
          )}
          {report && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="border rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold">{report.totalProducts}</p>
                  <p className="text-xs text-muted-foreground">Total Products</p>
                </div>
                <div className="border rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-primary">{report.inFeed}</p>
                  <p className="text-xs text-muted-foreground">In Feed</p>
                </div>
                <div className="border rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-destructive">{report.missingFromFeed}</p>
                  <p className="text-xs text-muted-foreground">Missing from Feed</p>
                </div>
                <div className="border rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold">{((report.inFeed / report.totalProducts) * 100).toFixed(1)}%</p>
                  <p className="text-xs text-muted-foreground">Feed Coverage</p>
                </div>
              </div>

              {/* Grouped breakdown */}
              {Object.entries(grouped).map(([reason, products]) => (
                <div key={reason} className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-accent-foreground" />
                    <span className="font-medium text-sm">{REASON_LABELS[reason] || reason}</span>
                    <Badge variant="secondary">{products.length}</Badge>
                  </div>
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {products.slice(0, 20).map((p) => (
                      <div key={p.id} className="border rounded p-2 text-xs flex items-center justify-between">
                        <span className="truncate max-w-[300px]">{p.title}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">${p.price?.toFixed(2) ?? "—"}</span>
                          <span className="text-muted-foreground">{p.image_count} img</span>
                        </div>
                      </div>
                    ))}
                    {products.length > 20 && (
                      <p className="text-xs text-muted-foreground pl-2">+ {products.length - 20} more…</p>
                    )}
                  </div>
                </div>
              ))}

              <p className="text-xs text-muted-foreground mt-2">
                Generated: {new Date(report.generated_at).toLocaleString()}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
