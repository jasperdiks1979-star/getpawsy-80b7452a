import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileDown, Loader2 } from "lucide-react";
import { downloadComplianceAuditPdf } from "@/utils/complianceAuditPdf";
import { toast } from "sonner";

export const ComplianceAuditDownload = () => {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownload = async () => {
    setIsGenerating(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 100));
      downloadComplianceAuditPdf();
      toast.success("Compliance Audit PDF downloaded!");
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Could not generate PDF");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Button onClick={handleDownload} disabled={isGenerating} variant="outline" className="gap-2">
      {isGenerating ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Generating...
        </>
      ) : (
        <>
          <FileDown className="h-4 w-4" />
          Download Compliance Audit (PDF)
        </>
      )}
    </Button>
  );
};
