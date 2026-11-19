# site

The sites of ObliviOS. The application of `oblivios.org` is `org/`; the application of `oblivios.dev`, the developer portal, is `dev/`; `shared/` holds what both use: the tokens, the logo files, the twenty-one SVG prints of `oblivios.org` with their one filter, the layout components and the list of the nine parts. Decisions: ADR-251 (design), ADR-252 (start of the build), ADR-253 (answers and calls), ADR-268 (the portal). Lessons and measurements: [`docs/architecture/site-engineering-notes.md`](../docs/architecture/site-engineering-notes.md).

Authored in `oblivios-foundation`, published unchanged in `oblivios-docs` by `tools/docs/build-public-docs.py` once that script covers `site/`. The relative path from `site/` to `docs/` is the same in both repositories.

## Build

Node 20.19.2 (`.nvmrc`), packages from the committed `package-lock.json` with install scripts off (`.npmrc`):

```bash
npm ci --ignore-scripts
npm run build
```

`npm run build` runs `astro build` in `org/` and then `scripts/check-build.mjs`, which fails on an inline style, a script, a `data:` URI, a request to another origin, a dead link, a missing file of the basics list, a placeholder, or a budget of `org/budget.json` that is exceeded. Static output is `org/dist/`.

Facts the pages show are read at build time and never typed:

| Fact | Source |
| --- | --- |
| Status of each decision, per part and in total, the date of the pages | `docs/governance/decision-log.md` |
| Contact address, key validity, fingerprint, public key | `SECURITY.md` and `security-contact.asc` at the root of the snapshot, `tools/docs/` in the private repository |
| Number of components and hashed files, the three commits, the upstream baseline | `sbom/` at the root of the snapshot; `SBOM_DIR` names it where the repository has none |
| `Expires` of `security.txt` | `org/src/lib/securitytxt.mjs` (the build fails with fewer than 60 days left) |

The sources of each page are written to `org/.build/claims/` for the claim review and are not shown on any page.

## Serve and review

```bash
npm run serve -w org -- --port 8124        # the headers and cleanUrls of org/vercel.json
npm run build:review -w org                # adds the click-to-flag layer (review build only)
npm run serve -w org -- --port 8124 --review
```

`--axe` serves axe-core at `/__axe.js` for an accessibility run. The flags of the review layer are read with `window.__allFlags()` in the served page.

## The developer portal (`dev/`)

`oblivios.dev` is built the same way and from the same lockfile: the decision log with a page for every entry (`/adr/<n>`), the threat model in four parts and the capability boundaries, the engineering notes (a page each) and three quickstarts, a search over all of it, and the bill of materials as five pages under Components. Every fact is read at build time from `docs/governance/decision-log.md`, the published documents named in `dev/src/lib/documents.mjs`, `sbom/oblivios.cdx.json`, `sbom/files.sha256` and `SECURITY.md`; where the repository has no `sbom/` (the private repository), the build needs it:

```bash
SBOM_DIR=../oblivios-docs/sbom npm run build -w dev     # build, then dev/scripts/check-build.mjs
npm run serve -w dev -- --port 8125                    # the headers and cleanUrls of dev/vercel.json
```

The portal runs one script, `/browse.js` (source: `dev/src/scripts/browse.js`, served as written with the tokenizer joined to it), which does the search and the filters and fetches `/search-index.json`, written by the build. `dev/scripts/check-build.mjs` allows that script and, in a build made by Vercel, the tag of Vercel Web Analytics (ADR-272), and nothing else: no storage, no cookie, no other network call, no dynamic code. Decisions: ADR-268 to ADR-272. A document the reader (`documents.mjs`) does not understand fails the build with the line named; a section that no part of a long document lists is missing from the site without a message, so the lists of `documents.mjs` are read again when a heading of the threat model changes.

## Privacy rules

These are the rules of `org/`; the portal keeps them except for its one script and a form that may submit to its own address (ADR-268), and it counts page views in the same way (ADR-272). No request to another origin, no cookie, no local storage, self-hosted fonts, and the headers of `org/vercel.json`. The output holds no script, except that a build made by Vercel (`VERCEL=1`) adds the one script of Vercel Web Analytics from the site's own address (decision 261); `check-build.mjs` then requires exactly that tag on every page and nothing else. The production output holds no review layer.
