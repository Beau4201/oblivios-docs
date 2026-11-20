// The text helpers of the portal. The inline markup (`inline`, `esc`, `plain`, `docHref`) is in the shared package, which
// oblivios.org uses as well; what stays here reads the sentences of a cell for titles and lists.
export { esc, plain, docHref, inline } from "@oblivios/site-shared/lib/doc.mjs";

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
