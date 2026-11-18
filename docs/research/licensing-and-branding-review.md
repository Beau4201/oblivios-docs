# Licensing and Branding Review

## Purpose and review boundary

This is an engineering compliance inventory, not a legal opinion. A qualified
lawyer must review worldwide distribution, entity formation, consumer terms,
privacy disclosures, trademark use, export/cryptography obligations,
telecommunications and emergency-function statements, and every public-beta
distribution channel before release.

## Product identity

ObliviOS is a distinct operating-system distribution based on GrapheneOS. It
must use ObliviOS names, artwork, package identities, signing subjects, update
URLs, support contacts, release notes, privacy documentation, and recovery
instructions. It must not use GrapheneOS name or logo in a way that suggests an
official GrapheneOS product. User-facing attribution may truthfully state that
ObliviOS is based on GrapheneOS where required or useful, while keeping the
products unambiguous.

## Licence and source-disclosure inventory

| Component group | Inventory requirement | Public-beta distribution requirement |
| --- | --- | --- |
| AOSP-derived source | Record repository, revision, file-level copyright/licence notices, changes, and build inputs. | Preserve notices and meet every applicable source, notice, attribution, and offer requirement. |
| Linux kernel and copyleft components | Record exact source revision, configuration, patches, toolchain/build instructions, and corresponding-source obligations. | Provide complete corresponding source and required notices in the manner and timeframe required by the applicable licence. |
| GrapheneOS-derived source | Record upstream repository, revision, inherited licence, ObliviOS modifications, and notices. | Preserve inherited licensing and notices; publish required source and ObliviOS open-source core before public beta. |
| Pixel firmware and proprietary device components | Record source, version, checksum, use restriction, redistribution status, and installation path. | Distribute only when expressly permitted by the governing terms and compatible with the selected release workflow. |
| Browser, WebView, apps, models, SDKs, and host tools | Maintain a software bill of materials with origin, version, hash, licence, notices, build option, and vulnerability owner. | Include required notices and source/offers; block components without provenance or a distributable licence. |
| ObliviOS-authored code | Record author copyright, repository revision, licence, dependencies, security owner, and release artifact mapping. | Release the ObliviOS open-source core from public repositories with reproducible-build instructions and preserve compatible third-party notices. |

## Required public-beta compliance package

Before public beta, produce and independently review:

1. a release-specific software bill of materials;
2. a notice and attribution bundle;
3. source-code publication locations and corresponding-source process for
   every applicable component;
4. reproducible-build instructions and source-to-artifact provenance;
5. trademark and branding review of system images, installer, updater,
   websites, and documentation;
6. privacy notice, telemetry statement, support policy, vulnerability
   disclosure process, and recovery/update documentation; and
7. written legal advice covering the intended worldwide distribution model.

## Engineering rules

- Retain upstream copyright, licence, and provenance information in every
  imported repository and release inventory.
- Do not copy a binary, firmware component, SDK, model, font, icon, or service
  into an ObliviOS image until its origin, hash, terms, update owner, and security
  response owner are recorded.
- Do not imply Android, Google, Pixel, or GrapheneOS sponsorship without a
  separately verified right to do so.
- Do not describe global legal compliance as complete until qualified counsel
  has provided a release-specific review.
- Keep private signing keys and operational secrets confidential even after
  public source release; open-source publication never includes private keys.

## Review gates

| Gate | Required reviewer | Blocking question |
| --- | --- | --- |
| Derivative identity | Trademark counsel | Do branding, product naming, attribution, and marketing clearly establish ObliviOS as a distinct product? |
| Source and notices | Open-source compliance counsel | Does the release inventory satisfy every applicable source, notice, attribution, and offer obligation? |
| Worldwide distribution | Product/regulatory counsel | Which distribution, privacy, consumer, export, cryptography, and telecommunications rules apply to the selected public-beta model? |
| Proprietary inputs | Release and legal owners | Are all Pixel/vendor and third-party binaries legally and technically distributable in the proposed release? |
| Public operations | Security and privacy owners | Are support, disclosure, privacy, update, recovery, and incident processes live and accurately documented? |

## Source-only stage: legal risk accepted per item (ADR-171, ADR-245)

The gates above are for a public beta with binaries. The source-only stage (ADR-171) publishes source, records and a bill of
materials and offers no image, update or supported device. Its legal review was done by an AI agent, which is not qualified
counsel (owner decision of 2026-10-15). On 2026-11-17 the owner stated that the project is built alone and without a
budget, so counsel is not available for this stage. Each risk below is therefore taken without counsel; the owner's read of
the final set confirms or reverses it. Nothing here is a legal opinion.

