// The documents the portal shows as pages: the threat model, the capability boundaries, the engineering notes of the areas
// and the component quickstarts. Each is a Markdown file of the repository that the snapshot of oblivios-docs publishes
// (PUBLISH in tools/docs/build-public-docs.py), read here at build time and never copied into the site.
import path from "node:path";
import { find, read } from "./records.mjs";
import { plain } from "./md.mjs";

// A long document is split into parts, each a page of its own with a tab, and a part that lists cases is paged: `sections`
// are the ids of the sections a part shows ("" is the text before the first heading) and `per` is the most cases on a page.
export const security = [
  {
    slug: "threat-model", href: "/threat-model", file: "docs/security/threat-model.md", label: "Threat model", print: "shield", printLabel: "A shield with a crack in it",
    lede: "Who could attack ObliviOS, along which path, and what stops, detects and repairs it.",
    parts: [
      { slug: "", label: "Overview", sections: ["scope-and-objectives", "assets", "trust-boundaries", "security-review-rule"] },
      { slug: "attackers", label: "Attackers", sections: ["attacker-catalogue"], lede: "Who could attack ObliviOS, the path each takes, and what mitigates, detects and repairs it, with the risk that remains." },
      { slug: "abuse-cases", label: "Abuse cases", sections: ["privileged-path-abuse-cases"], per: 14, lede: "The ways a privileged path could be abused, the control each one requires and the test evidence for it." },
      { slug: "supply-chain", label: "Supply chain", sections: ["supply-chain-abuse-cases"], lede: "The attacks on the supply chain, the path of each, the mitigation and detection it requires, and the recovery and validation evidence." },
    ],
  },
  {
    slug: "boundaries", href: "/boundaries", file: "docs/security/capability-boundaries.md", label: "Capability boundaries", print: "sheet", printLabel: "A sealed sheet",
    lede: "What each service may take in, give out and do, and what it is denied.",
    parts: [{ slug: "", label: "Capability boundaries", sections: [""], per: 12 }],
  },
];

export const partHref = (entry, part, pageNo = 1) => {
  const base = entry.href + (part.slug ? `/${part.slug}` : "");
  return pageNo > 1 ? `${base}/${pageNo}` : base;
};
// the cases of a part on pages that are the same size, so the last page is not left with two
export function pagesOf(n, per) {
  if (!per || n <= per) return { count: 1, size: n || 1 };
  const count = Math.ceil(n / per);
  return { count, size: Math.ceil(n / count) };
}
export const caseCount = (sections) =>
  sections.flatMap((s) => s.blocks).filter((b) => b.t === "table" && b.head.length >= 3).reduce((n, b) => n + b.rows.length, 0);
// the sections of a part, in the order of the document
export const sectionsOf = (doc, part) => doc.sections.filter((s) => part.sections.includes(s.id));
// every page of a document split into parts: the paths for getStaticPaths and for the sitemap
export function partPages(entry) {
  const doc = parseDoc(entry.file);
  return entry.parts.flatMap((part) => {
    const { count } = pagesOf(caseCount(sectionsOf(doc, part)), part.per);
    return Array.from({ length: count }, (_, i) => ({ part, pageNo: i + 1, href: partHref(entry, part, i + 1) }));
  });
}
export const partParams = (entry) =>
  partPages(entry).map((p) => ({ params: { page: p.href.slice(entry.href.length + 1) || undefined }, props: { part: p.part, pageNo: p.pageNo } }));
// every path of the pages that show a document
export const documentPaths = () => [...security.flatMap((e) => partPages(e).map((p) => p.href)), "/engineering", ...notes.map((n) => n.href), "/quickstarts", ...quickstarts.map((q) => q.href)];

export const notes = [
  { slug: "airpods", file: "docs/architecture/airpods-engineering-notes.md", label: "AirPods" },
  { slug: "app-drawer", file: "docs/architecture/app-drawer-engineering-notes.md", label: "App drawer" },
  { slug: "boot", file: "docs/architecture/boot-engineering-notes.md", label: "Boot picture" },
  { slug: "datamap", file: "docs/architecture/datamap-engineering-notes.md", label: "Data map" },
  { slug: "duress", file: "docs/architecture/duress-engineering-notes.md", label: "Duress Unlock" },
  { slug: "grab-detection", file: "docs/architecture/grab-detection-engineering-notes.md", label: "Grab detection" },
  { slug: "keyboard", file: "docs/architecture/keyboard-engineering-notes.md", label: "Keyboard" },
  { slug: "site", file: "docs/architecture/site-engineering-notes.md", label: "These sites" },
].map((n) => ({ ...n, href: `/engineering/${n.slug}` }));

export const quickstarts = [
  { slug: "vault-core", file: "docs/quickstarts/vault-core.md", label: "vault-core" },
  { slug: "exit-daemon", file: "docs/quickstarts/exit-daemon.md", label: "exit-daemon" },
  { slug: "airpods-core", file: "docs/quickstarts/airpods-core.md", label: "airpods-core" },
].map((q) => ({ ...q, href: `/quickstarts/${q.slug}` }));

