import { decisions, decisionStats } from "../../lib/records.mjs";
import { siteUrl, docsBlob } from "../../lib/site.mjs";

// Every decision of the log as data (ADR-276): the cells of its row as the log writes them (inline Markdown), the parts of the
// system it belongs to, and the decisions it names and that name it. Newest first, like the log.
export function GET() {
  return new Response(
    JSON.stringify({
      about: "The ObliviOS decision log, one object per decision. Text fields are inline Markdown as written in the log.",
      licence: "CC-BY-4.0",
      source: `${docsBlob}docs/governance/decision-log.md`,
      asOf: decisionStats.latest,
      total: decisionStats.total,
      accepted: decisionStats.accepted,
      proposed: decisionStats.proposed,
      decisions: decisions.map((d) => ({
        id: d.id,
        number: d.n,
        date: d.date,
        title: d.title,
        status: d.status.label,
        statusText: d.status.text,
        decision: d.decision,
        sections: d.sections.map(({ label, text }) => ({ label, text })),
        parts: d.parts,
        evidenceTags: d.ev,
        references: d.refs.map((n) => `ADR-${n}`),
        referencedBy: d.by.map((n) => `ADR-${n}`),
        page: `${siteUrl}/adr/${d.n}`,
        markdown: `${siteUrl}/adr/${d.n}.md`,
      })),
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}
