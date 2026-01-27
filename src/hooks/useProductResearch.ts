import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ProductData {
  name: string | null;
  price: number | null;
  currency: string | null;
  description: string | null;
  images: string[];
  specifications: Record<string, string>;
  category: string | null;
  rating: number | null;
  reviewCount: number | null;
  availability: string | null;
  brand: string | null;
  sku: string | null;
}

export interface ProductResearchResult {
  success: boolean;
  data?: ProductData;
  rawMarkdown?: string;
  error?: string;
}

export function useProductResearch() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ProductResearchResult | null>(null);
  const { toast } = useToast();

  const researchProduct = async (url: string) => {
    if (!url.trim()) {
      toast({
        title: 'URL vereist',
        description: 'Voer een product URL in om te onderzoeken.',
        variant: 'destructive',
      });
      return null;
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      toast({
        title: 'Ongeldige URL',
        description: 'Voer een geldige URL in (inclusief https://).',
        variant: 'destructive',
      });
      return null;
    }

    setIsLoading(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('product-research', {
        body: { url },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to research product');
      }

      setResult(data);
      toast({
        title: 'Product gevonden',
        description: data.data?.name 
          ? `"${data.data.name}" succesvol opgehaald.`
          : 'Productinformatie succesvol opgehaald.',
      });

      return data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Onbekende fout';
      setResult({ success: false, error: errorMessage });
      toast({
        title: 'Onderzoek mislukt',
        description: errorMessage,
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const clearResult = () => {
    setResult(null);
  };

  return {
    isLoading,
    result,
    researchProduct,
    clearResult,
  };
}
