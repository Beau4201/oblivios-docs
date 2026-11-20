# Questions for the agent brief

The test of the guides and the brief: a fresh AI that has only the brief and the Markdown text of the sites must answer every question below from them, and say "not measured" or "not supported" where the records do. This file is the list of questions, the audience each belongs to and the place where the answer lives; a row marked "the answer is no" or "not measured" is a question that a careless AI answers with a guess.

## Questions

| Audience | Question | Answer lives at |
| --- | --- | --- |
| understand | What is ObliviOS, in two sentences? | https://oblivios.org/what-it-does |
| understand | Can I install ObliviOS on my phone today? | https://oblivios.org/status and CONTRIBUTING.md (the answer is no: source only) |
| understand | Which devices does ObliviOS support? | docs/devices/support-policy.md (the answer is none) |
| understand | Which phones run ObliviOS builds at all? | https://oblivios.org/devices |
| understand | Is ObliviOS an official GrapheneOS product? | https://oblivios.org/faq (the answer is no) |
| understand | Is ObliviOS more private or more secure than GrapheneOS? | https://oblivios.org/faq and docs/security/threat-model.md (not claimed) |
| understand | Does ObliviOS need an account or send telemetry? | https://oblivios.org/faq (the answer is no) |
| understand | What does Compartments do, and what does it not do? | docs/security/threat-model.md and ADR-180 |
| understand | Does Compartments hide my IP address from apps? | https://oblivios.org/faq (the answer is no) |
| understand | Why is Tor not the default network exit? | ADR-178 (measured slowdown) |
| understand | What does Duress Unlock not defeat? | docs/security/threat-model.md |
| understand | Does the Passwords app sync to a server? | ADR-190 (the answer is no: local only, one export file) |
| understand | What happens when the phone is pulled out of my hand while it is unlocked? | ADR-176 and https://oblivios.org/what-it-does |
| understand | Does ObliviOS take part in Apple's Find My network? | docs/security/threat-model.md (a refused non-goal) |
| understand | Why do older records call the project AegisOS or FreeholdOS? | ADR-224 |
| understand | Will there be installable images, and when? | https://oblivios.org/faq (not yet, no date) |
| build | Can I build an image of ObliviOS myself, and for which phones? | docs/guides/build.md (yes for `lynx` and `stallion`, unsupported, no binary is offered) |
| build | Does a build from the published source equal the images the owner flashes? | docs/guides/build.md and docs/architecture/site-engineering-notes.md (the answer is no, not yet) |
| build | Was the build guide run from a clean source tree to a flashed phone? | docs/guides/build.md (the answer is no: no full sync, build, signing or flash was run; not measured) |
| build | Which signing keys and which update address does a fork use? | docs/guides/build.md, chapter Make it yours (its own; the published update address is a placeholder) |
| build | Are the signing scripts and the update server published? | docs/guides/build.md (the answer is no) |
| build | Which GrapheneOS tag is the source pinned to? | docs/guides/build.md, chapter Get the source, and the README of oblivios-manifest |
| build | Can I send a pull request? | CONTRIBUTING.md (the answer is no, not yet) |
| build | How do I propose a change or a correction? | CONTRIBUTING.md |
| build | Which public repositories exist and what does each hold? | docs/guides/start.md and the README of oblivios-docs |
| build | Can I build vault-core on my laptop? | docs/modules/vault-core.md (the answer is no: a build server) |
| build | Can I build exit-daemon on my laptop? | docs/modules/exit-daemon.md (the answer is no: a build server) |
| build | How do I build and test airpods-core, and was it run on a clean machine? | docs/modules/airpods-core.md (not run on a clean machine) |
| build | How do I build the websites, and with which Node version? | site/README.md |
| build | How do I find one decision in the decision log? | docs/governance/decision-log.md and site/README.md |
| build | Where does a new fact, a lesson or a decision go? | docs/documentation-standard.md |
| build | Why can a decision not be edited in place? | docs/governance/decision-log.md |
| build | Is a device supported once it boots an ObliviOS image? | docs/devices/support-policy.md (the answer is no) |
| build | Can I run ObliviOS on a Pixel 9? | docs/devices/support-policy.md (not supported) |
| build | Why should I not edit the files of the oblivios-docs repository? | CONTRIBUTING.md |
| build | How soon do I get a first reply to an issue? | CONTRIBUTING.md |
| build | Under which licence are the documents and the scripts? | CONTRIBUTING.md |
| review | How do I report a vulnerability privately? | SECURITY.md and https://oblivios.org/security |
| review | What do the labels measured, verified-in-source and assumption mean? | docs/guides/start.md |
| review | Where is the threat model, and what does it say the project does not claim? | docs/security/threat-model.md |
| review | How do I check that the published files are the files that were built? | https://oblivios.dev/verify |
| review | Where is the bill of materials, and what does it not claim? | https://oblivios.dev/components and https://oblivios.dev/verify |
| review | Which prebuilt binaries are committed, and was their build reproduced again for the site? | https://oblivios.dev/verify (reproduction not run again) |
| review | Where do I read the patch packages, and where is the upstream revision pinned? | docs/guides/start.md and https://oblivios.dev/patches |
| review | Has the portal oblivios.dev been claim-reviewed? | docs/product/status-platform-and-release.md (the answer is no) |
| review | Is the set of Rust packages linked into each binary computed? | https://oblivios.dev/verify (not computed) |
| review | Does the bill of materials give a legal opinion on licences? | https://oblivios.dev/verify (the answer is no) |
| review | What residual risk does Duress Unlock accept about timing? | docs/security/threat-model.md |
| review | Which hardening of GrapheneOS does ObliviOS keep? | https://oblivios.org/faq |
| review | How do I find the decisions behind one feature? | docs/guides/start.md and https://oblivios.dev/decisions |
| review | Is Compartments' device identity undetectable by an app? | docs/security/threat-model.md and ADR-209 (the answer is no) |
