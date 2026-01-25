/**
 * Internal Linking Strategy for Blog Posts
 * Automatically converts keywords in blog content to internal links
 */

interface LinkableKeyword {
  keyword: string;
  url: string;
  type: 'product' | 'category' | 'blog';
  priority: number; // Higher priority = more likely to be linked
}

interface Product {
  id: string;
  name: string;
  slug?: string | null;
  category: string | null;
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

// Convert string to URL-friendly slug
const toSlug = (str: string): string => {
  return str
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
};

// Common pet-related keywords that should link to categories
// Extended with more synonyms and product-specific terms for better SEO linking
const categoryKeywords: Record<string, string[]> = {
  // Dog categories
  'dogs': ['dog', 'dogs', 'puppy', 'puppies', 'canine', 'canines', 'pup', 'pups', 'doggy', 'pooch', 'pet dog', 'furry friend'],
  'dog-beds': ['dog bed', 'dog beds', 'pet bed', 'orthopedic bed', 'memory foam bed', 'elevated bed', 'cooling bed', 'heated bed', 'dog cushion', 'dog mattress'],
  'dog-collars-leashes': ['dog collar', 'dog leash', 'collar', 'leash', 'harness', 'dog harness', 'training leash', 'retractable leash', 'walking leash', 'slip lead', 'martingale'],
  'dog-houses': ['dog house', 'dog kennel', 'outdoor kennel', 'dog crate', 'dog cage', 'pet carrier', 'travel crate'],
  'dog-carriers': ['dog carrier', 'pet carrier', 'travel carrier', 'airline carrier', 'soft carrier', 'backpack carrier', 'dog stroller', 'pet stroller'],
  'dog-stairs': ['dog stairs', 'pet stairs', 'dog steps', 'pet ramp', 'dog ramp'],
  
  // Cat categories
  'cats': ['cat', 'cats', 'kitten', 'kittens', 'feline', 'felines', 'kitty', 'kitties', 'indoor cat', 'pet cat'],
  'cat-beds': ['cat bed', 'cat beds', 'cat cushion', 'cat hammock', 'window perch', 'cat cave', 'heated cat bed'],
  'cat-trees': ['cat tree', 'cat trees', 'scratching post', 'scratch post', 'cat tower', 'cat condo', 'climbing tower', 'cat furniture', 'cat playground'],
  'cat-furniture': ['cat furniture', 'cat shelf', 'cat shelves', 'wall mounted', 'cat perch', 'cat bridge'],
  'litter-boxes': ['litter box', 'litter boxes', 'automatic litter box', 'self-cleaning litter box', 'cat litter', 'litter tray', 'enclosed litter box', 'covered litter box', 'smart litter box'],
  'scratching-posts': ['scratching post', 'scratch pad', 'cardboard scratcher', 'sisal post', 'cat scratcher'],
  'chase-toys': ['chase toy', 'cat toy', 'cat toys', 'feather toy', 'laser pointer', 'interactive toy', 'wand toy', 'mouse toy'],
  
  // Bird categories
  'birds': ['bird', 'birds', 'parrot', 'parrots', 'parakeet', 'cockatiel', 'budgie', 'canary', 'finch', 'pet bird'],
  'bird-cages': ['bird cage', 'bird cages', 'aviary', 'flight cage', 'parrot cage', 'travel cage'],
  'bird-feeders': ['bird feeder', 'bird feeders', 'seed feeder', 'water dispenser', 'feeding bowl', 'bird bath'],
  'bird-toys': ['bird toy', 'bird toys', 'bird swing', 'bird perch', 'foraging toy', 'chew toy', 'climbing toy'],
  
  // Fish & Aquarium
  'fish': ['fish', 'tropical fish', 'goldfish', 'betta', 'guppy', 'aquatic pet'],
  'fish-tank': ['aquarium', 'fish tank', 'tank', 'nano tank', 'planted tank', 'saltwater tank', 'freshwater tank', 'aquarium kit'],
  
  // Small pets
  'small-pets': ['small pet', 'small pets', 'pocket pet', 'exotic pet'],
  'hamsters': ['hamster', 'hamsters', 'dwarf hamster', 'syrian hamster'],
  'hamster-cages': ['hamster cage', 'hamster habitat', 'hamster house', 'hamster wheel', 'exercise wheel'],
  'hamster-wheels': ['hamster wheel', 'exercise wheel', 'silent wheel', 'running wheel'],
  'rabbits': ['rabbit', 'rabbits', 'bunny', 'bunnies', 'pet rabbit'],
  'rabbit-cages': ['rabbit cage', 'rabbit hutch', 'bunny cage', 'rabbit pen', 'rabbit enclosure'],
  'guinea-pigs': ['guinea pig', 'guinea pigs', 'cavy', 'cavies'],
  'guinea-pig-cages': ['guinea pig cage', 'guinea pig habitat', 'cavy cage', 'c&c cage'],
  'guinea-pig-toys': ['guinea pig toy', 'guinea pig toys', 'hideout', 'tunnel', 'hay feeder'],
  
  // Reptiles
  'reptiles': ['reptile', 'reptiles', 'lizard', 'gecko', 'bearded dragon', 'snake', 'turtle', 'tortoise'],
  'reptile-terrariums': ['terrarium', 'reptile tank', 'vivarium', 'reptile enclosure', 'reptile habitat'],
  'reptile-lighting': ['heat lamp', 'uvb light', 'basking light', 'reptile lighting', 'heat mat'],
  
  // General pet supplies
  'pet-food': ['pet food', 'dog food', 'cat food', 'treats', 'snacks', 'kibble', 'wet food', 'dry food', 'raw diet', 'premium food', 'grain-free'],
  'feeding': ['food bowl', 'water bowl', 'feeding bowl', 'slow feeder', 'automatic feeder', 'smart feeder', 'elevated bowl', 'stainless steel bowl'],
  'drinking': ['water fountain', 'pet fountain', 'water dispenser', 'drinking fountain', 'filtered water'],
  'pet-toys': ['pet toy', 'pet toys', 'interactive toy', 'puzzle toy', 'enrichment toy', 'chew toy', 'squeaky toy', 'plush toy', 'rope toy', 'ball toy'],
  'pet-accessories': ['pet accessory', 'accessories', 'pet supplies', 'pet products', 'pet gear'],
  'pet-grooming': ['grooming', 'pet grooming', 'brush', 'comb', 'nail clipper', 'nail trimmer', 'shampoo', 'conditioner', 'deshedding', 'grooming kit', 'fur care', 'coat care'],
  'pet-beds': ['pet bed', 'pet beds', 'sleeping pad', 'pet cushion', 'cozy bed', 'washable bed', 'waterproof bed'],
  'pet-houses': ['pet house', 'pet shelter', 'outdoor house', 'indoor house'],
  'pet-strollers': ['pet stroller', 'dog stroller', 'cat stroller', 'pet jogger', 'pet buggy', 'pet pram'],
  'pet-gates': ['pet gate', 'dog gate', 'baby gate', 'safety gate', 'barrier gate', 'pressure mount gate'],
  'pet-hair-care': ['deshedding tool', 'fur remover', 'lint roller', 'pet hair brush', 'undercoat rake'],
  'collars-leashes': ['collar', 'leash', 'harness', 'pet collar', 'pet leash', 'id tag', 'name tag'],
  'training': ['training', 'dog training', 'puppy training', 'clicker training', 'training treat', 'training pad', 'pee pad', 'potty training'],
  'snacks': ['dog treat', 'cat treat', 'pet treat', 'training treat', 'dental treat', 'healthy snack', 'natural treat'],
  'houses': ['pet house', 'dog house', 'cat house', 'outdoor shelter', 'indoor house'],
  'hammocks': ['pet hammock', 'cat hammock', 'window hammock', 'hanging bed', 'suspended bed'],
  'nests': ['pet nest', 'bird nest', 'nesting box', 'breeding box', 'cozy nest'],
  'furniture': ['pet furniture', 'cat furniture', 'dog furniture', 'modern pet', 'designer pet'],
  'bags': ['pet bag', 'carrier bag', 'travel bag', 'tote carrier', 'sling carrier'],
  'supplies': ['pet supplies', 'pet essentials', 'pet care', 'pet products', 'pet accessories'],
};

// Product-specific keyword phrases for better matching
// These are common phrases that appear in blog content and should link to relevant products
const productPhrases: Record<string, string> = {
  // Litter boxes
  'automatic litter box': 'litter-boxes',
  'self-cleaning litter': 'litter-boxes',
  'smart litter box': 'litter-boxes',
  'enclosed litter box': 'litter-boxes',
  'litter robot': 'litter-boxes',
  'odor control litter': 'litter-boxes',
  
  // Pet tech & GPS
  'gps tracker': 'pet-accessories',
  'gps pet tracker': 'pet-accessories',
  'pet camera': 'pet-accessories',
  'smart pet': 'pet-accessories',
  'pet monitor': 'pet-accessories',
  'treat dispenser camera': 'pet-accessories',
  'wifi pet camera': 'pet-accessories',
  'two-way audio': 'pet-accessories',
  'location tracker': 'pet-accessories',
  'activity monitor': 'pet-accessories',
  
  // Feeding
  'automatic feeder': 'feeding',
  'automatic pet feeder': 'feeding',
  'smart feeder': 'feeding',
  'slow feeder bowl': 'feeding',
  'elevated feeder': 'feeding',
  'puzzle feeder': 'feeding',
  'portion control': 'feeding',
  'timed feeder': 'feeding',
  'gravity feeder': 'feeding',
  
  // Water fountains
  'water fountain': 'drinking',
  'cat water fountain': 'drinking',
  'pet water fountain': 'drinking',
  'filtered water fountain': 'drinking',
  'stainless steel fountain': 'drinking',
  'ceramic fountain': 'drinking',
  
  // Health & comfort - Dog beds
  'orthopedic dog bed': 'dog-beds',
  'orthopedic bed': 'dog-beds',
  'memory foam dog': 'dog-beds',
  'memory foam bed': 'dog-beds',
  'cooling mat': 'pet-beds',
  'heated pet bed': 'pet-beds',
  'bolster bed': 'dog-beds',
  'calming bed': 'dog-beds',
  'waterproof bed': 'dog-beds',
  'joint support': 'dog-beds',
  
  // Interactive toys & puzzles
  'puzzle toy': 'pet-toys',
  'interactive puzzle': 'pet-toys',
  'treat puzzle': 'pet-toys',
  'brain game': 'pet-toys',
  'mental stimulation': 'pet-toys',
  'enrichment toy': 'pet-toys',
  'snuffle mat': 'pet-toys',
  'kong toy': 'pet-toys',
  
  // Travel & carriers
  'airline approved': 'pet-carriers',
  'travel carrier': 'pet-carriers',
  'pet backpack': 'pet-carriers',
  'portable carrier': 'pet-carriers',
  'soft-sided carrier': 'pet-carriers',
  'expandable carrier': 'pet-carriers',
  'rolling carrier': 'pet-carriers',
  'car seat carrier': 'pet-carriers',
  
  // Anxiety & calming
  'anxiety vest': 'training',
  'calming vest': 'training',
  'thundershirt': 'training',
  'compression wrap': 'training',
  'calming aid': 'training',
  'stress relief': 'training',
  'separation anxiety': 'training',
  
  // Training
  'training collar': 'training',
  'bark collar': 'training',
  'invisible fence': 'training',
  'pet door': 'pet-accessories',
  'clicker training': 'training',
  'training treat': 'snacks',
  
  // Grooming
  'nail grinder': 'pet-grooming',
  'pet dryer': 'pet-grooming',
  'grooming table': 'pet-grooming',
  'dematting comb': 'pet-grooming',
  'deshedding brush': 'pet-grooming',
  'slicker brush': 'pet-grooming',
};

// Common stop words to exclude from keyword extraction
const stopWords = new Set([
  'with', 'for', 'and', 'the', 'from', 'that', 'this', 'have', 'has',
  'your', 'their', 'they', 'will', 'can', 'all', 'are', 'was', 'were',
  'been', 'being', 'each', 'which', 'when', 'where', 'while', 'than',
  'then', 'into', 'over', 'under', 'after', 'before', 'between', 'about',
  'through', 'during', 'without', 'again', 'further', 'once', 'here',
  'there', 'very', 'just', 'more', 'most', 'other', 'some', 'such',
  'only', 'same', 'also', 'back', 'even', 'still', 'well', 'made',
  'make', 'like', 'size', 'type', 'inch', 'large', 'small', 'medium',
  'pack', 'piece', 'count', 'style', 'color', 'white', 'black', 'blue',
  'pink', 'gray', 'grey', 'green', 'brown', 'multi'
]);

// Generate linkable keywords from products
export const generateProductKeywords = (products: Product[]): LinkableKeyword[] => {
  const keywords: LinkableKeyword[] = [];
  
  products.forEach((product) => {
    if (!product.name || !product.slug) return;
    
    const productUrl = `/product/${product.slug}`;
    const productNameLower = product.name.toLowerCase().trim();
    
    // Add full product name as keyword (highest priority)
    keywords.push({
      keyword: productNameLower,
      url: productUrl,
      type: 'product',
      priority: 10,
    });
    
    // Extract 2-3 word phrases from product name for better matching
    const words = productNameLower.split(/\s+/).filter(w => w.length >= 3);
    
    // Create 2-word combinations
    for (let i = 0; i < words.length - 1; i++) {
      const twoWordPhrase = `${words[i]} ${words[i + 1]}`;
      if (!stopWords.has(words[i]) && !stopWords.has(words[i + 1])) {
        keywords.push({
          keyword: twoWordPhrase,
          url: productUrl,
          type: 'product',
          priority: 7,
        });
      }
    }
    
    // Create 3-word combinations for more specific matches
    for (let i = 0; i < words.length - 2; i++) {
      const hasStopWord = [words[i], words[i + 1], words[i + 2]].some(w => stopWords.has(w));
      if (!hasStopWord) {
        const threeWordPhrase = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
        keywords.push({
          keyword: threeWordPhrase,
          url: productUrl,
          type: 'product',
          priority: 8,
        });
      }
    }
    
    // Extract significant individual words (longer words, not stop words)
    words.forEach((word) => {
      if (word.length >= 6 && !stopWords.has(word)) {
        keywords.push({
          keyword: word,
          url: productUrl,
          type: 'product',
          priority: 3,
        });
      }
    });
  });
  
  return keywords;
};

// Generate linkable keywords from categories
export const generateCategoryKeywords = (categories: Category[]): LinkableKeyword[] => {
  const keywords: LinkableKeyword[] = [];
  
  categories.forEach((category) => {
    const categoryUrl = `/products?category=${category.slug}`;
    
    // Add category name
    keywords.push({
      keyword: category.name.toLowerCase(),
      url: categoryUrl,
      type: 'category',
      priority: 8,
    });
    
    // Add predefined keywords for this category
    const slug = category.slug.toLowerCase();
    const predefinedKeywords = categoryKeywords[slug] || [];
    predefinedKeywords.forEach((kw) => {
      keywords.push({
        keyword: kw.toLowerCase(),
        url: categoryUrl,
        type: 'category',
        priority: 6,
      });
    });
  });
  
  // Add fallback category keywords
  Object.entries(categoryKeywords).forEach(([slug, kws]) => {
    kws.forEach((kw) => {
      if (!keywords.some(k => k.keyword === kw.toLowerCase())) {
        keywords.push({
          keyword: kw.toLowerCase(),
          url: `/products?category=${slug}`,
          type: 'category',
          priority: 4,
        });
      }
    });
  });
  
  // Add product phrase keywords (high priority multi-word matches)
  Object.entries(productPhrases).forEach(([phrase, categorySlug]) => {
    keywords.push({
      keyword: phrase.toLowerCase(),
      url: `/products?category=${categorySlug}`,
      type: 'category',
      priority: 9, // High priority for specific phrases
    });
  });
  
  return keywords;
};

// Process HTML content and add internal links
export const addInternalLinks = (
  htmlContent: string,
  products: Product[],
  categories: Category[],
  options: {
    maxLinksPerKeyword?: number;
    maxTotalLinks?: number;
    minWordsBetweenLinks?: number;
  } = {}
): string => {
  // Safety check - ensure we have a valid string
  if (!htmlContent || typeof htmlContent !== 'string') {
    return '';
  }

  const {
    maxLinksPerKeyword = 1,
    maxTotalLinks = 10,
    minWordsBetweenLinks = 50,
  } = options;
  
  try {
    // Generate all linkable keywords
    const productKeywords = generateProductKeywords(products);
    const categoryKeywordsGenerated = generateCategoryKeywords(categories);
    
    // Combine and sort by priority (highest first) and length (longest first for better matching)
    const allKeywords = [...productKeywords, ...categoryKeywordsGenerated]
      .sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return b.keyword.length - a.keyword.length;
      });
    
