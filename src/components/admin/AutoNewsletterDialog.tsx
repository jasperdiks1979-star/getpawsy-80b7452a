import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  Eye,
  ShoppingBag,
  Lightbulb
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
}

const preferenceLabels = {
  product_updates: { label: "Product Updates", icon: Package },
  pet_care_tips: { label: "Verzorgingstips", icon: Heart },
  promotions: { label: "Aanbiedingen", icon: Tag },
  new_arrivals: { label: "Nieuwe Producten", icon: Sparkles },
};

const contentTypeOptions = [
  { value: 'new_products', label: 'Nieuwe Producten', description: 'Nieuwste toevoegingen aan de shop', icon: ShoppingBag },
  { value: 'bestsellers', label: 'Bestsellers', description: 'Populairste producten', icon: Sparkles },
  { value: 'tips', label: 'Verzorgingstips', description: 'Educatieve content uit blogs', icon: Lightbulb },
  { value: 'mixed', label: 'Gemengd', description: 'Mix van producten en tips', icon: RefreshCw },
];

const recurrenceOptions = [
  { value: 'weekly', label: 'Wekelijks' },
  { value: 'biweekly', label: 'Om de week' },
  { value: 'monthly', label: 'Maandelijks' },
];

const dayOptions = [
  { value: '1', label: 'Maandag' },
  { value: '2', label: 'Dinsdag' },
  { value: '3', label: 'Woensdag' },
  { value: '4', label: 'Donderdag' },
  { value: '5', label: 'Vrijdag' },
  { value: '6', label: 'Zaterdag' },
  { value: '0', label: 'Zondag' },
];

export function AutoNewsletterDialog({ open, onOpenChange, subscriberStats }: AutoNewsletterDialogProps) {
  const queryClient = useQueryClient();
  
  // Mode: 'ai', 'scheduled', 'recurring'
  const [mode, setMode] = useState<'ai' | 'scheduled' | 'recurring'>('ai');
  
  // Common fields
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [targetPreferences, setTargetPreferences] = useState<Preferences>({
    product_updates: false,
    pet_care_tips: false,
    promotions: false,
    new_arrivals: false,
  });
  
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
      toast.success("Nieuwsbrief content gegenereerd!");
    } catch (error: any) {
      console.error("Generate error:", error);
      toast.error(`Genereren mislukt: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Create campaign mutation
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
        toast.success("Campagne ingepland!");
      } else if (mode === 'recurring') {
        toast.success("Terugkerende nieuwsbrief ingesteld!");
      } else {
        toast.success("Campagne aangemaakt!");
      }
    },
    onError: (error) => {
      toast.error(`Fout: ${error.message}`);
    },
  });

  const resetForm = () => {
    setSubject("");
    setContent("");
    setTargetPreferences({
      product_updates: false,
      pet_care_tips: false,
      promotions: false,
      new_arrivals: false,
    });
    setCustomPrompt("");
    setMode('ai');
  };

  const canSubmit = subject && content && hasSelectedPreference;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            Automatische Nieuwsbrief
          </DialogTitle>
          <DialogDescription>
            Laat AI je nieuwsbrief schrijven, plan hem in, of stel terugkerende verzending in
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as 'ai' | 'scheduled' | 'recurring')}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="ai" className="gap-2">
              <Sparkles className="h-4 w-4" />
              AI Genereren
            </TabsTrigger>
            <TabsTrigger value="scheduled" className="gap-2">
              <Calendar className="h-4 w-4" />
              Inplannen
            </TabsTrigger>
            <TabsTrigger value="recurring" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Terugkerend
            </TabsTrigger>
          </TabsList>

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
              <Label htmlFor="customPrompt">Aanvullende instructies (optioneel)</Label>
              <Textarea
                id="customPrompt"
                placeholder="Bijv: Focus op winterproducten, of voeg een speciale korting toe..."
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
                  Content genereren...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4 mr-2" />
                  Genereer met AI
                </>
              )}
            </Button>
          </TabsContent>

          {/* Scheduled Tab */}
          <TabsContent value="scheduled" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="scheduledDate">Datum</Label>
                <Input
                  id="scheduledDate"
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  min={format(new Date(), "yyyy-MM-dd")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="scheduledTime">Tijd</Label>
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
                Wordt verzonden op {format(new Date(scheduledDate), "EEEE d MMMM yyyy", { locale: nl })} om {scheduledTime}
              </span>
            </div>
          </TabsContent>

          {/* Recurring Tab */}
          <TabsContent value="recurring" className="space-y-4 mt-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Frequentie</Label>
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
                <Label>Dag</Label>
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
                <Label>Tijd</Label>
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
                <span className="font-medium">Automatisch genereren met AI</span>
                <p className="text-xs text-muted-foreground">
                  Elke keer wordt nieuwe content gegenereerd op basis van actuele producten
                </p>
              </Label>
            </div>

            {useAiForRecurring && (
              <div className="space-y-2">
                <Label>Content Type voor automatische generatie</Label>
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
            <Label htmlFor="subject">Onderwerp</Label>
            <Input
              id="subject"
              placeholder="Bijv: Nieuwe wintercollectie voor je huisdier! 🐾"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Inhoud</Label>
            <RichTextEditor
              content={content}
              onChange={setContent}
              placeholder="Schrijf hier je nieuwsbrief of genereer met AI..."
              className="min-h-[200px]"
            />
          </div>

          <div className="space-y-2">
            <Label>Doelgroep</Label>
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
                      {subscriberStats?.[key as keyof Preferences] || 0} abonnees
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuleren
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!canSubmit || createMutation.isPending}
          >
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : mode === 'scheduled' ? (
              <Calendar className="h-4 w-4 mr-2" />
            ) : mode === 'recurring' ? (
              <RefreshCw className="h-4 w-4 mr-2" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            {mode === 'scheduled' ? 'Inplannen' : mode === 'recurring' ? 'Activeren' : 'Aanmaken'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
