# Build with it

This guide is for you if you want to build ObliviOS yourself, for a Pixel 7a (`lynx`) or a Pixel 10a (`stallion`), or to take it further as a fork. It goes from the pinned source to signed factory images and says, at every step, how that step is known to be right: it was run, it was read in a script, or it is a guess. Where something could not be checked, this guide says so and does not fill the gap with a plausible command.

**How long this takes.** Plan a whole weekend for a first image of one phone, and a few more evenings if you also sign it and flash it. This is what the logs of the build host and my own runs for this guide show `[measured: 2026-11-20, the logs of the build host and the runs of this guide]`:

- **Get ready:** half a day to read this guide and prepare the machines `[assumption: my estimate]`.
- **Get the source:** a first sync of the whole tree was not timed, because the host cannot hold a second tree. `frameworks/base` and the Settings app took 3 minutes 18 seconds, and at that speed the whole tree would take about two hours `[assumption: extrapolated from that run]`. Moving a tree that exists to a newer tag took 1 minute 44 seconds.
- **Add ObliviOS:** minutes. The 68 patches of `frameworks/base` took about three minutes, the attempt that stops and the one with `-C1` together.
- **Vendor files:** 28 minutes for the first device and 2 minutes 38 seconds for the second one.
- **Build:** a cold build of `lynx` took 8 hours 10 minutes. After a change of tag with a warm ccache it took 2 hours 42 minutes and 3 hours 13 minutes. Builds of a few hundred steps took 4 to 25 minutes, and builds of 2,500 to 7,000 steps took 1 to 2 hours. A `stallion` build with the signing inputs took 2 hours 44 minutes and 3 hours 12 minutes.
- **Sign and flash:** not timed. Both need you at the signing machine and at the phone.

## Before you begin

Read this page first. It is short and it saves you a wasted weekend.

**What you will have at the end.** If everything goes well you have a signed set of factory images for one phone, built from the pinned GrapheneOS source plus the ObliviOS patches, and you know how to flash and check it. The last chapters show how to make the project your own: your signing keys, your update address, your own patch package, and a move to a newer GrapheneOS release.

**What an image you build is, and what it is not.** It is your build. It is not supported: no device is supported, and the [device support policy](../devices/support-policy.md) says what support would mean. It is not audited by anyone. And to flash it you unlock the bootloader of the phone, which erases the phone and removes protections that a locked phone has. `stallion` is relocked with a key set made for that one phone (the Personal Stable channel of the [supply chain policy](../release/supply-chain-and-signing.md)); whether you can relock your phone with your own key is for you to check against the GrapheneOS pages this guide links. The project still offers no binary, no image and no update service ([ADR-171](../governance/decision-log.md)); this guide shows you how to make one, it does not hand you one.

**The published source is not exactly the source of the images I flash.** For this guide the published patch packages were applied to the pinned upstream commit and the result was compared with the branch that the images are built from. In some projects the trees are identical and in others they are not: the published patches do not yet contain every change that the build branch has, among them work on the decoy unlock and the keyguard. A build from the published source is therefore close to my images and not the same. The list of projects, with what differs, is in the [notes on the build guide](../architecture/site-engineering-notes.md). Whether each difference is intended is not read. I decided on 2026-11-20 that this guide describes the published source as it is and says so; when the packages are exported again the guide changes (ADR-286).

**How big.** These are measurements from my build host, an 8-vCPU virtual machine with 31 GB of memory, and they are a guide to the order of magnitude, not a promise `[measured: 2026-11-20, build host, read-only]`.

- The checked-out source tree is 107 GB and its git data is 50 GB. The output directory of a built `lynx` is 123 GB and that of `stallion` is 130 GB, and the ccache is 20 GB. One device needs about 300 GB and two devices about 430 GB, before you have room to work. Keep the two output directories apart.
- Analysing a cold tree took about 30 GB of memory plus 12 to 14 GB of swap on that host `[measured: build host, 2026-09 and 2026-10, engineering notes of the build]`. Do not run anything else while it does.

**What differs between the two phones.** One chapter each says it where a step differs, and says nothing where it does not.

| | `lynx` (Pixel 7a) | `stallion` (Pixel 10a) |
| --- | --- | --- |
| Build target | `lynx-cur-userdebug` | `stallion-cur-user` |
| Output directory | its own, for example `out-lynx` | its own, for example `out-stallion` |
| My use of it | development and test device | daily-use device, relocked, takes real updates |
| Build type | `userdebug`, keeps the debug-only test packages | `user`, which must not contain them |
| Extra memory patch | not needed | the vendor boot script overwrites the zram size, so a third patch of `memory/zram-size` sets the property it reads |

Every row is `verified-in-source`, from the build scripts of the build host and the status record of `stallion` (neither is published).

**The mistakes that cost the most.** I made each of these once or twice, and each cost hours or a flash. Every one has a chapter that says how to avoid it, and every one fails silently or late, which is why they are here first.

