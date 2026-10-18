# Licensing and Branding Review

## Purpose and review boundary

This is an engineering compliance inventory, not a legal opinion. A qualified
lawyer must review worldwide distribution, entity formation, consumer terms,
privacy disclosures, trademark use, export/cryptography obligations,
telecommunications and emergency-function statements, and every public-beta
distribution channel before release.

## Product identity

AegisOS is a distinct operating-system distribution based on GrapheneOS. It
must use AegisOS names, artwork, package identities, signing subjects, update
URLs, support contacts, release notes, privacy documentation, and recovery
instructions. It must not use GrapheneOS name or logo in a way that suggests an
official GrapheneOS product. User-facing attribution may truthfully state that
AegisOS is based on GrapheneOS where required or useful, while keeping the
products unambiguous.

## Licence and source-disclosure inventory

| Component group | Inventory requirement | Public-beta distribution requirement |
| --- | --- | --- |
| AOSP-derived source | Record repository, revision, file-level copyright/licence notices, changes, and build inputs. | Preserve notices and meet every applicable source, notice, attribution, and offer requirement. |
| Linux kernel and copyleft components | Record exact source revision, configuration, patches, toolchain/build instructions, and corresponding-source obligations. | Provide complete corresponding source and required notices in the manner and timeframe required by the applicable licence. |
| GrapheneOS-derived source | Record upstream repository, revision, inherited licence, AegisOS modifications, and notices. | Preserve inherited licensing and notices; publish required source and AegisOS open-source core before public beta. |
| Pixel firmware and proprietary device components | Record source, version, checksum, use restriction, redistribution status, and installation path. | Distribute only when expressly permitted by the governing terms and compatible with the selected release workflow. |
| Browser, WebView, apps, models, SDKs, and host tools | Maintain a software bill of materials with origin, version, hash, licence, notices, build option, and vulnerability owner. | Include required notices and source/offers; block components without provenance or a distributable licence. |
| AegisOS-authored code | Record author copyright, repository revision, licence, dependencies, security owner, and release artifact mapping. | Release the AegisOS open-source core from public repositories with reproducible-build instructions and preserve compatible third-party notices. |

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
  into an AegisOS image until its origin, hash, terms, update owner, and security
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
| Derivative identity | Trademark counsel | Do branding, product naming, attribution, and marketing clearly establish AegisOS as a distinct product? |
| Source and notices | Open-source compliance counsel | Does the release inventory satisfy every applicable source, notice, attribution, and offer obligation? |
| Worldwide distribution | Product/regulatory counsel | Which distribution, privacy, consumer, export, cryptography, and telecommunications rules apply to the selected public-beta model? |
| Proprietary inputs | Release and legal owners | Are all Pixel/vendor and third-party binaries legally and technically distributable in the proposed release? |
| Public operations | Security and privacy owners | Are support, disclosure, privacy, update, recovery, and incident processes live and accurately documented? |
