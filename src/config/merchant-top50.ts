/**
 * ─────────────────────────────────────────────────────────
 *  MERCHANT TOP 50 — Google-Safe Primary Export Set
 * ─────────────────────────────────────────────────────────
 *
 *  This is the deterministic, curated set of product IDs
 *  approved for the primary Google Merchant feed export.
 *
 *  Only products in this set are exported to the main feed.
 *  All others go to a "holdout/review" queue.
 *
 *  Selection criteria (weighted scoring):
 *   - Policy safety (25%)       — no shock/electric/aversive
 *   - Category confidence (15%) — high-priority safe categories
 *   - Title quality (10%)       — clean, specific, no dupes
 *   - Description quality (10%) — factual, consumer-facing
 *   - Landing page (15%)        — canonical URL resolves
 *   - Image clarity (10%)       — valid product image
 *   - Conversion readiness (10%)— price sweet spot $25–$200
 *   - Trustworthiness (5%)      — consistent site/feed data
 *
 *  Categories represented:
 *   Cat Litter Boxes (7), Cat Trees & Condos (8), Dog Beds (5),
 *   Dog Carriers (4), Cat Scratching Posts (3), Dog Collars & Leashes (3),
 *   Cat Bowls & Feeders (3), Dog Grooming (3), Cat Houses (2),
 *   Cat Furniture (2), Dog Bowls & Feeders (2), Dog Feeding Supplies (2),
 *   Cat Carriers (2), Pet Carriers (1), Cat Grooming (1),
 *   Dog Crates & Kennels (1), Pet Houses (1)
 *
 *  Last updated: 2026-03-25
 */

