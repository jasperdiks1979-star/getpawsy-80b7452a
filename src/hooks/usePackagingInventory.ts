import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface PackagingInventoryItem {
  id: string;
  item_type: string;
  item_name: string;
  quantity: number;
  reorder_threshold: number;
  unit_cost: number | null;
  last_restocked_at: string | null;
  notes: string | null;
  cj_product_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PackagingInventoryLog {
  id: string;
  inventory_id: string | null;
  item_type: string;
  change_amount: number;
  change_type: string;
  order_id: string | null;
  notes: string | null;
  created_at: string;
}

export const usePackagingInventory = () => {
  return useQuery({
    queryKey: ["packaging-inventory"],
    queryFn: async (): Promise<PackagingInventoryItem[]> => {
      const { data, error } = await supabase
        .from("packaging_inventory")
        .select("*")
        .order("item_type");

      if (error) throw error;
      return data || [];
    },
  });
};

export const usePackagingInventoryLogs = (limit = 50) => {
  return useQuery({
    queryKey: ["packaging-inventory-logs", limit],
    queryFn: async (): Promise<PackagingInventoryLog[]> => {
      const { data, error } = await supabase
        .from("packaging_inventory_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    },
  });
};

export const useUpdateInventory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      itemType,
      quantity,
      changeType,
      notes,
    }: {
      itemType: string;
      quantity: number;
      changeType: "restock" | "manual_adjustment";
      notes?: string;
    }) => {
      // Get current inventory item
      const { data: item, error: fetchError } = await supabase
        .from("packaging_inventory")
        .select("*")
        .eq("item_type", itemType)
        .single();

      if (fetchError) throw fetchError;

      const newQuantity =
        changeType === "restock"
          ? item.quantity + quantity
          : quantity;

      // Update inventory
      const { error: updateError } = await supabase
        .from("packaging_inventory")
        .update({
          quantity: newQuantity,
          last_restocked_at:
            changeType === "restock" ? new Date().toISOString() : item.last_restocked_at,
        })
        .eq("id", item.id);

      if (updateError) throw updateError;

      // Log the change (via service role - need edge function for this)
      // For now we skip logging from client as we don't have service role access

      return { itemType, newQuantity };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["packaging-inventory"] });
      queryClient.invalidateQueries({ queryKey: ["packaging-inventory-logs"] });
      toast.success(`Voorraad voor ${data.itemType} bijgewerkt naar ${data.newQuantity}`);
    },
    onError: (error) => {
      console.error("Failed to update inventory:", error);
      toast.error("Kon voorraad niet bijwerken");
    },
  });
};

export const useDeductInventory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      deductions,
    }: {
      deductions: { itemType: string; amount: number }[];
    }) => {
      for (const { itemType, amount } of deductions) {
        const { data: item, error: fetchError } = await supabase
          .from("packaging_inventory")
          .select("*")
          .eq("item_type", itemType)
          .single();

        if (fetchError) continue;

        const newQuantity = Math.max(0, item.quantity - amount);

        await supabase
          .from("packaging_inventory")
          .update({ quantity: newQuantity })
          .eq("id", item.id);
      }

      return deductions;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["packaging-inventory"] });
    },
  });
};

// Helper to get inventory status
export const getInventoryStatus = (
  quantity: number,
  threshold: number
): { status: "ok" | "low" | "critical"; label: string } => {
  if (quantity <= 0) {
    return { status: "critical", label: "Uitverkocht" };
  }
  if (quantity <= threshold / 2) {
    return { status: "critical", label: "Kritiek laag" };
  }
  if (quantity <= threshold) {
    return { status: "low", label: "Bijna op" };
  }
  return { status: "ok", label: "Op voorraad" };
};