| Item | What was found | Risk | What limits it | Status |
| --- | --- | --- | --- | --- |
| Name ObliviOS | TMview (EUIPO, WIPO and USPTO data), 2026-11-17, search for marks containing `oblivios`: none. 116 marks begin with `obliv`; registered or filed marks in classes 9 and 42 include OBLIVION (EU, US), OBLIVIOUS (US, filed 2024, classes 9, 41 and 42; the EUIPO filing ended in 2023), OBLIVIA, OBLIVIX, OBLIVY, OBLIVUS, OBLIVEA, OBLIVIEW and OBLIVIATE. A GitHub user `Oblivios`, the domain `oblivios.com` and a privacy-software company called Oblivious exist (ADR-241). TMview is not an official register; national registers elsewhere were not searched, and no similarity analysis was made. | A holder of a similar mark in software or privacy software may object; the chance is unknown. The consequence is a demand to rename and take down, not damages for a source-only project that sells nothing. | No sale, no binary, no commercial use. The name is not licensed (`LICENSE`, `NOTICE`). The project has been renamed more than once (ADR-170, ADR-224), so a rename is a known, mechanical cost. | Accepted |
| The GrapheneOS name | The READMEs say ObliviOS is based on GrapheneOS and not affiliated with or endorsed by it. The trademark terms of the GrapheneOS project were not read for this review. | The project could ask for the wording to change. | Wording is a statement of fact and is easy to change. | Accepted |
| Licences of own code and patches | Apache-2.0 for own code; each patch keeps the licence of the upstream file it changes; 18 upstream projects, 7 without a licence file at their root, so the licence is read from file headers (`sbom/evidence/upstream-licences.json`). The platform NOTICE and the SBOM were built from those facts and fail when a number differs. | A file may carry a licence that the reading missed. | The SBOM names every file with its rule; a wrong attribution is a one-line fix. | Accepted |
| Share-alike data | The classifier and the cell data are CC BY-SA 4.0 (AdGuard Companies DB, OpenCelliD); EasyList and EasyPrivacy (GPL-3.0-or-later or CC BY-SA 3.0 or later) are taken under CC BY-SA, which is the author's reading; GeoNames and DB-IP Lite are CC BY 4.0. | A licensor may read the terms differently. | The files are separate data files with their own rows in NOTICE and the SBOM; each can be removed without touching code. | Accepted |
| Logos of companies | Simple Icons files (CC0) draw the logos of companies in the Data Map and the Passwords app. The logos are trademarks of their owners; the files are used to name the company. | An owner may ask for removal. | NOTICE gives the removal route; the logos are data files. | Accepted |
| Logo and wordmark | The logo is traced from a picture that the owner supplied (318 px wide, `branding/logo-cloud/source/reference.png`); where the picture came from is not recorded in the repository and was not asked. The variants (ADR-249) are derived from the traced silhouette. The wordmark and the text of the social preview are outlines of Roboto Flex (SIL OFL 1.1, no Reserved Font Name, copyright 2017 The Roboto Flex Project Authors) converted to paths; no font file is published. The name and the logo are not licensed. | If the picture is the work of someone else, the logo cannot be claimed or used freely. | The files are not under the repository licence; a different picture changes only the files (`trace.py` and `variants.py` rebuild them). | Open: the owner states where the picture came from |
| Domains | The owner registered `oblivios.org` and `oblivios.dev` on 2026-11-17 (RDAP). `oblivios.com` is held by someone else (ADR-241) and both names are close to it. | The holder of `oblivios.com` or of a similar mark may object. | See the row of the name; a domain can be dropped and the sites moved. | Open until the owner's read of the final set |
| Prebuilt binaries | `exitd` and `libvault_core.so` are committed with their source commit, toolchain, build command and SHA-256, and the two builds of `exitd` of 2026-11-17 are bit-identical. Their THIRD-PARTY-LICENSES.txt files hold the licence files of the crates of each lock (548 and 72 packages); 66 and 1 packages have no licence file in the crate and are listed with the licence and authors that their `Cargo.toml` declares. | A notice may be incomplete for a crate whose licence file is missing. | The text lists every package of the lock, more than a binary links; `RISKS.md` and the SBOM name the packages. | Accepted |
| AirPods compatibility | The module speaks the accessory protocol of Apple AirPods and names them. Its provenance record is `airpods/SOURCE.md`. This review did not assess whether the protocol work is lawful in every jurisdiction. | A rights holder may object to the module or the name. | The module is separate (`airpods/`, `airpods-core`) and can be removed with one patch set. | Accepted |
| Authorship by an AI agent | Much of the code and text was written with an AI agent under the owner's direction; the owner is named as the copyright holder (`NOTICE`). Whether such work is protected, and who holds the right, differs by country and was not examined. | The licence grant may rest on a weaker right than it states. | Apache-2.0 and CC-BY-4.0 are offered as they are; no warranty is given. | Accepted |
| Site illustrations and text | The nineteen prints of `oblivios.org` are SVG drawings made by an AI agent in the style of the logo; there is no source picture. The page text is drafted by an AI agent in the owner's first person from the decision log, the threat model, the SBOM and the READMEs (ADR-251). | The owner presents text that has not been read sentence by sentence, and a sentence may claim more than a record supports. The right to the prints rests on the same weak ground as the row above. | The build writes a file that names the record behind each page; the claim review (C-1) is the owner's read before the sites go live. | Open until the owner has read the pages (C-1) |
| Export rules for cryptographic source | The repositories hold a Tor client, a password vault and other cryptographic code. Rules on publishing such source (for example the notification for publicly available encryption source code in the US export regulations) were not assessed. | A notification or a rule may apply and be missed. | Much of it is Arti and crates from crates.io; this review did not check what the project's own code adds. | Accepted |
| Personal data in the history | The author address is the project address of the `NOTICE` files (ADR-241, ADR-243). Internal host labels and one home path stay in the history (ADR-241). The private OTA server's domain stayed in older commits of `oblivios-platform`; the published tree no longer names it (ADR-245), but the history does until a rewrite. The old commits of `oblivios-platform` stay reachable by id on the host after the force-push (ADR-244). | A reader can still find these strings. | None of them is a credential; the owner chose against a second rewrite. | Accepted |
| Disclosure of Duress Unlock | The source shows an informed adversary that the feature exists (threat model). | A targeted adversary knows what to look for. | The threat model lists this as a residual risk (ADR-171); nothing else limits it. | Accepted |
| Warranty and support | Apache-2.0 and CC-BY-4.0 exclude warranty; no support, image or update is offered. | A reader may rely on the code for safety. | `SECURITY.md` and the READMEs say what is and is not claimed. | Accepted |

Gates of the public beta (distribution of binaries, worldwide terms, the final trademark review) are not met by this table and
stay as listed above.
