# FreeholdOS Supply Chain, Signing, Update, and Incident Controls

## Purpose and status

This policy defines the controls required before FreeholdOS produces any signed
release artifact. It applies to the GrapheneOS-derived platform, FreeholdOS code,
host tools, Pixel inputs, release metadata, OTA delivery, factory images, and
recovery images.

FreeholdOS is in Phase 0. This document authorizes neither a source sync, key
creation, signing ceremony, OTA service, nor release. Those operations begin
only after their applicable Phase 1 plan, evidence, and owner approval.

## Control objectives

- A released artifact is reproducible from an identified source and toolchain.
- A compromised worker, source fetch, update host, or individual key cannot
  silently create a trusted release.
- Update, recovery, and rollback flows preserve verified boot and rollback
  protection.
- Development artifacts cannot be accepted as alpha, beta, or stable artifacts.
- Security incidents have an accountable, evidence-preserving response path.

## Roles and separation of duties

| Role | May do | Must not do alone |
| --- | --- | --- |
| Source custodian | Verify upstream source, maintain manifest/provenance records, prepare a reviewed source input. | Approve a release or operate stable signing keys. |
| Build operator | Run an isolated, pinned build and retain its evidence. | Select an unreviewed source input or sign a stable release. |
| Release reviewer | Compare provenance, reproducibility results, SBOM, test evidence, and release notes. | Build and approve the same artifact alone. |
| Channel signer | Perform the approved channel-specific signing ceremony. | Approve the source, reproducibility result, and release alone. |
| Incident lead | Classify incidents, coordinate containment and disclosure, preserve evidence. | Close an incident without a recorded fix owner and review. |

Named people, access grants, rotations, and on-call coverage belong in protected
operations records, never in this repository.

## Build and provenance chain

Each candidate follows this ordered chain. A failure stops promotion; it never
falls back to an unsigned or unverified path.

| Stage | Required record and control | Automation | Human approval |
| --- | --- | --- | --- |
| 1. Select | A locked FreeholdOS manifest revision, exact upstream tag/commit, FreeholdOS patch revisions, device target, and approved channel. Moving branches are forbidden. | Validate revision format and allow-list. | Source custodian confirms the selected security baseline. |
| 2. Acquire | Fetch from recorded primary origins; verify the GrapheneOS tag/signature, manifest commit, source identities, and required Pixel input hashes/terms. | Fetch, hash, signature, and manifest comparison. | Source custodian resolves any mismatch. |
| 3. Prepare | Produce a source lockfile containing every repository revision, prebuilt/tool origin and hash, build configuration, patch set, and excluded-secret check. | Generate lockfile and scan for prohibited paths. | Build operator attests to the isolated input. |
| 4. Build | Use an ephemeral isolated worker with a pinned, versioned host image and pinned build tools. The worker has no production signing key. | Build, collect logs, generate SBOM and unsigned artifact hashes. | Build operator attests to successful completion. |
| 5. Reproduce | Independently rebuild the same lockfile on a separate isolated worker or independently administered environment. Compare unsigned artifact hashes byte-for-byte. | Rebuild and compare hashes. | Release reviewer approves an explained, permitted difference only if the release policy has explicitly defined that artifact class; otherwise reject. |
| 6. Verify | Run the channel's required validation evidence, including boot/update/recovery checks when applicable, and review licences/notices. | Collect reports and bind hashes to the candidate. | Release reviewer approves promotion eligibility. |
| 7. Sign | Sign only the reviewed artifact hash and release manifest with the channel key. | Verify manifest schema, hashes, and signature. | Channel signer performs the ceremony after recorded approval. |
| 8. Publish | Publish signed metadata, artifact hashes, SBOM/notice references, release notes, and rollout state. | Upload immutable artifacts and monitor availability. | Release owner authorizes channel rollout. |

### Provenance record

Every candidate retains an immutable provenance record containing:

- candidate ID, channel, build target, build start/end times, and worker image
  digest;
- FreeholdOS manifest revision, upstream tag and manifest commit, every source and
  prebuilt revision/hash, and the applied patch-set revision;
- build configuration digest, tool versions, command entrypoint identifier,
  unsigned artifact hashes, SBOM digest, and reproducibility comparison result;
