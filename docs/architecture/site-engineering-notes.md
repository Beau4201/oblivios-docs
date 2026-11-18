# Public site engineering notes

What was learned while designing the pages of `oblivios.org`: how to show a page to the owner, how the prints are drawn, and what broke. The design record is ADR-251; the sources are in `../design/oblivios-org-2026-11-17/`.

## Showing a page to the owner

- The in-app browser pane opens a `file://` page as a static snapshot (2026-11-17): scripts do not run and neither a relative image nor a `file://` image loads. The owner saw a broken logo and no hero picture on such a page, and no header link, which were reported as "no image" and "no header". Embed assets as `data:` URIs (the generator does) and serve the output over HTTP for anything with a script.
- Serving: `python3 -m http.server 8123 --bind 127.0.0.1 -d <out>` in the background, then open it with `preview_start` and its `url` argument. A first `navigate` to the `127.0.0.1` address was denied; `preview_start` with the same `url` opened it, and `navigate` worked afterwards in that tab. Kill the server at the end of the session (the process list shows `python3 -m http.server 8123`).
- The editor tool opens every written HTML file in the pane as a `file://` tab ("is now visible in the Browser pane"). The tabs pile up and show the broken snapshot. Tell the owner which tab is the served one.
- The pane width was 798 px in the first reports and 1630 px later. A first build with a fixed width of 1440 px put the hero picture at x = 755 in the 798 px pane, so the owner saw text only. Build fluid from the start and read it at 390, 798, 1440 and 1920 px.
- Headless Chromium renders any width: `chromium --headless --no-sandbox --disable-gpu --hide-scrollbars --window-size=W,H --screenshot=OUT URL`. Append `?norv` to the URL to hide the review layer. The screenshot has the window height, so choose H above the page height and crop.
- Overflow check run in the page, per width: `document.documentElement.scrollWidth` against `innerWidth`, and the elements whose `getBoundingClientRect().right` exceeds `innerWidth` (ignore the hidden defs `svg`, the review layer and `pre` blocks, which scroll by design). All pages showed zero on 2026-11-17 at 798 px and at 1630 px for Status, Security and FAQ.
- Link check over the generated files: every `href` that is not external must name a generated page, and a `#fragment` must be an `id` on that page. 182 links, none broken, 2026-11-17.

## Click-to-flag review

`review.js` is the review layer. A pill switches it on; a click flags the element under the pointer (red outline, a number, a note field) and a second click removes the flag; links are intercepted while it is on. Flags are saved per page in `localStorage` under `rv:<path>` and are read back with `window.__allFlags()` through the browser tool's JavaScript on the served tab. The owner flagged 7, 7, 1, 9 and 1 elements in five rounds and wrote a reason on most. Read the flags first, then clear them (`localStorage.removeItem` per `rv:` key) so that old badges do not sit on the rebuilt page. A reason that says only that something is not good is answered by asking which part; the flag itself names the element.

## Prints (SVG)

- One filter (`feTurbulence` plus `feDisplacementMap` for a warped edge, a second turbulence thresholded by `feColorMatrix` and `feComposite` for the speckle holes) and one gradient per canvas give every print the look of the logo: grey at the edges, brick red in the centre. A misprint shadow is the same print in brick red, offset by 6 and 5 units, blended with `multiply`. The turbulence frequencies are in user units, so a print drawn on a larger canvas has finer grain.
- Prints are defined once in a hidden `svg` and placed with `<use>`. A cloned element takes its inheritable properties from the `use` element, and a CSS selector that depends on an ancestor of the `use` (`.alt .pp`) does not match the clone. The hole colour of the details is therefore `var(--hole)`, set on the band; custom properties do inherit into the clone.
- A group whose bounding box has no height (a lone horizontal dotted line) is not drawn when an object-bounding-box filter is applied to it. Put such a line in a group with the other shapes of the print, or draw it in CSS.
- Gradients use `userSpaceOnUse`: 0 to 200 for a single plate and 0 to 1000 for the chain, whose five prints are cut out of one canvas with a `viewBox` of `x 40 200 200`.
- A speckle threshold that is too low gives a stippled look; the logo has crisp edges with few holes. The values in the filter (`22 0 0 0 -6.1`) are the second try.

