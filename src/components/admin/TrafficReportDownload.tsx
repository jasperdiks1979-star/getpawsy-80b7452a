import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileDown, Loader2 } from "lucide-react";
import { downloadTrafficReportPdf } from "@/utils/trafficReportPdf";
import { toast } from "sonner";

export const TrafficReportDownload = () => {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownload = async () => {
    setIsGenerating(true);
    try {
      await downloadTrafficReportPdf();
      toast.success("PDF rapport gedownload!");
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Kon PDF niet genereren");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Button
      onClick={handleDownload}
      disabled={isGenerating}
      variant="outline"
      className="gap-2"
    >
      {isGenerating ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Genereren...
        </>
      ) : (
        <>
          <FileDown className="h-4 w-4" />
          Download PDF Rapport
        </>
      )}
    </Button>
  );
};
