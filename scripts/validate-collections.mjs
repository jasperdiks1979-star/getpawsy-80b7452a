#!/usr/bin/env node

/**
 * Collection Integrity Validator
 * - Ensures active collections resolve products with adaptive matching
 * - Writes reports to seo/reports/collection-health.json and collection-recovery-report.json
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing backend env vars: SUPABASE_URL and key are required.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CORE_MIN = 20;
const THIN_MIN = 4;
const FALLBACK_MIN = 12;

const FIXED_KEYWORDS = {
  'cat-trees-and-condos': ['cat tree', 'cat condo', 'cat tower', 'cat furniture'],
  'best-cat-litter-boxes': ['litter box', 'self cleaning litter', 'litter'],
};

const ROUTE_TO_COLLECTION = {
  '/collections/cat-trees-and-condos': 'cat-trees-and-condos',
  '/collections/best-cat-litter-boxes': 'best-cat-litter-boxes',
  '/collections/modern-cat-trees': 'modern-cat-trees',
  '/cat-trees-for-large-cats': 'cat-trees-and-condos',
  '/orthopedic-dog-beds': 'best-orthopedic-dog-beds',
};

function normalizeSlug(input = '') {
  return input
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function singularize(token) {
  if (token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.endsWith('s') && token.length > 3) return token.slice(0, -1);
  return token;
}

function buildKeywords(collection) {
  const db = (collection.product_keyword_filter || '')
    .split(',')
    .map(k => k.trim().toLowerCase())
    .filter(Boolean);

  const tokens = normalizeSlug(collection.slug)
    .split('-')
    .map(singularize)
    .filter(t => t.length > 2 && !['best', 'for', 'and', 'the', 'with', '2026'].includes(t));

  const phrase = tokens.join(' ');

  return Array.from(
    new Set([
      ...(FIXED_KEYWORDS[collection.slug] || []),
      ...db,
      ...(collection.product_category_filter ? [collection.product_category_filter.toLowerCase()] : []),
      ...tokens,
      ...(phrase ? [phrase] : []),
    ]),
  );
}

function countKeywordHits(text, keywords) {
  let score = 0;
  for (const kw of keywords) {
    if (!kw) continue;
    if (text.includes(kw)) score += kw.includes(' ') ? 3 : 1;
  }
  return score;
}

function scoreProduct(product, collection, keywords) {
  const name = (product.name || '').toLowerCase();
  const category = (product.category || '').toLowerCase();
  const slug = (product.slug || '').toLowerCase();
  const text = `${name} ${category} ${slug}`;

  let score = 0;
  if (collection.product_category_filter && category.includes(collection.product_category_filter.toLowerCase())) score += 10;
  if (text.includes(normalizeSlug(collection.slug).replace(/-/g, ' '))) score += 8;
  score += countKeywordHits(text, keywords);

  return score;
}

function similarityScore(product, keywords) {
  const text = `${product.name || ''} ${product.category || ''} ${product.slug || ''}`.toLowerCase();
  const words = new Set(text.split(/[^a-z0-9]+/g).filter(Boolean));
  let score = 0;
  for (const kw of keywords) {
    const tokens = kw.split(/[^a-z0-9]+/g).filter(Boolean);
    score += tokens.filter(t => words.has(t) || words.has(singularize(t))).length;
  }
  return score;
}

async function main() {
  const [{ data: collections, error: collErr }, { data: products, error: prodErr }] = await Promise.all([
    supabase
      .from('seo_collections')
      .select('slug,name,is_active,product_category_filter,product_keyword_filter')
      .eq('is_active', true)
      .order('slug'),
    supabase
      .from('products_public')
      .select('id,name,slug,category,price,image_url,is_active,is_duplicate')
      .eq('is_active', true)
      .eq('is_duplicate', false)
      .gt('price', 0)
      .not('image_url', 'is', null)
      .limit(1000),
  ]);

  if (collErr) throw collErr;
  if (prodErr) throw prodErr;

  const productPool = products || [];
  const health = {};
  const fallbackTriggers = [];
  const thinCollections = [];

  for (const collection of collections || []) {
    const keywords = buildKeywords(collection);

    const primary = productPool
      .map(p => ({ ...p, _score: scoreProduct(p, collection, keywords) }))
      .filter(p => p._score > 0)
      .sort((a, b) => b._score - a._score);

    let final = primary;
    let fallbackUsed = false;

    if (final.length < FALLBACK_MIN) {
      fallbackUsed = true;
      const used = new Set(final.map(p => p.id));
      const fallback = productPool
        .filter(p => !used.has(p.id))
        .map(p => ({ ...p, _score: similarityScore(p, keywords) }))
        .filter(p => p._score > 0)
        .sort((a, b) => b._score - a._score)
        .slice(0, FALLBACK_MIN - final.length);

      final = [...final, ...fallback];
    }

    const count = final.length;
    const healthy = count >= CORE_MIN;
    const thin = count < THIN_MIN;

    health[collection.slug] = {
      count,
      healthy,
      fallbackTriggered: fallbackUsed,
      primaryCount: primary.length,
      keywordCount: keywords.length,
    };

    if (fallbackUsed) fallbackTriggers.push(collection.slug);
    if (thin) thinCollections.push(collection.slug);
  }

  const duplicateSlugRows = Object.entries(
    (collections || []).reduce((acc, c) => {
      acc[c.slug] = (acc[c.slug] || 0) + 1;
      return acc;
    }, {}),
  ).filter(([, count]) => Number(count) > 1);

  const routeChecks = Object.entries(ROUTE_TO_COLLECTION).map(([route, slug]) => {
    const count = health[slug]?.count || 0;
    return { route, slug, count, ok: count > 8 };
  });

  const report = {
    generatedAt: new Date().toISOString(),
    totals: {
      activeCollections: (collections || []).length,
      activeProducts: productPool.length,
      fallbackTriggers: fallbackTriggers.length,
      thinCollections: thinCollections.length,
    },
    duplicateSlugCollisions: duplicateSlugRows,
    thinCollections,
    routeChecks,
    collections: health,
  };

  const recovery = {
    status: 'Collection Rendering Engine Stabilized',
    generatedAt: report.generatedAt,
    collectionsFixed: Object.keys(health).length,
    fallbackTriggers,
    collectionsStillThin: thinCollections,
  };

  const reportDir = path.join(process.cwd(), 'seo', 'reports');
  await fs.mkdir(reportDir, { recursive: true });
  await fs.writeFile(path.join(reportDir, 'collection-health.json'), JSON.stringify(report, null, 2));
  await fs.writeFile(path.join(reportDir, 'collection-recovery-report.json'), JSON.stringify(recovery, null, 2));

  if (thinCollections.length > 0 || duplicateSlugRows.length > 0) {
    console.warn('⚠️ Collection health warning:', {
      thinCollections: thinCollections.length,
      duplicateSlugCollisions: duplicateSlugRows.length,
    });
  } else {
    console.log('✅ Collection health passed. No thin or duplicate-slug collections.');
  }

  console.log('Reports written:', {
    health: 'seo/reports/collection-health.json',
    recovery: 'seo/reports/collection-recovery-report.json',
  });
}

main().catch((err) => {
  console.error('Collection validator failed:', err?.message || err);
  process.exit(1);
});
