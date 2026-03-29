import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Send, User, Headphones, ImagePlus, X, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import TypingIndicator from "./TypingIndicator";

interface ClaimMessage {
  id: string;
  dispute_id: string;
  sender_type: string;
  sender_id: string | null;
  message: string;
  is_internal: boolean;
  created_at: string;
  attachments: string[];
}

interface ClaimMessagingProps {
  disputeId: string;
  customerEmail: string;
}

const ClaimMessaging = ({ disputeId, customerEmail }: ClaimMessagingProps) => {
  const [newMessage, setNewMessage] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [supportIsTyping, setSupportIsTyping] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
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

  // Subscribe to realtime updates for new messages and typing indicators
  useEffect(() => {
    let messagesChannel: RealtimeChannel | null = null;
    let typingChannel: RealtimeChannel | null = null;
    let typingTimeout: NodeJS.Timeout | null = null;

    const setupRealtime = () => {
      // Messages channel for postgres changes
      messagesChannel = supabase
        .channel(`dispute-messages-${disputeId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "dispute_messages",
            filter: `dispute_id=eq.${disputeId}`,
          },
          (payload) => {
            const newMessage = payload.new as ClaimMessage;
            // Only add non-internal messages to the cache
            if (!newMessage.is_internal) {
              // Clear typing indicator when message arrives from support
              if (newMessage.sender_type === "support") {
                setSupportIsTyping(false);
              }
              queryClient.setQueryData(
                ["claim-messages", disputeId],
                (oldData: ClaimMessage[] | undefined) => {
                  if (!oldData) return [newMessage];
                  // Avoid duplicates
                  if (oldData.some((m) => m.id === newMessage.id)) return oldData;
                  return [...oldData, newMessage];
                }
              );
            }
          }
        )
        .subscribe();

      // Typing channel for broadcast events
      typingChannel = supabase
        .channel(`dispute-typing-${disputeId}`)
        .on("broadcast", { event: "typing" }, (payload) => {
          if (payload.payload?.sender_type === "support") {
            setSupportIsTyping(true);
            // Clear typing after 3 seconds of no updates
            if (typingTimeout) clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => {
              setSupportIsTyping(false);
            }, 3000);
          }
        })
        .on("broadcast", { event: "stop_typing" }, (payload) => {
          if (payload.payload?.sender_type === "support") {
            setSupportIsTyping(false);
            if (typingTimeout) clearTimeout(typingTimeout);
          }
        })
        .subscribe();
    };

    setupRealtime();

    return () => {
      if (messagesChannel) {
        supabase.removeChannel(messagesChannel);
      }
      if (typingChannel) {
        supabase.removeChannel(typingChannel);
      }
      if (typingTimeout) {
        clearTimeout(typingTimeout);
      }
    };
  }, [disputeId, queryClient]);

  // Scroll to bottom when new messages arrive or typing indicator shows
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, supportIsTyping]);

  const uploadImages = async (files: File[]): Promise<string[]> => {
    const uploadedUrls: string[] = [];
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;

    if (!userId) throw new Error("User not authenticated");

    for (const file of files) {
      const fileExt = file.name.split(".").pop();
      const fileName = `${userId}/${disputeId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("dispute-attachments")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: urlData, error: signError } = await supabase.storage
        .from("dispute-attachments")
        .createSignedUrl(fileName, 60 * 60); // 1-hour expiry

      if (signError || !urlData?.signedUrl) throw signError ?? new Error("Failed to create signed URL");
      uploadedUrls.push(urlData.signedUrl);
    }

    return uploadedUrls;
  };

  const sendMessageMutation = useMutation({
    mutationFn: async ({
      message,
      imageUrls,
    }: {
      message: string;
      imageUrls: string[];
    }) => {
      const response = await supabase.functions.invoke("manage-dispute", {
        body: {
          action: "add_message",
          disputeId,
          message,
          senderType: "customer",
          customerEmail,
          attachments: imageUrls,
        },
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: () => {
      setNewMessage("");
      setAttachments([]);
      queryClient.invalidateQueries({ queryKey: ["claim-messages", disputeId] });
      toast.success("Message sent successfully");
    },
    onError: (error) => {
      console.error("Failed to send message:", error);
      toast.error("Failed to send message. Please try again.");
    },
  });

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() && attachments.length === 0) return;

    try {
      setUploadingImages(true);
      let imageUrls: string[] = [];

      if (attachments.length > 0) {
        imageUrls = await uploadImages(attachments);
      }

      await sendMessageMutation.mutateAsync({
        message: newMessage.trim(),
        imageUrls,
      });
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload images. Please try again.");
    } finally {
      setUploadingImages(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter((file) => {
      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name} is not an image`);
        return false;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`${file.name} is too large (max 5MB)`);
        return false;
      }
      return true;
    });

    if (attachments.length + validFiles.length > 5) {
      toast.error("Maximum 5 images allowed per message");
      return;
    }

    setAttachments((prev) => [...prev, ...validFiles]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
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
            const msgAttachments = Array.isArray(msg.attachments)
              ? msg.attachments
              : [];

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
                    {msg.message && <p className="mb-2">{msg.message}</p>}
                    {msgAttachments.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {msgAttachments.map((url, idx) => (
                          <a
                            key={idx}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block"
                          >
                            <img
                              src={url}
                              alt={`Attachment ${idx + 1}`}
                              className="max-w-[150px] max-h-[100px] rounded-md object-cover border border-border/50"
                            />
                          </a>
                        ))}
                      </div>
                    )}
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

        {/* Typing Indicator */}
        {supportIsTyping && <TypingIndicator />}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <form onSubmit={handleSendMessage} className="border-t pt-4">
        {/* Attachment Preview */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {attachments.map((file, index) => (
              <div key={index} className="relative group">
                <img
                  src={URL.createObjectURL(file)}
                  alt={`Preview ${index + 1}`}
                  className="w-16 h-16 object-cover rounded-md border"
                />
                <button
                  type="button"
                  onClick={() => removeAttachment(index)}
                  className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type your message..."
            className="min-h-[80px] resize-none"
            disabled={sendMessageMutation.isPending || uploadingImages}
          />
        </div>

        <div className="flex justify-between items-center mt-2">
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={
                attachments.length >= 5 ||
                sendMessageMutation.isPending ||
                uploadingImages
              }
            >
              <ImagePlus className="w-4 h-4 mr-2" />
              Add Image
            </Button>
            {attachments.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {attachments.length}/5 images
              </span>
            )}
          </div>

          <Button
            type="submit"
            disabled={
              (!newMessage.trim() && attachments.length === 0) ||
              sendMessageMutation.isPending ||
              uploadingImages
            }
            size="sm"
          >
            {uploadingImages ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : sendMessageMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Send
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default ClaimMessaging;
