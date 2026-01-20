import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { RefreshCw, Play, CheckCircle, AlertCircle, ArrowRight } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Category {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
}

interface Product {
  id: string;
  name: string;
  category: string | null;
}

interface RecategorizationResult {
  productId: string;
  productName: string;
  oldCategory: string | null;
  newCategory: string;
  newCategorySlug: string;
  score: number;
  matchedKeywords: string[];
  changed: boolean;
}

// Category mapping: keywords to database category slugs
const CATEGORY_KEYWORD_MAP: Record<string, string[]> = {
  // DOG-SPECIFIC CATEGORIES
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

  // CAT-SPECIFIC CATEGORIES
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

  // BIRD-SPECIFIC CATEGORIES
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

  // FISH & AQUARIUM CATEGORIES
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

  // HAMSTER-SPECIFIC CATEGORIES
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

  // RABBIT-SPECIFIC CATEGORIES
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

  // GUINEA PIG-SPECIFIC CATEGORIES
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

  // REPTILE-SPECIFIC CATEGORIES
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

  // GENERIC KEYWORDS FOR ANIMAL DETECTION (used for fallback to main category)
  'dogs': ['dog', 'puppy', 'canine', 'pup'],
  'cats': ['cat', 'kitten', 'feline', 'kitty'],
  'birds': ['bird', 'parrot', 'parakeet', 'budgie', 'cockatiel', 'canary', 'finch'],
  'fish-aquarium': ['fish', 'aquarium', 'aquatic', 'tank'],
  'hamsters': ['hamster', 'dwarf hamster', 'syrian hamster'],
  'rabbits': ['rabbit', 'bunny', 'hare'],
  'guinea-pigs': ['guinea pig', 'cavy', 'guinea'],
  'reptiles': ['reptile', 'snake', 'gecko', 'lizard', 'turtle', 'tortoise', 'bearded dragon'],
};

function matchProductToCategory(productName: string, availableCategories: Category[]): {
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  score: number;
  matchedKeywords: string[];
} | null {
  const lowerName = productName.toLowerCase();
  const categoryBySlug = new Map(availableCategories.map(c => [c.slug, c]));
  
  const scores: { slug: string; score: number; matchedKeywords: string[] }[] = [];
  
  for (const [slug, keywords] of Object.entries(CATEGORY_KEYWORD_MAP)) {
    if (!categoryBySlug.has(slug)) continue;
    
    let score = 0;
    const matchedKeywords: string[] = [];
    
    for (const keyword of keywords) {
      const lowerKeyword = keyword.toLowerCase();
      if (lowerName.includes(lowerKeyword)) {
        score += lowerKeyword.length * 2;
        matchedKeywords.push(keyword);
      }
    }
    
    if (score > 0) {
      scores.push({ slug, score, matchedKeywords });
    }
  }
  
  scores.sort((a, b) => b.score - a.score);
  
  if (scores.length > 0) {
    const bestMatch = scores[0];
    const category = categoryBySlug.get(bestMatch.slug)!;
    return {
      categoryId: category.id,
      categoryName: category.name,
      categorySlug: category.slug,
      score: bestMatch.score,
      matchedKeywords: bestMatch.matchedKeywords,
    };
  }
  
  return null;
}

