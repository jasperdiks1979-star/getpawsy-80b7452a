import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  Sparkles, 
  Loader2, 
  Wand2, 
  Calendar, 
  RefreshCw,
  Clock,
  Package,
  Heart,
  Tag,
  Send,
  ShoppingBag,
  Lightbulb,
  Plus,
  X,
  Users,
  Mail
} from "lucide-react";
import { format, addDays, setHours, setMinutes } from "date-fns";
import { nl } from "date-fns/locale";

interface Preferences {
  product_updates: boolean;
  pet_care_tips: boolean;
  promotions: boolean;
  new_arrivals: boolean;
}

interface AutoNewsletterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscriberStats?: {
    product_updates: number;
    pet_care_tips: number;
    promotions: number;
    new_arrivals: number;
    total: number;
  };
  onOpenSubscribers?: () => void;
}

const preferenceLabels = {
  product_updates: { label: "Product Updates", icon: Package },
  pet_care_tips: { label: "Pet Care Tips", icon: Heart },
  promotions: { label: "Promotions", icon: Tag },
  new_arrivals: { label: "New Arrivals", icon: Sparkles },
};

const contentTypeOptions = [
  { value: 'new_products', label: 'New Products', description: 'Latest additions to the shop', icon: ShoppingBag },
  { value: 'bestsellers', label: 'Bestsellers', description: 'Most popular products', icon: Sparkles },
  { value: 'tips', label: 'Care Tips', description: 'Educational blog content', icon: Lightbulb },
  { value: 'mixed', label: 'Mixed', description: 'Mix of products and tips', icon: RefreshCw },
];

const recurrenceOptions = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const dayOptions = [
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
  { value: '0', label: 'Sunday' },
];

