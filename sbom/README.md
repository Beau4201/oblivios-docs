# SBOM of the source-only publication

The software bill of materials of the four published repositories (ADR-171, ADR-244): which files they hold, whose they
are, under which licence, which upstream projects the patches change, which prebuilt binaries are committed and from
what they were built, and which third-party packages and data the code and the data files rest on.

| File | What it is |
| --- | --- |
| `oblivios.cdx.json` | CycloneDX 1.6, the full description |
| `oblivios.spdx.json` | SPDX 2.3, the same components and relationships |
| `files.sha256` | every file of the four repositories with its SHA-256, in `sha256sum -c` format |
| `evidence/` | the registry and upstream answers the build read (crates.io, OSV, upstream licence files, Maven Central) |

## Described state

- `oblivios-manifest` `3ac74933d8060232f8dfb1a986db0628ff37a2fb`
- `oblivios-platform` `21a1b43eebd48b498333db704725165d43fc1e5c`
- `oblivios-services` `55853b79da280e1e5a31e25d863f5d6a5496bdf2`
- `oblivios-docs` is a snapshot without history; its files are in `files.sha256` (this directory is left out).
- Upstream baseline: manifest `2026100600`.

## Verify

Clone the four repositories side by side (`oblivios-manifest`, `oblivios-platform`, `oblivios-services`, `oblivios-docs`)
at the commits above, then, in the directory that holds them:

```sh
sha256sum -c oblivios-docs/sbom/files.sha256
python3 oblivios-docs/tools/sbom/build-sbom.py --root . --docs oblivios-docs \
    --evidence oblivios-docs/sbom/evidence --check oblivios-docs/sbom
```

The first command compares every file with its recorded SHA-256. The second rebuilds both documents from the same commits
and the evidence files, compares them byte for byte, and fails on any fact that the files do not support. The documents
validate against the official CycloneDX 1.6 and SPDX 2.3 JSON schemas (`--schemas DIR` with the schema files and
`tools/sbom/validate-schema.mjs`, which needs ajv 8 for node).

## What the SBOM does not claim

- Rust: `Cargo.lock` lists every package that any target, feature or dev/build configuration may resolve. The subset
  linked into a given binary has not been computed. Licence and checksum are those of the crates.io registry for each
  locked version; the crate sources were not read again.
- Upstream: only the projects that the patches modify are listed, with their licence evidence. The other projects of the
  manifest are in `manifest/upstream-*.xml`.
- The aggregated licence texts of the Rust crates are not generated. `ipmap.bin`, which the Data Map reads, is not in the
  repositories; its sources are listed as `in-published-tree: false`.
- The reproducibility of the prebuilt binaries is stated by their records. It was not re-run here.
- Vulnerabilities are those that OSV listed on the day named in `evidence/osv.json`; the assessments are in the records
  of the project where they exist.
- No legal opinion: the licence of a component is what its publisher states.
