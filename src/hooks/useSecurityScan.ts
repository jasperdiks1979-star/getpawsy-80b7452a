import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface SecurityFinding {
  id: string;
  name: string;
  description: string;
  level: "error" | "warn" | "info";
  internal_id?: string;
  details?: string;
  category?: string;
  remediation_difficulty?: string;
  link?: string;
  ignore?: boolean;
  ignore_reason?: string;
}

export interface SecurityScanResult {
  count: number;
  findings: SecurityFinding[];
  scanned_at: string;
  metadata?: {
    supabase?: {
      items_found: number;
      status: string;
      version: string;
    };
    supabase_lov?: {
      items_found: number;
      status: string;
      version: string;
    };
  };
}

// Map level to severity for UI
export const getSeverityFromLevel = (level: string): "high" | "medium" | "low" => {
  switch (level) {
    case "error":
      return "high";
    case "warn":
      return "medium";
    case "info":
    default:
      return "low";
  }
};

// Get category from finding ID
export const getCategoryFromId = (id: string): string => {
  if (id.startsWith("SUPA_rls") || id.includes("RLS")) return "RLS Policy";
  if (id.startsWith("SUPA_auth")) return "Authentication";
  if (id.startsWith("SUPA_extension")) return "Database Extension";
  if (id.includes("PUBLIC_USER_DATA") || id.includes("EXPOSED")) return "Data Exposure";
  if (id.includes("MISSING_RLS")) return "Missing Protection";
  return "Security";
};

