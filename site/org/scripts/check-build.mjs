// Checks dist/ after a build: the privacy rules (5.4), the files of W-6, the weight budget (W-5) and the links.
// Exits 1 and lists every failure. Run by `npm run build` and alone by `npm run check`.
import fs from "node:fs";
import path from "node:path";

const dist = path.resolve("dist");
const budget = JSON.parse(fs.readFileSync("budget.json", "utf8"));
const fails = [];
const fail = (m) => fails.push(m);
// A build made by Vercel (VERCEL=1) carries the one script of Vercel Web Analytics, from the site's own address
// (decision 261); every other build carries none. Nothing else may be a script.
const analytics = process.env.VERCEL === "1";
const ANALYTICS_TAG = '<script defer src="/_vercel/insights/script.js"></script>';
const LD = /<script type="application\/ld\+json">([^<]*)<\/script>/g;

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = walk(dist).map((f) => path.relative(dist, f));
const text = (f) => fs.readFileSync(path.join(dist, f), "utf8");
const kb = (f) => fs.statSync(path.join(dist, f)).size / 1024;

// ---- W-6: the files every site has
const pages = files.filter((f) => f.endsWith(".html"));
for (const f of ["index.html", "404.html", "what-it-does.html", "verify.html", "devices.html", "status.html", "faq.html", "contact.html", "security.html", "privacy.html", "trademark.html",
  "robots.txt", "sitemap.xml", ".well-known/security.txt", "security-contact.asc", "licenses.txt", "favicon.ico", "favicon.svg", "apple-touch-icon.png",
  "manifest.webmanifest", "social-preview.png"]) {
  if (!files.includes(f)) fail(`missing: ${f}`);
}
if (pages.length !== 11) fail(`${pages.length} html pages, 11 expected (ten pages and the 404)`);