1. **Building without `OFFICIAL_BUILD=true`.** Nothing warns you. The build ends with `build completed successfully` and the Updater app is missing. It happened twice. See [Build the image](build.md#build-the-image).
2. **Expecting `<home>/.bashrc` in a command run through `ssh host '...'`.** It is never read, so ccache stayed empty and one build of about 180,000 steps ran completely cold. Export the ccache variables in the same block that starts the build.
3. **Exporting `OUT_DIR` after `source build/envsetup.sh`.** `lunch` then falls back to a plain `out/` without a word.
4. **Leaving out `BUILD_NUMBER`, `BUILD_DATETIME` and `USE_FIXED_TIMESTAMP_IMG_FILES`.** The build succeeds and bakes wall-clock times into every image, so no later rebuild can match it.
5. **Making a commit in `vendor/adevtool`.** A pin file stores its commit, and every build then fails in one second until the pin of each device is updated. See [Vendor files for your device](build.md#vendor-files-for-your-device).
6. **A small `/tmp`.** The vendor tool dies halfway with `failed to write resources.pb to archive` when `/tmp` has less than about 150 MB free.
7. **Changing the tree while a build runs** (a patch, a sync). The graph is made once, so a file that arrives later is missing from the result and the build still reports success.
8. **Renaming a public name.** It changes the sort order of an API listing, and the build fails at 99% after two hours, because `-k` keeps going and shows the failure only at the end.
9. **Keeping a rollback copy of a module inside the tree**, or a backup file inside an overlay's `res/`. Soong reads every `Android.bp` under the tree and defines each module twice; the build fails in 12 seconds.
10. **Trusting a clean exit.** A build that exits 0 says nothing about what is in the image. Read the installed-files lists, and the size of the files, after every real build.
11. **Signing on the build machine, or with the test keys.** Every flash of this project before the two-stage signing trusted the public AOSP test key for updates, and it was found only when a real update failed. See [Sign and package](build.md#sign-and-package).
12. **Flashing from the bootloader, with `-w`, or from an incomplete set.** Flash from fastbootd, never wipe on an update, and compare the file list of the set first. See [Flash and check](build.md#flash-and-check).

**The chapters.**

1. Before you begin (this page).
2. [What you need](build.md#what-you-need): machines, tools, disk and one thing to check first.
3. [Get the source](build.md#get-the-source): the pinned GrapheneOS tree.
4. [Add ObliviOS](build.md#add-oblivios): apply the patch packages and check the result.
5. [Vendor files for your device](build.md#vendor-files-for-your-device): the Pixel vendor modules.
6. [Build the prebuilt pieces](build.md#build-the-prebuilt-pieces): the binaries that are committed, and how each is rebuilt.
7. [Build the image](build.md#build-the-image): the build itself.
8. [Make it yours](build.md#make-it-yours): your keys, your update address, your patches, a rebase.
9. [Sign and package](build.md#sign-and-package): two stages, and why.
10. [Flash and check](build.md#flash-and-check): what to verify before you trust the result.
11. [Test](build.md#test): the checks that run without a phone, and the ones that need one.
12. [When something goes wrong](build.md#when-something-goes-wrong): symptom, cause, fix.
13. [What this guide does not cover](build.md#what-this-guide-does-not-cover): the limits, plainly.

**The labels in this guide.** Every command block has a line before it that says where it stands. `From` followed by a file means the command is in that published file. `Verified on` followed by a date means I ran it on that date and the [notes on the build guide](../architecture/site-engineering-notes.md) record the run. `Not run:` means it was read in a script or in a record and was not run for this guide; where a script of the build host made real images with that command, the text says so. A statement that carries a label such as `[measured: 2026-11-20]` says what it rests on: `measured` is something that was run and observed, `verified-in-source` is something read in the source or in a script, and `assumption` is something not checked. [Start here](start.md) explains the three labels.

Last verified: 2026-11-20. The sizes were read, and the times were read from the logs, on the build host on that date; no build was started for this guide.

## What you need

You need two machines and one phone, and a real amount of disk.

**A build machine.** A Linux machine with many cores, about 32 GB of memory and a lot of disk. I build on Debian 12 in a virtual machine with 8 vCPUs and 31 GB of memory. The volume that holds the trees needs room for the synchronised source, for one output directory per device (123 and 130 GB were measured) and for the ccache. A clean sync and a clean build were not run for this guide because the host had 39 GB free of 590 GB `[measured: 2026-11-20]`. The space a first build needs from nothing is the sum of the sizes in [Before you begin](build.md#before-you-begin) `[assumption: the sum of finished parts, not one run from nothing]`; start with at least 350 GB free for one device.

**A signing machine that never sees the network.** The signing keys must not live on the machine that builds. I use a small virtual machine with no route to the internet, 1.9 GB of memory, an encrypted volume that is mounted only while signing, and no swap on disk. The chapter [Sign and package](build.md#sign-and-package) says why each of those matters. You can start without it, but then you sign with keys that sit next to a build machine, and the [supply chain policy](../release/supply-chain-and-signing.md) says why the project refuses that.

**A workstation** with `adb` and `fastboot`. On Debian both are packages of their own and `fastboot` is not installed by default `[verified-in-source: engineering notes of the build, 2026-11]`.

**The tools on the build machine.** What was found on the build host, and what each is for:

Verified on 2026-11-20:

```
git --version
python3 --version
ccache --version | head -1
repo --version | head -3
ssh -V
curl --version | head -1
. <home>/.nvm/nvm.sh && node --version && yarn --version
```

The host had git 2.39.5, Python 3.11.2, ccache 4.7.5, the `repo` launcher 2.30, OpenSSH 9.2, curl 7.88.1, Node v24.18.1 and Yarn 1.22.22. Node comes through nvm, which a non-interactive shell does not load for you; the vendor tool needs it. `repo` prints that a newer launcher exists and that the launcher is not writable; both messages are harmless when it is installed by a package. `ssh-keygen` (part of OpenSSH) and `curl` are what the check of the signed tag needs. `rsync`, `unzip`, `zip` and `openssl` were present. `bc`, `xxd` and `jq` were not, and nothing in this guide needs them: a script that pipes a sum to `bc` prints an empty line there, so use `awk`. The tree brings its own JDK in `prebuilts/jdk`. The GrapheneOS build page says which other packages the tree needs. This guide does not copy that list because it changes between releases: see the [GrapheneOS build page](https://grapheneos.org/build).

**Free space in `/tmp`.** The vendor tool refuses to start with less than 150 MB free in `/tmp`, because a conversion step fails halfway with `failed to write resources.pb to archive` when `/tmp` is a small partition. On the build host `/tmp` is 241 MB `[measured: 2026-11-20]`. Check it before you start.

**A phone.** A Pixel 7a or a Pixel 10a with an unlockable bootloader. Unlocking and relocking are covered by the GrapheneOS install page, not here: see the [GrapheneOS install page](https://grapheneos.org/install/).

**Before every long job, check that nothing else is running.** Do not use `pgrep -f` for this: it matches the shell that you used to ask, so it always finds itself. This form works `[verified-in-source: engineering notes of the build]`, and run on the build host on 2026-11-20 it printed nothing:

Verified on 2026-11-20:

```
ps -eo pid,comm | grep -E " (siso|ninja|soong_build|soong_ui|emulator|qemu-system-x86|repo|adevtool)$"
df -h <build-volume> /tmp
free -g
```

Last verified: 2026-11-20 (tool versions, free space and processes read on the build host).

## Get the source

You start from a GrapheneOS release tag. ObliviOS pins one tag and copies its manifest, so every patch applies to a known base.

**1. Pick the tag.** The baselines are listed in the README of [oblivios-manifest](https://github.com/Beau4201/oblivios-manifest). The tag of the newest `lynx` build is `2026110200`, whose manifest commit is `abed042a17e948a9734e4c3927ce936b5648129f` `[verified-in-source: provenance record of the manifest repository]`. The last `stallion` build script in the project's records (candidate `2026101405`) was made on the tag `2026100600`, and the base of the installed `stallion` candidate `2026110503` is not recorded, so a `stallion` build on `2026110200` is not shown by any record. Whether a newer tag works is for you to find out with the rebase steps in [Make it yours](build.md#make-it-yours).

**2. Check the manifest against upstream before you trust it.** The tag is signed, and the copy in oblivios-manifest is byte for byte the `default.xml` of that tag. The README of oblivios-manifest has these commands. I ran them on a fresh clone:

Verified on 2026-11-20:

```
git clone https://github.com/GrapheneOS/platform_manifest.git && cd platform_manifest
curl -fsSLO https://grapheneos.org/allowed_signers
git config gpg.ssh.allowedSignersFile "$PWD/allowed_signers"
git tag -v 2026110200
git show 2026110200^{commit}:default.xml | cmp - /path/to/oblivios-manifest/manifest/upstream-2026110200.xml && echo identical
```

The clone took 3 seconds and 14 MB. `git tag -v` printed `Good "git" signature for contact@grapheneos.org with ED25519 key SHA256:AhgHif0m…2FwM`, `cmp` printed nothing and the last command printed `identical`. You trust the tag only as far as you trust the `allowed_signers` file you downloaded, so compare that key hash with the one on the [GrapheneOS pages](https://grapheneos.org/build) instead of taking it from this guide.

**3. Initialise.** `repo init` fetches only the manifest and the `repo` tool, not the source. I ran the same command as the sync script of the build host, for the same tag, in an empty directory:

Verified on 2026-11-20:

```
repo init -u https://github.com/GrapheneOS/platform_manifest.git -b refs/tags/2026110200 --partial-clone --clone-filter=blob:none --no-repo-verify -q
git -C .repo/manifests rev-parse HEAD
git -C .repo/manifests show HEAD:default.xml | sha256sum
```

It took 3 seconds and left 29 MB. It warns that the verification of the `repo` tool's own code is switched off, which `--no-repo-verify` asks for, and that a newer launcher exists; the manifest is trusted through the signed tag of step 2, not through that switch. The second command printed `abed042a17e948a9734e4c3927ce936b5648129f`, the commit of step 1, and the third printed the same hash as the copy in oblivios-manifest, `150ae4ac…04c2`. **Stop if the commit differs.** The sync script of the build host aborts with exit code 99 in that case, and so should you.

**4. Sync.** The sync fetches every project of the tree as a blobless clone and checks it out on a detached HEAD at the revision the manifest names. I ran the command on three small projects and then on `frameworks/base` and the Settings app:

Verified on 2026-11-20:

```
repo sync -d -c -j4 --no-tags --force-sync build/release system/sepolicy packages/apps/Updater
repo sync -d -c -j4 --no-tags --force-sync frameworks/base packages/apps/Settings
```

The first took 6 seconds for 81 MB. The second took 3 minutes 18 seconds and left 2.4 GB of git data and 1.9 GB of checked-out files, about 23 MB/s. Each project ended on a detached HEAD at the same commit that the build tree of the build host pins for the tag, so `git -C <project> rev-parse HEAD` is the revision the patches of the next chapter apply to. A move of an existing tree to a newer tag, where only the changed projects are fetched, took 1 minute 44 seconds in the log of 2026-11-05.

The whole tree is the same command without project names. It was not run for this guide, because the host cannot hold a second tree. At the speed above, the 157 GB of the whole tree would take about two hours `[assumption: extrapolated from one run, and your connection decides]`. The sync script of the build host refuses to start when less than 15 GB are free or when a build, a signing job or the vendor tool runs. For the generic steps (the `repo` tool, the packages, the disk) follow the GrapheneOS build page, which owns them: [GrapheneOS build page](https://grapheneos.org/build).

Not run:

```
repo sync -d -c -j4 --no-tags --force-sync
```

**Do not sync into a tree that has a build running.** A running build's graph is made once when it starts; a file that changes under it is missing from the result, with no error.

Last verified: 2026-11-20 (the signature check, `repo init` and the sync of five projects, in a scratch directory). The sync of the whole tree was not run.

## Add ObliviOS

ObliviOS is not a fork of the source tree. It is a set of patch packages, and a small amount of own source, that you add to the synced tree.

**How a package looks.** Each package of [oblivios-platform](https://github.com/Beau4201/oblivios-platform) has a `README.md`, a `SOURCE.md` that says which base it applies to and what each patch does, and `patches/<project>/NNNN-*.patch` files, one folder per upstream project, named after its path with `/` replaced by `-` (`frameworks-base`, `packages-apps-settings`). The package README tells you what it does and where it stands.

**The order matters, and it is not per package.** Several packages patch the same project. The method that rebuilt the build branch and was checked against it takes, for one project, the patches of all packages together, sorts them by their author date and applies them in that order. So you do this once per project, not once per package. `[verified-in-source: the check script of the build host, and engineering notes of the build]`

**The method, per project.** `git worktree add` makes a scratch copy of the project at the pinned revision, so the synced project stays as it is, and `git am` applies the patches in that copy. This is the form I ran on the projects of the last chapter, straight after their sync, where `HEAD` is the pinned revision:

Verified on 2026-11-20:

```
git -C <project> worktree add --detach <scratch>/wt HEAD
git -C <scratch>/wt am <the patches of that project, oldest author date first>
git -C <scratch>/wt rev-parse 'HEAD^{tree}'
```

`git am` applied plain in `build/release` (1 patch), `system/sepolicy` (18 patches) and `packages/apps/Settings` (19 patches), and the tree it made is the tree of the branch that the images of the build host are built from. `packages/apps/Updater` (1 patch) applied too, and its tree differs from the branch only by the update address, which is intended: the published patch holds a placeholder (see [Make it yours](build.md#make-it-yours)). In `frameworks/base` (68 patches) plain `git am` stopped on one patch, as it does on the build host, and `git am -C1` applied all 68: one hunk needs its context reduced. If `git am` stops, run `git am --abort` and run it again with `-C1` from a clean copy.

`git am` did not ask for a committer identity on the build host, which has none configured. Some machines refuse without one, with `unable to auto-detect email address`; if yours does, set `GIT_COMMITTER_NAME` and `GIT_COMMITTER_EMAIL` in the environment for that command, not in a configuration file. The patch files themselves are never edited; if one does not apply, you fix it by landing a new commit and exporting again ([CONTRIBUTING](https://github.com/Beau4201/oblivios-platform/blob/main/CONTRIBUTING.md)).

**What the check found.** On 2026-11-20 the published patches were applied in that way, project by project, and the tree was compared with the branch the images are built from. `git am` applied in every project tried, `frameworks/base` only with `-C1`. The tree equals the build branch in some projects and differs in others, `frameworks/base` among them even with `-C1`; which ones is listed in the [notes on the build guide](../architecture/site-engineering-notes.md). That list is what is missing from the published source. Until the packages are exported again, a build from them is not my image `[measured: 2026-11-20, fresh sync in a scratch directory, git am and tree comparison]`.

**The files that are not patches.** The apps, the prebuilt binaries and the data files of a package go into the tree as their own directory, `vendor/oblivios/<name>/`. On the build host that directory holds `airpods`, `compartments-data`, `datamap`, `exit` and `passwords` (and `guardian`, a leftover: the project removed Guardian from the sources in [ADR-240](../governance/decision-log.md), and the package check refuses it in an image, so do not copy one), and below them directories that carry the names of the package folders (`app`, `core`, `daemon`). The [exit package README](https://github.com/Beau4201/oblivios-platform/blob/main/privacy/exit/README.md) names the target of each of its folders. The published repository has no script that does the copying, so the exact copy for the other packages is `assumption`: you read each package README and match the names. Two package folders were compared file by file with the build host (the exit daemon and the Rust core of the Passwords vault): the files match except the prebuilt `exitd`, whose hash is not the one the build host installs, and the record and licence files, which the build host does not hold or holds in another version. Four more folders (the exit app, the Passwords app, the AirPods app and the AirPods core) have another folder hash than the build host and the cause was not read `[measured: 2026-11-20, file hashes, read-only]`. The next chapter says what that means.

**After `git am` on `vendor/adevtool`,** the build refuses to start, because a pin file stores the commit of `vendor/adevtool` and any new commit breaks it. [Vendor files for your device](build.md#vendor-files-for-your-device) fixes that in the same step as the vendor modules.

Last verified: 2026-11-20 (patch application and tree comparison on five projects, freshly synced in a scratch directory; the placement of the non-patch files read, not run).

## Vendor files for your device

A Pixel needs vendor files that Google ships and the source tree does not contain. GrapheneOS generates the vendor modules from the factory image with a tool called adevtool, in `vendor/adevtool`. You run it once per device after the patches are applied.

**Why after the patches.** The ObliviOS patches change the lists that decide what the tool puts in the generated modules (the memory patches take stock values out of them, the privacy packages add packages). A module generated before the patches is a module without those changes.

**Before you start.** Check the three things the script of the build host checks, in this order `[verified-in-source: the generate script of the build host]`:

1. `/tmp` has at least 150 MB free (the tool stops otherwise, with the `resources.pb` error).
2. The volume has at least 20 GB free for one device. The host tools take about 16 GB and the factory images and their unpacked form about 16 GB for two devices, so run one device after the other when the volume is tight.
3. The tool's own dependencies are installed once: `yarn install --frozen-lockfile --cwd vendor/adevtool`, with `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` for a non-interactive run.

**Keep what was there.** The generated modules carry hand-kept differences, and the only check that they survived is a diff against the previous output. Copy `vendor/google_devices/lynx` and `vendor/google_devices/stallion` aside before you run the tool, outside the tree.

**Run it, one device at a time.** `-d` names the device and `-k` keeps the unpacked images of the devices you name, deleting those of every other device after success.

Not run:

```
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
export ALLOW_MISSING_DEPENDENCIES=true
yarn install --frozen-lockfile --cwd vendor/adevtool
node vendor/adevtool/bin/run generate-all -d lynx -k stallion -v --noVerify
```

I did not run the generation itself, because it needs about 20 GB the host did not have. I ran the help of the tool, which starts in 3 seconds and writes nothing:

Verified on 2026-11-20:

```
node vendor/adevtool/bin/run generate-all --help
```

It lists `-d`, `-k`, `-v` and `--noVerify` with the meaning used here. The logs of the build host give the time of real runs: the first device took 28 minutes on 2026-10-14 and the second one 2 minutes 38 seconds, because the host tools and the image cache already existed. A run that failed at its first step stopped after 4 minutes.

Use `-d stallion` for the other device. Two flags need an explanation, because both look like shortcuts and are not.

- `ALLOW_MISSING_DEPENDENCIES=true` is for this run only. The tool builds its host tools for a product that has no arm64 libraries, and the Passwords app names one, so the analysis stops with `depends on disabled module` unless missing dependencies are allowed. The host tools do not need the app. Do not export it for the image build.
- `--noVerify` is needed because the module differs from upstream's file tree by design: the two memory patches exclude two entries. Without it the tool deletes the module when the comparison differs. It then writes `$(warning` where upstream has `$(error` into `adevtool-version-check.mk`. **Put `$(error` back by hand**, or a stale pin stops failing the build.

**The pin.** `vendor/google_devices/<device>/adevtool-version-check.mk` stores the commit of `vendor/adevtool` and errors the build if it differs, so any new commit there, yours included, breaks the build within a second. The generate step rewrites it. Where you changed nothing but the commit, you can edit the one line by hand and keep the old file beside it, outside `res/` (see [When something goes wrong](build.md#when-something-goes-wrong)). The file reads `ifneq ($(shell git -C vendor/adevtool rev-parse HEAD),<commit>)`, and the next line is the `$(error ...)` `[verified-in-source: the file of the build host, read on 2026-11-20]`.

**Stop and read when:** the tool deletes the module, or the diff against the old output shows more than the entries you expect. Both mean a patch did not apply as you thought.

`lynx` and `stallion` differ here in one place only: you generate each with its own `-d`, and the vendor script of `stallion` sets the zram size after the properties, which is why `stallion` has the third memory patch.

Last verified: 2026-11-20 (the generate script of the build host read and the help of the tool run; the generation was not run, because it needs free space the host did not have).

## Build the prebuilt pieces

Some files of oblivios-platform are committed as binaries, because the Android build does not build them: the AirPods codec jar, the Rust core of the Passwords vault, the exit daemon and the offline map data. Each has a record with its source, toolchain, build command and SHA-256. You do not have to rebuild them to build an image. You do have to decide whether to trust them, and this chapter tells you what is known.

**Rebuilding is its own job.** The Rust ones need the AOSP Rust toolchain on a build server, the Java one needs only a JDK. Each [module page](../modules/vault-core.md) says exactly how it is built and what was run: [vault-core](../modules/vault-core.md), [exit-daemon](../modules/exit-daemon.md) and [airpods-core](../modules/airpods-core.md). The offline map data has its own record in the `datamap` package.

**Checking a binary against its record.** `privacy/exit/daemon/check-prebuilt.sh` and `passwords/core/check-prebuilt.sh` compare a binary with its recorded hash; the bill of materials on oblivios.dev ([Verify](https://oblivios.dev/verify)) says what was and was not reproduced.

**A difference that was found.** The `exitd` committed in oblivios-platform has a different SHA-256 from the `exitd` that is installed on the build host and that the build script of that host checks (`d5dca624…` against `ddf5ddd4…`). The cause is not established. It is the same kind of difference as in the patch chapter: what is published is not what I build `[measured: 2026-11-20, file hashes, read-only]`. If you need my exit daemon, you need the source commit named in the record of `oblivios-services`, built on a build server, and a comparison of the hash you get with the one in the record; that rebuild was not run for this guide.

**What the image build checks.** The script `tools/build/check-required-packages.sh` of oblivios-docs fails when a binary is too small to be the real one: the daemon must be an ELF file of at least 5 MB, the address data about 48 MB, the place data about 2 MB and 12 MB. It lists the packages of this project's images, so read it and adapt the list to yours. [Build the image](build.md#build-the-image) gives the same checks in plain words.

Last verified: 2026-11-20 (hashes of one package compared; no binary was rebuilt for this guide).

## Build the image

This is the step everyone thinks of first. It is mostly waiting, and it is where most of the quiet mistakes happen, so the order below is what matters.

**Export everything in the same block that starts the build.** A non-interactive `ssh host '...'` never reads `<home>/.bashrc`. Two builds of this project ran without ccache for that reason and one ran without the Updater app for another. The variables below come before `source build/envsetup.sh`, in the same command, and `OUT_DIR` comes first of all: exported afterwards, `lunch` silently falls back to a plain `out/` `[verified-in-source: the build scripts of the build host, and engineering notes of the build]`.

- `OFFICIAL_BUILD=true`. Without it the Updater app is not in `PRODUCT_PACKAGES`. Nothing warns you, the build ends with `build completed successfully` and the app is missing.
- `USE_CCACHE=1`, `CCACHE_EXEC` pointing at your ccache, and a `CCACHE_DIR` of your choice. ccache helps only C and C++ steps, and the first build fills it and gains nothing.
- `BUILD_NUMBER`, `BUILD_DATETIME` and `USE_FIXED_TIMESTAMP_IMG_FILES=true`. Leave these out and the build reports success while it bakes wall-clock times into every image, so no later rebuild can match it byte for byte. A single targeted partition build must re-export the same three.

**The build, for `lynx`.** Run it detached with `nohup`, so that a dropped connection does not take it with it, and read the log, not your terminal. Do not use `set -u` in the script: `envsetup` breaks under it.

Not run:

```
export OUT_DIR=out-lynx
export OFFICIAL_BUILD=true USE_CCACHE=1 CCACHE_EXEC=$(command -v ccache) CCACHE_DIR=<your-ccache-dir>
export USE_FIXED_TIMESTAMP_IMG_FILES=true BUILD_NUMBER=<your-build-number> BUILD_DATETIME=$(date +%s)
source build/envsetup.sh
lunch lynx-cur-userdebug
m -j6 -k
```

**For `stallion`.** The target is `stallion-cur-user`, the output directory is its own, and a signable candidate also needs the target-files and the host tools, which the signing stage reads.

Not run:

```
export OUT_DIR=out-stallion
export OFFICIAL_BUILD=true USE_CCACHE=1 CCACHE_EXEC=$(command -v ccache) CCACHE_DIR=<your-ccache-dir>
export USE_FIXED_TIMESTAMP_IMG_FILES=true BUILD_NUMBER=<your-build-number> BUILD_DATETIME=$(date +%s)
source build/envsetup.sh
lunch stallion-cur-user
m -j6 -k && m target-files-package otatools-package
```

`lynx-userdebug` is not a valid target: the real one is `lynx-cur-userdebug`. The script of the build host for `stallion` does not export `USE_FIXED_TIMESTAMP_IMG_FILES`; the notes say that omitting it makes an image unreproducible, so both blocks above export it. Reproducing a `stallion` build is deferred in the project's own records ([ADR-112](../governance/decision-log.md)) and was not tried.

**`-k` keeps going after a failure.** The failure shows only at the end of a long run. A real example: a rename changed the sort order of a constant in a generated API listing and the build failed at 99% with `You have tried to change the API from what has been previously approved`, two hours in. If you patch a name, `grep` the listing files in `core/api` and `api` for it first.

**Do not trust a clean exit.** A build that exits 0 says nothing about what is in it. After every real build check the product's own `installed-files*.txt` for the packages that must be there, and that debug-only packages are not in a `user` build. The script `tools/build/check-required-packages.sh` of oblivios-docs does this for the images of this project, with a list of names that you replace by yours. The same checks in plain commands, which I ran on the two finished outputs of the build host:

Verified on 2026-11-20:

```
grep -h -E '/(Updater|Seedvault|Auditor|PdfViewerGOS|PasswordsApp|ExitApp|DataMapApp|AirPodsApp)\.apk$' <product-out-dir>/installed-files*.txt
grep -h -E '/(libvault_core\.so|exitd|exit\.rc)$' <product-out-dir>/installed-files*.txt
ls -l <product-out-dir>/system/bin/exitd <product-out-dir>/system/etc/datamap/ipmap.bin
```

On the `lynx` output (`userdebug`, build `2026111501`) and on the `stallion` output (`user`, build `2026110503`) the first command printed eight lines, one for each app, and the second four: `libvault_core.so` twice, `exitd` and `exit.rc`. Count the hits and read the lines. A hit only under `obj/PACKAGING/` does not count; there were none. The files had their real size: `exitd` 19 MB and `ipmap.bin` 48 MB (47,943,083 bytes). A name proves a module was built, not what it holds. The `userdebug` output holds four debug-only packages and the `user` output none, which is what each build type should do.

**A check with a list of names breaks when the names change.** The older copy of that script on the build host reported eight files missing on the `stallion` output of 2026-11-05, although the image was fine: the packages were renamed from `org.freeholdos` to `org.oblivios` after that build, so the file names in the list no longer matched the image. When a check fails on an old output, compare the names with the date of the output before you doubt the image.

**The Updater URL.** The published patch of `release/ota-server-url` carries the placeholder host `https://ota.example.invalid/`. An image that still has it cannot update, and the published check script refuses it. Put your own address in before you build; [Make it yours](build.md#make-it-yours) shows how.

**Do not land a patch while a build runs.** The graph is made once; a file added mid-build is absent from the result and the build still reports success.

Last verified: 2026-11-20 (the build scripts of the build host read, and the checks run on its two finished outputs; no build was started, since a clean build does not fit in the free space of the host). The scripts themselves made the images of this project: their logs show 37 builds of `lynx` between 2026-10-11 and 2026-11-15, 34 of them ending with exit code 0, and 9 builds of `stallion`.

## Run it in the emulator

To see an image boot you do not need a phone. The emulator target builds the same tree for x86_64 and boots on any machine with KVM. It has an output directory of its own, so keep `OUT_DIR` apart from the `lynx` and `stallion` ones.

Verified on 2026-11-24:

```
export OUT_DIR=out-emulator
export ALLOW_MISSING_DEPENDENCIES=true
source build/envsetup.sh
lunch sdk_phone64_x86_64-cur-userdebug
m -j8
```

`ALLOW_MISSING_DEPENDENCIES=true` is for this target only. The Passwords app names a library that exists for arm64 and is disabled for x86_64; without the variable Soong stops in analysis with `depends on disabled module "libvault_core"`, and the emulator image does not install the app. Never export it for a device build, where it would hide a dependency that is really missing. `OFFICIAL_BUILD` is a rule for device images and the emulator target does not need it.

The first build took 4 h 59 min with 8 jobs on a laptop with 15 GB of RAM and 48.9 GB of swap. It ran about 156,800 steps, the output directory grew to 117 GB and the source tree it ran in is 159 GB. Analysing a cold tree eats memory and swap (see [When something goes wrong](build.md#when-something-goes-wrong)), so put a guard on swap use and on free disk space before you start, and keep a laptop on its charger.

Start it from the same shell, after `lunch`; the emulator comes with the tree and took its images from `out-emulator`.

Verified on 2026-11-24:

```
EMU=prebuilts/android-emulator/linux-x86_64
export LD_LIBRARY_PATH=$EMU/lib64/qt/lib QT_QPA_PLATFORM=xcb
$EMU/emulator -no-window -no-audio -no-boot-anim -no-snapshot -no-metrics -writable-system -gpu host -memory 4096 -cores 6
```

`-no-snapshot` keeps an old quick-boot snapshot from hanging a boot on a new image. `-no-metrics` turns off the usage-data question the emulator asks otherwise, which a project with no telemetry answers no. `-gpu host` used the laptop GPU (an Intel Iris Xe); `-gpu swiftshader_indirect` is the software fallback and was not tried. Take `-no-window` out to get a window: under Wayland it came up through XWayland with the two variables exported above, and the launcher drew 725 frames under 12 swipes of `adb input` with a median of 16 ms.

The first start printed `Boot completed in 24517 ms`, the second `12935 ms`. `adb devices` listed `emulator-5554 device`, `ro.build.type` was `userdebug` with `test-keys`, `getenforce` said `Enforcing`, the launcher held the focus and logcat held no `FATAL EXCEPTION`. The emulator reported `androidboot.verifiedbootstate=orange`: this is a test-key image, so nothing here tests signing or verified boot. Stop the emulator with `adb emu kill` and read that its process is gone, because a forgotten one keeps burning CPU.

Last verified: 2026-11-24 (the build, a headless boot and a boot with a window, run on a laptop). Not tried: a boot from a second build, and any measure of a person using the window.

## Make it yours

If you only want to see an image boot, skip this chapter. If you want to keep one, do not ship someone else's keys, address or name.

**Your own signing keys.** Each device has its own key set, in the vault of the signing machine, and the keys of a device never leave it. How to generate the key set is on the GrapheneOS pages `[assumption: no record of this repository gives the key-generation commands]`. What the project's own records say is where the keys may live and who may use them: the [supply chain policy](../release/supply-chain-and-signing.md) keeps a separate key set per channel, never on a build machine, and a per-device set in an encrypted vault for a phone that one person owns.

**Your own update address.** The Updater app takes its server from `packages/apps/Updater/res/values/config.xml`. The published patch puts the placeholder `https://ota.example.invalid/` there on purpose: the real address of my server is not published. Keep your address in a file that is never committed, and let a small script put it into the tree after the patches. My script for this is a short shell script that is not published. I ran it on a scratch copy of the Updater configuration on 2026-11-20 `[measured: 2026-11-20, scratch copy]`, and this is what it does:

- It reads the one variable `OTA_URL=https://<host>/` from the file by pattern and never `source`s it.
- It refuses anything that is not `https://host/`, the placeholder, an `.invalid` host and the upstream default. Each of those, and a missing file, ended with exit code 1 and a message.
- It leaves a tree alone that already holds your address (`Updater already points at ...`), replaces the placeholder where it finds it (`Updater now points at ...`), and stops with an error if the file holds neither, so a changed upstream default is noticed and not overwritten. With the first address in the file, a second, different address was refused.

You also need a server for the update files. The server of the project is not published, so how to run one is out of scope here.

**Your own patch package.** The rules are in [CONTRIBUTING](https://github.com/Beau4201/oblivios-platform/blob/main/CONTRIBUTING.md); these steps add what the project learned the hard way.

1. Author the change in a disposable local repository that holds only the touched upstream files. Keep the branch named `baseline` at its root commit and work on a different branch, or `git format-patch` exports nothing.
2. Land it on your build branch with `git am`, not with an edit in the tree, and never while a build runs.
3. Export it again with `git format-patch` from the landed history. `git am` makes a different commit hash than your disposable repository did, so the hash you cite is the one you read back on the real branch.
4. Write the `SOURCE.md`: the base, one row per patch with what it does and why it differs from upstream, how you checked it and what you did not check.
5. Prove the package: apply it onto a fresh checkout of the base and compare the tree with your branch. An empty difference is the proof; a patch you cannot reproduce is not a package.

**Move to a newer upstream tag.** Do it in the order the project did, and do not touch the tree before step 3 `[verified-in-source: the rebase script of the build host and engineering notes of the build]`.

1. Sync the new tag next to your branch. Every project is on a detached HEAD at the new revision.
2. Check for conflicts first: per project, `git merge-tree --write-tree --name-only <old branch> <new revision>` merges the whole branch at once and lists the conflicting files.
3. Apply your packages in author-date order on the new revision in a detached work tree and compare `HEAD^{tree}` with what the merge produced. A project that differs or does not apply is resolved in a disposable repository, the package patch is refreshed, and you check again.
4. Create the new branch only for projects that pass. A branch that exists is never touched.
5. Generate the vendor modules again, and compare them with a copy of the old ones. The adevtool pin and, when a name changed, the sort order of the API listings are the two things that break next.

I ran the form of step 2 in a scratch clone of two projects, with an older upstream tag standing in for the new revision, because the new tag was already merged:

Verified on 2026-11-20:

```
git merge-tree --write-tree --name-only <old branch> <new revision>
```

In `system/sepolicy` it printed one tree id and ended with exit code 0, a clean merge. In `build/release` it printed a tree id, the name of one conflicting file (`RELEASE_PLATFORM_SECURITY_PATCH.textproto`) and a `CONFLICT` message, and ended with exit code 1. A conflict is therefore in the output and in the exit code. The command changes no branch and no file of the tree, but it adds objects to the repository, so run it in a scratch clone as I did.

Last verified: 2026-11-20 (the update-address script run on a scratch copy; the rebase script read and not run).

## Sign and package

The build machine makes unsigned files. A different machine signs them. That split is the single most important rule of this chapter, and it is the part this guide cannot show you a script for, because the signing scripts of the project are not published.

**Two stages.**

1. On the build machine, build the target-files and the host tools for the device (`m target-files-package otatools-package`, as in [Build the image](build.md#build-the-image)). Hash them there.
2. Move them to the signing machine, hash them there, and stop if the two hashes differ. The signing machine has no network. On it, `sign_target_files_apks` replaces the test-key signatures with your release key, `ota_from_target_files` makes the update package, `img_from_target_files` makes the flashable images, and the GrapheneOS release script makes the factory image `[verified-in-source: engineering notes of the build, which confirm this order against the upstream release script]`.

**Why not sign on the build machine.** AVB signing alone, done directly on the raw build output, does not change the release signature. Every `lynx` flash of this project before the two-stage signing trusted the public AOSP test key for updates, and it was found only when a real update failed with `signature doesn't match any trusted key`. Do not set the signing key on the build machine to avoid that: it would give the build machine the key.

**What the signing machine must refuse.** My signing scripts refuse to run unless the encrypted volume is really mounted (an unmounted directory at the same path once held a full plaintext key set, written while the mount had silently failed) and unless no swap on disk is active, because tmpfs pages that hold decrypted keys can be written to an unencrypted swap device under memory pressure. RAM-backed zram swap is allowed and was needed: a signing step crashed with no swap at all. Give the machine more RAM before you add swap on disk.

**What to check on the result, because the tools do not.** `avbtool verify_image` only checks that the files agree with each other. It cannot see the rollback counter in the phone, and it passes images that the phone will reject. These came from real incidents `[verified-in-source: engineering notes of the build]`.

- Read `info_image` of the signed `vbmeta` and compare its rollback index with the original. Leaving `--rollback_index` out of `make_vbmeta_image` silently sets 0.
- Pass `--partition_name` and `--hash_algorithm` explicitly to `add_hashtree_footer`. The defaults are a blank name, which silently drops descriptors, and `sha1`. Compare `info_image` against a reference.
- Do not pass the same properties twice: `--include_descriptors_from_image` already imports them.
- `fec` needs its two shared libraries as well as the binary. A missing `fec` corrupts the image in place before it reports failure, so rebuild the partition and never retry on the same file.
- Run `verify_image` in a directory that holds the full set of correctly named partition images, as links, and nothing else. A stale `system.img` next to it is picked up without a warning and the command then runs for a quarter of an hour at full CPU.
- Verify with a PEM key. The binary `.avbpubkey` struct fails with an unrelated `ML-DSA` message, and so does a closed vault. Check the vault first.
- The key hash that AVB uses is the SHA-1 of the extracted public key struct, not of the DER form `openssl` prints. The two look like a mismatch and are not.

Not run:

```
avbtool info_image --image vbmeta.img
avbtool extract_public_key --key <your-avb-key> --output /dev/stdout | sha1sum
avbtool verify_image --image vbmeta.img --key <your-avb-key>
```

**The tool is in your own build output.** The tree builds its own `avbtool` as a compiled executable at `<out-dir>/host/linux-x86/bin/avbtool`. Run it directly: `python3 avbtool` fails with `bad magic number`. I ran it on the `vbmeta.img` of the unsigned `lynx` build output:

Verified on 2026-11-20:

```
<out-dir>/host/linux-x86/bin/avbtool info_image --image <product-out-dir>/vbmeta.img
```

It printed `Algorithm: SHA256_RSA4096`, `Rollback Index: 1793491200` and the public key hash `2597c218…`, which is the public AOSP test key `[verified-in-source: the signing records of the build host]`. An image straight from the build is signed with a key that everyone has, and that is why the signing stage exists.

**Re-sign all or none.** If you re-sign only some partitions with a new key, the package manager can still reject the others: every APK of a shared user ID must carry the same certificate, even across partitions. The result is a boot that looks like a hang while `system_server` restarts, and only `adb logcat` shows it. Either re-sign every partition that contributes to the shared users or build and sign one candidate that is consistent from end to end.

**Sign what was built, not what you remember.** Take the descriptors of unchanged partitions from what is flashed on the phone now, not from the best documented earlier candidate. A full build without the reproducibility variables changes every partition, including those whose source did not change.

**A key change resets the data of the Updater app.** It is a system app with its own preferences, and a new certificate resets them. Expect the update channel setting to come back unset.

Last verified: 2026-11-20 (the notes of the signing work read, and `avbtool` run read-only on a build output; nothing was signed for this guide, and no key material was touched).

## Flash and check

You have a signed factory image directory. Before you flash it, check that it is the one you think it is.

**Check the set.** The files of a set must be complete. A copy of a `lynx` image once lacked `fastboot-info.txt`: `flashall` then falls back to an older task list, which is the path that skipped the `update-super` step in an early boot loop. Compare the file list and the hash of `fastboot-info.txt` with the build output, and check every file against its recorded hash.

Verified on 2026-11-20:

```
sha256sum -c remote.sha256
```

I made the list for two files of the `lynx` output and checked it: both printed `OK`. After I appended one byte to one of them, that file printed `FAILED` and the command ended with exit code 1. Make the list on the machine where the files were built, with `sha256sum` and the file names, and check it where the flash set lives.

**Flash from fastbootd, not from the bootloader.** The partitions that live inside `super` (`system`, `vendor`, `product`, `system_ext` and the others) fail to flash in plain bootloader mode with `Invalid command resize-logical-partition`. That failure happens before any write, so trying again in the right mode is safe. The form the project settled on, for an update, is two steps. The variable is `ANDROID_PRODUCT_OUT`, not an argument, and the `cd` and the flash stay in one block.

Not run:

```
adb reboot fastboot
cd <flashset> && pwd && ANDROID_PRODUCT_OUT=$PWD fastboot flashall
```

`-w` wipes the user data. It belongs to a first install only, never to an update; an update flash once was handed over with it by mistake.

**Flash only what changed, if you know it.** If only some partitions changed between two candidates, those plus `vbmeta` are enough, because an unchanged partition has the same bytes and the same hash as before. Know it, do not assume it.

**Teardown before the final flash.** If you used the writable remount for debugging, its overlay keeps shadowing reads after a reflash. Run `adb enable-verity` and reboot before the final flash and confirm in `/proc/mounts` that you see a real block device and not `overlay`.

**What to check on the phone before you trust it.**

- The bootloader state and the boot colour match what you meant: my `stallion` reads `yellow` and `locked`. Relock only after the release key is validated.
- The build properties: read `ro.build.version.incremental` from `/system/build.prop`, not from the update app, which reports success when the package is written to the other slot but the phone has not rebooted into it.
- The packages: `pm list packages` for the ones that must be there, and that no debug-only package is on a `user` build.
- After a reboot the app data can look missing: that is encrypted storage before the first unlock, not data loss. `ls /data/data | wc -l` still shows the total.
- A crash count in the dropbox is not a verdict. Read the entry.

Last verified: 2026-11-20 (the flashing notes and the validation rules read, and the hash-list check run on two files; no phone was flashed for this guide, so the steps on the phone are `verified-in-source` and none of them is `measured`).

## Test

There is no single test button. There are checks that need a computer and checks that need the phone.

**On a computer, without a phone.**

- Several packages carry host checks. A Java one needs only a JDK, a C++ one needs a source tree. For example `privacy/compartments-profiles/system-server/test/run.sh` prints one `ok N checks` line per test class `[verified-in-source: README of oblivios-platform]`.
- The Java modules of oblivios-services use Gradle and a Java 21 toolchain. The one command the airpods-core page shows is `./gradlew :airpods-core:test`, run from the root of `oblivios-services`; the page says it was not run on a clean machine.
- Rust is built on the build server only (`vault-core` and `exit-daemon`); the [module pages](../modules/vault-core.md) say how.
- Before an expensive build, run the cheap checks first: compile pure C++ alone with `g++ -std=c++17 -Wall -Wextra -Werror` against a stand-in for its one dependency, and for Java a parse-only `javac` pass (prove first that it flags a deliberate error). They do not replace the build, they remove the failures that cost an hour to find.

**On the phone.** A change that compiled is not a change that works; the project's own rule is that a build is not verified until it ran on a phone. The device checks are rows of a validation matrix that is not published; a page such as the [Duress notes](../architecture/duress-engineering-notes.md) says what was run on a device and what was not. Do not automate unlocking.

**A check that cannot fail checks nothing.** Before you rely on a gate, make it fail on purpose once.

Last verified: 2026-11-20 (the checks named were read in the repositories and notes; none was run for this guide).

## When something goes wrong

Each entry is a symptom, then the cause, then the fix. All come from real incidents of this project `[verified-in-source: engineering notes of the build]`.

| Symptom | Cause | Fix |
| --- | --- | --- |
| `lunch` does not know `lynx-userdebug` | Not a valid combination | `lynx-cur-userdebug`, or `stallion-cur-user` |
| The build fails within a second naming the adevtool pin | A new commit in `vendor/adevtool` changed the pinned hash | Edit the pin line in `adevtool-version-check.mk` of the device, or regenerate the module |
| A stale pin no longer fails the build | `--noVerify` wrote `$(warning` for `$(error` | Put `$(error` back by hand |
| Vendor tool: `failed to write resources.pb to archive` | `/tmp` is a small partition and is full | Free at least 150 MB in `/tmp` before the run |
| Vendor tool: `depends on disabled module` | The host-tool product has no arm64 libraries | `ALLOW_MISSING_DEPENDENCIES=true` for that run only |
| Emulator build: `depends on disabled module "libvault_core"` | The Passwords app needs a library that is arm64 only and disabled for x86_64 | `ALLOW_MISSING_DEPENDENCIES=true` for the emulator target only, never for a device build |
| `error: invalid file path '...values.xml.pre-cap48'` | A backup file inside an overlay's `res/` is compiled as a resource | Keep backups outside `res/` |
| A default changed in `frameworks/base` has no effect | The Pixel vendor overlay overrides the framework value of the same resource | Change the overlay value |
| Build ends 0, an app is missing | `OFFICIAL_BUILD=true` was not exported | Export it, and read `installed-files*.txt` |
| ccache stays empty | A non-interactive shell never read `<home>/.bashrc` | Export the ccache variables in the same block as the build |
| `lunch` prints a plain `out/` | `OUT_DIR` was exported after `envsetup` | Export it first and read the printed `OUT_DIR=` |
| `check_current_api` fails at 99% | A rename changed the sort order of an API listing | Swap the lines in `core/api/system-current.txt`; `DISABLE_STUB_VALIDATION` is not a fix |
| `git am` fails on `frameworks/base` | One hunk's context moved | Run it again with `-C1` |
| `git am` stops with `unable to auto-detect email address` | The machine has no usable identity (the build host did not need one, so this was not reproduced there) | Set `GIT_COMMITTER_NAME` and `GIT_COMMITTER_EMAIL` for that one command |
| Soong analysis eats all memory and swap | A cold tree is analysed again after new source files | Nothing else on the host; a guard that stops the build above a swap limit beats polling |
| Disk full in the middle of a build | Output directories are very large | A disk watchdog, started detached on the remote side as its own command, so a dropped link does not orphan it |
| `rm` of extracted vendor files: `Permission denied` | The tool preserved read-only modes | `chmod -R u+w` first, then remove; no `sudo` |
| `avbtool` fails with `ML-DSA is not supported` | The encrypted vault is not open | Open it and check the mount first |
| `No such file or directory: 'fec'` | The host tool is not on the signing machine | Copy `fec` and its two libraries, set `PATH` and `LD_LIBRARY_PATH`, rebuild the partition |
| `fastboot` says `Invalid command resize-logical-partition` | You are in the bootloader, not in fastbootd | `fastboot reboot fastboot`, then flash |
| The phone shows the red `corrupt` screen after a flash that said `OKAY` | A rollback index below the phone's counter, or descriptors from a different partition set | Read the live state of the phone, not a file copy of it; re-sign |
| The phone hangs on the splash screen and `adb` still works | A signature mismatch across partitions | `adb logcat` shows `Signature mismatch on system package`; re-sign every partition that shares the user |
| The Updater says it failed to check for updates after a key change | Its data was reset and it asks for a channel your server does not publish | Publish that metadata file or set the channel |
| `python3 avbtool` fails with `bad magic number` | The `avbtool` of your build output is a compiled executable, not a Python script | Run `<out-dir>/host/linux-x86/bin/avbtool` directly |
| The build fails in about 12 seconds and Soong names a module that is defined twice | A rollback copy of a vendor directory, or a directory under an old name, sits inside the tree | Keep copies outside the tree |
| The package check lists files as missing on an old output | The packages were renamed after that build and the list holds the new names | Compare the names in the list with the date of the output |
| `repo` says the launcher is not writable or that a newer one exists | The launcher was installed by a package | Nothing; it is harmless |
| A count in a script prints an empty line | The host has no `bc` | Use `awk` for sums |

Last verified: 2026-11-20 (each entry read in the notes; none was reproduced for this guide).

## What this guide does not cover

A guide that hides its gaps costs you a weekend, so here they are.

- **No full sync, no device build, no signing and no flash was run for this guide.** The one build that ran is the emulator target of [Run it in the emulator](build.md#run-it-in-the-emulator), in a copy of the tree on a laptop. The build host had 39 GB free of 590 GB, and a source tree with one output directory is about 300 GB. What was run, in a scratch directory and read-only on the live tree: the check of the signed tag and the manifest, `repo init`, the sync of five projects, the patch method on five projects, the update-address script, the checks of the two finished outputs, `avbtool` on a `vbmeta.img`, the help of the vendor tool, the conflict check of a rebase and a hash list. The build itself rests on scripts that made the images of this project in 46 builds; they were read and not run again. When I free the disk, the chapters that become `measured` change their label.
- **Nothing was signed and nothing was flashed for this guide.** The signing chapter has only the read-only `avbtool` run behind it, and the flashing chapter only the hash list. You flashing a phone with it is what would make a step `measured`.
- **The published source is not my source** in the places named in [Before you begin](build.md#before-you-begin), and one prebuilt binary differs. The list is in the [notes on the build guide](../architecture/site-engineering-notes.md).
- **The signing scripts, the update server and the build scripts are not published.** This guide describes what they do and what they refuse, and gives no script that cannot be shown.
- **The generic steps are not copied.** Setting up a build machine, the `repo` tool, unlocking and relocking a bootloader, and generating a key set are on the GrapheneOS pages, so they cannot drift here: [build](https://grapheneos.org/build) and [install](https://grapheneos.org/install/).
- **Reproducibility is not claimed.** An identical hash from two builds was not shown for my images. The record says what was found: a different output directory name leaks into the build, and a missing timestamp variable on one side makes a build impossible to reproduce.
- **The websites and the documents are not here.** The two sites are Astro applications in `site/` of the repository that holds the documents; its site README says how to build them. The documents are authored in a private repository and copied to oblivios-docs by a script, so do not edit the files there: the next snapshot overwrites them, and a correction goes in an issue ([CONTRIBUTING](https://github.com/Beau4201/oblivios-docs/blob/main/CONTRIBUTING.md)).
- **No device is supported**, and a build that boots is not a supported device ([device support policy](../devices/support-policy.md)).
- **No binary is offered.** The stage of the project does not change.

If a step here is wrong for you, open an issue that names the chapter and the step, as [CONTRIBUTING](https://github.com/Beau4201/oblivios-docs/blob/main/CONTRIBUTING.md) describes. [Start here](start.md) explains what is where, and how to check the claims of the project.
