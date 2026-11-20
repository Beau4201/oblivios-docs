import { sbom, advisories } from "../../lib/sbom.mjs";

// The advisories of the bill of materials, grouped by the component they affect, each with the project's assessment (ADR-276).
export function GET() {
  return new Response(
    JSON.stringify({
      about: "Known advisories for components of ObliviOS, each with the assessment recorded by the project.",
      licence: "CC-BY-4.0",
      asOf: sbom.stamp,
      advisories: sbom.advisories,
      components: advisories,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}
