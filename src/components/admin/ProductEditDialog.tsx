import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Save, Sparkles } from "lucide-react";
import { ProductImageManager } from "./ProductImageManager";
import { Tables } from "@/integrations/supabase/types";

interface ProductEditDialogProps {
  product: Tables<"products"> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ProductEditDialog = ({
  product,
  open,
  onOpenChange,
}: ProductEditDialogProps) => {
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: 0,
    compare_at_price: 0,
    cost_price: 0,
    stock: 0,
    is_active: true,
    image_url: "",
    images: [] as string[],
  });

  // Reset form when product changes
  useEffect(() => {
    if (product) {
      setFormData({
        name: product.name || "",
        description: product.description || "",
        price: product.price || 0,
        compare_at_price: product.compare_at_price || 0,
        cost_price: product.cost_price || 0,
        stock: product.stock || 0,
        is_active: product.is_active ?? true,
        image_url: product.image_url || "",
        images: (product.images as string[]) || [],
      });
    }
  }, [product]);

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (!product) throw new Error("No product selected");

      const { error } = await supabase
        .from("products")
        .update({
          name: data.name,
          description: data.description,
          price: data.price,
          compare_at_price: data.compare_at_price,
          cost_price: data.cost_price,
          stock: data.stock,
          is_active: data.is_active,
          image_url: data.image_url,
          images: data.images,
          updated_at: new Date().toISOString(),
        })
        .eq("id", product.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Product updated successfully");
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(`Failed to update: ${error.message}`);
    },
  });

  // AI SEO Text Generator
  const generateSeoMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("generate-seo-text", {
        body: {
          productName: formData.name,
          category: product?.category || "",
          currentDescription: formData.description,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      if (data?.description) {
        setFormData((prev) => ({ ...prev, description: data.description }));
        toast.success("SEO text generated!");
      }
    },
    onError: (error) => {
      toast.error(`Generation failed: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  const handleImagesChange = (newImages: string[]) => {
    setFormData((prev) => ({ ...prev, images: newImages }));
  };

  const handleMainImageChange = (url: string) => {
    setFormData((prev) => ({ ...prev, image_url: url }));
  };

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Product</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label htmlFor="name">Product Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                required
              />
            </div>

            <div className="md:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <Label htmlFor="description">Description</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => generateSeoMutation.mutate()}
                  disabled={generateSeoMutation.isPending || !formData.name}
                  className="h-7 text-xs"
                >
                  {generateSeoMutation.isPending ? (
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3 mr-1" />
                  )}
                  Generate SEO Text
                </Button>
              </div>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, description: e.target.value }))
                }
                rows={6}
                placeholder="Product description..."
              />
            </div>
          </div>

          {/* Pricing */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="price">Price ($)</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0"
                value={formData.price}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    price: parseFloat(e.target.value) || 0,
                  }))
                }
                required
              />
            </div>
            <div>
              <Label htmlFor="compare_at_price">Compare at Price ($)</Label>
              <Input
                id="compare_at_price"
                type="number"
                step="0.01"
                min="0"
                value={formData.compare_at_price}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    compare_at_price: parseFloat(e.target.value) || 0,
                  }))
                }
              />
            </div>
            <div>
              <Label htmlFor="cost_price">Cost Price ($)</Label>
              <Input
                id="cost_price"
                type="number"
                step="0.01"
                min="0"
                value={formData.cost_price}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    cost_price: parseFloat(e.target.value) || 0,
                  }))
                }
              />
            </div>
          </div>

          {/* Stock & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
            <div>
              <Label htmlFor="stock">Stock Quantity</Label>
              <Input
                id="stock"
                type="number"
                min="0"
                value={formData.stock}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    stock: parseInt(e.target.value) || 0,
                  }))
                }
              />
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <Label htmlFor="is_active" className="cursor-pointer">
                Product Active
              </Label>
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev, is_active: checked }))
                }
              />
            </div>
          </div>

          {/* Images */}
          <ProductImageManager
            images={formData.images}
            onChange={handleImagesChange}
            mainImage={formData.image_url}
            onMainImageChange={handleMainImageChange}
          />

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save Changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
