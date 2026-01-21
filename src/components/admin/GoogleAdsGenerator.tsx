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
  Eye,
  Download,
  Package
} from "lucide-react";
import { 
  exportAllGoogleAds, 
  campaignData,
  generateResponsiveAdsCSV,
  generateKeywordsCSV,
  generateCampaignStructureCSV,
  downloadCSV
} from "@/utils/googleAdsExport";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

interface GeneratedAd {
  headlines: string[];
  descriptions: string[];
  displayPaths: string[];
  keywords: string[];
  angle?: string;
}

interface GeneratedAdsResponse {
  variants: GeneratedAd[];
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
  const [generatedAds, setGeneratedAds] = useState<GeneratedAd[]>([]);
  const [selectedSavedAd, setSelectedSavedAd] = useState<SavedAd | null>(null);
  const [finalUrl, setFinalUrl] = useState("https://getpawsy.pet");
  const [variantCount, setVariantCount] = useState<number>(1);
  const [utmSource, setUtmSource] = useState("google");
  const [utmMedium, setUtmMedium] = useState("cpc");
  const [utmCampaign, setUtmCampaign] = useState("");
  const [utmContent, setUtmContent] = useState("");

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
      toast.success("Ad saved!");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Save failed");
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
      toast.success("Ad deleted");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Delete failed");
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
      toast.error("Please enter a product name");
      return;
    }

    setIsGenerating(true);
    setGeneratedAds([]);

    try {
      const { data, error } = await supabase.functions.invoke("generate-google-ads", {
        body: {
          productName,
          productDescription,
          targetAudience,
          language: "nl",
          variantCount,
        },
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      // Handle both new format (variants array) and old format (single ad)
      const variants = data.variants || [data];
      setGeneratedAds(variants);
      toast.success(`${variants.length} advertentievariant(en) gegenereerd!`);
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

  const buildFinalUrlWithUtm = () => {
    const params = new URLSearchParams();
    if (utmSource) params.append('utm_source', utmSource);
    if (utmMedium) params.append('utm_medium', utmMedium);
    if (utmCampaign) params.append('utm_campaign', utmCampaign);
    if (utmContent) params.append('utm_content', utmContent);
    
    const queryString = params.toString();
    return queryString ? `${finalUrl}?${queryString}` : finalUrl;
  };

  const exportToCSV = (ad: GeneratedAd | SavedAd) => {
    const isGeneratedAd = 'displayPaths' in ad;
    const headlines = ad.headlines;
    const descriptions = ad.descriptions;
    const displayPaths = isGeneratedAd ? ad.displayPaths : (ad as SavedAd).display_paths;
    const keywords = ad.keywords;
    const name = 'product_name' in ad ? (ad as SavedAd).product_name : productName;

    // Google Ads Editor CSV format for Responsive Search Ads
    const csvHeaders = [
      'Campaign',
      'Ad Group',
      'Headline 1',
      'Headline 2',
      'Headline 3',
      'Headline 4',
      'Headline 5',
      'Headline 6',
      'Headline 7',
      'Headline 8',
      'Headline 9',
      'Headline 10',
      'Headline 11',
      'Headline 12',
      'Headline 13',
      'Headline 14',
      'Headline 15',
      'Description 1',
      'Description 2',
      'Description 3',
      'Description 4',
      'Path 1',
      'Path 2',
      'Final URL',
      'Status'
    ];

    // Fill headlines (up to 15)
    const headlineValues = Array(15).fill('').map((_, i) => headlines[i] || '');
    
    // Fill descriptions (up to 4)
    const descriptionValues = Array(4).fill('').map((_, i) => descriptions[i] || '');

    const csvRow = [
      '[CAMPAIGN_NAME]', // User fills this in Google Ads Editor
      '[AD_GROUP_NAME]', // User fills this in Google Ads Editor
      ...headlineValues,
      ...descriptionValues,
      displayPaths[0] || '',
      displayPaths[1] || '',
      buildFinalUrlWithUtm(), // Final URL with UTM parameters
      'Enabled'
    ];

    // Escape CSV values
    const escapeCSV = (value: string) => {
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    const csvContent = [
      csvHeaders.join(','),
      csvRow.map(escapeCSV).join(',')
    ].join('\n');

    // Also create a keywords CSV
    const keywordsCSV = [
      'Campaign,Ad Group,Keyword,Match Type',
      ...keywords.map(kw => `[CAMPAIGN_NAME],[AD_GROUP_NAME],${escapeCSV(kw)},Broad`)
    ].join('\n');

    // Create and download the ads CSV
    const adsBlob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const adsUrl = URL.createObjectURL(adsBlob);
    const adsLink = document.createElement('a');
    adsLink.href = adsUrl;
    adsLink.download = `google-ads-${name.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(adsLink);
    adsLink.click();
    document.body.removeChild(adsLink);
    URL.revokeObjectURL(adsUrl);

    // Create and download the keywords CSV
    setTimeout(() => {
      const keywordsBlob = new Blob([keywordsCSV], { type: 'text/csv;charset=utf-8;' });
      const keywordsUrl = URL.createObjectURL(keywordsBlob);
      const keywordsLink = document.createElement('a');
      keywordsLink.href = keywordsUrl;
      keywordsLink.download = `google-ads-keywords-${name.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(keywordsLink);
      keywordsLink.click();
      document.body.removeChild(keywordsLink);
      URL.revokeObjectURL(keywordsUrl);
    }, 100);

    toast.success("CSV bestanden gedownload! Open ze in Google Ads Editor en vul de campaign/ad group namen in.");
  };

  const renderAdContent = (ad: GeneratedAd | SavedAd, showSaveButton: boolean = false, onSave?: () => void) => {
    const isGeneratedAd = 'displayPaths' in ad;
    const headlines = ad.headlines;
    const descriptions = ad.descriptions;
    const displayPaths = isGeneratedAd ? ad.displayPaths : (ad as SavedAd).display_paths;
    const keywords = ad.keywords;
    const angle = 'angle' in ad ? ad.angle : undefined;

    return (
      <div className="space-y-6">
        {/* Angle indicator */}
        {angle && (
          <div className="flex items-center gap-2 p-2 bg-primary/10 rounded-lg">
            <Target className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-primary">{angle}</span>
          </div>
        )}
        
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
            <span className="text-muted-foreground">getpawsy.pet/</span>
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

        {/* Google Search Preview */}
        <div className="space-y-3">
          <h3 className="font-medium">Google Zoekresultaten Preview</h3>
          
          {/* Desktop Preview */}
          <div className="space-y-2">
            <span className="text-xs text-muted-foreground font-medium">Desktop</span>
            <div className="p-4 border rounded-lg bg-white dark:bg-zinc-950 max-w-[600px]">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center">
                    <span className="text-xs font-bold text-muted-foreground">G</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm text-foreground">GetPawsy</span>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span>getpawsy.pet</span>
                      <span>›</span>
                      <span>{displayPaths.join(" › ")}</span>
                    </div>
                  </div>
                </div>
                <div className="pt-1">
                  <h4 className="text-xl text-[#1a0dab] dark:text-[#8ab4f8] hover:underline cursor-pointer leading-tight">
                    {headlines[0]} | {headlines[1]} {headlines[2] ? `| ${headlines[2]}` : ''}
                  </h4>
                  <p className="text-sm text-[#4d5156] dark:text-[#bdc1c6] mt-1 leading-relaxed">
                    {descriptions[0]} {descriptions[1] || ''}
                  </p>
                </div>
                <div className="flex items-center gap-1 pt-1">
                  <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-[#dadce0] text-[#70757a] rounded-sm font-normal">
                    Advertentie
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile Preview */}
          <div className="space-y-2">
            <span className="text-xs text-muted-foreground font-medium">Mobiel</span>
            <div className="p-3 border rounded-lg bg-white dark:bg-zinc-950 max-w-[360px]">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center">
                    <span className="text-[10px] font-bold text-muted-foreground">G</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-foreground">GetPawsy</span>
                    <span className="text-[10px] text-muted-foreground truncate max-w-[280px]">
                      getpawsy.pet › {displayPaths.join(" › ")}
                    </span>
                  </div>
                </div>
                <div className="pt-1">
                  <h4 className="text-base text-[#1a0dab] dark:text-[#8ab4f8] hover:underline cursor-pointer leading-tight">
                    {headlines[0]} | {headlines[1]}
                  </h4>
                  <p className="text-xs text-[#4d5156] dark:text-[#bdc1c6] mt-1 leading-relaxed line-clamp-2">
                    {descriptions[0]}
                  </p>
                </div>
                <div className="flex items-center gap-1 pt-1">
                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 border-[#dadce0] text-[#70757a] rounded-sm font-normal">
                    Advertentie
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Save Button for generated ads - passed as prop */}
        {showSaveButton && onSave && (
          <Button 
            onClick={onSave}
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
        <TabsTrigger value="bulk-export" className="flex items-center gap-2">
          <Package className="w-4 h-4" />
          Bulk Export
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

            <div className="space-y-2">
              <Label htmlFor="finalUrl">Final URL (voor CSV export)</Label>
              <div className="flex gap-2">
                <Select
                  value=""
                  onValueChange={(value) => setFinalUrl(value)}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Kies productpagina..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="https://getpawsy.pet">
                      Homepage
                    </SelectItem>
                    <SelectItem value="https://getpawsy.pet/products">
                      All products
                    </SelectItem>
                    {products?.map((product) => (
                      <SelectItem 
                        key={product.id} 
                        value={`https://getpawsy.pet/products/${product.id}`}
                      >
                        {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  id="finalUrl"
                  type="url"
                  value={finalUrl}
                  onChange={(e) => setFinalUrl(e.target.value)}
                  placeholder="https://getpawsy.pet/product-page"
                  className="flex-1"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Selecteer een productpagina of typ een aangepaste URL
              </p>
            </div>

            {/* UTM Parameters */}
            <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">UTM Parameters (voor tracking)</Label>
                <Badge variant="outline" className="text-xs">Google Analytics</Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="utmSource" className="text-xs text-muted-foreground">utm_source</Label>
                  <Input
                    id="utmSource"
                    value={utmSource}
                    onChange={(e) => setUtmSource(e.target.value)}
                    placeholder="google"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="utmMedium" className="text-xs text-muted-foreground">utm_medium</Label>
                  <Input
                    id="utmMedium"
                    value={utmMedium}
                    onChange={(e) => setUtmMedium(e.target.value)}
                    placeholder="cpc"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="utmCampaign" className="text-xs text-muted-foreground">utm_campaign</Label>
                  <Input
                    id="utmCampaign"
                    value={utmCampaign}
                    onChange={(e) => setUtmCampaign(e.target.value)}
                    placeholder="Bijv. summer_sale_2024"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="utmContent" className="text-xs text-muted-foreground">utm_content (optioneel)</Label>
                  <Input
                    id="utmContent"
                    value={utmContent}
                    onChange={(e) => setUtmContent(e.target.value)}
                    placeholder="Bijv. ad_variant_a"
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Preview: {finalUrl}{(utmSource || utmMedium || utmCampaign) ? '?' : ''}{[
                  utmSource && `utm_source=${utmSource}`,
                  utmMedium && `utm_medium=${utmMedium}`,
                  utmCampaign && `utm_campaign=${utmCampaign}`,
                  utmContent && `utm_content=${utmContent}`
                ].filter(Boolean).join('&')}
              </p>
            </div>

            {/* Variant Count Selector */}
            <div className="flex items-center gap-4">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Aantal varianten</Label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3].map((count) => (
                    <Button
                      key={count}
                      type="button"
                      variant={variantCount === count ? "default" : "outline"}
                      size="sm"
                      onClick={() => setVariantCount(count)}
                      className="w-10"
                    >
                      {count}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Genereer meerdere varianten met verschillende invalshoeken
                </p>
              </div>
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
        {generatedAds.length > 0 && (
          <div className="space-y-4">
            {generatedAds.map((ad, index) => (
              <Card key={index} className="animate-fade-in">
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="flex items-center gap-2">
                      <Target className="w-5 h-5" />
                      Variant {index + 1} {generatedAds.length > 1 && `van ${generatedAds.length}`}
                    </CardTitle>
                    <div className="flex gap-2 flex-wrap">
                      <Button variant="outline" size="sm" onClick={() => exportToCSV(ad)}>
                        <Download className="w-4 h-4 mr-2" />
                        Export CSV
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => copyAllAds(ad)}>
                        <Copy className="w-4 h-4 mr-2" />
                        Kopieer
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => saveAdMutation.mutate(ad)}
                        disabled={saveAdMutation.isPending}
                      >
                        <Save className="w-4 h-4 mr-2" />
                        Opslaan
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {renderAdContent(ad, false)}
                </CardContent>
              </Card>
            ))}
            
            <div className="flex justify-center">
              <Button variant="outline" onClick={generateAds} disabled={isGenerating}>
                <RefreshCw className={`w-4 h-4 mr-2 ${isGenerating ? "animate-spin" : ""}`} />
                Opnieuw genereren
              </Button>
            </div>
          </div>
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
                    <div className="flex items-center gap-2 ml-4 flex-wrap">
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
                        onClick={() => exportToCSV(ad)}
                        title="Exporteer naar Google Ads Editor"
                      >
                        <Download className="w-4 h-4" />
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

      {/* Bulk Export Tab */}
      <TabsContent value="bulk-export" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" />
              Bulk Export - Alle Campagnes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="p-4 bg-muted rounded-lg space-y-4">
              <h3 className="font-medium flex items-center gap-2">
                <Download className="w-4 h-4" />
                Pre-built Campagne Pakket
              </h3>
              <p className="text-sm text-muted-foreground">
                Dit pakket bevat 15 professionele advertentievarianten voor 3 topproducten, 
                geoptimaliseerd voor de Amerikaanse markt:
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-3 border rounded-lg bg-background">
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="w-4 h-4 text-primary" />
                    <span className="font-medium text-sm">GPS Dog Fence</span>
                  </div>
                  <p className="text-xs text-muted-foreground">$109.99 • 5 varianten</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    <Badge variant="outline" className="text-xs">Tech-Forward</Badge>
                    <Badge variant="outline" className="text-xs">Safety</Badge>
                  </div>
                </div>
                
                <div className="p-3 border rounded-lg bg-background">
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="w-4 h-4 text-primary" />
                    <span className="font-medium text-sm">Pet Carrier Backpack</span>
                  </div>
                  <p className="text-xs text-muted-foreground">$87.99 • 5 varianten</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    <Badge variant="outline" className="text-xs">Travel</Badge>
                    <Badge variant="outline" className="text-xs">Adventure</Badge>
                  </div>
                </div>
                
                <div className="p-3 border rounded-lg bg-background">
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="w-4 h-4 text-primary" />
                    <span className="font-medium text-sm">Slow Feeder Bowl</span>
                  </div>
                  <p className="text-xs text-muted-foreground">$45.99 • 5 varianten</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    <Badge variant="outline" className="text-xs">Budget</Badge>
                    <Badge variant="outline" className="text-xs">Health</Badge>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                <Button 
                  onClick={() => exportAllGoogleAds()}
                  className="flex-1"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Alle CSV's (3 bestanden)
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-dashed">
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium text-sm">Campaign Structure</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Campagne instellingen: budget, biedstrategie, locatie targeting
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                    onClick={() => downloadCSV(generateCampaignStructureCSV(), "getpawsy_campaigns_structure.csv")}
                  >
                    <Download className="w-3 h-3 mr-2" />
                    Download
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-dashed">
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Type className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium text-sm">Responsive Ads</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    15 advertenties met headlines, descriptions en display paths
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                    onClick={() => downloadCSV(generateResponsiveAdsCSV(), "getpawsy_responsive_ads.csv")}
                  >
                    <Download className="w-3 h-3 mr-2" />
                    Download
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-dashed">
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium text-sm">Keywords</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    75 keywords in phrase & exact match voor alle campagnes
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                    onClick={() => downloadCSV(generateKeywordsCSV(), "getpawsy_keywords.csv")}
                  >
                    <Download className="w-3 h-3 mr-2" />
                    Download
                  </Button>
                </CardContent>
              </Card>
            </div>

            <div className="p-4 border rounded-lg bg-blue-50 dark:bg-blue-950/30 space-y-2">
              <h4 className="font-medium text-sm flex items-center gap-2">
                💡 Hoe te gebruiken in Google Ads Editor
              </h4>
              <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Download Google Ads Editor van <a href="https://ads.google.com/home/tools/ads-editor/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">ads.google.com</a></li>
                <li>Open Google Ads Editor en log in met je account</li>
                <li>Ga naar Account → Import → Import from file</li>
                <li>Selecteer eerst de "campaigns_structure.csv" om de campagnes aan te maken</li>
                <li>Importeer daarna "responsive_ads.csv" voor de advertenties</li>
                <li>Importeer als laatste "keywords.csv" voor de zoekwoorden</li>
                <li>Review alle items en klik op "Post" om te publiceren</li>
              </ol>
            </div>

            {/* Campaign Preview Table */}
            <div className="space-y-3">
              <h3 className="font-medium">Campagne Overzicht ({campaignData.length} advertenties)</h3>
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left p-2 font-medium">Campaign</th>
                        <th className="text-left p-2 font-medium">Ad Group</th>
                        <th className="text-left p-2 font-medium">Headlines</th>
                        <th className="text-left p-2 font-medium">Keywords</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaignData.map((ad, index) => (
                        <tr key={index} className="border-t hover:bg-muted/50">
                          <td className="p-2 font-medium text-xs">{ad.campaign}</td>
                          <td className="p-2 text-xs">{ad.adGroup}</td>
                          <td className="p-2">
                            <div className="flex flex-wrap gap-1">
                              {ad.headlines.slice(0, 2).map((h, i) => (
                                <Badge key={i} variant="secondary" className="text-xs truncate max-w-[150px]">
                                  {h}
                                </Badge>
                              ))}
                            </div>
                          </td>
                          <td className="p-2 text-xs text-muted-foreground">
                            {ad.keywords.slice(0, 2).join(", ")}...
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
