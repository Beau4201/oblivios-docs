import { atom } from "../../lib/atom.mjs";
import { changelog } from "../../lib/changelog.mjs";
import { siteUrl } from "../../lib/site.mjs";

// The newest 50 publications of the snapshot; the page /changelog has them all.
export function GET() {
  return atom({
    path: "/feed/changelog.xml",
    title: "ObliviOS changelog",
    subtitle: "Every publication of the ObliviOS snapshot and what changed, newest first.",
    entries: changelog.slice(0, 50).map((e) => ({
      id: `${siteUrl}/changelog#${e.id}`,
      title: e.text,
      updated: e.t,
      link: `${siteUrl}/changelog#${e.id}`,
      summary: `${e.text} (${e.stamp})`,
    })),
  });
}
