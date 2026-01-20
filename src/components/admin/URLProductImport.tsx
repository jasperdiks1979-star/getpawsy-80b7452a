import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthenticatedFetch } from "@/hooks/useAuthenticatedFetch";
import { Button } from "@/components/ui/button";

import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { 
  Link, 
  Plus, 
  Trash2, 
  Download, 
  Loader2, 
  Check, 
  X, 
  Package,
  AlertCircle,
  RefreshCw
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { calculateSellingPrice } from "@/lib/pricing";

interface URLEntry {
  id: string;
  url: string;
  productId: string | null;
  status: "pending" | "loading" | "found" | "error" | "imported" | "exists";
  productData?: CJProductData;
  error?: string;
}

interface CJProductData {
  pid: string;
  productNameEn: string;
  productImage: string;
  productWeight: number;
  categoryName: string;
  sellPrice: number;
  productSku: string;
  description?: string;
  images?: string[];
  variants?: CJVariant[];
  totalStock?: number;
}

interface CJVariant {
  vid: string;
  pid: string;
  variantNameEn: string;
  variantSku: string;
  variantImage?: string;
  variantKey: string;
  variantWeight: number;
  variantSellPrice: number;
}

interface CategoryWithParent {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
}

// Category mapping: keywords to database category slugs
// Extensive keyword list for accurate automatic categorization
const CATEGORY_KEYWORD_MAP: Record<string, string[]> = {
  // ============ CAT-SPECIFIC CATEGORIES ============
  'cat-trees-and-condos': [
    'cat tree', 'scratching tower', 'climbing tower', 'cat tower', 'cat condo', 'sisal', 
    'cat perch', 'cat furniture', 'multi-level', 'cat activity', 'climbing frame', 'cat gym',
    'cat playground', 'cat climbing', 'cat post', 'kitty tower', 'feline tower', 'cat castle',
    'cat platform', 'cat shelf', 'wall mounted cat', 'cat bridge', 'cat walkway', 'cat jungle gym',
    'cat activity center', 'cat play tower', 'cat exercise', 'vertical cat', 'tall cat tree'
  ],
  'cat-scratching-posts': [
    'scratching post', 'scratcher', 'scratching board', 'sisal post', 'cardboard scratcher', 
    'scratch pad', 'scratching mat', 'cat scratch', 'scratch lounge', 'corrugated', 'scratch box',
    'claw sharpener', 'nail scratch', 'sisal rope', 'jute scratcher', 'carpet scratcher',
    'wall scratcher', 'floor scratcher', 'angled scratcher', 'horizontal scratcher', 'vertical scratcher'
  ],
  'cat-litter-boxes': [
    'litter box', 'litter tray', 'cat toilet', 'litter scoop', 'litter mat', 'self-cleaning litter', 
    'automatic litter', 'covered litter', 'hooded litter', 'litter pan', 'cat sand', 'kitty litter',
    'enclosed litter', 'top entry litter', 'front entry litter', 'litter cabinet', 'litter furniture',
    'litter deodorizer', 'litter liner', 'litter disposal', 'poop scoop', 'waste box', 'sandbox cat'
  ],
  
  // ============ BIRD-SPECIFIC CATEGORIES ============
  'bird-supplies': [
    'bird', 'parrot', 'parakeet', 'budgie', 'cockatiel', 'canary', 'finch', 'lovebird', 'aviary',
    'macaw', 'cockatoo', 'conure', 'african grey', 'amazon parrot', 'pionus', 'eclectus',
    'mynah', 'toucan', 'lorikeet', 'caique', 'quaker', 'ringneck', 'sun conure'
  ],
  'bird-cages': [
    'bird cage', 'parrot cage', 'aviary', 'flight cage', 'breeding cage', 'birdcage', 'bird house',
    'canary cage', 'finch cage', 'parakeet cage', 'cockatiel cage', 'travel cage bird', 
    'bird enclosure', 'wire cage bird', 'bamboo cage', 'decorative cage', 'hanging cage bird'
  ],
  'bird-feeders': [
    'bird feeder', 'seed feeder', 'bird water', 'bird bath', 'bird bowl', 'nectar feeder',
    'bird dish', 'cuttlebone', 'mineral block', 'fruit holder bird', 'veggie clip', 'treat holder bird',
    'automatic bird feeder', 'bird water bottle', 'seed cup', 'food cup bird'
  ],
  'bird-toys': [
    'bird toy', 'parrot toy', 'bird swing', 'bird ladder', 'bird perch', 'bird bell', 'bird mirror',
    'foraging toy bird', 'shredding toy', 'chewing toy bird', 'rope toy bird', 'wooden toy bird',
    'acrylic toy bird', 'bird playground', 'bird gym', 'training perch', 'claw toy bird'
  ],
  
  // ============ SMALL ANIMALS CATEGORIES ============
  'small-animal-supplies': [
    'hamster', 'guinea pig', 'rabbit', 'bunny', 'gerbil', 'chinchilla', 'ferret', 'hedgehog',
    'mouse', 'rat', 'sugar glider', 'degu', 'prairie dog', 'squirrel', 'small animal', 'rodent',
    'hamster wheel', 'exercise wheel', 'running wheel', 'hamster ball', 'hamster cage', 'rabbit hutch',
    'guinea pig cage', 'hay feeder', 'timothy hay', 'water bottle small', 'hideout small animal'
  ],
  
  // ============ FISH & AQUARIUM CATEGORIES ============
  'fish-aquarium': [
    'aquarium', 'fish tank', 'fish bowl', 'aquatic', 'underwater', 'fish food', 'fish net',
    'fish tank filter', 'aquarium pump', 'air pump', 'aquarium heater', 'tank thermometer',
    'aquarium light', 'led aquarium', 'gravel', 'substrate', 'aquarium decoration', 'fish cave',
    'aquarium plant', 'artificial coral', 'fish breeding', 'betta', 'goldfish', 'tropical fish'
  ],
  
  // ============ PET FURNITURE SUBCATEGORIES ============
  'pet-beds': [
    'pet bed', 'dog bed', 'cat bed', 'sleeping bed', 'orthopedic bed', 'donut bed', 'calming bed', 
    'bolster bed', 'memory foam bed', 'waterproof bed', 'washable bed', 'plush bed', 'soft bed',
    'round bed', 'rectangle bed', 'oval bed', 'luxury bed', 'heated bed', 'cooling bed', 'raised bed',
    'outdoor bed', 'travel bed', 'portable bed', 'sofa bed pet', 'cozy bed', 'fluffy bed',
    'anti-anxiety bed', 'faux fur bed', 'fleece bed', 'self-warming bed', 'nesting bed'
  ],
  'pet-hammocks': [
    'hammock', 'hanging bed', 'window perch', 'radiator bed', 'suspended bed', 'cat hammock',
    'window hammock', 'suction cup bed', 'cage hammock', 'hanging perch', 'swing bed',
    'wall mounted bed', 'shelf bed', 'aerial bed', 'elevated hammock', 'mesh hammock'
  ],
  'pet-houses': [
    'pet house', 'dog house', 'cat house', 'kennel', 'indoor house', 'outdoor house', 'wooden house',
    'plastic house', 'igloo house', 'cottage', 'villa pet', 'tent pet', 'teepee', 'cabin pet',
    'shelter pet', 'den pet', 'hut pet', 'lodge pet', 'chalet', 'insulated house', 'weatherproof house'
  ],
  'pet-nests': [
    'nest', 'cave', 'igloo', 'cozy nest', 'snuggle', 'cuddle', 'enclosed bed', 'hooded bed',
    'cat cave', 'dog cave', 'burrow bed', 'cocoon bed', 'pod bed', 'covered bed', 'tent bed',
    'hut bed', 'felt cave', 'wool cave', 'dome bed', 'hideaway', 'retreat bed'
  ],
  
  // ============ GENERAL PET CATEGORIES ============
  'pet-furniture': [
    'furniture', 'sofa', 'couch', 'cushion', 'pillow', 'mat', 'blanket', 'elevated bed', 'cooling mat',
    'pet stairs', 'pet steps', 'pet ramp', 'pet sofa', 'pet couch', 'pet chair', 'pet ottoman',
    'pet bench', 'storage bench pet', 'window sill', 'crate mat', 'kennel pad'
  ],
  'pet-beds-mats': [
    'bed', 'mat', 'blanket', 'cushion', 'mattress', 'sleeping pad', 'foam bed', 'floor mat',
    'crate pad', 'kennel mat', 'throw blanket', 'fleece blanket', 'sherpa blanket', 'thermal mat',
    'self-heating mat', 'electric mat', 'cooling pad', 'gel mat', 'pressure mat'
  ],
  'pet-toys': [
    'toy', 'toys', 'ball', 'chew', 'squeaky', 'plush', 'rope', 'frisbee', 'fetch', 'puzzle', 
    'interactive', 'teaser', 'wand', 'kong', 'play', 'squeak', 'tug', 'rubber toy', 'latex toy',
    'tennis ball', 'bouncy ball', 'treat ball', 'snuffle', 'hide and seek', 'stuffed toy', 'soft toy',
    'durable toy', 'tough toy', 'indestructible', 'aggressive chewer', 'puppy toy', 'kitten toy',
    'catnip', 'feather toy', 'laser pointer', 'mouse toy', 'fish toy', 'bird toy', 'tunnel toy',
    'crinkle toy', 'kickeroo', 'dental toy', 'chew ring', 'bone toy', 'stick toy', 'flying disc'
  ],
  'pet-collars-leashes': [
    'collar', 'leash', 'harness', 'lead', 'chain', 'tag', 'retractable', 'reflective', 'glow', 'led', 
    'nylon', 'leather', 'adjustable', 'breakaway', 'martingale', 'choke chain', 'prong collar',
    'gentle leader', 'head halter', 'no pull', 'front clip', 'back clip', 'step-in harness',
    'vest harness', 'mesh harness', 'padded harness', 'training leash', 'long line', 'check cord',
    'slip lead', 'rope leash', 'hands free leash', 'waist leash', 'double leash', 'coupler leash',
    'bungee leash', 'traffic handle', 'short leash', 'personalized collar', 'embroidered collar',
    'studded collar', 'bowtie collar', 'bandana collar', 'flea collar', 'calming collar', 'e-collar',
    'bark collar', 'spray collar', 'citronella collar', 'shock collar', 'vibration collar'
  ],
  'pet-grooming': [
    'brush', 'comb', 'grooming', 'shampoo', 'nail', 'clipper', 'trimmer', 'bath', 'deshedding', 
    'dematting', 'slicker', 'rake', 'scissors', 'grooming glove', 'rubber brush', 'bristle brush',
    'pin brush', 'undercoat rake', 'flea comb', 'tick comb', 'detangling comb', 'wide tooth comb',
    'thinning shears', 'blending shears', 'straight scissors', 'curved scissors', 'grooming table',
    'grooming arm', 'grooming loop', 'ear cleaner', 'eye wipes', 'dental spray', 'breath freshener',
    'paw balm', 'nose balm', 'hot spot spray', 'medicated shampoo', 'oatmeal shampoo', 'whitening shampoo'
  ],
  'pet-hair-care': [
    'fur', 'hair', 'shedding', 'coat', 'detangler', 'conditioner', 'dryer', 'hair remover', 'lint roller',
    'deshedding tool', 'undercoat brush', 'furminator', 'shed control', 'hair vacuum', 'pet dryer',
    'force dryer', 'stand dryer', 'grooming spray', 'shine spray', 'coat oil', 'leave-in conditioner',
    'anti-static spray', 'deodorizing spray', 'perfume pet', 'cologne pet', 'finishing spray'
  ],
  'pet-bags': [
    'carrier', 'bag', 'backpack', 'transport', 'travel', 'sling', 'airline', 'pet purse', 'tote',
    'soft carrier', 'hard carrier', 'rolling carrier', 'expandable carrier', 'mesh carrier',
    'bubble backpack', 'front carrier', 'chest carrier', 'shoulder bag pet', 'crossbody carrier',
    'bicycle carrier', 'motorcycle carrier', 'car seat carrier', 'booster seat', 'car hammock',
    'cargo liner', 'seat cover pet', 'travel crate', 'portable kennel', 'foldable carrier'
  ],
  'pet-strollers': [
    'stroller', 'pram', 'pushchair', 'pet cart', 'jogging stroller', 'travel stroller',
    'double stroller pet', 'twin stroller', 'all terrain stroller', 'heavy duty stroller',
    'lightweight stroller', 'foldable stroller', 'pet wagon', 'pet buggy', 'pet pram'
  ],
  'pet-bowls': [
    'bowl', 'dish', 'plate', 'slow feeder', 'elevated bowl', 'tilted bowl', 'anti-slip bowl',
    'stainless steel bowl', 'ceramic bowl', 'plastic bowl', 'silicone bowl', 'collapsible bowl',
    'travel bowl', 'portable bowl', 'double bowl', 'twin bowl', 'raised bowl', 'adjustable bowl',
    'spill proof bowl', 'no tip bowl', 'weighted bowl', 'puzzle bowl', 'lick mat', 'snuffle bowl'
  ],
  'pet-feeding-tools': [
    'feeder', 'automatic feeder', 'food dispenser', 'portion control', 'timer feeder', 'gravity feeder', 
    'smart feeder', 'wifi feeder', 'app controlled feeder', 'programmable feeder', 'microchip feeder',
    'multi-pet feeder', 'cat food dispenser', 'dog food dispenser', 'treat dispenser', 'kibble dispenser',
    'food storage', 'food container', 'airtight container', 'food scoop', 'measuring scoop'
  ],
  'pet-drinking-tools': [
    'water', 'fountain', 'dispenser', 'water bottle', 'drinking', 'hydration', 'water bowl', 'filter fountain',
    'pet fountain', 'cat fountain', 'dog fountain', 'automatic water', 'gravity water', 'filtered water',
    'stainless fountain', 'ceramic fountain', 'quiet fountain', 'running water', 'circulating water',
    'water filter', 'replacement filter', 'carbon filter', 'charcoal filter', 'pump fountain'
  ],
  'pet-food-treats': [
    'food', 'treat', 'treats', 'snack', 'kibble', 'wet food', 'dry food', 'biscuit', 'chew treat', 
    'dental treat', 'training treat', 'freeze dried', 'dehydrated', 'raw food', 'grain free',
    'organic food', 'natural food', 'premium food', 'prescription diet', 'sensitive stomach',
    'weight management', 'senior food', 'puppy food', 'kitten food', 'jerky', 'meat stick',
    'rawhide', 'bully stick', 'antler', 'bone treat', 'dental chew', 'greenies', 'milk bone'
  ],
  'pet-training': [
    'training', 'clicker', 'whistle', 'treat pouch', 'target', 'agility', 'tunnel', 'jump', 'weave', 
    'hurdle', 'potty', 'puppy pad', 'pee pad', 'training pad', 'wee wee pad', 'house training',
    'crate training', 'bell training', 'door bell', 'potty bell', 'training spray', 'attractant spray',
    'repellent spray', 'bitter spray', 'anti chew spray', 'training collar', 'training harness',
    'training vest', 'training dummy', 'fetch training', 'retrieve training', 'obedience', 'behavior'
  ],
  'pet-gates-fences': [
    'gate', 'fence', 'barrier', 'playpen', 'pen', 'enclosure', 'baby gate', 'pet door', 'flap',
    'exercise pen', 'x-pen', 'wire pen', 'plastic pen', 'wooden gate', 'metal gate', 'pressure mount',
    'hardware mount', 'freestanding gate', 'retractable gate', 'mesh gate', 'extra wide gate',
    'extra tall gate', 'walk through gate', 'swing gate', 'sliding gate', 'outdoor pen', 'indoor pen',
    'puppy pen', 'kitten pen', 'pet fence', 'wireless fence', 'invisible fence', 'containment system'
  ],
  'dog-stairs-and-steps': [
    'stairs', 'steps', 'ramp', 'ladder', 'pet stairs', 'dog ramp', 'car ramp', 'bed stairs',
    'couch stairs', 'sofa stairs', 'folding ramp', 'telescoping ramp', 'portable ramp', 'lightweight ramp',
    'non-slip stairs', 'foam stairs', 'wooden stairs', 'plastic stairs', 'carpeted stairs',
    'adjustable stairs', 'wide stairs', 'deep stairs', 'senior pet stairs', 'arthritic pet'
  ],
  'pet-accessories': [
    'id tag', 'charm', 'pendant', 'bell', 'camera', 'gps', 'tracker', 'monitor', 'bandana', 'bow tie', 
    'hat', 'glasses', 'jewelry', 'pet camera', 'wifi camera', 'treat camera', 'pet monitor',
    'activity tracker', 'fitness tracker', 'health monitor', 'location tracker', 'smart collar',
    'airtag holder', 'tile holder', 'costume', 'outfit', 'dress', 'sweater', 'jacket', 'coat',
    'raincoat', 'winter coat', 'booties', 'shoes', 'socks', 'paw protector', 'life jacket', 'float coat'
  ],
  'pet-clothing': [
    'sweater', 'jacket', 'coat', 'hoodie', 'shirt', 't-shirt', 'dress', 'costume', 'outfit',
    'raincoat', 'winter coat', 'puffer jacket', 'fleece jacket', 'windbreaker', 'reflective vest',
    'cooling vest', 'anxiety vest', 'thundershirt', 'recovery suit', 'surgical suit', 'onesie',
    'pajamas', 'sleepwear', 'warm clothes', 'cold weather', 'snow suit', 'ski suit'
  ],
  'pet-health': [
    'supplement', 'vitamin', 'probiotic', 'joint support', 'glucosamine', 'omega', 'fish oil',
    'calming', 'anxiety relief', 'stress relief', 'flea', 'tick', 'worm', 'dewormer', 'heartworm',
    'first aid', 'bandage', 'wound care', 'antiseptic', 'thermometer', 'pill dispenser', 'syringe',
    'medicine dropper', 'recovery', 'rehabilitation', 'mobility aid', 'wheelchair', 'leg brace',
    'cone', 'e-collar', 'inflatable collar', 'recovery collar', 'elizabethan collar'
  ],
  'pet-cleaning': [
    'poop bag', 'waste bag', 'biodegradable bag', 'bag dispenser', 'pooper scooper', 'waste scoop',
    'urine cleaner', 'stain remover', 'odor eliminator', 'enzyme cleaner', 'carpet cleaner',
    'floor cleaner', 'cage cleaner', 'habitat cleaner', 'litter deodorizer', 'air freshener pet',
    'pet wipes', 'grooming wipes', 'ear wipes', 'eye wipes', 'paw wipes', 'dental wipes'
  ],
  'pet-supplies': [
    'supplies', 'accessory', 'pet', 'dog', 'cat', 'puppy', 'kitten', 'essential', 'starter kit',
    'new pet', 'adoption', 'welcome kit', 'gift set', 'bundle', 'package deal'
  ], // Fallback category
};

// Match result with full details
interface CategoryMatchResult {
  categoryName: string;
  categorySlug: string;
  score: number;
  matchedKeywords: string[];
  isFallback: boolean;
}

// Match product name to the best database category with full details
function matchProductToCategoryWithDetails(productName: string, cjCategoryName: string, availableCategories: CategoryWithParent[]): CategoryMatchResult {
  const lowerName = productName.toLowerCase();
  const lowerCjCategory = cjCategoryName.toLowerCase();
  
  // Create a map of slug to category for quick lookup
  const categoryBySlug = new Map(availableCategories.map(c => [c.slug, c]));
  
  // Score each category based on keyword matches
  const scores: { slug: string; score: number; matchedKeywords: string[] }[] = [];
  
  for (const [slug, keywords] of Object.entries(CATEGORY_KEYWORD_MAP)) {
    // Skip if category doesn't exist in database
    if (!categoryBySlug.has(slug)) continue;
    
    let score = 0;
    const matchedKeywords: string[] = [];
    
    for (const keyword of keywords) {
      const lowerKeyword = keyword.toLowerCase();
      
      // Check product name (higher weight)
      if (lowerName.includes(lowerKeyword)) {
        // Longer keyword matches are more specific, so give them more points
        score += lowerKeyword.length * 2;
        matchedKeywords.push(keyword);
      }
      
      // Check CJ category name (lower weight)
      if (lowerCjCategory.includes(lowerKeyword)) {
        score += lowerKeyword.length;
        if (!matchedKeywords.includes(keyword)) {
          matchedKeywords.push(keyword);
        }
      }
    }
    
    if (score > 0) {
      scores.push({ slug, score, matchedKeywords });
    }
  }
  
  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);
  
  // Return best match, or 'pet-supplies' as fallback
  if (scores.length > 0) {
    const bestMatch = scores[0];
    const category = categoryBySlug.get(bestMatch.slug)!;
    console.log(`Category match for "${productName}": ${bestMatch.slug} (score: ${bestMatch.score}, keywords: ${bestMatch.matchedKeywords.join(', ')})`);
    return {
      categoryName: category.name,
      categorySlug: category.slug,
      score: bestMatch.score,
      matchedKeywords: bestMatch.matchedKeywords,
      isFallback: false,
    };
  }
  
  // Fallback to CJ category or Pet Supplies
  const fallback = categoryBySlug.get('pet-supplies');
  console.log(`No match for "${productName}", using fallback: ${fallback?.name || cjCategoryName}`);
  return {
    categoryName: fallback?.name || cjCategoryName || 'Pet Supplies',
    categorySlug: fallback?.slug || 'pet-supplies',
    score: 0,
    matchedKeywords: [],
    isFallback: true,
  };
}

