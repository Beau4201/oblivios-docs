// Checks dist/ after a build: the privacy rules (5.4), the files of W-6, the weight budget (W-5) and the links.
// Exits 1 and lists every failure. Run by `npm run build` and alone by `npm run check`.
// oblivios.dev differs from oblivios.org in one rule: it ships one script of its own, /browse.js, the search and the filters
// (ADR-268), and in a Vercel build the page-view counter of Vercel Web Analytics besides. That file may fetch /search-index.json and nothing else, and uses no storage, cookie or dynamic code.
import fs from "node:fs";
import path from "node:path";

const dist = path.resolve("dist");
const budget = JSON.parse(fs.readFileSync("budget.json", "utf8"));
const fails = [];
const fail = (m) => fails.push(m);
const SCRIPT_TAG = '<script defer src="/browse.js"></script>';
// A build made by Vercel (VERCEL=1) carries the one script of Vercel Web Analytics as well, from the site's own address
// (ADR-261 for oblivios.org, ADR-272 for this site): two scripts then, and no other.
const analytics = process.env.VERCEL === "1";
const ANALYTICS_TAG = '<script defer src="/_vercel/insights/script.js"></script>';
const LD = /<script type="application\/ld\+json">([^<]*)<\/script>/g;
const ORIGIN = "https://oblivios.dev";

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = walk(dist).map((f) => path.relative(dist, f));
const text = (f) => fs.readFileSync(path.join(dist, f), "utf8");
const kb = (f) => fs.statSync(path.join(dist, f)).size / 1024;

// ---- W-6: the files every site has
const pages = files.filter((f) => f.endsWith(".html"));
for (const f of ["index.html", "404.html", "decisions.html", "search.html", "components.html", "advisories.html", "patches.html", "data.html", "verify.html",
  "robots.txt", "sitemap.xml", ".well-known/security.txt", "security-contact.asc", "favicon.ico", "favicon.svg", "apple-touch-icon.png",
  "manifest.webmanifest", "social-preview.png", "browse.js", "search-index.json"]) {
  if (!files.includes(f)) fail(`missing: ${f}`);
}
const adrPages = pages.filter((f) => /^adr\/\d+\.html$/.test(f));
const logText = fs.readFileSync(path.resolve("../../docs/governance/decision-log.md"), "utf8");
const rows = logText.split("\n").filter((l) => /^\| ADR-\d+ \| /.test(l)).length;
if (adrPages.length !== rows) fail(`${adrPages.length} decision pages for ${rows} entries of the decision log`);
if (!pages.some((f) => /^decisions\/2\.html$/.test(f))) fail("the decision list has no second page");