const all = [...security, ...notes, ...quickstarts];
// the page of this portal for a repository path, so a link between two documents stays on the portal
export const localHref = (p) => all.find((d) => d.file === p)?.href ?? null;

export const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "section";

// The anchor of one case (a row of a table of three columns or more) on its page; `used` holds the anchors of the section so far.
// Blocks.astro and the search index both call it, so a search hit lands on the case it found.
export function caseId(prefix, text, used) {
  const base = `${prefix ? prefix + "-" : ""}${slugify(text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"))}`;
  let id = base;
  for (let k = 2; used.has(id); k++) id = `${base}-${k}`;
  used.add(id);
  return id;
}

// The documents as documents of the search index (search-index.mjs): one for the document, one for each of its sections and
// one for each case, so a search finds the section or the case and the link lands on it.
export function documentIndex() {
  const out = [];
  const excerpt = (t) => (t.length > 420 ? t.slice(0, 417).replace(/\s+\S*$/, "") + "…" : t);
  for (const [group, list] of [["Security model", security], ["Engineering notes", notes], ["Quickstarts", quickstarts]]) {
    for (const e of list) {
      const doc = parseDoc(e.file);
      const text = (blocks) =>
        blocks
          .map((b) => {
            if (b.t === "p" || b.t === "h3") return plain(b.text);
            if (b.t === "code") return b.text.replace(/\s+/g, " ");
            if (b.t === "ul" || b.t === "ol") return b.items.map((i) => plain(i.text) + " " + text(i.extra)).join(" ");
            if (b.t === "table" && b.head.length === 2) return b.rows.map((r) => plain(r[0]) + " " + plain(r[1])).join(" ");
            return "";
          })
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
      const intro = doc.sections.filter((s) => !s.id).map((s) => text(s.blocks)).join(" ");
      out.push({
        doc: { t: "x", k: "doc", n: doc.title, p: group, h: e.href, x: excerpt(plain(doc.summary)) },
        fields: [["name", doc.title], ["tag", `${group} ${e.label} document`], ["main", plain(doc.summary)], ["text", intro]],
      });
      // a document split into parts: where a section or a case of it is shown, and how many cases came before it in its part
      const partOf = (s) => e.parts?.find((p) => p.sections.includes(s.id));
      const before = new Map();
      for (const s of doc.sections) {
        const used = new Set();
        const part = partOf(s);
        const size = part ? pagesOf(caseCount(sectionsOf(doc, part)), part.per).size : 0;
        const pageOf = (row) => (part ? partHref(e, part, part.per ? Math.floor(row / size) + 1 : 1) : e.href);
        const where = s.title ? `${doc.title}, ${s.title}` : doc.title;
        if (s.id) {
          const body = text(s.blocks);
          out.push({
            doc: { t: "x", k: "sec", n: s.title, p: doc.title, h: `${part ? partHref(e, part) : e.href}#${s.id}`, x: excerpt(body) },
            fields: [["name", s.title], ["tag", `${group} ${e.label}`], ["text", body]],
          });
        }
        let row = part ? before.get(part) ?? 0 : 0;
        for (const b of s.blocks) {
          if (b.t !== "table" || b.head.length < 3) continue;
          for (const r of b.rows) {
            const id = caseId(s.id, r[0], used);
            const rest = b.head.slice(1).map((h, k) => `${h}: ${plain(r[k + 1])}`).join(" ");
            out.push({
              doc: { t: "x", k: "case", n: plain(r[0]), p: where, h: `${pageOf(row)}#${id}`, x: excerpt(rest) },
              fields: [["name", plain(r[0])], ["tag", `${group} ${e.label}`], ["main", rest]],
            });
            row++;
          }
        }
        if (part) before.set(part, row);
      }
    }
  }
  return out;
}