// Simple wrapper for backward compatibility
function matchProductToCategory(productName: string, cjCategoryName: string, availableCategories: CategoryWithParent[]): string {
  return matchProductToCategoryWithDetails(productName, cjCategoryName, availableCategories).categoryName;
}

// Extract product ID from CJ Dropshipping URL
function extractProductId(url: string): string | null {
  // Supported URL formats:
  // 1: https://cjdropshipping.com/product/xxx-p-PRODUCTID.html
  // 2: https://www.cjdropshipping.com/product/some-product-name-p-00000000000000000000.html
  // 3: Direct product ID (just the ID itself, 18-30 alphanumeric chars)
  // 4: Mobile app shared URLs with pid parameter
  // 5: URLs with numeric product IDs (19-20 digit numbers)
  // 6: UUID format product IDs (e.g., 956CEFCE-0470-4BE9-86FE-7FFDDD0C82AA)
  
  // Clean the URL
  const cleanUrl = url.trim();
  
  // Try to extract UUID first - this is the most reliable for UUID-based IDs
  // UUID format: 8-4-4-4-12 hexadecimal characters with hyphens
  const uuidRegex = /[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}/g;
  const uuidMatches = cleanUrl.match(uuidRegex);
  if (uuidMatches && uuidMatches.length > 0) {
    return uuidMatches[0];
  }
  
  // Check if it's already a product ID (numeric, 16-25 digits)
  if (/^\d{16,25}$/.test(cleanUrl)) {
    return cleanUrl;
  }
  
  // Check if it's already a product ID (alphanumeric, 18-30 chars)
  if (/^[A-Za-z0-9]{18,30}$/.test(cleanUrl)) {
    return cleanUrl;
  }
  
  // Pattern for CJ product URLs - try multiple formats
  const patterns = [
    // -p-PRODUCTID.html format (numeric)
    /-p-(\d{16,25})\.html/i,
    // p-PRODUCTID.html format
    /p-(\d{16,25})\.html/i,
    // pid query parameter (UUID or numeric)
    /pid=([A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12})/i,
    /pid=(\d{16,25})/i,
    // product_id query parameter
    /product_id=(\d{16,25})/i,
    // id query parameter
    /[?&]id=(\d{16,25})/i,
    // Alphanumeric product ID formats
    /-p-([A-Za-z0-9]{18,30})\.html/i,
    /p-([A-Za-z0-9]{18,30})\.html/i,
    /pid=([A-Za-z0-9]{18,30})/i,
    /product\/.*-([A-Za-z0-9]{18,30})\.html/i,
    // Numeric ID at the end before .html
    /-(\d{16,25})\.html/i,
    // Any long numeric string in the URL (fallback)
    /(\d{19,21})/,
    // Alphanumeric fallback
    /([A-Za-z0-9]{20,30})(?:\.html)?$/i,
  ];
  
  for (const pattern of patterns) {
    const match = cleanUrl.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
  return null;
}

export function URLProductImport() {
  const { invokeFunction } = useAuthenticatedFetch();
  const queryClient = useQueryClient();
  
  const [urlEntries, setUrlEntries] = useState<URLEntry[]>([]);
  const [bulkInput, setBulkInput] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("auto");
  const [importProgress, setImportProgress] = useState<{
    current: number;
    total: number;
    status: string;
  } | null>(null);

  // Fetch categories
  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch existing products to check for duplicates
  const { data: existingProducts } = useQuery({
    queryKey: ["admin-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("cj_product_id");
      if (error) throw error;
      return data;
    },
  });

  const importedCjIds = useMemo(() => {
    return new Set(existingProducts?.map(p => p.cj_product_id).filter(Boolean) || []);
  }, [existingProducts]);

  // Add URLs from bulk input
  const handleAddUrls = () => {
    const lines = bulkInput.split("\n").filter(line => line.trim());
    const newEntries: URLEntry[] = [];
    
    for (const line of lines) {
      const productId = extractProductId(line);
      
      // Check for duplicates in current list
      const exists = urlEntries.some(e => e.productId === productId || e.url === line.trim());
      if (exists) continue;
      
      // Check if already imported
      const alreadyImported = productId && importedCjIds.has(productId);
      
      newEntries.push({
        id: crypto.randomUUID(),
        url: line.trim(),
        productId,
        status: alreadyImported ? "exists" : (productId ? "pending" : "error"),
        error: productId ? (alreadyImported ? "Product al geïmporteerd" : undefined) : "Geen geldig product ID gevonden",
      });
    }
    
    setUrlEntries(prev => [...prev, ...newEntries]);
    setBulkInput("");
  };

  // Remove a single entry
  const removeEntry = (id: string) => {
    setUrlEntries(prev => prev.filter(e => e.id !== id));
  };

  // Clear all entries
  const clearAll = () => {
    setUrlEntries([]);
    setImportProgress(null);
  };

  // Fetch product details for all pending entries
  const fetchDetailsMutation = useMutation({
    mutationFn: async () => {
      const pendingEntries = urlEntries.filter(e => e.status === "pending" && e.productId);
      if (pendingEntries.length === 0) {
        throw new Error("Geen geldige producten om op te halen");
      }

      const productIds = pendingEntries.map(e => e.productId!);
      
      // Mark entries as loading
      setUrlEntries(prev => prev.map(e => 
        pendingEntries.find(p => p.id === e.id) 
          ? { ...e, status: "loading" as const } 
          : e
      ));

      const { data, error } = await invokeFunction<Array<{
        pid: string;
        success: boolean;
        data?: CJProductData;
        images?: string[];
        variants?: CJVariant[];
        totalStock?: number;
        error?: string;
      }>>("cj-dropshipping", {
        body: {
          action: "get-products-for-import",
          productIds,
        },
      });

      if (error) throw error;
      return data || [];
    },
    onSuccess: (results) => {
      setUrlEntries(prev => prev.map(entry => {
        if (entry.status !== "loading") return entry;
        
        const result = results.find(r => r.pid === entry.productId);
        if (!result) {
          return { ...entry, status: "error" as const, error: "Product niet gevonden in API response" };
        }
        
        if (!result.success) {
          return { ...entry, status: "error" as const, error: result.error || "Onbekende fout" };
        }
        
        return {
          ...entry,
          status: "found" as const,
          productData: {
            ...result.data!,
            images: result.images,
            variants: result.variants,
            totalStock: result.totalStock,
          },
        };
      }));
      
      toast.success("Productgegevens opgehaald");
    },
    onError: (error) => {
      setUrlEntries(prev => prev.map(e => 
        e.status === "loading" 
          ? { ...e, status: "error" as const, error: (error as Error).message } 
          : e
      ));
      toast.error(`Fout bij ophalen: ${(error as Error).message}`);
    },
  });

  // Generate SEO text for a product
  const generateSeoForProduct = async (productName: string, category: string) => {
    const { data, error } = await invokeFunction<{ description?: string }>("generate-seo-text", {
      body: { productName, category },
    });
    if (error) throw error;
    return data?.description || "";
  };

  // Import all found products
  const importMutation = useMutation({
    mutationFn: async () => {
      const productsToImport = urlEntries.filter(e => e.status === "found" && e.productData);
      if (productsToImport.length === 0) {
        throw new Error("Geen producten om te importeren");
      }

      const total = productsToImport.length;
      const imported: string[] = [];

      for (let i = 0; i < productsToImport.length; i++) {
        const entry = productsToImport[i];
        const p = entry.productData!;
        
        setImportProgress({
          current: i + 1,
          total,
          status: `Importeren ${i + 1}/${total}: ${p.productNameEn.substring(0, 40)}...`,
        });

        try {
          // Flatten and deduplicate images, filtering out empty/invalid URLs
          const rawImages = p.images || [p.productImage];
          const flattenDeep = (arr: unknown[]): string[] => {
            const result: string[] = [];
            for (const item of arr) {
              if (Array.isArray(item)) {
                result.push(...flattenDeep(item));
              } else if (typeof item === 'string' && item.trim() && item.startsWith('http') && !item.includes('undefined')) {
                result.push(item.trim());
              }
            }
            return result;
          };
          const allImages = [...new Set(flattenDeep(Array.isArray(rawImages) ? rawImages : [rawImages]))];
          
          // Ensure we have valid images, use productImage as fallback
          const validProductImage = p.productImage && p.productImage.trim() && p.productImage.startsWith('http') && !p.productImage.includes('undefined')
            ? p.productImage.trim()
            : null;
          
          // If productImage is valid and not in the array, add it to the front
          let images = allImages;
          if (validProductImage && !images.includes(validProductImage)) {
            images = [validProductImage, ...images];
          }
          
          // Use the first valid image as the main image_url
          const mainImageUrl = images.length > 0 ? images[0] : (validProductImage || '/placeholder.svg');
          
          const stock = p.totalStock ?? 100;

          // Determine category - use smart matching for auto mode
          const category = selectedCategory === "auto" 
            ? matchProductToCategory(p.productNameEn, p.categoryName || '', categories || [])
            : selectedCategory;
          let seoDescription = p.description || "";
          try {
            seoDescription = await generateSeoForProduct(p.productNameEn, category);
          } catch (err) {
            console.error("SEO generation failed for", p.productNameEn, err);
          }

          // Calculate pricing
          const parsedSellPrice = typeof p.sellPrice === 'string' 
            ? parseFloat(String(p.sellPrice).split('-')[0]) 
            : Number(p.sellPrice);
          const costPrice = isNaN(parsedSellPrice) ? 0 : parsedSellPrice;
          
          let parsedWeight: number;
          const weightStr = String(p.productWeight || '200');
          if (weightStr.includes('-')) {
            parsedWeight = parseFloat(weightStr.split('-')[0]) || 200;
          } else {
            parsedWeight = parseFloat(weightStr) || 200;
          }
          const weight = parsedWeight <= 0 ? 200 : parsedWeight;
          const pricing = calculateSellingPrice(costPrice, weight);

          // Process variants
          const processedVariants = p.variants ? p.variants.map((variant) => {
            const variantCostPrice = Number(variant.variantSellPrice) || costPrice;
            const variantWeight = Number(variant.variantWeight) || weight;
            const variantPricing = calculateSellingPrice(variantCostPrice, variantWeight);
            
            return {
              ...variant,
              variantCostPrice: variantCostPrice,
              variantSellPrice: variantPricing.sellingPrice,
            };
          }) : null;

          // Insert into database
          const { error: insertError } = await supabase
            .from("products")
            .insert({
              cj_product_id: p.pid,
              name: p.productNameEn,
              description: seoDescription,
              category: category,
              image_url: mainImageUrl,
              images: images,
              price: pricing.sellingPrice,
              cost_price: pricing.totalCost,
              compare_at_price: pricing.compareAtPrice,
              sku: p.productSku,
              weight: weight,
              stock: stock,
              variants: processedVariants,
              is_active: true,
              shipping_time: "7-15 werkdagen",
              supplier_name: "CJ Dropshipping",
            });

          if (insertError) throw insertError;
          
          imported.push(entry.id);
          
          // Mark as imported in state
          setUrlEntries(prev => prev.map(e => 
            e.id === entry.id ? { ...e, status: "imported" as const } : e
          ));
        } catch (err) {
          console.error("Import error for", p.productNameEn, err);
          setUrlEntries(prev => prev.map(e => 
            e.id === entry.id ? { ...e, status: "error" as const, error: (err as Error).message } : e
          ));
        }
      }

      return imported.length;
    },
    onSuccess: (count) => {
      setImportProgress(null);
      toast.success(`${count} producten succesvol geïmporteerd!`);
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    },
    onError: (error) => {
      setImportProgress(null);
      toast.error(`Import mislukt: ${(error as Error).message}`);
    },
  });

  const pendingCount = urlEntries.filter(e => e.status === "pending").length;
  const foundCount = urlEntries.filter(e => e.status === "found").length;
  const errorCount = urlEntries.filter(e => e.status === "error").length;
  const importedCount = urlEntries.filter(e => e.status === "imported").length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link className="w-5 h-5" />
            Producten Importeren via URL
          </CardTitle>
          <CardDescription>
            Plak CJ Dropshipping product-URL's of product-ID's om producten direct te importeren.
            Eén URL/ID per regel.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Bulk input */}
          <div>
            <Textarea
              placeholder={`Plak hier je CJ Dropshipping URL's of product-ID's, één per regel:

https://cjdropshipping.com/product/pet-toy-p-123456789012345678.html
1234567890123456789012
https://www.cjdropshipping.com/product/...`}
              value={bulkInput}
              onChange={(e) => setBulkInput(e.target.value)}
              rows={6}
              className="font-mono text-sm"
            />
          </div>

          {/* Category selection */}
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium mb-1.5 block">Categorie voor import</label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">🧠 Slim Automatisch (op basis van productnaam)</SelectItem>
                  {categories?.map((cat) => (
                    <SelectItem key={cat.id} value={cat.slug}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAddUrls} disabled={!bulkInput.trim()}>
              <Plus className="w-4 h-4 mr-2" />
              URL's Toevoegen
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* URL list */}
      {urlEntries.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                Product Lijst ({urlEntries.length})
              </CardTitle>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={clearAll}
                  disabled={fetchDetailsMutation.isPending || importMutation.isPending}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Alles Wissen
                </Button>
              </div>
            </div>
            
            {/* Status badges */}
            <div className="flex flex-wrap gap-2 mt-2">
              {pendingCount > 0 && (
                <Badge variant="outline">{pendingCount} wachtend</Badge>
              )}
              {foundCount > 0 && (
                <Badge variant="default" className="bg-green-600">{foundCount} gevonden</Badge>
              )}
              {importedCount > 0 && (
                <Badge variant="default" className="bg-blue-600">{importedCount} geïmporteerd</Badge>
              )}
              {errorCount > 0 && (
                <Badge variant="destructive">{errorCount} fouten</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {/* Category distribution summary */}
            {selectedCategory === "auto" && foundCount > 0 && categories && (
              <div className="mb-4 p-3 bg-muted/50 rounded-lg border">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium">📊 Categorie Verdeling (Preview)</span>
                  <Badge variant="outline" className="text-xs">{foundCount} producten</Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(() => {
                    // Calculate category distribution
                    const distribution = new Map<string, { count: number; fallbackCount: number }>();
                    urlEntries
                      .filter(e => e.status === "found" && e.productData)
                      .forEach(entry => {
                        const match = matchProductToCategoryWithDetails(
                          entry.productData!.productNameEn,
                          entry.productData!.categoryName || '',
                          categories
                        );
                        const current = distribution.get(match.categoryName) || { count: 0, fallbackCount: 0 };
                        distribution.set(match.categoryName, {
                          count: current.count + 1,
                          fallbackCount: current.fallbackCount + (match.isFallback ? 1 : 0),
                        });
                      });
                    
                    // Sort by count descending
                    const sorted = Array.from(distribution.entries()).sort((a, b) => b[1].count - a[1].count);
                    
                    return sorted.map(([catName, data]) => (
                      <div 
                        key={catName}
                        className={`text-xs px-2 py-1 rounded-md flex items-center gap-1 ${
                          data.fallbackCount > 0 
                            ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' 
                            : 'bg-primary/10 text-primary'
                        }`}
                      >
                        <span className="font-medium">{catName}</span>
                        <span className="px-1.5 py-0.5 bg-background/50 rounded text-[10px]">{data.count}</span>
                        {data.fallbackCount > 0 && (
                          <span className="text-[10px]">⚠️ {data.fallbackCount} fallback</span>
                        )}
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}

            {/* Progress bar */}
            {importProgress && (
              <div className="mb-4 space-y-2">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{importProgress.status}</span>
                  <span>{importProgress.current}/{importProgress.total}</span>
                </div>
                <Progress value={(importProgress.current / importProgress.total) * 100} />
              </div>
            )}

            {/* Product list */}
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {urlEntries.map((entry) => (
                <div
                  key={entry.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${
                    entry.status === "found" ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800" :
                    entry.status === "imported" ? "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800" :
                    entry.status === "error" || entry.status === "exists" ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800" :
                    entry.status === "loading" ? "bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800" :
                    "bg-muted/50"
                  }`}
                >
                  {/* Status icon */}
                  <div className="shrink-0">
                    {entry.status === "pending" && <Package className="w-5 h-5 text-muted-foreground" />}
                    {entry.status === "loading" && <Loader2 className="w-5 h-5 text-yellow-600 animate-spin" />}
                    {entry.status === "found" && <Check className="w-5 h-5 text-green-600" />}
                    {entry.status === "imported" && <Check className="w-5 h-5 text-blue-600" />}
                    {(entry.status === "error" || entry.status === "exists") && <X className="w-5 h-5 text-red-600" />}
                  </div>

                  {/* Product info */}
                  <div className="flex-1 min-w-0">
                    {entry.productData ? (
                      <div className="flex items-center gap-3">
                        <img 
                          src={entry.productData.productImage} 
                          alt="" 
                          className="w-12 h-12 object-cover rounded"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate">{entry.productData.productNameEn}</p>
                          <p className="text-xs text-muted-foreground">
                            ${entry.productData.sellPrice} • {entry.productData.variants?.length || 0} varianten • {entry.productData.totalStock || 0} voorraad
                          </p>
                          {/* Category preview with details */}
                          {selectedCategory === "auto" && categories && (() => {
                            const matchResult = matchProductToCategoryWithDetails(
                              entry.productData.productNameEn, 
                              entry.productData.categoryName || '', 
                              categories
                            );
                            return (
                              <div className="mt-1">
                                <div className="flex items-center gap-1.5">
                                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                                    matchResult.isFallback 
                                      ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' 
                                      : 'bg-primary/10 text-primary'
                                  }`}>
                                    📁 {matchResult.categoryName}
                                  </span>
                                  {!matchResult.isFallback && matchResult.score > 0 && (
                                    <span className="text-xs text-muted-foreground">
                                      (score: {matchResult.score})
                                    </span>
                                  )}
                                  {matchResult.isFallback && (
                                    <span className="text-xs text-orange-600 dark:text-orange-400">
                                      ⚠️ Geen match - fallback
                                    </span>
                                  )}
                                </div>
                                {matchResult.matchedKeywords.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {matchResult.matchedKeywords.slice(0, 5).map((kw, idx) => (
                                      <span 
                                        key={idx}
                                        className="text-[10px] px-1 py-0.5 bg-muted rounded text-muted-foreground"
                                      >
                                        {kw}
                                      </span>
                                    ))}
                                    {matchResult.matchedKeywords.length > 5 && (
                                      <span className="text-[10px] text-muted-foreground">
                                        +{matchResult.matchedKeywords.length - 5} meer
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                          {selectedCategory !== "auto" && (
                            <p className="text-xs text-primary mt-0.5">
                              📁 {categories?.find(c => c.slug === selectedCategory)?.name || selectedCategory}
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm font-mono truncate">{entry.productId || entry.url}</p>
                        {entry.error && (
                          <p className="text-xs text-red-600 flex items-center gap-1 mt-0.5">
                            <AlertCircle className="w-3 h-3" />
                            {entry.error}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Status badge */}
                  <Badge 
                    variant={
                      entry.status === "found" ? "default" : 
                      entry.status === "imported" ? "default" :
                      entry.status === "error" || entry.status === "exists" ? "destructive" : 
                      "secondary"
                    }
                    className={
                      entry.status === "found" ? "bg-green-600" :
                      entry.status === "imported" ? "bg-blue-600" :
                      ""
                    }
                  >
                    {entry.status === "pending" && "Wachtend"}
                    {entry.status === "loading" && "Laden..."}
                    {entry.status === "found" && "Gevonden"}
                    {entry.status === "imported" && "Geïmporteerd"}
                    {entry.status === "error" && "Fout"}
                    {entry.status === "exists" && "Bestaat al"}
                  </Badge>

                  {/* Remove button */}
                  {entry.status !== "loading" && entry.status !== "imported" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeEntry(entry.id)}
                      className="shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t">
              {pendingCount > 0 && (
                <Button
                  onClick={() => fetchDetailsMutation.mutate()}
                  disabled={fetchDetailsMutation.isPending || importMutation.isPending}
                >
                  {fetchDetailsMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  Productgegevens Ophalen ({pendingCount})
                </Button>
              )}
              
              {foundCount > 0 && (
                <Button
                  onClick={() => importMutation.mutate()}
                  disabled={fetchDetailsMutation.isPending || importMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {importMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  Importeren ({foundCount})
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
