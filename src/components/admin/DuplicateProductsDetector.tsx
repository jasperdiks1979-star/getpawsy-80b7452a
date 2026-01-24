import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Search, Trash2, Eye, EyeOff, AlertTriangle, CheckCircle, RefreshCw } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";


interface DuplicateGroup {
  key: string;
  reason: string;
  products: Array<{
    id: string;
    name: string;
    price: number;
    image_url: string | null;
    slug: string | null;
    is_active: boolean;
    created_at: string;
    cj_product_id: string | null;
  }>;
}

// Calculate similarity between two strings using Levenshtein distance
function stringSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;
  
  // Quick check for significant overlap
  const words1 = new Set(s1.split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(s2.split(/\s+/).filter(w => w.length > 2));
  
  if (words1.size === 0 || words2.size === 0) return 0;
  
  const intersection = [...words1].filter(w => words2.has(w));
  const union = new Set([...words1, ...words2]);
  
  return intersection.length / union.size;
}

// Normalize product name for comparison
function normalizeProductName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function DuplicateProductsDetector() {
  const queryClient = useQueryClient();
  const [isScanning, setIsScanning] = useState(false);
  const [selectedDuplicates, setSelectedDuplicates] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<"deactivate" | "delete">("deactivate");
  const [scanComplete, setScanComplete] = useState(false);

  // Fetch all products
  const { data: products, isLoading, refetch } = useQuery({
    queryKey: ["admin-duplicate-check-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price, image_url, slug, is_active, created_at, cj_product_id")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Detect duplicates
  const duplicateGroups = useMemo((): DuplicateGroup[] => {
    if (!products || products.length === 0 || !scanComplete) return [];

    const groups: DuplicateGroup[] = [];
    const processedIds = new Set<string>();
    const SIMILARITY_THRESHOLD = 0.7;

    // Group by exact CJ product ID match
    const cjIdGroups = new Map<string, typeof products>();
    products.forEach(product => {
      if (product.cj_product_id) {
        const existing = cjIdGroups.get(product.cj_product_id) || [];
        existing.push(product);
        cjIdGroups.set(product.cj_product_id, existing);
      }
    });

    cjIdGroups.forEach((group, cjId) => {
      if (group.length > 1) {
        group.forEach(p => processedIds.add(p.id));
        groups.push({
          key: `cj-${cjId}`,
          reason: "Zelfde CJ Product ID",
          products: group,
        });
      }
    });

    // Group by exact image URL match
    const imageGroups = new Map<string, typeof products>();
    products.forEach(product => {
      if (product.image_url && !processedIds.has(product.id)) {
        const existing = imageGroups.get(product.image_url) || [];
        existing.push(product);
        imageGroups.set(product.image_url, existing);
      }
    });

    imageGroups.forEach((group, imageUrl) => {
      if (group.length > 1) {
        group.forEach(p => processedIds.add(p.id));
        groups.push({
          key: `img-${imageUrl.substring(0, 50)}`,
          reason: "Zelfde afbeelding",
          products: group,
        });
      }
    });

    // Group by similar names (not yet processed)
    const unprocessedProducts = products.filter(p => !processedIds.has(p.id));
    
    for (let i = 0; i < unprocessedProducts.length; i++) {
      const product1 = unprocessedProducts[i];
      if (processedIds.has(product1.id)) continue;

      const similarProducts = [product1];
      const normalizedName1 = normalizeProductName(product1.name);

      for (let j = i + 1; j < unprocessedProducts.length; j++) {
        const product2 = unprocessedProducts[j];
        if (processedIds.has(product2.id)) continue;

        const normalizedName2 = normalizeProductName(product2.name);
        const similarity = stringSimilarity(normalizedName1, normalizedName2);

        if (similarity >= SIMILARITY_THRESHOLD) {
          similarProducts.push(product2);
        }
      }

      if (similarProducts.length > 1) {
        similarProducts.forEach(p => processedIds.add(p.id));
        groups.push({
          key: `name-${product1.id}`,
          reason: `Vergelijkbare naam (${Math.round(stringSimilarity(normalizedName1, normalizeProductName(similarProducts[1].name)) * 100)}% match)`,
          products: similarProducts,
        });
      }
    }

    return groups;
  }, [products, scanComplete]);

  // Deactivate products mutation
  const deactivateMutation = useMutation({
    mutationFn: async (productIds: string[]) => {
      const { error } = await supabase
        .from("products")
        .update({ is_active: false })
        .in("id", productIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-duplicate-check-products"] });
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      setSelectedDuplicates(new Set());
      toast.success("Producten gedeactiveerd");
    },
    onError: (error) => {
      toast.error(`Fout: ${error.message}`);
    },
  });

  // Delete products mutation
  const deleteMutation = useMutation({
    mutationFn: async (productIds: string[]) => {
      const { error } = await supabase
        .from("products")
        .delete()
        .in("id", productIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-duplicate-check-products"] });
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      setSelectedDuplicates(new Set());
      toast.success("Producten verwijderd");
    },
    onError: (error) => {
      toast.error(`Fout: ${error.message}`);
    },
  });

  const handleScan = async () => {
    setIsScanning(true);
    setScanComplete(false);
    await refetch();
    setScanComplete(true);
    setIsScanning(false);
  };

  const toggleSelect = (productId: string) => {
    setSelectedDuplicates(prev => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const selectAllExceptFirst = (group: DuplicateGroup) => {
    setSelectedDuplicates(prev => {
      const next = new Set(prev);
      // Sort by created_at and select all except the oldest
      const sorted = [...group.products].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      sorted.slice(1).forEach(p => next.add(p.id));
      return next;
    });
  };

  const handleAction = (type: "deactivate" | "delete") => {
    if (selectedDuplicates.size === 0) {
      toast.error("Selecteer eerst producten");
      return;
    }
    setActionType(type);
    setDeleteDialogOpen(true);
  };

  const confirmAction = () => {
    const productIds = Array.from(selectedDuplicates);
    if (actionType === "deactivate") {
      deactivateMutation.mutate(productIds);
    } else {
      deleteMutation.mutate(productIds);
    }
    setDeleteDialogOpen(false);
  };

  const totalDuplicates = duplicateGroups.reduce((acc, g) => acc + g.products.length - 1, 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Duplicaat Detectie
          </CardTitle>
          <CardDescription>
            Scan de productcatalogus op mogelijke duplicaten op basis van CJ Product ID, 
            afbeelding URL en productnaam gelijkenis.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Button onClick={handleScan} disabled={isScanning || isLoading}>
              {isScanning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Scannen...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Start Scan
                </>
              )}
            </Button>

            {scanComplete && (
              <div className="flex items-center gap-2">
                {duplicateGroups.length > 0 ? (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {duplicateGroups.length} groepen, {totalDuplicates} duplicaten
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1 text-green-600 border-green-600">
                    <CheckCircle className="h-3 w-3" />
                    Geen duplicaten gevonden
                  </Badge>
                )}
              </div>
            )}
          </div>

          {isLoading && (
            <div className="space-y-2">
              <Progress value={50} className="w-full" />
              <p className="text-sm text-muted-foreground">Producten laden...</p>
            </div>
          )}
        </CardContent>
      </Card>

      {duplicateGroups.length > 0 && (
        <>
          <div className="flex items-center gap-4">
            <Badge variant="outline">
              {selectedDuplicates.size} geselecteerd
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleAction("deactivate")}
              disabled={selectedDuplicates.size === 0 || deactivateMutation.isPending}
            >
              <EyeOff className="h-4 w-4 mr-2" />
              Deactiveren
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => handleAction("delete")}
              disabled={selectedDuplicates.size === 0 || deleteMutation.isPending}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Verwijderen
            </Button>
          </div>

          {duplicateGroups.map((group) => (
            <Card key={group.key}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{group.reason}</Badge>
                    <span className="text-sm text-muted-foreground">
                      {group.products.length} producten
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => selectAllExceptFirst(group)}
                  >
                    Selecteer duplicaten
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead className="w-16">Afbeelding</TableHead>
                      <TableHead>Naam</TableHead>
                      <TableHead className="w-24">Prijs</TableHead>
                      <TableHead className="w-24">Status</TableHead>
                      <TableHead className="w-32">Aangemaakt</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.products
                      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                      .map((product, idx) => (
                        <TableRow 
                          key={product.id}
                          className={idx === 0 ? "bg-green-50 dark:bg-green-950/20" : ""}
                        >
                          <TableCell>
                            <Checkbox
                              checked={selectedDuplicates.has(product.id)}
                              onCheckedChange={() => toggleSelect(product.id)}
                            />
                          </TableCell>
                          <TableCell>
                            {product.image_url ? (
                              <img
                                src={product.image_url}
                                alt={product.name}
                                className="w-12 h-12 object-cover rounded"
                                loading="lazy"
                              />
                            ) : (
                              <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                                <Eye className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium line-clamp-2">{product.name}</span>
                              {idx === 0 && (
                                <Badge variant="outline" className="w-fit mt-1 text-xs text-green-600 border-green-600">
                                  Origineel
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>€{product.price.toFixed(2)}</TableCell>
                          <TableCell>
                            <Badge variant={product.is_active ? "default" : "secondary"}>
                              {product.is_active ? "Actief" : "Inactief"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(product.created_at).toLocaleDateString("nl-NL")}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionType === "deactivate" ? "Producten Deactiveren" : "Producten Verwijderen"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionType === "deactivate" 
                ? `Weet je zeker dat je ${selectedDuplicates.size} product(en) wilt deactiveren? Ze worden niet meer getoond in de webshop.`
                : `Weet je zeker dat je ${selectedDuplicates.size} product(en) permanent wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmAction}
              className={actionType === "delete" ? "bg-destructive hover:bg-destructive/90" : ""}
            >
              {actionType === "deactivate" ? "Deactiveren" : "Verwijderen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default DuplicateProductsDetector;
