import { Box, Info } from "lucide-react";
import { buildProductEvidence, shopperSpecRows, type EvidenceProductInput } from "@/lib/product-evidence";

interface VerifiedSpecsProps {
  product: EvidenceProductInput & { category?: string | null };
  inStock: boolean;
}

/**
 * Specifications block — VERIFIED facts only.
 *
 * Every row traces back to a source we hold (the supplier variant payload or
 * the supplier's own specification list). Fields with no source are omitted
 * and named in a short limitation note, so a shopper is never shown an
 * invented dimension, material or weight limit. The previous generic
 * "Premium quality materials / Safe for all pets" list and the dog-harness
 * size chart were unsupported claims and are gone.
 */
export const VerifiedSpecs = ({ product, inStock }: VerifiedSpecsProps) => {
  const evidence = buildProductEvidence(product);
  const rows = shopperSpecRows(evidence);
  const missing = evidence.unknownKeys.filter((k) =>
    ["product_dimensions", "materials", "capacity", "assembly", "included_items"].includes(k),
  );

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="font-display font-semibold text-lg text-foreground flex items-center gap-2">
          <Box className="w-5 h-5 text-primary" />
          Product details
        </h3>
        <div className="space-y-3">
          {product.category && (
            <div className="flex justify-between items-center gap-4 py-2 border-b border-border/50">
              <span className="text-muted-foreground">Category</span>
              <span className="font-medium text-foreground text-right">{product.category}</span>
            </div>
          )}
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between items-start gap-4 py-2 border-b border-border/50">
              <span className="text-muted-foreground shrink-0">{row.label}</span>
              <span className="font-medium text-foreground text-right">{row.value}</span>
            </div>
          ))}
          <div className="flex justify-between items-center gap-4 py-2 border-b border-border/50">
            <span className="text-muted-foreground">Availability</span>
            <span className={`font-medium ${inStock ? "text-success" : "text-destructive"}`}>
              {inStock ? "In stock" : "Out of stock"}
            </span>
          </div>
          <div className="flex justify-between items-center gap-4 py-2 border-b border-border/50">
            <span className="text-muted-foreground">Sold by</span>
            <span className="font-medium text-foreground">GetPawsy</span>
          </div>
        </div>
      </div>

      {missing.length > 0 && (
        <div className="flex gap-2 text-sm text-muted-foreground bg-secondary/30 rounded-xl p-4">
          <Info className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
          <p>
            We only publish specifications the manufacturer documents. Not documented for this item:{" "}
            {missing
              .map((k) => evidence.byKey[k].label.toLowerCase())
              .join(", ")}
            . Ask us before ordering if one of these matters and we will check with the manufacturer.
          </p>
        </div>
      )}
    </div>
  );
};

export default VerifiedSpecs;