export const MERCHANT_TOP50_IDS: ReadonlySet<string> = new Set([
  // ── Cat Litter Boxes (7) ──────────────────────────
  '31e46b70-cf1c-4d5b-99db-3350b12380db', // Barn Door Furniture Enclosure
  '1a1302e7-939f-4c94-96b7-d4e0c9d34a37', // Hidden Enclosure w/ Tall Legs
  '74e9c23c-d2d3-478a-82bd-e912e85bcc39', // Stainless Steel Flip Cover
  '501e9150-42e0-42d7-8031-a7225a718558', // Extra Large Front Entry
  'f33ae4a9-347b-4a90-872d-597036e6e973', // Hooded Enclosed w/ Mat
  '32e50b79-e2bc-4895-a7c2-5534dd9095a0', // Top Entry Spaceship Design
  'fe5ed2d6-0230-4c5a-8313-235a28ef4f21', // XL Stainless Steel Flip Top

  // ── Cat Trees & Condos (8) ────────────────────────
  '41e1a8e0-a059-4002-b3ab-0d4270030d93', // Water Hyacinth 41"
  'fdcb9c5f-8a50-46e7-9cb0-8ecf5a03b8bf', // Multi-Level w/ Anti-Tipping
  'e08f6c35-b3b1-4f2d-b78e-37fc107f4357', // Wooden Indoor Climbing Tower
  '133cdc48-0117-40d5-9aaf-1a81131ca9bb', // Modern 35" Wooden Post & Bed
  '80ca3336-49a8-44a9-8b2d-fbfe1288cb28', // 57-Inch Multi-Level
  '035a85cb-f867-4f64-94e8-a6c71ab16b18', // Indoor Hammock & Sisal Posts
  '07507c96-a445-431f-9724-340ee01d818f', // Elevated 28" w/ Basket
  '0441e51b-d537-468b-8938-66b2dee6e6c9', // 44 Inch Condo w/ Hammock

  // ── Dog Beds (5) ──────────────────────────────────
  '52b04c49-287f-478a-8d35-b7b048d9a844', // Raised Wicker Rattan Canopy
  'ecf613cb-2160-4842-9438-91d19b3a1967', // Raised Couch Cushion
  '19390342-4534-47ef-a77d-2e3dcce6c737', // Sofa w/ Storage
  'c7177ee4-5509-492f-965f-617402968f5c', // Orthopedic Elevated Cooling
  '08856bd3-3842-4058-ba44-f1927ae59f2e', // Soft Warm Fleece Nest

  // ── Cat Scratching Posts (3) ──────────────────────
  'a7ee6fb7-885a-4a5f-9dc9-df2231f9504b', // Durian Shape 3-in-1
  '84b33906-87dd-4d91-b79b-667519248013', // Wall-Mounted 4-Layer
  '112c4e1b-869d-4ed9-95c4-002d7425968d', // 4-Level Sisal w/ Steps

  // ── Dog Carriers (4) ──────────────────────────────
  '530a4583-ce42-49d7-8d56-64aa0914256f', // Waterproof Car Seat Cover
  'a1c89f7f-a1d1-4607-a72a-d4f9da8b4ceb', // Travel Backpack Transparent
  '0381585e-8b6b-48a8-b541-c7298f99b0c9', // Expandable Carrier Backpack
  '490014d4-0ab8-44c9-bd3a-fdc226020a11', // Waterproof Collar & Leash Set

  // ── Cat Carriers (2) ──────────────────────────────
  '020d9b4a-3ad2-4ed5-b1c0-d5183b93f425', // Portable Trolley Bag
  'c6cc84bb-3990-4671-a06d-53dc283565b7', // Airtight Food Storage

  // ── Pet Carriers (1) ──────────────────────────────
  '5ed1f216-9686-4d30-a6f9-9938a420d06e', // Single Shoulder Carrier Bag

  // ── Cat Houses (2) ────────────────────────────────
  '8cc4e183-430c-4ccd-9b5c-b6056bafd262', // Interactive Cat Tunnel
  '3019dc01-9281-4d77-9383-af6453b93895', // 3-Tier Playpen Enclosure

  // ── Dog Collars & Leashes (3) ─────────────────────
  '9204b6cb-d895-4b0d-8883-e43049fee3a1', // Tactical Reflective Harness
  '0139036c-d1b8-4b8a-996b-1ec8d5c0a908', // Retractable Leash
  '0e223939-77b4-417b-8bec-5da31de0a726', // Tactical No-Pull Harness

  // ── Cat Bowls & Feeders (3) ───────────────────────
  '685f7faf-7809-4962-b408-c2ced99dd178', // Cordless Smart Fountain
  'dcc0a412-adfe-49b3-8f26-ad8382f3a2d9', // 4.5L Cordless Rechargeable
  'b476d7d3-bf0f-4318-9968-606e0e3e0c3f', // 3.2L Stainless Steel

  // ── Dog Grooming (3) ──────────────────────────────
  '142f56ba-1326-4e3b-9d0c-0d79321f1671', // Quiet Nail Grinder
  'e71ba404-4aff-48a6-9681-e0297b727292', // 7-Piece Grooming Kit
  '3bfd8f1a-c2d5-4703-bfd7-1dfc5a07adf3', // Soothing Massage Comb

  // ── Cat Furniture (2) ─────────────────────────────
  '0b041496-f7a3-480c-83bb-fdba8ae840f3', // Wooden Wall Climbing Perch
  'ca67d0d6-4ced-40ab-80ee-443b1021ab92', // Interactive Scratching Post

  // ── Cat Grooming (1) ──────────────────────────────
  '67f40a1b-595e-4fcf-a4b5-ab141b224ed7', // Steam Grooming Brush

  // ── Dog Bowls & Feeders (2) ───────────────────────
  '7b540a34-7048-4f10-8c91-118b86278571', // Food Storage Container
  '047dd523-57d3-46ca-82f3-0885b0fc1667', // Tactical Harness Bundle

  // ── Dog Feeding Supplies (2) ──────────────────────
  '9aa33c0c-e455-4477-85f3-83873360c777', // 3.2L Stainless Fountain
  'ddf8f410-a77a-4bd0-89f1-36e1b04dec51', // Wired Sensing Fountain

  // ── Dog Crates & Kennels (1) ──────────────────────
  'c43193ad-d4e0-4247-ad53-0d77fe038c9f', // 47" Mobile Kennel

  // ── Pet Houses (1) ────────────────────────────────
  '7c77be17-e070-45d5-82a6-d14635693f31', // Folding Dog Ramp
]);

/** Check if a product ID is in the Top 50 set */
export function isMerchantTop50(productId: string): boolean {
  return MERCHANT_TOP50_IDS.has(productId);
}

/** Total count of Top 50 products */
export const MERCHANT_TOP50_COUNT = MERCHANT_TOP50_IDS.size;
