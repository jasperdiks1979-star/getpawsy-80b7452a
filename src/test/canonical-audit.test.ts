import { describe, it, expect } from 'vitest';
import { SITE_URL, PRODUCTION_DOMAINS } from '@/lib/constants';

describe('Canonical & Redirect Audit', () => {
  it('SITE_URL is apex domain without trailing slash', () => {
    expect(SITE_URL).toBe('https://getpawsy.pet');
    expect(SITE_URL.endsWith('/')).toBe(false);
    expect(SITE_URL).not.toContain('www.');
    expect(SITE_URL).not.toContain('lovable.app');
  });

  it('PRODUCTION_DOMAINS includes apex and www', () => {
    expect(PRODUCTION_DOMAINS).toContain('getpawsy.pet');
    expect(PRODUCTION_DOMAINS).toContain('www.getpawsy.pet');
  });

  it('SITE_URL uses https', () => {
    expect(SITE_URL.startsWith('https://')).toBe(true);
  });

  it('robots.txt references apex sitemap.xml', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const robotsPath = path.resolve(__dirname, '../../public/robots.txt');
    const content = fs.readFileSync(robotsPath, 'utf-8');
    
    const sitemapMatch = content.match(/Sitemap:\s*(.+)/i);
    expect(sitemapMatch).not.toBeNull();
    expect(sitemapMatch![1].trim()).toBe('https://getpawsy.pet/sitemap.xml');
    expect(sitemapMatch![1]).not.toContain('www.');
    expect(sitemapMatch![1]).not.toContain('lovable.app');
  });

  it('robots.txt blocks /thank-you', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const robotsPath = path.resolve(__dirname, '../../public/robots.txt');
    const content = fs.readFileSync(robotsPath, 'utf-8');
    expect(content).toContain('Disallow: /thank-you');
  });

  it('robots.txt blocks tracking parameters but not all query strings', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const robotsPath = path.resolve(__dirname, '../../public/robots.txt');
    const content = fs.readFileSync(robotsPath, 'utf-8');
    // Targeted blocks for ad-tracking only — broad /*?* caused
    // "Indexed, though blocked by robots.txt" warnings in Search Console.
    expect(content).toContain('Disallow: /*?fbclid=*');
    expect(content).toContain('Disallow: /*?gclid=*');
    expect(content).not.toContain('Disallow: /*?*');
  });
});
