import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Package, 
  Download, 
  ExternalLink, 
  CheckCircle2, 
  Calculator,
  Sticker,
  FileText,
  Box,
  Euro,
  TrendingUp,
  Info,
  Copy,
  Check
} from "lucide-react";
import { toast } from "sonner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// Import packaging assets
import stickerImage from "@/assets/packaging/getpawsy-sticker-5cm.png";
import thankYouCardImage from "@/assets/packaging/getpawsy-thankyou-card.png";
import polyMailerSmallImage from "@/assets/packaging/getpawsy-polymailer-small.png";
import polyMailerMediumImage from "@/assets/packaging/getpawsy-polymailer-medium.png";

// Packaging item types
interface PackagingItem {
  id: string;
  name: string;
  description: string;
  size: string;
  pricePerUnit: number;
  minOrderQty: number;
  image: string;
  cjSearchTerm: string;
  usageNotes: string;
}

const packagingItems: PackagingItem[] = [
  {
    id: "sticker-5cm",
    name: "Logo Sticker 5cm",
    description: "Ronde logo sticker voor op grote pakketten",
    size: "5cm diameter",
    pricePerUnit: 0.05,
    minOrderQty: 100,
    image: stickerImage,
    cjSearchTerm: "custom round sticker 5cm",
    usageNotes: "Gebruik op grote dozen en standaard verpakkingen"
  },
  {
    id: "thank-you-card",
    name: "Thank You Card",
    description: "Bedankkaartje met kortingscode",
    size: "8.5 x 5.5 cm",
    pricePerUnit: 0.05,
    minOrderQty: 100,
    image: thankYouCardImage,
    cjSearchTerm: "custom thank you card business",
    usageNotes: "Bij elke bestelling insluiten"
  },
  {
    id: "poly-mailer-small",
    name: "Poly Mailer Small",
    description: "Branded verzendenvelop voor kleine items",
    size: "20 x 30 cm",
    pricePerUnit: 0.08,
    minOrderQty: 50,
    image: polyMailerSmallImage,
    cjSearchTerm: "custom poly mailer 20x30",
    usageNotes: "Voor kleine items: accessoires, speeltjes, riemen"
  },
  {
    id: "poly-mailer-medium",
    name: "Poly Mailer Medium",
    description: "Branded verzendenvelop voor middelgrote items",
    size: "30 x 40 cm",
    pricePerUnit: 0.12,
    minOrderQty: 50,
    image: polyMailerMediumImage,
    cjSearchTerm: "custom poly mailer 30x40",
    usageNotes: "Voor medium items: kleding, bedjes, grotere accessoires"
  }
];

// CJ Order Steps
const cjOrderSteps = [
  {
    step: 1,
    title: "Login bij CJ Dropshipping",
    description: "Ga naar app.cjdropshipping.com en log in",
    link: "https://app.cjdropshipping.com"
  },
  {
    step: 2,
    title: "Ga naar Custom Packaging",
    description: "Navigeer naar Services → Custom Packaging in het menu",
    link: "https://app.cjdropshipping.com/customService/customPackaging"
  },
  {
    step: 3,
    title: "Selecteer het type verpakking",
    description: "Kies Poly Mailer, Sticker, of Thank You Card"
  },
  {
    step: 4,
    title: "Upload je ontwerp",
    description: "Download het ontwerp hieronder en upload naar CJ"
  },
  {
    step: 5,
    title: "Specificeer afmetingen en hoeveelheid",
    description: "Vul de exacte maten en bestelhoeveelheid in"
  },
  {
    step: 6,
    title: "Wacht op sample (optioneel)",
    description: "CJ stuurt eerst een sample ter goedkeuring"
  },
  {
    step: 7,
    title: "Bevestig productie",
    description: "Na goedkeuring start de productie (5-10 werkdagen)"
  }
];