## Layout

- `.prose p` outranks a plain class on a paragraph; a styled paragraph inside prose needs `.prose p.<class>`.
- `details::details-content` with `interpolate-size: allow-keywords` animates the FAQ in Chromium; other engines open the answer at once, which is the fallback.
- A bar of accepted against proposed decisions is a `div` with two widths and a text equivalent in an `aria-label`.

## The Astro build of `oblivios.org` (2026-11-17)

Layout and commands are in `site/README.md`. What was learned and measured on the first day:

- Under `Content-Security-Policy: default-src 'self'` an inline `<style>`, a `style` attribute and a `data:` URI are blocked, and the mockups used all three. The build therefore sets `build.inlineStylesheets: "never"` and `vite.build.assetsInlineLimit: 0`, draws SVG widths as attributes (`stroke-width="15"`, a bar is an `svg` of `rect` elements), keeps the grain, the stamp mask and the logo mask as files in `site/shared/public/`, and `scripts/check-build.mjs` fails on any of them in the output.
- `scripts/serve.mjs` serves `dist/` with the headers and `cleanUrls` of `vercel.json`; `--axe` serves axe-core at `/__axe.js`; `--review` leaves the policy off because the review layer injects a stylesheet and uses local storage. `build:review` (`REVIEW=1`) is the only build that contains it; the check fails when `review.js` or storage access is in a production output. The server must start in `site/org` (it reads `dist` and `vercel.json` from the working directory); `npm --prefix <site> run serve -w org -- --port N` does that. axe-core sits in `site/node_modules` (hoisted), not in `site/org/node_modules`.
- A tool call that adds a `<style>` to a page served with the policy is silently refused: switch a rule off through the CSSOM instead, `document.styleSheets[0].insertRule("body::before{display:none!important}", 0)`.
- axe reports every text node as `incomplete` for contrast while the grain (`body::before`, a pseudo-element over the page) is on: `Element's background color could not be determined due to a pseudo element`. With the grain off through the CSSOM, 418 text nodes per scheme were measured on nine pages at 1440 px: the lowest ratio is 5.22 in the light scheme (`code` in a callout on the paper) and 5.94 in the dark scheme. The grain (multiply at opacity 0.5 in light, screen at 0.16 in dark) lowers the real ratio by a few percent and was not measured. The only nodes left `incomplete` are the links of the closed menu (`details`), not read open.
- axe findings and their fixes: `heading-order` on Verify (the five chain prints are `h3` under the page `h1`: a visually hidden `h2`, class `vh`); `scrollable-region-focusable` on every `pre` at 390 px (`tabindex="0"`); contrast of the home stamp, 2.22 in the light scheme and 1.84 in the dark, because axe takes the logo plate, which is a mask, as its background (the stamp has a paper background now). Re-run after the fixes: no violation in either scheme at 390 and 798 px on six pages and at 1440 px in the dark scheme; light at 1440 px was run before the fixes and showed only `heading-order`. 1920 px, layout shift (`layout-shift` entries), the open menu at 390 px and the nine pages by eye at 390, 798 and 1920 px were not read.
- Network, home page, one load at 1440 px in the tool's browser: the site's own origin only, no cookie, empty local and session storage; one more request came from a Chrome extension of that browser (`chrome-extension://…/page-script.js`), which shows as origin `null`. The capture of W-4 and V-3 needs a clean profile.
- Weight of the build (`check-build.mjs`): nine pages, 32 files, 194 internal links, no dead link and no missing fragment; css 18.2 KB, three woff2 files 116.2 KB (Roboto Flex 34 KB, Noto Serif 37 KB, Noto Serif italic 48 KB), the largest page 22.1 KB, the largest first load 218 KB (page plus the assets it names, not the files that css names). The budget is in `site/org/budget.json`.
- Astro 5.18.2 builds and passes on Node 20.19.2 with npm 9.2.0 although `npm install` warns `EBADENGINE`: Astro wants npm 9.6.5 or later, and `unifont` (Astro's fonts feature, unused) pulls `undici` 8, which wants Node 22.19. Astro 6 and 7 need Node 22.12 and 22.23 (read with `npm view`). A route folder named `.well-known` under `src/pages` is built as a route. A bare package path in css (`url("@fontsource-variable/…/files/….woff2")`) is resolved by Vite and hashed into `_astro/`.
- Playwright through the tool: one call of 72 page loads with 36 axe runs did not return. Runs of nine pages for one scheme and one width finish. After that interruption `page.screenshot` timed out at every call, also with a 60 s limit; headless Chromium from the shell worked: `chromium --headless --no-sandbox --disable-gpu --hide-scrollbars --window-size=1440,2900 --screenshot=OUT URL`, and `--force-dark-mode` gives `prefers-color-scheme: dark` there while `--blink-settings=preferredColorScheme=1` stays light. Listeners of an interrupted run stay attached to the tool's page and fill the console log with their own errors: call `page.removeAllListeners()` first.

## The npm packages in the SBOM (2026-11-18)

The SBOM build (`tools/sbom/build-sbom.py`, gate W-7) lists every registry package of `site/package-lock.json` as a component with its licence, its SHA-512 integrity and the OSV advisories, and writes `site/NOTICE` from the same list (`--site-notice`). `tools/sbom/fetch-npm-evidence.py` reads the registry and OSV; the answers are in `sbom/evidence/npm.json` and `sbom/evidence/osv-npm.json`.

- 380 registry packages were read; every integrity of the registry equals the one of the lockfile. The two workspaces of `site/` are not registry packages.
- `zod-to-ts` 1.2.0 states no licence in the registry. The installed package ships a `LICENSE` file with the MIT text and `Copyright (c) 2021 Sachin Raja` (SHA-256 `901eb546213d344758178277346c83df776b3566895c507a82ee36447c6662ba`, read on 2026-11-18); the SBOM takes MIT from it (`npm_licences` in `tools/sbom/inputs.json`).
- Fourteen packages are outside the allowed licence terms: ten `@img/sharp-libvips-*` (LGPL-3.0-or-later) and four `@img/sharp-*` platform packages (Apache-2.0 with LGPL-3.0-or-later, one also MIT). They are the native image libraries of `sharp`; the lockfile marks them optional, `astro.config.mjs` sets `passthroughImageService()` so the site optimises no image, and the output holds none of them. The build prints each as a note and does not fail on it.
- OSV listed 19 advisories on 2026-11-18 for six locked versions (20 entries in the SBOM, because one advisory names two `picomatch` versions, 2.3.2 and 4.0.7): Astro 5.18.2 (13), `sharp` 0.34.5 (3), `esbuild` 0.27.7 (1) and `zod` 3.25.76 (1). The 13 of Astro are fixed only in Astro 6 and 7, which need Node 22 (ADR-253). The next section assesses each of them; the SBOM still shows each as `in_triage`, with the assessment as its detail, as it does for the Rust advisories.

## Assessment of the OSV advisories of the npm packages (2026-11-18)

Each of the 19 advisories of the section above was read against what `site/` uses. The evidence is a search of every `.astro`, `.mjs`, `.js` and `.css` file of `site/` and the file `astro.config.mjs`: no `define:vars`, no `transition:` directive and no `ClientRouter`, no `client:` directive, no spread `{...}`, no named slot (three default `<slot />`), no dynamic tag name, no `astro:assets`, no `Astro.request`, no content collection or MDX; `@astrojs/node`, `@astrojs/mdx` and `@astrojs/react` are not in the lockfile; `set:html` appears twice, on strings written in the repository (`faq.astro`, `areas.mjs`). The output is static, has no adapter and no `base`, and Vercel serves the files. Everything the build reads is a file of the repository or of the snapshot. This is a reading of the use of each feature, not an audit of the Astro code.

| Advisory | Package | Why it does not apply |
| --- | --- | --- |
| GHSA-26w7-cxv4-gfx2 | astro | AVIF image optimisation: `passthroughImageService()` is set, there is no `astro:assets`, and `sharp` is never loaded. |
| GHSA-2pvr-wf23-7pc7 | astro | The prerendered error page of a running server: the output is static and has no adapter. |
| GHSA-376h-93r7-7g6f | astro | Stripping the configured `base` in a running server: no `base` is set and no server runs. |
| GHSA-4g3v-8h47-v7g6 | astro | View Transitions: no `ClientRouter` and no `transition:` directive. |
| GHSA-7pw4-f3q4-r2p2 | astro | `transition:*` on hydrated islands: no `client:` directive and no UI framework. |
| GHSA-8hv8-536x-4wqp | astro | A named slot: only default slots are used. |
| GHSA-98hj-9722-w3j8 | astro | JSX and MDX rendering: neither integration is installed. |
| GHSA-f48w-9m4c-m7f5 | astro | Spread attribute names: no spread props. |
| GHSA-jrpj-wcv7-9fh9 | astro | Spread attribute names: no spread props. |
| GHSA-j687-52p2-xcff | astro | `define:vars`: not used. |
| GHSA-mh32-jxcr-mh9f | astro | Dynamic tag names: none. |
| GHSA-r3h5-4585-7x3w | astro | The image endpoint of `@astrojs/node`: the adapter is not installed. |
| GHSA-xr5h-phrj-8vxv | astro | Server islands: the output is static and has none. |
| GHSA-g7r4-m6w7-qqqr | esbuild | The development server on Windows: no development server runs (`astro build` and `serve.mjs`) and the workstation runs Linux. |
| GHSA-fc5q-39xc-vjpf | picomatch 2.3.2 and 4.0.7 | A slow match of crafted extglob patterns: the patterns come from the configuration of the tools and never from input; no fixed version is listed; the worst case is a slow build. |
| GHSA-f88m-g3jw-g9cj | sharp | libvips: `sharp` is an optional dependency that the build never loads, and the site processes no image. |
| GHSA-rgj7-g3m4-5g8c | sharp | libheif: the same. |
| GHSA-wq5f-xc86-pv6w | sharp | librsvg: the same. |
| GHSA-mrhx-c7xc-m3w5 | zod | Memory use when validating oversized collections: `zod` validates the configuration of Astro and the files of the site, and receives no external input. |

The assessment is reopened by any use of a listed feature, by an adapter, a `base` or an image service, by an upgrade of Astro, or by a new advisory.

## Geometry, layout shift and requests of the nine pages (2026-11-18)

Measured on the served build (`site/org/scripts/serve.mjs`, built with `SBOM_DIR` set because this repository has no `sbom/`) in the browser pane of the Claude desktop app. Each of the nine pages (the eight and the 404 page) was loaded in a same-origin `iframe` of 390, 798 and 1920 px, 27 loads, and measured after load:

- `scrollWidth` equals the inner width and no element lies past the right edge (`pre` blocks scroll by design): no overflow in any of the 27.
- Layout shift is 0.0000 within 700 ms of load in all 27.
- No link, button or `summary` outside running text is smaller than 24 px in either direction.
- The resource entries of the page name only the site's own origin; the page has no cookie and empty local and session storage.
- The open menu at 390 px (dark scheme) lists five links and stays inside the viewport (a screenshot, read by eye).

An `iframe` proves layout, not looks: the nine pages were not read by eye at the three widths, the light scheme was not read again, and the browser pane is not a clean profile, so the capture of W-4 and V-3 is still open. The Playwright tool did not return a call of 27 loads with a `page.on("request")` listener and was stopped at the owner's word; the pane's JavaScript tool did the same work.

## Counts on the pages

Decision statuses are classified by the first word of the status cell: `Accepted…`, `Proposed…`, anything else. On 2026-11-17 the published log had 249 rows (163 accepted, 60 proposed, 26 other) and this repository 250. The grouping of decisions per part of the system is a list in `gen.py`; a decision that belongs to two parts (ADR-186 to ADR-188) is counted in both.
