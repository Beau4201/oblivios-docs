// Fixed facts of oblivios.org: its address, navigation and footer lines. Facts about the project are read in records.mjs.
import fs from "node:fs";
import path from "node:path";

export const siteUrl = "https://oblivios.org";

export const pages = [
  { label: "What it does", href: "/what-it-does" },
  { label: "Verify it", href: "/verify" },
  { label: "Devices", href: "/devices" },
  { label: "Status", href: "/status" },
  { label: "FAQ", href: "/faq" },
  { label: "Contact", href: "/contact" },
  { label: "Security", href: "/security" },
];
export const footPages = pages.filter((p) => p.href !== "/security");

// The four public repositories (the account is the owner's, ADR-171). They are private until the flip of the checklist
// (R-7), which comes before the site goes live, so these links work from the first day.
export const repos = ["docs", "manifest", "platform", "services"].map((n) => ({
  label: `oblivios-${n}`,
  href: `https://github.com/Beau4201/oblivios-${n}`,
}));

// Which sites and accounts are the owner's, said on every page (the owner's rule of 2026-11-18). It names only what is
// known to be the owner's, and says nothing about what does not exist, so it cannot be made false by a new site of others.
export const own =
  "Only oblivios.org, oblivios.dev and the four repositories on github.com/Beau4201 are mine. Do not trust any other site, app, account or package that uses the name ObliviOS.";
export const footAbout = [
  { label: "Security", href: "/security" },
  { label: "Privacy", href: "/privacy" },
  { label: "Trademark and attribution", href: "/trademark" },
];
// The developer portal (oblivios.dev) is built in site/dev (ADR-268) but not deployed: a link would be dead. Set this to
// { label: "Developer portal", href: "https://oblivios.dev" } when that site is live and the header and footer show it.
export const portal = null;

export const legal =
  "Documents: CC-BY-4.0. Code and scripts: Apache-2.0. The name ObliviOS and its logo are not licensed. This site is static: no cookies, no requests to other sites. Page views are counted without cookies.";

export const review = process.env.REVIEW === "1";

// What a page says about where its claims come from goes to a file at build time for the claim review (C-1),
// never into the page (ADR-251).
const claimsDir = path.resolve(process.cwd(), ".build/claims");
export function sources(page, items) {
  fs.mkdirSync(claimsDir, { recursive: true });
  fs.writeFileSync(path.join(claimsDir, page + ".txt"), items.map((i) => i.replace(/<[^>]+>/g, "")).join("\n") + "\n");
}
