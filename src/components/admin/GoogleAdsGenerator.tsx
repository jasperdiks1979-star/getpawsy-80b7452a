import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { toast } from "sonner";
import { 
  Sparkles, 
  Copy, 
  RefreshCw, 
  Loader2, 
  Target,
  Type,
  FileText,
  Tag
} from "lucide-react";

interface GeneratedAd {
  headlines: string[];
  descriptions: string[];
  displayPaths: string[];
  keywords: string[];
}

export function GoogleAdsGenerator() {
  const [productName, setProductName] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedAd, setGeneratedAd] = useState<GeneratedAd | null>(null);

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

  const copyAllAds = () => {
    if (!generatedAd) return;
    
    const allText = `
GOOGLE ADS - ${productName}

HEADLINES:
${generatedAd.headlines.map((h, i) => `${i + 1}. ${h}`).join("\n")}

DESCRIPTIONS:
${generatedAd.descriptions.map((d, i) => `${i + 1}. ${d}`).join("\n")}

DISPLAY PATHS:
/${generatedAd.displayPaths.join("/")}

KEYWORDS:
${generatedAd.keywords.join(", ")}
    `.trim();
    
    navigator.clipboard.writeText(allText);
    toast.success("Alle advertentieteksten gekopieerd");
  };

  return (
    <div className="space-y-6">
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
                <Button variant="outline" size="sm" onClick={copyAllAds}>
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
          <CardContent className="space-y-6">
            {/* Headlines */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Type className="w-4 h-4 text-muted-foreground" />
                <h3 className="font-medium">Headlines (max 30 tekens)</h3>
              </div>
              <div className="space-y-2">
                {generatedAd.headlines.map((headline, index) => (
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
                {generatedAd.descriptions.map((description, index) => (
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
                <span className="font-medium text-primary">{generatedAd.displayPaths.join("/")}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(generatedAd.displayPaths.join("/"))}
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
                {generatedAd.keywords.map((keyword, index) => (
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
                    getpawsy.com/{generatedAd.displayPaths.join("/")}
                  </div>
                  <h4 className="text-lg text-blue-700 hover:underline cursor-pointer">
                    {generatedAd.headlines[0]} | {generatedAd.headlines[1]}
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {generatedAd.descriptions[0]}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
