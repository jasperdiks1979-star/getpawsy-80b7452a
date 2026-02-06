import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, BookOpen } from "lucide-react";
import { downloadAdminManualPdf } from "@/utils/adminManualPdf";
import { toast } from "sonner";

export const AdminManualDownload = () => {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownload = async () => {
    setIsGenerating(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 100));
      downloadAdminManualPdf();
      toast.success("Admin & Compliance Guide downloaded!");
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Could not generate PDF");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Button
      onClick={handleDownload}
      disabled={isGenerating}
      className="gap-2"
    >
      {isGenerating ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Generating...
        </>
      ) : (
        <>
          <BookOpen className="h-4 w-4" />
          Download Admin & Compliance Guide (PDF)
        </>
      )}
    </Button>
  );
};
