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

- `oblivios-manifest` `d511728991f0b0877a8a5e979405240a24b4fc12`
- `oblivios-platform` `27f358aa1b18943d46b0d82617e8f253e8532823`
- `oblivios-services` `c83b5c2c659dd4c5fc3f5414b5fc4d4782df317e`
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
validate against the official CycloneDX 1.6 and SPDX 2.3 JSON schemas. `--schemas DIR` holds `bom-1.6.schema.json`,
`spdx.schema.json` and `jsf-0.82.schema.json` from `schema/` of the tag `1.6` of `github.com/CycloneDX/specification`, and
`spdx-schema.json` from `schemas/` of the branch `support/2.3` of `github.com/spdx/spdx-spec`.
`tools/sbom/validate-schema.mjs` needs ajv 8 and ajv-formats for node, found in `NODEJS_LIB` (default `/usr/share/nodejs`);
the run of 2026-11-17 used ajv 8.17.1 and ajv-formats 3.0.1 from npm.

## What the SBOM does not claim

- Rust: `Cargo.lock` lists every package that any target, feature or dev/build configuration may resolve. The subset
  linked into a given binary has not been computed. Licence and checksum are those of the crates.io registry for each
  locked version; the crate sources were not read again.
- Upstream: only the projects that the patches modify are listed, with their licence evidence. The other projects of the
  manifest are in `manifest/upstream-*.xml`.
- The licence texts of the registry packages of both `Cargo.lock` files are in `THIRD-PARTY-LICENSES.txt` next to the two Rust
  prebuilts in `oblivios-platform`; whether that is enough notice for each licence is not a legal opinion. `ipmap.bin`, which the
  Data Map reads, is not in the repositories; its sources are listed as `in-published-tree: false`.
- The reproducibility of the prebuilt binaries is stated by their records. It was not re-run here.
- Vulnerabilities are those that OSV listed on the day named in `evidence/osv.json`; the assessments are in the records
  of the project where they exist.
- No legal opinion: the licence of a component is what its publisher states.
