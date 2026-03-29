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
  FileText,
  Box,
  Euro,
  TrendingUp,
  Info,
  Copy,
  Check,
  Printer,
  FolderArchive,
  BarChart3
} from "lucide-react";
import { InventoryTracker } from "./packaging/InventoryTracker";
import { toast } from "sonner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import jsPDF from "jspdf";
import JSZip from "jszip";

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

  // PDF export configurations for each item type
  const pdfConfigs: Record<string, { 
    widthMM: number; 
    heightMM: number; 
    bleedMM: number; 
    isRound?: boolean;
    paperSpec: string;
    finishSpec: string;
    additionalSpecs?: string[];
  }> = {
    "sticker-5cm": {
      widthMM: 50, // 5cm diameter
      heightMM: 50,
      bleedMM: 2, // 2mm bleed for stickers
      isRound: true,
      paperSpec: "Vinyl/waterproof sticker material",
      finishSpec: "Gloss or Matte laminate",
      additionalSpecs: ["Die-cut: Round/Circle", "Adhesive: Permanent"]
    },
    "thank-you-card": {
      widthMM: 85, // 8.5 cm
      heightMM: 55, // 5.5 cm
      bleedMM: 3,
      paperSpec: "300gsm coated card",
      finishSpec: "Matte or Gloss"
    },
    "poly-mailer-small": {
      widthMM: 200, // 20 cm
      heightMM: 300, // 30 cm
      bleedMM: 5, // 5mm bleed for larger items
      paperSpec: "Poly mailer material (LDPE)",
      finishSpec: "Printed exterior",
      additionalSpecs: ["Self-seal adhesive strip", "Tear-proof material"]
    },
    "poly-mailer-medium": {
      widthMM: 300, // 30 cm
      heightMM: 400, // 40 cm
      bleedMM: 5,
      paperSpec: "Poly mailer material (LDPE)",
      finishSpec: "Printed exterior",
      additionalSpecs: ["Self-seal adhesive strip", "Tear-proof material"]
    }
  };

  // Helper function to generate PDF for an item (returns jsPDF instance)
  const generatePDFForItem = async (item: PackagingItem): Promise<jsPDF> => {
    const config = pdfConfigs[item.id];
    if (!config) {
      throw new Error("Geen PDF configuratie beschikbaar voor dit item");
    }

      
      const { widthMM, heightMM, bleedMM, isRound, paperSpec, finishSpec, additionalSpecs } = config;
      
      const totalWidthMM = widthMM + (bleedMM * 2);
      const totalHeightMM = heightMM + (bleedMM * 2);
      
      // Create PDF with custom size (including bleed)
      const pdf = new jsPDF({
        orientation: totalWidthMM > totalHeightMM ? 'landscape' : 'portrait',
        unit: 'mm',
        format: [totalWidthMM, totalHeightMM]
      });
      
      // Load the image
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = item.image;
      });
      
      // Add the image to fill the entire page (including bleed area)
      pdf.addImage(img, 'PNG', 0, 0, totalWidthMM, totalHeightMM);
      
      // Add crop marks (trim marks)
      pdf.setDrawColor(0, 0, 0);
      pdf.setLineWidth(0.25);
      
      if (isRound) {
        // For round stickers, add circular trim guide
        pdf.setDrawColor(200, 200, 200);
        pdf.setLineWidth(0.1);
        // Draw a circle guide at the trim edge
        const centerX = totalWidthMM / 2;
        const centerY = totalHeightMM / 2;
        const radius = widthMM / 2;
        
        // Draw trim circle (dashed effect with multiple small arcs)
        for (let angle = 0; angle < 360; angle += 15) {
          const startRad = (angle * Math.PI) / 180;
          const endRad = ((angle + 10) * Math.PI) / 180;
          const x1 = centerX + radius * Math.cos(startRad);
          const y1 = centerY + radius * Math.sin(startRad);
          const x2 = centerX + radius * Math.cos(endRad);
          const y2 = centerY + radius * Math.sin(endRad);
          pdf.line(x1, y1, x2, y2);
        }
        
        // Add corner registration marks
        pdf.setDrawColor(0, 0, 0);
        const markLen = 3;
        // Top-left
        pdf.line(0, markLen, markLen, markLen);
        pdf.line(markLen, 0, markLen, markLen);
        // Top-right
        pdf.line(totalWidthMM - markLen, markLen, totalWidthMM, markLen);
        pdf.line(totalWidthMM - markLen, 0, totalWidthMM - markLen, markLen);
        // Bottom-left
        pdf.line(0, totalHeightMM - markLen, markLen, totalHeightMM - markLen);
        pdf.line(markLen, totalHeightMM - markLen, markLen, totalHeightMM);
        // Bottom-right
        pdf.line(totalWidthMM - markLen, totalHeightMM - markLen, totalWidthMM, totalHeightMM - markLen);
        pdf.line(totalWidthMM - markLen, totalHeightMM - markLen, totalWidthMM - markLen, totalHeightMM);
      } else {
        // Standard rectangular crop marks
        // Top-left crop marks
        pdf.line(0, bleedMM, bleedMM - 1, bleedMM);
        pdf.line(bleedMM, 0, bleedMM, bleedMM - 1);
        
        // Top-right crop marks
        pdf.line(totalWidthMM - bleedMM + 1, bleedMM, totalWidthMM, bleedMM);
        pdf.line(totalWidthMM - bleedMM, 0, totalWidthMM - bleedMM, bleedMM - 1);
        
        // Bottom-left crop marks
        pdf.line(0, totalHeightMM - bleedMM, bleedMM - 1, totalHeightMM - bleedMM);
        pdf.line(bleedMM, totalHeightMM - bleedMM + 1, bleedMM, totalHeightMM);
        
        // Bottom-right crop marks
        pdf.line(totalWidthMM - bleedMM + 1, totalHeightMM - bleedMM, totalWidthMM, totalHeightMM - bleedMM);
        pdf.line(totalWidthMM - bleedMM, totalHeightMM - bleedMM + 1, totalWidthMM - bleedMM, totalHeightMM);
      }
      
      // Add a second page with specifications
      pdf.addPage([totalWidthMM > 100 ? 210 : totalWidthMM, totalHeightMM > 100 ? 297 : totalHeightMM]);
      pdf.setFontSize(10);
      pdf.setTextColor(50, 50, 50);
      
      const specs = [
        'PRINT SPECIFICATIONS',
        '═══════════════════════════════',
        '',
        `Product: ${item.name}`,
        `Final Size: ${widthMM/10} x ${heightMM/10} cm${isRound ? ' (diameter)' : ''}`,
        `Total Size (with bleed): ${totalWidthMM/10} x ${totalHeightMM/10} cm`,
        `Bleed: ${bleedMM}mm on all sides`,
        '',
        'MATERIAL SPECIFICATIONS:',
        `• Material: ${paperSpec}`,
        `• Finish: ${finishSpec}`,
        '• Color Mode: CMYK',
        '• Resolution: 300 DPI minimum',
        ...(additionalSpecs ? ['', 'ADDITIONAL REQUIREMENTS:', ...additionalSpecs.map(s => `• ${s}`)] : []),
        '',
        '───────────────────────────────',
        'getpawsy.nl',
        `Generated: ${new Date().toLocaleDateString('nl-NL')}`
      ];
      
      let yPos = 15;
      specs.forEach(line => {
        pdf.text(line, 10, yPos);
        yPos += 5;
      });
      
      // Return PDF as blob for bulk export, or save directly
      return pdf;
  };

  const handleExportSinglePDF = async (item: PackagingItem) => {
    try {
      toast.loading("PDF wordt gegenereerd...", { id: "pdf-export" });
      const pdf = await generatePDFForItem(item);
      pdf.save(`getpawsy-${item.id}-print-ready.pdf`);
      toast.success(`Print-ready PDF geëxporteerd voor ${item.name}!`, { id: "pdf-export" });
    } catch (error) {
      toast.error("Kon PDF niet genereren", { id: "pdf-export" });
    }
  };

  const handleBulkExportPDFs = async () => {
    try {
      toast.loading("Bulk PDF export wordt voorbereid...", { id: "bulk-export" });
      
      const zip = new JSZip();
      const pdfFolder = zip.folder("getpawsy-packaging-print-ready");
      
      if (!pdfFolder) {
        throw new Error("Could not create ZIP folder");
      }
      
      // Generate PDF for each item
      for (const item of packagingItems) {
        try {
          const pdf = await generatePDFForItem(item);
          const pdfBlob = pdf.output('blob');
          pdfFolder.file(`${item.id}-print-ready.pdf`, pdfBlob);
        } catch (error) {
          console.error(`Failed to generate PDF for ${item.id}:`, error);
        }
      }
      
      // Also add original PNG files
      const pngFolder = zip.folder("getpawsy-packaging-originals");
      if (pngFolder) {
        for (const item of packagingItems) {
          try {
            const response = await fetch(item.image);
            const blob = await response.blob();
            pngFolder.file(`${item.id}-original.png`, blob);
          } catch (error) {
            console.error(`Failed to add PNG for ${item.id}:`, error);
          }
        }
      }
      
      // Add README with instructions
      const readme = `GETPAWSY BRANDED PACKAGING - PRINT FILES
========================================

Dit pakket bevat alle print-ready bestanden voor GetPawsy branded packaging.

MAPPENSTRUCTUUR:
- /getpawsy-packaging-print-ready/ - PDF bestanden met bleed margins en snijmerken
- /getpawsy-packaging-originals/ - Originele PNG bestanden (300 DPI)

BESTANDEN:
1. sticker-5cm-print-ready.pdf - Logo sticker (5cm diameter, 2mm bleed)
2. thank-you-card-print-ready.pdf - Bedankkaartje (8.5x5.5cm, 3mm bleed)
3. poly-mailer-small-print-ready.pdf - Kleine verzendenvelop (20x30cm, 5mm bleed)
4. poly-mailer-medium-print-ready.pdf - Medium verzendenvelop (30x40cm, 5mm bleed)

PRINT SPECIFICATIES:
- Alle bestanden zijn CMYK-ready
- Minimale resolutie: 300 DPI
- Bleed margins zijn inbegrepen
- Snijmerken (crop marks) zijn toegevoegd

CONTACT:
Website: getpawsy.pet
Email: support@getpawsy.pet

Gegenereerd op: ${new Date().toLocaleDateString('nl-NL')} ${new Date().toLocaleTimeString('nl-NL')}
`;
      
      zip.file("LEESMIJ.txt", readme);
      
      // Generate and download ZIP
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `getpawsy-packaging-print-files-${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast.success("Alle print-ready PDFs en originelen geëxporteerd!", { id: "bulk-export" });
    } catch (error) {
      console.error('Bulk export error:', error);
      toast.error("Kon bulk export niet voltooien", { id: "bulk-export" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Package className="w-6 h-6 text-primary" />
            Branded Packaging
          </h2>
          <p className="text-muted-foreground">
            Beheer je branded verpakkingsmaterialen en bestel bij CJ Dropshipping
          </p>
        </div>
        <Button 
          onClick={handleBulkExportPDFs}
          className="shrink-0"
        >
          <FolderArchive className="w-4 h-4 mr-2" />
          Download Alle PDFs (ZIP)
        </Button>
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
      <Tabs defaultValue="designs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="designs" className="flex items-center gap-2">
            <Package className="w-4 h-4" />
            Designs
          </TabsTrigger>
          <TabsTrigger value="inventory" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Voorraad
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

        {/* Designs Tab */}
        <TabsContent value="designs" className="space-y-4">
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
                      variant="default"
                      size="sm"
                      onClick={() => handleExportSinglePDF(item)}
                      title={`Export print-ready PDF voor ${item.name}`}
                    >
                      <Printer className="w-4 h-4" />
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

        {/* Inventory Tab */}
        <TabsContent value="inventory" className="space-y-4">
          <InventoryTracker />
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
