// The little markup of the records: code spans, links, bold, italic and the ADR-nnn references. Every other character is
// escaped, so a cell of the decision log can never put a tag or a script in a page. Written here and not taken from a
// package: the input is the owner's own table and the subset is small, and a package would be one more component in the SBOM.
import path from "node:path";
import { docsBlob } from "./site.mjs";

export const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// A link of the decision log is relative to docs/governance/. Out in the repository it is a file on GitHub.
// `local(p)` may name a page of this portal for the repository path p (the documents the portal shows as pages).
export function docHref(u, from = "docs/governance", local = () => null) {
  if (/^(?:https?:|mailto:|#)/.test(u)) return u;
  const p = path.posix.normalize(path.posix.join(from, u.split("#")[0]));
  if (p.startsWith("..")) return "#";
  const here = local(p);
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

// The first sentence of a cell, cut at a word if it is long. It names the entry in lists and in the title of its page.
export function firstSentence(text, max = 170) {
  const t = String(text).trim();
  const m = t.match(/^(.+?[.!?])(?=\s+[A-Z(\[`*"]|$)/s);
  let s = (m ? m[1] : t).trim();
  // a long first sentence is cut at its first clause (a colon, a dash, a bracket, ", as", ", which"), so a title says the decision
  // and the full sentence stays in the entry
  if (s.length > 115) {
    const at = s.slice(45, 150).search(/[:;]\s|\s—\s|\s\(|,\s+(?:as|which|with|so that|because)\s/);
    if (at >= 0) s = s.slice(0, 45 + at).replace(/[\s,;:(\[`]+$/, "") + ".";
  }
  if (s.length > max) {
    const cut = s.slice(0, max - 1);
    s = cut.slice(0, Math.max(cut.lastIndexOf(" "), 40)).replace(/[\s,;:(\[`]+$/, "") + "…";
  }
  return s;
}

// A long cell is read as paragraphs of a few sentences, because the table keeps one cell on one line.
export function paragraphs(text, size = 460) {
  const t = String(text).trim();
  if (t.length <= size * 1.5) return [t];
  const sentences = t.split(/(?<=[.!?])\s+(?=[A-Z(\[`*"])/);
  const out = [];
  let cur = "";
  for (const s of sentences) {
    if (cur && (cur + " " + s).length > size) {
      out.push(cur);
      cur = s;
    } else cur = cur ? cur + " " + s : s;
  }
  if (cur) out.push(cur);
  return out;
}
