# Review it

This guide is for you if you want to check ObliviOS rather than trust it: to find the evidence behind a claim, to see whether what is published is what was built, to read the patches against upstream, or to report a flaw. It describes a method, and every step names the page or file that holds the facts.

## What a review looks like here

A review of an operating system project, whatever the project, usually does six things. You read what the project claims. You look for the evidence behind each claim. You rebuild and compare what was published. You read the changes against the upstream source they apply to. You test the places where the project says it did not. You report what you find to the people who can fix it.

ObliviOS is set up so each of these has a place to start. The rest of this guide takes them in that order. This guide says nothing about how any other project works.

## Pick a claim and find its evidence

Start from one claim, not from the whole record. The [threat model](../security/threat-model.md) lists who could attack, along which path, and what stops, detects and repairs it. The [decision log](../governance/decision-log.md) says what each part does and, in its consequences column, what that costs.

A claim in the records says what it rests on, with one of three labels.

- `measured`: something was run and observed, and the label names the run.
- `verified-in-source`: it was read in the source, and the label names the path.
- `assumption`: it has not been checked.

On oblivios.dev the labels are shown as small tags in the text. Treat a claim with no label as the author's statement and ask for the evidence. Where a record says "not run" or "not measured", that is the project telling you where to look first.

## Check that what is published is what was built

The project publishes a bill of materials and a list of the SHA-256 of every published file. [Verify](https://oblivios.dev/verify) on oblivios.dev has the commands that compare every file with its recorded hash and rebuild the bill of materials from the same commits, and it says which commits to use. [Components](https://oblivios.dev/components) lists what the project is built from.

The same page lists the prebuilt binaries that are committed, each with what it was built from and with what. It also says what the bill of materials does not claim, for example that the reproducibility of a prebuilt binary is stated by its record and was not run again for the page.

## Read the patches against upstream

ObliviOS is added to GrapheneOS source as patch packages, and each package applies to a pinned upstream revision.

- The [manifest repository](https://github.com/Beau4201/oblivios-manifest) pins the GrapheneOS and AOSP revisions and says how each baseline was chosen.
- The [platform repository](https://github.com/Beau4201/oblivios-platform) holds the patch packages.
- [Files and patches](https://oblivios.dev/patches) on oblivios.dev says what the files of the public repositories are and which projects of the upstream baseline the patches change.

Read a patch against the pinned revision, not against the latest upstream. A decision whose consequences say that a patch must be applied again at every rebase tells you where the next rebase can break it.

## Test what is not measured

The module pages end with a section that says what was run and what was not. The [vault-core](../modules/vault-core.md), [exit-daemon](../modules/exit-daemon.md) and [airpods-core](../modules/airpods-core.md) pages are the starting points: each says which commands need a build server, which run on a workstation and which were not run for the page. A decision that says "not built, not run" is a claim you can test once you have a build.

The [engineering notes](../architecture/site-engineering-notes.md) of an area record dead ends and measurements with the command and the error text, so you can repeat a measurement before you believe it.

## Report a flaw

Open an issue, or send an email if you would rather the problem is not public before it is fixed. [SECURITY](https://github.com/Beau4201/oblivios-docs/blob/main/SECURITY.md) has the address, the key and what to expect, and [Security](https://oblivios.org/security) on oblivios.org says the same in plain language. A weakness that already exists in GrapheneOS or AOSP is better reported to those projects. Tell me as well if the ObliviOS patches make it worse.

## What the project does not claim

Read this before you report a gap that the project already names. The threat model states what ObliviOS does not claim to defeat, among them a fully compromised hardware root of trust, unknown vulnerabilities, network-level denial of service, and the timing differences of Duress Unlock. [What it does not claim](../security/threat-model.md) is in the threat model, and [Status](https://oblivios.org/status) says what the project is and is not today.