- validation evidence identifiers, reviewer approval IDs, signed release
  manifest digest, signer key identifier, publication time, and rollout state.

Build logs, failed-build artifacts, access logs, approvals, and provenance
records are retained according to the future operations retention schedule.
They must be integrity-protected, access-controlled, and available for an
incident investigation; they must not contain private keys, decrypted key
material, user data, or unpublished device logs.

## Signing-key hierarchy and ceremonies

### Channel separation

| Channel | Purpose | Key material and access | Promotion rule |
| --- | --- | --- | --- |
| Development | Local or CI development images; never public distribution. | Dedicated development keys with limited engineering access; replace freely after exposure. | Never accepted by alpha, beta, or stable update paths. |
| Alpha | Controlled internal test distribution. | Dedicated alpha keys; restricted signer access and recorded approvals. | Requires reproducible candidate and named internal test scope. |
| Beta | Owner-approved public test distribution. | Dedicated beta keys; ceremony access is restricted and independently reviewed. | Requires public-beta gates, monitored disclosure, and channel-specific validation evidence. |
| Stable | Production distribution. | Separate offline root/release material in approved hardware-backed offline storage; ceremony access requires designated custodians and protected recovery instructions. | Requires reproducibility, complete release review, owner approval, and stable-channel rollout decision. |
| Personal Stable | Production trust for one owner's single named device; never distributed to another person (ADR-110). | Dedicated per-device release key set in the signing host's encrypted vault; the single owner is sole custodian; no disk-backed swap during a ceremony (ADR-111). | Requires a reproducible candidate (deferred for `stallion` by ADR-112), a logged ceremony, and a relocked boot verified after signing. Never promotes to Stable; plural-device or public distribution must be re-issued through Stable. |

No routine build worker, CI runner, source-fetch host, OTA host, developer
workstation, repository, chat system, issue tracker, or backup contains stable
private signing material. Private keys, decrypted recovery shares, and signing
secrets are never committed, logged, pasted into tickets, or copied to build
artifacts.

### Ceremony requirements

Before any channel signing event, record the candidate ID, artifact and
manifest hashes, channel, signers/custodians, approvals, timestamp, and result.
The signer verifies that the reviewed hashes match the ceremony input before
signing. The resulting signature is verified on a separate system and bound to
the provenance record. Any mismatch ends the ceremony and opens an incident.

Stable signing occurs only with offline material under multi-person access
control. The protected operational procedure defines identity verification,
physical safeguards, audit logging, recovery-share custody, and a witness or
independent reviewer. This public policy deliberately contains no key locations,
thresholds, recovery shares, credentials, or operational schedule.

### Rotation, revocation, and emergency replacement

Rotate a channel key after suspected compromise, loss of custody, unauthorized
access attempt, cryptographic deprecation, personnel/access-role change that
invalidates the access model, or an approved scheduled rotation. Revoke a key
when an authorized release path can no longer trust it. Never silently reuse a
suspect key.

Emergency replacement requires: incident classification; containment of the
old key and affected publication paths; generation and protection of a
replacement key under the applicable ceremony; signed transition metadata
accepted by the installed trust model; tested update and recovery path; user
guidance; signed advisory; and post-incident review. If a safe transition is
not possible, pause the affected channel and publish the recovery route rather
than weakening verified boot or update verification.

## OTA, rollback, and recovery controls

### Channel and metadata rules

Each channel has a separate update configuration, signing identity, metadata
endpoint, artifact namespace, rollout state, and audit record. Update metadata
is signed, versioned, expiry-bounded, hash-bound to the artifact, and carries
the target device set plus rollback-relevant version data. The updater rejects
unsigned, malformed, expired, wrong-channel, wrong-device, stale, or
hash-mismatched metadata and records the failure without changing device state.

Before offering an OTA, the update service and device preflight must establish:

- the device is in the supported target set with a compatible firmware/build
  baseline;
- the artifact, metadata signature, manifest version, and release channel are
  valid for that device;
- required storage, battery/power, A/B slot, and recovery preconditions are
  satisfied; and
- the update advances rather than violates the platform's rollback-index rules.

### Rollout, pause, and withdrawal

