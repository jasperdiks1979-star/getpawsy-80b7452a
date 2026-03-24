import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileDown, Loader2, Filter } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type ExportMode = "full" | "canonical" | "merchant";

async function downloadCsv(mode: ExportMode) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const endpoint = mode === "merchant"
    ? `${supabaseUrl}/functions/v1/export-merchant-feed?format=csv`
    : `${supabaseUrl}/functions/v1/export-products-csv?mode=${mode}`;
  const res = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Export failed" }));
    throw new Error(err.error || "Export failed");
  }

  const total = res.headers.get("X-Export-Total") || "?";
  const duplicates = res.headers.get("X-Export-Duplicates") || "0";
  const inactive = res.headers.get("X-Export-Inactive") || "0";

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const today = new Date().toISOString().split("T")[0];
  a.href = url;
  a.download =
    mode === "canonical"
      ? `getpawsy_canonical_product_export_${today}.csv`
      : `getpawsy_full_product_export_${today}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return { total, duplicates, inactive };
}

export const ProductCsvExport = () => {
  const [loadingFull, setLoadingFull] = useState(false);
  const [loadingCanonical, setLoadingCanonical] = useState(false);

  const handleExport = async (mode: ExportMode) => {
    const setLoading = mode === "full" ? setLoadingFull : setLoadingCanonical;
    setLoading(true);
    try {
      const { total, duplicates, inactive } = await downloadCsv(mode);
      toast.success(
        mode === "full"
          ? `Full export: ${total} products (${duplicates} duplicates, ${inactive} inactive)`
          : `Canonical export: ${total} storefront-visible products`
      );
    } catch (error: any) {
      console.error("CSV export error:", error);
      toast.error(error.message || "CSV export failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        onClick={() => handleExport("full")}
        disabled={loadingFull || loadingCanonical}
        variant="outline"
        size="sm"
        className="gap-2"
      >
        {loadingFull ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FileDown className="h-4 w-4" />
        )}
        Full CSV (incl. duplicates)
      </Button>
      <Button
        onClick={() => handleExport("canonical")}
        disabled={loadingFull || loadingCanonical}
        variant="outline"
        size="sm"
        className="gap-2"
      >
        {loadingCanonical ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Filter className="h-4 w-4" />
        )}
        Canonical CSV
      </Button>
    </div>
  );
};
