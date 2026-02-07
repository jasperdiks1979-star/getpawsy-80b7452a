import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const ProductCsvExport = () => {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error("You must be logged in");
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(
        `${supabaseUrl}/functions/v1/export-products-csv`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Export failed");
      }

      const total = response.headers.get("X-Export-Total") || "?";
      const duplicates = response.headers.get("X-Export-Duplicates") || "0";
      const inactive = response.headers.get("X-Export-Inactive") || "0";

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const today = new Date().toISOString().split("T")[0];
      a.href = url;
      a.download = `getpawsy_full_product_export_${today}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(
        `Exported ${total} products (${duplicates} duplicates, ${inactive} inactive)`
      );
    } catch (error: any) {
      console.error("CSV export error:", error);
      toast.error(error.message || "CSV export failed");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button
      onClick={handleExport}
      disabled={isExporting}
      variant="outline"
      className="gap-2"
    >
      {isExporting ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Exporting...
        </>
      ) : (
        <>
          <FileDown className="h-4 w-4" />
          Download Full Product CSV
        </>
      )}
    </Button>
  );
};
