/**
 * Blog Image URL Resolver
 * 
 * Resolves legacy `/blog/<filename>` paths to CDN URLs.
 * Backed by the manifest produced by the 2026-06-26 CDN migration.
 */
import manifest from "@/data/migration/blog-images-manifest.json";

const MAP = manifest as Record<string, string>;
const PREFIX = "/blog/";

export function resolveBlogImage(path: string | null | undefined): string {
  if (!path) return "/placeholder.svg";
  const trimmed = path.trim();
  if (!trimmed.startsWith(PREFIX)) return trimmed;
  const filename = trimmed.slice(PREFIX.length).split("?")[0].split("#")[0];
  return MAP[filename] ?? trimmed;
}

export const BLOG_IMAGE_MANIFEST = MAP;