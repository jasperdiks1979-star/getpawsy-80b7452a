import { useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { useSupplierImport } from "@/hooks/useSupplierImport";
import { Upload, Search, RefreshCw, Package, Truck, ArrowRightLeft, CheckCircle2, AlertTriangle, Ban, Plus, ShoppingCart, Edit, Link, Loader2, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface SupplierProduct {
  id: string;
  supplier: string;
  supplier_product_id: string;
  product_name: string;
  description: string | null;
  category: string | null;
  brand: string | null;
  cost_price: number;
  msrp: number | null;
  weight: number | null;
  image_url: string | null;
  sku: string | null;
  stock_status: string;
  shipping_time: string;
  created_at: string;
}

interface ProductMatch {
  product: {
    id: string;
    name: string;
    cost_price: number | null;
    price: number;
    shipping_time: string | null;
  };
  potentialMatches: Array<{
    id: string;
    supplier: string;
    product_name: string;
    cost_price: number;
    shipping_time: string;
    match_score: number;
  }>;
}

interface AddToShopResult {
  name: string;
  success: boolean;
  error?: string;
  productId?: string;
}

export function SupplierImportManager() {
  const { importCSV, listProducts, findMatches, switchSupplier, importDiscontinuedList, checkDiscontinued, addToShop, addManualProduct, importFromUrl, isImporting, isLoading } = useSupplierImport();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState("import");
  const [selectedSupplier, setSelectedSupplier] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [products, setProducts] = useState<SupplierProduct[]>([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [matches, setMatches] = useState<ProductMatch[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [priceMultiplier, setPriceMultiplier] = useState<string>("2.5");
  const [addResults, setAddResults] = useState<AddToShopResult[] | null>(null);
  const [importResult, setImportResult] = useState<{
    total: number;
    imported: number;
    failed: number;
    skipped: number;
  } | null>(null);
  const [discontinuedResult, setDiscontinuedResult] = useState<{
    discontinuedCount: number;
    affectedProducts: Array<{
      id: string;
      name: string;
      sku: string;
      supplier: string;
      discontinuedMatch: string;
    }>;
  } | null>(null);

  // Manual entry form state
  const [manualForm, setManualForm] = useState({
    product_name: "",
    cost_price: "",
    sku: "",
    description: "",
    category: "",
    brand: "",
    image_url: "",
    weight: "",
    shipping_time: "2-5 business days",
    supplier: "petdropshipper",
  });
  const [addToShopOnSave, setAddToShopOnSave] = useState(true);
  const [manualMultiplier, setManualMultiplier] = useState("2.5");

  // URL import state
  const [urlInput, setUrlInput] = useState("");
  const [urlAddToShop, setUrlAddToShop] = useState(true);
  const [urlMultiplier, setUrlMultiplier] = useState("2.5");
  const [urlImportResult, setUrlImportResult] = useState<{
    success: boolean;
    extractedData?: any;
    shopProduct?: any;
    error?: string;
    requiresLogin?: boolean;
    partialData?: { name?: string; sku?: string; images?: string[] };
  } | null>(null);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target?.result as string;
      const result = await importCSV(content, file.name);
      if (result.success && result.summary) {
        setImportResult(result.summary);
      }
    };
    reader.readAsText(file);
    
    // Reset file input
    event.target.value = "";
  }, [importCSV]);

  const handleSearch = useCallback(async () => {
    const supplier = selectedSupplier === "all" ? undefined : selectedSupplier;
    const { products: fetchedProducts, total } = await listProducts(
      supplier,
      searchQuery || undefined
    );
    setProducts(fetchedProducts);
    setTotalProducts(total);
  }, [listProducts, selectedSupplier, searchQuery]);

  const handleFindMatches = useCallback(async () => {
    const foundMatches = await findMatches();
    setMatches(foundMatches);
    toast({
      title: "Matches gevonden",
      description: `${foundMatches.length} slow-shipping producten met potentiële alternatieven`,
    });
  }, [findMatches, toast]);

  const handleSwitchSupplier = useCallback(async (productId: string, supplierProductId: string) => {
    const success = await switchSupplier(productId, supplierProductId);
    if (success) {
      // Remove from matches list
      setMatches(prev => prev.filter(m => m.product.id !== productId));
    }
  }, [switchSupplier]);

  const handleSelectProduct = useCallback((productId: string, checked: boolean) => {
    setSelectedProducts(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(productId);
      } else {
        next.delete(productId);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      setSelectedProducts(new Set(products.map(p => p.id)));
    } else {
      setSelectedProducts(new Set());
    }
  }, [products]);

  const handleAddToShop = useCallback(async () => {
    if (selectedProducts.size === 0) {
      toast({
        title: "Geen producten geselecteerd",
        description: "Selecteer minimaal één product om toe te voegen",
        variant: "destructive",
      });
      return;
    }

    const multiplier = parseFloat(priceMultiplier) || 2.5;
    const result = await addToShop(Array.from(selectedProducts), multiplier);
    
    if (result.success && result.results) {
      setAddResults(result.results);
      // Clear selection after successful add
      setSelectedProducts(new Set());
      // Refresh list
      handleSearch();
    }
  }, [selectedProducts, priceMultiplier, addToShop, toast, handleSearch]);

  const handleDiscontinuedUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target?.result as string;
      await importDiscontinuedList(content);
    };
    reader.readAsText(file);
    event.target.value = "";
  }, [importDiscontinuedList]);

  const handleCheckDiscontinued = useCallback(async () => {
    const result = await checkDiscontinued();
    setDiscontinuedResult(result);
    if (result.affectedProducts.length > 0) {
      toast({
        title: "Discontinued producten gevonden!",
        description: `${result.affectedProducts.length} actieve producten matchen met discontinued lijst`,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Geen problemen gevonden",
        description: "Geen actieve producten op de discontinued lijst",
      });
    }
  }, [checkDiscontinued, toast]);

  const handleManualSubmit = useCallback(async () => {
    if (!manualForm.product_name.trim() || !manualForm.cost_price.trim()) {
      toast({
        title: "Verplichte velden",
        description: "Productnaam en kostprijs zijn verplicht",
        variant: "destructive",
      });
      return;
    }

    const result = await addManualProduct(
      manualForm,
      addToShopOnSave,
      parseFloat(manualMultiplier) || 2.5
    );

    if (result.success) {
      // Reset form
      setManualForm({
        product_name: "",
        cost_price: "",
        sku: "",
        description: "",
        category: "",
        brand: "",
        image_url: "",
        weight: "",
        shipping_time: "2-5 business days",
        supplier: "petdropshipper",
      });
    }
  }, [manualForm, addToShopOnSave, manualMultiplier, addManualProduct, toast]);

  const handleUrlImport = useCallback(async () => {
    if (!urlInput.trim()) {
      toast({
        title: "URL vereist",
        description: "Voer een PetDropshipper product URL in",
        variant: "destructive",
      });
      return;
    }

    setUrlImportResult(null);
    const result = await importFromUrl(
      urlInput,
      urlAddToShop,
      parseFloat(urlMultiplier) || 2.5
    );

    if (result.success) {
      setUrlImportResult(result);
      setUrlInput("");
    } else {
      setUrlImportResult({ success: false, error: result.error });
    }
  }, [urlInput, urlAddToShop, urlMultiplier, importFromUrl, toast]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Leverancier Import</h2>
          <p className="text-muted-foreground">
            Importeer producten van TopDawg en PetDropshipper via CSV, URL of handmatig
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="import" className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            CSV
          </TabsTrigger>
          <TabsTrigger value="url" className="flex items-center gap-2">
            <Link className="h-4 w-4" />
            URL
          </TabsTrigger>
          <TabsTrigger value="manual" className="flex items-center gap-2">
            <Edit className="h-4 w-4" />
            Handmatig
          </TabsTrigger>
          <TabsTrigger value="discontinued" className="flex items-center gap-2">
            <Ban className="h-4 w-4" />
            Discontinued
          </TabsTrigger>
          <TabsTrigger value="products" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            ({totalProducts})
          </TabsTrigger>
          <TabsTrigger value="matches" className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4" />
            ({matches.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="import" className="space-y-4">
          <div className="grid gap-6 md:grid-cols-2">
            {/* TopDawg Import */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <img 
                    src="https://www.topdawg.com/favicon.ico" 
                    alt="TopDawg" 
                    className="h-5 w-5"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                  TopDawg
                </CardTitle>
                <CardDescription>
                  Download je favoriete producten als CSV vanuit TopDawg's "Favorite Product List / CSV Downloads"
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border-2 border-dashed p-6 text-center">
                  <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                  <Label htmlFor="topdawg-upload" className="cursor-pointer">
                    <span className="text-sm text-muted-foreground">
                      Klik om TopDawg CSV te uploaden
                    </span>
                    <Input
                      id="topdawg-upload"
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={handleFileUpload}
                      disabled={isImporting}
                    />
                  </Label>
                </div>
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium mb-1">Verwachte kolommen:</p>
                  <p>Item #, Product Name, Wholesale Price, MSRP, Category, Brand, Weight, Image URL</p>
                </div>
              </CardContent>
            </Card>

            {/* PetDropshipper Import */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  🐾 PetDropshipper
                </CardTitle>
                <CardDescription>
                  Exporteer producten van PetDropshipper naar CSV en upload hier
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border-2 border-dashed p-6 text-center">
                  <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                  <Label htmlFor="petdropshipper-upload" className="cursor-pointer">
                    <span className="text-sm text-muted-foreground">
                      Klik om PetDropshipper CSV te uploaden
                    </span>
                    <Input
                      id="petdropshipper-upload"
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={handleFileUpload}
                      disabled={isImporting}
                    />
                  </Label>
                </div>
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium mb-1">Verwachte kolommen:</p>
                  <p>SKU, Product Name, Cost, MSRP, Category, Brand, Weight, Image, In Stock</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Import Result */}
          {importResult && (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <CheckCircle2 className="h-8 w-8 text-green-600" />
                  <div>
                    <h3 className="font-semibold">Import Voltooid</h3>
                    <p className="text-sm text-muted-foreground">
                      {importResult.imported} geïmporteerd, {importResult.skipped} overgeslagen, {importResult.failed} gefaald van {importResult.total} totaal
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Instructions */}
          <Card>
            <CardHeader>
              <CardTitle>Hoe te gebruiken</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">1</div>
                <div>
                  <p className="font-medium">Download CSV van leverancier</p>
                  <p className="text-muted-foreground">
                    TopDawg: Ga naar Product Catalog → Favorite Product List / CSV Downloads
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">2</div>
                <div>
                  <p className="font-medium">Upload CSV bestand</p>
                  <p className="text-muted-foreground">
                    Het systeem detecteert automatisch welke leverancier het is
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">3</div>
                <div>
                  <p className="font-medium">Match met slow-shipping producten</p>
                  <p className="text-muted-foreground">
                    Ga naar "Matches" tab om producten te koppelen en leverancier te wisselen
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* URL Import Tab */}
        <TabsContent value="url" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link className="h-5 w-5" />
                Import via URL
              </CardTitle>
              <CardDescription>
                Plak een product URL van PetDropshipper en het systeem haalt automatisch alle productgegevens op.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="url-input">Product URL</Label>
                  <div className="flex gap-2">
                    <Input
                      id="url-input"
                      type="url"
                      placeholder="https://petdropshipper.com/products/..."
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => window.open('https://petdropshipper.com', '_blank')}
                      title="Open PetDropshipper"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Ondersteund: petdropshipper.com product pagina's
                  </p>
                </div>

                {/* Add to shop options */}
                <Card className="border-primary/20 bg-primary/5">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          id="url-add-to-shop"
                          checked={urlAddToShop}
                          onCheckedChange={(checked) => setUrlAddToShop(checked as boolean)}
                        />
                        <Label htmlFor="url-add-to-shop" className="cursor-pointer">
                          Direct toevoegen aan webshop
                        </Label>
                      </div>
                      {urlAddToShop && (
                        <div className="flex items-center gap-2">
                          <Label htmlFor="url-multiplier" className="text-sm whitespace-nowrap">
                            Prijs multiplier:
                          </Label>
                          <Input
                            id="url-multiplier"
                            type="number"
                            min="1"
                            max="10"
                            step="0.1"
                            value={urlMultiplier}
                            onChange={(e) => setUrlMultiplier(e.target.value)}
                            className="w-20"
                          />
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Button 
                  onClick={handleUrlImport} 
                  disabled={isLoading || !urlInput.trim()}
                  className="w-full"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Product ophalen...
                    </>
                  ) : (
                    <>
                      <Link className="h-4 w-4 mr-2" />
                      Product Importeren
                    </>
                  )}
                </Button>
              </div>

              {/* URL Import Result */}
              {urlImportResult && (
                <>
                  {urlImportResult.success ? (
                    <Alert className="border-green-200 bg-green-50">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <AlertTitle className="text-green-800">Import geslaagd!</AlertTitle>
                      <AlertDescription className="text-green-700">
                        <div className="mt-2 space-y-1">
                          <p><strong>Product:</strong> {urlImportResult.extractedData?.name}</p>
                          <p><strong>Kostprijs:</strong> ${urlImportResult.extractedData?.price?.toFixed(2)}</p>
                          {urlImportResult.extractedData?.sku && (
                            <p><strong>SKU:</strong> {urlImportResult.extractedData?.sku}</p>
                          )}
                          {urlImportResult.extractedData?.brand && (
                            <p><strong>Merk:</strong> {urlImportResult.extractedData?.brand}</p>
                          )}
                          {urlImportResult.shopProduct && (
                            <p className="mt-2 text-green-600 font-medium">
                              ✓ Toegevoegd aan webshop voor €{urlImportResult.shopProduct.price?.toFixed(2)}
                            </p>
                          )}
                        </div>
                      </AlertDescription>
                    </Alert>
                  ) : urlImportResult.requiresLogin ? (
                    <Alert className="border-orange-200 bg-orange-50">
                      <AlertTriangle className="h-4 w-4 text-orange-600" />
                      <AlertTitle className="text-orange-800">Login vereist op PetDropshipper</AlertTitle>
                      <AlertDescription className="text-orange-700">
                        <p className="mb-3">{urlImportResult.error}</p>
                        {urlImportResult.partialData?.name && (
                          <div className="space-y-2">
                            <p><strong>Gevonden productnaam:</strong> {urlImportResult.partialData.name}</p>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                // Pre-fill the manual form with partial data
                                setManualForm(prev => ({
                                  ...prev,
                                  product_name: urlImportResult.partialData?.name || "",
                                  sku: urlImportResult.partialData?.sku || "",
                                  image_url: urlImportResult.partialData?.images?.[0] || "",
                                }));
                                setActiveTab("manual");
                                setUrlImportResult(null);
                              }}
                              className="mt-2"
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              Handmatig invoeren met deze gegevens
                            </Button>
                          </div>
                        )}
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Import mislukt</AlertTitle>
                      <AlertDescription>{urlImportResult.error}</AlertDescription>
                    </Alert>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* How it works */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">🔗 Hoe werkt URL import?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">1</div>
                <div>
                  <p className="font-medium">Kopieer de product URL</p>
                  <p className="text-muted-foreground">
                    Ga naar petdropshipper.com, vind je product en kopieer de URL uit je browser
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">2</div>
                <div>
                  <p className="font-medium">Plak en importeer</p>
                  <p className="text-muted-foreground">
                    Het systeem haalt automatisch naam, prijs, SKU, afbeeldingen en meer op
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">3</div>
                <div>
                  <p className="font-medium">Direct in je shop</p>
                  <p className="text-muted-foreground">
                    Met "Direct toevoegen" wordt het product meteen live in je webshop gezet
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="manual" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Edit className="h-5 w-5" />
                Handmatige Invoer
              </CardTitle>
              <CardDescription>
                Voeg een product handmatig toe zonder CSV. Ideaal voor losse producten van de PetDropshipper website.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                {/* Required fields */}
                <div className="space-y-2">
                  <Label htmlFor="manual-name">Productnaam *</Label>
                  <Input
                    id="manual-name"
                    placeholder="Bijv. KONG Classic Dog Toy Large"
                    value={manualForm.product_name}
                    onChange={(e) => setManualForm(prev => ({ ...prev, product_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manual-cost">Kostprijs (USD) *</Label>
                  <Input
                    id="manual-cost"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="12.99"
                    value={manualForm.cost_price}
                    onChange={(e) => setManualForm(prev => ({ ...prev, cost_price: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manual-sku">SKU / Artikelnummer</Label>
                  <Input
                    id="manual-sku"
                    placeholder="Bijv. KONG-CL-L"
                    value={manualForm.sku}
                    onChange={(e) => setManualForm(prev => ({ ...prev, sku: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manual-supplier">Leverancier</Label>
                  <Select 
                    value={manualForm.supplier} 
                    onValueChange={(value) => setManualForm(prev => ({ ...prev, supplier: value }))}
                  >
                    <SelectTrigger id="manual-supplier">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="petdropshipper">PetDropshipper</SelectItem>
                      <SelectItem value="topdawg">TopDawg</SelectItem>
                      <SelectItem value="manual">Handmatig / Overig</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manual-category">Categorie</Label>
                  <Input
                    id="manual-category"
                    placeholder="Bijv. Dog Toys"
                    value={manualForm.category}
                    onChange={(e) => setManualForm(prev => ({ ...prev, category: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manual-brand">Merk</Label>
                  <Input
                    id="manual-brand"
                    placeholder="Bijv. KONG"
                    value={manualForm.brand}
                    onChange={(e) => setManualForm(prev => ({ ...prev, brand: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manual-weight">Gewicht (lbs)</Label>
                  <Input
                    id="manual-weight"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.5"
                    value={manualForm.weight}
                    onChange={(e) => setManualForm(prev => ({ ...prev, weight: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manual-shipping">Verzendtijd</Label>
                  <Select 
                    value={manualForm.shipping_time} 
                    onValueChange={(value) => setManualForm(prev => ({ ...prev, shipping_time: value }))}
                  >
                    <SelectTrigger id="manual-shipping">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2-5 business days">2-5 business days (US)</SelectItem>
                      <SelectItem value="5-10 business days">5-10 business days</SelectItem>
                      <SelectItem value="10-20 business days">10-20 business days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="manual-image">Afbeelding URL</Label>
                  <Input
                    id="manual-image"
                    type="url"
                    placeholder="https://..."
                    value={manualForm.image_url}
                    onChange={(e) => setManualForm(prev => ({ ...prev, image_url: e.target.value }))}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="manual-desc">Beschrijving</Label>
                  <Textarea
                    id="manual-desc"
                    placeholder="Productbeschrijving..."
                    rows={3}
                    value={manualForm.description}
                    onChange={(e) => setManualForm(prev => ({ ...prev, description: e.target.value }))}
                  />
                </div>
              </div>

              {/* Add to shop options */}
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id="add-to-shop-now"
                        checked={addToShopOnSave}
                        onCheckedChange={(checked) => setAddToShopOnSave(checked as boolean)}
                      />
                      <Label htmlFor="add-to-shop-now" className="cursor-pointer">
                        Direct toevoegen aan webshop
                      </Label>
                    </div>
                    {addToShopOnSave && (
                      <div className="flex items-center gap-2">
                        <Label htmlFor="manual-multiplier" className="text-sm whitespace-nowrap">
                          Prijs multiplier:
                        </Label>
                        <Input
                          id="manual-multiplier"
                          type="number"
                          min="1"
                          max="10"
                          step="0.1"
                          value={manualMultiplier}
                          onChange={(e) => setManualMultiplier(e.target.value)}
                          className="w-20"
                        />
                        {manualForm.cost_price && (
                          <span className="text-sm text-green-600 font-medium">
                            = €{(parseFloat(manualForm.cost_price) * (parseFloat(manualMultiplier) || 2.5)).toFixed(2)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Button 
                onClick={handleManualSubmit} 
                disabled={isLoading || !manualForm.product_name || !manualForm.cost_price}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                {addToShopOnSave ? "Toevoegen aan Leveranciers & Shop" : "Toevoegen aan Leveranciers Database"}
              </Button>
            </CardContent>
          </Card>

          {/* Quick tips */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">💡 Tips voor handmatige invoer</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>• Kopieer de <strong>SKU</strong> en <strong>prijs</strong> direct van de product pagina op petdropshipper.com</p>
              <p>• Rechtermuisklik op productafbeeldingen → "Afbeeldingsadres kopiëren" voor de Image URL</p>
              <p>• De kostprijs is in USD - de verkoopprijs wordt automatisch omgerekend met de multiplier</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="discontinued" className="space-y-4">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Upload Discontinued List */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Ban className="h-5 w-5 text-destructive" />
                  Discontinued Lijst Uploaden
                </CardTitle>
                <CardDescription>
                  Upload de "Discontinued List 2026" CSV/Excel van PetDropshipper
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border-2 border-dashed border-destructive/30 p-6 text-center">
                  <Upload className="mx-auto h-8 w-8 text-destructive/50 mb-2" />
                  <Label htmlFor="discontinued-upload" className="cursor-pointer">
                    <span className="text-sm text-muted-foreground">
                      Klik om Discontinued List te uploaden
                    </span>
                    <Input
                      id="discontinued-upload"
                      type="file"
                      accept=".csv,.xlsx"
                      className="hidden"
                      onChange={handleDiscontinuedUpload}
                      disabled={isLoading}
                    />
                  </Label>
                </div>
              </CardContent>
            </Card>

            {/* Check Products */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-warning" />
                  Controleer Producten
                </CardTitle>
                <CardDescription>
                  Scan je actieve producten tegen de discontinued lijst
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  onClick={handleCheckDiscontinued} 
                  disabled={isLoading}
                  className="w-full"
                  variant="outline"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                  Controleer Actieve Producten
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Discontinued Check Results */}
          {discontinuedResult && discontinuedResult.affectedProducts.length > 0 && (
            <Card className="border-destructive/50 bg-destructive/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                  {discontinuedResult.affectedProducts.length} Producten op Discontinued Lijst
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Leverancier</TableHead>
                      <TableHead>Discontinued Match</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {discontinuedResult.affectedProducts.map((prod) => (
                      <TableRow key={prod.id}>
                        <TableCell className="font-medium">{prod.name}</TableCell>
                        <TableCell className="text-muted-foreground">{prod.sku}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{prod.supplier}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {prod.discontinuedMatch}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {discontinuedResult && discontinuedResult.affectedProducts.length === 0 && (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <CheckCircle2 className="h-8 w-8 text-green-600" />
                  <div>
                    <h3 className="font-semibold">Alles in orde!</h3>
                    <p className="text-sm text-muted-foreground">
                      Geen van je actieve producten staat op de discontinued lijst ({discontinuedResult.discontinuedCount} items gecheckt)
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="products" className="space-y-4">
          {/* Search & Filter */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex gap-4 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <Input
                    placeholder="Zoek op productnaam..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  />
                </div>
                <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Alle leveranciers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle leveranciers</SelectItem>
                    <SelectItem value="topdawg">TopDawg</SelectItem>
                    <SelectItem value="petdropshipper">PetDropshipper</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={handleSearch} disabled={isLoading}>
                  <Search className="h-4 w-4 mr-2" />
                  Zoeken
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Add to Shop Controls */}
          {products.length > 0 && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="select-all"
                        checked={selectedProducts.size === products.length && products.length > 0}
                        onCheckedChange={(checked) => handleSelectAll(checked as boolean)}
                      />
                      <Label htmlFor="select-all" className="text-sm cursor-pointer">
                        Selecteer alles ({products.length})
                      </Label>
                    </div>
                    {selectedProducts.size > 0 && (
                      <Badge variant="secondary" className="gap-1">
                        <ShoppingCart className="h-3 w-3" />
                        {selectedProducts.size} geselecteerd
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="multiplier" className="text-sm whitespace-nowrap">
                        Prijs multiplier:
                      </Label>
                      <Input
                        id="multiplier"
                        type="number"
                        min="1"
                        max="10"
                        step="0.1"
                        value={priceMultiplier}
                        onChange={(e) => setPriceMultiplier(e.target.value)}
                        className="w-20"
                      />
                    </div>
                    <Button 
                      onClick={handleAddToShop} 
                      disabled={isLoading || selectedProducts.size === 0}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Toevoegen aan Shop
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Add Results */}
          {addResults && addResults.length > 0 && (
            <Card className="border-green-200 bg-green-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  Resultaten
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {addResults.map((result, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="truncate flex-1">{result.name}</span>
                      {result.success ? (
                        <Badge variant="default" className="ml-2">Toegevoegd</Badge>
                      ) : (
                        <Badge variant="destructive" className="ml-2">{result.error}</Badge>
                      )}
                    </div>
                  ))}
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="mt-3"
                  onClick={() => setAddResults(null)}
                >
                  Sluiten
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Products Table */}
          <Card>
            <CardContent className="pt-6">
              {products.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Geen producten gevonden</p>
                  <p className="text-sm">Upload een CSV of pas je zoekopdracht aan</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Leverancier</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">Kostprijs</TableHead>
                      <TableHead className="text-right">Verkoopprijs</TableHead>
                      <TableHead>Verzending</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((product) => {
                      const retailPrice = product.cost_price * (parseFloat(priceMultiplier) || 2.5);
                      return (
                        <TableRow key={product.id} className={selectedProducts.has(product.id) ? "bg-primary/5" : ""}>
                          <TableCell>
                            <Checkbox
                              checked={selectedProducts.has(product.id)}
                              onCheckedChange={(checked) => handleSelectProduct(product.id, checked as boolean)}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              {product.image_url && (
                                <img
                                  src={product.image_url}
                                  alt={product.product_name}
                                  className="h-10 w-10 rounded object-cover"
                                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                />
                              )}
                              <div>
                                <p className="font-medium line-clamp-1">{product.product_name}</p>
                                {product.brand && (
                                  <p className="text-xs text-muted-foreground">{product.brand}</p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {product.supplier}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {product.sku}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            ${product.cost_price.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right text-green-600 font-medium">
                            €{retailPrice.toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm">
                              <Truck className="h-3 w-3" />
                              {product.shipping_time}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={product.stock_status === 'in_stock' ? 'default' : 'secondary'}
                            >
                              {product.stock_status === 'in_stock' ? 'Op voorraad' : 'Uitverkocht'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="matches" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold">Slow-Shipping Product Matches</h3>
                  <p className="text-sm text-muted-foreground">
                    Vind alternatieven voor producten met 10-20 dagen verzending
                  </p>
                </div>
                <Button onClick={handleFindMatches} disabled={isLoading}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                  Zoek Matches
                </Button>
              </div>

              {matches.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <ArrowRightLeft className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Geen matches gevonden</p>
                  <p className="text-sm">Klik op "Zoek Matches" om te beginnen</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {matches.map((match) => (
                    <Card key={match.product.id} className="border-orange-200">
                      <CardContent className="pt-4">
                        <div className="mb-3">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="destructive">10-20 dagen</Badge>
                            <span className="font-medium">{match.product.name}</span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Huidige kostprijs: ${match.product.cost_price?.toFixed(2) || 'N/A'} | 
                            Verkoopprijs: €{match.product.price.toFixed(2)}
                          </p>
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground uppercase">
                            Alternatieven ({match.potentialMatches.length})
                          </p>
                          {match.potentialMatches.map((alt) => (
                            <div
                              key={alt.id}
                              className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                            >
                              <div className="flex items-center gap-3">
                                <Badge variant="outline" className="capitalize">
                                  {alt.supplier}
                                </Badge>
                                <div>
                                  <p className="text-sm font-medium line-clamp-1">
                                    {alt.product_name}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    ${alt.cost_price.toFixed(2)} | {alt.shipping_time}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary">{alt.match_score}% match</Badge>
                                <Button
                                  size="sm"
                                  onClick={() => handleSwitchSupplier(match.product.id, alt.id)}
                                >
                                  Wissel
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
