import { atom } from "../../lib/atom.mjs";
import { decisions } from "../../lib/records.mjs";
import { plain } from "../../lib/md.mjs";
import { siteUrl } from "../../lib/site.mjs";

// The newest 40 entries of the decision log. The log gives a date and no time, so an entry is dated at midnight UTC.
const cut = (s, n = 600) => (s.length > n ? s.slice(0, s.lastIndexOf(" ", n)) + "…" : s);

export function GET() {
  return atom({
    path: "/feed/decisions.xml",
    title: "ObliviOS decision log",
    subtitle: "The newest decisions of ObliviOS, with their status.",
    entries: decisions.slice(0, 40).map((d) => ({
      id: `${siteUrl}/adr/${d.n}`,
      title: `ADR-${d.n}: ${plain(d.title)}`,
      updated: `${d.date}T00:00:00Z`,
      link: `${siteUrl}/adr/${d.n}`,
      summary: `${d.status.label}. ${cut(plain(d.decision))}`,
    })),
  });
}