Start a new channel release with a bounded staged rollout. Promotion expands
only after the defined monitoring window, validation evidence, and release-owner
approval. Pause rollout immediately for a signature/provenance failure,
verified-boot issue, rollback-index defect, recovery failure, material
availability issue, or credible security incident. Withdraw an artifact from
future offers when safe to do so, but retain signed evidence and explain the
user impact in the incident record.

Withholding an OTA is not a rollback. A device may install only a valid,
authorized update that satisfies verified-boot and rollback-index enforcement.
No procedure permits lowering rollback indices, accepting a test key in a
release channel, or bypassing signature verification to restore service.

### Interrupted update and recovery

An interrupted OTA must leave the device in a bootable known-good slot or enter
the platform's signed recovery path. The release record must include tests for
power loss, download interruption, metadata rejection, first-boot failure, and
recovery verification before a channel promotion. User guidance must state the
channel, affected device, symptom, safe next step, and support/disclosure route
without requesting sensitive user data in a public channel.

The factory-image fallback is a separately signed, device-compatible artifact
with documented installation and relocking guidance. It verifies the FreeholdOS
release key and preserves the verified-boot chain. It is not a means to unlock
or bypass boot verification; relocking occurs only after release-key validation.

## Security incident response

### Intake and classification

Before public beta, FreeholdOS must operate a monitored public disclosure channel
with an assigned owner, acknowledgement process, protected evidence intake, and
published scope. Do not publish an email address, web form, or security contact
until monitoring and response ownership are live.

The incident lead creates a restricted incident record for every credible
report. Classify severity by exploitability, affected release/channel/device
scope, confidentiality/integrity/availability impact, active exploitation,
and recovery availability:

| Severity | Meaning | Initial action |
| --- | --- | --- |
| Critical | Trusted-release, key, verified-boot, or widely exploitable compromise with severe impact. | Immediately contain, pause affected rollout, preserve evidence, assign executive/release ownership. |
| High | Material security defect or credible compromise with a practical affected path. | Contain affected path, assess channel/device scope, assign fix and disclosure owner. |
| Medium | Bounded defect requiring a fix or mitigation without evidence of broad compromise. | Track with a named owner, regression test, and scheduled remediation. |
| Low | Limited-impact issue, hardening opportunity, or invalid report. | Record rationale; fix or close through normal review. |

### Response workflow

1. **Intake:** acknowledge through the monitored channel, assign an incident
   ID, restrict access, and preserve the original report.
2. **Triage:** classify severity, affected candidate/release/channel/device,
   and whether immediate rollout pause or revocation is required.
3. **Preserve evidence:** retain relevant provenance, signed metadata,
   artifact hashes, access/audit logs, and reproducible build results. Do not
   alter originals; work from documented copies.
4. **Contain:** disable affected publication credentials or rollout paths,
   quarantine suspect workers/artifacts, and communicate need-to-know status.
5. **Fix and verify:** assign a fix owner; review the change; add a regression
   test; rebuild reproducibly; validate update, recovery, and rollback effects.
6. **Advise and deploy:** issue a signed advisory with affected versions,
   impact, mitigations, fixed versions, and recovery guidance; stage the fix
   through the appropriate channel.
7. **Disclose and review:** coordinate disclosure timing with affected parties
   when appropriate, publish after containment or on an evidence-based schedule,
   and perform a blameless post-incident review with tracked corrective actions.

No incident is closed until the containment decision, fix or acceptance
rationale, regression evidence, disclosure decision, and review owner are
recorded.

## Inputs to the Task 7 validation matrix

Task 7 must add evidence-backed cases for: source/tag signature verification;
locked-manifest enforcement; host-tool/version drift rejection; build-worker
isolation; reproducible unsigned artifact comparison; release-manifest and OTA
metadata signature rejection; channel separation; stable-key absence from build
workers; key-rotation and emergency-transition rehearsal; unsupported-device
preflight rejection; rollback rejection; interrupted-update recovery; factory
image/relock verification; staged-rollout pause/withdraw; and incident-response
exercise with a monitored disclosure channel.

## Threat-model links

This policy controls the supply-chain abuse cases recorded in
`docs/security/threat-model.md`: compromised source fetch, compromised build
worker, signing-key theft, malicious OTA metadata, rollback attempt, and
recovery-image substitution. Any change to these controls requires a threat
model update, validation evidence, rollback assessment, and independent review.
