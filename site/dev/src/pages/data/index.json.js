import { decisionStats } from "../../lib/records.mjs";
import { sbom, advisories } from "../../lib/sbom.mjs";
import { siteUrl, docsBlob } from "../../lib/site.mjs";

// The catalogue of the machine-readable data of this site (ADR-276): what each file holds, how many records, and the
// documents it was made from. Counts are read from the same lists that make the files.
export function GET() {
  return new Response(
    JSON.stringify({
      name: "ObliviOS developer portal: data",
      site: siteUrl,
      licence: "CC-BY-4.0",
      indexForAgents: `${siteUrl}/llms.txt`,
      datasets: [
        { url: `${siteUrl}/data/decisions.json`, format: "json", records: decisionStats.total, description: "Every decision of the decision log, with status, text, parts of the system and links between decisions." },
        { url: `${siteUrl}/data/components.json`, format: "json", records: sbom.total, description: "The bill of materials summarised: libraries, ObliviOS modules, tools, prebuilt binaries, patches and data files." },
        { url: `${siteUrl}/data/advisories.json`, format: "json", records: advisories.length, description: "Advisories per affected component, with the project's assessment." },
        { url: `${siteUrl}/search-index.json`, format: "json", description: "The inverted index the search page reads; meant for the page script, not as a stable interface." },
      ],
      documents: [
        { url: `${docsBlob}sbom/oblivios.cdx.json`, format: "CycloneDX 1.6 JSON", description: "The full bill of materials." },
        { url: `${docsBlob}sbom/oblivios.spdx.json`, format: "SPDX JSON", description: "The same bill of materials as SPDX." },
        { url: `${docsBlob}sbom/files.sha256`, format: "sha256sum", description: "The SHA-256 of every file of the published repository." },
        { url: `${docsBlob}docs/governance/decision-log.md`, format: "Markdown table", description: "The decision log as written; one row is one decision." },
      ],
      pages: { markdown: "Every page is also available as Markdown at its address with .md added; the home page is /index.md.", fullText: `${siteUrl}/llms-full.txt`, sitemap: `${siteUrl}/sitemap.xml` },
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}
