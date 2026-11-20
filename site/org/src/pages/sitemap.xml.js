import { siteUrl, pages, footAbout } from "../lib/site.mjs";
import { decisions } from "../lib/records.mjs";

// lastmod is the date of the newest decision, the date the pages state their facts as of: one date for every page, read
// from the log and never typed.
export function GET() {
  // a footer link to another site is not a page of this one; the brief for AI agents has no visible link and is listed here
  const paths = ["/", "/ai", ...new Set([...pages, ...footAbout].map((p) => p.href).filter((h) => h.startsWith("/")))].sort();
  const urls = paths.map((p) => `  <url><loc>${siteUrl}${p === "/" ? "/" : p}</loc><lastmod>${decisions.latest}</lastmod></url>`).join("\n");
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
}
