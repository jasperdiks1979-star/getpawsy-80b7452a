import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Package,
  Plus,
  History,
  AlertTriangle,
  RefreshCw,
  TrendingDown,
  Mail,
  Loader2,
  CloudDownload,
  Link,
  Save,
  Settings,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  usePackagingInventory,
  usePackagingInventoryLogs,
  useUpdateInventory,
  getInventoryStatus,
  PackagingInventoryItem,
} from "@/hooks/usePackagingInventory";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";

const itemTypeLabels: Record<string, string> = {
  logo_sticker: "Logo Sticker (5cm)",
  thank_you_card: "Bedankkaart",
  poly_mailer_small: "Poly Mailer Small",
  poly_mailer_medium: "Poly Mailer Medium",
};

export const InventoryTracker = () => {
  const { data: inventory, isLoading, refetch } = usePackagingInventory();
  const { data: logs } = usePackagingInventoryLogs(20);
  const updateInventory = useUpdateInventory();
  
  const [selectedItem, setSelectedItem] = useState<PackagingInventoryItem | null>(null);
  const [adjustmentType, setAdjustmentType] = useState<"restock" | "manual_adjustment">("restock");
  const [adjustmentAmount, setAdjustmentAmount] = useState<number>(100);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isSendingTestAlert, setIsSendingTestAlert] = useState(false);
  const [isSyncingCJ, setIsSyncingCJ] = useState(false);
  const [cjConfigOpen, setCjConfigOpen] = useState(false);
  const [cjProductIds, setCjProductIds] = useState<Record<string, string>>({});
  const [isSavingCjIds, setIsSavingCjIds] = useState(false);

  // Initialize CJ product IDs from inventory data
  const initializeCjIds = () => {
    if (inventory) {
      const ids: Record<string, string> = {};
      inventory.forEach((item) => {
        ids[item.id] = (item as PackagingInventoryItem & { cj_product_id?: string }).cj_product_id || "";
      });
      setCjProductIds(ids);
    }
  };

  const handleSaveCjProductIds = async () => {
    setIsSavingCjIds(true);
    try {
      const updates = Object.entries(cjProductIds).map(([id, cjId]) =>
        supabase
          .from("packaging_inventory")
          .update({ cj_product_id: cjId || null })
          .eq("id", id)
      );
      
      await Promise.all(updates);
      
      toast.success("CJ Product IDs opgeslagen");
      refetch();
      setCjConfigOpen(false);
    } catch (error) {
      console.error("Error saving CJ IDs:", error);
      toast.error("Kon CJ IDs niet opslaan");
    } finally {
      setIsSavingCjIds(false);
    }
  };

  const handleSyncWithCJ = async () => {
    setIsSyncingCJ(true);
    try {
      const { data, error } = await supabase.functions.invoke("cj-sync-packaging-stock");
      
      if (error) throw error;
      
      if (data?.success) {
        const syncedCount = data.results?.filter((r: { synced: boolean }) => r.synced).length || 0;
        if (syncedCount > 0) {
          const discrepancyMsg = data.discrepancies > 0 
            ? ` (${data.discrepancies} afwijkingen${data.emailSent ? " - email verzonden" : ""})`
            : "";
          toast.success(`Voorraad gesynchroniseerd met CJ`, {
            description: `${syncedCount} items bijgewerkt${discrepancyMsg}`,
          });
          refetch();
        } else {
          toast.info("Geen CJ producten geconfigureerd", {
            description: data.note || "Configureer eerst CJ product IDs voor je verpakkingsmaterialen",
          });
        }
      } else {
        throw new Error(data?.error || "Sync failed");
      }
    } catch (error) {
      console.error("Error syncing with CJ:", error);
      toast.error("CJ sync mislukt", {
        description: error instanceof Error ? error.message : "Onbekende fout",
      });
    } finally {
      setIsSyncingCJ(false);
    }
  };

  // Helper to check if item has CJ product ID configured
  const hasCjProductId = (item: PackagingInventoryItem): boolean => {
    return !!(item as PackagingInventoryItem & { cj_product_id?: string }).cj_product_id;
  };

  const handleSendTestAlert = async () => {
    setIsSendingTestAlert(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-packaging-alert");
      
      if (error) throw error;
      
      if (data?.sent) {
        toast.success(`Test alert verzonden voor ${data.itemsAlerted} item(s)`, {
          description: data.items?.join(", "),
        });
      } else {
        toast.info(data?.message || "Geen items om te melden", {
          description: "Alle voorraad is boven het herbestelniveau of er is al een alert verstuurd vandaag.",
        });
      }
    } catch (error) {
      console.error("Error sending test alert:", error);
      toast.error("Kon test alert niet verzenden", {
        description: error instanceof Error ? error.message : "Onbekende fout",
      });
    } finally {
      setIsSendingTestAlert(false);
    }
  };

  const handleAdjustInventory = async () => {
    if (!selectedItem) return;

    await updateInventory.mutateAsync({
      itemType: selectedItem.item_type,
      quantity: adjustmentAmount,
      changeType: adjustmentType,
    });

    setDialogOpen(false);
    setAdjustmentAmount(100);
  };

  const lowStockItems = inventory?.filter((item) => {
    const status = getInventoryStatus(item.quantity, item.reorder_threshold);
    return status.status !== "ok";
  }) || [];

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6 flex items-center justify-center">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Low Stock Alert */}
      {lowStockItems.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Voorraad Waarschuwing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {lowStockItems.map((item) => {
                const status = getInventoryStatus(item.quantity, item.reorder_threshold);
                return (
                  <Badge
                    key={item.id}
                    variant={status.status === "critical" ? "destructive" : "secondary"}
                  >
                    {itemTypeLabels[item.item_type]}: {item.quantity} stuks ({status.label})
                  </Badge>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Inventory Overview */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                Voorraad Overzicht
              </CardTitle>
              <CardDescription>
                Beheer je packaging voorraad en bijhouden op basis van bestellingen
              </CardDescription>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Dialog open={cjConfigOpen} onOpenChange={(open) => {
                setCjConfigOpen(open);
                if (open) initializeCjIds();
              }}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Settings className="w-4 h-4 mr-2" />
                    CJ Product IDs
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Link className="w-5 h-5" />
                      CJ Product IDs Configureren
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <p className="text-sm text-muted-foreground">
                      Vul de CJ Dropshipping product IDs in voor elk verpakkingsmateriaal om automatische voorraadsynchronisatie te activeren.
                    </p>
                    {inventory?.map((item) => (
                      <div key={item.id} className="space-y-1">
                        <Label className="text-sm">
                          {itemTypeLabels[item.item_type] || item.item_name}
                        </Label>
                        <Input
                          placeholder="bijv. 1OE8100030384"
                          value={cjProductIds[item.id] || ""}
                          onChange={(e) => setCjProductIds({
                            ...cjProductIds,
                            [item.id]: e.target.value.trim(),
                          })}
                        />
                      </div>
                    ))}
                    <div className="p-3 bg-muted rounded-lg text-xs text-muted-foreground space-y-1">
                      <p className="font-medium">Waar vind ik CJ Product IDs?</p>
                      <p>1. Maak custom producten aan in je CJ Dropshipping account</p>
                      <p>2. Kopieer de Product ID uit de product details</p>
                      <p>3. Plak hier om voorraad sync te activeren</p>
                    </div>
                  </div>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline">Annuleren</Button>
                    </DialogClose>
                    <Button onClick={handleSaveCjProductIds} disabled={isSavingCjIds}>
                      {isSavingCjIds ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4 mr-2" />
                      )}
                      Opslaan
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleSyncWithCJ}
                disabled={isSyncingCJ}
              >
                {isSyncingCJ ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <CloudDownload className="w-4 h-4 mr-2" />
                )}
                Sync CJ Voorraad
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleSendTestAlert}
                disabled={isSendingTestAlert}
              >
                {isSendingTestAlert ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Mail className="w-4 h-4 mr-2" />
                )}
                Test Alert
              </Button>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Vernieuwen
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {inventory?.map((item) => {
              const status = getInventoryStatus(item.quantity, item.reorder_threshold);
              const progressPercent = Math.min(
                100,
                (item.quantity / (item.reorder_threshold * 2)) * 100
              );

              return (
                <div
                  key={item.id}
                  className="flex items-center gap-4 p-4 border rounded-lg"
                >
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {itemTypeLabels[item.item_type] || item.item_name}
                        </span>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              {hasCjProductId(item) ? (
                                <CheckCircle2 className="w-4 h-4 text-green-500" />
                              ) : (
                                <XCircle className="w-4 h-4 text-muted-foreground" />
                              )}
                            </TooltipTrigger>
                            <TooltipContent>
                              {hasCjProductId(item) 
                                ? "CJ sync actief" 
                                : "Geen CJ product ID - sync niet actief"}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <Badge
                        variant={
                          status.status === "critical"
                            ? "destructive"
                            : status.status === "low"
                            ? "secondary"
                            : "outline"
                        }
                      >
                        {status.label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4">
                      <Progress
                        value={progressPercent}
                        className={`h-2 flex-1 ${
                          status.status === "critical"
                            ? "[&>div]:bg-destructive"
                            : status.status === "low"
                            ? "[&>div]:bg-amber-500"
                            : ""
                        }`}
                      />
                      <span className="text-sm font-medium min-w-[80px] text-right">
                        {item.quantity} stuks
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        Bijbestellen bij: {item.reorder_threshold} stuks
                      </span>
                      {item.last_restocked_at && (
                        <span>
                          Laatst aangevuld:{" "}
                          {format(new Date(item.last_restocked_at), "d MMM yyyy", {
                            locale: nl,
                          })}
                        </span>
                      )}
                    </div>
                  </div>

                  <Dialog open={dialogOpen && selectedItem?.id === item.id} onOpenChange={(open) => {
                    setDialogOpen(open);
                    if (open) setSelectedItem(item);
                  }}>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedItem(item)}
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Aanpassen
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>
                          Voorraad Aanpassen:{" "}
                          {itemTypeLabels[item.item_type]}
                        </DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label>Type aanpassing</Label>
                          <Select
                            value={adjustmentType}
                            onValueChange={(v) =>
                              setAdjustmentType(v as "restock" | "manual_adjustment")
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="restock">
                                <span className="flex items-center gap-2">
                                  <Plus className="w-4 h-4" />
                                  Aanvullen (toevoegen)
                                </span>
                              </SelectItem>
                              <SelectItem value="manual_adjustment">
                                <span className="flex items-center gap-2">
                                  <RefreshCw className="w-4 h-4" />
                                  Correctie (instellen op)
                                </span>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>
                            {adjustmentType === "restock"
                              ? "Aantal toevoegen"
                              : "Nieuwe voorraad"}
                          </Label>
                          <Input
                            type="number"
                            min={0}
                            value={adjustmentAmount}
                            onChange={(e) =>
                              setAdjustmentAmount(parseInt(e.target.value) || 0)
                            }
                          />
                        </div>
                        <div className="p-3 bg-muted rounded-lg text-sm">
                          <p className="text-muted-foreground">
                            Huidige voorraad:{" "}
                            <strong>{item.quantity}</strong> stuks
                          </p>
                          <p className="text-muted-foreground">
                            Na aanpassing:{" "}
                            <strong>
                              {adjustmentType === "restock"
                                ? item.quantity + adjustmentAmount
                                : adjustmentAmount}
                            </strong>{" "}
                            stuks
                          </p>
                        </div>
                      </div>
                      <DialogFooter>
                        <DialogClose asChild>
                          <Button variant="outline">Annuleren</Button>
                        </DialogClose>
                        <Button
                          onClick={handleAdjustInventory}
                          disabled={updateInventory.isPending}
                        >
                          {updateInventory.isPending ? (
                            <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                          ) : null}
                          Opslaan
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            Recente Activiteit
          </CardTitle>
        </CardHeader>
        <CardContent>
          {logs && logs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Wijziging</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(log.created_at), "d MMM HH:mm", {
                        locale: nl,
                      })}
                    </TableCell>
                    <TableCell>
                      {itemTypeLabels[log.item_type] || log.item_type}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {log.change_type === "restock"
                          ? "Aangevuld"
                          : log.change_type === "order_deduction"
                          ? "Bestelling"
                          : "Correctie"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={
                          log.change_amount > 0
                            ? "text-green-600"
                            : "text-destructive"
                        }
                      >
                        {log.change_amount > 0 ? "+" : ""}
                        {log.change_amount}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <TrendingDown className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Nog geen voorraadwijzigingen gelogd</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default InventoryTracker;
