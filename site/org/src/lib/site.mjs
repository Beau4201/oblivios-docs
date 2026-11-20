// Fixed facts of oblivios.org: its address, navigation and footer lines. Facts about the project are read in records.mjs.
import fs from "node:fs";
import path from "node:path";

export const siteUrl = "https://oblivios.org";

export const pages = [
  // the way of a first-time visitor: what it is, where it runs, how far it is, why to trust it, then help
  { label: "What it does", href: "/what-it-does" },
  { label: "Devices", href: "/devices" },
  { label: "Status", href: "/status" },
  { label: "Verify it", href: "/verify" },
  { label: "Security", href: "/security" },
  { label: "FAQ", href: "/faq" },
  { label: "Contact", href: "/contact" },
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
  { label: "Developer portal", href: "https://oblivios.dev" },
];
// The developer portal (oblivios.dev, site/dev, ADR-268) is live since 2026-11-19 (read: 340 files identical to the
// build, 200 over HTTPS), so the header and the footer link it: it is the way from this site to the 315 pages of the record.
// The button leads to the guide, the way in for a developer (ADR-282, ADR-284); the footer keeps the way to the portal's home.
export const portal = { label: "Guide for devs", href: "https://oblivios.dev/guide" };

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
