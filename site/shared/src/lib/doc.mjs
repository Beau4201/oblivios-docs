// The reader of the Markdown documents the sites show, and the little inline markup of their text. Shared by both sites
// (oblivios.dev shows the documents, oblivios.org shows the brief for agents). Plain Node, no package.
// Self-test: node site/shared/src/lib/doc.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";

// The documents of the published repository, where the "Read from" line of a page points (ADR-268).
export const docsBlob = "https://github.com/Beau4201/oblivios-docs/blob/main/";

export const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "section";

// ---- the little markup of the records: code spans, links, bold, italic and the ADR-nnn references. Every other character is
// escaped, so a cell of the decision log can never put a tag or a script in a page. Written here and not taken from a
// package: the input is the owner's own table and the subset is small, and a package would be one more component in the SBOM.
export const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// A link of the decision log is relative to docs/governance/. Out in the repository it is a file on GitHub.
// `local(p, fragment)` may name a page of this portal for the repository path p (the documents the portal shows as pages).
export function docHref(u, from = "docs/governance", local = () => null) {
  if (/^(?:https?:|mailto:|#)/.test(u)) return u;
  const p = path.posix.normalize(path.posix.join(from, u.split("#")[0]));
  if (p.startsWith("..")) return "#";
  const here = local(p, u.includes("#") ? u.split("#")[1] : "");
  if (here) return here;
  return docsBlob + p + (u.includes("#") ? "#" + u.split("#")[1] : "");
}

const EVIDENCE = { measured: "Measured", "verified-in-source": "Verified in source", assumption: "Assumption" };

// hasAdr(n): does the portal have a page for ADR-n? Then the mention is a link.
export function inline(text, { hasAdr = () => false, from = "docs/governance", local = () => null } = {}) {
  const hold = [];
  const keep = (html) => `\u0000${hold.push(html) - 1}\u0000`;
  let s = String(text);
  s = s.replace(/`([^`]+)`/g, (_, c) => keep(`<code>${esc(c)}</code>`));
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => keep(`<a href="${esc(docHref(u, from, local))}">${esc(t)}</a>`));
  // the labels of the project's own rule for claims (AGENTS.md): [measured: the run], [verified-in-source: the path], [assumption]
  s = s.replace(/\[(measured|verified-in-source|assumption)(?::\s*([^\]]*))?\]/gi, (_, t, r) => keep(`<span class="ev">${EVIDENCE[t.toLowerCase()]}${r ? " · " + esc(r.trim()) : ""}</span>`));
  s = esc(s);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?![\w*])/g, "$1<em>$2</em>");
  s = s.replace(/\bADR-(\d{1,3})\b/g, (m, n) => (hasAdr(Number(n)) ? `<a href="/adr/${Number(n)}">${m}</a>` : m));
  for (let i = 0; i < 4 && s.includes("\u0000"); i++) s = s.replace(/\u0000(\d+)\u0000/g, (_, n) => hold[Number(n)]);
  return s;
}

// The plain text of a cell, for the search index and the title: the markup removed, nothing escaped.
export function plain(text) {
  return String(text)
    .replace(/\[([^\]]+)\]\([^)\s]+\)/g, "$1")
    .replace(/[`*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// One Markdown file as blocks. Supported, because the documents use nothing else: a title, headings of level 2 and 3,
// paragraphs, bullet and numbered lists, tables, and fenced code. Anything else makes the build fail with the line named,
// so a new construct is added here on purpose and never lost on a page.
export function parseDocText(text, file) {
  const lines = text.replace(/\r/g, "").split("\n");
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

function selfTest() {
  const assert = (c, m) => {
    if (!c) throw new Error("self-test: " + m);
  };
  const doc = parseDocText("# T\n\nIntro.\n\n## A b\n\n- x\n- y\n\n| k | v |\n| - | - |\n| 1 | 2 |\n", "f.md");
  assert(doc.title === "T", "title: " + doc.title);
  assert(doc.summary === "Intro.", "summary: " + doc.summary);
  const sec = doc.sections.find((s) => s.id === "a-b");
  assert(sec, "a section with the id a-b: " + JSON.stringify(doc.sections.map((s) => s.id)));
  const [ul, table] = sec.blocks;
  assert(ul.t === "ul" && ul.items.length === 2, "a list of two items: " + JSON.stringify(ul));
  assert(table.t === "table" && table.head.join() === "k,v" && table.rows[0].join() === "1,2", "a table: " + JSON.stringify(table));
  let msg = "";
  try {
    parseDocText("# T\n\n> quote\n", "f.md");
  } catch (e) {
    msg = e.message;
  }
  assert(msg.startsWith("f.md:3:"), "a construct the reader does not know names its line: " + msg);
  const html = inline("<script>[a](https://example.org/) `c`", { from: "docs" });
  assert(html.includes("&lt;script&gt;") && !html.includes("<script"), "a tag is escaped: " + html);
  assert(html.includes("<code>c</code>") && html.includes('<a href="https://example.org/">a</a>'), "code and link: " + html);
  console.log("doc self-test: OK");
}
if (process.argv[1] === fileURLToPath(import.meta.url)) selfTest();
