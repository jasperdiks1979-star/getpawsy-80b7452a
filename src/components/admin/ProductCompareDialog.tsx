import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Trash2 } from "lucide-react";
import { calculateSellingPrice } from "@/lib/pricing";

interface CJProduct {
  pid: string;
  productNameEn: string;
  productImage: string;
  productWeight: number;
  categoryName: string;
  sellPrice: number;
  productSku: string;
  description?: string;
}

interface ProductCompareDialogProps {
  products: CJProduct[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemoveProduct: (pid: string) => void;
  onClearAll: () => void;
}

export const ProductCompareDialog = ({
  products,
  open,
  onOpenChange,
  onRemoveProduct,
  onClearAll,
}: ProductCompareDialogProps) => {
  if (products.length === 0) return null;

  const comparisonFields = [
    { 
      label: "Afbeelding", 
      render: (p: CJProduct) => (
        <img src={p.productImage} alt={p.productNameEn} className="w-full h-32 object-cover rounded-lg" />
      )
    },
    { 
      label: "Naam", 
      render: (p: CJProduct) => (
        <span className="text-sm font-medium line-clamp-3">{p.productNameEn}</span>
      )
    },
    { 
      label: "Categorie", 
      render: (p: CJProduct) => (
        <Badge variant="outline" className="text-xs">{p.categoryName}</Badge>
      )
    },
    { 
      label: "Gewicht", 
      render: (p: CJProduct) => {
        const weight = typeof p.productWeight === 'string' 
          ? parseFloat(String(p.productWeight).split('-')[0]) 
          : Number(p.productWeight);
        return <span className="text-sm">{weight > 0 ? `${weight}g` : "N/A"}</span>;
      }
    },
    { 
      label: "Kostprijs", 
      render: (p: CJProduct) => {
        const cost = typeof p.sellPrice === 'string' 
          ? parseFloat(String(p.sellPrice).split('-')[0]) 
          : Number(p.sellPrice);
        return <span className="text-sm font-medium">${cost.toFixed(2)}</span>;
      }
    },
    { 
      label: "Verkoopprijs", 
      render: (p: CJProduct) => {
        const cost = typeof p.sellPrice === 'string' 
          ? parseFloat(String(p.sellPrice).split('-')[0]) 
          : Number(p.sellPrice);
        const weight = typeof p.productWeight === 'string' 
          ? parseFloat(String(p.productWeight).split('-')[0]) 
          : Number(p.productWeight) || 200;
        const pricing = calculateSellingPrice(cost, weight);
        return <span className="text-sm font-bold text-primary">${pricing.sellingPrice.toFixed(2)}</span>;
      }
    },
    { 
      label: "Totale Kost", 
      render: (p: CJProduct) => {
        const cost = typeof p.sellPrice === 'string' 
          ? parseFloat(String(p.sellPrice).split('-')[0]) 
          : Number(p.sellPrice);
        const weight = typeof p.productWeight === 'string' 
          ? parseFloat(String(p.productWeight).split('-')[0]) 
          : Number(p.productWeight) || 200;
        const pricing = calculateSellingPrice(cost, weight);
        return <span className="text-sm">${pricing.totalCost.toFixed(2)}</span>;
      }
    },
    { 
      label: "Markup", 
      render: (p: CJProduct) => {
        const cost = typeof p.sellPrice === 'string' 
          ? parseFloat(String(p.sellPrice).split('-')[0]) 
          : Number(p.sellPrice);
        const weight = typeof p.productWeight === 'string' 
          ? parseFloat(String(p.productWeight).split('-')[0]) 
          : Number(p.productWeight) || 200;
        const pricing = calculateSellingPrice(cost, weight);
        return <Badge variant="secondary" className="text-xs">{pricing.multiplier.toFixed(1)}x</Badge>;
      }
    },
    { 
      label: "Marge", 
      render: (p: CJProduct) => {
        const cost = typeof p.sellPrice === 'string' 
          ? parseFloat(String(p.sellPrice).split('-')[0]) 
          : Number(p.sellPrice);
        const weight = typeof p.productWeight === 'string' 
          ? parseFloat(String(p.productWeight).split('-')[0]) 
          : Number(p.productWeight) || 200;
        const pricing = calculateSellingPrice(cost, weight);
        const margin = pricing.sellingPrice - pricing.totalCost;
        const marginPercent = pricing.totalCost > 0 ? (margin / pricing.sellingPrice * 100) : 0;
        return (
          <div className="text-sm">
            <span className="font-medium text-green-600">${margin.toFixed(2)}</span>
            <span className="text-muted-foreground ml-1">({marginPercent.toFixed(0)}%)</span>
          </div>
        );
      }
    },
    { 
      label: "SKU", 
      render: (p: CJProduct) => (
        <span className="text-xs text-muted-foreground font-mono">{p.productSku || "N/A"}</span>
      )
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Product Vergelijking ({products.length})</span>
            <Button variant="ghost" size="sm" onClick={onClearAll}>
              <Trash2 className="w-4 h-4 mr-1" />
              Wis alles
            </Button>
          </DialogTitle>
          <DialogDescription>
            Vergelijk tot 4 producten naast elkaar om de beste keuze te maken.
          </DialogDescription>
        </DialogHeader>
        
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(90vh-120px)]">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="text-left p-2 border-b font-medium text-sm text-muted-foreground w-32 sticky left-0 bg-background">
                  Eigenschap
                </th>
                {products.map((product) => (
                  <th key={product.pid} className="p-2 border-b min-w-[180px]">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 absolute top-1 right-1"
                      onClick={() => onRemoveProduct(product.pid)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparisonFields.map((field) => (
                <tr key={field.label} className="border-b hover:bg-muted/50">
                  <td className="p-3 font-medium text-sm text-muted-foreground sticky left-0 bg-background">
                    {field.label}
                  </td>
                  {products.map((product) => (
                    <td key={product.pid} className="p-3 text-center align-middle">
                      {field.render(product)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
};
