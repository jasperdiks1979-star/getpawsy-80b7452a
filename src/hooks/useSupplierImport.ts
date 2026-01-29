import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ImportResult {
  success: boolean;
  supplier?: string;
  summary?: {
    total: number;
    imported: number;
    failed: number;
    skipped: number;
  };
  errors?: Array<{ row: number; error: string }>;
  error?: string;
}

interface SupplierProduct {
  id: string;
  supplier: string;
  supplier_product_id: string;
  product_name: string;
  description: string | null;
  category: string | null;
  brand: string | null;
  cost_price: number;
  msrp: number | null;
  weight: number | null;
  image_url: string | null;
  sku: string | null;
  stock_status: string;
  shipping_time: string;
  created_at: string;
}

interface ProductMatch {
  product: {
    id: string;
    name: string;
    cost_price: number | null;
    price: number;
    shipping_time: string | null;
  };
  potentialMatches: Array<{
    id: string;
    supplier: string;
    product_name: string;
    cost_price: number;
    shipping_time: string;
    match_score: number;
  }>;
}

export function useSupplierImport() {
  const [isImporting, setIsImporting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const importCSV = async (
    csvContent: string,
    filename: string,
    supplier?: "topdawg" | "petdropshipper"
  ): Promise<ImportResult> => {
    setIsImporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-supplier-csv`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            action: "import",
            csvContent,
            filename,
            supplier,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Import failed");
      }

      toast({
        title: "Import geslaagd",
        description: `${result.summary.imported} producten geïmporteerd van ${result.supplier}`,
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import mislukt";
      toast({
        title: "Import fout",
        description: message,
        variant: "destructive",
      });
      return { success: false, error: message };
    } finally {
      setIsImporting(false);
    }
  };

  const listProducts = async (
    supplier?: string,
    search?: string,
    limit = 50,
    offset = 0
  ): Promise<{ products: SupplierProduct[]; total: number }> => {
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-supplier-csv`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            action: "list",
            supplier,
            search,
            limit,
            offset,
          }),
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      return { products: result.products || [], total: result.total || 0 };
    } catch (error) {
      console.error("Failed to list products:", error);
      return { products: [], total: 0 };
    } finally {
      setIsLoading(false);
    }
  };

  const findMatches = async (): Promise<ProductMatch[]> => {
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-supplier-csv`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ action: "find-matches" }),
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      return result.matches || [];
    } catch (error) {
      console.error("Failed to find matches:", error);
      toast({
        title: "Fout",
        description: "Kon geen matches vinden",
        variant: "destructive",
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  const switchSupplier = async (
    productId: string,
    supplierProductId: string
  ): Promise<boolean> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-supplier-csv`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            action: "switch-supplier",
            productId,
            supplierProductId,
          }),
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      toast({
        title: "Leverancier gewisseld",
        description: result.message,
      });

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Wisselen mislukt";
      toast({
        title: "Fout",
        description: message,
        variant: "destructive",
      });
      return false;
    }
  };

  const importDiscontinuedList = async (
    csvContent: string
  ): Promise<{ success: boolean; summary?: { total: number; imported: number; skipped: number } }> => {
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-supplier-csv`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            action: "import-discontinued",
            csvContent,
          }),
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      toast({
        title: "Discontinued lijst geïmporteerd",
        description: `${result.summary.imported} producten toegevoegd aan discontinued lijst`,
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import mislukt";
      toast({
        title: "Import fout",
        description: message,
        variant: "destructive",
      });
      return { success: false };
    } finally {
      setIsLoading(false);
    }
  };

  const checkDiscontinued = async (): Promise<{
    discontinuedCount: number;
    affectedProducts: Array<{
      id: string;
      name: string;
      sku: string;
      supplier: string;
      discontinuedMatch: string;
    }>;
  }> => {
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-supplier-csv`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ action: "check-discontinued" }),
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      return {
        discontinuedCount: result.discontinuedCount || 0,
        affectedProducts: result.affectedProducts || [],
      };
    } catch (error) {
      console.error("Failed to check discontinued:", error);
      return { discontinuedCount: 0, affectedProducts: [] };
    } finally {
      setIsLoading(false);
    }
  };

  const addToShop = async (
    supplierProductIds: string[],
    priceMultiplier: number = 2.5
  ): Promise<{
    success: boolean;
    summary?: { total: number; added: number; skipped: number };
    results?: Array<{ name: string; success: boolean; error?: string; productId?: string }>;
  }> => {
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-supplier-csv`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            action: "add-to-shop",
            supplierProductIds,
            priceMultiplier,
          }),
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      toast({
        title: "Producten toegevoegd",
        description: `${result.summary.added} producten toegevoegd aan de shop`,
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Toevoegen mislukt";
      toast({
        title: "Fout",
        description: message,
        variant: "destructive",
      });
      return { success: false };
    } finally {
      setIsLoading(false);
    }
  };

  const addManualProduct = async (
    product: {
      product_name: string;
      cost_price: string;
      sku?: string;
      description?: string;
      category?: string;
      brand?: string;
      image_url?: string;
      weight?: string;
      shipping_time?: string;
      supplier?: string;
    },
    addToShopNow: boolean = false,
    priceMultiplier: number = 2.5
  ): Promise<{ success: boolean; supplierProduct?: any; shopProduct?: any; error?: string }> => {
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-supplier-csv`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            action: "add-manual",
            product,
            addToShopNow,
            priceMultiplier,
          }),
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      toast({
        title: "Product toegevoegd",
        description: result.message,
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Toevoegen mislukt";
      toast({
        title: "Fout",
        description: message,
        variant: "destructive",
      });
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  };

  const importFromUrl = async (
    url: string,
    addToShopNow: boolean = false,
    priceMultiplier: number = 2.5
  ): Promise<{ 
    success: boolean; 
    supplierProduct?: any; 
    shopProduct?: any; 
    extractedData?: any;
    error?: string 
  }> => {
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-from-url`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            url,
            addToShop: addToShopNow,
            priceMultiplier,
          }),
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      toast({
        title: "Product geïmporteerd",
        description: result.message,
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import mislukt";
      toast({
        title: "Import fout",
        description: message,
        variant: "destructive",
      });
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  };

  return {
    importCSV,
    listProducts,
    findMatches,
    switchSupplier,
    importDiscontinuedList,
    checkDiscontinued,
    addToShop,
    addManualProduct,
    importFromUrl,
    isImporting,
    isLoading,
  };
}