export const PackagingManager = () => {
  const [orderQty, setOrderQty] = useState<Record<string, number>>({
    "sticker-5cm": 100,
    "thank-you-card": 100,
    "poly-mailer-small": 100,
    "poly-mailer-medium": 100
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Calculate totals
  const calculateItemCost = (item: PackagingItem) => {
    const qty = orderQty[item.id] || item.minOrderQty;
    return qty * item.pricePerUnit;
  };

  const totalInvestment = packagingItems.reduce((sum, item) => sum + calculateItemCost(item), 0);
  
  // Estimate cost per order (assuming each order uses: 1 thank you card + 1 sticker OR 1 poly mailer)
  const costPerOrderWithPolyMailer = 0.05 + 0.08; // thank you + small poly mailer
  const costPerOrderWithSticker = 0.05 + 0.05; // thank you + sticker

  const handleDownloadDesign = (item: PackagingItem) => {
    // Create download link
    const link = document.createElement('a');
    link.href = item.image;
    link.download = `getpawsy-${item.id}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`${item.name} design gedownload`);
  };

  const handleCopySearchTerm = (item: PackagingItem) => {
    navigator.clipboard.writeText(item.cjSearchTerm);
    setCopiedId(item.id);
    toast.success("Zoekterm gekopieerd naar klembord");
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Package className="w-6 h-6 text-primary" />
          Branded Packaging
        </h2>
        <p className="text-muted-foreground">
          Beheer je branded verpakkingsmaterialen en bestel bij CJ Dropshipping
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Euro className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Startinvestering</p>
                <p className="text-2xl font-bold">€{totalInvestment.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <TrendingUp className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Kosten/bestelling</p>
                <p className="text-2xl font-bold">€{costPerOrderWithPolyMailer.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Box className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Bestellingen dekking</p>
                <p className="text-2xl font-bold">100+</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <Calculator className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">% van omzet (€25 AOV)</p>
                <p className="text-2xl font-bold">{((costPerOrderWithPolyMailer / 25) * 100).toFixed(1)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="inventory" className="space-y-4">
        <TabsList>
          <TabsTrigger value="inventory" className="flex items-center gap-2">
            <Package className="w-4 h-4" />
            Designs & Voorraad
          </TabsTrigger>
          <TabsTrigger value="calculator" className="flex items-center gap-2">
            <Calculator className="w-4 h-4" />
            Kostenberekening
          </TabsTrigger>
          <TabsTrigger value="guide" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            CJ Bestelgids
          </TabsTrigger>
        </TabsList>

        {/* Inventory Tab */}
        <TabsContent value="inventory" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {packagingItems.map((item) => (
              <Card key={item.id} className="overflow-hidden">
                <div className="aspect-video relative bg-muted">
                  <img 
                    src={item.image} 
                    alt={item.name}
                    className="w-full h-full object-contain p-4"
                  />
                  <Badge className="absolute top-2 right-2" variant="secondary">
                    {item.size}
                  </Badge>
                </div>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center justify-between">
                    {item.name}
                    <Badge variant="outline">€{item.pricePerUnit.toFixed(2)}/stuk</Badge>
                  </CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-2 p-2 bg-muted rounded-lg text-sm">
                    <Info className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span>{item.usageNotes}</span>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1"
                      onClick={() => handleDownloadDesign(item)}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download Design
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleCopySearchTerm(item)}
                    >
                      {copiedId === item.id ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Calculator Tab */}
        <TabsContent value="calculator" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="w-5 h-5" />
                Kostenberekening
              </CardTitle>
              <CardDescription>
                Bereken je investering en kosten per bestelling
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Order quantities */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {packagingItems.map((item) => (
                  <div key={item.id} className="space-y-2">
                    <Label htmlFor={item.id}>{item.name}</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id={item.id}
                        type="number"
                        min={item.minOrderQty}
                        step={10}
                        value={orderQty[item.id]}
                        onChange={(e) => setOrderQty(prev => ({
                          ...prev,
                          [item.id]: Math.max(item.minOrderQty, parseInt(e.target.value) || item.minOrderQty)
                        }))}
                        className="w-24"
                      />
                      <span className="text-sm text-muted-foreground">stuks</span>
                      <span className="text-sm font-medium ml-auto">
                        €{calculateItemCost(item).toFixed(2)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Min. {item.minOrderQty} stuks @ €{item.pricePerUnit.toFixed(2)}/stuk
                    </p>
                  </div>
                ))}
              </div>

              {/* Summary */}
              <div className="border-t pt-4 space-y-3">
                <div className="flex justify-between text-lg font-semibold">
                  <span>Totale Investering:</span>
                  <span className="text-primary">€{totalInvestment.toFixed(2)}</span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <Card className="bg-muted/50">
                    <CardContent className="pt-4">
                      <p className="text-sm font-medium mb-2">Kleine items (poly mailer)</p>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span>Thank you card</span>
                          <span>€0.05</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Poly mailer small</span>
                          <span>€0.08</span>
                        </div>
                        <div className="flex justify-between font-semibold border-t pt-1 mt-1">
                          <span>Totaal/bestelling</span>
                          <span>€0.13</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-muted/50">
                    <CardContent className="pt-4">
                      <p className="text-sm font-medium mb-2">Grote items (sticker)</p>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span>Thank you card</span>
                          <span>€0.05</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Logo sticker</span>
                          <span>€0.05</span>
                        </div>
                        <div className="flex justify-between font-semibold border-t pt-1 mt-1">
                          <span>Totaal/bestelling</span>
                          <span>€0.10</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* CJ Order Guide Tab */}
        <TabsContent value="guide" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                CJ Dropshipping Bestelgids
              </CardTitle>
              <CardDescription>
                Stapsgewijze handleiding voor het bestellen van branded packaging
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {cjOrderSteps.map((step, index) => (
                  <div 
                    key={step.step} 
                    className={`flex gap-4 p-4 rounded-lg ${
                      index === 0 ? 'bg-primary/10 border border-primary/20' : 'bg-muted/50'
                    }`}
                  >
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold shrink-0">
                      {step.step}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold">{step.title}</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        {step.description}
                      </p>
                      {step.link && (
                        <Button 
                          variant="link" 
                          className="p-0 h-auto mt-2"
                          onClick={() => window.open(step.link, '_blank')}
                        >
                          <ExternalLink className="w-3 h-3 mr-1" />
                          Open link
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Tips section */}
              <Accordion type="single" collapsible className="mt-6">
                <AccordionItem value="tips">
                  <AccordionTrigger>
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      Tips voor succes
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <ul className="space-y-2 text-sm">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                        <span>Bestel altijd eerst een sample voor kwaliteitscontrole</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                        <span>Kies voor waterbestendige stickers (vinyl) voor duurzaamheid</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                        <span>Poly mailers zijn goedkoper dan dozen én milieuvriendelijker</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                        <span>Houd rekening met 5-10 werkdagen productietijd</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                        <span>Gebruik CMYK kleuren voor print-ready ontwerpen</span>
                      </li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="checklist">
                  <AccordionTrigger>
                    <span className="flex items-center gap-2">
                      <Box className="w-4 h-4 text-primary" />
                      Bestelchecklist
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4">
                      <div>
                        <h5 className="font-medium mb-2">Poly Mailers</h5>
                        <ul className="text-sm space-y-1 text-muted-foreground">
                          <li>✓ Small (20x30cm): €8 voor 100 stuks</li>
                          <li>✓ Medium (30x40cm): €12 voor 100 stuks</li>
                          <li>✓ Upload PNG/PDF ontwerp met 300 DPI</li>
                        </ul>
                      </div>
                      <div>
                        <h5 className="font-medium mb-2">Logo Stickers</h5>
                        <ul className="text-sm space-y-1 text-muted-foreground">
                          <li>✓ 5cm diameter rond</li>
                          <li>✓ €5 voor 100 stuks</li>
                          <li>✓ Vinyl/waterbestendig materiaal</li>
                        </ul>
                      </div>
                      <div>
                        <h5 className="font-medium mb-2">Thank You Cards</h5>
                        <ul className="text-sm space-y-1 text-muted-foreground">
                          <li>✓ 8.5 x 5.5 cm (visitekaartje formaat)</li>
                          <li>✓ €5 voor 100 stuks</li>
                          <li>✓ 300gsm karton, glanzend/mat</li>
                        </ul>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              {/* Quick action button */}
              <div className="mt-6 pt-6 border-t">
                <Button 
                  className="w-full"
                  onClick={() => window.open('https://app.cjdropshipping.com/customService/customPackaging', '_blank')}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open CJ Custom Packaging
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PackagingManager;
