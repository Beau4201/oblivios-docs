// Files for machines (ADR-276): a Markdown twin of every page, /llms.txt and /llms-full.txt. They are written after the
// Astro build from the HTML in dist/, so a twin says exactly what its page says and no text is kept twice. Plain Node, no
// package: the pages are generated and regular, and the converter reads only the tags the sites use.
// Self-test: node site/shared/src/lib/agent-files.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENTITY = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–", middot: "·", rarr: "→", larr: "←", times: "×", laquo: "«", raquo: "»", copy: "©", bull: "•" };
const decode = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
    e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITY[e] ?? m));

const SKIP = new Set(["script", "style", "svg", "nav", "form", "button", "select", "template", "noscript", "head", "iframe", "canvas", "dialog", "textarea"]);
const VOID = new Set(["br", "hr", "img", "input", "link", "meta", "source", "wbr", "area", "col"]);
const BLOCK = new Set(["p", "div", "section", "article", "header", "footer", "aside", "figure", "figcaption", "details", "dl", "main", "fieldset", "tbody", "thead", "tfoot"]);
const TOKEN = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|[^<]+|</g;
const attr = (a, name) => decode(a.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? "");

/** The twin of a page: the content of <main> as Markdown. `pages` is the set of page paths, so that a link to a page
 *  points at its twin; `siteUrl` makes every link absolute. */
