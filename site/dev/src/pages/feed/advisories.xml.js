import { atom } from "../../lib/atom.mjs";
import { advisories, sbomTime } from "../../lib/sbom.mjs";
import { siteUrl } from "../../lib/site.mjs";

// Every advisory of the bill of materials. The data has no date per advisory, only the time the SBOM was made, so every
// entry carries that time: a reader that shows entries as new when they are updated shows them again after a new SBOM.
export function GET() {
  return atom({
    path: "/feed/advisories.xml",
    title: "ObliviOS advisories",
    subtitle: "The known vulnerabilities of the components of ObliviOS and how each was assessed, as of the last bill of materials.",
    entries: advisories.flatMap((g) =>
      g.items.map((v) => ({
        id: `${siteUrl}/advisories#${v.id}:${g.ref}`,
        title: `${v.id}: ${g.name} ${g.version}`,
        updated: sbomTime,
        link: `${siteUrl}/advisories`,
        related: v.url || undefined,
        summary: `${v.description} Assessment (${v.state || "no state"}): ${v.detail}`,
      })),
    ),
  });
}
