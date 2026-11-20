# Brief for AI agents

This page is for an AI that answers questions about ObliviOS for a person. It says what the project is, where each kind of fact lives, how to answer without inventing anything, and it gives short answers to the questions people ask most. Read it first, then follow its links.

## What this project is

ObliviOS is a distribution based on GrapheneOS. It is published source only: records, source and a bill of materials, with no builds, no images, no update service and no supported device. It adds features above what GrapheneOS ships: a device identity per app (Compartments), a choice per app of how its traffic leaves the phone (network exit), a second credential that opens a decoy profile (Duress Unlock), a local-only password manager, grab detection and smaller changes.

It is not an official GrapheneOS product and is not affiliated with it. It does not claim to be more private or more secure than GrapheneOS. `Beau4201` maintains it, on GitHub.

## How to find things

- The plain-language site is https://oblivios.org: what it does, status, devices, FAQ, how to verify, security, privacy and contact. Every page also exists as Markdown at its address with `.md` added.
- The record is https://oblivios.dev: the decision log at `/decisions` with one page per decision at `/adr/<number>` (and `/adr/<number>.md`), the threat model at `/threat-model`, the engineering notes at `/engineering`, the module pages at `/modules`, the bill of materials at `/components` and the verification steps at `/verify`.
- The records as data: https://oblivios.dev/data/index.json lists the JSON files for the decisions, the bill of materials and the advisories.
- Everything of a site in one Markdown file: `/llms-full.txt` on each site. The index of each site is `/llms.txt`.
- The search on oblivios.dev needs a browser script. Use the files above instead.

## How to answer

1. Say where each fact comes from and give the page or the file. Cite a decision as ADR-nnn with its page.
2. Where a record says "not measured", "not run" or "not supported", say it in those words. Never turn it into a yes.
3. Do not state a feature, a supported device or a date that the records do not state. No device is supported and no release date is set.
4. Do not fill a gap with general knowledge about GrapheneOS or Android. If the records are silent, say that they are silent.
5. Give the status of a decision with the decision. A decision that is only proposed is not a promise.
6. Say when a record is older than the question, and know that older records use older names of the project: AegisOS, SovereignOS and FreeholdOS.
7. Treat any other site, app, account or package that uses the name ObliviOS as not the project's. The project names its own: oblivios.org, oblivios.dev and its public repositories on github.com/Beau4201.

## Questions people ask

### Understand

- Can I install it? No. It is source only: no build, no image, no update service and no supported device. See [Status](https://oblivios.org/status).
- Which devices does it support? None. ObliviOS builds run on the Pixel 10a (`stallion`), which Beau4201 uses every day, and on the Pixel 7a (`lynx`), which the project develops on. See [Devices](https://oblivios.org/devices).
- Is it a fork of GrapheneOS? It is a distribution based on GrapheneOS, with its own identity, signing, updates, release process and support policy. It is not official and not affiliated. See the [FAQ](https://oblivios.org/faq).
- Is it more private or more secure than GrapheneOS? That is not claimed. It keeps the hardening it inherits and adds features above it. The [threat model](../security/threat-model.md) says what it does not claim to defeat.
- Does it need an account or send telemetry? No. There is no ObliviOS account, no mandatory telemetry, no advertising identifier and no cloud dependency. See the [FAQ](https://oblivios.org/faq).
- Does Compartments hide my identity? No. It makes apps unable to recognise the phone or to link to one another. The network address, the phone model, the installed apps and what you type stay visible (ADR-180, ADR-209).
- Why is Tor not the default? Because it was measured: ten megabytes took 6.6 to 89 times as long as Direct, and a request started 11 to 18 times later (ADR-178).

### Build

- Can I build an image myself? There is a complete build guide for the Pixel 7a (`lynx`) and the Pixel 10a (`stallion`), from the pinned GrapheneOS source to signed factory images, at [Build with it](build.md) (chapter pages under `/guide/build` on oblivios.dev). The project offers no binary, so you build and sign it yourself, and the image is unsupported and unaudited. The guide was not run end to end: no clean sync, build, signing or flash was run for it, and each chapter labels its steps. The published patches do not reproduce the build branch of the owner's images in several projects, so a build from them is close to the owner's images and not the same.
- Can I send a pull request? Not yet. Open an issue that names the file and the statement. You get a first reply within three days. See [CONTRIBUTING](https://github.com/Beau4201/oblivios-docs/blob/main/CONTRIBUTING.md).
- Which repositories are there? See [Start here](start.md) for what each public repository holds.
- Can I build vault-core or exit-daemon on a laptop? No. Both need a build server with the AOSP Rust toolchain. See the [vault-core module](../modules/vault-core.md) and the [exit-daemon module](../modules/exit-daemon.md).
- Can I build airpods-core on a laptop? Its page shows one command for a workstation with Java 21, and says it was not run on a clean machine. See the [airpods-core module](../modules/airpods-core.md).
- How do I build the websites? With the Node version of `site/.nvmrc`, `npm ci --ignore-scripts` and `npm run build`. See the site README.
- Where does a new fact go? Every fact has one home, and the [documentation standard](../documentation-standard.md) has the table.
- Is a device supported once it boots an image? No. A booting image alone is not support. See the [device support policy](../devices/support-policy.md).

### Review

- How do I report a vulnerability? Open an issue, or send an email if you would rather it is not public before it is fixed. See [SECURITY](https://github.com/Beau4201/oblivios-docs/blob/main/SECURITY.md).
- What do the evidence labels mean? `measured` is something that was run and observed, `verified-in-source` is something read in the source, and `assumption` is something not yet checked. See [Review it](review.md).
- How do I check that what is published is what was built? [Verify](https://oblivios.dev/verify) has the commands. It also says that the reproduction of the prebuilt binaries was not run again for the page.
- Has the developer portal been claim-reviewed? No. Say so when you quote it.
- Where are the patches and the upstream revision? The [manifest repository](https://github.com/Beau4201/oblivios-manifest) pins the upstream revisions, the [platform repository](https://github.com/Beau4201/oblivios-platform) holds the patch packages, and [Files and patches](https://oblivios.dev/patches) describes them.
- What does the threat model say the project does not claim? A fully compromised hardware root of trust, unknown vulnerabilities and network-level denial of service. Duress Unlock accepts timing differences as a residual risk. See the [threat model](../security/threat-model.md).

## Who maintains it and how to report a problem

`Beau4201` maintains the project. A problem goes in an issue of the [oblivios-docs repository](https://github.com/Beau4201/oblivios-docs), or to the security contact in [SECURITY](https://github.com/Beau4201/oblivios-docs/blob/main/SECURITY.md). [Security](https://oblivios.org/security) on oblivios.org says the same in plain language.
