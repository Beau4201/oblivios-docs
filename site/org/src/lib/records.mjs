// Facts the pages read at build time: the decision log, the security policy and the SBOM files. Nothing here is typed
// into a page. The repository root is two levels above the application (site/org), in oblivios-foundation and in
// the oblivios-docs snapshot alike; the SBOM sits in sbom/ of the snapshot, or in SBOM_DIR when the build runs in the
// private repository, which has no sbom/.
import fs from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(process.cwd(), "../..");

function find(candidates, what) {
  for (const c of candidates) {
    const p = path.join(ROOT, c);
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`${what} not found in ${candidates.map((c) => path.join(ROOT, c)).join(" or ")}`);
}
const read = (p) => fs.readFileSync(p, "utf8");

// ---- the decision log: status per decision, classified by the first word of the status cell
const rows = new Map();
const logText = read(find(["docs/governance/decision-log.md"], "the decision log"));
for (const line of logText.split("\n")) {
  const m = line.match(/^\| ADR-(\d+) \| (\d{4}-\d\d-\d\d) \| /);
  if (!m) continue;
  const cells = line.trim().replace(/^\|+|\|+$/g, "").split(" | ").map((c) => c.trim());
  if (cells.length >= 4) rows.set(Number(m[1]), { date: m[2], status: cells[3].replace(/^[*_ ]+/, "").toLowerCase() });
}
if (rows.size < 200) throw new Error(`the decision log gave ${rows.size} decisions; the table format changed`);

export function kind(n) {
  const s = rows.get(n)?.status ?? "";
  return s.startsWith("accepted") ? "accepted" : s.startsWith("proposed") ? "proposed" : "other";
}
export function counts(ids) {
  const ids2 = ids.filter((i) => rows.has(i));
  const acc = ids2.filter((i) => kind(i) === "accepted").length;
  const prop = ids2.filter((i) => kind(i) === "proposed").length;
  return { acc, prop, oth: ids2.length - acc - prop, n: ids2.length };
}
const all = [...rows.keys()];
export const decisions = {
  total: rows.size,
  accepted: all.filter((i) => kind(i) === "accepted").length,
  proposed: all.filter((i) => kind(i) === "proposed").length,
  get other() {
    return this.total - this.accepted - this.proposed;
  },
  // the size of the file in KB, to the nearest ten (the Verify page says the log is too big to open whole)
  sizeKB: Math.round(Buffer.byteLength(logText) / 1024 / 10) * 10,
  // the newest entry of the log: the date the counts are as of
  latest: [...rows.values()].map((r) => r.date).sort().at(-1),
};

// ---- the security contact: SECURITY.md at the root of the snapshot, tools/docs/SECURITY.md in the private repository
const secPath = find(["SECURITY.md", "tools/docs/SECURITY.md"], "SECURITY.md");
const sec = read(secPath);
const need = (re, what) => {
  const m = sec.match(re);
  if (!m) throw new Error(`SECURITY.md no longer states ${what}`);
  return m[1];
};
const [fp1, fp2] = need(/Fingerprint: `([^`]+)`/, "the fingerprint").trim().split(/\s{2,}/);
export const security = {
  email: need(/email to\s+`([^`]+)`/, "the contact address"),
  validUntil: need(/valid until (\d{4}-\d\d-\d\d)/, "the key validity"),
  fingerprint: [fp1, fp2],
  keyFile: find(["security-contact.asc", "tools/docs/security-contact.asc"], "security-contact.asc"),
};

// ---- the SBOM: counts and commit ids come from its files (W-7), never from the pages
const sbomDir = process.env.SBOM_DIR ? path.resolve(process.env.SBOM_DIR) : path.join(ROOT, "sbom");
for (const f of ["oblivios.cdx.json", "files.sha256"]) {
  if (!fs.existsSync(path.join(sbomDir, f))) throw new Error(`the SBOM file ${f} is not in ${sbomDir} (set SBOM_DIR)`);
}
const cdx = JSON.parse(read(path.join(sbomDir, "oblivios.cdx.json")));
const commit = (name) => {
  const c = cdx.components.find((x) => x["bom-ref"] === `repo:${name}`);
  if (!c || !/^[0-9a-f]{40}$/.test(c.version)) throw new Error(`the SBOM names no commit for oblivios-${name}`);
  return c.version.slice(0, 12);
};
const baseline = cdx.metadata.properties.find((p) => p.name === "oblivios:baseline-tag")?.value;
if (!baseline) throw new Error("the SBOM names no upstream baseline");
export const sbom = {
  components: cdx.components.length,
  files: read(path.join(sbomDir, "files.sha256")).split("\n").filter(Boolean).length,
  upstream: cdx.components.filter((c) => c["bom-ref"].startsWith("upstream:")).length,
  commits: { manifest: commit("manifest"), platform: commit("platform"), services: commit("services") },
  baseline,
};

export const fmt = (n) => n.toLocaleString("en-US");
export const longDate = (iso) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
