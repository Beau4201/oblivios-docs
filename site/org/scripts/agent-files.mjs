// Writes the Markdown twin of every page, llms.txt and llms-full.txt into dist/ (ADR-276). Run by `npm run build` between the
// Astro build and the check. The wording is read from the pages and from lib/site.mjs; nothing is typed here that a page does not say.
import path from "node:path";
import { writeAgentFiles } from "@oblivios/site-shared/lib/agent-files.mjs";
import { siteUrl, legal } from "../src/lib/site.mjs";

const r = writeAgentFiles({
  dist: path.resolve("dist"),
  siteUrl,
  name: "ObliviOS",
  details: [
    `Official addresses: oblivios.org, oblivios.dev and the four repositories on github.com/Beau4201. Any other site, app, account or package that uses the name ObliviOS is not the project's. ${legal}`,
    `Every page of this site also exists as Markdown at its address with .md added (the home page is ${siteUrl}/index.md). The decisions, the threat model, the bill of materials and their machine-readable data are on the developer portal: https://oblivios.dev/llms.txt.`,
  ],
  sections: [
    { title: "What it is", items: [{ path: "/what-it-does" }, { path: "/status" }, { path: "/devices" }, { path: "/faq" }] },
    { title: "Verify and trust", items: [{ path: "/verify" }, { path: "/security" }, { path: "/privacy" }, { path: "/trademark" }, { path: "/contact" }] },
    {
      title: "Optional",
      items: [
        { path: "/", note: "the home page as Markdown" },
        { url: "https://oblivios.dev/llms.txt", title: "Developer portal: llms.txt", note: "the index for agents of the decision log, the threat model, the engineering notes and the bill of materials" },
        { url: `${siteUrl}/llms-full.txt`, title: "Full text of this site", note: "every page of this site in one Markdown file" },
        { url: `${siteUrl}/sitemap.xml`, title: "Sitemap", note: "every page, with the date of its facts" },
        { url: "https://github.com/Beau4201/oblivios-docs", title: "oblivios-docs", note: "the published documents, the scripts and the bill of materials" },
      ],
    },
  ],
  full: ["/", "/what-it-does", "/status", "/devices", "/faq", "/verify", "/security", "/privacy", "/trademark", "/contact"],
});
console.log(`agent files: ${r.pages} Markdown pages, llms.txt ${r.llms} bytes, llms-full.txt from ${r.full} pages`);
