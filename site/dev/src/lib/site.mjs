// Fixed facts of oblivios.dev: its address, navigation and footer lines. Facts about the project are read in records.mjs
// and sbom.mjs.
export const siteUrl = "https://oblivios.dev";
export const orgUrl = "https://oblivios.org";
// The documents of the published repository, where the "Read from" line of a page points (ADR-268).
export const docsBlob = "https://github.com/Beau4201/oblivios-docs/blob/main/";

export const pages = [
  { label: "Decisions", href: "/decisions" },
  { label: "Components", href: "/components" },
  { label: "Threat model", href: "/threat-model" },
  { label: "Engineering", href: "/engineering" },
  { label: "Quickstarts", href: "/quickstarts" },
  { label: "Search", href: "/search" },
];
export const footPages = pages;
export const footAbout = [
  { label: "Project site", href: orgUrl },
  { label: "Security", href: `${orgUrl}/security` },
  { label: "Privacy", href: `${orgUrl}/privacy` },
  { label: "Trademark and attribution", href: `${orgUrl}/trademark` },
];
export const portal = { label: "Project site", href: orgUrl };

// the four public repositories (the account is the owner's, ADR-171)
export const repos = ["docs", "manifest", "platform", "services"].map((n) => ({
  label: `oblivios-${n}`,
  href: `https://github.com/Beau4201/oblivios-${n}`,
}));

// Which sites and accounts are the owner's, said on every page (the owner's rule of 2026-11-18, ADR-256).
export const own =
  "Only oblivios.org, oblivios.dev and the four repositories on github.com/Beau4201 are mine. Do not trust any other site, app, account or package that uses the name ObliviOS.";

export const legal =
  "Documents: CC-BY-4.0. Code and scripts: Apache-2.0. The name ObliviOS and its logo are not licensed. This site is static: no cookies, no requests to other sites. It runs one script of its own, for search, and counts nothing.";

export const tag = "Developer portal";

// decisions per page of the decision list (the list is paged in the build, so it needs no script)
export const PAGE_SIZE = 20;
