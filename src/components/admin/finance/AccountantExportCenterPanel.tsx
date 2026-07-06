import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

type ExportType = "excel" | "csv" | "pdf" | "json" | "audit_package" | "vat_quarter" | "missing_evidence";

const OPTIONS: Array<{ key: ExportType; label: string; desc: string }> = [
  { key: "excel", label: "Excel (CSV bundle)", desc: "All sections as spreadsheet-compatible CSV" },
  { key: "csv", label: "CSV", desc: "Flat CSV bundle" },
  { key: "pdf", label: "PDF summary", desc: "Text summary for print/share" },
  { key: "json", label: "JSON", desc: "Full machine-readable bundle" },
  { key: "audit_package", label: "Accountant audit package", desc: "Everything an accountant needs, one download" },
  { key: "vat_quarter", label: "VAT quarter package", desc: "Filtered to current/selected quarter" },
  { key: "missing_evidence", label: "Missing evidence package", desc: "Only open finance tasks" },
];

function download(filename: string, mime: string, text: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function AccountantExportCenterPanel({ entityId }: { entityId: string | null }) {
  const [busy, setBusy] = useState<ExportType | null>(null);

  const run = async (type: ExportType) => {
    setBusy(type);
    try {
      const { data, error } = await supabase.functions.invoke("finance-accountant-export", {
        body: { export_type: type, entity_id: entityId },
      });
      if (error) throw error;
      const payload = (data as any)?.payload;
      const filename = (data as any)?.filename ?? `finance_${type}.json`;
      const mime = (data as any)?.mime ?? "application/json";
      const text = typeof payload === "string"
        ? payload
        : payload?.csv ?? payload?.summary ?? JSON.stringify(payload ?? data, null, 2);
      download(filename, mime, text);
      toast.success(`Exported ${type}`);
    } catch (e) {
      toast.error(`Export failed: ${String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileDown className="h-4 w-4" /> Accountant Export Center
          <Badge variant="outline" className="ml-2">D4</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Every export includes invoices, payments, VAT classifications, reconciliation matches, supplier profiles, subscriptions, open finance tasks, assumptions, confidence labels and source document references. This tool never files a tax return.
        </p>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2">
        {OPTIONS.map((o) => (
          <div key={o.key} className="flex items-start justify-between gap-2 rounded-md border p-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">{o.label}</div>
              <div className="text-xs text-muted-foreground">{o.desc}</div>
            </div>
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => run(o.key)}>
              {busy === o.key ? <Loader2 className="h-3 w-3 animate-spin" /> : "Export"}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}