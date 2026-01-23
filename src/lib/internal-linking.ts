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
const categoryKeywords: Record<string, string[]> = {
  'dogs': ['dog', 'dogs', 'puppy', 'puppies', 'canine', 'hond', 'honden', 'pup'],
  'cats': ['cat', 'cats', 'kitten', 'kittens', 'feline', 'kat', 'katten'],
  'pet-food': ['pet food', 'dog food', 'cat food', 'treats', 'snacks', 'voer', 'eten'],
  'pet-toys': ['toys', 'toy', 'play', 'speelgoed', 'spelen'],
  'pet-accessories': ['accessories', 'collar', 'leash', 'accessoires', 'halsband', 'riem'],
  'pet-grooming': ['grooming', 'brush', 'shampoo', 'verzorging', 'borstel'],
  'pet-beds': ['bed', 'beds', 'sleeping', 'mand', 'slaapplaats'],
  'cat-trees': ['cat tree', 'scratching post', 'krabpaal'],
  'fish': ['fish', 'aquarium', 'tank', 'vissen', 'aquarium'],
  'birds': ['bird', 'birds', 'vogel', 'vogels'],
  'small-pets': ['hamster', 'rabbit', 'guinea pig', 'konijn', 'cavia'],
};

// Generate linkable keywords from products
export const generateProductKeywords = (products: Product[]): LinkableKeyword[] => {
  const keywords: LinkableKeyword[] = [];
  
  products.forEach((product) => {
    const productUrl = `/product/${product.slug || product.id}`;
    
    // Add full product name as keyword
    keywords.push({
      keyword: product.name.toLowerCase(),
      url: productUrl,
      type: 'product',
      priority: 10,
    });
    
    // Extract significant words from product name (3+ characters)
    const words = product.name.toLowerCase().split(/\s+/);
    words.forEach((word) => {
      if (word.length >= 5 && !['with', 'for', 'and', 'the', 'from'].includes(word)) {
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
  
  // Add fallback category keywords if no categories provided
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
