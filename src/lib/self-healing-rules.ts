 /**
  * Self-Healing Rules Configuration
  * 
  * Defines the rules for automatic UI fallbacks.
  * All rules are:
  * - Reversible
  * - Logged
  * - Never modify database values
  * - Never touch pricing or payments
  */
 
 export interface SelfHealingRule {
   id: string;
   name: string;
   description: string;
   component: string;
   triggerCondition: string;
   fallbackAction: string;
   permanentFix: string;
   enabled: boolean;
 }
 
 export const SELF_HEALING_RULES: SelfHealingRule[] = [
   {
     id: 'category_empty',
     name: 'Empty Category Fallback',
     description: 'Parent category shows 0 products',
     component: 'Products.tsx / CategoryEmptyState.tsx',
     triggerCondition: 'filteredProducts.length === 0 && category has descendants',
     fallbackAction: 'Render top products from child categories + bestsellers grid',
     permanentFix: 'Check product-category assignments in database',
     enabled: true,
   },
   {
     id: 'bestseller_broken',
     name: 'Broken Bestseller Fallback',
     description: 'Bestseller page product is missing or inactive',
     component: 'BestsellerDetail.tsx',
     triggerCondition: 'product is null OR product.is_active === false',
     fallbackAction: 'Show fallback bestseller collection with similar products',
     permanentFix: 'Deactivate broken bestseller or update product reference',
     enabled: true,
   },
   {
     id: 'stock_mismatch',
     name: 'Stock Logic Fallback',
     description: 'Active dropship product incorrectly shows Out of Stock',
     component: 'AddToCartButton.tsx / availability.ts',
     triggerCondition: 'product.is_active === true BUT UI shows out of stock',
     fallbackAction: 'Use computeAvailability() result - treat as In Stock',
     permanentFix: 'Ensure all availability checks use centralized computeAvailability()',
     enabled: true,
   },
   {
     id: 'gallery_error',
     name: 'Gallery Error Fallback',
     description: 'Product gallery fails to load or all images broken',
     component: 'ProductGallery.tsx',
     triggerCondition: 'All gallery images fail to load OR embla carousel errors',
     fallbackAction: 'Switch to static image display with primary image',
     permanentFix: 'Check image URLs in product data, verify CDN availability',
     enabled: true,
   },
   {
     id: 'cart_corruption',
     name: 'Cart Data Corruption',
     description: 'Cart localStorage data is corrupted or invalid',
     component: 'CartProvider.tsx / data-healer.ts',
     triggerCondition: 'JSON parse fails OR cart items have invalid structure',
     fallbackAction: 'Reset cart to empty state, show recovery toast',
     permanentFix: 'Add validation before cart writes, check for race conditions',
     enabled: true,
   },
   {
     id: 'search_empty',
     name: 'Search No Results Fallback',
     description: 'Search query returns 0 results',
     component: 'Products.tsx / DidYouMeanSection.tsx',
     triggerCondition: 'searchQuery.length > 0 AND filteredProducts.length === 0',
     fallbackAction: 'Show popular products + "Did you mean?" suggestions',
     permanentFix: 'Improve search indexing, add fuzzy matching',
     enabled: true,
   },
 ];
 
 /**
  * Get a specific self-healing rule by ID
  */
 export function getRule(id: string): SelfHealingRule | undefined {
   return SELF_HEALING_RULES.find(r => r.id === id);
 }
 
 /**
  * Get all enabled self-healing rules
  */
 export function getEnabledRules(): SelfHealingRule[] {
   return SELF_HEALING_RULES.filter(r => r.enabled);
 }
 
 /**
  * Format rule for logging
  */
 export function formatRuleForLog(rule: SelfHealingRule): string {
   return `[${rule.id}] ${rule.name}: ${rule.fallbackAction} | Fix: ${rule.permanentFix}`;
 }