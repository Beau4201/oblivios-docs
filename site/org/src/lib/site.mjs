// Fixed facts of oblivios.org: its address, navigation and footer lines. Facts about the project are read in records.mjs.
import fs from "node:fs";
import path from "node:path";

export const siteUrl = "https://oblivios.org";

export const pages = [
  { label: "What it does", href: "/what-it-does" },
  { label: "Verify it", href: "/verify" },
  { label: "Status", href: "/status" },
  { label: "FAQ", href: "/faq" },
  { label: "Security", href: "/security" },
];
export const footPages = pages.slice(0, 4);
export const footAbout = [
  { label: "Security", href: "/security" },
  { label: "Privacy", href: "/privacy" },
  { label: "Trademark and attribution", href: "/trademark" },
];
// The developer portal (oblivios.dev) has no pages yet: a link would be dead. Set this to
// { label: "Developer portal", href: "https://oblivios.dev" } when that site is live and the header and footer show it.
export const portal = null;

export const legal =
  "Documents: CC-BY-4.0. Code and scripts: Apache-2.0. The name ObliviOS and its logo are not licensed. This site is static: no cookies, no tracking, no requests to other sites.";

export const review = process.env.REVIEW === "1";

// What a page says about where its claims come from goes to a file at build time for the claim review (C-1),
// never into the page (ADR-251).
const claimsDir = path.resolve(process.cwd(), ".build/claims");
export function sources(page, items) {
  fs.mkdirSync(claimsDir, { recursive: true });
  fs.writeFileSync(path.join(claimsDir, page + ".txt"), items.map((i) => i.replace(/<[^>]+>/g, "")).join("\n") + "\n");
}