// ---- privacy rules: no script, no review layer, no inline style, no data: URI, no other origin, no storage
for (const f of files) {
  if (/\.(js|mjs|map)$/.test(f)) fail(`${f}: a script or source map is shipped`);
  if (/(^|\/)review\./.test(f) && process.env.REVIEW !== "1") fail(`${f}: the review layer is in a production build`);
}
const asset = /\.(html|css|svg|webmanifest|txt|xml)$/;
for (const f of files.filter((x) => asset.test(x))) {
  const t = text(f);
  if (/\/home\/|\/Users\/|sourceMappingURL/.test(t)) fail(`${f}: a local path or source map reference`);
  if (/localStorage|sessionStorage|document\.cookie/.test(t) && process.env.REVIEW !== "1") fail(`${f}: storage or cookie access`);
  if (f.endsWith(".html")) {
    const bare = t.replace(LD, ""); // JSON-LD is a data block: it runs nothing and the policy does not apply to it
    if (/<script\b/i.test(analytics ? bare.replace(ANALYTICS_TAG, "") : bare) && process.env.REVIEW !== "1") fail(`${f}: <script>`);
    if (analytics && !t.includes(ANALYTICS_TAG)) fail(`${f}: the analytics tag is missing in a Vercel build`);
    if (/<style\b/i.test(t)) fail(`${f}: inline <style>`);
    if (/\sstyle=/i.test(t)) fail(`${f}: a style attribute`);
    if (/\son[a-z]+=/i.test(t)) fail(`${f}: an event handler attribute`);
    for (const m of t.matchAll(/<(?:link|img|source|use|iframe|script)\b[^>]*?\s(?:href|src|srcset)="([^"#][^"]*)"/g)) {
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(m[1]) && !/^https:\/\/oblivios\.org\//.test(m[1])) fail(`${f}: a request to another origin or scheme: ${m[1]}`);
      if (/^https:\/\/oblivios\.org\//.test(m[1]) && !/rel="canonical"/.test(m[0])) fail(`${f}: an absolute own URL as a resource: ${m[1]}`);
    }
  }
  if (/\.(html|css|svg)$/.test(f) && /url\(\s*["']?(?:data:|https?:|\/\/)/i.test(t)) fail(`${f}: a data: or absolute URL in url()`);
  if (f.endsWith(".css") && /@import/.test(t)) fail(`${f}: @import`);
}

// ---- per page: title, description, canonical, one h1, no placeholder text
for (const f of pages) {
  const t = text(f);
  if (!/<title>[^<]{3,}<\/title>/.test(t)) fail(`${f}: no title`);
  if (!/<meta name="description" content="[^"]{20,}"/.test(t)) fail(`${f}: no description`);
  // Search results cut a title at about 60 characters and a description at about 160 (Base.astro fits both).
  const chars = (s) => (s ?? "").replace(/&(?:#x?[0-9a-f]+|[a-z]+);/gi, "x").length; // an entity is one character
  if (chars(t.match(/<title>([^<]*)</)?.[1]) > 60) fail(`${f}: title over 60 characters`);
  if (chars(t.match(/<meta name="description" content="([^"]*)"/)?.[1]) > 160) fail(`${f}: description over 160 characters`);
  if (!/<link rel="canonical" href="https:\/\/oblivios\.org\/[^"]*"/.test(t)) fail(`${f}: no canonical URL`);
  if ((t.match(/<h1[ >]/g) || []).length !== 1) fail(`${f}: not exactly one h1`);
  const gone = f === "404.html"; // the 404 page carries no structured data and is the only page with noindex
  const blocks = [...t.matchAll(LD)];
  if (blocks.length !== (gone ? 0 : 1)) fail(`${f}: ${blocks.length} JSON-LD blocks, ${gone ? 0 : 1} expected`);
  for (const b of blocks) {
    try {
      const j = JSON.parse(b[1]);
      if (j["@context"] !== "https://schema.org" || !Array.isArray(j["@graph"]) || !j["@graph"].every((n) => n["@type"])) fail(`${f}: JSON-LD without the schema.org context or a typed graph`);
    } catch {
      fail(`${f}: JSON-LD is not valid JSON`);
    }
  }
  if (!/<meta name="robots" content="[^"]+"/.test(t) || /<meta name="robots" content="[^"]*noindex/.test(t) !== gone) fail(`${f}: robots meta missing, or noindex on the wrong page`);
  if (/TODO|lorem ipsum|@@|placeholder|\bTBD\b/i.test(t)) fail(`${f}: placeholder text`);
}

// ---- links: every internal href names a page or a file; every fragment is an id on that page
const ids = Object.fromEntries(pages.map((f) => [f, new Set([...text(f).matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))]));
const target = (p) => {
  if (p === "/") return "index.html";
  const c = p.replace(/^\//, "");
  return files.includes(c) ? c : files.includes(c + ".html") ? c + ".html" : null;
};
let links = 0;
for (const f of pages) {
  for (const m of text(f).matchAll(/<a\b[^>]*?\shref="([^"]+)"/g)) {
    const h = m[1];
    if (/^(?:mailto:|https?:)/.test(h)) continue;
    links++;
    const [p, frag] = h.split("#");
    const dest = p === "" ? f : target(p);
    if (!dest) fail(`${f}: dead link ${h}`);
    else if (frag && !ids[dest]?.has(frag)) fail(`${f}: ${h} names no id on ${dest}`);
  }
}

// ---- the weight budget
const cssKB = files.filter((f) => f.endsWith(".css")).reduce((s, f) => s + kb(f), 0);
const fontKB = files.filter((f) => f.endsWith(".woff2")).reduce((s, f) => s + kb(f), 0);
if (cssKB > budget.cssKBTotal) fail(`css ${cssKB.toFixed(1)} KB over the budget of ${budget.cssKBTotal}`);
if (fontKB > budget.fontKBTotal) fail(`fonts ${fontKB.toFixed(1)} KB over the budget of ${budget.fontKBTotal}`);
const worst = { html: ["", 0], first: ["", 0] };
for (const f of pages) {
  const t = text(f);
  const used = new Set([...t.matchAll(/(?:href|src)="(\/[^"#]+)"/g)].map((m) => m[1].replace(/^\//, "")).filter((p) => files.includes(p) && !/\.(html|txt|xml|asc|webmanifest)$/.test(p)));
  const first = kb(f) + [...used].reduce((s, p) => s + kb(p), 0);
  if (kb(f) > worst.html[1]) worst.html = [f, kb(f)];
  if (first > worst.first[1]) worst.first = [f, first];
  if (kb(f) > budget.htmlKBPerPage) fail(`${f}: ${kb(f).toFixed(1)} KB html over the budget of ${budget.htmlKBPerPage}`);
  if (first > budget.firstLoadKBPerPage) fail(`${f}: first load ${first.toFixed(1)} KB over the budget of ${budget.firstLoadKBPerPage}`);
}

console.log(`pages ${pages.length}, files ${files.length}, links checked ${links}`);
console.log(`weight: css ${cssKB.toFixed(1)} KB, fonts ${fontKB.toFixed(1)} KB, largest html ${worst.html[0]} ${worst.html[1].toFixed(1)} KB, largest first load ${worst.first[0]} ${worst.first[1].toFixed(1)} KB (html + assets it names)`);
if (fails.length) {
  console.log(fails.map((m) => "FAIL: " + m).join("\n"));
  process.exit(1);
}
console.log("check-build: OK");
