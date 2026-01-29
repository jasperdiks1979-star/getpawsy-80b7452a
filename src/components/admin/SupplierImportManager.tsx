import { useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSupplierImport } from "@/hooks/useSupplierImport";
import { Upload, Search, RefreshCw, Package, Truck, ArrowRightLeft, CheckCircle2, AlertTriangle, Ban } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

export function SupplierImportManager() {
  const { importCSV, listProducts, findMatches, switchSupplier, importDiscontinuedList, checkDiscontinued, isImporting, isLoading } = useSupplierImport();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState("import");
  const [selectedSupplier, setSelectedSupplier] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [products, setProducts] = useState<SupplierProduct[]>([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [matches, setMatches] = useState<ProductMatch[]>([]);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Leverancier Import</h2>
          <p className="text-muted-foreground">
            Importeer producten van TopDawg en PetDropshipper via CSV
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="import" className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Import CSV
          </TabsTrigger>
          <TabsTrigger value="discontinued" className="flex items-center gap-2">
            <Ban className="h-4 w-4" />
            Discontinued
          </TabsTrigger>
          <TabsTrigger value="products" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Producten ({totalProducts})
          </TabsTrigger>
          <TabsTrigger value="matches" className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4" />
            Matches ({matches.length})
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
              <div className="flex gap-4">
                <div className="flex-1">
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
                      <TableHead>Product</TableHead>
                      <TableHead>Leverancier</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">Kostprijs</TableHead>
                      <TableHead className="text-right">MSRP</TableHead>
                      <TableHead>Verzending</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((product) => (
                      <TableRow key={product.id}>
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
                        <TableCell className="text-right text-muted-foreground">
                          {product.msrp ? `$${product.msrp.toFixed(2)}` : '-'}
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
                    ))}
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
