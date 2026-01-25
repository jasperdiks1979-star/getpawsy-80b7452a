import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, ShieldCheck, ShieldAlert, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface SecurityIssuesWidgetProps {
  onNavigate?: () => void;
}

// Mock security issues data - in production this would come from a security scanning API or database
const getSecurityIssues = () => {
  // Based on the RLS policies and configurations we've set up
  const resolvedIssues = [
    { id: "visitor_activity_exposure", name: "Visitor activity location data exposure", severity: "high" },
    { id: "newsletter_email_validation", name: "Newsletter email validation", severity: "medium" },
    { id: "stock_notification_validation", name: "Stock notification email validation", severity: "medium" },
    { id: "contact_message_validation", name: "Contact message input validation", severity: "medium" },
    { id: "error_log_size_limits", name: "Frontend error log size limits", severity: "low" },
    { id: "visitor_activity_session_validation", name: "Visitor activity session validation", severity: "medium" },
  ];

  const openIssues = [
    { id: "leaked_password_protection", name: "Leaked Password Protection niet ingeschakeld", severity: "medium" },
    { id: "disputes_open_insert", name: "Disputes tabel open INSERT policy", severity: "low" },
    { id: "performance_metrics_open_insert", name: "Performance metrics open INSERT policy", severity: "low" },
  ];

  return { resolved: resolvedIssues, open: openIssues };
};

export const SecurityIssuesWidget = ({ onNavigate }: SecurityIssuesWidgetProps) => {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["security-issues-widget-stats"],
    queryFn: async () => {
      // Simulate async fetch - in production this could be a real API call
      const issues = getSecurityIssues();
      
      const highOpen = issues.open.filter(i => i.severity === "high").length;
      const mediumOpen = issues.open.filter(i => i.severity === "medium").length;
      const lowOpen = issues.open.filter(i => i.severity === "low").length;

      return {
        resolvedCount: issues.resolved.length,
        openCount: issues.open.length,
        highCount: highOpen,
        mediumCount: mediumOpen,
        lowCount: lowOpen,
        isSecure: issues.open.filter(i => i.severity === "high").length === 0,
      };
    },
    staleTime: 60000,
    refetchInterval: 300000, // Refresh every 5 minutes
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <Skeleton className="h-6 w-24 mb-2" />
          <Skeleton className="h-8 w-16" />
        </CardContent>
      </Card>
    );
  }

  const isSecure = stats?.isSecure ?? true;
  const hasOpenIssues = (stats?.openCount ?? 0) > 0;

  return (
    <Card 
      className={`${onNavigate ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}`}
      onClick={onNavigate}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isSecure ? (
              <ShieldCheck className="h-4 w-4 text-green-500" />
            ) : (
              <ShieldAlert className="h-4 w-4 text-yellow-500" />
            )}
            <div>
              <p className="text-sm text-muted-foreground">Security</p>
              <p className="text-sm font-medium">
                {stats?.resolvedCount ?? 0} opgelost
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {hasOpenIssues ? (
                <>
                  {(stats?.highCount ?? 0) > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      {stats?.highCount} kritiek
                    </Badge>
                  )}
                  {(stats?.mediumCount ?? 0) > 0 && (
                    <Badge variant="secondary" className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100 text-xs">
                      {stats?.mediumCount} medium
                    </Badge>
                  )}
                  {(stats?.lowCount ?? 0) > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {stats?.lowCount} laag
                    </Badge>
                  )}
                </>
              ) : (
                <Badge variant="secondary" className="bg-green-100 text-green-700 hover:bg-green-100 text-xs">
                  <ShieldCheck className="h-3 w-3 mr-1" />
                  Alles veilig
                </Badge>
              )}
            </div>
            {onNavigate && (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SecurityIssuesWidget;
