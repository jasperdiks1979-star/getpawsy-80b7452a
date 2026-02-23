import fs from "node:fs";
import path from "node:path";

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function toIsoDate(input) {
  if (!input) return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function isoDate(date = new Date()) {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

export function escapeXml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function renderUrlset(urlEntries) {
  const header =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
  const body = urlEntries
    .filter((e) => e && e.loc)
    .map((e) => {
      const loc = `<loc>${escapeXml(e.loc)}</loc>`;
      const lastmod = e.lastmod ? `<lastmod>${escapeXml(e.lastmod)}</lastmod>` : "";
      const changefreq = e.changefreq ? `<changefreq>${escapeXml(e.changefreq)}</changefreq>` : "";
      const priority =
        e.priority !== undefined && e.priority !== null
          ? `<priority>${Number(e.priority).toFixed(2)}</priority>`
          : "";
      return (
        `  <url>\n` +
        `    ${loc}\n` +
        (lastmod ? `    ${lastmod}\n` : "") +
        (changefreq ? `    ${changefreq}\n` : "") +
        (priority ? `    ${priority}\n` : "") +
        `  </url>`
      );
    })
    .join("\n");
  const footer = `\n</urlset>\n`;
  return header + body + footer;
}

export function renderSitemapIndex(sitemaps) {
  const header =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
  const body = sitemaps
    .filter((sm) => sm && sm.loc)
    .map((sm) => {
      const loc = `<loc>${escapeXml(sm.loc)}</loc>`;
      const lastmod = sm.lastmod ? `<lastmod>${escapeXml(sm.lastmod)}</lastmod>` : "";
      return `  <sitemap>\n    ${loc}\n` + (lastmod ? `    ${lastmod}\n` : "") + `  </sitemap>`;
    })
    .join("\n");
  const footer = `\n</sitemapindex>\n`;
  return header + body + footer;
}

export function writeFile(outPath, contents) {
  fs.writeFileSync(outPath, contents, { encoding: "utf8" });
}

export function writeFileEnsured(filePath, content) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

export function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size));
  return out;
}

export { chunk as chunkArray };

export function normalizePath(p) {
  if (!p) return "/";
  let x = String(p);
  if (!x.startsWith("/")) x = `/${x}`;
  if (x.length > 1 && x.endsWith("/")) x = x.slice(0, -1);
  return x;
}

export function absUrl(base, p) {
  return `${base}${normalizePath(p)}`;
}

export function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

export function joinRoot(...parts) {
  return path.join(process.cwd(), ...parts);
}

export function assertLooksLikeXml(content, mustContain) {
  if (!content.startsWith(`<?xml version="1.0" encoding="UTF-8"?>`)) {
    throw new Error("XML header missing.");
  }
  if (!content.includes(mustContain)) {
    throw new Error(`XML missing required token: ${mustContain}`);
  }
  if (content.includes("<!doctype html") || content.includes("<!DOCTYPE html") || content.includes("<html") || content.includes("</script>")) {
    throw new Error("HTML/SPA fallback detected in XML output.");
  }
}
