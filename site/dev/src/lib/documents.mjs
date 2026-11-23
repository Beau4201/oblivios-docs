// The documents the portal shows as pages: the threat model, the capability boundaries, the engineering notes of the areas
// and the module pages. Each is a Markdown file of the repository that the snapshot of oblivios-docs publishes
// (PUBLISH in tools/docs/build-public-docs.py), read here at build time and never copied into the site.
import { slugify, parseDocText } from "@oblivios/site-shared/lib/doc.mjs";
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
export const documentPaths = () => [
  "/guide",
  brief.href,
  ...guides.flatMap((g) => (g.parts ? partPages(g).map((p) => p.href) : [g.href])),
  ...security.flatMap((e) => partPages(e).map((p) => p.href)),
  "/engineering",
  ...notes.map((n) => n.href),
  "/modules",
  ...modules.map((q) => q.href),
];

// The guides of docs/guides/ (ADR-284), in the order a reader needs them. The build guide is long, so it is one page per chapter:
// a part for each `##` heading (its id is the slug of the page), the first with the text before the first heading.
const buildChapters = [
  ["before-you-begin", "Before you begin", "What you will have at the end, what a self-built image is and is not, how long it takes and what differs between the two phones."],
  ["what-you-need", "What you need", "The machines, the tools, the disk and the checks to make before a long job."],
  ["get-the-source", "Get the source", "The pinned GrapheneOS tree: choose the tag, check the manifest, sync."],
  ["add-oblivios", "Add ObliviOS", "Apply the patch packages in the right order, and read what the published source does not yet contain."],
  ["vendor-files-for-your-device", "Vendor files for your device", "Generate the Pixel vendor modules for each device, and the flags that look like shortcuts and are not."],
  ["build-the-prebuilt-pieces", "Build the prebuilt pieces", "The binaries that are committed, how each is rebuilt and what is known about them."],
  ["build-the-image", "Build the image", "The exports, the build for each phone and the checks that a clean exit does not give."],
  ["make-it-yours", "Make it yours", "Your own keys, update address and patches, and a move to a newer upstream tag."],
  ["sign-and-package", "Sign and package", "Why a separate machine signs, and what to check on its result."],
  ["flash-and-check", "Flash and check", "Flash from fastbootd and verify the phone before you trust it."],
  ["test", "Test", "The checks that run without a phone and the ones that need one."],
  ["when-something-goes-wrong", "When something goes wrong", "Each known failure as a symptom, a cause and a fix."],
  ["what-this-guide-does-not-cover", "What this guide does not cover", "The limits of the guide, plainly."],
];
export const guides = [
  { slug: "start", file: "docs/guides/start.md", label: "Start here", kind: "Learn", who: "You have just found ObliviOS and want to learn about it: what it is and where to look next.", plate: "desk", plateLabel: "An open ledger with a lens over it" },
  {
    slug: "build", file: "docs/guides/build.md", label: "Build with it", kind: "Build", who: "You want to build ObliviOS for a Pixel 7a or a Pixel 10a, or to take it further as a fork.", plate: "term", plateLabel: "A terminal window",
    parts: buildChapters.map(([slug, label, lede], i) => ({ slug: i ? slug : "", label, lede, sections: i ? [slug] : ["", slug] })),
  },
].map((g) => ({ ...g, href: `/guide/${g.slug}` }));
// the brief for AI agents (ADR-284), a page of its own at /ai on both sites
export const brief = { slug: "ai", file: "docs/guides/ai.md", label: "Brief for AI agents", href: "/ai" };

export const notes = [
  { slug: "airpods", file: "docs/architecture/airpods-engineering-notes.md", label: "AirPods" },
  { slug: "app-drawer", file: "docs/architecture/app-drawer-engineering-notes.md", label: "App drawer" },
  { slug: "boot", file: "docs/architecture/boot-engineering-notes.md", label: "Boot picture" },
  { slug: "datamap", file: "docs/architecture/datamap-engineering-notes.md", label: "Data map" },
  { slug: "duress", file: "docs/architecture/duress-engineering-notes.md", label: "Duress Unlock" },
  { slug: "duress-picture", file: "docs/architecture/duress-picture-engineering-notes.md", label: "Duress Unlock: picture and timing" },
  { slug: "grab-detection", file: "docs/architecture/grab-detection-engineering-notes.md", label: "Grab detection" },
  { slug: "keyboard", file: "docs/architecture/keyboard-engineering-notes.md", label: "Keyboard" },
  { slug: "site", file: "docs/architecture/site-engineering-notes.md", label: "These sites" },
].map((n) => ({ ...n, href: `/engineering/${n.slug}` }));

export const modules = [
  { slug: "vault-core", file: "docs/modules/vault-core.md", label: "vault-core" },
  { slug: "exit-daemon", file: "docs/modules/exit-daemon.md", label: "exit-daemon" },
  { slug: "airpods-core", file: "docs/modules/airpods-core.md", label: "airpods-core" },
].map((q) => ({ ...q, href: `/modules/${q.slug}` }));

const all = [...guides, brief, ...security, ...notes, ...modules];
// the page of this portal for a repository path, so a link between two documents stays on the portal; a link to a section
// of a document that is shown in parts lands on the part that holds the section
export const localHref = (p, frag = "") => {
  const e = all.find((d) => d.file === p);
  if (!e) return null;
  const part = frag && e.parts?.find((x) => x.sections.includes(frag));
  return part ? `${partHref(e, part)}#${frag}` : e.href;
};

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
  for (const [group, list] of [["Guides", guides], ["Security model", security], ["Engineering notes", notes], ["Modules", modules]]) {
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

// One Markdown file as blocks (the reader is in the shared package, doc.mjs, for both sites).
export function parseDoc(file) {
  return parseDocText(read(find([file], file)), file);
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
