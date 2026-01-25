// Multi-warehouse optimization utilities

export interface Warehouse {
  code: string;
  name: string;
  region: string;
  priority: number;
}

export interface WarehouseOption {
  warehouseCode: string;
  warehouseName: string;
  logisticName: string;
  logisticPrice: number;
  logisticAging: string;
  estimatedDays: number;
  score: number;
}

// CJ Dropshipping warehouse codes
export const CJ_WAREHOUSES: Warehouse[] = [
  { code: 'US', name: 'United States', region: 'americas', priority: 1 },
  { code: 'CN', name: 'China', region: 'asia', priority: 2 },
  { code: 'DE', name: 'Germany', region: 'europe', priority: 1 },
  { code: 'UK', name: 'United Kingdom', region: 'europe', priority: 2 },
  { code: 'AU', name: 'Australia', region: 'oceania', priority: 1 },
  { code: 'TH', name: 'Thailand', region: 'asia', priority: 3 },
  { code: 'PH', name: 'Philippines', region: 'asia', priority: 4 },
  { code: 'ID', name: 'Indonesia', region: 'asia', priority: 4 },
  { code: 'MY', name: 'Malaysia', region: 'asia', priority: 4 },
  { code: 'SA', name: 'Saudi Arabia', region: 'middle_east', priority: 1 },
];

// Country to region mapping for optimal warehouse selection
export const COUNTRY_REGIONS: Record<string, string> = {
  // Americas
  US: 'americas', CA: 'americas', MX: 'americas', BR: 'americas', AR: 'americas',
  CL: 'americas', CO: 'americas', PE: 'americas', VE: 'americas', EC: 'americas',
  
  // Europe
  NL: 'europe', BE: 'europe', DE: 'europe', FR: 'europe', GB: 'europe',
  ES: 'europe', IT: 'europe', PT: 'europe', AT: 'europe', CH: 'europe',
  PL: 'europe', CZ: 'europe', SE: 'europe', NO: 'europe', DK: 'europe',
  FI: 'europe', IE: 'europe', GR: 'europe', HU: 'europe', RO: 'europe',
  
  // Asia
  CN: 'asia', JP: 'asia', KR: 'asia', TW: 'asia', HK: 'asia',
  SG: 'asia', TH: 'asia', VN: 'asia', MY: 'asia', PH: 'asia',
  ID: 'asia', IN: 'asia', PK: 'asia', BD: 'asia',
  
  // Oceania
  AU: 'oceania', NZ: 'oceania',
  
  // Middle East
  AE: 'middle_east', SA: 'middle_east', IL: 'middle_east', TR: 'middle_east',
  QA: 'middle_east', KW: 'middle_east', BH: 'middle_east', OM: 'middle_east',
  
  // Africa
  ZA: 'africa', EG: 'africa', NG: 'africa', KE: 'africa', MA: 'africa',
};

// Get optimal warehouses for a destination country
export function getOptimalWarehouses(destinationCountry: string): Warehouse[] {
  const region = COUNTRY_REGIONS[destinationCountry] || 'americas';
  
  // Prioritize warehouses in the same region, then by global priority
  return [...CJ_WAREHOUSES].sort((a, b) => {
    const aInRegion = a.region === region;
    const bInRegion = b.region === region;
    
    if (aInRegion && !bInRegion) return -1;
    if (!aInRegion && bInRegion) return 1;
    
    // Within same region preference, sort by priority
    return a.priority - b.priority;
  });
}

// Parse shipping aging string to estimated days
export function parseShippingDays(agingStr: string): number {
  if (!agingStr) return 30;
  
  // Format: "7-15 Days" or "10-20" or similar
  const match = agingStr.match(/(\d+)\s*[-~]\s*(\d+)/);
  if (match) {
    // Return average of min and max
    return Math.round((parseInt(match[1]) + parseInt(match[2])) / 2);
  }
  
  // Single number format
  const singleMatch = agingStr.match(/(\d+)/);
  if (singleMatch) {
    return parseInt(singleMatch[1]);
  }
  
  return 30; // Default fallback
}

// Calculate warehouse score (lower is better)
// Factors: price weight 0.4, speed weight 0.6
export function calculateWarehouseScore(
  price: number,
  estimatedDays: number,
  maxPrice: number,
  maxDays: number
): number {
  const priceScore = maxPrice > 0 ? (price / maxPrice) * 0.4 : 0;
  const speedScore = maxDays > 0 ? (estimatedDays / maxDays) * 0.6 : 0;
  return priceScore + speedScore;
}

// Select best warehouse option from multiple options
export function selectBestWarehouse(options: WarehouseOption[]): WarehouseOption | null {
  if (!options || options.length === 0) return null;
  
  // Sort by score (lower is better)
  const sorted = [...options].sort((a, b) => a.score - b.score);
  return sorted[0];
}
