// The bill of materials as the pages show it: read from sbom/oblivios.cdx.json and sbom/files.sha256 at build time. The
// SBOM sits in sbom/ of the snapshot, or in SBOM_DIR when the build runs in the private repository, which has no sbom/.
import fs from "node:fs";
import path from "node:path";
import { ROOT, read } from "./records.mjs";

const dir = process.env.SBOM_DIR ? path.resolve(process.env.SBOM_DIR) : path.join(ROOT, "sbom");
for (const f of ["oblivios.cdx.json", "files.sha256"]) {
  if (!fs.existsSync(path.join(dir, f))) throw new Error(`the SBOM file ${f} is not in ${dir} (set SBOM_DIR)`);
}
const cdx = JSON.parse(read(path.join(dir, "oblivios.cdx.json")));
const cs = cdx.components;
const props = (c) => Object.fromEntries((c.properties ?? []).map((p) => [p.name, p.value]));
const meta = Object.fromEntries(cdx.metadata.properties.map((p) => [p.name, p.value]));
const licOf = (c) => {
  const l = c.licenses?.[0];
  return l ? l.expression ?? l.license?.id ?? l.license?.name ?? null : null;
};
const ecoOf = (c) => {
  const t = (c.purl ?? "").split(":")[1]?.split("/")[0];
  return t === "cargo" ? "Rust" : t === "npm" ? "npm" : t === "maven" ? "Maven" : t === "github" ? "Repository" : "Other";
};

export const fmtSize = (b) => (Number(b) >= 1e6 ? `${(Number(b) / 1e6).toFixed(1)} MB` : `${(Number(b) / 1e3).toFixed(1)} KB`);

const fileLines = read(path.join(dir, "files.sha256")).split("\n").filter(Boolean);
export const files = fileLines.map((l) => {
  const [hash, ...rest] = l.split(/\s+/);
  return { hash, path: rest.join(" ").replace(/^\*/, "") };
});

const byRef = new Map(cs.map((c) => [c["bom-ref"], c]));
const kinds = { library: 0, file: 0, data: 0, application: 0 };
for (const c of cs) kinds[c.type] = (kinds[c.type] ?? 0) + 1;

// ---- advisories, grouped by the component they affect
const groups = new Map();
for (const v of cdx.vulnerabilities ?? []) for (const a of v.affects) groups.set(a.ref, [...(groups.get(a.ref) ?? []), v]);
export const advisories = [...groups.entries()]
  .map(([ref, vs]) => {
    const c = byRef.get(ref) ?? {};
    const record = vs[0].analysis?.detail?.match(/^Assessed in ([^:]+):/)?.[1] ?? "the records of the project";
    return {
      ref,
      name: c.name ?? ref,
      version: c.version ?? "",
      licence: licOf(c),
      eco: ecoOf(c),
      record,
      items: vs.map((v) => ({ id: v.id, description: v.description, detail: v.analysis?.detail ?? "", state: v.analysis?.state ?? "", url: v.source?.url ?? "" })),
    };
  })
  .sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
const advCount = new Map(advisories.map((g) => [g.ref, g.items.length]));

// ---- libraries (what the Components page lists) and the other kinds of component
export const libraries = cs
  .filter((c) => c.type === "library" && c.purl)
  .map((c) => ({ name: c.name, version: c.version ?? "", licence: licOf(c), eco: ecoOf(c), adv: advCount.get(c["bom-ref"]) ?? 0, ref: c["bom-ref"] }))
  .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.version.localeCompare(b.version));
export const modules = cs
  .filter((c) => c.type === "library" && !c.purl)
  .map((c) => ({ name: c.name, version: c.version ?? "", licence: licOf(c), filesModified: props(c)["oblivios:files-modified"], patches: props(c)["oblivios:patches"] }));
export const tools = cs.filter((c) => c.type === "application").map((c) => ({ name: c.name, version: c.version ?? "", description: c.description ?? "" }));

// ---- prebuilt binaries
export const prebuilt = cs
  .filter((c) => c.type === "file" && c.description?.startsWith("Prebuilt"))
  .map((c) => {
    const p = props(c);
    return {
      name: c.name,
      file: c.name.split("/").at(-1),
      sha256: c.hashes[0].content,
      size: p["oblivios:size"],
      source: c.description.match(/built from (services|platform|manifest) (\S+) at/)?.[2] ?? "",
      commit: p["oblivios:source-commit"],
      current: p["oblivios:source-tree-equals-head"] === "true",
      toolchain: p["oblivios:toolchain"],
      reproduced: p["oblivios:reproduced"],
    };
  });

// ---- what the patches change
export const upstream = modules
  .filter((m) => m.filesModified !== undefined && Number(m.filesModified) > 0)
  .map((m) => ({ name: m.name, files: Number(m.filesModified), licence: m.licence }))
  .sort((a, b) => b.files - a.files || a.name.localeCompare(b.name));
export const patchAreas = modules
  .filter((m) => m.patches !== undefined)
  .map((m) => ({ name: m.name.replace(/^oblivios-platform\//, ""), patches: Number(m.patches) }))
  .sort((a, b) => b.patches - a.patches || a.name.localeCompare(b.name));
export const patchFiles = cs.filter((c) => c.type === "file" && c.description?.startsWith("Patch")).map((c) => c.name);

// ---- data: what is in the repositories, and the public sources it was made from
const dataComps = cs.filter((c) => c.type === "data" && !c.name.startsWith("grapheneos-platform-manifest"));
export const dataShipped = dataComps
  .filter((c) => props(c)["oblivios:files"] !== undefined)
  .map((c) => ({ name: c.name, files: Number(props(c)["oblivios:files"]), licence: licOf(c), record: props(c)["oblivios:record"] ?? "" }))
  .sort((a, b) => a.name.localeCompare(b.name));
export const dataSources = dataComps
  .filter((c) => props(c)["oblivios:files"] === undefined)
  .map((c) => ({ name: c.name, licence: licOf(c), record: props(c)["oblivios:record"] ?? "", missing: (props(c)["oblivios:in-published-tree"] ?? "").startsWith("false") }))
  .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

// ---- counts
const licCount = new Map();
for (const c of cs) licCount.set(licOf(c) ?? "Not stated", (licCount.get(licOf(c) ?? "Not stated") ?? 0) + 1);
const ecoCount = new Map();
for (const l of libraries) ecoCount.set(l.eco, (ecoCount.get(l.eco) ?? 0) + 1);
const commit = (name) => {
  const c = byRef.get(`repo:${name}`);
  if (!c || !/^[0-9a-f]{40}$/.test(c.version)) return null;
  return c.version;
};

export const sbom = {
  total: cs.length,
  kinds,
  files: files.length,
  advisories: (cdx.vulnerabilities ?? []).length,
  stamp: cdx.metadata.timestamp.replace("T", " ").replace(/:\d\dZ$/, " UTC"),
  stage: meta["oblivios:stage"],
  baseline: meta["oblivios:baseline-tag"],
  coverage: JSON.parse(meta["oblivios:coverage"]),
  ecosystems: [...ecoCount.entries()].sort((a, b) => b[1] - a[1]),
  licences: [...licCount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  commits: { manifest: commit("manifest"), platform: commit("platform"), services: commit("services") },
  formats: ["oblivios.cdx.json", "oblivios.spdx.json", "files.sha256"],
};
if (!sbom.baseline) throw new Error("the SBOM names no upstream baseline");
