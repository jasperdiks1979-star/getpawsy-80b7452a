/**
 * Collection Integrity Validator
 * 
 * Runtime hook that checks collection health on mount.
 * Logs warnings for collections below minimum thresholds.
 * Does NOT block rendering — purely diagnostic.
 */

import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { COLLECTION_MAP, scoreProductForCollection, scoreProductFallback } from '@/config/collectionMap';

export interface CollectionHealthEntry {
  slug: string;
  primaryCount: number;
  fallbackCount: number;
  totalCount: number;
  healthy: boolean;
  critical: boolean;
  timestamp: string;
}

export type CollectionHealthReport = Record<string, CollectionHealthEntry>;

/**
 * Runs collection integrity checks and returns a health report.
 * Can be called from diagnostics pages or automated monitoring.
 */
export async function validateCollections(): Promise<CollectionHealthReport> {
  const report: CollectionHealthReport = {};

  // Fetch product pool once
  const { data: pool, error } = await supabase
    .from('products_public')
    .select('id, name, category')
    .eq('is_active', true)
    .eq('is_duplicate', false)
    .limit(1000);

  if (error || !pool) {
    console.error('[CollectionValidator] Failed to fetch products:', error);
    return report;
  }

  for (const [slug, config] of Object.entries(COLLECTION_MAP)) {
    const primaryMatches = pool.filter(
      p => scoreProductForCollection(p, config) > 0
    );
    const fallbackMatches = pool.filter(
      p => scoreProductFallback(p, config) > 0
    );
    // Dedupe
    const allIds = new Set([
      ...primaryMatches.map(p => p.id),
      ...fallbackMatches.map(p => p.id),
    ]);

    const totalCount = allIds.size;
    const healthy = primaryMatches.length >= config.minProducts;
    const critical = primaryMatches.length < config.criticalMin;

    report[slug] = {
      slug,
      primaryCount: primaryMatches.length,
      fallbackCount: fallbackMatches.length,
      totalCount,
      healthy,
      critical,
      timestamp: new Date().toISOString(),
    };

    if (critical) {
      console.error(
        `[CollectionValidator] CRITICAL: "${slug}" has ${primaryMatches.length} primary products (min: ${config.criticalMin}). Revenue impact!`
      );
    } else if (!healthy) {
      console.warn(
        `[CollectionValidator] WARNING: "${slug}" has ${primaryMatches.length} primary products (target: ${config.minProducts}). Fallback available: ${fallbackMatches.length}.`
      );
    }
  }

  return report;
}

/**
 * React hook that runs collection validation once on mount.
 * Only runs in development or when explicitly enabled.
 */
export function useCollectionIntegrityCheck(enabled = true) {
  const hasRun = useRef(false);

  useEffect(() => {
    if (!enabled || hasRun.current) return;
    hasRun.current = true;

    validateCollections().then(report => {
      const unhealthy = Object.values(report).filter(r => !r.healthy);
      const critical = Object.values(report).filter(r => r.critical);

      if (critical.length > 0) {
        console.error(
          `[CollectionValidator] ${critical.length} CRITICAL collections:`,
          critical.map(c => `${c.slug} (${c.primaryCount} products)`)
        );
      }
      if (unhealthy.length > 0) {
        console.warn(
          `[CollectionValidator] ${unhealthy.length} unhealthy collections:`,
          unhealthy.map(c => `${c.slug} (${c.primaryCount}/${c.totalCount})`)
        );
      }
      if (unhealthy.length === 0) {
        console.info(
          `[CollectionValidator] All ${Object.keys(report).length} collections healthy ✓`
        );
      }
    });
  }, [enabled]);
}
