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
  risk_score: number;
  last_health_check_at: string | null;
  health_check_status: string;
  consecutive_failures: number;
  recovery_mode: boolean;
  recovery_started_at: string | null;
  last_anomaly_check_at: string | null;
  anomaly_flags: unknown[];
  billing_alert_active: boolean;
  budget_alert_configured: boolean;
  essential_contacts_configured: boolean;
  // Computed
  ageDays?: number;
  computedStatus?: "healthy" | "warning" | "critical";
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

export interface AnomalyEvent {
  id: string;
  service_account_key_id: string | null;
  event_type: string;
  severity: string;
  description: string;
  details: Record<string, unknown> | null;
  resolved: boolean;
  resolved_at: string | null;
  created_at: string;
}

export interface HealthCheck {
  id: string;
  service_account_key_id: string | null;
  check_type: string;
  status: string;
  response_time_ms: number | null;
  error_message: string | null;
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

  const anomaliesQuery = useQuery({
    queryKey: ["anomaly-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("security_anomaly_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as unknown as AnomalyEvent[];
    },
  });

  const healthChecksQuery = useQuery({
    queryKey: ["health-checks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credential_health_checks")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data as unknown as HealthCheck[];
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
      rotation_status?: string;
      key_created_at?: string;
      last_rotated_at?: string;
      key_id?: string;
      notes?: string;
      billing_alert_active?: boolean;
      budget_alert_configured?: boolean;
      essential_contacts_configured?: boolean;
    }) => {
      const updateData: Record<string, unknown> = {};
      if (params.rotation_status !== undefined) updateData.rotation_status = params.rotation_status;
      if (params.key_created_at) updateData.key_created_at = params.key_created_at;
      if (params.last_rotated_at) updateData.last_rotated_at = params.last_rotated_at;
      if (params.key_id !== undefined) updateData.key_id = params.key_id;
      if (params.notes !== undefined) updateData.notes = params.notes;
      if (params.billing_alert_active !== undefined) updateData.billing_alert_active = params.billing_alert_active;
      if (params.budget_alert_configured !== undefined) updateData.budget_alert_configured = params.budget_alert_configured;
      if (params.essential_contacts_configured !== undefined) updateData.essential_contacts_configured = params.essential_contacts_configured;

      const { error } = await supabase
        .from("service_account_keys")
        .update(updateData)
        .eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-account-keys"] });
      toast.success("Updated");
    },
  });

  const runHealthCheck = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/credential-health-check`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
        }
      );
      if (!resp.ok) throw new Error(await resp.text());
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-account-keys"] });
      queryClient.invalidateQueries({ queryKey: ["health-checks"] });
      queryClient.invalidateQueries({ queryKey: ["anomaly-events"] });
      toast.success("Health check completed");
    },
    onError: (e) => {
      toast.error(`Health check failed: ${e.message}`);
    },
  });

  const resolveAnomaly = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("security_anomaly_events")
        .update({ resolved: true, resolved_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["anomaly-events"] });
      toast.success("Anomaly resolved");
    },
  });

  const keys = keysQuery.data || [];
  const activeAnomalies = (anomaliesQuery.data || []).filter((a) => !a.resolved);

  const stats = {
    total: keys.length,
    healthy: keys.filter((k) => k.computedStatus === "healthy").length,
    warning: keys.filter((k) => k.computedStatus === "warning").length,
    critical: keys.filter((k) => k.computedStatus === "critical").length,
    active: keys.filter((k) => k.is_active).length,
    inRecovery: keys.filter((k) => k.recovery_mode).length,
    avgRiskScore: keys.length ? Math.round(keys.reduce((s, k) => s + k.risk_score, 0) / keys.length) : 0,
    activeAnomalies: activeAnomalies.length,
  };

  return {
    keys,
    logs: logsQuery.data || [],
    anomalies: anomaliesQuery.data || [],
    activeAnomalies,
    healthChecks: healthChecksQuery.data || [],
    isLoading: keysQuery.isLoading,
    stats,
    logRotationEvent,
    updateKeyStatus,
    runHealthCheck,
    resolveAnomaly,
    refetch: () => {
      queryClient.invalidateQueries({ queryKey: ["service-account-keys"] });
      queryClient.invalidateQueries({ queryKey: ["rotation-logs"] });
      queryClient.invalidateQueries({ queryKey: ["anomaly-events"] });
      queryClient.invalidateQueries({ queryKey: ["health-checks"] });
    },
  };
}
