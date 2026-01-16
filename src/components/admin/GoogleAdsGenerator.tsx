import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { 
  Sparkles, 
  Copy, 
  RefreshCw, 
  Loader2, 
  Target,
  Type,
  FileText,
  Tag,
  Save,
  History,
  Trash2,
  Eye
} from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

interface GeneratedAd {
  headlines: string[];
  descriptions: string[];
  displayPaths: string[];
  keywords: string[];
}

interface SavedAd {
  id: string;
  product_id: string | null;
  product_name: string;
  target_audience: string | null;
  language: string;
  headlines: string[];
  descriptions: string[];
  display_paths: string[];
  keywords: string[];
  created_at: string;
}

export function GoogleAdsGenerator() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [productName, setProductName] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedAd, setGeneratedAd] = useState<GeneratedAd | null>(null);
  const [selectedSavedAd, setSelectedSavedAd] = useState<SavedAd | null>(null);

  // Fetch products for quick selection
  const { data: products } = useQuery({
    queryKey: ["admin-products-for-ads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, description")
        .eq("is_active", true)
        .order("name")
        .limit(50);
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch saved ads
  const { data: savedAds, isLoading: isLoadingSavedAds } = useQuery({
    queryKey: ["saved-google-ads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("saved_google_ads")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as SavedAd[];
    },
  });

  // Save ad mutation
  const saveAdMutation = useMutation({
    mutationFn: async (ad: GeneratedAd) => {
      if (!user) throw new Error("Niet ingelogd");
      
      const { error } = await supabase.from("saved_google_ads").insert({
        user_id: user.id,
        product_id: selectedProductId || null,
        product_name: productName,
        target_audience: targetAudience || null,
        language: "nl",
        headlines: ad.headlines,
        descriptions: ad.descriptions,
        display_paths: ad.displayPaths,
        keywords: ad.keywords,
      });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-google-ads"] });
      toast.success("Advertentie opgeslagen!");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Opslaan mislukt");
    },
  });

  // Delete ad mutation
  const deleteAdMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("saved_google_ads")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-google-ads"] });
      setSelectedSavedAd(null);
      toast.success("Advertentie verwijderd");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Verwijderen mislukt");
    },
  });

  const handleProductSelect = (productId: string) => {
    setSelectedProductId(productId);
    const product = products?.find(p => p.id === productId);
    if (product) {
      setProductName(product.name);
      setProductDescription(product.description || "");
    }
  };

  const generateAds = async () => {
    if (!productName.trim()) {
      toast.error("Vul een productnaam in");
      return;
    }

    setIsGenerating(true);
    setGeneratedAd(null);

    try {
      const { data, error } = await supabase.functions.invoke("generate-google-ads", {
        body: {
          productName,
          productDescription,
          targetAudience,
          language: "nl",
        },
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      setGeneratedAd(data);
      toast.success("Google Ads gegenereerd!");
    } catch (error) {
      console.error("Failed to generate ads:", error);
      toast.error(error instanceof Error ? error.message : "Genereren mislukt");
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Gekopieerd naar klembord");
  };

  const copyAllAds = (ad: GeneratedAd | SavedAd) => {
    const isGeneratedAd = 'displayPaths' in ad;
    const headlines = ad.headlines;
    const descriptions = ad.descriptions;
    const displayPaths = isGeneratedAd ? ad.displayPaths : (ad as SavedAd).display_paths;
    const keywords = ad.keywords;
    const name = 'product_name' in ad ? (ad as SavedAd).product_name : productName;
    
    const allText = `
GOOGLE ADS - ${name}

HEADLINES:
${headlines.map((h, i) => `${i + 1}. ${h}`).join("\n")}

DESCRIPTIONS:
${descriptions.map((d, i) => `${i + 1}. ${d}`).join("\n")}

DISPLAY PATHS:
/${displayPaths.join("/")}

KEYWORDS:
${keywords.join(", ")}
    `.trim();
    
    navigator.clipboard.writeText(allText);
    toast.success("Alle advertentieteksten gekopieerd");
  };

  const renderAdContent = (ad: GeneratedAd | SavedAd, showSaveButton: boolean = false) => {
    const isGeneratedAd = 'displayPaths' in ad;
    const headlines = ad.headlines;
    const descriptions = ad.descriptions;
    const displayPaths = isGeneratedAd ? ad.displayPaths : (ad as SavedAd).display_paths;
    const keywords = ad.keywords;

    return (
      <div className="space-y-6">
        {/* Headlines */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Type className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-medium">Headlines (max 30 tekens)</h3>
          </div>
          <div className="space-y-2">
            {headlines.map((headline, index) => (
              <div 
                key={index}
                className="flex items-center justify-between p-3 bg-muted rounded-lg group"
              >
                <div className="flex-1">
                  <span className="font-medium">{headline}</span>
                  <span className={`ml-2 text-xs ${headline.length > 30 ? "text-destructive" : "text-muted-foreground"}`}>
                    ({headline.length}/30)
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(headline)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Descriptions */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-medium">Beschrijvingen (max 90 tekens)</h3>
          </div>
          <div className="space-y-2">
            {descriptions.map((description, index) => (
              <div 
                key={index}
                className="flex items-start justify-between p-3 bg-muted rounded-lg group"
              >
                <div className="flex-1">
                  <span>{description}</span>
                  <span className={`ml-2 text-xs ${description.length > 90 ? "text-destructive" : "text-muted-foreground"}`}>
                    ({description.length}/90)
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(description)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Display Path */}
        <div className="space-y-3">
          <h3 className="font-medium">Display URL Path</h3>
          <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
            <span className="text-muted-foreground">getpawsy.com/</span>
            <span className="font-medium text-primary">{displayPaths.join("/")}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyToClipboard(displayPaths.join("/"))}
              className="ml-auto"
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Keywords */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-medium">Voorgestelde Keywords</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {keywords.map((keyword, index) => (
              <Badge 
                key={index} 
                variant="secondary"
                className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                onClick={() => copyToClipboard(keyword)}
              >
                {keyword}
              </Badge>
            ))}
          </div>
        </div>

        {/* Preview */}
        <div className="space-y-3">
          <h3 className="font-medium">Advertentie Preview</h3>
          <div className="p-4 border rounded-lg bg-background">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Advertentie</div>
              <div className="text-sm text-green-700">
                getpawsy.com/{displayPaths.join("/")}
              </div>
              <h4 className="text-lg text-blue-700 hover:underline cursor-pointer">
                {headlines[0]} | {headlines[1]}
              </h4>
              <p className="text-sm text-muted-foreground">
                {descriptions[0]}
              </p>
            </div>
          </div>
        </div>

        {/* Save Button for generated ads */}
        {showSaveButton && generatedAd && (
          <Button 
            onClick={() => saveAdMutation.mutate(generatedAd)}
            disabled={saveAdMutation.isPending}
            className="w-full"
          >
            {saveAdMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Opslaan...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Opslaan voor later
              </>
            )}
          </Button>
        )}
      </div>
    );
  };

  return (
    <Tabs defaultValue="generator" className="space-y-6">
      <TabsList>
        <TabsTrigger value="generator" className="flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          Generator
        </TabsTrigger>
        <TabsTrigger value="saved" className="flex items-center gap-2">
          <History className="w-4 h-4" />
          Opgeslagen ({savedAds?.length || 0})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="generator" className="space-y-6">
        {/* Generator Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Google Ads Generator
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Product Selection */}
            {products && products.length > 0 && (
              <div className="space-y-2">
                <Label>Selecteer een product (optioneel)</Label>
                <Select value={selectedProductId} onValueChange={handleProductSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Kies een bestaand product..." />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="productName">Productnaam *</Label>
                <Input
                  id="productName"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="Bijv. Premium kattenmand"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="targetAudience">Doelgroep</Label>
                <Input
                  id="targetAudience"
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  placeholder="Bijv. Kattenliefhebbers 25-45 jaar"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="productDescription">Productbeschrijving</Label>
              <Textarea
                id="productDescription"
                value={productDescription}
                onChange={(e) => setProductDescription(e.target.value)}
                placeholder="Beschrijf het product en de belangrijkste kenmerken..."
                rows={3}
              />
            </div>

            <Button 
              onClick={generateAds} 
              disabled={isGenerating || !productName.trim()}
              className="w-full md:w-auto"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Genereren...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Genereer Google Ads
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Generated Ads */}
        {generatedAd && (
          <Card className="animate-fade-in">
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="flex items-center gap-2">
                  <Target className="w-5 h-5" />
                  Gegenereerde Advertenties
                </CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => copyAllAds(generatedAd)}>
                    <Copy className="w-4 h-4 mr-2" />
                    Kopieer alles
                  </Button>
                  <Button variant="outline" size="sm" onClick={generateAds} disabled={isGenerating}>
                    <RefreshCw className={`w-4 h-4 mr-2 ${isGenerating ? "animate-spin" : ""}`} />
                    Opnieuw
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {renderAdContent(generatedAd, true)}
            </CardContent>
          </Card>
        )}
      </TabsContent>

      <TabsContent value="saved" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              Opgeslagen Advertenties
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingSavedAds ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : savedAds && savedAds.length > 0 ? (
              <div className="space-y-3">
                {savedAds.map((ad) => (
                  <div
                    key={ad.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium truncate">{ad.product_name}</h4>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(ad.created_at), "d MMMM yyyy 'om' HH:mm", { locale: nl })}
                        {ad.target_audience && ` • ${ad.target_audience}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedSavedAd(ad)}
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        Bekijken
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyAllAds(ad)}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Advertentie verwijderen?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Weet je zeker dat je deze opgeslagen advertentie wilt verwijderen? Dit kan niet ongedaan worden gemaakt.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annuleren</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteAdMutation.mutate(ad.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Verwijderen
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Nog geen opgeslagen advertenties</p>
                <p className="text-sm">Genereer en sla advertenties op om ze hier terug te vinden</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Selected Saved Ad Detail */}
        {selectedSavedAd && (
          <Card className="animate-fade-in">
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="w-5 h-5" />
                    {selectedSavedAd.product_name}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Opgeslagen op {format(new Date(selectedSavedAd.created_at), "d MMMM yyyy 'om' HH:mm", { locale: nl })}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => copyAllAds(selectedSavedAd)}>
                    <Copy className="w-4 h-4 mr-2" />
                    Kopieer alles
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setSelectedSavedAd(null)}>
                    Sluiten
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {renderAdContent(selectedSavedAd)}
            </CardContent>
          </Card>
        )}
      </TabsContent>
    </Tabs>
  );
}
