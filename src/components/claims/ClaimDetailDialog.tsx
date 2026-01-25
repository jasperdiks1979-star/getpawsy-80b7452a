import { memo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertCircle,
  CheckCircle,
  Clock,
  MessageSquare,
  XCircle,
  FileText,
} from "lucide-react";
import { format } from "date-fns";
import ClaimMessaging from "./ClaimMessaging";

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
  customer_email?: string;
}

const DISPUTE_TYPE_LABELS: Record<string, string> = {
  damaged: "Damaged Product",
  not_received: "Not Received",
  wrong_item: "Wrong Item",
  quality_issue: "Quality Issue",
  other: "Other Issue",
};

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: typeof Clock }
> = {
  pending: {
    label: "Under Review",
    color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
    icon: Clock,
  },
  in_progress: {
    label: "In Progress",
    color: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    icon: MessageSquare,
  },
  resolved: {
    label: "Resolved",
    color: "bg-green-500/10 text-green-600 border-green-500/20",
    icon: CheckCircle,
  },
  denied: {
    label: "Denied",
    color: "bg-red-500/10 text-red-600 border-red-500/20",
    icon: XCircle,
  },
};

interface ClaimDetailDialogProps {
  claim: Dispute | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerEmail: string;
}

const ClaimDetailDialog = memo(
  ({ claim, open, onOpenChange, customerEmail }: ClaimDetailDialogProps) => {
    if (!claim) return null;

    const statusConfig = STATUS_CONFIG[claim.status] || STATUS_CONFIG.pending;
    const StatusIcon = statusConfig.icon;

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-primary" />
                <DialogTitle>
                  {DISPUTE_TYPE_LABELS[claim.dispute_type] || claim.dispute_type}
                </DialogTitle>
              </div>
              <Badge variant="outline" className={statusConfig.color}>
                <StatusIcon className="w-3 h-3 mr-1" />
                {statusConfig.label}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Submitted {format(new Date(claim.created_at), "MMMM d, yyyy")} •
              Claim ID: {claim.id.slice(0, 8).toUpperCase()}
            </p>
          </DialogHeader>

          <Tabs defaultValue="details" className="flex-1 overflow-hidden">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="details" className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Details
              </TabsTrigger>
              <TabsTrigger value="messages" className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Messages
              </TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="mt-4 space-y-4 overflow-y-auto">
              <div>
                <h4 className="text-sm font-medium mb-2">Description</h4>
                <p className="text-sm text-muted-foreground bg-muted rounded-lg p-3">
                  {claim.description}
                </p>
              </div>

              {claim.order_id && (
                <div>
                  <h4 className="text-sm font-medium mb-1">Order Reference</h4>
                  <p className="text-sm text-muted-foreground">
                    #{claim.order_id.slice(0, 8).toUpperCase()}
                  </p>
                </div>
              )}

              {claim.status === "resolved" && claim.resolution_type && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-green-800 dark:text-green-200">
                        Resolved:{" "}
                        {claim.resolution_type
                          .replace("_", " ")
                          .replace(/\b\w/g, (l) => l.toUpperCase())}
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
            </TabsContent>

            <TabsContent value="messages" className="mt-4 flex-1 overflow-hidden">
              <ClaimMessaging
                disputeId={claim.id}
                customerEmail={customerEmail}
              />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    );
  }
);

ClaimDetailDialog.displayName = "ClaimDetailDialog";

export default ClaimDetailDialog;
