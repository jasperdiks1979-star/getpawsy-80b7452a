/**
 * Product matching utilities for comparing own products with competitor products
 */

/**
 * Calculate string similarity using Levenshtein distance
 */
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  
  if (m === 0) return n;
  if (n === 0) return m;
  
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  
  return dp[m][n];
}

/**
 * Calculate similarity percentage between two strings
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 100;
  
  const maxLength = Math.max(s1.length, s2.length);
  if (maxLength === 0) return 100;
  
  const distance = levenshteinDistance(s1, s2);
  const similarity = ((maxLength - distance) / maxLength) * 100;
  
  return Math.round(similarity);
}

/**
 * Extract keywords from product name for matching
 */
export function extractKeywords(productName: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'for', 'with', 'in', 'on', 'at', 'to',
    'of', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
    'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'pet', 'pets',
  ]);
  
  return productName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
}

/**
 * Calculate keyword overlap score between two product names
 */
export function calculateKeywordScore(name1: string, name2: string): number {
  const keywords1 = new Set(extractKeywords(name1));
  const keywords2 = new Set(extractKeywords(name2));
  
  if (keywords1.size === 0 || keywords2.size === 0) return 0;
  
  const intersection = new Set([...keywords1].filter(x => keywords2.has(x)));
  const union = new Set([...keywords1, ...keywords2]);
  
  // Jaccard similarity * 100
  return Math.round((intersection.size / union.size) * 100);
}

/**
 * Calculate combined match score between two products
 */
export function calculateMatchScore(ownProductName: string, competitorProductName: string): number {
  const stringSimilarity = calculateSimilarity(ownProductName, competitorProductName);
  const keywordScore = calculateKeywordScore(ownProductName, competitorProductName);
  
  // Weight: 40% string similarity, 60% keyword overlap
  const combinedScore = Math.round(stringSimilarity * 0.4 + keywordScore * 0.6);
  
  return Math.min(100, combinedScore);
}

export interface OwnProduct {
  id: string;
  name: string;
  price: number;
  cost_price?: number | null;
}

export interface CompetitorProduct {
  id: string;
  competitor: string;
  product_name: string;
  price?: number | null;
  current_rank: number;
}

export interface ProductMatchResult {
  ownProduct: OwnProduct;
  competitorProduct: CompetitorProduct;
  matchScore: number;
  priceDifference: number | null;
  pricePercentage: number | null;
}

/**
 * Find best matches for own products among competitor products
 */
export function findProductMatches(
  ownProducts: OwnProduct[],
  competitorProducts: CompetitorProduct[],
  minScore: number = 40
): ProductMatchResult[] {
  const matches: ProductMatchResult[] = [];
  
  for (const ownProduct of ownProducts) {
    let bestMatch: ProductMatchResult | null = null;
    
    for (const competitorProduct of competitorProducts) {
      const matchScore = calculateMatchScore(ownProduct.name, competitorProduct.product_name);
      
      if (matchScore >= minScore) {
        const priceDifference = competitorProduct.price != null
          ? ownProduct.price - competitorProduct.price
          : null;
          
        const pricePercentage = competitorProduct.price != null && competitorProduct.price > 0
          ? Math.round(((ownProduct.price - competitorProduct.price) / competitorProduct.price) * 100)
          : null;
        
        const result: ProductMatchResult = {
          ownProduct,
          competitorProduct,
          matchScore,
          priceDifference,
          pricePercentage,
        };
        
        if (!bestMatch || matchScore > bestMatch.matchScore) {
          bestMatch = result;
        }
      }
    }
    
    if (bestMatch) {
      matches.push(bestMatch);
    }
  }
  
  // Sort by match score descending
  return matches.sort((a, b) => b.matchScore - a.matchScore);
}
