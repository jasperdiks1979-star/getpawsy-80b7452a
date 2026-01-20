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
// Organized by animal type with species-specific subcategories
// PRIORITY ORDER: More specific categories listed first for tie-breaking
const CATEGORY_KEYWORD_MAP: Record<string, string[]> = {
  // ============ DOG-SPECIFIC CATEGORIES ============
  'dog-beds': [
    'dog bed', 'puppy bed', 'orthopedic bed dog', 'memory foam dog', 'bolster bed dog',
    'donut bed dog', 'calming bed dog', 'anti-anxiety bed dog', 'large dog bed', 'small dog bed',
    'medium dog bed', 'xl dog bed', 'xxl dog bed', 'waterproof dog bed', 'outdoor dog bed',
    'indoor dog bed', 'washable dog bed', 'heated dog bed', 'cooling dog bed', 'elevated dog bed',
    'crate bed dog', 'kennel pad dog', 'travel bed dog', 'portable dog bed', 'luxury dog bed',
    'sofa dog bed', 'couch dog bed', 'pillow dog bed', 'cushion dog bed', 'plush dog bed',
    'fleece dog bed', 'senior dog bed', 'arthritic dog bed', 'chew resistant bed dog'
  ],
  'dog-houses': [
    'dog house', 'dog kennel', 'outdoor dog house', 'indoor dog house', 'insulated dog house',
    'wooden dog house', 'plastic dog house', 'large dog house', 'small dog house', 'heated dog house',
    'weatherproof dog house', 'winter dog house', 'summer dog house', 'ventilated dog house',
    'elevated dog house', 'raised dog house', 'duplex dog house', 'a-frame dog house',
    'cabin dog house', 'cottage dog house', 'modern dog house', 'luxury dog house', 'dog shelter'
  ],
  'dog-toys': [
    'dog toy', 'puppy toy', 'chew toy dog', 'squeaky toy dog', 'rope toy dog', 'tug toy dog',
    'ball dog', 'tennis ball dog', 'fetch toy dog', 'frisbee dog', 'flying disc dog',
    'plush toy dog', 'stuffed toy dog', 'durable toy dog', 'tough toy dog', 'indestructible toy dog',
    'aggressive chewer toy', 'rubber toy dog', 'latex toy dog', 'kong dog', 'treat ball dog',
    'puzzle toy dog', 'interactive toy dog', 'snuffle mat dog', 'hide seek toy dog', 'dental toy dog'
  ],
  'dog-food-treats': [
    'dog food', 'puppy food', 'dog treat', 'puppy treat', 'dog biscuit', 'dog snack', 'dog jerky',
    'dog kibble', 'dry dog food', 'wet dog food', 'dog chew', 'bully stick', 'rawhide dog',
    'dental chew dog', 'training treat dog', 'freeze dried dog', 'dehydrated dog food'
  ],
  'dog-bowls-feeders': [
    'dog bowl', 'puppy bowl', 'dog dish', 'slow feeder dog', 'elevated bowl dog', 'raised bowl dog',
    'stainless bowl dog', 'ceramic bowl dog', 'travel bowl dog', 'collapsible bowl dog',
    'automatic feeder dog', 'dog food dispenser', 'gravity feeder dog', 'smart feeder dog',
    'portion feeder dog', 'anti-gulp bowl dog', 'spill proof bowl dog', 'double bowl dog'
  ],
  'dog-collars-leashes': [
    'dog collar', 'puppy collar', 'dog leash', 'dog lead', 'dog harness', 'no pull harness dog',
    'retractable leash dog', 'reflective collar dog', 'led collar dog', 'glow collar dog',
    'nylon collar dog', 'leather collar dog', 'training collar dog', 'martingale dog',
    'front clip harness dog', 'back clip harness dog', 'step-in harness dog', 'vest harness dog',
    'hands free leash dog', 'waist leash dog', 'bungee leash dog', 'rope leash dog', 'chain leash dog'
  ],
  'dog-grooming': [
    'dog brush', 'dog comb', 'dog shampoo', 'puppy shampoo', 'dog nail clipper', 'dog nail trimmer',
    'dog deshedding', 'slicker brush dog', 'grooming glove dog', 'dog bath', 'dog dryer',
    'dog grooming kit', 'dog grooming table', 'ear cleaner dog', 'dog toothbrush', 'dog dental care'
  ],
  'dog-training': [
    'dog training', 'puppy training', 'training clicker dog', 'treat pouch dog', 'training whistle dog',
    'potty pad dog', 'puppy pad', 'pee pad dog', 'training pad dog', 'house training dog',
    'agility equipment dog', 'tunnel agility dog', 'weave poles dog', 'hurdle dog', 'jump agility dog',
    'dog bell training', 'potty bell dog', 'training dummy dog', 'fetch training dog'
  ],
  'dog-clothing': [
    'dog sweater', 'dog jacket', 'dog coat', 'dog hoodie', 'dog shirt', 'dog dress', 'dog costume',
    'dog raincoat', 'winter coat dog', 'puffer jacket dog', 'fleece dog', 'dog boots', 'dog shoes',
    'dog socks', 'cooling vest dog', 'anxiety vest dog', 'thundershirt dog', 'recovery suit dog'
  ],
  'dog-carriers-strollers': [
    'dog carrier', 'dog backpack', 'dog sling', 'dog stroller', 'dog pram', 'dog buggy',
    'travel carrier dog', 'airline carrier dog', 'soft carrier dog', 'rolling carrier dog',
    'dog travel bag', 'car seat dog', 'booster seat dog', 'dog car hammock', 'dog seat cover'
  ],
  'dog-gates-fences': [
    'dog gate', 'dog fence', 'dog playpen', 'dog pen', 'exercise pen dog', 'dog barrier',
    'pet door dog', 'dog flap', 'retractable gate dog', 'pressure mount gate dog', 'x-pen dog',
    'outdoor pen dog', 'indoor pen dog', 'puppy pen', 'containment dog', 'dog enclosure'
  ],
  'dog-stairs-ramps': [
    'dog stairs', 'dog steps', 'dog ramp', 'pet stairs', 'pet ramp', 'bed stairs dog', 'couch stairs dog',
    'car ramp dog', 'folding ramp dog', 'portable ramp dog', 'non-slip stairs dog', 'foam stairs dog',
    'wooden stairs dog', 'senior dog stairs', 'arthritic dog ramp', 'telescoping ramp dog'
  ],

  // ============ CAT-SPECIFIC CATEGORIES ============
  'cat-beds': [
    'cat bed', 'kitten bed', 'cat cushion', 'cat pillow', 'donut bed cat', 'calming bed cat',
    'heated bed cat', 'cooling bed cat', 'orthopedic bed cat', 'round bed cat', 'luxury cat bed',
    'plush cat bed', 'soft cat bed', 'cozy cat bed', 'washable cat bed', 'senior cat bed',
    'self-warming cat bed', 'enclosed bed cat', 'hooded bed cat', 'covered bed cat'
  ],
  'cat-houses': [
    'cat house', 'cat condo', 'cat cottage', 'cat cabin', 'cat igloo', 'indoor cat house',
    'outdoor cat house', 'wooden cat house', 'insulated cat house', 'heated cat house',
    'weatherproof cat house', 'feral cat house', 'stray cat shelter', 'cat den'
  ],
  'cat-toys': [
    'cat toy', 'kitten toy', 'catnip toy', 'feather toy cat', 'wand toy cat', 'teaser cat',
    'mouse toy cat', 'fish toy cat', 'laser pointer cat', 'interactive toy cat', 'puzzle toy cat',
    'ball cat', 'tunnel toy cat', 'crinkle toy cat', 'kickeroo cat', 'automatic toy cat',
    'electronic toy cat', 'motion toy cat', 'cat spring', 'cat dancer', 'chasing toy cat'
  ],
  'cat-food-treats': [
    'cat food', 'kitten food', 'cat treat', 'kitten treat', 'cat snack', 'cat biscuit',
    'dry cat food', 'wet cat food', 'cat kibble', 'freeze dried cat', 'dental treat cat'
  ],
  'cat-bowls-feeders': [
    'cat bowl', 'kitten bowl', 'cat dish', 'elevated bowl cat', 'tilted bowl cat', 'whisker friendly bowl',
    'slow feeder cat', 'automatic feeder cat', 'cat food dispenser', 'gravity feeder cat',
    'smart feeder cat', 'microchip feeder cat', 'multi-cat feeder', 'double bowl cat'
  ],
  'cat-collars-accessories': [
    'cat collar', 'kitten collar', 'breakaway collar cat', 'reflective collar cat', 'bell collar cat',
    'cat harness', 'cat leash', 'cat lead', 'cat id tag', 'cat bow tie', 'cat bandana',
    'gps tracker cat', 'airtag collar cat'
  ],
  'cat-grooming': [
    'cat brush', 'cat comb', 'cat shampoo', 'kitten shampoo', 'cat nail clipper', 'cat nail trimmer',
    'cat deshedding', 'slicker brush cat', 'grooming glove cat', 'cat bath', 'ear cleaner cat'
  ],
  'cat-carriers': [
    'cat carrier', 'kitten carrier', 'cat backpack', 'cat travel bag', 'airline carrier cat',
    'soft carrier cat', 'hard carrier cat', 'expandable carrier cat', 'bubble backpack cat',
    'cat sling', 'rolling carrier cat', 'cat stroller'
  ],
  'cat-furniture': [
    'cat furniture', 'cat shelf', 'wall mounted cat', 'cat bridge', 'cat walkway', 'cat perch',
    'window perch cat', 'cat platform', 'cat climbing', 'cat gym', 'vertical cat'
  ],
  'cat-hammocks': [
    'cat hammock', 'hanging bed cat', 'window hammock cat', 'radiator bed cat', 'suspended bed cat',
    'suction cup bed cat', 'cage hammock cat', 'swing bed cat', 'wall mounted bed cat',
    'shelf bed cat', 'floating bed cat', 'macrame hammock cat', 'bunk bed cat'
  ],
  'cat-trees-and-condos': [
    'cat tree', 'cat tower', 'scratching tower', 'climbing tower cat', 'sisal tower',
    'multi-level cat', 'cat activity center', 'cat playground', 'cat climbing frame',
    'tall cat tree', 'large cat tree', 'modern cat tree', 'corner cat tree', 'compact cat tree',
    'floor to ceiling cat', 'cat jungle gym', 'cat castle', 'feline tower', 'kitty tower'
  ],
  'cat-scratching-posts': [
    'scratching post', 'cat scratcher', 'scratching board', 'sisal post', 'cardboard scratcher',
    'scratch pad cat', 'scratching mat', 'corrugated scratcher', 'scratch lounge', 'claw sharpener',
    'jute scratcher', 'carpet scratcher', 'wall scratcher cat', 'floor scratcher cat',
    'angled scratcher', 'horizontal scratcher', 'vertical scratcher', 'scratch barrel'
  ],
  'cat-litter-boxes': [
    'litter box', 'litter tray', 'cat toilet', 'litter scoop', 'litter mat', 'self-cleaning litter',
    'automatic litter', 'covered litter', 'hooded litter', 'litter pan', 'enclosed litter',
    'top entry litter', 'front entry litter', 'litter cabinet', 'litter furniture', 'litter deodorizer',
    'litter liner', 'litter disposal', 'corner litter', 'jumbo litter', 'sifting litter'
  ],

  // ============ BIRD-SPECIFIC CATEGORIES ============
  'bird-cages': [
    'bird cage', 'parrot cage', 'aviary', 'flight cage', 'breeding cage bird', 'birdcage',
    'canary cage', 'finch cage', 'parakeet cage', 'cockatiel cage', 'budgie cage',
    'large bird cage', 'small bird cage', 'travel cage bird', 'hanging cage bird', 'dome top cage',
    'play top cage', 'stackable cage bird', 'corner cage bird'
  ],
  'bird-feeders': [
    'bird feeder', 'seed feeder bird', 'bird water bottle', 'bird bath', 'bird bowl', 'nectar feeder',
    'bird dish', 'cuttlebone', 'cuttlefish bone', 'mineral block bird', 'fruit holder bird',
    'automatic bird feeder', 'seed cup bird', 'food cup bird', 'bird food dish', 'bird water dish',
    'hummingbird feeder', 'mealworm feeder bird'
  ],
  'bird-toys': [
    'bird toy', 'parrot toy', 'bird swing', 'bird ladder', 'bird bell', 'bird mirror',
    'foraging toy bird', 'shredding toy bird', 'chewing toy bird', 'rope toy bird', 'wooden toy bird',
    'bird playground', 'bird gym', 'bird kabob', 'bird pinata', 'shreddable toy bird',
    'foot toy bird', 'hanging toy bird', 'climbing toy bird', 'beak toy bird', 'bird puzzle'
  ],
  'bird-perches': [
    'bird perch', 'parrot perch', 'training perch bird', 'natural perch bird', 'pedi perch',
    'heated perch bird', 'rope perch bird', 'swing perch bird', 'platform perch bird',
    'java wood perch', 'manzanita perch', 'cement perch bird', 'sandpaper perch'
  ],
  'bird-nests': [
    'bird nest', 'breeding box bird', 'nesting box bird', 'bird house nest', 'parakeet nest',
    'finch nest', 'canary nest', 'coconut nest bird', 'wicker nest bird', 'grass nest bird',
    'hanging nest bird', 'bird breeding', 'hatch box bird'
  ],
  'bird-accessories': [
    'bird harness', 'bird diaper', 'flight suit bird', 'bird carrier', 'bird travel',
    'cage cover bird', 'cage liner bird', 'bird vitamins', 'bird supplement', 'bird medicine',
    'cuttlebone holder', 'treat holder bird', 'bird cage accessory'
  ],

  // ============ FISH & AQUARIUM CATEGORIES ============
  'fish-tanks': [
    'fish tank', 'aquarium', 'fish bowl', 'betta tank', 'goldfish tank', 'nano tank',
    'planted tank', 'reef tank', 'marine tank', 'freshwater tank', 'saltwater tank',
    'desktop aquarium', 'wall aquarium', 'corner aquarium', 'aquarium kit'
  ],
  'fish-tank-decorations': [
    'aquarium decoration', 'fish tank ornament', 'aquarium rock', 'aquarium cave', 'fish hideout',
    'aquarium driftwood', 'aquarium castle', 'aquarium shipwreck', 'artificial coral',
    'aquarium background', 'aquarium gravel', 'aquarium substrate', 'aquarium sand'
  ],
  'fish-food': [
    'fish food', 'fish flakes', 'fish pellets', 'betta food', 'goldfish food', 'tropical fish food',
    'algae wafers', 'bottom feeder food', 'freeze dried fish food', 'fish treat'
  ],
  'fish-tank-filters': [
    'aquarium filter', 'fish tank filter', 'canister filter aquarium', 'hang on filter aquarium',
    'sponge filter aquarium', 'internal filter aquarium', 'power filter aquarium',
    'filter media aquarium', 'bio filter aquarium', 'carbon filter aquarium'
  ],
  'fish-tank-lighting': [
    'aquarium light', 'fish tank light', 'led aquarium light', 'aquarium lamp', 'planted tank light',
    'reef light aquarium', 'submersible light aquarium', 'clip on light aquarium'
  ],
  'fish-tank-plants': [
    'aquarium plant', 'artificial plant aquarium', 'silk plant aquarium', 'plastic plant aquarium',
    'live plant aquarium', 'floating plant aquarium', 'foreground plant aquarium', 'background plant aquarium'
  ],

  // ============ HAMSTER-SPECIFIC CATEGORIES ============
  'hamster-cages': [
    'hamster cage', 'hamster habitat', 'hamster tank', 'dwarf hamster cage', 'syrian hamster cage',
    'wire cage hamster', 'glass hamster cage', 'modular hamster cage', 'hamster terrarium'
  ],
  'hamster-beds-houses': [
    'hamster house', 'hamster hideout', 'hamster hut', 'hamster igloo', 'hamster bed',
    'hamster sleeping house', 'wooden house hamster', 'ceramic house hamster', 'plastic house hamster',
    'coconut house hamster', 'hanging house hamster', 'hamster nest', 'hamster cave'
  ],
  'hamster-toys': [
    'hamster toy', 'hamster tunnel', 'hamster tube', 'hamster bridge', 'hamster seesaw',
    'hamster chew toy', 'wooden chew hamster', 'hamster ladder', 'hamster swing', 'hamster playground'
  ],
  'hamster-food-treats': [
    'hamster food', 'hamster treat', 'hamster snack', 'hamster mix', 'dwarf hamster food',
    'syrian hamster food', 'hamster seed mix', 'hamster pellet'
  ],
  'hamster-wheels': [
    'hamster wheel', 'exercise wheel hamster', 'running wheel hamster', 'silent wheel hamster',
    'hamster ball', 'exercise ball hamster', 'flying saucer hamster', 'spinner wheel hamster'
  ],
  'hamster-accessories': [
    'hamster water bottle', 'hamster bowl', 'hamster feeder', 'hamster bedding', 'hamster litter',
    'hamster sand bath', 'hamster carrier', 'hamster harness', 'hamster playpen'
  ],

  // ============ RABBIT-SPECIFIC CATEGORIES ============
  'rabbit-hutches': [
    'rabbit hutch', 'rabbit cage', 'bunny hutch', 'bunny cage', 'rabbit enclosure', 'rabbit pen',
    'indoor rabbit cage', 'outdoor rabbit hutch', 'rabbit run', 'rabbit playpen', 'rabbit habitat'
  ],
  'rabbit-beds-houses': [
    'rabbit house', 'rabbit hideout', 'bunny house', 'rabbit hut', 'rabbit bed', 'bunny bed',
    'wooden house rabbit', 'grass house rabbit', 'wicker house rabbit', 'rabbit tunnel',
    'rabbit cave', 'rabbit igloo', 'rabbit den'
  ],
  'rabbit-toys': [
    'rabbit toy', 'bunny toy', 'rabbit chew toy', 'wooden chew rabbit', 'rabbit ball', 'rabbit tunnel toy',
    'rabbit toss toy', 'rabbit activity toy', 'rabbit foraging toy', 'rabbit grass mat'
  ],
  'rabbit-food-treats': [
    'rabbit food', 'bunny food', 'rabbit pellet', 'rabbit hay', 'timothy hay rabbit', 'rabbit treat',
    'bunny treat', 'rabbit snack', 'hay feeder rabbit'
  ],
  'rabbit-bowls-feeders': [
    'rabbit bowl', 'rabbit feeder', 'rabbit water bottle', 'hay rack rabbit', 'hay feeder rabbit',
    'gravity feeder rabbit', 'ceramic bowl rabbit', 'rabbit dish'
  ],
  'rabbit-accessories': [
    'rabbit harness', 'rabbit leash', 'bunny harness', 'rabbit carrier', 'rabbit grooming',
    'rabbit nail clipper', 'rabbit brush', 'rabbit litter box', 'rabbit litter'
  ],

  // ============ GUINEA PIG-SPECIFIC CATEGORIES ============
  'guinea-pig-cages': [
    'guinea pig cage', 'guinea pig hutch', 'cavy cage', 'c&c cage guinea pig', 'guinea pig pen',
    'guinea pig enclosure', 'guinea pig habitat', 'indoor cage guinea pig'
  ],
  'guinea-pig-beds-houses': [
    'guinea pig house', 'guinea pig hideout', 'cavy house', 'guinea pig bed', 'guinea pig fleece bed',
    'guinea pig tunnel', 'guinea pig hut', 'wooden house guinea pig', 'guinea pig cave', 'guinea pig igloo'
  ],
  'guinea-pig-toys': [
    'guinea pig toy', 'cavy toy', 'guinea pig tunnel toy', 'guinea pig ball', 'guinea pig chew toy',
    'wooden chew guinea pig', 'guinea pig bridge', 'guinea pig activity toy'
  ],
  'guinea-pig-food-treats': [
    'guinea pig food', 'guinea pig pellet', 'guinea pig hay', 'timothy hay guinea pig', 'guinea pig treat',
    'guinea pig snack', 'cavy food', 'vitamin c guinea pig'
  ],
  'guinea-pig-accessories': [
    'guinea pig water bottle', 'guinea pig bowl', 'guinea pig feeder', 'hay rack guinea pig',
    'guinea pig bedding', 'guinea pig litter', 'guinea pig carrier', 'guinea pig grooming'
  ],

  // ============ REPTILE-SPECIFIC CATEGORIES ============
  'reptile-terrariums': [
    'reptile terrarium', 'reptile tank', 'reptile enclosure', 'reptile cage', 'snake tank',
    'gecko tank', 'bearded dragon tank', 'turtle tank', 'tortoise enclosure', 'lizard cage',
    'vivarium', 'glass terrarium reptile', 'screen cage reptile'
  ],
  'reptile-heating': [
    'reptile heat lamp', 'reptile heat mat', 'heating pad reptile', 'basking lamp reptile',
    'ceramic heat emitter', 'reptile thermostat', 'under tank heater', 'reptile heat rock',
    'reptile heat cable', 'infrared lamp reptile'
  ],
  'reptile-lighting': [
    'reptile uvb light', 'reptile uva light', 'basking light reptile', 'reptile light fixture',
    'reptile lamp', 'reptile light bulb', 'night light reptile', 'daylight lamp reptile',
    'reptile light hood', 'reptile fluorescent light'
  ],
  'reptile-food': [
    'reptile food', 'snake food', 'gecko food', 'bearded dragon food', 'turtle food', 'tortoise food',
    'reptile treat', 'freeze dried reptile food', 'reptile calcium', 'reptile supplement'
  ],
  'reptile-decorations': [
    'reptile decoration', 'terrarium decoration', 'reptile hide', 'reptile cave', 'reptile rock',
    'reptile branch', 'reptile vine', 'reptile plant', 'reptile background', 'reptile skull',
    'reptile wood', 'reptile log', 'basking platform reptile'
  ],
  'reptile-accessories': [
    'reptile water dish', 'reptile bowl', 'reptile substrate', 'reptile bedding', 'reptile carpet',
    'reptile moss', 'reptile humidity', 'reptile mister', 'reptile thermometer', 'reptile hygrometer',
    'reptile tongs', 'reptile feeding tongs', 'reptile hook', 'reptile carrier'
  ],

  // ============ GENERIC/MULTI-SPECIES CATEGORIES (fallback) ============
  'pet-supplies': [
    'pet supplies', 'pet accessory', 'pet essential', 'starter kit pet', 'new pet kit',
    'adoption kit', 'welcome kit pet', 'gift set pet', 'bundle pet'
  ],
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
