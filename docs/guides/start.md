# Start here

This guide is for you if you have just found ObliviOS and want to understand what it is, what it is not and where to look next, without reading the decision log first. After it you can say in two sentences what the project is, name its parts and find the page that answers your next question.

**How long this takes.** About 10 minutes to read all of it. The first two chapters take 3 minutes and hold the two facts that matter most: you cannot install ObliviOS from the project, and it is not an official GrapheneOS product. The rest is a map. Read the rows you care about and skip the others; nothing later depends on an earlier row.

## The short version

ObliviOS is a distribution based on GrapheneOS that adds privacy features of its own: a device identity for each app, a choice of how each app's traffic leaves the phone, a second credential that opens a decoy profile, and a password manager that stays on the phone. It is published as source only, so you cannot install it from the project, but you can build an image yourself for a Pixel 7a or a Pixel 10a with [Build with it](build.md).

## What ObliviOS is

ObliviOS is a distribution based on GrapheneOS, with its own identity, signing, updates, release process and support policy. It adds features above what GrapheneOS ships: each app gets its own device identity, you choose per app how its traffic leaves the phone, a second credential opens a decoy profile instead of yours, and a password manager never leaves the phone.

It is not an official GrapheneOS product and is not affiliated with or endorsed by the GrapheneOS project. The plain-language version of this chapter is [What it does](https://oblivios.org/what-it-does) on oblivios.org.

## What it is not

You will save time if you know the limits first.

- It is source only. The project publishes source, records and a bill of materials. There is no binary, no image and no update service, and no device is supported. You cannot install it from the project. You can build an image yourself for a Pixel 7a or a Pixel 10a by following [Build with it](build.md); that image is unsupported, it is not audited by anyone, and the published source is not exactly the source of the images I flash. See [Status](https://oblivios.org/status) and the [device support policy](../devices/support-policy.md).
- It does not claim to be more private or more secure than GrapheneOS. The [threat model](../security/threat-model.md) says what it does not claim to defeat.
- It needs no account and sends no telemetry.
- It is made by one person, me. An issue gets a first reply within three days ([CONTRIBUTING](https://github.com/Beau4201/oblivios-docs/blob/main/CONTRIBUTING.md)); there is no support desk and no release date.

## The map

The system is split into parts. Each part has a record: decisions (an ADR is one decision), engineering notes or a module page. Read the row that matches your interest. A decision is either accepted or still only proposed, and its page in the decision log says which; [Status](https://oblivios.org/status) says what runs on which phone.

| Part | What it does | Where to read |
| --- | --- | --- |
| Compartments | Gives each app its own device identity, so apps cannot recognise the phone or link to one another. It is not invisibility (ADR-167, ADR-180). | The [threat model](../security/threat-model.md) and the [decisions](https://oblivios.dev/decisions) |
| Network exit | You choose per app how its traffic leaves the phone: Direct, through Tor or through your own WireGuard profile (ADR-178). | The [exit-daemon module](../modules/exit-daemon.md) |
| Atlas | A map and a list of the companies and places your apps talk to (ADR-157). | The [data map notes](../architecture/datamap-engineering-notes.md) |
| Duress Unlock | A second credential opens a decoy profile instead of yours. | The [Duress Unlock notes](../architecture/duress-engineering-notes.md) |
| Passwords | A local-only password manager and autofill provider: no sync, no server, no account (ADR-190). | The [vault-core module](../modules/vault-core.md) |
| Grab detection | Locks the phone at once if it is pulled out of your hand while it is unlocked (ADR-176). | The [grab detection notes](../architecture/grab-detection-engineering-notes.md) |
| App drawer | Themed icons and a System group that holds every preinstalled app (ADR-141, ADR-142). | The [app drawer notes](../architecture/app-drawer-engineering-notes.md) |
| Keyboard | A new look and a landscape fix for the on-screen keyboard (ADR-146). | The [keyboard notes](../architecture/keyboard-engineering-notes.md) |
| AirPods | A Settings page with every control the AirPods expose (ADR-132). | The [AirPods notes](../architecture/airpods-engineering-notes.md) and the [airpods-core module](../modules/airpods-core.md) |

## The public repositories

The code and the records are in public repositories. Start with the one that matches what you want to read.

| Repository | What it holds |
| --- | --- |
| [oblivios-docs](https://github.com/Beau4201/oblivios-docs) | The documents, the source of the websites, the bill of materials and the scripts that reproduce a documented check. |
| [oblivios-manifest](https://github.com/Beau4201/oblivios-manifest) | The pinned GrapheneOS and AOSP revisions the patches apply to, and how each baseline was chosen. |
| [oblivios-platform](https://github.com/Beau4201/oblivios-platform) | The patch packages: ObliviOS added to GrapheneOS source. |
| [oblivios-services](https://github.com/Beau4201/oblivios-services) | The platform-independent logic and native daemons that some packages ship as prebuilt binaries. |

The documents are authored in a private repository and copied to oblivios-docs by a script, so oblivios-docs is a snapshot. Do not edit a document there: the next snapshot overwrites it, and a correction goes in an issue. [Build with it](build.md) explains what the snapshot means for you when you build.

## How to read a claim

A claim in the records says what it rests on, with one of three labels, and you should not trust a claim more than its label allows.

- `measured`: something was run and observed, and the label names the run.
- `verified-in-source`: it was read in the source, and the label names the path.
- `assumption`: it has not been checked.

On oblivios.dev the labels are small tags in the text. A claim with no label is my statement, and you are right to ask for the evidence. Where a record says "not run" or "not measured", that is me telling you where to look first.

## Check it yourself

You do not have to trust any of this. Each of these starts from a page that names the files it was made from.

- [Verify](https://oblivios.dev/verify) has the commands that compare every published file with its recorded hash and rebuild the bill of materials from the same commits. It also says which prebuilt binaries are committed and that their reproduction was not run again for the page.
- [Components](https://oblivios.dev/components) lists what the project is built from, with the licence and the advisories of each part.
- [Files and patches](https://oblivios.dev/patches) says which projects of the upstream baseline the patches change. Read a patch against the pinned revision, not against the latest upstream.
- The [threat model](../security/threat-model.md) says who could attack ObliviOS, what stops them, and in its own section what the project does not claim.
- A flaw goes in an issue, or in an email if you would rather it is not public before it is fixed: [SECURITY](https://github.com/Beau4201/oblivios-docs/blob/main/SECURITY.md) has the address, the key and what to expect, and [Security](https://oblivios.org/security) says the same in plain language. A weakness that already exists in GrapheneOS or AOSP is better reported to those projects; tell me as well if the ObliviOS patches make it worse.

## Words you will meet

| Term | What it means | Read more |
| --- | --- | --- |
| ADR | One numbered entry of the decision log, written ADR-nnn: the decision, its status, why, what follows and what would reopen it. | The [decision log](../governance/decision-log.md) |
| AOSP | The Android source that GrapheneOS and ObliviOS are built on. | The [manifest repository](https://github.com/Beau4201/oblivios-manifest) |
| GrapheneOS | The distribution ObliviOS is based on. ObliviOS is not affiliated with it. | [FAQ](https://oblivios.org/faq) |
| Baseline | The pinned upstream revision that the patches apply to. | The [manifest repository](https://github.com/Beau4201/oblivios-manifest) |
| Patch package | A set of patches in oblivios-platform that adds one feature to the GrapheneOS source. | [Files and patches](https://oblivios.dev/patches) |
| Module | A part of the code that builds and tests on its own, with a page that says what it is, what it is not and how it is built. | The [vault-core module](../modules/vault-core.md) |
| SBOM | The software bill of materials: every component the project is built from, with versions, licences and hashes. | [Components](https://oblivios.dev/components) |
| Snapshot | The published copy of the documents, without history. | [CONTRIBUTING](https://github.com/Beau4201/oblivios-docs/blob/main/CONTRIBUTING.md) |
| Claim | A statement of what the system does or does not do. Each claim should say what it rests on. | The [threat model](../security/threat-model.md) |
| `measured`, `verified-in-source`, `assumption` | The three labels that say what a claim rests on: something that was run and observed, something read in the source, or something not yet checked. | The chapter How to read a claim, above |
| `lynx`, `stallion` | The phones that run ObliviOS builds: the Pixel 7a that the project develops on, and the Pixel 10a that I use every day. Neither is supported. | [Devices](https://oblivios.org/devices) |
| Source only | The stage of the project: source and records, and no builds, no images and no update service. | The [device support policy](../devices/support-policy.md) |

## How the two sites relate

oblivios.org is the plain-language site: what ObliviOS does, its status, the devices, the FAQ and how to report a security problem. oblivios.dev is the record: the decision log with a page for every entry, the threat model, the engineering notes, the module pages, the bill of materials and a search over all of it.

Everything on oblivios.dev is read from the same repository as the code, so a page cannot drift from the record. When you want the evidence behind a sentence of oblivios.org, look for it on oblivios.dev.

## Where to go next

- You want to know what it does for you: [What it does](https://oblivios.org/what-it-does).
- You want to know whether you can use it: [Status](https://oblivios.org/status) and [Devices](https://oblivios.org/devices).
- You want to know why something was decided: the [decisions](https://oblivios.dev/decisions), searched by number or by word.
- You want to know what it protects against, and what not: the [threat model](../security/threat-model.md).
- You want to build it or take it further: [Build with it](build.md).
- You want to check the claims: the chapter Check it yourself, above, and [Verify](https://oblivios.dev/verify).
- You want to ask your own AI about all of this: [the brief for AI agents](ai.md).
