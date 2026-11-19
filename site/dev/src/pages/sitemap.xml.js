import { siteUrl, PAGE_SIZE } from "../lib/site.mjs";
import { decisions } from "../lib/records.mjs";
import { documentPaths } from "../lib/documents.mjs";

const fixed = ["/", "/decisions", "/search", "/components", "/advisories", "/patches", "/data", "/verify"];

export function GET() {
  const lists = Array.from({ length: Math.ceil(decisions.length / PAGE_SIZE) - 1 }, (_, i) => `/decisions/${i + 2}`);
  const paths = [...fixed, ...lists, ...documentPaths(), ...decisions.map((d) => `/adr/${d.n}`)];
  const urls = paths.map((p) => `  <url><loc>${siteUrl}${p}</loc></url>`).join("\n");
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
}
