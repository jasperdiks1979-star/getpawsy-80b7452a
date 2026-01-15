import { Link } from 'react-router-dom';
import { ShoppingCart, Heart } from 'lucide-react';
import { useCart } from '@/contexts/CartContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export interface Product {
  id: string;
  cj_product_id?: string | null;
  name: string;
  description?: string | null;
  category?: string | null;
  image_url?: string | null;
  images?: string[] | null;
  price: number;
  cost_price?: number | null;
  compare_at_price?: number | null;
  sku?: string | null;
  variants?: unknown;
  stock?: number | null;
  is_active?: boolean | null;
  weight?: number | null;
  shipping_time?: string | null;
  supplier_name?: string | null;
  created_at: string;
  updated_at: string;
}

interface ProductCardProps {
  product: Product;
}

export const ProductCard = ({ product }: ProductCardProps) => {
  const { addItem } = useCart();

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    addItem({
      id: product.id,
      name: product.name,
      price: Number(product.price),
      image: product.image_url || '/placeholder.svg',
    });
    toast.success(`${product.name} added to cart!`);
  };

  const discount = product.compare_at_price
    ? Math.round((1 - Number(product.price) / Number(product.compare_at_price)) * 100)
    : null;

  return (
    <Link to={`/product/${product.id}`} className="group">
      <div className="relative bg-card rounded-xl overflow-hidden shadow-card transition-all duration-300 hover:shadow-card-hover hover:-translate-y-1">
        {/* Image */}
        <div className="relative aspect-square overflow-hidden bg-muted">
          <img
            src={product.image_url || '/placeholder.svg'}
            alt={product.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
          
          {/* Badges */}
          <div className="absolute top-3 left-3 flex flex-col gap-2">
            {discount && discount > 0 && (
              <Badge className="bg-destructive text-destructive-foreground">
                -{discount}%
              </Badge>
            )}
          </div>

          {/* Quick Actions - hidden on mobile to prevent double-tap */}
          <div className="absolute top-3 right-3 hidden md:block opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="secondary"
              size="icon"
              className="rounded-full bg-background/80 backdrop-blur-sm hover:bg-background"
              onClick={(e) => {
                e.preventDefault();
                toast.info('Added to wishlist!');
              }}
            >
              <Heart className="w-4 h-4" />
            </Button>
          </div>

          {/* Add to Cart Button - hidden on mobile to prevent double-tap */}
          <div className="absolute bottom-0 left-0 right-0 p-3 hidden md:block translate-y-full group-hover:translate-y-0 transition-transform duration-300">
            <Button
              className="w-full gap-2"
              onClick={handleAddToCart}
            >
              <ShoppingCart className="w-4 h-4" />
              Add to Cart
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          {product.category && (
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
              {product.category}
            </p>
          )}
          <h3 className="font-semibold text-foreground line-clamp-2 group-hover:text-primary transition-colors">
            {product.name}
          </h3>

          {/* Price */}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-lg font-bold text-primary">
              ${Number(product.price).toFixed(2)}
            </span>
            {product.compare_at_price && (
              <span className="text-sm text-muted-foreground line-through">
                ${Number(product.compare_at_price).toFixed(2)}
              </span>
            )}
          </div>

          {/* Mobile Add to Cart Button */}
          <Button
            className="w-full gap-2 mt-3 md:hidden"
            size="sm"
            onClick={handleAddToCart}
          >
            <ShoppingCart className="w-4 h-4" />
            Toevoegen
          </Button>

          {/* Stock indicator */}
          {product.stock !== null && product.stock !== undefined && product.stock < 10 && product.stock > 0 && (
            <p className="text-xs text-orange-600 mt-2">
              Only {product.stock} left in stock
            </p>
          )}
          {product.stock === 0 && (
            <p className="text-xs text-destructive mt-2">Out of Stock</p>
          )}
        </div>
      </div>
    </Link>
  );
};
