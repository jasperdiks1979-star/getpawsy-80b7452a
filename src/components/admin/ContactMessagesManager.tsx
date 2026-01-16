import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { 
  MessageSquare, 
  Search, 
  RefreshCw, 
  Eye, 
  Clock, 
  CheckCircle2, 
  XCircle,
  Mail,
  User,
  Calendar,
  Package,
  Loader2
} from "lucide-react";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

interface ContactMessage {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  order_number: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  new: { label: "Nieuw", color: "bg-blue-500", icon: <Clock className="w-3 h-3" /> },
  in_progress: { label: "In behandeling", color: "bg-yellow-500", icon: <RefreshCw className="w-3 h-3" /> },
  resolved: { label: "Afgehandeld", color: "bg-green-500", icon: <CheckCircle2 className="w-3 h-3" /> },
  closed: { label: "Gesloten", color: "bg-gray-500", icon: <XCircle className="w-3 h-3" /> },
};

export function ContactMessagesManager() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedMessage, setSelectedMessage] = useState<ContactMessage | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const queryClient = useQueryClient();

  // Fetch contact messages
  const { data: messages, isLoading, refetch } = useQuery({
    queryKey: ["contact-messages", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("contact_messages")
        .select("*")
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as ContactMessage[];
    },
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("contact_messages")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status bijgewerkt");
      queryClient.invalidateQueries({ queryKey: ["contact-messages"] });
      if (selectedMessage) {
        setSelectedMessage({ ...selectedMessage, status: selectedMessage.status });
      }
    },
    onError: (error) => {
      toast.error(`Fout bij bijwerken: ${error.message}`);
    },
  });

  // Filter messages by search term
  const filteredMessages = messages?.filter((msg) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      msg.name.toLowerCase().includes(search) ||
      msg.email.toLowerCase().includes(search) ||
      msg.subject.toLowerCase().includes(search) ||
      msg.message.toLowerCase().includes(search) ||
      (msg.order_number && msg.order_number.toLowerCase().includes(search))
    );
  });

  const handleViewDetails = (message: ContactMessage) => {
    setSelectedMessage(message);
    setDetailsOpen(true);
    
    // Auto-update status to in_progress if new
    if (message.status === "new") {
      updateStatusMutation.mutate({ id: message.id, status: "in_progress" });
    }
  };

  const handleStatusChange = (id: string, status: string) => {
    updateStatusMutation.mutate({ id, status });
    if (selectedMessage?.id === id) {
      setSelectedMessage({ ...selectedMessage, status });
    }
  };

  // Count messages by status
  const statusCounts = messages?.reduce((acc, msg) => {
    acc[msg.status] = (acc[msg.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Nieuw</p>
                <p className="text-2xl font-bold text-blue-600">{statusCounts.new || 0}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-full">
                <Clock className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">In behandeling</p>
                <p className="text-2xl font-bold text-yellow-600">{statusCounts.in_progress || 0}</p>
              </div>
              <div className="p-3 bg-yellow-100 rounded-full">
                <RefreshCw className="w-5 h-5 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Afgehandeld</p>
                <p className="text-2xl font-bold text-green-600">{statusCounts.resolved || 0}</p>
              </div>
              <div className="p-3 bg-green-100 rounded-full">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Totaal</p>
                <p className="text-2xl font-bold">{messages?.length || 0}</p>
              </div>
              <div className="p-3 bg-muted rounded-full">
                <MessageSquare className="w-5 h-5 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Klantenberichten
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Zoek op naam, email, onderwerp..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Filter op status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle berichten</SelectItem>
                <SelectItem value="new">Nieuw</SelectItem>
                <SelectItem value="in_progress">In behandeling</SelectItem>
                <SelectItem value="resolved">Afgehandeld</SelectItem>
                <SelectItem value="closed">Gesloten</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => refetch()} disabled={isLoading}>
              {isLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
            </Button>
          </div>

          {/* Messages Table */}
          {isLoading ? (
            <TableSkeleton 
              columns={6} 
              rows={8}
              headerWidths={["w-20", "w-28", "w-40", "w-24", "w-28", "w-16"]}
              cellWidths={["w-16", "w-24", "w-36", "w-20", "w-24", "w-12"]}
            />
          ) : filteredMessages?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Geen berichten gevonden</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Naam</TableHead>
                    <TableHead className="hidden md:table-cell">Onderwerp</TableHead>
                    <TableHead className="hidden lg:table-cell">Order</TableHead>
                    <TableHead className="hidden sm:table-cell">Datum</TableHead>
                    <TableHead className="text-right">Actie</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMessages?.map((message) => {
                    const status = statusConfig[message.status] || statusConfig.new;
                    return (
                      <TableRow 
                        key={message.id} 
                        className={message.status === "new" ? "bg-blue-50/50" : ""}
                      >
                        <TableCell>
                          <Badge 
                            variant="secondary" 
                            className={`${status.color} text-white flex items-center gap-1 w-fit`}
                          >
                            {status.icon}
                            <span className="hidden sm:inline">{status.label}</span>
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{message.name}</p>
                            <p className="text-sm text-muted-foreground">{message.email}</p>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell max-w-[200px] truncate">
                          {message.subject}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {message.order_number ? (
                            <Badge variant="outline">{message.order_number}</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-muted-foreground">
                          {format(new Date(message.created_at), "d MMM", { locale: nl })}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewDetails(message)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Message Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Bericht details
            </DialogTitle>
          </DialogHeader>
          
          {selectedMessage && (
            <div className="space-y-6">
              {/* Status and Actions */}
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Status:</span>
                  <Select 
                    value={selectedMessage.status} 
                    onValueChange={(status) => handleStatusChange(selectedMessage.id, status)}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">Nieuw</SelectItem>
                      <SelectItem value="in_progress">In behandeling</SelectItem>
                      <SelectItem value="resolved">Afgehandeld</SelectItem>
                      <SelectItem value="closed">Gesloten</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => window.open(`mailto:${selectedMessage.email}?subject=Re: ${selectedMessage.subject}`, "_blank")}
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Beantwoorden
                </Button>
              </div>

              {/* Contact Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <User className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Naam</p>
                    <p className="font-medium">{selectedMessage.name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <Mail className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <a 
                      href={`mailto:${selectedMessage.email}`} 
                      className="font-medium text-primary hover:underline"
                    >
                      {selectedMessage.email}
                    </a>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <Calendar className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Ontvangen</p>
                    <p className="font-medium">
                      {format(new Date(selectedMessage.created_at), "d MMMM yyyy 'om' HH:mm", { locale: nl })}
                    </p>
                  </div>
                </div>
                {selectedMessage.order_number && (
                  <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                    <Package className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Ordernummer</p>
                      <p className="font-medium">{selectedMessage.order_number}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Subject */}
              <div>
                <label className="text-sm font-medium text-muted-foreground">Onderwerp</label>
                <p className="mt-1 font-medium text-lg">{selectedMessage.subject}</p>
              </div>

              {/* Message */}
              <div>
                <label className="text-sm font-medium text-muted-foreground">Bericht</label>
                <div className="mt-2 p-4 bg-muted rounded-lg whitespace-pre-wrap">
                  {selectedMessage.message}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
