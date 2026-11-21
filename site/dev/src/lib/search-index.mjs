// The search index, written at build time to /search-index.json and read by /browse.js. It holds every decision, every
// component, advisory, data set and file of the SBOM as one document, and an inverted index over their words.
//
// Shape (the check of the build reads it too):
//   v      1
//   n, avg number of documents and their mean length in words
//   g      the commits the file links point at
//   docs   one object per document; t is its type: d decision, c component, a advisory, s data set, f file, x a published
//          document, a section of one or a case of one (k doc, sec or case); w is its
//          length in words, the other keys are what the script shows and filters by (l is a licence, e an ecosystem)
//   terms  every word, sorted with the default sort of JavaScript (the script finds a prefix by bisection)
//   post   post[i] belongs to terms[i]: pairs of document number and weight + 256 * mask, flattened. The weight is the
//          word's count in the document, taken per field with the weight of the field; the mask says in which fields
//          it stands (1 name or id, 2 decision or description, 4 reasons, 8 review or notes).
import { tokenize } from "./tokenize.mjs";
import { plain } from "./md.mjs";
import { decisions } from "./records.mjs";
import { documentIndex } from "./documents.mjs";
import { sbom, libraries, modules, tools, advisories, dataShipped, dataSources, files, prebuilt, patchFiles } from "./sbom.mjs";

const F = { name: [14, 1], title: [7, 1], main: [3, 2], text: [1.6, 4], more: [1.2, 4], note: [1.6, 8], tag: [3, 1], rec: [2, 8] };

export function buildSearchIndex() {
  const docs = [];
  const add = (doc, fields) => docs.push({ doc, fields });

  for (const d of decisions) {
    add(
      { t: "d", i: d.id, n: d.title, dt: d.date, st: d.status.kind, sl: d.status.label, pt: d.parts, tp: d.topic, cr: d.crucial ? 1 : 0, cw: d.crucial ? d.crucial.why : "", ev: d.ev, x: plain(d.decision).slice(0, 520), r: plain(d.review).slice(0, 240), c: d.regular ? 0 : 1 },
      [
        ["name", `${d.id} adr ${d.n}`], ["title", plain(d.title)], ["main", plain(d.decision)],
        ["text", d.sections[0] ? plain(d.sections[0].text) : ""], ["more", d.sections.slice(1, -1).map((s) => plain(s.text)).join(" ")],
        ["note", plain(d.review)], ["tag", `${d.status.label} ${d.topic} ${d.crucial ? "crucial" : ""} ${d.parts.join(" ")} ${d.ev.join(" ").replace(/-/g, " ")}`],
      ],
    );
  }
  for (const l of libraries) {
    add({ t: "c", k: "lib", n: l.name, v: l.version, l: l.licence ?? "", e: l.eco, a: l.adv }, [["name", l.name], ["tag", `${l.version} ${l.licence ?? ""} ${l.eco}`]]);
  }
  for (const m of modules) {
    add({ t: "c", k: "mod", n: m.name, v: m.version, l: m.licence ?? "", e: "Upstream", a: 0, x: m.filesModified !== undefined ? `${m.filesModified} files modified by patches` : m.patches !== undefined ? `${m.patches} patches` : "" },
      [["name", m.name], ["tag", `${m.version} ${m.licence ?? ""} upstream project module patches`]]);
  }
  for (const t of tools) add({ t: "c", k: "tool", n: t.name, v: t.version, l: "", e: "Tool", a: 0, x: t.description }, [["name", t.name], ["tag", `${t.version} tool`], ["text", t.description]]);
  for (const g of advisories) {
    for (const a of g.items) {
      add({ t: "a", i: a.id, n: a.description, c: `${g.name} ${g.version}`, e: g.eco, x: a.detail.slice(0, 400), u: a.url },
        [["name", a.id], ["title", a.description], ["tag", `${g.name} ${g.version} ${g.eco} advisory`], ["main", a.detail]]);
    }
  }
  for (const s of dataShipped) add({ t: "s", n: s.name, l: s.licence ?? "", m: "shipped", f: s.files, x: s.record }, [["name", s.name], ["tag", `${s.licence ?? ""} data in the repositories`], ["rec", s.record]]);
  for (const s of dataSources) add({ t: "s", n: s.name, l: s.licence ?? "", m: "source", np: s.missing ? 1 : 0, x: s.record }, [["name", s.name], ["tag", `${s.licence ?? ""} data source ${s.missing ? "not in the repositories" : ""}`], ["rec", s.record]]);
  const pre = new Set(prebuilt.map((p) => p.sha256));
  const patches = new Set(patchFiles);
  for (const f of files) {
    const isPre = pre.has(f.hash);
    add({ t: "f", n: f.path, h: f.hash, ...(isPre ? { b: 1 } : {}), ...(patches.has(f.path) ? { p: 1 } : {}) }, [["name", f.hash], ["title", f.path], ["tag", `${isPre ? "prebuilt binary" : ""} ${patches.has(f.path) ? "patch" : "file"}`]]);
  }

  for (const d of documentIndex()) add(d.doc, d.fields);

  const post = new Map(); // term -> Map(doc -> [weight, mask])
  const lens = [];
  docs.forEach(({ fields }, di) => {
    let len = 0;
    for (const [field, text] of fields) {
      const [w, mask] = F[field];
      const counts = new Map();
      for (const tok of tokenize(text)) {
        counts.set(tok, (counts.get(tok) ?? 0) + 1);
        len++;
      }
      for (const [tok, c] of counts) {
        let byDoc = post.get(tok);
        if (!byDoc) post.set(tok, (byDoc = new Map()));
        const cur = byDoc.get(di) ?? [0, 0];
        cur[0] += w * (1 + Math.log2(c));
        cur[1] |= mask;
        byDoc.set(di, cur);
      }
    }
    lens.push(len);
  });
  const terms = [...post.keys()].sort();
  return {
    v: 1,
    n: docs.length,
    avg: Math.round((lens.reduce((a, b) => a + b, 0) / docs.length) * 10) / 10,
    g: sbom.commits,
    docs: docs.map((d, i) => ({ ...d.doc, w: lens[i] })),
    terms,
    post: terms.map((t) => [...post.get(t).entries()].flatMap(([d, [w, m]]) => [d, Math.min(255, Math.round(w * 2)) + 256 * m])),
  };
}
