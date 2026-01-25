import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Send, User, Headphones } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface ClaimMessage {
  id: string;
  dispute_id: string;
  sender_type: string;
  sender_id: string | null;
  message: string;
  is_internal: boolean;
  created_at: string;
  attachments: unknown[];
}

interface ClaimMessagingProps {
  disputeId: string;
  customerEmail: string;
}

const ClaimMessaging = ({ disputeId, customerEmail }: ClaimMessagingProps) => {
  const [newMessage, setNewMessage] = useState("");
  const queryClient = useQueryClient();

  const { data: messages, isLoading } = useQuery({
    queryKey: ["claim-messages", disputeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dispute_messages")
        .select("*")
        .eq("dispute_id", disputeId)
        .eq("is_internal", false)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as ClaimMessage[];
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      const { data: sessionData } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke("manage-dispute", {
        body: {
          action: "add_message",
          disputeId,
          message,
          senderType: "customer",
          customerEmail,
        },
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: () => {
      setNewMessage("");
      queryClient.invalidateQueries({ queryKey: ["claim-messages", disputeId] });
      toast.success("Message sent successfully");
    },
    onError: (error) => {
      console.error("Failed to send message:", error);
      toast.error("Failed to send message. Please try again.");
    },
  });

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    sendMessageMutation.mutate(newMessage.trim());
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-16 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages List */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 max-h-[300px] pr-2">
        {messages && messages.length > 0 ? (
          messages.map((msg) => {
            const isCustomer = msg.sender_type === "customer";
            return (
              <div
                key={msg.id}
                className={`flex gap-3 ${isCustomer ? "flex-row-reverse" : ""}`}
              >
                <div
                  className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    isCustomer
                      ? "bg-primary/10 text-primary"
                      : "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                  }`}
                >
                  {isCustomer ? (
                    <User className="w-4 h-4" />
                  ) : (
                    <Headphones className="w-4 h-4" />
                  )}
                </div>
                <div
                  className={`flex-1 max-w-[80%] ${
                    isCustomer ? "text-right" : ""
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-xs font-medium ${
                        isCustomer ? "ml-auto" : ""
                      }`}
                    >
                      {isCustomer ? "You" : "Support Team"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(msg.created_at), "MMM d, h:mm a")}
                    </span>
                  </div>
                  <div
                    className={`rounded-lg p-3 text-sm ${
                      isCustomer
                        ? "bg-primary text-primary-foreground ml-auto"
                        : "bg-muted"
                    }`}
                  >
                    {msg.message}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Headphones className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No messages yet</p>
            <p className="text-xs mt-1">
              Send a message to start the conversation
            </p>
          </div>
        )}
      </div>

      {/* Message Input */}
      <form onSubmit={handleSendMessage} className="border-t pt-4">
        <div className="flex gap-2">
          <Textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type your message..."
            className="min-h-[80px] resize-none"
            disabled={sendMessageMutation.isPending}
          />
        </div>
        <div className="flex justify-end mt-2">
          <Button
            type="submit"
            disabled={!newMessage.trim() || sendMessageMutation.isPending}
            size="sm"
          >
            <Send className="w-4 h-4 mr-2" />
            {sendMessageMutation.isPending ? "Sending..." : "Send Message"}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default ClaimMessaging;
