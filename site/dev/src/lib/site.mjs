// Fixed facts of oblivios.dev: its address, navigation and footer lines. Facts about the project are read in records.mjs
// and sbom.mjs.
export const siteUrl = "https://oblivios.dev";
export const orgUrl = "https://oblivios.org";
// The documents of the published repository, where the "Read from" line of a page points (ADR-268).
export { docsBlob } from "@oblivios/site-shared/lib/doc.mjs";

// The header menu: learn, then understand the design, then read the record, then look things up. A group opens a list of
// its pages, so a page that was only reachable from another page (advisories, the capability boundaries, the two guides)
// is one step from every page. The first item of a group is the page its label links to.
export const nav = [
  { label: "Guide", print: "notebook", intro: "Two guides for two readers, and a brief for an AI that answers questions about ObliviOS.", items: [
    { label: "Overview", href: "/guide", note: "Two guides for two readers" },
    { label: "Start here", href: "/guide/start", note: "What ObliviOS is and is not, and where to look next" },
    { label: "Build with it", href: "/guide/build", note: "Build the image for a Pixel 7a or 10a" },
    { label: "Brief for AI agents", href: "/ai", note: "Where each fact lives, for an AI that answers questions" },
  ] },
  { label: "Design", print: "sheet", intro: "How the code is built, what could attack it, and what each service may and may not do.", items: [
    { label: "Modules", href: "/modules", note: "What each module is and is not" },
    { label: "Engineering notes", href: "/engineering", note: "What was learned building each area" },
    { label: "Threat model", href: "/threat-model", note: "Who could attack, along which path" },
    { label: "Capability boundaries", href: "/boundaries", note: "What each service may and may not do" },
  ] },
  { label: "Record", print: "ledger", intro: "Every decision and every publication, read from the repository.", items: [
    { label: "Decisions", href: "/decisions", note: "Every decision, its status and when to review it" },
    { label: "Changelog", href: "/changelog", note: "Every publication and what changed" },
  ] },
  { label: "Bill of materials", print: "crate", intro: "What ObliviOS is built from, and how to rebuild the list and check it.", items: [
    { label: "Components", href: "/components", note: "Libraries, projects and tools, with licences" },
    { label: "Advisories", href: "/advisories", note: "What OSV lists, and the assessment of each" },
    { label: "Files and patches", href: "/patches", note: "The files, and what the patches change" },
    { label: "Data", href: "/data", note: "The data files and their public sources" },
    { label: "Verify", href: "/verify", note: "Rebuild the SBOM and compare it byte for byte" },
  ] },
  { label: "Search", href: "/search", print: "desk" },
];
// the footer keeps one short list
export const footPages = [
  { label: "Guide", href: "/guide" },
  { label: "Modules", href: "/modules" },
  { label: "Engineering", href: "/engineering" },
  { label: "Threat model", href: "/threat-model" },
  { label: "Decisions", href: "/decisions" },
  { label: "Changelog", href: "/changelog" },
  { label: "Components", href: "/components" },
  { label: "Search", href: "/search" },
];
// every page the menu names, for the label of a page (the footer's names come first, so /guide is "Guide")
export const pages = [...footPages, ...nav.flatMap((n) => n.items ?? [n])];
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
  "Documents: CC-BY-4.0. Code and scripts: Apache-2.0. The name ObliviOS and its logo are not licensed. This site is static: no cookies, no requests to other sites. It runs one script of its own, for search. Page views are counted without cookies.";

export const tag = "Developer portal";

// decisions per page of the decision list (the list is paged in the build, so it needs no script)
export const PAGE_SIZE = 20;
