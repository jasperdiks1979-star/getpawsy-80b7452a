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
// PRIORITY ORDER: More specific categories listed first for tie-breaking
const CATEGORY_KEYWORD_MAP: Record<string, string[]> = {
  // ============ BIRD SUBCATEGORIES (most specific first) ============
  'bird-cages': [
    'bird cage', 'parrot cage', 'aviary', 'flight cage', 'breeding cage', 'birdcage', 
    'canary cage', 'finch cage', 'parakeet cage', 'cockatiel cage', 'travel cage bird', 
    'bird enclosure', 'wire cage bird', 'bamboo cage', 'decorative cage', 'hanging cage bird',
    'cage cover', 'cage stand', 'cage accessory', 'bird house cage', 'large bird cage',
    'small bird cage', 'medium bird cage', 'corner cage', 'dome top cage', 'flat top cage',
    'play top cage', 'stackable cage', 'vision cage', 'prevue cage', 'hagen cage'
  ],
  'bird-feeders': [
    'bird feeder', 'seed feeder', 'bird water bottle', 'bird bath', 'bird bowl', 'nectar feeder',
    'bird dish', 'cuttlebone', 'cuttlefish bone', 'mineral block', 'fruit holder bird', 
    'veggie clip bird', 'treat holder bird', 'automatic bird feeder', 'seed cup', 'food cup bird',
    'bird food dish', 'bird water dish', 'gravity feeder bird', 'hopper feeder', 'tube feeder',
    'platform feeder bird', 'suet feeder', 'hummingbird feeder', 'oriole feeder', 'thistle feeder',
    'nyjer feeder', 'peanut feeder bird', 'mealworm feeder', 'bird feeding station'
  ],
  'bird-toys': [
    'bird toy', 'parrot toy', 'bird swing', 'bird ladder', 'bird perch', 'bird bell', 'bird mirror',
    'foraging toy bird', 'shredding toy bird', 'chewing toy bird', 'rope toy bird', 'wooden toy bird',
    'acrylic toy bird', 'bird playground', 'bird gym', 'training perch', 'parrot perch',
    'natural perch', 'pedi perch', 'heated perch', 'rope perch', 'swing perch', 'platform perch',
    'bird kabob', 'bird pinata', 'shreddable toy', 'preening toy', 'foot toy bird', 'hanging toy bird',
    'climbing toy bird', 'activity toy bird', 'enrichment bird', 'beak toy', 'bird puzzle'
  ],
  'bird-supplies': [
    'bird', 'parrot', 'parakeet', 'budgie', 'cockatiel', 'canary', 'finch', 'lovebird', 
    'macaw', 'cockatoo', 'conure', 'african grey', 'amazon parrot', 'pionus', 'eclectus',
    'mynah', 'toucan', 'lorikeet', 'caique', 'quaker', 'ringneck', 'sun conure', 'bird nesting',
    'bird breeding', 'bird vitamins', 'bird supplement', 'bird medicine', 'bird harness',
    'bird diaper', 'flight suit', 'bird carrier', 'bird travel', 'bird cage liner'
  ],
  
  // ============ PET FURNITURE SUBCATEGORIES (most specific first) ============
  'pet-hammocks': [
    'hammock', 'hanging bed', 'window perch', 'radiator bed', 'suspended bed', 'cat hammock',
    'window hammock', 'suction cup bed', 'cage hammock', 'hanging perch', 'swing bed',
    'wall mounted bed', 'shelf bed', 'aerial bed', 'elevated hammock', 'mesh hammock',
    'window seat cat', 'window mount', 'suction mount', 'floating bed', 'hanging basket',
    'macrame hammock', 'canvas hammock', 'fabric hammock', 'pet swing', 'lounger hanging',
    'bunk bed pet', 'double hammock pet', 'ferret hammock', 'rat hammock', 'chinchilla hammock'
  ],
  'pet-nests': [
    'nest', 'cave bed', 'igloo bed', 'cozy nest', 'snuggle bed', 'cuddle bed', 'enclosed bed', 
    'hooded bed', 'cat cave', 'dog cave', 'burrow bed', 'cocoon bed', 'pod bed', 'covered bed', 
    'tent bed', 'hut bed', 'felt cave', 'wool cave', 'dome bed', 'hideaway bed', 'retreat bed',
    'cozy cave', 'snuggle cave', 'warm cave', 'winter cave', 'plush cave', 'soft cave',
    'semi-enclosed', 'half covered', 'hood bed', 'canopy bed pet', 'teepee bed', 'tipi bed',
    'shark bed', 'banana bed', 'pumpkin bed', 'fruit bed pet', 'novelty bed pet'
  ],
  'pet-houses': [
    'pet house', 'dog house', 'cat house', 'kennel outdoor', 'indoor house', 'outdoor house', 
    'wooden house pet', 'plastic house pet', 'cottage pet', 'villa pet', 'cabin pet',
    'shelter outdoor', 'den house', 'hut house', 'lodge pet', 'chalet pet', 'insulated house', 
    'weatherproof house', 'dog kennel', 'cat condo house', 'elevated house', 'duplex house pet',
    'a-frame house', 'barn style house', 'log cabin pet', 'modern house pet', 'luxury house pet',
    'winter house pet', 'summer house pet', 'ventilated house', 'raised house pet'
  ],
  'pet-beds': [
    'pet bed', 'dog bed', 'cat bed', 'sleeping bed', 'orthopedic bed', 'donut bed', 'calming bed', 
    'bolster bed', 'memory foam bed', 'waterproof bed', 'washable bed', 'plush bed', 'soft bed',
    'round bed', 'rectangle bed', 'oval bed', 'luxury bed pet', 'heated bed', 'cooling bed', 
    'raised bed pet', 'outdoor bed pet', 'travel bed pet', 'portable bed', 'sofa bed pet', 
    'cozy bed', 'fluffy bed', 'anti-anxiety bed', 'faux fur bed', 'fleece bed', 'self-warming bed',
    'nesting bed', 'crate bed', 'crate pad', 'kennel bed', 'pillow bed', 'cushion bed',
    'flat bed pet', 'padded bed', 'thick bed', 'extra large bed', 'small bed pet', 'medium bed pet',
    'senior bed', 'puppy bed', 'kitten bed', 'chew resistant bed', 'indestructible bed'
  ],
  
  // ============ CAT-SPECIFIC CATEGORIES ============
  'cat-trees-and-condos': [
    'cat tree', 'scratching tower', 'climbing tower', 'cat tower', 'cat condo', 'sisal tower', 
    'cat perch tower', 'cat furniture multi', 'multi-level cat', 'cat activity center', 
    'climbing frame cat', 'cat gym', 'cat playground', 'cat climbing', 'kitty tower', 
    'feline tower', 'cat castle', 'cat platform', 'cat shelf', 'wall mounted cat shelf', 
    'cat bridge', 'cat walkway', 'cat jungle gym', 'cat play tower', 'cat exercise tower', 
    'vertical cat furniture', 'tall cat tree', 'large cat tree', 'modern cat tree',
    'cat condo tower', 'floor to ceiling cat', 'corner cat tree', 'compact cat tree'
  ],
  'cat-scratching-posts': [
    'scratching post', 'scratcher', 'scratching board', 'sisal post', 'cardboard scratcher', 
    'scratch pad', 'scratching mat', 'cat scratch', 'scratch lounge', 'corrugated scratcher', 
    'scratch box', 'claw sharpener', 'sisal rope post', 'jute scratcher', 'carpet scratcher',
    'wall scratcher', 'floor scratcher', 'angled scratcher', 'horizontal scratcher', 
    'vertical scratcher', 'incline scratcher', 'wave scratcher', 'curved scratcher',
    'scratching ramp', 'scratch barrel', 'scratch wheel', 'scratch ottoman'
  ],
  'cat-litter-boxes': [
    'litter box', 'litter tray', 'cat toilet', 'litter scoop', 'litter mat', 'self-cleaning litter', 
    'automatic litter', 'covered litter', 'hooded litter', 'litter pan', 'cat sand box', 
    'kitty litter box', 'enclosed litter', 'top entry litter', 'front entry litter', 
    'litter cabinet', 'litter furniture', 'litter deodorizer', 'litter liner', 'litter disposal', 
    'poop scoop cat', 'waste box cat', 'sandbox cat', 'corner litter', 'jumbo litter',
    'sifting litter', 'odor control litter', 'litter genie', 'litter locker'
  ],
  
  // ============ SMALL ANIMALS CATEGORIES ============
  'small-animal-supplies': [
    'hamster', 'guinea pig', 'rabbit', 'bunny', 'gerbil', 'chinchilla', 'ferret', 'hedgehog',
    'mouse cage', 'rat cage', 'sugar glider', 'degu', 'prairie dog', 'squirrel pet', 'small animal', 
    'rodent', 'hamster wheel', 'exercise wheel', 'running wheel', 'hamster ball', 'hamster cage', 
    'rabbit hutch', 'guinea pig cage', 'hay feeder', 'timothy hay', 'water bottle small pet', 
    'hideout small animal', 'tunnel small pet', 'chew toy rodent', 'wood chew'
  ],
  
  // ============ FISH & AQUARIUM CATEGORIES ============
  'fish-aquarium': [
    'aquarium', 'fish tank', 'fish bowl', 'aquatic', 'underwater', 'fish food', 'fish net',
    'fish tank filter', 'aquarium pump', 'air pump aquarium', 'aquarium heater', 'tank thermometer',
    'aquarium light', 'led aquarium', 'gravel aquarium', 'substrate aquarium', 'aquarium decoration', 
    'fish cave', 'aquarium plant', 'artificial coral', 'fish breeding', 'betta tank', 
    'goldfish tank', 'tropical fish', 'aquarium cleaner', 'algae scraper', 'water conditioner'
  ],
  
  // ============ GENERAL PET CATEGORIES ============
  'pet-furniture': [
    'pet sofa', 'pet couch', 'pet chair', 'pet ottoman', 'pet bench', 'storage bench pet', 
    'window sill pet', 'elevated furniture pet', 'cooling furniture', 'furniture protector pet',
    'couch protector', 'sofa protector', 'furniture cover pet'
  ],
  'pet-beds-mats': [
    'mat pet', 'blanket pet', 'throw pet', 'mattress pet', 'sleeping pad', 'foam mat pet', 
    'floor mat pet', 'crate mat', 'kennel mat', 'throw blanket pet', 'fleece blanket pet', 
    'sherpa blanket pet', 'thermal mat', 'self-heating mat', 'electric mat pet', 'cooling pad pet', 
    'gel mat pet', 'pressure mat pet', 'orthopedic mat'
  ],
  'pet-toys': [
    'toy', 'toys', 'ball pet', 'chew toy', 'squeaky', 'plush toy', 'rope toy', 'frisbee', 
    'fetch toy', 'puzzle toy', 'interactive toy', 'teaser', 'wand toy', 'kong', 'play toy',
    'squeak toy', 'tug toy', 'rubber toy', 'latex toy', 'tennis ball pet', 'bouncy ball',
    'treat ball', 'snuffle mat', 'hide and seek toy', 'stuffed toy pet', 'soft toy pet',
    'durable toy', 'tough toy', 'indestructible toy', 'aggressive chewer', 'puppy toy', 
    'kitten toy', 'catnip toy', 'feather toy', 'laser pointer', 'mouse toy cat', 'fish toy cat',
    'tunnel toy', 'crinkle toy', 'kickeroo', 'dental toy', 'chew ring', 'bone toy', 
    'stick toy', 'flying disc', 'automatic toy', 'electronic toy pet', 'motion toy'
  ],
  'pet-collars-leashes': [
    'collar', 'leash', 'harness', 'lead dog', 'chain leash', 'tag collar', 'retractable leash', 
    'reflective collar', 'glow collar', 'led collar', 'nylon collar', 'leather collar', 
    'adjustable collar', 'breakaway collar', 'martingale', 'gentle leader', 'head halter', 
    'no pull harness', 'front clip harness', 'back clip harness', 'step-in harness',
    'vest harness', 'mesh harness', 'padded harness', 'training leash', 'long line leash', 
    'check cord', 'slip lead', 'rope leash', 'hands free leash', 'waist leash', 'double leash', 
    'coupler leash', 'bungee leash', 'traffic handle', 'short leash', 'personalized collar',
    'embroidered collar', 'studded collar', 'bowtie collar', 'bandana collar', 'airtag collar'
  ],
  'pet-grooming': [
    'brush pet', 'comb pet', 'grooming', 'shampoo pet', 'nail clipper', 'nail trimmer', 
    'bath pet', 'deshedding', 'dematting', 'slicker brush', 'rake brush', 'grooming scissors',
    'grooming glove', 'rubber brush', 'bristle brush', 'pin brush', 'undercoat rake', 
    'flea comb', 'tick comb', 'detangling comb', 'wide tooth comb', 'thinning shears', 
    'grooming table', 'grooming arm', 'grooming loop', 'ear cleaner pet', 'eye wipes pet',
    'dental spray pet', 'paw balm', 'nose balm', 'hot spot spray', 'medicated shampoo',
    'oatmeal shampoo', 'whitening shampoo', 'grooming kit'
  ],
  'pet-hair-care': [
    'fur remover', 'hair remover pet', 'shedding tool', 'coat brush', 'detangler spray', 
    'conditioner pet', 'pet dryer', 'hair vacuum pet', 'deshedding tool', 'undercoat brush', 
    'furminator', 'shed control', 'force dryer pet', 'stand dryer pet', 'grooming spray',
    'shine spray pet', 'coat oil', 'leave-in conditioner pet', 'anti-static spray pet',
    'deodorizing spray pet', 'perfume pet', 'cologne pet', 'finishing spray pet', 'lint roller pet'
  ],
  'pet-bags': [
    'carrier pet', 'bag pet', 'backpack pet', 'transport pet', 'travel carrier', 'sling carrier', 
    'airline carrier', 'pet purse', 'tote carrier', 'soft carrier', 'hard carrier', 
    'rolling carrier', 'expandable carrier', 'mesh carrier', 'bubble backpack pet',
    'front carrier pet', 'chest carrier', 'shoulder bag pet', 'crossbody carrier',
    'bicycle carrier pet', 'car seat carrier', 'booster seat pet', 'car hammock pet',
    'cargo liner pet', 'seat cover pet', 'travel crate', 'portable kennel', 'foldable carrier'
  ],
  'pet-strollers': [
    'stroller pet', 'pram pet', 'pushchair pet', 'pet cart', 'jogging stroller pet', 
    'travel stroller pet', 'double stroller pet', 'twin stroller pet', 'all terrain stroller pet',
    'heavy duty stroller pet', 'lightweight stroller pet', 'foldable stroller pet', 
    'pet wagon', 'pet buggy', 'pet pram', '3 wheel stroller pet', '4 wheel stroller pet'
  ],
  'pet-bowls': [
    'bowl pet', 'dish pet', 'plate pet', 'slow feeder bowl', 'elevated bowl', 'tilted bowl', 
    'anti-slip bowl', 'stainless steel bowl pet', 'ceramic bowl pet', 'plastic bowl pet', 
    'silicone bowl pet', 'collapsible bowl', 'travel bowl pet', 'portable bowl pet', 
    'double bowl pet', 'twin bowl', 'raised bowl', 'adjustable bowl', 'spill proof bowl',
    'no tip bowl', 'weighted bowl', 'puzzle bowl', 'lick mat', 'snuffle bowl'
  ],
  'pet-feeding-tools': [
    'feeder automatic', 'food dispenser pet', 'portion control feeder', 'timer feeder', 
    'gravity feeder pet', 'smart feeder', 'wifi feeder', 'app controlled feeder', 
    'programmable feeder', 'microchip feeder', 'multi-pet feeder', 'cat food dispenser',
    'dog food dispenser', 'treat dispenser', 'kibble dispenser', 'food storage pet',
    'food container pet', 'airtight container pet', 'food scoop pet', 'measuring scoop pet'
  ],
  'pet-drinking-tools': [
    'water fountain pet', 'water dispenser pet', 'water bottle pet', 'drinking fountain', 
    'hydration pet', 'filter fountain', 'pet fountain', 'cat fountain', 'dog fountain',
    'automatic water pet', 'gravity water pet', 'filtered water pet', 'stainless fountain pet',
    'ceramic fountain pet', 'quiet fountain', 'running water pet', 'circulating water pet',
    'water filter pet', 'replacement filter fountain', 'carbon filter fountain', 'pump fountain'
  ],
  'pet-food-treats': [
    'food pet', 'treat pet', 'treats dog', 'treats cat', 'snack pet', 'kibble', 'wet food pet', 
    'dry food pet', 'biscuit pet', 'chew treat', 'dental treat', 'training treat', 
    'freeze dried treat', 'dehydrated treat', 'grain free food', 'organic food pet',
    'natural food pet', 'premium food pet', 'jerky pet', 'meat stick pet', 'rawhide',
    'bully stick', 'antler chew', 'bone treat', 'dental chew', 'greenies', 'milk bone'
  ],
  'pet-training': [
    'training clicker', 'training whistle', 'treat pouch', 'target stick', 'agility equipment', 
    'tunnel agility', 'jump agility', 'weave poles', 'hurdle agility', 'potty pad', 
    'puppy pad', 'pee pad', 'training pad', 'wee wee pad', 'house training', 'crate training',
    'bell training', 'potty bell', 'training spray', 'attractant spray', 'repellent spray',
    'bitter spray', 'anti chew spray', 'training collar', 'training harness', 'training vest',
    'training dummy', 'fetch training', 'retrieve training', 'obedience training'
  ],
  'pet-gates-fences': [
    'gate pet', 'fence pet', 'barrier pet', 'playpen pet', 'pen exercise', 'enclosure pet', 
    'baby gate pet', 'pet door', 'pet flap', 'exercise pen', 'x-pen', 'wire pen pet',
    'plastic pen pet', 'wooden gate pet', 'metal gate pet', 'pressure mount gate',
    'hardware mount gate', 'freestanding gate', 'retractable gate pet', 'mesh gate pet',
    'extra wide gate', 'extra tall gate', 'walk through gate', 'swing gate pet',
    'outdoor pen pet', 'indoor pen pet', 'puppy pen', 'kitten pen', 'containment system'
  ],
  'dog-stairs-and-steps': [
    'stairs pet', 'steps pet', 'ramp pet', 'ladder pet', 'pet stairs', 'dog ramp', 'car ramp pet',
    'bed stairs', 'couch stairs', 'sofa stairs', 'folding ramp pet', 'telescoping ramp',
    'portable ramp pet', 'lightweight ramp', 'non-slip stairs', 'foam stairs pet',
    'wooden stairs pet', 'plastic stairs pet', 'carpeted stairs', 'adjustable stairs pet',
    'wide stairs pet', 'senior pet stairs', 'arthritic pet ramp'
  ],
  'pet-accessories': [
    'id tag pet', 'charm collar', 'pendant pet', 'bell collar', 'camera pet', 'gps tracker pet', 
    'pet monitor', 'bandana pet', 'bow tie pet', 'hat pet', 'glasses pet', 'jewelry pet',
    'pet camera', 'wifi camera pet', 'treat camera', 'activity tracker pet', 'fitness tracker pet',
    'health monitor pet', 'location tracker pet', 'smart collar', 'airtag holder pet',
    'costume pet', 'outfit pet', 'dress pet', 'life jacket pet', 'float coat'
  ],
  'pet-clothing': [
    'sweater pet', 'jacket pet', 'coat dog', 'coat cat', 'hoodie pet', 'shirt pet', 't-shirt pet',
    'dress dog', 'costume dog', 'raincoat pet', 'winter coat pet', 'puffer jacket pet',
    'fleece jacket pet', 'windbreaker pet', 'reflective vest pet', 'cooling vest pet',
    'anxiety vest', 'thundershirt', 'recovery suit pet', 'surgical suit pet', 'onesie pet',
    'pajamas pet', 'warm clothes pet', 'snow suit pet', 'booties pet', 'shoes pet', 'socks pet'
  ],
  'pet-health': [
    'supplement pet', 'vitamin pet', 'probiotic pet', 'joint support pet', 'glucosamine pet',
    'omega pet', 'fish oil pet', 'calming supplement', 'anxiety relief pet', 'flea treatment',
    'tick treatment', 'dewormer', 'heartworm', 'first aid pet', 'bandage pet', 'wound care pet',
    'thermometer pet', 'pill dispenser pet', 'medicine dropper pet', 'recovery pet',
    'mobility aid pet', 'wheelchair pet', 'leg brace pet', 'cone pet', 'e-collar pet',
    'inflatable collar recovery', 'elizabethan collar'
  ],
  'pet-cleaning': [
    'poop bag', 'waste bag pet', 'biodegradable bag pet', 'bag dispenser pet', 'pooper scooper',
    'waste scoop', 'urine cleaner pet', 'stain remover pet', 'odor eliminator pet',
    'enzyme cleaner pet', 'carpet cleaner pet', 'floor cleaner pet', 'cage cleaner',
    'litter deodorizer', 'air freshener pet', 'pet wipes', 'grooming wipes', 'ear wipes pet',
    'eye wipes pet', 'paw wipes', 'dental wipes pet'
  ],
  'pet-supplies': [
    'supplies', 'accessory general', 'essential pet', 'starter kit pet',
    'new pet kit', 'adoption kit', 'welcome kit pet', 'gift set pet', 'bundle pet'
  ], // Fallback category - should have lowest priority keywords
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
