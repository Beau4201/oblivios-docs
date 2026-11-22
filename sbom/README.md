# SBOM of the source-only publication

The software bill of materials of the four published repositories (ADR-171, ADR-244): which files they hold, whose they
are, under which licence, which upstream projects the patches change, which prebuilt binaries are committed and from
what they were built, and which third-party packages and data the code and the data files rest on.

| File | What it is |
| --- | --- |
| `oblivios.cdx.json` | CycloneDX 1.6, the full description |
| `oblivios.spdx.json` | SPDX 2.3, the same components and relationships |
| `files.sha256` | every file of the four repositories with its SHA-256, in `sha256sum -c` format |
| `evidence/` | the registry and upstream answers the build read (crates.io, the npm registry, OSV, upstream licence files, Maven Central) |

## Described state

- `oblivios-manifest` `0b0517d4b1bb107046ce8cc716cdfe419d2d055e`
- `oblivios-platform` `4801a2332ac356e1e023b6072c18b89bed629a63`
- `oblivios-services` `db22a32dc30448229dfd3a02a3804eb0699b5f78`
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
- npm: `site/package-lock.json` lists every package that builds the website `oblivios.org`. Licence and integrity are those of
  the npm registry for each locked version; the package sources were not read again. The packages are build-time tools: the
  static output holds the two font families of the `@fontsource-variable` packages and no script of any package, which
  `site/org/scripts/check-build.mjs` checks; install scripts are off (`site/.npmrc`). `site/NOTICE` equals the npm components.
- Upstream: only the projects that the patches modify are listed, with their licence evidence. The other projects of the
  manifest are in `manifest/upstream-*.xml`.
- The licence texts of the registry packages of both `Cargo.lock` files are in `THIRD-PARTY-LICENSES.txt` next to the two Rust
  prebuilts in `oblivios-platform`; whether that is enough notice for each licence is not a legal opinion. `ipmap.bin`, which the
  Data Map reads, is not in the repositories; its sources are listed as `in-published-tree: false`.
- The reproducibility of the prebuilt binaries is stated by their records. It was not re-run here.
- Vulnerabilities are those that OSV listed on the day named in `evidence/osv.json`; the assessments are in the records
  of the project where they exist.
- No legal opinion: the licence of a component is what its publisher states.
