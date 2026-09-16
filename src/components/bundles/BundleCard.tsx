import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";
import {
  buildBundleCartLines,
  findOption,
  initialSelection,
  missingSelections,
  type BundleComponent,
  type BundleDefinition,
  type BundleSelection,
} from "@/lib/bundles";
import { variantLabel } from "@/lib/quickAdd";

interface BundleCardProps {
  definition: BundleDefinition;
  components: BundleComponent[];
}

/**
 * A set is only addable once every multi-option component has an explicit,
 * in-stock choice. Sold-out options render disabled and cannot be picked, and
 * there is no "first option" fallback anywhere in this component.
 */
export const BundleCard = ({ definition, components }: BundleCardProps) => {
  const { addItem } = useCart();
  const [selection, setSelection] = useState<BundleSelection>(() => initialSelection(components));

  const missing = useMemo(() => missingSelections(components, selection), [components, selection]);
  const result = useMemo(() => buildBundleCartLines(components, selection), [components, selection]);
  const total = result.ok ? result.total : null;

  const handleAdd = () => {
    const lines = buildBundleCartLines(components, selection);
    if (!lines.ok) {
      toast.error("Choose an option for every item in this set first.");
      return;
    }
    for (const line of lines.lines) {
      const { quantity: _quantity, ...item } = line;
      addItem(item);
    }
    toast.success(`${definition.name} added to your cart`);
  };

  return (
    <article className="rounded-2xl border border-border bg-card p-6 space-y-5">
      <header className="space-y-2">
        <h2 className="font-display text-xl font-semibold text-foreground">{definition.name}</h2>
        <p className="text-muted-foreground text-sm">{definition.intro}</p>
      </header>

      <ul className="space-y-5">
        {components.map((component) => {
          const chosen = selection[component.product.id] ?? null;
          const chosenOption = findOption(component, chosen);
          return (
            <li key={component.product.id} className="flex gap-4">
              <img
                src={chosenOption?.variantImage || component.product.image_url || "/placeholder.svg"}
                alt={component.product.name}
                loading="lazy"
                className="w-20 h-20 rounded-xl object-cover border border-border/60 shrink-0"
              />
              <div className="min-w-0 space-y-2">
                <Link
                  to={`/products/${component.product.slug}`}
                  className="text-sm font-medium text-foreground hover:text-primary line-clamp-2"
                >
                  {component.product.name}
                </Link>

                {component.requiresSelection ? (
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">
                      {chosenOption ? "Option selected" : "Choose an option"}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {component.allOptions.map((option) => {
                        const vid = String(option.vid ?? "");
                        const selectable = component.options.some((o) => String(o.vid) === vid);
                        const isSelected = chosen === vid && selectable;
                        return (
                          <button
                            key={vid || variantLabel(option)}
                            type="button"
                            disabled={!selectable}
                            aria-pressed={isSelected}
                            onClick={() =>
                              setSelection((prev) => ({ ...prev, [component.product.id]: vid }))
                            }
                            className={`px-3 py-1.5 rounded-lg border text-xs transition-colors ${
                              isSelected
                                ? "border-primary bg-primary/10 text-foreground"
                                : selectable
                                  ? "border-border hover:border-primary/60 text-foreground"
                                  : "border-border/50 text-muted-foreground line-through cursor-not-allowed"
                            }`}
                          >
                            {variantLabel(option) || "Option"}
                            {!selectable && " — sold out"}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Check className="w-3.5 h-3.5 text-primary" />
                    {chosenOption && variantLabel(chosenOption)
                      ? `${variantLabel(chosenOption)} — the only option`
                      : "One option only"}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <footer className="space-y-3 pt-2 border-t border-border/60">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">
            {total === null ? "Total after you choose" : "Total"}
          </span>
          <span className="font-display text-lg font-semibold text-foreground">
            {total === null ? "—" : `$${total.toFixed(2)}`}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Each item is charged at its normal price — a set is a shortcut, not a discount.
        </p>
        <Button className="w-full" onClick={handleAdd} disabled={missing.length > 0}>
          <ShoppingCart className="w-4 h-4 mr-2" />
          {missing.length > 0 ? "Choose your options" : "Add set to cart"}
        </Button>
      </footer>
    </article>
  );
};

export default BundleCard;