    // Track linked keywords and positions
    const linkedKeywords = new Map<string, number>();
    let totalLinksAdded = 0;
    let lastLinkPosition = -minWordsBetweenLinks;
    
    // Process content
    let processedContent = String(htmlContent);
    
    // Don't process if already has many links
    const existingLinkCount = (htmlContent.match(/<a\s/gi) || []).length;
    if (existingLinkCount > 5) {
      return htmlContent;
    }
    
    for (const { keyword, url, type } of allKeywords) {
      if (totalLinksAdded >= maxTotalLinks) break;
      
      const timesLinked = linkedKeywords.get(keyword) || 0;
      if (timesLinked >= maxLinksPerKeyword) continue;
      
      // Create regex to match keyword (case insensitive, word boundaries)
      // Avoid matching inside existing tags or links
      const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(
        `(?<![<\\/a-zA-Z])\\b(${escapedKeyword})\\b(?![^<]*>)(?![^<]*<\\/a>)`,
        'gi'
      );
      
      // Find first match that's far enough from last link
      let match: RegExpExecArray | null;
      
      while ((match = regex.exec(processedContent)) !== null) {
        // Estimate word position (rough calculation)
        const textBeforeMatch = processedContent.substring(0, match.index).replace(/<[^>]+>/g, '');
        const wordPosition = textBeforeMatch.split(/\s+/).length;
        
        // Check if we're far enough from last link
        if (wordPosition - lastLinkPosition < minWordsBetweenLinks) {
          continue;
        }
        
        // Check if we're inside a heading, link, or code block
        const beforeMatch = processedContent.substring(Math.max(0, match.index - 200), match.index);
        if (
          /<(h[1-6]|a|code|pre|script|style)[^>]*>(?![^<]*<\/\1>)[^<]*$/i.test(beforeMatch) ||
          /<a\s[^>]*>[^<]*$/i.test(beforeMatch)
        ) {
          continue;
        }
        
        // Create the link - ensure match[1] is a string
        const matchedText = String(match[1] || keyword);
        const linkClass = type === 'product' 
          ? 'internal-link internal-link-product' 
          : 'internal-link internal-link-category';
        
        const replacement = `<a href="${url}" class="${linkClass}" data-internal-link="${type}">${matchedText}</a>`;
        
        // Replace only this occurrence
        processedContent = 
          processedContent.substring(0, match.index) + 
          replacement + 
          processedContent.substring(match.index + match[0].length);
        
        // Update tracking
        linkedKeywords.set(keyword, timesLinked + 1);
        totalLinksAdded++;
        lastLinkPosition = wordPosition;
        break;
      }
    }
    
    return processedContent;
  } catch (error) {
    console.error('Error in addInternalLinks:', error);
    return htmlContent;
  }
};

// Process plain text/markdown content
export const addInternalLinksToText = (
  textContent: string,
  products: Product[],
  categories: Category[],
  options?: {
    maxLinksPerKeyword?: number;
    maxTotalLinks?: number;
  }
): string => {
  // For plain text, wrap in paragraph first
  const htmlContent = `<p>${textContent}</p>`;
  return addInternalLinks(htmlContent, products, categories, options);
};
