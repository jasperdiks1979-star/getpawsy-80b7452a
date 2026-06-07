import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { dedupeProducts } from '@/lib/dedupe-products';

interface ProductPublic {
  id: string | null;
  name: string | null;
  description: string | null;
  price: number | null;
  compare_at_price: number | null;
  image_url: string | null;
  images: string[] | null;
  category: string | null;
  stock: number | null;
  is_active: boolean | null;
  variants: unknown;
}

interface UseCompleteTheLookOptions {
  productId: string;
  productName: string;
  category: string | null;
  maxItems?: number;
  enabled?: boolean;
}

// Define complementary product relationships
const COMPLEMENTARY_MAP: Record<string, { types: string[]; keywords: string[] }> = {
  // Beds & Sleeping
  bed: { 
    types: ['blanket', 'pillow', 'mat', 'cushion'],
    keywords: ['cozy', 'warm', 'soft', 'sleep']
  },
  blanket: { 
    types: ['bed', 'pillow', 'cushion'],
    keywords: ['warm', 'cozy']
  },
  
  // Collars & Walking
  collar: { 
    types: ['leash', 'harness', 'tag', 'bow'],
    keywords: ['walk', 'outdoor', 'safety']
  },
  leash: { 
    types: ['collar', 'harness', 'poop bag', 'treat pouch'],
    keywords: ['walk', 'outdoor', 'training']
  },
  harness: { 
    types: ['leash', 'collar', 'safety'],
    keywords: ['walk', 'outdoor', 'control']
  },
  
  // Food & Feeding
  food: { 
    types: ['bowl', 'feeder', 'treat', 'mat', 'storage'],
    keywords: ['feeding', 'nutrition', 'meal']
  },
  bowl: { 
    types: ['mat', 'feeder', 'food', 'stand'],
    keywords: ['feeding', 'water', 'meal']
  },
  feeder: { 
    types: ['bowl', 'mat', 'food', 'water fountain'],
    keywords: ['automatic', 'feeding']
  },
  treat: { 
    types: ['toy', 'training', 'pouch', 'dispenser'],
    keywords: ['reward', 'training', 'snack']
  },
  
  // Toys & Play
  toy: { 
    types: ['treat', 'ball', 'rope', 'puzzle'],
    keywords: ['play', 'interactive', 'fun']
  },
  ball: { 
    types: ['toy', 'rope', 'launcher', 'treat'],
    keywords: ['fetch', 'play', 'outdoor']
  },
  
  // Grooming
  brush: { 
    types: ['shampoo', 'comb', 'nail clipper', 'towel'],
    keywords: ['grooming', 'care', 'coat']
  },
  shampoo: { 
    types: ['brush', 'towel', 'conditioner', 'dryer'],
    keywords: ['bath', 'clean', 'coat']
  },
  
  // Travel & Carriers
  carrier: { 
    types: ['blanket', 'mat', 'water bottle', 'bowl'],
    keywords: ['travel', 'transport', 'portable']
  },
  crate: { 
    types: ['bed', 'mat', 'blanket', 'bowl'],
    keywords: ['training', 'home', 'safe']
  },
  
  // Cat specific
  scratcher: { 
    types: ['tree', 'toy', 'catnip', 'post'],
    keywords: ['scratch', 'play', 'climb']
  },
  tree: { 
    types: ['scratcher', 'toy', 'hammock', 'bed'],
    keywords: ['climb', 'play', 'perch']
  },
  litter: { 
    types: ['scoop', 'mat', 'deodorizer', 'box'],
    keywords: ['hygiene', 'clean']
  },
  
  // Fish & Aquarium
  aquarium: { 
    types: ['filter', 'heater', 'light', 'decoration', 'plant'],
    keywords: ['tank', 'fish', 'water']
  },
  filter: { 
    types: ['pump', 'media', 'tubing'],
    keywords: ['clean', 'water', 'aquarium']
  },
  
  // Small pets
  cage: { 
    types: ['bedding', 'wheel', 'bottle', 'house', 'toy'],
    keywords: ['habitat', 'home']
  },
  wheel: { 
    types: ['cage', 'toy', 'tunnel'],
    keywords: ['exercise', 'run', 'hamster']
  },
};

