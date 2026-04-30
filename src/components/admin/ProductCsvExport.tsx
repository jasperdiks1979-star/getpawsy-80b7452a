import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileDown, Loader2, Filter, FileX2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type ExportMode = "full" | "canonical" | "merchant" | "excluded";

async function downloadCsv(mode: ExportMode) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const endpoint =
    mode === "merchant"
      ? `${supabaseUrl}/functions/v1/export-merchant-feed?format=csv`
      : mode === "excluded"
        ? `${supabaseUrl}/functions/v1/export-merchant-feed?format=excluded-csv`
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
  const excluded = res.headers.get("X-Excluded-Total") || "0";

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const today = new Date().toISOString().split("T")[0];
  a.href = url;
  a.download =
    mode === "merchant"
      ? `getpawsy_merchant_feed_${today}.csv`
      : mode === "excluded"
        ? `getpawsy_merchant_excluded_${today}.csv`
      : mode === "canonical"
        ? `getpawsy_canonical_product_export_${today}.csv`
        : `getpawsy_full_product_export_${today}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return { total, duplicates, inactive, excluded };
}

export const ProductCsvExport = () => {
  const [loadingFull, setLoadingFull] = useState(false);
  const [loadingCanonical, setLoadingCanonical] = useState(false);
  const [loadingMerchant, setLoadingMerchant] = useState(false);
  const [loadingExcluded, setLoadingExcluded] = useState(false);

  const handleExport = async (mode: ExportMode) => {
    const setLoading =
      mode === "merchant" ? setLoadingMerchant
      : mode === "excluded" ? setLoadingExcluded
      : mode === "full" ? setLoadingFull
      : setLoadingCanonical;
    setLoading(true);
    try {
      const { total, duplicates, inactive, excluded } = await downloadCsv(mode);
      toast.success(
        mode === "merchant"
          ? `Merchant feed: ${total} Google-optimized products exported`
          : mode === "excluded"
            ? `Excluded export: ${excluded} products with reason codes`
          : mode === "full"
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
        disabled={loadingFull || loadingCanonical || loadingMerchant}
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
      <Button
        onClick={() => handleExport("merchant")}
        disabled={loadingFull || loadingCanonical || loadingMerchant || loadingExcluded}
        variant="default"
        size="sm"
        className="gap-2"
      >
        {loadingMerchant ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FileDown className="h-4 w-4" />
        )}
        Google Merchant Feed
      </Button>
      <Button
        onClick={() => handleExport("excluded")}
        disabled={loadingFull || loadingCanonical || loadingMerchant || loadingExcluded}
        variant="outline"
        size="sm"
        className="gap-2"
      >
        {loadingExcluded ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FileX2 className="h-4 w-4" />
        )}
        Excluded CSV (with reasons)
      </Button>
    </div>
  );
};
