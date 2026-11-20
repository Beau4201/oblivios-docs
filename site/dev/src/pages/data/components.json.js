import { sbom, libraries, modules, tools, prebuilt, upstream, patchAreas, dataShipped, dataSources } from "../../lib/sbom.mjs";
import { docsBlob } from "../../lib/site.mjs";

// The bill of materials as the Components, Patches and Data pages read it (ADR-276). The full documents are
// oblivios.cdx.json and oblivios.spdx.json in the sbom/ folder of oblivios-docs, named under `documents`.
export function GET() {
  return new Response(
    JSON.stringify({
      about: "The ObliviOS bill of materials, summarised: counts, libraries, ObliviOS modules, tools, prebuilt binaries, what the patches change, and the data files with their sources.",
      licence: "CC-BY-4.0",
      asOf: sbom.stamp,
      stage: sbom.stage,
      upstreamBaseline: sbom.baseline,
      totals: { components: sbom.total, kinds: sbom.kinds, files: sbom.files, advisories: sbom.advisories },
      ecosystems: sbom.ecosystems.map(([name, count]) => ({ name, count })),
      licences: sbom.licences.map(([name, count]) => ({ name, count })),
      commits: sbom.commits,
      documents: sbom.formats.map((f) => `${docsBlob}sbom/${f}`),
      libraries,
      modules,
      tools,
      prebuilt,
      upstreamFilesModified: upstream,
      patchAreas,
      dataShipped,
      dataSources,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}
