# site

The sites of ObliviOS. The application of `oblivios.org` is `org/`; `shared/` holds what `oblivios.dev` will reuse: the tokens, the logo files, the nineteen SVG prints with their one filter, and the layout components. Decisions: ADR-251 (design), ADR-252 (start of the build), ADR-253 (answers and calls). Lessons and measurements: [`docs/architecture/site-engineering-notes.md`](../docs/architecture/site-engineering-notes.md).

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

## Privacy rules

No request to another origin, no cookie, no local storage, no script in the output, self-hosted fonts, and the headers of `org/vercel.json`. The production output holds no review layer.
