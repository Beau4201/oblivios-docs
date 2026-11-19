// Facts the pages read at build time: the decision log and the security policy. Nothing here is typed into a page.
// The repository root is two levels above the application (site/dev), in oblivios-foundation and in the oblivios-docs
// snapshot alike, so a push of the snapshot is all it takes to change the portal (spec 5.3).
import fs from "node:fs";
import path from "node:path";
import { parts } from "@oblivios/site-shared/lib/parts.mjs";
import { firstSentence, plain } from "./md.mjs";

export const ROOT = path.resolve(process.cwd(), "../..");

export function find(candidates, what) {
  for (const c of candidates) {
    const p = path.join(ROOT, c);
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`${what} not found in ${candidates.map((c) => path.join(ROOT, c)).join(" or ")}`);
}
export const read = (p) => fs.readFileSync(p, "utf8");

// ---- the decision log. One entry is one line of a table of seven columns: ID, Date, Decision, Status, Rationale,
// Consequences, Review trigger. Eight entries of the log have another number of columns (a cell holds a ` | `, or a
// column is missing). They are shown as written: the first cell after the status is the rationale and the rest follow
// under a plain label, and the page says so.
const LOG = "docs/governance/decision-log.md";
export const logPath = find([LOG], "the decision log");
const logText = read(logPath);

const partsOf = new Map();
for (const part of parts) for (const n of part.adrs) partsOf.set(n, [...(partsOf.get(n) ?? []), part.title]);

function statusOf(cell) {
  const text = cell.replace(/^[*_ ]+/, "").trim();
  const word = (text.match(/^[A-Za-z]+/) ?? [""])[0].toLowerCase();
  const kind = word === "accepted" ? "ok" : word === "proposed" ? "pr" : word === "superseded" ? "old" : "ot";
  const label = word ? word[0].toUpperCase() + word.slice(1) : "Other";
  return { kind, label, text: cell.replace(/\*\*/g, "").trim() };
}

const entries = [];
for (const line of logText.split("\n")) {
  const m = line.match(/^\| ADR-(\d+) \| (\d{4}-\d\d-\d\d) \| /);
  if (!m) continue;
  const cells = line.trim().replace(/^\|+|\|+$/g, "").split(" | ").map((c) => c.trim());
  if (cells.length < 5) throw new Error(`ADR-${m[1]} has ${cells.length} cells; the table format changed`);
  const n = Number(m[1]);
  const regular = cells.length === 7;
  const rest = cells.slice(4);
  const sections = regular
    ? [
        { key: "why", label: "Why and evidence", text: rest[0] },
        { key: "consequences", label: "Consequences", text: rest[1] },
        { key: "review", label: "Review when", text: rest[2] },
      ]
    : rest.map((text, i) => ({ key: i === rest.length - 1 && rest.length > 1 ? "review" : i === 0 ? "why" : "more", label: i === 0 ? "Why and evidence" : i === rest.length - 1 ? "Last cell" : "Further text", text }));
  const body = cells.slice(2).join(" ");
  entries.push({
    n,
    id: `ADR-${m[1]}`,
    date: m[2],
    decision: cells[2],
    title: firstSentence(plain(cells[2])),
    status: statusOf(cells[3]),
    sections,
    columns: cells.length,
    regular,
    review: sections.at(-1).text,
    parts: partsOf.get(n) ?? [],
    ev: ["measured", "verified-in-source", "assumption"].filter((t) => new RegExp(`\\[${t}`).test(rest.join(" "))),
    refs: [...new Set([...body.matchAll(/\bADR-(\d{1,3})\b/g)].map((x) => Number(x[1])).filter((x) => x !== n))].sort((a, b) => a - b),
    by: [],
  });
}
if (entries.length < 200) throw new Error(`the decision log gave ${entries.length} decisions; the table format changed`);
const byNumber = new Map(entries.map((e) => [e.n, e]));
for (const e of entries) {
  e.refs = e.refs.filter((x) => byNumber.has(x));
  for (const x of e.refs) byNumber.get(x).by.push(e.n);
}
for (const e of entries) e.by.sort((a, b) => a - b);

export const decisions = entries.sort((a, b) => b.n - a.n); // newest first
export const decision = (n) => byNumber.get(n);
export const hasAdr = (n) => byNumber.has(n);
export const decisionStats = {
  total: entries.length,
  accepted: entries.filter((e) => e.status.kind === "ok").length,
  proposed: entries.filter((e) => e.status.kind === "pr").length,
  latest: entries.map((e) => e.date).sort().at(-1),
};

// ---- the security contact: SECURITY.md at the root of the snapshot, tools/docs/SECURITY.md in the private repository
const secPath = find(["SECURITY.md", "tools/docs/SECURITY.md"], "SECURITY.md");
const sec = read(secPath);
const email = sec.match(/email to\s+`([^`]+)`/)?.[1];
if (!email) throw new Error("SECURITY.md no longer states the contact address");
export const security = {
  email,
  keyFile: find(["security-contact.asc", "tools/docs/security-contact.asc"], "security-contact.asc"),
};

export const fmt = (n) => n.toLocaleString("en-US");
export const longDate = (iso) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
