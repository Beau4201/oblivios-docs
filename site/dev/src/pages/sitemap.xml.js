import { siteUrl, PAGE_SIZE } from "../lib/site.mjs";
import { decisions, decisionStats } from "../lib/records.mjs";
import { documentPaths } from "../lib/documents.mjs";
import { days, DAYS_PER_PAGE } from "../lib/changelog.mjs";

const fixed = ["/", "/decisions", "/changelog", "/search", "/components", "/advisories", "/patches", "/data", "/verify"];

// lastmod: a decision page carries the date of its entry; every other page is as of the newest decision, the date the
// portal states its facts as of. Read from the log, never typed.
export function GET() {
  const lists = Array.from({ length: Math.ceil(decisions.length / PAGE_SIZE) - 1 }, (_, i) => `/decisions/${i + 2}`);
  const logs = Array.from({ length: Math.ceil(days.length / DAYS_PER_PAGE) - 1 }, (_, i) => `/changelog/${i + 2}`);
  const rows = [...fixed, ...lists, ...logs, ...documentPaths()].map((p) => [p, decisionStats.latest]);
  rows.push(...decisions.map((d) => [`/adr/${d.n}`, d.date]));
  const urls = rows.map(([p, date]) => `  <url><loc>${siteUrl}${p}</loc><lastmod>${date}</lastmod></url>`).join("\n");
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
}
