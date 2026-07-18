import { useMemo } from 'react';
import { FREE_SHIPPING_THRESHOLD, RETURN_WINDOW_DAYS } from '@/lib/shipping-constants';
import { getProductContentOverride } from '@/config/product-content-overrides';

interface ProductSpecsTableProps {
  product: {
    id?: string;
    name: string;
    category?: string | null;
    weight?: number | null;
    sku?: string | null;
  };
}

type ProductType = 'bed' | 'harness' | 'carrier' | 'cat tree' | 'litter box' | 'toy' | 'grooming' | 'default';

function detectType(name: string, category: string): ProductType {
  const c = `${name} ${category}`.toLowerCase();
  if (/cat\s*tree|cat\s*condo|cat\s*tower|scratching/i.test(c)) return 'cat tree';
  if (/litter\s*box|self[\s-]*clean|automatic\s*litter/i.test(c)) return 'litter box';
  if (c.includes('bed') || c.includes('cushion') || c.includes('pillow')) return 'bed';
  if (c.includes('harness') || c.includes('collar') || c.includes('leash')) return 'harness';
  if (c.includes('carrier') || c.includes('crate') || c.includes('bag')) return 'carrier';
  if (c.includes('toy') || c.includes('ball') || c.includes('chew')) return 'toy';
  if (c.includes('brush') || c.includes('groom') || c.includes('comb')) return 'grooming';
  return 'default';
}

interface SpecRow {
  label: string;
  value: string;
}

function getTypeSpecs(type: ProductType): SpecRow[] {
  switch (type) {
    case 'bed':
      return [
        { label: 'Material', value: 'Premium polyester with memory foam fill' },
        { label: 'Suitable For', value: 'Dogs & cats — small to extra-large breeds' },
        { label: 'Care Instructions', value: 'Removable cover machine-washable, air dry' },
      ];
    case 'harness':
      return [
        { label: 'Material', value: 'Breathable nylon mesh with padded lining' },
        { label: 'Suitable For', value: 'Dogs — adjustable sizing for most breeds' },
        { label: 'Care Instructions', value: 'Hand wash, air dry' },
      ];
    case 'carrier':
      return [
        { label: 'Material', value: 'Oxford fabric with steel frame' },
        { label: 'Suitable For', value: 'Small to medium pets (under 20 lbs)' },
        { label: 'Care Instructions', value: 'Wipe clean with damp cloth' },
      ];
    case 'cat tree':
      return [
        { label: 'Material', value: 'Engineered wood, natural sisal rope, plush fabric' },
        { label: 'Suitable For', value: 'Cats up to 25+ lbs, multi-cat households' },
        { label: 'Care Instructions', value: 'Vacuum platforms, replace sisal when worn' },
      ];
    case 'litter box':
      return [
        { label: 'Material', value: 'BPA-free ABS plastic with carbon filter' },
        { label: 'Suitable For', value: 'Cats over 5 lbs' },
        { label: 'Care Instructions', value: 'Empty weekly, deep clean monthly' },
      ];
    case 'toy':
      return [
        { label: 'Material', value: 'Non-toxic rubber / natural cotton blend' },
        { label: 'Suitable For', value: 'Dogs & cats of all sizes' },
        { label: 'Care Instructions', value: 'Rinse with water, machine washable' },
      ];
    case 'grooming':
      return [
        { label: 'Material', value: 'Stainless steel bristles with ABS handle' },
        { label: 'Suitable For', value: 'All coat types — short, medium, and long hair' },
        { label: 'Care Instructions', value: 'Retract bristles, wipe clean after use' },
      ];
    default:
      return [
        { label: 'Material', value: 'Premium pet-safe materials' },
        { label: 'Suitable For', value: 'Dogs & cats — see size chart for fit' },
        { label: 'Care Instructions', value: 'See product packaging for details' },
      ];
  }
}

export function ProductSpecsTable({ product }: ProductSpecsTableProps) {
  const specs = useMemo(() => {
    const override = getProductContentOverride(product.id);
    if (override?.specs && override.specs.length > 0) {
      const rows = [...override.specs];
      if (product.weight && product.weight > 0) {
        rows.push({ label: 'Product Weight', value: `${Number(product.weight).toFixed(2)} lbs` });
      }
      rows.push(
        { label: 'Shipping', value: `Free shipping on eligible orders over $${FREE_SHIPPING_THRESHOLD}` },
        { label: 'Returns', value: `${RETURN_WINDOW_DAYS}-day return policy` },
      );
      return rows;
    }

    const type = detectType(product.name, product.category || '');
    const typeSpecs = getTypeSpecs(type);

    const rows: SpecRow[] = [];

    // Category
    if (product.category) {
      rows.push({ label: 'Category', value: product.category });
    }

    // Type-specific specs
    rows.push(...typeSpecs);

    // Weight from DB
    if (product.weight && product.weight > 0) {
      rows.push({ label: 'Product Weight', value: `${Number(product.weight).toFixed(2)} lbs` });
    }

    // Universal specs
    rows.push(
      { label: 'Brand', value: 'GetPawsy' },
      { label: 'Shipping', value: `Free shipping on eligible orders over $${FREE_SHIPPING_THRESHOLD}` },
      { label: 'Returns', value: `${RETURN_WINDOW_DAYS}-day return policy` },
    );

    return rows;
  }, [product.id, product.name, product.category, product.weight]);

  return (
    <section className="mt-12">
      <h2 className="text-xl md:text-2xl font-display font-bold text-foreground mb-6">
        Product Specifications
      </h2>
      <div className="overflow-x-auto border rounded-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left p-3 font-semibold text-foreground w-1/3">Specification</th>
              <th className="text-left p-3 font-semibold text-foreground">Details</th>
            </tr>
          </thead>
          <tbody>
            {specs.map((row, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-card' : 'bg-muted/20'}>
                <td className="p-3 font-medium text-foreground">{row.label}</td>
                <td className="p-3 text-muted-foreground">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
