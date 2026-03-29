import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { format } from "date-fns";
import { 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  MessageSquare, 
  Package, 
  RefreshCw, 
  Search,
  Send,
  DollarSign,
  Eye,
  XCircle,
  FileText
} from "lucide-react";

interface Dispute {
  id: string;
  order_id: string;
  customer_email: string;
  dispute_type: string;
  status: string;
  description: string;
  customer_evidence: string[];
  admin_notes: string | null;
  cj_dispute_id: string | null;
  resolution_type: string | null;
  resolution_amount: number | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

interface DisputeMessage {
  id: string;
  dispute_id: string;
  sender_type: 'customer' | 'admin' | 'system';
  message: string;
  attachments: string[];
  is_internal: boolean;
  created_at: string;
}

const DISPUTE_TYPE_LABELS: Record<string, string> = {
  damaged: 'Damaged Product',
  not_received: 'Not Received',
  wrong_item: 'Wrong Item',
  quality_issue: 'Quality Issue',
  other: 'Other',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  under_review: 'Under Review',
  awaiting_evidence: 'Awaiting Evidence',
  processing_with_supplier: 'Processing',
  resolved_refund: 'Resolved (Refund)',
  resolved_replacement: 'Resolved (Replacement)',
  resolved_partial_refund: 'Resolved (Partial)',
  denied: 'Denied',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  under_review: 'bg-blue-100 text-blue-800',
  awaiting_evidence: 'bg-orange-100 text-orange-800',
  processing_with_supplier: 'bg-purple-100 text-purple-800',
  resolved_refund: 'bg-green-100 text-green-800',
  resolved_replacement: 'bg-green-100 text-green-800',
  resolved_partial_refund: 'bg-green-100 text-green-800',
  denied: 'bg-red-100 text-red-800',
};

export default function DisputeManager() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isResolveOpen, setIsResolveOpen] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [resolutionType, setResolutionType] = useState("");
  const [resolutionAmount, setResolutionAmount] = useState("");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [cjDisputeId, setCjDisputeId] = useState("");
  
  // Typing indicator refs
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Broadcast typing event to customer
  const broadcastTyping = useCallback((disputeId: string) => {
    if (!typingChannelRef.current) {
      typingChannelRef.current = supabase.channel(`dispute-typing-${disputeId}`);
      typingChannelRef.current.subscribe();
    }

    typingChannelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: { sender_type: "support" },
    });

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Auto stop typing after 2 seconds of no input
    typingTimeoutRef.current = setTimeout(() => {
      typingChannelRef.current?.send({
        type: "broadcast",
        event: "stop_typing",
        payload: { sender_type: "support" },
      });
    }, 2000);
  }, []);

  // Stop typing broadcast
  const stopTyping = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingChannelRef.current?.send({
      type: "broadcast",
      event: "stop_typing",
      payload: { sender_type: "support" },
    });
  }, []);

  // Cleanup typing channel when dispute changes or dialog closes
  useEffect(() => {
    return () => {
      if (typingChannelRef.current) {
        supabase.removeChannel(typingChannelRef.current);
        typingChannelRef.current = null;
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [selectedDispute?.id, isDetailOpen]);

  // Handle message input with typing indicator
  const handleMessageChange = (value: string) => {
    setNewMessage(value);
    if (selectedDispute && value.trim() && !isInternalNote) {
      broadcastTyping(selectedDispute.id);
    }
  };

  // Fetch disputes
  const { data: disputes = [], isLoading } = useQuery({
    queryKey: ['disputes', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('disputes')
        .select('*')
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Dispute[];
    },
  });

  // Fetch messages for selected dispute
  const { data: messages = [] } = useQuery({
    queryKey: ['dispute-messages', selectedDispute?.id],
    queryFn: async () => {
      if (!selectedDispute) return [];
      
      const { data, error } = await supabase
        .from('dispute_messages')
        .select('*')
        .eq('dispute_id', selectedDispute.id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as DisputeMessage[];
    },
    enabled: !!selectedDispute,
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ disputeId, status, message }: { disputeId: string; status: string; message?: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-dispute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          action: 'update_status',
          disputeId,
          status,
          message,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update status');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disputes'] });
      queryClient.invalidateQueries({ queryKey: ['dispute-messages'] });
      toast.success('Status updated and customer notified');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Add message mutation
  const addMessageMutation = useMutation({
    mutationFn: async ({ disputeId, message, isInternal }: { disputeId: string; message: string; isInternal: boolean }) => {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-dispute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          action: 'add_message',
          disputeId,
          message,
          isInternal,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to add message');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispute-messages'] });
      setNewMessage("");
      toast.success(isInternalNote ? 'Internal note added' : 'Message sent to customer');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Resolve mutation
  const resolveMutation = useMutation({
    mutationFn: async (data: { disputeId: string; resolutionType: string; resolutionAmount?: number; resolutionNotes?: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-dispute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          action: 'resolve',
          ...data,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to resolve dispute');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disputes'] });
      queryClient.invalidateQueries({ queryKey: ['dispute-messages'] });
      setIsResolveOpen(false);
      setResolutionType("");
      setResolutionAmount("");
      setResolutionNotes("");
      toast.success('Dispute resolved and customer notified');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Update CJ dispute ID
  const updateCjIdMutation = useMutation({
    mutationFn: async ({ disputeId, cjDisputeId }: { disputeId: string; cjDisputeId: string }) => {
      const { error } = await supabase
        .from('disputes')
        .update({ cj_dispute_id: cjDisputeId })
        .eq('id', disputeId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disputes'] });
      toast.success('CJ Dispute ID saved');
    },
  });

  const filteredDisputes = disputes.filter(dispute => {
    const matchesSearch = 
      dispute.customer_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      dispute.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      dispute.order_id?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const openDisputes = disputes.filter(d => !d.status.startsWith('resolved') && d.status !== 'denied').length;
  const resolvedDisputes = disputes.filter(d => d.status.startsWith('resolved')).length;

  const handleSendMessage = () => {
    if (!selectedDispute || !newMessage.trim()) return;
    stopTyping(); // Stop typing indicator when sending
    addMessageMutation.mutate({
      disputeId: selectedDispute.id,
      message: newMessage,
      isInternal: isInternalNote,
    });
  };

  const handleResolve = () => {
    if (!selectedDispute || !resolutionType) return;
    resolveMutation.mutate({
      disputeId: selectedDispute.id,
      resolutionType,
      resolutionAmount: resolutionAmount ? parseFloat(resolutionAmount) : undefined,
      resolutionNotes: resolutionNotes || undefined,
    });
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Disputes</p>
                <p className="text-2xl font-bold">{disputes.length}</p>
              </div>
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Open</p>
                <p className="text-2xl font-bold text-yellow-600">{openDisputes}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Resolved</p>
                <p className="text-2xl font-bold text-green-600">{resolvedDisputes}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Denied</p>
                <p className="text-2xl font-bold text-red-600">
                  {disputes.filter(d => d.status === 'denied').length}
                </p>
              </div>
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search by email, dispute ID, or order ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="under_review">Under Review</SelectItem>
                <SelectItem value="awaiting_evidence">Awaiting Evidence</SelectItem>
                <SelectItem value="processing_with_supplier">Processing</SelectItem>
                <SelectItem value="resolved_refund">Resolved (Refund)</SelectItem>
                <SelectItem value="resolved_replacement">Resolved (Replacement)</SelectItem>
                <SelectItem value="denied">Denied</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Disputes List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Customer Claims
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading disputes...</div>
          ) : filteredDisputes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No disputes found
            </div>
          ) : (
            <div className="space-y-4">
              {filteredDisputes.map((dispute) => (
                <div
                  key={dispute.id}
                  className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={STATUS_COLORS[dispute.status]}>
                          {STATUS_LABELS[dispute.status]}
                        </Badge>
                        <Badge variant="outline">
                          {DISPUTE_TYPE_LABELS[dispute.dispute_type]}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          #{dispute.id.slice(0, 8).toUpperCase()}
                        </span>
                      </div>
                      <p className="font-medium">{dispute.customer_email}</p>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {dispute.description}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Created: {format(new Date(dispute.created_at), 'PPp')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {dispute.cj_dispute_id && (
                        <Badge variant="secondary" className="text-xs">
                          CJ: {dispute.cj_dispute_id}
                        </Badge>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedDispute(dispute);
                          setIsDetailOpen(true);
                        }}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dispute Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Claim #{selectedDispute?.id.slice(0, 8).toUpperCase()}
              {selectedDispute && (
                <Badge className={STATUS_COLORS[selectedDispute.status]}>
                  {STATUS_LABELS[selectedDispute.status]}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          
          {selectedDispute && (
            <Tabs defaultValue="details" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="messages">Messages</TabsTrigger>
                <TabsTrigger value="actions">Actions</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Customer Email</label>
                    <p className="text-sm text-muted-foreground">{selectedDispute.customer_email}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Order ID</label>
                    <p className="text-sm text-muted-foreground">{selectedDispute.order_id || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Issue Type</label>
                    <p className="text-sm text-muted-foreground">
                      {DISPUTE_TYPE_LABELS[selectedDispute.dispute_type]}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Created</label>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(selectedDispute.created_at), 'PPp')}
                    </p>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">Description</label>
                  <p className="text-sm text-muted-foreground mt-1">{selectedDispute.description}</p>
                </div>

                {selectedDispute.customer_evidence && selectedDispute.customer_evidence.length > 0 && (
                  <div>
                    <label className="text-sm font-medium">Customer Evidence</label>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {selectedDispute.customer_evidence.map((url, index) => (
                        <a
                          key={index}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline"
                        >
                          Evidence {index + 1}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                <Separator />

                <div>
                  <label className="text-sm font-medium">CJ Dropshipping Dispute ID</label>
                  <div className="flex gap-2 mt-2">
                    <Input
                      placeholder="Enter CJ dispute ID after submitting to CJ platform"
                      value={cjDisputeId || selectedDispute.cj_dispute_id || ''}
                      onChange={(e) => setCjDisputeId(e.target.value)}
                    />
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (cjDisputeId) {
                          updateCjIdMutation.mutate({
                            disputeId: selectedDispute.id,
                            cjDisputeId,
                          });
                        }
                      }}
                    >
                      Save
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    After submitting this dispute on CJ Dropshipping platform, save the dispute ID here for tracking.
                  </p>
                </div>

                {selectedDispute.resolution_type && (
                  <>
                    <Separator />
                    <div className="bg-green-50 p-4 rounded-lg">
                      <h4 className="font-medium text-green-800">Resolution</h4>
                      <p className="text-sm text-green-700 mt-1">
                        Type: {selectedDispute.resolution_type.replace('_', ' ')}
                        {selectedDispute.resolution_amount && ` - $${selectedDispute.resolution_amount}`}
                      </p>
                      {selectedDispute.resolution_notes && (
                        <p className="text-sm text-green-600 mt-2">{selectedDispute.resolution_notes}</p>
                      )}
                    </div>
                  </>
                )}
              </TabsContent>

              <TabsContent value="messages">
                <ScrollArea className="h-[400px] pr-4">
                  <div className="space-y-4">
                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`p-3 rounded-lg ${
                          msg.sender_type === 'admin'
                            ? msg.is_internal
                              ? 'bg-yellow-50 border border-yellow-200'
                              : 'bg-primary/10'
                            : msg.sender_type === 'customer'
                            ? 'bg-muted'
                            : 'bg-blue-50 text-center text-sm'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium capitalize">
                            {msg.sender_type}
                            {msg.is_internal && ' (Internal Note)'}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(msg.created_at), 'PPp')}
                          </span>
                        </div>
                        <p className="text-sm">{msg.message}</p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                <Separator className="my-4" />

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="internal-note"
                      checked={isInternalNote}
                      onChange={(e) => setIsInternalNote(e.target.checked)}
                      className="rounded"
                    />
                    <label htmlFor="internal-note" className="text-sm">
                      Internal note (not visible to customer)
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <Textarea
                      placeholder={isInternalNote ? "Add internal note..." : "Send message to customer..."}
                      value={newMessage}
                      onChange={(e) => handleMessageChange(e.target.value)}
                      className="flex-1"
                    />
                    <Button onClick={handleSendMessage} disabled={!newMessage.trim()}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="actions" className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Update Status</label>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {['under_review', 'awaiting_evidence', 'processing_with_supplier'].map((status) => (
                      <Button
                        key={status}
                        variant="outline"
                        size="sm"
                        disabled={selectedDispute.status === status}
                        onClick={() => updateStatusMutation.mutate({
                          disputeId: selectedDispute.id,
                          status,
                        })}
                      >
                        {STATUS_LABELS[status]}
                      </Button>
                    ))}
                  </div>
                </div>

                <Separator />

                <div>
                  <label className="text-sm font-medium">Quick Actions</label>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsResolveOpen(true);
                      }}
                    >
                      <DollarSign className="h-4 w-4 mr-2" />
                      Resolve Claim
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => window.open('https://cjdropshipping.com/user/dispute', '_blank')}
                    >
                      <Package className="h-4 w-4 mr-2" />
                      Open CJ Platform
                    </Button>
                  </div>
                </div>

                <div className="bg-blue-50 p-4 rounded-lg">
                  <h4 className="font-medium text-blue-800 mb-2">CJ Dropshipping Dispute Process</h4>
                  <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
                    <li>Review the customer's claim and evidence above</li>
                    <li>Go to CJ Dropshipping platform and submit a dispute</li>
                    <li>Save the CJ dispute ID in the Details tab</li>
                    <li>Wait for CJ to process (typically 5–10 business days)</li>
                    <li>Once CJ resolves, use "Resolve Claim" to notify customer</li>
                  </ol>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* Resolve Dialog */}
      <Dialog open={isResolveOpen} onOpenChange={setIsResolveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Claim</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Resolution Type</label>
              <Select value={resolutionType} onValueChange={setResolutionType}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Select resolution type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_refund">Full Refund</SelectItem>
                  <SelectItem value="partial_refund">Partial Refund</SelectItem>
                  <SelectItem value="replacement">Send Replacement</SelectItem>
                  <SelectItem value="store_credit">Store Credit</SelectItem>
                  <SelectItem value="denied">Deny Claim</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(resolutionType === 'full_refund' || resolutionType === 'partial_refund' || resolutionType === 'store_credit') && (
              <div>
                <label className="text-sm font-medium">Amount ($)</label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={resolutionAmount}
                  onChange={(e) => setResolutionAmount(e.target.value)}
                  className="mt-2"
                />
              </div>
            )}

            <div>
              <label className="text-sm font-medium">Notes for Customer</label>
              <Textarea
                placeholder="Add any notes about the resolution..."
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                className="mt-2"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsResolveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleResolve} disabled={!resolutionType}>
              <CheckCircle className="h-4 w-4 mr-2" />
              Resolve & Notify Customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
