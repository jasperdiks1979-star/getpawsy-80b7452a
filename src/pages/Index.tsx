export { categories, products, getFeaturedProducts, getProductsByCategory, getProductById, getProductBySlug, getProductBySlugOrId } from "@/data/products";
export type { Product } from "@/data/products";

// Commerce V2 storefront shell (Safe Copy). The legacy homepage stays available
// at @/components/home/HomePage for reference/rollback.
export { default } from "@/components/v2/storefront/V2HomePage";