// One Markdown file as blocks. Supported, because the documents use nothing else: a title, headings of level 2 and 3,
// paragraphs, bullet and numbered lists, tables, and fenced code. Anything else makes the build fail with the line named,
// so a new construct is added here on purpose and never lost on a page.
export function parseDoc(file) {
  const lines = read(find([file], file)).replace(/\r/g, "").split("\n");
  const doc = { file, title: "", sections: [{ id: "", title: "", blocks: [] }] };
  const used = new Set();
  const cur = () => doc.sections[doc.sections.length - 1];
  const fail = (i, why) => {
    throw new Error(`${file}:${i + 1}: ${why}`);
  };
  const cells = (l) =>
    l
      .trim()
      .replace(/\\\|/g, "\u0001")
      .replace(/`[^`]*`/g, (c) => c.replace(/\|/g, "\u0001")) // a pipe inside a code span is text
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((c) => c.replace(/\u0001/g, "|").trim());
  // a table from line i (its lines may be indented); returns the block and the line after it
  const table = (i) => {
    const head = cells(lines[i]);
    if (!/^\s*\|[\s|:-]+\|?$/.test(lines[i + 1] || "")) fail(i, "a table without its separator row");
    const rows = [];
    for (i += 2; i < lines.length && /^\s*\|/.test(lines[i]); i++) {
      const r = cells(lines[i]);
      if (r.length !== head.length) fail(i, `a table row with ${r.length} cells where the header has ${head.length}`);
      rows.push(r);
    }
    return [{ t: "table", head, rows }, i];
  };
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) {
      i++;
    } else if (/^# /.test(l)) {
      if (doc.title) fail(i, "a second level-1 heading");
      doc.title = l.slice(2).trim();
      i++;
    } else if (/^## /.test(l)) {
      const title = l.slice(3).trim();
      let id = slugify(title);
      for (let k = 2; used.has(id); k++) id = `${slugify(title)}-${k}`;
      used.add(id);
      doc.sections.push({ id, title, blocks: [] });
      i++;
    } else if (/^### /.test(l)) {
      cur().blocks.push({ t: "h3", text: l.slice(4).trim() });
      i++;
    } else if (/^```/.test(l)) {
      const lang = l.slice(3).trim();
      const body = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]); i++) body.push(lines[i]);
      if (i >= lines.length) fail(i, "a code fence that does not close");
      i++;
      cur().blocks.push({ t: "code", lang, text: body.join("\n") });
    } else if (/^\|/.test(l)) {
      const [block, next] = table(i);
      cur().blocks.push(block);
      i = next;
    } else if (/^([-*]|\d+\.) /.test(l)) {
      const ordered = /^\d+\./.test(l);
      const items = [];
      while (i < lines.length && /^([-*]|\d+\.) /.test(lines[i])) {
        let text = lines[i].replace(/^([-*]|\d+\.) /, "");
        const extra = []; // a table or a paragraph that stands inside the item, indented after a blank line
        i++;
        for (;;) {
          let k = i;
          while (k < lines.length && !lines[k].trim()) k++;
          if (k >= lines.length || !/^ {2,}\S/.test(lines[k])) break;
          const gap = k > i;
          i = k;
          if (/^\s+\|/.test(lines[i])) {
            const [block, next] = table(i);
            extra.push(block);
            i = next;
          } else if (!gap) {
            text += " " + lines[i].trim();
            i++;
          } else {
            let p = lines[i].trim();
            for (i++; i < lines.length && /^ {2,}\S/.test(lines[i]) && !/^\s+\|/.test(lines[i]); i++) p += " " + lines[i].trim();
            extra.push({ t: "p", text: p });
          }
        }
        items.push({ text, extra });
      }
      cur().blocks.push({ t: ordered ? "ol" : "ul", items });
    } else if (/^\s/.test(l) || /^[>#<!]/.test(l) || /^---+$/.test(l)) {
      fail(i, `a construct the reader does not know: ${l.slice(0, 40)}`);
    } else {
      let text = l.trim();
      for (i++; i < lines.length && lines[i].trim() && !/^(#|\||```|([-*]|\d+\.) )/.test(lines[i]); i++) text += " " + lines[i].trim();
      cur().blocks.push({ t: "p", text });
    }
  }
  if (!doc.title) fail(0, "no level-1 heading");
  doc.dir = path.posix.dirname(file);
  // the first paragraph, before the first heading when there is one, is the summary used in lists and as the description
  const intro = doc.sections.flatMap((s) => s.blocks).find((b) => b.t === "p");
  doc.summary = intro ? intro.text : "";
  doc.sections = doc.sections.filter((s) => s.id || s.blocks.length);
  return doc;
}

// A Mermaid flowchart of the form `A[label] --> B[label]` as a layered drawing: a node sits one row below the lowest node
// that points at it. The documents use nothing else of Mermaid; any other line makes the build fail.
export function parseFlow(src, where) {
  const lines = src.split("\n").map((l) => l.trim()).filter(Boolean);
  if (!/^flowchart (TB|TD)$/.test(lines[0] || "")) throw new Error(`${where}: only a top-to-bottom flowchart is drawn`);
  const label = new Map();
  const edges = [];
  const node = (s) => {
    const m = /^([A-Z0-9_]+)(?:\[([^\]]+)\])?$/.exec(s.trim());
    if (!m) throw new Error(`${where}: a node the drawing does not know: ${s}`);
    if (m[2]) label.set(m[1], m[2]);
    return m[1];
  };
  for (const l of lines.slice(1)) {
    const parts = l.split("-->");
    if (parts.length !== 2) throw new Error(`${where}: a line the drawing does not know: ${l}`);
    edges.push([node(parts[0]), node(parts[1])]);
  }
  const ids = [...new Set(edges.flat())];
  const row = new Map(ids.map((n) => [n, 0]));
  for (let pass = 0; pass < ids.length; pass++) for (const [a, b] of edges) row.set(b, Math.max(row.get(b), row.get(a) + 1));
  const rows = [];
  for (const n of ids) (rows[row.get(n)] ??= []).push(n);
  return { ids, label, edges, rows };
}
