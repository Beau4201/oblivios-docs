# oblivios-docs

Published documents of the ObliviOS project: the decision log, the threat model, the capability
boundaries, the device support policy, the licensing and branding review, the supply-chain and signing
design, and the engineering notes of the areas whose patches are published in `oblivios-platform` and
`oblivios-services`.

## Stage

Source only. No builds, images or update service are offered, and no device is supported (ADR-171).

## What this repository is

A one-way snapshot. The documents are authored in a private repository and copied here by a script that
rewrites host and path details to neutral wording and checks the result. Do not edit a file here: a change
is made at the source and the snapshot is regenerated.

A link to a record that is not published is shown as plain text. A record cited by path in the decision log
or in an engineering note may therefore not exist here.

## Scripts

`tools/` holds the scripts that reproduce a documented check, each with a host path replaced by a parameter:
`PLATFORM_TREE` names an AOSP source tree. Scripts that only operate the private build and signing hosts are
not published. The scripts are licensed Apache-2.0, see `tools/LICENSE`.

## Licence

The documents are licensed CC-BY-4.0, see `LICENSE`. The name ObliviOS and its logo are not licensed.
ObliviOS is based on GrapheneOS; it is not affiliated with or endorsed by the GrapheneOS project.