// ---- privacy rules: one script, no review layer, no inline style, no data: URI, no other origin, no storage
for (const f of files) {
  if (/\.(mjs|map)$/.test(f)) fail(`${f}: a module or source map is shipped`);
  if (f.endsWith(".js") && f !== "browse.js") fail(`${f}: a script other than browse.js is shipped`);
}
// the pages that show a record or a document as it is written: a decision, an engineering note, a quickstart, the threat model
const DOCUMENT = /^(adr|engineering|quickstarts)\/|^(threat-model|boundaries)\.html$|^llms-full\.txt$/;
const asset = /\.(html|css|svg|webmanifest|txt|xml|js)$/;
for (const f of files.filter((x) => asset.test(x))) {
  const t = text(f);
  // a page that shows a document (the records, the notes, the threat model) may name `sourceMappingURL` or `localStorage` in its
  // prose: a note says what a search of the build found. A home-directory path is never allowed, and the pages have no script
  // of their own to touch storage (the one script is checked below).
  const doc = DOCUMENT.test(f);
  if (/\/home\/|\/Users\//.test(t) || (!doc && /sourceMappingURL/.test(t))) fail(`${f}: a local path or source map reference`);
  if (f !== "browse.js" && !doc && /localStorage|sessionStorage|document\.cookie/.test(t)) fail(`${f}: storage or cookie access`);
  if (f.endsWith(".html")) {
    const bare = t.replace(LD, "");
    const scripts = bare.match(/<script\b[^>]*>/gi) || [];
    const want = [SCRIPT_TAG, ...(analytics ? [ANALYTICS_TAG] : [])];
    if (scripts.length !== want.length || !want.every((s) => bare.includes(s))) fail(`${f}: expected exactly ${want.join(" and ")}, found ${scripts.join(" ") || "none"}`);
    if (/<style\b/i.test(t)) fail(`${f}: inline <style>`);
    if (/\sstyle=/i.test(t)) fail(`${f}: a style attribute`);
    if (/\son[a-z]+=/i.test(t)) fail(`${f}: an event handler attribute`);
    for (const m of t.matchAll(/<(?:link|img|source|use|iframe|script)\b[^>]*?\s(?:href|src|srcset)="([^"#][^"]*)"/g)) {
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(m[1]) && !m[1].startsWith(ORIGIN + "/")) fail(`${f}: a request to another origin or scheme: ${m[1]}`);
      if (m[1].startsWith(ORIGIN + "/") && !/rel="canonical"/.test(m[0])) fail(`${f}: an absolute own URL as a resource: ${m[1]}`);
    }
  }
  if (/\.(html|css|svg)$/.test(f) && /url\(\s*["']?(?:data:|https?:|\/\/)/i.test(t)) fail(`${f}: a data: or absolute URL in url()`);
  if (f.endsWith(".css") && /@import/.test(t)) fail(`${f}: @import`);
}

// ---- the one script: what it may do
{
  const t = text("browse.js");
  for (const [re, what] of [[/localStorage|sessionStorage|document\.cookie|indexedDB/, "storage or a cookie"], [/XMLHttpRequest|WebSocket|sendBeacon|EventSource|importScripts/, "a network API other than fetch"],
    [/\beval\s*\(|new Function|document\.write|setTimeout\(\s*["'`]/, "dynamic code"], [/\bimport\s*\(|^import\s/m, "a module import"]]) {
    if (re.test(t)) fail(`browse.js: ${what}`);
  }
  const fetches = [...t.matchAll(/fetch\(([^)]*)\)/g)].map((m) => m[1].trim());
  if (!fetches.length || fetches.some((a) => !/^["']\/search-index\.json["']/.test(a))) fail(`browse.js: fetch other than /search-index.json: ${fetches.join(", ")}`);
  if (kb("browse.js") > budget.scriptsKBTotal) fail(`browse.js ${kb("browse.js").toFixed(1)} KB over the budget of ${budget.scriptsKBTotal}`);
}

// ---- the search index: valid, and a size that a phone can fetch
{
  const idx = JSON.parse(text("search-index.json"));
  if (idx.v !== 1 || !Array.isArray(idx.docs) || !Array.isArray(idx.terms) || idx.terms.length !== idx.post.length) fail("search-index.json has the wrong shape");
  else {
    const sorted = [...idx.terms].sort();
    if (sorted.some((t, i) => t !== idx.terms[i])) fail("search-index.json: the terms are not sorted");
    if (idx.docs.length < rows) fail(`search-index.json: ${idx.docs.length} documents for ${rows} decisions`);
  }
  if (kb("search-index.json") > budget.searchIndexKBTotal) fail(`search-index.json ${kb("search-index.json").toFixed(0)} KB over the budget of ${budget.searchIndexKBTotal}`);
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
  if (!/<link rel="canonical" href="https:\/\/oblivios\.dev\/[^"]*"/.test(t)) fail(`${f}: no canonical URL`);
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
  // a decision page shows the record as written, and the records use these words for what they say (a placeholder in a
  // design, a TODO of a plan); the copy of every other page is the site's own and must have none
  if (!DOCUMENT.test(f) && /TODO|lorem ipsum|@@|placeholder(?!=)|\bTBD\b/i.test(t.replace(/placeholder="[^"]*"/g, ""))) fail(`${f}: placeholder text`);
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
    const h = m[1].replace(/&amp;/g, "&");
    if (/^(?:mailto:|https?:)/.test(h)) continue;
    links++;
    const [pq, frag] = h.split("#");
    const p = pq.split("?")[0]; // a query names a state of the page, not another file
    const dest = p === "" ? f : target(p);
    if (!dest) fail(`${f}: dead link ${h}`);
    else if (frag && !ids[dest]?.has(frag)) fail(`${f}: ${h} names no id on ${dest}`);
  }
}

// ---- files for machines (ADR-276): a Markdown twin of every page, llms.txt, llms-full.txt and the JSON data, all consistent with the build
{
  for (const f of ["llms.txt", "llms-full.txt", "data/index.json", "data/decisions.json", "data/components.json", "data/advisories.json"]) if (!files.includes(f)) fail(`missing: ${f}`);
  const mds = files.filter((f) => f.endsWith(".md"));
  const real = pages.filter((p) => p !== "404.html");
  if (mds.length !== real.length) fail(`${mds.length} Markdown files for ${real.length} pages`);
  for (const f of real) {
    const md = f === "index.html" ? "index.md" : f.replace(/\.html$/, ".md");
    if (!files.includes(md)) fail(`${f}: no Markdown twin`);
    if (!text(f).includes(`<link rel="alternate" type="text/markdown" href="/${md}"`)) fail(`${f}: no link to its Markdown twin`);
  }
  for (const f of [...mds, "llms.txt", "llms-full.txt"].filter((x) => files.includes(x))) {
    const t = text(f);
    if (!t.startsWith("# ")) fail(`${f}: does not start with a heading`);
    if (/\/home\/|\/Users\//.test(t)) fail(`${f}: a local path`);
    if (f.endsWith(".md") && t.length < 100) fail(`${f}: almost empty`);
  }
  const llms = files.includes("llms.txt") ? text("llms.txt") : "";
  if (!/^# .+\n\n> .+\n/.test(llms)) fail("llms.txt: no name and summary");
  for (const m of llms.matchAll(/\]\((https:\/\/oblivios\.dev\/[^)#]*)\)/g)) {
    const p = new URL(m[1]).pathname;
    if (!target(p)) fail(`llms.txt: ${m[1]} is not in the build`);
  }
  for (const f of files.filter((x) => /^data\/.+\.json$/.test(x))) {
    try {
      JSON.parse(text(f));
    } catch {
      fail(`${f}: not valid JSON`);
    }
    if (/\/home\/|\/Users\//.test(text(f))) fail(`${f}: a local path`);
  }
  if (files.includes("data/decisions.json") && JSON.parse(text("data/decisions.json")).decisions.length !== rows) fail(`data/decisions.json does not hold the ${rows} entries of the log`);
}

// ---- the weight budget
const cssKB = files.filter((f) => f.endsWith(".css")).reduce((s, f) => s + kb(f), 0);
const fontKB = files.filter((f) => f.endsWith(".woff2")).reduce((s, f) => s + kb(f), 0);
if (cssKB > budget.cssKBTotal) fail(`css ${cssKB.toFixed(1)} KB over the budget of ${budget.cssKBTotal}`);
if (fontKB > budget.fontKBTotal) fail(`fonts ${fontKB.toFixed(1)} KB over the budget of ${budget.fontKBTotal}`);
const worst = { html: ["", 0], first: ["", 0] };
for (const f of pages) {
  const t = text(f);
  const used = new Set([...t.matchAll(/(?:href|src)="(\/[^"#?]+)"/g)].map((m) => m[1].replace(/^\//, "")).filter((p) => files.includes(p) && !/\.(html|txt|xml|asc|webmanifest|json|md)$/.test(p))); // an alternate link (the Markdown twin) is not loaded with the page
  const first = kb(f) + [...used].reduce((s, p) => s + kb(p), 0);
  if (kb(f) > worst.html[1]) worst.html = [f, kb(f)];
  if (first > worst.first[1]) worst.first = [f, first];
  if (kb(f) > budget.htmlKBPerPage) fail(`${f}: ${kb(f).toFixed(1)} KB html over the budget of ${budget.htmlKBPerPage}`);
  if (first > budget.firstLoadKBPerPage) fail(`${f}: first load ${first.toFixed(1)} KB over the budget of ${budget.firstLoadKBPerPage}`);
}

console.log(`pages ${pages.length} (${adrPages.length} decisions), files ${files.length}, links checked ${links}`);
console.log(`weight: css ${cssKB.toFixed(1)} KB, fonts ${fontKB.toFixed(1)} KB, script ${kb("browse.js").toFixed(1)} KB, search index ${kb("search-index.json").toFixed(0)} KB, largest html ${worst.html[0]} ${worst.html[1].toFixed(1)} KB, largest first load ${worst.first[0]} ${worst.first[1].toFixed(1)} KB (html + assets it names)`);
if (fails.length) {
  console.log(fails.map((m) => "FAIL: " + m).join("\n"));
  process.exit(1);
}
console.log("check-build: OK");
