/**
 * Image Optimizer — zero vendor lock-in
 * 
 * Provides responsive image URL generation with optional CDN provider support.
 * Supports: Cloudinary, Imgix, or raw passthrough (no provider).
 * 
 * Usage:
 *   import { buildOptimizedSrcSet, buildOptimizedImageUrl } from '@/lib/image-optimizer';
 *   <img srcSet={buildOptimizedSrcSet(url, [320, 640, 960])} sizes="..." />
 */

type ImageProvider = 'cloudinary' | 'imgix' | 'none';

interface ImageOptions {
  w?: number;
  h?: number;
  q?: number | 'auto';  // quality 1-100 or 'auto' for CDN auto-quality
  fmt?: 'auto' | 'webp' | 'avif';
  fit?: 'cover' | 'contain' | 'fill';
}

/**
 * Lazy-evaluated provider config.
 * Uses a getter so HMR picks up changes and env vars resolve correctly.
 * Defaults to Cloudinary (dlkqycfzn) when no env var is set.
 */
function getProvider(): ImageProvider {
  const env = import.meta.env.VITE_IMAGE_OPTIMIZER_PROVIDER;
  if (env === 'none' || env === 'imgix' || env === 'cloudinary') return env;
  return 'cloudinary'; // Default: always use Cloudinary
}

function getCloudinaryCloud(): string {
  return import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'dlkqycfzn';
}

function getImgixDomain(): string {
  return import.meta.env.VITE_IMGIX_DOMAIN || '';
}

/** Normalize messy image URLs (trim whitespace, fix protocol, etc.) */
export function normalizeImageUrl(url: string | null | undefined): string {
  if (!url) return '/placeholder.svg';
  const trimmed = url.trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return '/placeholder.svg';
  // Fix protocol-relative
  if (trimmed.startsWith('//')) return 'https:' + trimmed;
  return trimmed;
}

/**
 * Guard: only proxy absolute http(s) URLs through Cloudinary.
 * Local assets (/foo.png, data:, blob:) are returned as-is.
 */
function isRemoteUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

/** Build an optimized image URL through the configured provider */
export function buildOptimizedImageUrl(rawUrl: string, opts: ImageOptions = {}): string {
  const url = normalizeImageUrl(rawUrl);
  if (url === '/placeholder.svg') return url;
  
  // Only proxy remote URLs — local assets stay as-is
  if (!isRemoteUrl(url)) return url;
  
  const { w, h, q = 'auto', fmt = 'auto', fit = 'cover' } = opts;
  const provider = getProvider();

  switch (provider) {
    case 'cloudinary': {
      const cloud = getCloudinaryCloud();
      if (!cloud) return url;
      const transforms: string[] = [];
      if (w) transforms.push(`w_${w}`);
      if (h) transforms.push(`h_${h}`);
      transforms.push(`q_${q}`);
      transforms.push(`f_${fmt === 'auto' ? 'auto' : fmt}`);
      transforms.push(`c_${fit === 'cover' ? 'fill' : fit === 'contain' ? 'fit' : 'scale'}`);
      // Cloudinary fetch API: raw URL after the transforms (no encoding needed)
      return `https://res.cloudinary.com/${cloud}/image/fetch/${transforms.join(',')}/${url}`;
    }

    case 'imgix': {
      const domain = getImgixDomain();
      if (!domain) return url;
      const params = new URLSearchParams();
      if (w) params.set('w', String(w));
      if (h) params.set('h', String(h));
      params.set('q', String(q));
      params.set('auto', fmt === 'auto' ? 'format,compress' : 'compress');
      if (fmt !== 'auto') params.set('fm', fmt);
      params.set('fit', fit === 'cover' ? 'crop' : fit === 'contain' ? 'clip' : 'fill');
      const encoded = encodeURIComponent(url);
      return `https://${domain}/${encoded}?${params.toString()}`;
    }

    default:
      // No provider — return original URL as-is
      return url;
  }
}

/** Build a responsive srcSet string for a set of widths */
export function buildOptimizedSrcSet(
  rawUrl: string,
  widths: number[] = [320, 480, 640, 960],
  opts: Omit<ImageOptions, 'w'> = {}
): string {
  const url = normalizeImageUrl(rawUrl);
  if (url === '/placeholder.svg') return '';
  if (!isRemoteUrl(url)) return '';
  
  const provider = getProvider();
  if (provider === 'none') {
    return '';
  }

  return widths
    .map(w => `${buildOptimizedImageUrl(rawUrl, { ...opts, w })} ${w}w`)
    .join(', ');
}

/** Standard responsive sizes attribute for common layouts */
export const RESPONSIVE_SIZES = {
  /** Product grid thumbnails */
  gridThumb: '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw',
  /** PDP main image */
  pdpMain: '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 640px',
  /** Hero image */
  hero: '100vw',
  /** Category card */
  categoryCard: '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw',
} as const;

/** Standard width sets for different image contexts */
export const IMAGE_WIDTHS = {
  gridThumb: [320, 480, 640],
  pdpMain: [640, 960, 1200],
  hero: [960, 1200, 1600],
  categoryCard: [240, 360, 480],
} as const;

/**
 * Payload guard — warns in console if images are oversized.
 * Call once after page load (e.g., in useEffect or requestIdleCallback).
 */
export function runPayloadGuard(): void {
  if (typeof window === 'undefined') return;
  
  try {
    const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const IMAGE_WARN_BYTES = 300 * 1024; // 300KB
    const PAGE_WARN_BYTES = 2 * 1024 * 1024; // 2MB
    
    let totalTransferred = 0;
    const oversized: string[] = [];
    
    entries.forEach(entry => {
      const size = entry.encodedBodySize || entry.transferSize || 0;
      totalTransferred += size;
      
      if (entry.initiatorType === 'img' && size > IMAGE_WARN_BYTES) {
        const filename = entry.name.split('/').pop()?.split('?')[0] || entry.name;
        oversized.push(`⚠️ ${filename}: ${Math.round(size / 1024)}KB`);
      }
    });
    
    if (oversized.length > 0) {
      console.warn(`[PayloadGuard] ${oversized.length} oversized images:\n${oversized.join('\n')}`);
    }
    
    if (totalTransferred > PAGE_WARN_BYTES) {
      console.warn(`[PayloadGuard] Total page weight: ${(totalTransferred / 1024 / 1024).toFixed(1)}MB (target: <2MB)`);
    } else {
      console.log(`[PayloadGuard] ✅ Total page weight: ${(totalTransferred / 1024 / 1024).toFixed(1)}MB`);
    }
  } catch {
    // Performance API not available
  }
}
