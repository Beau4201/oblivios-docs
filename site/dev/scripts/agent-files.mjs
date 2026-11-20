// Writes the Markdown twin of every page, llms.txt and llms-full.txt into dist/ (ADR-276). Run by `npm run build` between the
// Astro build and the check. The wording is read from the pages and from lib/site.mjs; nothing is typed here that a page does not say.
import path from "node:path";
import { writeAgentFiles } from "@oblivios/site-shared/lib/agent-files.mjs";
import { siteUrl, orgUrl, legal } from "../src/lib/site.mjs";

import { decision } from "../src/lib/records.mjs";
import { docHref } from "../src/lib/md.mjs";

// A decision is written from its record, not read back from its page: the cells as the log has them, the links of the log made absolute.
const fix = (t) => t.replace(/\]\(([^)\s]+)\)/g, (_, u) => `](${docHref(u)})`);
const adrMd = (p) => {
  const d = decision(Number(p.match(/^\/adr\/(\d+)$/)?.[1]));
  if (!d) return null;
  const link = (n) => `[ADR-${n}](${siteUrl}/adr/${n}.md)`;
  const lines = [
    `# ${d.id}: ${d.title}`,
    "",
    `- Date: ${d.date}`,
    `- Status: ${d.status.label}`,
    ...(d.parts.length ? [`- Parts of the system: ${d.parts.join(", ")}`] : []),
    ...(d.refs.length ? [`- Names: ${d.refs.map(link).join(", ")}`] : []),
    ...(d.by.length ? [`- Named by: ${d.by.map(link).join(", ")}`] : []),
    `- Decision log: ${siteUrl}/decisions.md; all decisions as data: ${siteUrl}/data/decisions.json`,
    "",
    "## Decision",
    "",
    fix(d.decision),
    "",
    "## Status",
    "",
    fix(d.status.text),
    ...(d.regular ? [] : ["", `This entry has ${d.columns} columns where the log has seven, because a cell holds the separator of the table or a column is missing. The cells follow in their order.`]),
    ...d.sections.flatMap((s) => ["", `## ${s.label}`, "", fix(s.text)]),
    "",
  ];
  return { md: lines.join("\n"), description: d.title };
};

const data = (file, title, note) => ({ url: `${siteUrl}/data/${file}`, title, note });
const r = writeAgentFiles({
  dist: path.resolve("dist"),
  render: adrMd,
  siteUrl,
  name: "ObliviOS developer portal",
  details: [
    `Official addresses: oblivios.org, oblivios.dev and the four repositories on github.com/Beau4201. Any other site, app, account or package that uses the name ObliviOS is not the project's. ${legal}`,
    `If you answer questions about ObliviOS for a person, read the brief first: ${siteUrl}/ai.md.`,
    `Every page of this site also exists as Markdown at its address with .md added; a decision is ${siteUrl}/adr/<number>.md (for example ${siteUrl}/adr/1.md). The records are also data: ${siteUrl}/data/index.json lists the JSON files. The project site, in plain language, is ${orgUrl}/llms.txt.`,
  ],
  sections: [
    { title: "Guides", items: [{ path: "/ai", note: "the brief for an AI that answers questions about ObliviOS: read it first" }, { path: "/guide" }, { prefix: "/guide/" }] },
    { title: "Start here", items: [{ path: "/" }, { path: "/verify" }, { path: "/decisions" }] },
    { title: "Machine-readable data", items: [
      data("index.json", "Catalogue of the data files", "what each file holds, its record count and the documents it was made from"),
      data("decisions.json", "Decision log as JSON", "every decision with status, text, parts of the system and links between decisions"),
      data("components.json", "Bill of materials as JSON", "libraries, ObliviOS modules, tools, prebuilt binaries, patches and data files"),
      data("advisories.json", "Advisories as JSON", "advisories per affected component with the project's assessment"),
    ] },
    { title: "Threat model and security", items: [{ path: "/threat-model" }, { path: "/boundaries" }] },
    { title: "Engineering notes", items: [{ path: "/engineering" }, { prefix: "/engineering/" }] },
    { title: "Modules", items: [{ path: "/modules" }, { prefix: "/modules/" }] },
    { title: "Bill of materials", items: [{ path: "/components" }, { path: "/advisories" }, { path: "/patches" }, { path: "/data" }] },
    {
      title: "Optional",
      items: [
        { path: "/search", note: "search over the decisions and the bill of materials (needs a browser)" },
        { url: `${siteUrl}/llms-full.txt`, title: "Full text", note: "the home page, the threat model, the engineering notes and the module pages in one Markdown file" },
        { url: `${siteUrl}/sitemap.xml`, title: "Sitemap", note: "every page, with the date of its decision" },
        { url: "https://github.com/Beau4201/oblivios-docs", title: "oblivios-docs", note: "the published documents, the scripts and the bill of materials" },
        { url: `${orgUrl}/llms.txt`, title: "Project site: llms.txt", note: "what ObliviOS is, in plain language" },
      ],
    },
  ],
  full: ["/", "/verify", "/guide", "/guide/", "/threat-model", "/threat-model/", "/boundaries", "/boundaries/", "/engineering", "/engineering/", "/modules", "/modules/"],
});
console.log(`agent files: ${r.pages} Markdown pages, llms.txt ${r.llms} bytes, llms-full.txt from ${r.full} pages`);