export function AutoNewsletterDialog({ open, onOpenChange, subscriberStats, onOpenSubscribers }: AutoNewsletterDialogProps) {
  const queryClient = useQueryClient();
  
  // Mode: 'sendnow', 'ai', 'scheduled', 'recurring'
  const [mode, setMode] = useState<'sendnow' | 'ai' | 'scheduled' | 'recurring'>('sendnow');
  
  // Common fields
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [targetPreferences, setTargetPreferences] = useState<Preferences>({
    product_updates: true,
    pet_care_tips: true,
    promotions: true,
    new_arrivals: true,
  });
  
  // Additional manual emails
  const [additionalEmails, setAdditionalEmails] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState("");
  
  // AI generation fields
  const [aiContentType, setAiContentType] = useState<string>("mixed");
  const [customPrompt, setCustomPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Scheduling fields
  const [scheduledDate, setScheduledDate] = useState<string>(format(addDays(new Date(), 1), "yyyy-MM-dd"));
  const [scheduledTime, setScheduledTime] = useState("10:00");
  
  // Recurring fields
  const [recurrencePattern, setRecurrencePattern] = useState("weekly");
  const [recurrenceDay, setRecurrenceDay] = useState("2"); // Tuesday
  const [recurrenceTime, setRecurrenceTime] = useState("10:00");
  const [useAiForRecurring, setUseAiForRecurring] = useState(true);

  const handlePreferenceToggle = (key: keyof Preferences) => {
    setTargetPreferences(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const hasSelectedPreference = Object.values(targetPreferences).some(Boolean);

  // Add email to list
  const addEmail = () => {
    const email = newEmail.trim().toLowerCase();
    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (email && emailRegex.test(email) && !additionalEmails.includes(email)) {
      setAdditionalEmails(prev => [...prev, email]);
      setNewEmail("");
    } else if (!emailRegex.test(email)) {
      toast.error("Invalid email address");
    } else if (additionalEmails.includes(email)) {
      toast.error("Email already added");
    }
  };

  const removeEmail = (email: string) => {
    setAdditionalEmails(prev => prev.filter(e => e !== email));
  };

  // Generate AI content
  const generateContent = async () => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-newsletter-content", {
        body: {
          contentType: aiContentType,
          customPrompt: customPrompt || undefined,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setSubject(data.subject);
      setContent(data.content);
      toast.success("Newsletter content generated!");
    } catch (error: any) {
      console.error("Generate error:", error);
      toast.error(`Generation failed: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Send now mutation
  const sendNowMutation = useMutation({
    mutationFn: async () => {
      // First create the campaign
      const { data: campaign, error: createError } = await supabase
        .from("email_campaigns")
        .insert([{
          subject,
          content,
          target_preferences: JSON.parse(JSON.stringify(targetPreferences)),
          status: "draft",
          is_ai_generated: false,
        }])
        .select()
        .single();

      if (createError) throw createError;

      // Then send it immediately
      const { data, error } = await supabase.functions.invoke("send-email-campaign", {
        body: { 
          campaignId: campaign.id,
          additionalEmails: additionalEmails.length > 0 ? additionalEmails : undefined,
        },
      });
      
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["email-campaigns"] });
      onOpenChange(false);
      resetForm();
      
      const additionalInfo = data.additionalEmailCount > 0 
        ? ` (including ${data.additionalEmailCount} manual emails)`
        : '';
      toast.success(`Newsletter sent to ${data.sentCount} recipients${additionalInfo}!`);
    },
    onError: (error) => {
      toast.error(`Sending failed: ${error.message}`);
    },
  });

  // Create campaign mutation (for scheduled/recurring)
  const createMutation = useMutation({
    mutationFn: async () => {
      let status = 'draft';
      let scheduled_at: string | null = null;
      let is_recurring = false;
      let next_recurring_at: string | null = null;
      
      if (mode === 'scheduled') {
        status = 'scheduled';
        const [hours, minutes] = scheduledTime.split(':').map(Number);
        const date = new Date(scheduledDate);
        date.setHours(hours, minutes, 0, 0);
        scheduled_at = date.toISOString();
      } else if (mode === 'recurring') {
        status = 'active';
        is_recurring = true;
        // Calculate first occurrence
        const [hours, minutes] = recurrenceTime.split(':').map(Number);
        const now = new Date();
        const targetDay = parseInt(recurrenceDay);
        const currentDay = now.getDay();
        let daysUntilTarget = (targetDay - currentDay + 7) % 7;
        if (daysUntilTarget === 0) daysUntilTarget = 7; // Next week if same day
        const nextDate = addDays(now, daysUntilTarget);
        const finalDate = setMinutes(setHours(nextDate, hours), minutes);
        next_recurring_at = finalDate.toISOString();
      }
      
      const { data, error } = await supabase
        .from("email_campaigns")
        .insert([{
          subject,
          content,
          target_preferences: JSON.parse(JSON.stringify(targetPreferences)),
          status,
          scheduled_at,
          is_recurring,
          recurrence_pattern: is_recurring ? recurrencePattern : null,
          recurrence_day: is_recurring ? parseInt(recurrenceDay) : null,
          recurrence_time: is_recurring ? recurrenceTime : null,
          next_recurring_at,
          is_ai_generated: mode === 'ai' || (mode === 'recurring' && useAiForRecurring),
          ai_content_type: (mode === 'ai' || (mode === 'recurring' && useAiForRecurring)) ? aiContentType : null,
          ai_prompt: customPrompt || null,
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-campaigns"] });
      onOpenChange(false);
      resetForm();
      
      if (mode === 'scheduled') {
        toast.success("Campaign scheduled!");
      } else if (mode === 'recurring') {
        toast.success("Recurring newsletter set up!");
      } else {
        toast.success("Campaign created!");
      }
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  const resetForm = () => {
    setSubject("");
    setContent("");
    setTargetPreferences({
      product_updates: true,
      pet_care_tips: true,
      promotions: true,
      new_arrivals: true,
    });
    setAdditionalEmails([]);
    setNewEmail("");
    setCustomPrompt("");
    setMode('sendnow');
  };

  const canSubmit = subject && content && (hasSelectedPreference || additionalEmails.length > 0);

  const handleSubmit = () => {
    if (mode === 'sendnow') {
      sendNowMutation.mutate();
    } else {
      createMutation.mutate();
    }
  };

  const isPending = sendNowMutation.isPending || createMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            Newsletter Manager
          </DialogTitle>
          <DialogDescription>
            Create, schedule, or send newsletters with AI-generated content
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as 'sendnow' | 'ai' | 'scheduled' | 'recurring')}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="sendnow" className="gap-2">
              <Send className="h-4 w-4" />
              Send Now
            </TabsTrigger>
            <TabsTrigger value="ai" className="gap-2">
              <Sparkles className="h-4 w-4" />
              AI Generate
            </TabsTrigger>
            <TabsTrigger value="scheduled" className="gap-2">
              <Calendar className="h-4 w-4" />
              Schedule
            </TabsTrigger>
            <TabsTrigger value="recurring" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Recurring
            </TabsTrigger>
          </TabsList>

          {/* Send Now Tab */}
          <TabsContent value="sendnow" className="space-y-4 mt-4">
            <div className="bg-primary/5 p-4 rounded-lg border border-primary/20">
              <div className="flex items-start gap-3">
                <Send className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium text-sm">Immediate Delivery</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Write your content below and send it immediately to all selected subscribers.
                    You can also add extra email addresses manually.
                  </p>
                </div>
              </div>
            </div>

            {/* Manual Email Input */}
            <div className="space-y-2">
              <Label>Add Extra Email Addresses (optional)</Label>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="email@example.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addEmail();
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={addEmail}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {additionalEmails.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {additionalEmails.map((email) => (
                    <Badge key={email} variant="secondary" className="pl-2 pr-1 py-1">
                      <Mail className="h-3 w-3 mr-1" />
                      {email}
                      <button
                        onClick={() => removeEmail(email)}
                        className="ml-1 hover:bg-muted rounded-sm p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* AI Generation Tab */}
          <TabsContent value="ai" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Content Type</Label>
              <div className="grid grid-cols-2 gap-2">
                {contentTypeOptions.map(({ value, label, description, icon: Icon }) => (
                  <div
                    key={value}
                    className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      aiContentType === value
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/50"
                    }`}
                    onClick={() => setAiContentType(value)}
                  >
                    <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground">{description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="customPrompt">Additional Instructions (optional)</Label>
              <Textarea
                id="customPrompt"
                placeholder="E.g.: Focus on winter products, or add a special discount..."
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                rows={2}
              />
            </div>

            <Button 
              onClick={generateContent} 
              disabled={isGenerating}
              className="w-full"
              variant="secondary"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating content...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4 mr-2" />
                  Generate with AI
                </>
              )}
            </Button>
          </TabsContent>

          {/* Scheduled Tab */}
          <TabsContent value="scheduled" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="scheduledDate">Date</Label>
                <Input
                  id="scheduledDate"
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  min={format(new Date(), "yyyy-MM-dd")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="scheduledTime">Time</Label>
                <Input
                  id="scheduledTime"
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                />
              </div>
            </div>
            
            <div className="bg-muted/50 p-3 rounded-lg flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>
                Will be sent on {format(new Date(scheduledDate), "EEEE, MMMM d, yyyy")} at {scheduledTime}
              </span>
            </div>
          </TabsContent>

          {/* Recurring Tab */}
          <TabsContent value="recurring" className="space-y-4 mt-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select value={recurrencePattern} onValueChange={setRecurrencePattern}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {recurrenceOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Day</Label>
                <Select value={recurrenceDay} onValueChange={setRecurrenceDay}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {dayOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Time</Label>
                <Input
                  type="time"
                  value={recurrenceTime}
                  onChange={(e) => setRecurrenceTime(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center space-x-2 p-3 border rounded-lg">
              <Checkbox
                id="useAiForRecurring"
                checked={useAiForRecurring}
                onCheckedChange={(checked) => setUseAiForRecurring(!!checked)}
              />
              <Label htmlFor="useAiForRecurring" className="flex-1 cursor-pointer">
                <span className="font-medium">Auto-generate with AI</span>
                <p className="text-xs text-muted-foreground">
                  Fresh content will be generated each time based on current products
                </p>
              </Label>
            </div>

            {useAiForRecurring && (
              <div className="space-y-2">
                <Label>Content Type for auto-generation</Label>
                <Select value={aiContentType} onValueChange={setAiContentType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {contentTypeOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Common Fields */}
        <div className="space-y-4 pt-4 border-t">
          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              placeholder="E.g.: New Winter Collection for Your Pet! 🐾"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Content</Label>
            <RichTextEditor
              content={content}
              onChange={setContent}
              placeholder="Write your newsletter here or generate with AI..."
              className="min-h-[200px]"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Target Audience</Label>
              {onOpenSubscribers && (
                <Button variant="link" size="sm" className="h-auto p-0" onClick={onOpenSubscribers}>
                  <Users className="h-3 w-3 mr-1" />
                  Manage Subscribers
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(preferenceLabels).map(([key, { label, icon: Icon }]) => (
                <div
                  key={key}
                  className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                    targetPreferences[key as keyof Preferences]
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50"
                  }`}
                  onClick={() => handlePreferenceToggle(key as keyof Preferences)}
                >
                  <Checkbox
                    checked={targetPreferences[key as keyof Preferences]}
                    onCheckedChange={() => handlePreferenceToggle(key as keyof Preferences)}
                  />
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">
                      {subscriberStats?.[key as keyof Preferences] || 0} subscribers
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {additionalEmails.length > 0 && (
              <p className="text-xs text-muted-foreground">
                + {additionalEmails.length} manual email{additionalEmails.length !== 1 ? 's' : ''} added
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || isPending}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : mode === 'sendnow' ? (
              <Send className="h-4 w-4 mr-2" />
            ) : mode === 'scheduled' ? (
              <Calendar className="h-4 w-4 mr-2" />
            ) : mode === 'recurring' ? (
              <RefreshCw className="h-4 w-4 mr-2" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            {mode === 'sendnow' ? 'Send Now' : mode === 'scheduled' ? 'Schedule' : mode === 'recurring' ? 'Activate' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
