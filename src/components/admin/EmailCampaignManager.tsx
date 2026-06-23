import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { sanitizeHtml } from "@/lib/sanitize";
import { 
  Send, 
  Plus, 
  Mail, 
  Users, 
  Clock, 
  CheckCircle2, 
  Package, 
  Heart, 
  Tag, 
  Sparkles,
  Loader2,
  Trash2,
  Eye,
  MousePointerClick,
  BarChart3,
  TrendingUp,
  ChartLine,
  Wand2,
  Calendar,
  RefreshCw,
  Pause,
  Play
} from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { CampaignStatisticsView } from "./CampaignStatisticsView";
import { AutoNewsletterDialog } from "./AutoNewsletterDialog";

interface Preferences {
  product_updates: boolean;
  pet_care_tips: boolean;
  promotions: boolean;
  new_arrivals: boolean;
}

interface Campaign {
  id: string;
  subject: string;
  content: string;
  target_preferences: Preferences;
  sent_count: number;
  open_count: number;
  click_count: number;
  unique_opens: number;
  unique_clicks: number;
  status: string;
  sent_at: string | null;
  created_at: string;
  scheduled_at: string | null;
  is_recurring: boolean;
  recurrence_pattern: string | null;
  recurrence_day: number | null;
  recurrence_time: string | null;
  next_recurring_at: string | null;
  is_ai_generated: boolean;
}

const preferenceLabels = {
  product_updates: { label: "Product Updates", icon: Package },
  pet_care_tips: { label: "Verzorgingstips", icon: Heart },
  promotions: { label: "Aanbiedingen", icon: Tag },
  new_arrivals: { label: "Nieuwe Producten", icon: Sparkles },
};

interface EmailCampaignManagerProps {
  onNavigateToSubscribers?: () => void;
}

