import { siteUrl } from "../lib/site.mjs";

// No Disallow and no noindex: a hidden public site protects nothing.
export function GET() {
  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`);
}
