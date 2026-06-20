import { Badge } from "@/components/ui/badge";
import { resolveWarehouse, type WarehouseProduct } from "@/lib/warehouse-availability";

/**
 * Inline badge driven by the canonical warehouse resolver.
 * Never renders "Out Of Stock" while any warehouse > 0.
 */
export default function InventorySourceBadge({ product }: { product: WarehouseProduct }) {
  const r = resolveWarehouse(product);
  if (r.source === "US") {
    return (
      <div className="flex gap-1 flex-wrap">
        <Badge variant="default">In Stock</Badge>
        <Badge variant="secondary">Fast Shipping</Badge>
      </div>
    );
  }
  if (r.source === "EU") return <Badge variant="secondary">EU Warehouse</Badge>;
  if (r.source === "CN") {
    return (
      <div className="flex gap-1 flex-wrap">
        <Badge variant="secondary">Available</Badge>
        <Badge variant="outline">Worldwide Shipping</Badge>
      </div>
    );
  }
  return <Badge variant="destructive">Sold Out</Badge>;
}