// Extract pet type from category or product name
const extractPetType = (category: string | null, productName: string): string | null => {
  const petTypes = ['dog', 'cat', 'bird', 'fish', 'hamster', 'guinea pig', 'rabbit', 'reptile'];
  const searchText = `${category || ''} ${productName}`.toLowerCase();
  
  for (const pet of petTypes) {
    if (searchText.includes(pet)) {
      return pet;
    }
  }
  return null;
};

// Extract product type from product name
const extractProductType = (productName: string): string | null => {
  const name = productName.toLowerCase();
  
  for (const productType of Object.keys(COMPLEMENTARY_MAP)) {
    if (name.includes(productType)) {
      return productType;
    }
  }
  
  // Check for common variations
  const variations: Record<string, string> = {
    'beds': 'bed',
    'toys': 'toy',
    'bowls': 'bowl',
    'collars': 'collar',
    'leashes': 'leash',
    'brushes': 'brush',
    'treats': 'treat',
    'feeders': 'feeder',
    'carriers': 'carrier',
    'scratchers': 'scratcher',
  };
  
  for (const [variation, type] of Object.entries(variations)) {
    if (name.includes(variation)) {
      return type;
    }
  }
  
  return null;
};

export const useCompleteTheLook = ({
  productId,
  productName,
  category,
  maxItems = 4,
  enabled = true,
}: UseCompleteTheLookOptions) => {
  const productType = useMemo(() => extractProductType(productName), [productName]);
  const petType = useMemo(() => extractPetType(category, productName), [category, productName]);
  
  const complementaryConfig = productType ? COMPLEMENTARY_MAP[productType] : null;

  return useQuery({
    queryKey: ['complete-the-look', productId, productType, petType, maxItems],
    queryFn: async (): Promise<ProductPublic[]> => {
      if (!complementaryConfig) return [];
      
      const { types, keywords } = complementaryConfig;
      
      // Fetch candidate products - optimized query
      const { data: products, error } = await supabase
        .from('products_public')
        .select('id, name, description, price, compare_at_price, image_url, images, category, stock, is_active, variants')
        .eq('is_active', true)
        .gt('stock', 0)
        .neq('id', productId)
        .limit(50); // Reduced from 100 for better performance
      
      if (error) throw error;
      if (!products || products.length === 0) return [];
      
      // Score products based on complementary match
      const scoredProducts = products
        .map(product => {
          let score = 0;
          const name = (product.name || '').toLowerCase();
          const productCategory = (product.category || '').toLowerCase();
          
          // Check for complementary type matches
          for (const type of types) {
            if (name.includes(type) || productCategory.includes(type)) {
              score += 30;
              break; // Only count once
            }
          }
          
          // Check for keyword matches
          for (const keyword of keywords) {
            if (name.includes(keyword)) {
              score += 10;
              break; // Only count once
            }
          }
          
          // Bonus for same pet type
          if (petType) {
            if (productCategory.includes(petType) || name.includes(petType)) {
              score += 25;
            }
          }
          
          // Small bonus for being in a related category
          if (category && productCategory && productCategory !== category.toLowerCase()) {
            score += 5;
          }
          
          return { product, score };
        })
        .filter(({ score }) => score >= 30)
        .sort((a, b) => b.score - a.score)
        .slice(0, maxItems)
        .map(({ product }) => product as ProductPublic);
      
      return dedupeProducts(scoredProducts);
    },
    enabled: enabled && !!productId && !!complementaryConfig,
    staleTime: 10 * 60 * 1000, // Increased to 10 minutes
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
  });
};

export { extractProductType, extractPetType, COMPLEMENTARY_MAP };