export function ProductRecategorizer() {
  const queryClient = useQueryClient();
  const [results, setResults] = useState<RecategorizationResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Fetch all categories
  const { data: categories = [] } = useQuery({
    queryKey: ['categories-for-recategorization'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, slug, parent_id');
      if (error) throw error;
      return data as Category[];
    },
  });

  // Fetch all products
  const { data: products = [] } = useQuery({
    queryKey: ['products-for-recategorization'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, category');
      if (error) throw error;
      return data as Product[];
    },
  });

  // Analyze products
  const analyzeProducts = () => {
    setIsAnalyzing(true);
    setResults([]);
    setProgress(0);

    const newResults: RecategorizationResult[] = [];
    
    products.forEach((product, index) => {
      const match = matchProductToCategory(product.name, categories);
      
      if (match) {
        newResults.push({
          productId: product.id,
          productName: product.name,
          oldCategory: product.category,
          newCategory: match.categoryName,
          newCategorySlug: match.categorySlug,
          score: match.score,
          matchedKeywords: match.matchedKeywords,
          changed: product.category !== match.categoryName,
        });
      }
      
      setProgress(((index + 1) / products.length) * 100);
    });

    setResults(newResults);
    setIsAnalyzing(false);
  };

  // Apply recategorization
  const applyMutation = useMutation({
    mutationFn: async () => {
      const changedProducts = results.filter(r => r.changed);
      let completed = 0;

      for (const result of changedProducts) {
        // Find the category ID
        const category = categories.find(c => c.slug === result.newCategorySlug);
        if (!category) continue;

        // Update product category
        const { error: updateError } = await supabase
          .from('products')
          .update({ category: result.newCategory })
          .eq('id', result.productId);

        if (updateError) {
          console.error(`Error updating product ${result.productId}:`, updateError);
          continue;
        }

        // Delete existing category links
        await supabase
          .from('product_categories')
          .delete()
          .eq('product_id', result.productId);

        // Insert new category link
        const { error: linkError } = await supabase
          .from('product_categories')
          .insert({
            product_id: result.productId,
            category_id: category.id,
          });

        if (linkError) {
          console.error(`Error linking product ${result.productId} to category:`, linkError);
        }

        completed++;
        setProgress((completed / changedProducts.length) * 100);
      }

      return completed;
    },
    onSuccess: (count) => {
      toast.success(`${count} producten succesvol gehercategoriseerd!`);
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (error) => {
      toast.error('Fout bij hercategoriseren: ' + error.message);
    },
  });

  const changedCount = results.filter(r => r.changed).length;
  const unchangedCount = results.filter(r => !r.changed).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5" />
          Product Hercategorisatie
        </CardTitle>
        <CardDescription>
          Analyseer en hercategoriseer alle producten naar de nieuwe diersoort-specifieke subcategorieën.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button 
            onClick={analyzeProducts} 
            disabled={isAnalyzing || products.length === 0}
          >
            {isAnalyzing ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Analyseren...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Analyseer {products.length} Producten
              </>
            )}
          </Button>

          {results.length > 0 && changedCount > 0 && (
            <Button 
              onClick={() => applyMutation.mutate()}
              disabled={applyMutation.isPending}
              variant="default"
            >
              {applyMutation.isPending ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Toepassen...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Pas {changedCount} Wijzigingen Toe
                </>
              )}
            </Button>
          )}
        </div>

        {(isAnalyzing || applyMutation.isPending) && (
          <Progress value={progress} className="w-full" />
        )}

        {results.length > 0 && (
          <div className="space-y-4">
            <div className="flex gap-4">
              <Badge variant="default" className="text-sm">
                <CheckCircle className="mr-1 h-3 w-3" />
                {changedCount} te wijzigen
              </Badge>
              <Badge variant="secondary" className="text-sm">
                {unchangedCount} ongewijzigd
              </Badge>
            </div>

            <ScrollArea className="h-[400px] rounded-md border">
              <div className="p-4 space-y-2">
                {results.filter(r => r.changed).slice(0, 100).map((result) => (
                  <div 
                    key={result.productId}
                    className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 text-sm"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{result.productName}</p>
                      <div className="flex items-center gap-2 text-muted-foreground text-xs">
                        <span className="text-destructive">{result.oldCategory || 'Geen'}</span>
                        <ArrowRight className="h-3 w-3" />
                        <span className="text-primary font-medium">{result.newCategory}</span>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      Score: {result.score}
                    </Badge>
                  </div>
                ))}
                {results.filter(r => r.changed).length > 100 && (
                  <p className="text-center text-muted-foreground text-sm py-2">
                    ... en {results.filter(r => r.changed).length - 100} meer
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        {results.length === 0 && !isAnalyzing && products.length > 0 && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            Klik op "Analyseer" om te beginnen
          </div>
        )}
      </CardContent>
    </Card>
  );
}
