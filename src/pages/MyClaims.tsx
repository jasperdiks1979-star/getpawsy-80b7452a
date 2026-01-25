import { memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { AlertCircle, CheckCircle, Clock, MessageSquare, XCircle, FileText, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { Link, useNavigate } from "react-router-dom";
import { useEffect } from "react";

interface Dispute {
  id: string;
  order_id: string | null;
  dispute_type: string;
  description: string;
  status: string;
  resolution_type: string | null;
  resolution_amount: number | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
}

const DISPUTE_TYPE_LABELS: Record<string, string> = {
  damaged: "Damaged Product",
  not_received: "Not Received",
  wrong_item: "Wrong Item",
  quality_issue: "Quality Issue",
  other: "Other Issue",
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: "Under Review", color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20", icon: Clock },
  in_progress: { label: "In Progress", color: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: MessageSquare },
  resolved: { label: "Resolved", color: "bg-green-500/10 text-green-600 border-green-500/20", icon: CheckCircle },
  denied: { label: "Denied", color: "bg-red-500/10 text-red-600 border-red-500/20", icon: XCircle },
};

const ClaimCardSkeleton = memo(() => (
  <Card>
    <CardContent className="p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
      <Skeleton className="h-16 w-full" />
    </CardContent>
  </Card>
));
ClaimCardSkeleton.displayName = 'ClaimCardSkeleton';

const MyClaims = () => {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [authLoading, user, navigate]);

  const { data: claims, isLoading } = useQuery({
    queryKey: ["my-claims", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("disputes")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Dispute[];
    },
    enabled: !!user,
  });

  if (authLoading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto space-y-4">
            {[...Array(3)].map((_, i) => (
              <ClaimCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  if (!user) return null;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-foreground">My Claims</h1>
              <p className="text-muted-foreground mt-1">
                View and track your submitted claims
              </p>
            </div>
            <Badge variant="secondary" className="text-lg px-4 py-2">
              <FileText className="w-4 h-4 mr-2" />
              {claims?.length || 0} claims
            </Badge>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <ClaimCardSkeleton key={i} />
              ))}
            </div>
          ) : claims && claims.length > 0 ? (
            <div className="space-y-4">
              {claims.map((claim) => {
                const statusConfig = STATUS_CONFIG[claim.status] || STATUS_CONFIG.pending;
                const StatusIcon = statusConfig.icon;

                return (
                  <Card key={claim.id} className="overflow-hidden hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <AlertCircle className="w-4 h-4 text-primary" />
                            <span className="font-semibold">
                              {DISPUTE_TYPE_LABELS[claim.dispute_type] || claim.dispute_type}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Submitted {format(new Date(claim.created_at), "MMMM d, yyyy")}
                          </p>
                          {claim.order_id && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Order #{claim.order_id.slice(0, 8).toUpperCase()}
                            </p>
                          )}
                        </div>
                        <Badge variant="outline" className={statusConfig.color}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {statusConfig.label}
                        </Badge>
                      </div>

                      <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                        {claim.description}
                      </p>

                      {claim.status === "resolved" && claim.resolution_type && (
                        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                          <div className="flex items-start gap-3">
                            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                                Resolved: {claim.resolution_type.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase())}
                              </p>
                              {claim.resolution_amount && (
                                <p className="text-sm text-green-700 dark:text-green-300">
                                  Refund amount processed
                                </p>
                              )}
                              {claim.resolution_notes && (
                                <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                                  {claim.resolution_notes}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {claim.status === "denied" && (
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                          <div className="flex items-start gap-3">
                            <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                                Claim Denied
                              </p>
                              {claim.resolution_notes && (
                                <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                                  {claim.resolution_notes}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="mt-4 pt-4 border-t flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          Claim ID: {claim.id.slice(0, 8).toUpperCase()}
                        </span>
                        <Button variant="ghost" size="sm" asChild>
                          <Link to="/contact">
                            Need Help?
                            <ChevronRight className="w-4 h-4 ml-1" />
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="py-16 text-center">
                <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <h2 className="text-xl font-semibold mb-2">No claims submitted</h2>
                <p className="text-muted-foreground mb-6">
                  You haven't submitted any claims yet. If you have an issue with an order, you can submit a claim from your orders page.
                </p>
                <Button asChild>
                  <Link to="/orders">
                    View My Orders
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default MyClaims;
