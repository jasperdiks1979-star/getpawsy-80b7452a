import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail, ChevronRight, CheckCircle2, Inbox } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface ContactMessagesWidgetProps {
  onNavigate?: () => void;
}

export const ContactMessagesWidget = ({ onNavigate }: ContactMessagesWidgetProps) => {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["contact-messages-widget-stats"],
    queryFn: async () => {
      // Get new/unread messages
      const { data: messages, error } = await supabase
        .from("contact_messages")
        .select("id, status, created_at")
        .in("status", ["new", "pending"]);

      if (error) throw error;

      const newCount = messages?.filter(m => m.status === "new").length || 0;
      const pendingCount = messages?.filter(m => m.status === "pending").length || 0;
      const total = messages?.length || 0;

      return { newCount, pendingCount, total };
    },
    staleTime: 30000,
    refetchInterval: 60000,
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

  const hasNew = (stats?.total || 0) > 0;

  return (
    <Card 
      className={`${hasNew ? "border-blue-500/50" : ""} ${onNavigate ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}`}
      onClick={onNavigate}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {hasNew ? (
              <Mail className="h-4 w-4 text-blue-500" />
            ) : (
              <Inbox className="h-4 w-4 text-muted-foreground" />
            )}
            <div>
              <p className="text-sm text-muted-foreground">Berichten</p>
              {hasNew ? (
                <p className="text-sm font-medium text-blue-600">
                  {stats?.total} nieuw
                </p>
              ) : (
                <p className="text-sm font-medium text-green-600">
                  Geen nieuwe
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {(stats?.newCount || 0) > 0 && (
                <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-100">
                  <Mail className="h-3 w-3 mr-1" />
                  {stats?.newCount}
                </Badge>
              )}
              {(stats?.pendingCount || 0) > 0 && (
                <Badge variant="secondary" className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100">
                  {stats?.pendingCount} pending
                </Badge>
              )}
              {!hasNew && (
                <Badge variant="secondary" className="bg-green-100 text-green-700 hover:bg-green-100">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  OK
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

export default ContactMessagesWidget;
