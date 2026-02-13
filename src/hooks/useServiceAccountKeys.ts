import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ServiceAccountKey {
  id: string;
  account_name: string;
  account_email: string;
  service_description: string | null;
  key_id: string | null;
  iam_roles: string[];
  created_at: string;
  key_created_at: string;
  last_rotated_at: string | null;
  last_used_at: string | null;
  rotation_status: string;
  is_active: boolean;
  notes: string | null;
  updated_at: string;
}

export interface RotationLog {
  id: string;
  service_account_key_id: string | null;
  account_name: string;
  old_key_id: string | null;
  new_key_id: string | null;
  action: string;
  performed_by: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

function getKeyAgeDays(keyCreatedAt: string): number {
  return Math.floor((Date.now() - new Date(keyCreatedAt).getTime()) / (1000 * 60 * 60 * 24));
}

function getKeyStatus(ageDays: number): "healthy" | "warning" | "critical" {
  if (ageDays >= 90) return "critical";
  if (ageDays >= 60) return "warning";
  return "healthy";
}

export function useServiceAccountKeys() {
  const queryClient = useQueryClient();

  const keysQuery = useQuery({
    queryKey: ["service-account-keys"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_account_keys")
        .select("*")
        .order("account_name");
      if (error) throw error;
      return (data as unknown as ServiceAccountKey[]).map((key) => ({
        ...key,
        ageDays: getKeyAgeDays(key.key_created_at),
        computedStatus: getKeyStatus(getKeyAgeDays(key.key_created_at)),
      }));
    },
  });

  const logsQuery = useQuery({
    queryKey: ["rotation-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("key_rotation_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as unknown as RotationLog[];
    },
  });

  const logRotationEvent = useMutation({
    mutationFn: async (params: {
      service_account_key_id: string;
      account_name: string;
      action: string;
      old_key_id?: string;
      new_key_id?: string;
      details?: Record<string, unknown>;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("key_rotation_logs").insert([{
        service_account_key_id: params.service_account_key_id,
        account_name: params.account_name,
        action: params.action,
        old_key_id: params.old_key_id || null,
        new_key_id: params.new_key_id || null,
        performed_by: userData.user?.email || "unknown",
        details: (params.details || null) as any,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rotation-logs"] });
    },
  });

  const updateKeyStatus = useMutation({
    mutationFn: async (params: {
      id: string;
      rotation_status: string;
      key_created_at?: string;
      last_rotated_at?: string;
      key_id?: string;
      notes?: string;
    }) => {
      const { error } = await supabase
        .from("service_account_keys")
        .update({
          rotation_status: params.rotation_status,
          ...(params.key_created_at && { key_created_at: params.key_created_at }),
          ...(params.last_rotated_at && { last_rotated_at: params.last_rotated_at }),
          ...(params.key_id !== undefined && { key_id: params.key_id }),
          ...(params.notes !== undefined && { notes: params.notes }),
        })
        .eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-account-keys"] });
      toast.success("Key status updated");
    },
  });

  const stats = keysQuery.data
    ? {
        total: keysQuery.data.length,
        healthy: keysQuery.data.filter((k) => k.computedStatus === "healthy").length,
        warning: keysQuery.data.filter((k) => k.computedStatus === "warning").length,
        critical: keysQuery.data.filter((k) => k.computedStatus === "critical").length,
        active: keysQuery.data.filter((k) => k.is_active).length,
      }
    : { total: 0, healthy: 0, warning: 0, critical: 0, active: 0 };

  return {
    keys: keysQuery.data || [],
    logs: logsQuery.data || [],
    isLoading: keysQuery.isLoading,
    stats,
    logRotationEvent,
    updateKeyStatus,
    refetch: () => {
      queryClient.invalidateQueries({ queryKey: ["service-account-keys"] });
      queryClient.invalidateQueries({ queryKey: ["rotation-logs"] });
    },
  };
}