export function EmailCampaignManager({ onNavigateToSubscribers }: EmailCampaignManagerProps = {}) {
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showAutoDialog, setShowAutoDialog] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [showSendConfirm, setShowSendConfirm] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [showStatistics, setShowStatistics] = useState(false);
  const [statisticsCampaign, setStatisticsCampaign] = useState<Campaign | null>(null);
  
  const [newCampaign, setNewCampaign] = useState({
    subject: "",
    content: "",
    target_preferences: {
      product_updates: false,
      pet_care_tips: false,
      promotions: false,
      new_arrivals: false,
    } as Preferences,
  });

  // If viewing statistics, show the statistics view
  if (showStatistics && statisticsCampaign) {
    return (
      <CampaignStatisticsView 
        campaign={statisticsCampaign} 
        onBack={() => {
          setShowStatistics(false);
          setStatisticsCampaign(null);
        }} 
      />
    );
  }

  // Fetch campaigns
  const { data: campaigns, isLoading: campaignsLoading } = useQuery({
    queryKey: ["email-campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_campaigns")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return (data || []).map((c) => ({
        ...c,
        target_preferences: c.target_preferences as unknown as Preferences,
      })) as Campaign[];
    },
  });

  // Fetch subscriber counts per preference
  const { data: subscriberStats } = useQuery({
    queryKey: ["subscriber-preference-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("newsletter_subscribers")
        .select("preferences")
        .eq("is_active", true);
      
      if (error) throw error;
      
      const counts = {
        product_updates: 0,
        pet_care_tips: 0,
        promotions: 0,
        new_arrivals: 0,
        total: data?.length || 0,
      };
      
      data?.forEach((sub) => {
        const prefs = sub.preferences as unknown as Preferences;
        if (prefs?.product_updates) counts.product_updates++;
        if (prefs?.pet_care_tips) counts.pet_care_tips++;
        if (prefs?.promotions) counts.promotions++;
        if (prefs?.new_arrivals) counts.new_arrivals++;
      });
      
      return counts;
    },
  });

  // Calculate estimated reach
  const estimatedReach = useMemo(() => {
    if (!subscriberStats) return 0;
    
    const { target_preferences } = newCampaign;
    let reach = 0;
    
    if (target_preferences.product_updates) reach = Math.max(reach, subscriberStats.product_updates);
    if (target_preferences.pet_care_tips) reach = Math.max(reach, subscriberStats.pet_care_tips);
    if (target_preferences.promotions) reach = Math.max(reach, subscriberStats.promotions);
    if (target_preferences.new_arrivals) reach = Math.max(reach, subscriberStats.new_arrivals);
    
    return reach;
  }, [newCampaign.target_preferences, subscriberStats]);

  // Create campaign mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("email_campaigns")
        .insert([{
          subject: newCampaign.subject,
          content: newCampaign.content,
          target_preferences: JSON.parse(JSON.stringify(newCampaign.target_preferences)),
          status: "draft",
        }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-campaigns"] });
      setShowCreateDialog(false);
      setNewCampaign({
        subject: "",
        content: "",
        target_preferences: {
          product_updates: false,
          pet_care_tips: false,
          promotions: false,
          new_arrivals: false,
        },
      });
      toast.success("Campagne aangemaakt!");
    },
    onError: (error) => {
      toast.error(`Fout bij aanmaken: ${error.message}`);
    },
  });

  // Send campaign mutation
  const sendMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const { data, error } = await supabase.functions.invoke("send-email-campaign", {
        body: { campaignId },
      });
      
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["email-campaigns"] });
      setShowSendConfirm(false);
      setSelectedCampaign(null);
      toast.success(`Campagne verzonden naar ${data.sentCount} abonnees!`);
    },
    onError: (error) => {
      toast.error(`Fout bij verzenden: ${error.message}`);
    },
  });

  // Delete campaign mutation
  const deleteMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const { error } = await supabase
        .from("email_campaigns")
        .delete()
        .eq("id", campaignId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-campaigns"] });
      toast.success("Campagne verwijderd!");
    },
    onError: (error) => {
      toast.error(`Fout bij verwijderen: ${error.message}`);
    },
  });

  const handlePreferenceToggle = (key: keyof Preferences) => {
    setNewCampaign((prev) => ({
      ...prev,
      target_preferences: {
        ...prev.target_preferences,
        [key]: !prev.target_preferences[key],
      },
    }));
  };

  const hasSelectedPreference = Object.values(newCampaign.target_preferences).some(Boolean);

  const draftCampaigns = campaigns?.filter((c) => c.status === "draft") || [];
  const scheduledCampaigns = campaigns?.filter((c) => c.status === "scheduled") || [];
  const recurringCampaigns = campaigns?.filter((c) => c.is_recurring && c.status === "active") || [];
  const sentCampaigns = campaigns?.filter((c) => c.status === "sent") || [];

  // Toggle recurring campaign
  const toggleRecurringMutation = useMutation({
    mutationFn: async ({ id, activate }: { id: string; activate: boolean }) => {
      const { error } = await supabase
        .from("email_campaigns")
        .update({ status: activate ? "active" : "paused" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-campaigns"] });
      toast.success("Status bijgewerkt");
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold">E-mail Campagnes</h2>
          <p className="text-muted-foreground">
            Verstuur nieuwsbrieven naar abonnees op basis van hun voorkeuren
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowAutoDialog(true)}>
            <Wand2 className="h-4 w-4 mr-2" />
            AI / Automatisch
          </Button>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Handmatig
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Object.entries(preferenceLabels).map(([key, { label, icon: Icon }]) => (
          <Card key={key}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="text-2xl font-bold">
                    {subscriberStats?.[key as keyof Preferences] || 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="drafts">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="drafts" className="gap-2">
            <Clock className="h-4 w-4" />
            Concepten ({draftCampaigns.length})
          </TabsTrigger>
          <TabsTrigger value="scheduled" className="gap-2">
            <Calendar className="h-4 w-4" />
            Ingepland ({scheduledCampaigns.length})
          </TabsTrigger>
          <TabsTrigger value="recurring" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Terugkerend ({recurringCampaigns.length})
          </TabsTrigger>
          <TabsTrigger value="sent" className="gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Verzonden ({sentCampaigns.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="drafts" className="mt-4">
          {campaignsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : draftCampaigns.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Geen concepten. Maak een nieuwe campagne aan.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {draftCampaigns.map((campaign) => (
                <Card key={campaign.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate">{campaign.subject}</h3>
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                          {campaign.content}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-3">
                          {Object.entries(campaign.target_preferences).map(
                            ([key, value]) =>
                              value && (
                                <Badge key={key} variant="secondary" className="text-xs">
                                  {preferenceLabels[key as keyof Preferences]?.label}
                                </Badge>
                              )
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedCampaign(campaign);
                            setShowPreviewDialog(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deleteMutation.mutate(campaign.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            setSelectedCampaign(campaign);
                            setShowSendConfirm(true);
                          }}
                        >
                          <Send className="h-4 w-4 mr-2" />
                          Versturen
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Scheduled Campaigns Tab */}
        <TabsContent value="scheduled" className="mt-4">
          {scheduledCampaigns.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Geen ingeplande campagnes.</p>
                <Button variant="link" onClick={() => setShowAutoDialog(true)} className="mt-2">
                  Plan een campagne in
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {scheduledCampaigns.map((campaign) => (
                <Card key={campaign.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold truncate">{campaign.subject}</h3>
                          {campaign.is_ai_generated && (
                            <Badge variant="secondary" className="text-xs">
                              <Sparkles className="h-3 w-3 mr-1" />
                              AI
                            </Badge>
                          )}
                        </div>
                        {campaign.scheduled_at && (
                          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            Gepland voor {format(new Date(campaign.scheduled_at), "EEEE d MMMM yyyy 'om' HH:mm", { locale: nl })}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2 mt-3">
                          {Object.entries(campaign.target_preferences).map(
                            ([key, value]) =>
                              value && (
                                <Badge key={key} variant="secondary" className="text-xs">
                                  {preferenceLabels[key as keyof Preferences]?.label}
                                </Badge>
                              )
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedCampaign(campaign);
                            setShowPreviewDialog(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deleteMutation.mutate(campaign.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Recurring Campaigns Tab */}
        <TabsContent value="recurring" className="mt-4">
          {recurringCampaigns.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <RefreshCw className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Geen terugkerende nieuwsbrieven.</p>
                <Button variant="link" onClick={() => setShowAutoDialog(true)} className="mt-2">
                  Stel een terugkerende nieuwsbrief in
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {recurringCampaigns.map((campaign) => (
                <Card key={campaign.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold truncate">{campaign.subject}</h3>
                          {campaign.is_ai_generated && (
                            <Badge variant="secondary" className="text-xs">
                              <Sparkles className="h-3 w-3 mr-1" />
                              AI
                            </Badge>
                          )}
                          <Badge variant="default" className="text-xs">
                            <RefreshCw className="h-3 w-3 mr-1" />
                            {campaign.recurrence_pattern === 'weekly' ? 'Wekelijks' : 
                             campaign.recurrence_pattern === 'biweekly' ? 'Om de week' : 'Maandelijks'}
                          </Badge>
                        </div>
                        {campaign.next_recurring_at && (
                          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            Volgende: {format(new Date(campaign.next_recurring_at), "EEEE d MMMM 'om' HH:mm", { locale: nl })}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2 mt-3">
                          {Object.entries(campaign.target_preferences).map(
                            ([key, value]) =>
                              value && (
                                <Badge key={key} variant="outline" className="text-xs">
                                  {preferenceLabels[key as keyof Preferences]?.label}
                                </Badge>
                              )
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleRecurringMutation.mutate({ 
                            id: campaign.id, 
                            activate: campaign.status === 'paused' 
                          })}
                        >
                          {campaign.status === 'paused' ? (
                            <Play className="h-4 w-4" />
                          ) : (
                            <Pause className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deleteMutation.mutate(campaign.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="sent" className="mt-4">
          {sentCampaigns.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nog geen campagnes verzonden.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {sentCampaigns.map((campaign) => {
                const openRate = campaign.sent_count > 0 
                  ? ((campaign.unique_opens / campaign.sent_count) * 100).toFixed(1) 
                  : "0.0";
                const clickRate = campaign.unique_opens > 0 
                  ? ((campaign.unique_clicks / campaign.unique_opens) * 100).toFixed(1) 
                  : "0.0";
                
                return (
                  <Card key={campaign.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold truncate">{campaign.subject}</h3>
                          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1">
                              <Users className="h-4 w-4" />
                              {campaign.sent_count} verzonden
                            </span>
                            {campaign.sent_at && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-4 w-4" />
                                {format(new Date(campaign.sent_at), "d MMM yyyy 'om' HH:mm", { locale: nl })}
                              </span>
                            )}
                          </div>
                          
                          {/* Statistics */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 p-3 bg-muted/50 rounded-lg">
                            <div className="text-center">
                              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                                <Eye className="h-3.5 w-3.5" />
                                <span className="text-xs">Opens</span>
                              </div>
                              <p className="text-lg font-bold">{campaign.unique_opens}</p>
                              <p className="text-xs text-muted-foreground">{campaign.open_count} totaal</p>
                            </div>
                            <div className="text-center">
                              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                                <TrendingUp className="h-3.5 w-3.5" />
                                <span className="text-xs">Open Rate</span>
                              </div>
                              <p className="text-lg font-bold text-green-600">{openRate}%</p>
                              <p className="text-xs text-muted-foreground">uniek</p>
                            </div>
                            <div className="text-center">
                              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                                <MousePointerClick className="h-3.5 w-3.5" />
                                <span className="text-xs">Clicks</span>
                              </div>
                              <p className="text-lg font-bold">{campaign.unique_clicks}</p>
                              <p className="text-xs text-muted-foreground">{campaign.click_count} totaal</p>
                            </div>
                            <div className="text-center">
                              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                                <BarChart3 className="h-3.5 w-3.5" />
                                <span className="text-xs">Click Rate</span>
                              </div>
                              <p className="text-lg font-bold text-blue-600">{clickRate}%</p>
                              <p className="text-xs text-muted-foreground">van opens</p>
                            </div>
                          </div>
                          
                          <div className="flex flex-wrap gap-2 mt-3">
                            {Object.entries(campaign.target_preferences).map(
                              ([key, value]) =>
                                value && (
                                  <Badge key={key} variant="outline" className="text-xs">
                                    {preferenceLabels[key as keyof Preferences]?.label}
                                  </Badge>
                                )
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Badge variant="default" className="bg-green-500 shrink-0">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Verzonden
                          </Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setStatisticsCampaign(campaign);
                              setShowStatistics(true);
                            }}
                          >
                            <ChartLine className="h-4 w-4 mr-2" />
                            Statistieken
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Campaign Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nieuwe E-mail Campagne</DialogTitle>
            <DialogDescription>
              Maak een nieuwe nieuwsbrief en selecteer de doelgroep
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="subject">Onderwerp</Label>
              <Input
                id="subject"
                placeholder="Bijv: Nieuwe wintercollectie voor je huisdier! 🐾"
                value={newCampaign.subject}
                onChange={(e) => setNewCampaign((prev) => ({ ...prev, subject: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="content">Inhoud</Label>
              <RichTextEditor
                content={newCampaign.content}
                onChange={(content) => setNewCampaign((prev) => ({ ...prev, content }))}
                placeholder="Schrijf hier je nieuwsbrief..."
                className="min-h-[250px]"
              />
            </div>

            <div className="space-y-3">
              <Label>Doelgroep (selecteer één of meer voorkeuren)</Label>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(preferenceLabels).map(([key, { label, icon: Icon }]) => (
                  <div
                    key={key}
                    className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      newCampaign.target_preferences[key as keyof Preferences]
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/50"
                    }`}
                    onClick={() => handlePreferenceToggle(key as keyof Preferences)}
                  >
                    <Checkbox
                      checked={newCampaign.target_preferences[key as keyof Preferences]}
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
              
              {hasSelectedPreference && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                  <Users className="h-4 w-4" />
                  <span>Geschat bereik: <strong className="text-foreground">{estimatedReach}</strong> abonnees</span>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Annuleren
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!newCampaign.subject || !newCampaign.content || !hasSelectedPreference || createMutation.isPending}
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Campagne Aanmaken
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview: {selectedCampaign?.subject}</DialogTitle>
          </DialogHeader>
          
          <div className="border rounded-lg bg-muted/20 max-h-[60vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-primary to-purple-500 p-6 rounded-t-lg text-center">
              <h1 className="text-2xl font-bold text-white">🐾 GetPawsy</h1>
            </div>
            <div className="bg-white dark:bg-background p-6 rounded-b-lg">
              <h2 className="text-xl font-semibold mb-4">{selectedCampaign?.subject}</h2>
              <div 
                className="prose prose-sm dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(selectedCampaign?.content || "") }}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Send Confirmation Dialog */}
      <Dialog open={showSendConfirm} onOpenChange={setShowSendConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Campagne Versturen</DialogTitle>
            <DialogDescription>
              Weet je zeker dat je deze campagne wilt versturen?
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <p className="font-medium">{selectedCampaign?.subject}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              {selectedCampaign && Object.entries(selectedCampaign.target_preferences).map(
                ([key, value]) =>
                  value && (
                    <Badge key={key} variant="secondary" className="text-xs">
                      {preferenceLabels[key as keyof Preferences]?.label}
                    </Badge>
                  )
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSendConfirm(false)}>
              Annuleren
            </Button>
            <Button
              onClick={() => selectedCampaign && sendMutation.mutate(selectedCampaign.id)}
              disabled={sendMutation.isPending}
            >
              {sendMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Verzenden...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Versturen
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auto Newsletter Dialog */}
      <AutoNewsletterDialog
        open={showAutoDialog}
        onOpenChange={setShowAutoDialog}
        subscriberStats={subscriberStats}
        onOpenSubscribers={onNavigateToSubscribers}
      />
    </div>
  );
}