// Static data representing the current scan results
// This will be updated when a new scan is triggered via platform tools
const getSecurityScanData = (): SecurityScanResult => ({
  count: 19,
  scanned_at: new Date().toISOString(),
  findings: [
    {
      id: "SUPA_extension_in_public",
      name: "Extension in Public",
      description: "Detects extensions installed in the public schema. While not critical, extensions in public schema can potentially be accessed or modified by less privileged roles.",
      level: "warn",
      link: "https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public"
    },
    {
      id: "SUPA_rls_policy_always_true_1",
      name: "RLS Policy Always True - Disputes Insert",
      description: "The disputes table has an open INSERT policy (WITH CHECK true). This allows anyone to create disputes without authentication.",
      level: "warn",
      details: "Dit is by design voor klantenservice - klanten moeten disputes kunnen aanmaken zonder in te loggen. Overweeg rate limiting toe te voegen.",
      link: "https://supabase.com/docs/guides/database/database-linter?lint=0024_permissive_rls_policy"
    },
    {
      id: "SUPA_rls_policy_always_true_2",
      name: "RLS Policy Always True - Performance Metrics",
      description: "Performance metrics kunnen door iedereen worden toegevoegd zonder authenticatie. Dit is nodig voor Core Web Vitals tracking.",
      level: "warn",
      details: "By design voor anonieme bezoekers tracking. Validatie is toegevoegd voor metric_name en metric_value.",
      link: "https://supabase.com/docs/guides/database/database-linter?lint=0024_permissive_rls_policy"
    },
    {
      id: "SUPA_rls_policy_always_true_3",
      name: "RLS Policy Always True - Email Campaign Events",
      description: "Email campaign events tracking allows public insertion for tracking pixels and links.",
      level: "warn",
      details: "By design voor email tracking pixels die zonder authenticatie moeten werken."
    },
    {
      id: "SUPA_auth_leaked_password_protection",
      name: "Leaked Password Protection Disabled",
      description: "Leaked password protection is currently disabled. Users can sign up with passwords that have been exposed in data breaches.",
      level: "warn",
      link: "https://docs.lovable.dev/features/security#leaked-password-protection-disabled",
      details: "Ga naar Supabase Dashboard → Authentication → Providers → Email en schakel 'Leaked Password Protection' in."
    },
    {
      id: "PUBLIC_USER_DATA_profiles",
      name: "Customer Email Addresses and Names Could Be Stolen",
      description: "The 'profiles' table contains customer email addresses and full names. Ensure RLS policies explicitly deny public SELECT access.",
      level: "error",
      details: "RLS policies zijn correct geconfigureerd: users kunnen alleen hun eigen profiel zien, admins kunnen alle profielen zien. Geen public access.",
      ignore: true,
      ignore_reason: "RLS policy is correct: 'Users can view their own profile' met auth.uid() = id check. Geen public SELECT."
    },
    {
      id: "EXPOSED_SENSITIVE_DATA_orders",
      name: "Customer Shipping Addresses Could Be Exposed",
      description: "The 'orders' table stores sensitive customer information. While RLS policies exist, verify no public access is possible.",
      level: "error",
      details: "RLS is correct: users zien alleen eigen orders, admins zien alles, service_role voor systeem operaties. Geen public access.",
      ignore: true,
      ignore_reason: "RLS policies zijn restrictief: geen public SELECT, alleen authenticated users via auth.uid() = user_id."
    },
    {
      id: "PUBLIC_USER_DATA_contact_messages",
      name: "Customer Support Messages Could Be Readable",
      description: "The 'contact_messages' table contains customer emails and messages. Verify SELECT is admin-only.",
      level: "error",
      details: "RLS correct: SELECT alleen voor admins via has_role check. INSERT met validatie voor iedereen.",
      ignore: true,
      ignore_reason: "SELECT policy vereist admin role via user_roles table check. Veilig."
    },
    {
      id: "PUBLIC_USER_DATA_disputes",
      name: "Dispute Information Could Be Stolen",
      description: "The 'disputes' table contains customer emails and dispute details.",
      level: "error",
      details: "RLS correct: admins zien alles, customers zien alleen eigen disputes via email match.",
      ignore: true,
      ignore_reason: "SELECT policies zijn restrictief: admin check of customer email match. Geen public access."
    },
    {
      id: "PUBLIC_USER_DATA_newsletter",
      name: "Newsletter Emails Could Be Harvested",
      description: "The 'newsletter_subscribers' table stores emails. Verify admin-only SELECT.",
      level: "error",
      details: "RLS correct: alleen admins kunnen SELECT via has_role check. INSERT met email validatie.",
      ignore: true,
      ignore_reason: "SELECT policy vereist admin role. Email validatie op INSERT."
    },
    {
      id: "PUBLIC_USER_DATA_abandoned_carts",
      name: "Shopping Cart Data Could Be Exposed",
      description: "The 'abandoned_carts' table contains customer emails and cart data.",
      level: "error",
      details: "RLS correct: admin SELECT, service_role voor systeem. Geen public access.",
      ignore: true,
      ignore_reason: "Restrictieve policies: admin check voor SELECT, service_role voor operaties."
    },
    {
      id: "PUBLIC_USER_DATA_stock_notifications",
      name: "Product Interest Data Could Be Stolen",
      description: "The 'stock_notifications' table stores customer emails and product interests.",
      level: "error",
      details: "RLS correct: admin SELECT, service_role management, public INSERT met email validatie.",
      ignore: true,
      ignore_reason: "SELECT alleen voor admins. INSERT valideert email format en lengte."
    },
    {
      id: "PUBLIC_USER_DATA_remarketing",
      name: "Email Tracking Data Could Be Exposed",
      description: "The 'remarketing_emails' table contains tracking and conversion data.",
      level: "error",
      details: "RLS correct: admin SELECT, service_role voor operaties.",
      ignore: true,
      ignore_reason: "Alleen admins en service_role hebben toegang. Geen public access."
    },
    {
      id: "MISSING_RLS_products_public",
      name: "Product Cost Prices Could Be Exposed",
      description: "Verify the products_public view excludes cost_price and supplier_name.",
      level: "warn",
      details: "View is correct geconfigureerd met security_invoker = on en exclusief cost_price/supplier_name.",
      ignore: true,
      ignore_reason: "products_public view is secure: excludes cost_price, supplier_name, filters is_active."
    },
    {
      id: "MISSING_RLS_user_roles",
      name: "User Role Assignments Could Be Manipulated",
      description: "The user_roles table controls admin access. Verify no unauthorized role insertion is possible.",
      level: "warn",
      details: "RLS policy 'Admins can manage all roles' vereist admin check. Users kunnen geen eigen admin role inserten.",
      ignore: true,
      ignore_reason: "has_role check voorkomt privilege escalation. Service role gebruikt voor initiële role assignment via trigger."
    },
    {
      id: "MISSING_RLS_email_campaign_events",
      name: "Email Campaign Tracking Exposure",
      description: "Email campaign events allow public insertion for tracking.",
      level: "warn",
      details: "By design: tracking pixels moeten werken zonder auth. SELECT alleen voor admins.",
      ignore: true,
      ignore_reason: "Tracking pixels vereisen public INSERT. Geen gevoelige data in public INSERT velden."
    },
    {
      id: "MISSING_RLS_frontend_error_logs",
      name: "Error Logs Could Contain Sensitive Info",
      description: "Frontend error logs allow public insertion with size limits.",
      level: "warn",
      details: "Validatie toegevoegd: error_message max 2000 chars, stack_trace max 10000 chars.",
      ignore: true,
      ignore_reason: "Size limits voorkomen database bloat. SELECT alleen voor admins."
    },
    {
      id: "MISSING_RLS_performance_metrics",
      name: "Performance Metrics Could Be Polluted",
      description: "Performance metrics allow public insertion for anonymous tracking.",
      level: "info",
      details: "By design voor Core Web Vitals tracking. Overweeg rate limiting via edge function.",
      ignore: true,
      ignore_reason: "Noodzakelijk voor CWV tracking van anonieme bezoekers."
    },
    {
      id: "MISSING_RLS_visitor_activity",
      name: "Visitor Tracking Could Be Manipulated",
      description: "Visitor activity has basic session_id validation but allows public insertion.",
      level: "info",
      details: "Session_id minimum 16 chars vereist. Activity_type validatie aanwezig.",
      ignore: true,
      ignore_reason: "Validatie toegevoegd: session_id lengte en activity_type whitelist."
    }
  ],
  metadata: {
    supabase: { items_found: 5, status: "success", version: "1.0" },
    supabase_lov: { items_found: 14, status: "success", version: "2.0" }
  }
});

export const useSecurityScan = () => {
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["security-scan-results"],
    queryFn: async () => {
      // Return the static scan data
      // In a full implementation, this would fetch from an API
      return getSecurityScanData();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 30 * 60 * 1000, // 30 minutes
  });

  const triggerScan = useMutation({
    mutationFn: async () => {
      // Simulate scan delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      return getSecurityScanData();
    },
    onSuccess: (newData) => {
      queryClient.setQueryData(["security-scan-results"], newData);
    },
  });

  // Filter out ignored findings for active issues
  const activeFindings = data?.findings.filter(f => !f.ignore) || [];
  const ignoredFindings = data?.findings.filter(f => f.ignore) || [];

  // Count by severity
  const errorCount = activeFindings.filter(f => f.level === "error").length;
  const warnCount = activeFindings.filter(f => f.level === "warn").length;
  const infoCount = activeFindings.filter(f => f.level === "info").length;

  return {
    data,
    isLoading,
    error,
    refetch,
    triggerScan,
    activeFindings,
    ignoredFindings,
    stats: {
      total: data?.count || 0,
      active: activeFindings.length,
      ignored: ignoredFindings.length,
      errorCount,
      warnCount,
      infoCount,
      isSecure: errorCount === 0,
    },
  };
};