export function htmlToMd(html, { siteUrl, pages }) {
  const body = html.match(/<main\b[^>]*>([\s\S]*)<\/main>/)?.[1] ?? "";
  let o = "";
  let skip = null; // { tag, depth } while inside an element that is not content
  let pre = false;
  const lists = [];
  const marks = []; // where an inline element or a blockquote began in `o`
  let table = null;
  const brk = () => (o += lists.length ? " " : "\n\n");
  const absolute = (href) => {
    if (!href || href.startsWith("#")) return null;
    if (/^(?:[a-z][a-z0-9+.-]*:)/i.test(href)) return href;
    if (!href.startsWith("/")) return href;
    const [, p, rest] = href.match(/^([^#?]*)(.*)$/);
    const clean = p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
    return siteUrl + (pages.has(clean) ? (clean === "/" ? "/index.md" : clean + ".md") : clean) + rest;
  };
  const wrap = (start, before, after) => {
    const inner = o.slice(start);
    const t = inner.trim();
    o = o.slice(0, start) + (t ? inner.slice(0, inner.length - inner.trimStart().length) + before + t + after + inner.slice(inner.trimEnd().length) : inner);
  };
  const cell = (s) => s.replace(/\s+/g, " ").trim().replace(/\|/g, "\\|");

  for (const m of body.matchAll(TOKEN)) {
    const [raw, close, rawName, attrs = ""] = m;
    if (raw.startsWith("<!--")) continue;
    const name = rawName?.toLowerCase();
    if (skip) {
      if (name === skip.tag && !VOID.has(name)) skip.depth += close ? -1 : 1;
      if (skip.depth === 0) skip = null;
      continue;
    }
    if (!name) {
      if (pre) o += decode(raw);
      else {
        let t = decode(raw).replace(/\s+/g, " ");
        if (/(^|\s)$/.test(o) && t.startsWith(" ")) t = t.slice(1);
        o += t;
      }
      continue;
    }
    if (!close && (SKIP.has(name) || /\saria-hidden="true"|\shidden(?:\s|=|$)/.test(attrs)) && !VOID.has(name) && !attrs.trimEnd().endsWith("/")) {
      skip = { tag: name, depth: 1 };
      continue;
    }
    const n = /^h[1-6]$/.test(name) ? Number(name[1]) : 0;
    if (!close) {
      if (n) o += `\n\n${"#".repeat(n)} `;
      else if (BLOCK.has(name)) brk();
      else if (name === "ul" || name === "ol") {
        o += lists.length ? "" : "\n\n"; // a nested list starts at the line of its item
        lists.push({ ordered: name === "ol", i: 0 });
      } else if (name === "li") {
        const l = lists.at(-1) ?? { ordered: false, i: 0 };
        l.i++;
        o += `\n${"  ".repeat(Math.max(lists.length - 1, 0))}${l.ordered ? l.i + ". " : "- "}`;
      } else if (name === "pre") {
        o += "\n\n```\n";
        pre = true;
      } else if (name === "code" && !pre) marks.push(o.length);
      else if (name === "strong" || name === "b" || name === "em" || name === "i" || name === "a" || name === "blockquote") marks.push({ at: o.length, href: attr(attrs, "href") });
      else if (name === "summary" || name === "dt") o += "\n\n";
      else if (name === "dd") o += "\n";
      else if (name === "br") o += table ? " " : "\n";
      else if (name === "hr") o += "\n\n---\n\n";
      else if (name === "table") {
        table = { rows: [], row: null, start: o.length, th: false };
      } else if (name === "tr" && table) table.row = [];
      else if ((name === "td" || name === "th") && table) marks.push({ at: o.length, th: name === "th" });
      if (name === "summary" || name === "dt") marks.push({ at: o.length });
      continue;
    }
    // closing tags
    if (n) o += "\n\n";
    else if (BLOCK.has(name)) brk();
    else if (name === "ul" || name === "ol") {
      lists.pop();
      o += lists.length ? "" : "\n\n";
    } else if (name === "pre") {
      o += "\n```\n\n";
      pre = false;
    } else if (name === "code" && !pre) wrap(marks.pop(), "`", "`");
    else if (name === "strong" || name === "b") wrap(marks.pop().at, "**", "**");
    else if (name === "em" || name === "i") wrap(marks.pop().at, "*", "*");
    else if (name === "a") {
      const { at, href } = marks.pop();
      const url = absolute(href);
      const inner = o.slice(at).trim();
      if (url && inner) wrap(at, "[", `](${url})`);
    } else if (name === "blockquote") {
      const { at } = marks.pop();
      const lines = o.slice(at).trim().split("\n").map((l) => `> ${l}`.trimEnd());
      o = o.slice(0, at) + "\n\n" + lines.join("\n") + "\n\n";
    } else if (name === "summary" || name === "dt") {
      const { at } = marks.pop();
      wrap(at, "**", "**");
      o += "\n\n";
    } else if ((name === "td" || name === "th") && table) {
      const { at, th } = marks.pop();
      table.row.push(cell(o.slice(at)));
      table.th ||= th;
      o = o.slice(0, at);
    } else if (name === "tr" && table) {
      if (table.row.length) table.rows.push(table.row);
      table.row = null;
    } else if (name === "table" && table) {
      const width = Math.max(0, ...table.rows.map((r) => r.length));
      const line = (r) => `| ${[...r, ...Array(width - r.length).fill("")].join(" | ")} |`;
      o = o.slice(0, table.start);
      if (width) o += `\n\n${line(table.rows[0])}\n| ${Array(width).fill("---").join(" | ")} |\n${table.rows.slice(1).map(line).join("\n")}\n\n`;
      table = null;
    }
  }
  return o.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

// The crawlers of AI services, named so that the intent is explicit; `*` already allows everything. Content-Signal is the
// proposal of contentsignals.org; a crawler that does not know the line ignores it.
const AI_AGENTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User", "anthropic-ai", "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended", "CCBot", "Amazonbot", "Bytespider", "meta-externalagent", "cohere-ai", "DuckAssistBot", "MistralAI-User"];
export const robotsTxt = (siteUrl) =>
  [
    "# Everything on this site is public. Search engines and AI agents are welcome.",
    `# ${siteUrl}/llms.txt is the index for agents; every page also exists as Markdown at its address with .md added.`,
    `# ${siteUrl}/ai.md is a short brief for an AI that answers questions about the project: read it first.`,
    "",
    "User-agent: *",
    "Content-Signal: search=yes, ai-input=yes, ai-train=yes",
    "Allow: /",
    "",
    ...AI_AGENTS.map((a) => `User-agent: ${a}`),
    "Content-Signal: search=yes, ai-input=yes, ai-train=yes",
    "Allow: /",
    "",
    `Sitemap: ${siteUrl}/sitemap.xml`,
    "",
  ].join("\n");

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const pathOf = (rel) => (rel === "index.html" ? "/" : "/" + rel.replace(/\.html$/, ""));
const mdOf = (p) => (p === "/" ? "/index.md" : p + ".md");
const oneLine = (s) => s.replace(/\s+/g, " ").trim();

/** Writes `<page>.md` for every page of dist/ but the 404 page, then llms.txt and llms-full.txt.
 *  config: { dist, siteUrl, name, details: [paragraph], sections: [{ title, items }], full: [path | prefix/], render?: (path) => { md, description } | null }
 *  An item is { path, note? } (a page: its title, its twin and its description are read from the build), { prefix } (every
 *  page below it, in path order) or { url, title, note } (a file that is not a page). */
export function writeAgentFiles({ dist, siteUrl, name, details = [], sections, full, render }) {
  const files = walk(dist).map((f) => path.relative(dist, f).split(path.sep).join("/"));
  const htmls = files.filter((f) => f.endsWith(".html") && f !== "404.html");
  const pages = new Set(htmls.map(pathOf));
  const info = new Map();
  for (const rel of htmls) {
    const html = fs.readFileSync(path.join(dist, rel), "utf8");
    const p = pathOf(rel);
    const own = render?.(p); // a page whose data is better than its HTML (the decisions): { md, description }
    let md = own?.md ?? htmlToMd(html, { siteUrl, pages });
    md = md.slice(Math.max(md.search(/^# /m), 0)); // what precedes the heading is the breadcrumb of the page
    // The meta description is cut at 160 characters (Base.astro); when it was cut, the first paragraph of the page says it whole.
    let description = own?.description ?? decode(html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "");
    const lede = md.split("\n\n").slice(1).find((b) => /^[A-Z0-9]/.test(b) && !b.includes("\n"));
    if (description.endsWith("…") && lede) description = lede.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").match(/^.{40,300}?[.!?](?=\s|$)|^.{1,300}/)[0];
    const head = `> ${oneLine(description)}\n> Source: ${siteUrl}${p === "/" ? "/" : p} · Index for agents: ${siteUrl}/llms.txt · Brief for agents: ${siteUrl}/ai.md`;
    md = /^# .*\n/.test(md) ? md.replace(/^(# .*)\n/, `$1\n\n${head}\n`) : `${head}\n\n${md}`;
    const out = path.join(dist, mdOf(p).slice(1));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, md);
    info.set(p, { path: p, title: (md.match(/^# (.*)$/m)?.[1] ?? p).replace(/[*_`]/g, ""), description: oneLine(description), md });
  }
  const sorted = [...info.keys()].sort();
  const pageItems = (items) =>
    items.flatMap((i) => (i.prefix ? sorted.filter((p) => p.startsWith(i.prefix)).map((p) => ({ path: p })) : [i]));
  const entry = (i) => {
    if (i.url) return `- [${i.title}](${i.url})${i.note ? `: ${i.note}` : ""}`;
    const pg = info.get(i.path);
    if (!pg) throw new Error(`llms.txt names a page that is not in the build: ${i.path}`);
    return `- [${pg.title}](${siteUrl}${mdOf(i.path)}): ${i.note ?? pg.description}`;
  };
  const home = info.get("/");
  const txt = [
    `# ${name}`,
    `> ${home.description}`,
    ...details,
    ...sections.map((s) => `## ${s.title}\n\n${pageItems(s.items).map(entry).join("\n")}`),
  ].join("\n\n") + "\n";
  fs.writeFileSync(path.join(dist, "llms.txt"), txt);
  const fullPages = pageItems(full.map((f) => (f !== "/" && f.endsWith("/") ? { prefix: f } : { path: f }))).map((i) => info.get(i.path) ?? (() => { throw new Error(`llms-full.txt names a page that is not in the build: ${i.path}`); })());
  fs.writeFileSync(
    path.join(dist, "llms-full.txt"),
    `# ${name}: full text\n\n> The text of the pages that matter most, in one file, as Markdown. The index is ${siteUrl}/llms.txt; every page also exists as its own file, at its address with .md.\n\n` +
      fullPages.map((p) => `${p.md}`).join("\n---\n\n"),
  );
  return { pages: info.size, llms: txt.length, full: fullPages.length };
}

function selfTest() {
  const assert = (c, m) => { if (!c) throw new Error("self-test: " + m); };
  const pages = new Set(["/", "/faq"]);
  const md = htmlToMd(
    `<head><title>HEADTEXT</title></head><body><a href="#main">SKIPLINK</a><main id="main"><nav>NAVTEXT</nav><h1>Title &amp; more</h1>
     <p>A <strong> bold </strong> and <code>code|x</code> and <a href="/faq#a">the FAQ</a>, <a href="/file.pdf">a file</a>, <a href="https://e.org/">out</a>.</p>
     <ul><li>one<ul><li>inner</li></ul></li><li>two</li></ul><ol><li>first</li></ol>
     <table><tr><th>A</th><th>B</th></tr><tr><td>1|2</td><td><b>x</b></td></tr></table>
     <pre><code>a &lt; b
  c</code></pre><svg><text>SVGTEXT</text></svg><svg/><button>BTNTEXT</button><p aria-hidden="true">HIDDENTEXT</p><p>kept</p></main><footer>FOOTTEXT</footer></body>`,
    { siteUrl: "https://s.test", pages },
  );
  assert(md.startsWith("# Title & more\n"), "heading and entity");
  assert(md.includes("A **bold** and `code|x` and [the FAQ](https://s.test/faq.md#a), [a file](https://s.test/file.pdf), [out](https://e.org/)."), "inline: " + md);
  assert(md.includes("- one\n  - inner\n- two\n\n1. first"), "lists: " + md);
  assert(md.includes("| A | B |\n| --- | --- |\n| 1\\|2 | **x** |"), "table: " + md);
  assert(md.includes("```\na < b\n  c\n```"), "pre: " + md);
  assert(md.endsWith("kept\n"), "content after a self-closed svg is kept: " + md);
  assert(!/HEADTEXT|SKIPLINK|NAVTEXT|SVGTEXT|BTNTEXT|HIDDENTEXT|FOOTTEXT/.test(md), "chrome, nav, svg, button and hidden content are dropped: " + md);
  console.log("agent-files self-test: OK");
}
if (process.argv[1] === fileURLToPath(import.meta.url)) selfTest();
