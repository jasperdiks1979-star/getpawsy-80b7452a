import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ShieldAlert, ChevronRight, XCircle, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import { useSecurityScan } from "@/hooks/useSecurityScan";

interface SecurityIssuesWidgetProps {
  onNavigate?: () => void;
}

export const SecurityIssuesWidget = ({ onNavigate }: SecurityIssuesWidgetProps) => {
  const navigate = useNavigate();
  const { stats, isLoading } = useSecurityScan();

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

  const handleClick = () => {
    if (onNavigate) {
      onNavigate();
    } else {
      navigate("/security");
    }
  };

  return (
    <Card 
      className="cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={handleClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {stats.isSecure ? (
              <ShieldCheck className="h-4 w-4 text-green-500" />
            ) : (
              <ShieldAlert className="h-4 w-4 text-yellow-500" />
            )}
            <div>
              <p className="text-sm text-muted-foreground">Security</p>
              <p className="text-sm font-medium">
                {stats.ignored} opgelost
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {stats.active > 0 ? (
                <>
                  {stats.errorCount > 0 && (
                    <Badge variant="destructive" className="text-xs gap-1">
                      <XCircle className="h-3 w-3" />
                      {stats.errorCount}
                    </Badge>
                  )}
                  {stats.warnCount > 0 && (
                    <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100 text-xs gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {stats.warnCount}
                    </Badge>
                  )}
                  {stats.infoCount > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {stats.infoCount} info
                    </Badge>
                  )}
                </>
              ) : (
                <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-xs">
                  <ShieldCheck className="h-3 w-3 mr-1" />
                  Alles veilig
                </Badge>
              )}
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SecurityIssuesWidget;
