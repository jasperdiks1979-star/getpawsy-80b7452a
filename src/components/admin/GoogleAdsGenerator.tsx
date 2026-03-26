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
  Package,
  ExternalLink,
  Image as ImageIcon
} from "lucide-react";
import { 
  exportAllGoogleAds, 
  exportAllAsZip,
  exportImageAssetsZip,
  exportCompleteCampaignPackage,
  campaignData,
  generateResponsiveAdsCSV,
  generateKeywordsCSV,
  generateCampaignStructureCSV,
  generateAdGroupsCSV,
  generateSitelinksCSV,
  generateImageAssetsInstructions,
  downloadCSV
} from "@/utils/googleAdsExport";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { Users } from "lucide-react";

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
  const [isDownloadingPackage, setIsDownloadingPackage] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<string>("");
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

              {/* COMPLETE PACKAGE - Primary CTA */}
              <div className="p-4 bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 rounded-xl border-2 border-primary/30">
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="flex-1 text-center sm:text-left">
                    <h4 className="font-semibold text-lg flex items-center gap-2 justify-center sm:justify-start">
                      <Sparkles className="w-5 h-5 text-primary" />
                      Complete Campaign Package
                    </h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Alle CSV's + alle afbeeldingen in één ZIP • Direct importeerbaar in Google Ads Editor
                    </p>
                  </div>
                  <Button 
                    size="lg"
                    className="w-full sm:w-auto min-w-[220px]"
                    onClick={async () => {
                      setIsDownloadingPackage(true);
                      setDownloadProgress('Voorbereiden...');
                      try {
                        await exportCompleteCampaignPackage((stage, percent) => {
                          setDownloadProgress(`${stage} (${percent}%)`);
                        });
                        toast.success('Complete Campaign Package gedownload!');
                      } catch (error) {
                        console.error('Download failed:', error);
                        toast.error('Download mislukt. Probeer opnieuw.');
                      } finally {
                        setIsDownloadingPackage(false);
                        setDownloadProgress('');
                      }
                    }}
                    disabled={isDownloadingPackage}
                  >
                    {isDownloadingPackage ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {downloadProgress || 'Downloaden...'}
                      </>
                    ) : (
                      <>
                        <Package className="w-4 h-4 mr-2" />
                        Download Complete Package
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Alternative downloads */}
              <div className="flex flex-col sm:flex-row gap-3">
                <Button 
                  variant="outline"
                  onClick={() => exportAllAsZip()}
                  className="flex-1"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Alleen CSV's (ZIP)
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => exportImageAssetsZip()}
                  className="flex-1"
                >
                  <ImageIcon className="w-4 h-4 mr-2" />
                  Alleen Images (ZIP)
                </Button>
                <Button 
                  variant="ghost"
                  onClick={() => exportAllGoogleAds()}
                  className="flex-1"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Losse CSV's
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <Card className="border-dashed border-amber-300 bg-amber-50/50 dark:bg-amber-950/20">
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-amber-600" />
                    <span className="font-medium text-sm">1. Campaigns</span>
                    <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">Eerst!</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Campagne instellingen: budget, biedstrategie, targeting
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full border-amber-300 hover:bg-amber-100"
                    onClick={() => downloadCSV(generateCampaignStructureCSV(), "01_campaigns.csv")}
                  >
                    <Download className="w-3 h-3 mr-2" />
                    Download
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-dashed border-amber-300 bg-amber-50/50 dark:bg-amber-950/20">
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-amber-600" />
                    <span className="font-medium text-sm">2. Ad Groups</span>
                    <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">2e!</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Advertentiegroepen per campagne met CPC biedingen
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full border-amber-300 hover:bg-amber-100"
                    onClick={() => downloadCSV(generateAdGroupsCSV(), "02_adgroups.csv")}
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
                    <span className="font-medium text-sm">3. Ads</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    20 Responsive Search Ads met headlines & descriptions
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                    onClick={() => downloadCSV(generateResponsiveAdsCSV(), "03_ads.csv")}
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
                    <span className="font-medium text-sm">4. Keywords</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Keywords in broad, phrase & exact match
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                    onClick={() => downloadCSV(generateKeywordsCSV(), "04_keywords.csv")}
                  >
                    <Download className="w-3 h-3 mr-2" />
                    Download
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-dashed">
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <ExternalLink className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium text-sm">5. Sitelinks</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    4 sitelinks per campagne voor extra CTR
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                    onClick={() => downloadCSV(generateSitelinksCSV(), "05_sitelinks.csv")}
                  >
                    <Download className="w-3 h-3 mr-2" />
                    Download
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-dashed border-primary/30 bg-primary/5">
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-primary" />
                    <span className="font-medium text-sm">6. Images</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Logo & marketing afbeeldingen (handmatig toevoegen)
                  </p>
                  <Button 
                    size="sm" 
                    className="w-full"
                    onClick={() => exportImageAssetsZip()}
                  >
                    <Package className="w-3 h-3 mr-2" />
                    Download ZIP
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Critical import order warning */}
            <div className="p-4 border-2 border-amber-300 rounded-lg bg-amber-50 dark:bg-amber-950/30 space-y-2">
              <h4 className="font-semibold text-amber-800 dark:text-amber-200 flex items-center gap-2">
                ⚠️ IMPORTANT: Import Order
              </h4>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                <strong>Campaigns and Ad Groups must exist FIRST</strong> before you can add ads, keywords, or sitelinks. 
                Always import in this order:
              </p>
              <ol className="list-decimal list-inside text-sm text-amber-700 dark:text-amber-300 space-y-1">
                <li><strong>01_campaigns.csv</strong> → Create campaign structure</li>
                <li><strong>02_adgroups.csv</strong> → Create Ad Groups within campaigns</li>
                <li><strong>03_ads.csv</strong> → Add ads to ad groups</li>
                <li><strong>04_keywords.csv</strong> → Add keywords to ad groups</li>
                <li><strong>05_sitelinks.csv</strong> → Add sitelinks to campaigns</li>
              </ol>
            </div>

            {/* Complete Step-by-Step Guide */}
            <div className="space-y-4">
              <div className="p-5 border-2 border-primary/20 rounded-xl bg-gradient-to-br from-primary/5 to-primary/10 space-y-4">
                <h4 className="font-semibold text-lg flex items-center gap-2">
                  🚀 Complete Step-by-Step Guide: Getting Google Ads Live
                </h4>
                
                {/* Step 1 */}
                <div className="space-y-2 p-4 bg-background rounded-lg border">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">1</div>
                    <h5 className="font-medium">Create Google Ads Account</h5>
                  </div>
                  <div className="ml-9 space-y-2 text-sm text-muted-foreground">
                    <p>If you don't have an account yet:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Go to <a href="https://ads.google.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">ads.google.com</a></li>
                      <li>Click "Start now" and sign in with your Google account</li>
                      <li>Choose "Create new campaign" → "Switch to Expert mode"</li>
                      <li>Set up your payment details (credit card or PayPal)</li>
                    </ul>
                    <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-950/30 rounded text-amber-800 dark:text-amber-200 text-xs">
                      💡 <strong>Tip:</strong> Start with a small daily budget (e.g. $10-20) to test
                    </div>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="space-y-2 p-4 bg-background rounded-lg border">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">2</div>
                    <h5 className="font-medium">Download Google Ads Editor</h5>
                  </div>
                  <div className="ml-9 space-y-2 text-sm text-muted-foreground">
                    <p>For bulk uploads you need the desktop editor:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Download from <a href="https://ads.google.com/home/tools/ads-editor/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">Google Ads Editor</a> (free)</li>
                      <li>Install and open the application</li>
                      <li>Sign in with the same Google account as your Ads account</li>
                      <li>Click "Download" to sync your current account</li>
                    </ul>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="space-y-2 p-4 bg-background rounded-lg border">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">3</div>
                    <h5 className="font-medium">Download CSV Files</h5>
                  </div>
                  <div className="ml-9 space-y-2 text-sm text-muted-foreground">
                    <p>Download the CSV files above or use the Complete Package:</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li><strong>01_campaigns.csv</strong> - Campaign settings</li>
                      <li><strong>02_adgroups.csv</strong> - Ad Groups</li>
                      <li><strong>03_ads.csv</strong> - Responsive Search Ads</li>
                      <li><strong>04_keywords.csv</strong> - Keywords</li>
                      <li><strong>05_sitelinks.csv</strong> - Sitelink extensions</li>
                    </ol>
                  </div>
                </div>

                {/* Step 4 */}
                <div className="space-y-2 p-4 bg-background rounded-lg border border-amber-200 dark:border-amber-800">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-amber-500 text-white flex items-center justify-center font-bold text-sm">4</div>
                    <h5 className="font-medium text-amber-700 dark:text-amber-400">Importeren in Google Ads Editor (VOLGORDE CRUCIAAL!)</h5>
                  </div>
                  <div className="ml-9 space-y-2 text-sm text-muted-foreground">
                    <p><strong>Importeer in EXACT deze volgorde:</strong></p>
                    <ol className="list-decimal list-inside space-y-2">
                      <li>
                        <strong>Campagnes eerst:</strong> Account → Import → From file... → 01_campaigns.csv
                      </li>
                      <li>
                        <strong>Ad Groups tweede:</strong> Account → Import → From file... → 02_adgroups.csv
                      </li>
                      <li>
                        <strong>Daarna advertenties:</strong> Account → Import → From file... → 03_ads.csv
                      </li>
                      <li>
                        <strong>Keywords:</strong> Account → Import → From file... → 04_keywords.csv
                      </li>
                      <li>
                        <strong>Sitelinks:</strong> Account → Import → From file... → 05_sitelinks.csv
                      </li>
                    </ol>
                    <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-950/30 rounded text-amber-800 dark:text-amber-200 text-xs">
                      ⚠️ <strong>Belangrijk:</strong> Campagnes en Ad Groups moeten EERST bestaan voordat ads/keywords kunnen worden toegevoegd!
                    </div>
                  </div>
                </div>

                {/* Step 5 */}
                <div className="space-y-2 p-4 bg-background rounded-lg border">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">5</div>
                    <h5 className="font-medium">Controleren & Aanpassen</h5>
                  </div>
                  <div className="ml-9 space-y-2 text-sm text-muted-foreground">
                    <p>Voordat je publiceert, controleer deze instellingen:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li><strong>Budget:</strong> Pas het dagelijks budget aan (standaard $20/dag per campagne)</li>
                      <li><strong>Locatie:</strong> Standaard op "United States" - pas aan indien nodig</li>
                      <li><strong>Taal:</strong> Standaard op "English" - pas aan indien nodig</li>
                      <li><strong>Biedstrategie:</strong> "Maximize Conversions" - werkt goed voor beginners</li>
                    </ul>
                    <div className="mt-2 p-2 bg-green-50 dark:bg-green-950/30 rounded text-green-800 dark:text-green-200 text-xs">
                      ✅ <strong>Aanbevolen:</strong> Start met 1 campagne (bijv. GPS Dog Fence) om te testen
                    </div>
                  </div>
                </div>

                {/* Step 6 */}
                <div className="space-y-2 p-4 bg-background rounded-lg border">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">6</div>
                    <h5 className="font-medium">Live Zetten (Posten)</h5>
                  </div>
                  <div className="ml-9 space-y-2 text-sm text-muted-foreground">
                    <p>Als alles er goed uitziet:</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Klik op <strong>"Post"</strong> in de toolbar (of Ctrl+P / Cmd+P)</li>
                      <li>Selecteer alle wijzigingen die je wilt publiceren</li>
                      <li>Klik op <strong>"Post"</strong> om te uploaden naar Google Ads</li>
                      <li>Wacht tot de upload voltooid is (kan 1-2 minuten duren)</li>
                    </ol>
                    <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-950/30 rounded text-amber-800 dark:text-amber-200 text-xs">
                      ⏰ <strong>Review tijd:</strong> Google keurt advertenties meestal binnen 24 uur goed, soms binnen een paar uur
                    </div>
                  </div>
                </div>

                {/* Step 7 */}
                <div className="space-y-2 p-4 bg-background rounded-lg border border-green-200 dark:border-green-800">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-green-600 text-white flex items-center justify-center font-bold text-sm">7</div>
                    <h5 className="font-medium text-green-700 dark:text-green-400">Conversie Tracking Instellen (Belangrijk!)</h5>
                  </div>
                  <div className="ml-9 space-y-2 text-sm text-muted-foreground">
                    <p>Zonder conversie tracking weet Google niet welke ads werken:</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Ga naar <a href="https://ads.google.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Google Ads</a> (online)</li>
                      <li>Tools & Settings → Measurement → Conversions</li>
                      <li>Klik op "+ New conversion action" → Website</li>
                      <li>Voer je website URL in: <code className="px-1 py-0.5 bg-muted rounded">https://getpawsy.pet</code></li>
                      <li>Kies "Purchase" als conversie type</li>
                      <li>Installeer de Google Tag (we hebben dit al via Google Analytics 4)</li>
                    </ol>
                  </div>
                </div>
              </div>

              {/* Quick Troubleshooting */}
              <div className="p-4 border rounded-lg bg-muted/30 space-y-2">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  🔧 Veelvoorkomende Problemen
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-muted-foreground">
                  <div className="p-2 bg-background rounded border">
                    <strong className="text-foreground">Import error:</strong> Controleer of je de CSV's in de juiste volgorde importeert (campagnes → ads → keywords)
                  </div>
                  <div className="p-2 bg-background rounded border">
                    <strong className="text-foreground">Ad afgekeurd:</strong> Pas headlines aan die claims bevatten en voeg een privacybeleid toe
                  </div>
                  <div className="p-2 bg-background rounded border">
                    <strong className="text-foreground">Geen vertoningen:</strong> Verhoog je dagelijks budget of pas de biedingen aan
                  </div>
                  <div className="p-2 bg-background rounded border">
                    <strong className="text-foreground">Low Quality Score:</strong> Verbeter je landingspagina's met relevante content en snelle laadtijd
                  </div>
                </div>
              </div>
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
