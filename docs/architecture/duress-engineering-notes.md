# Duress Unlock Engineering Notes


## Purpose and status

Durable AOSP/SystemUI framework mechanics learned from real hardware and
emulator work on Duress Unlock — distinct from
`docs/security/threat-model.md` (the requirements) and
`docs/governance/decision-log.md` (accepted decisions). This doc is where
"how the OS actually behaves toward a non-current or backgrounded user,
discovered the hard way" lives, so the next person touching a
multi-user-aware surface doesn't have to re-derive it from source. Add to it
whenever a future session finds another real-hardware-only or
emulator-only OS behavior of this kind.

## Telecom routes calls to the foreground user, not the SIM owner

Android's Telecom framework routes a managed incoming call's notification
and UI to the *current foreground user*, not the SIM-owning user, in a
multi-user configuration — confirmed via a real `adb emu gsm call` test
where a call registered to user 0's `PhoneAccount` posted its `CallStyle`
notification under the active (different) user instead. A telecom-managed
call can therefore never itself land on a backgrounded user to begin with;
only a self-managed (VoIP-style) call could target one, and testing that
requires writing new test code, not shell commands (ADR-058).

## SystemUI's own floating windows render under user 0, not the current user

SystemUI's floating windows (dialogs, the power menu) render under **user
0's** window/Binder context regardless of which user is actually current —
confirmed via `dumpsys window`'s `mCurrentFocus` on real hardware
(`Window{... u0 Select user}` while `mFocusedApp` correctly showed a
different current user's launcher). Any decoy-aware / identity-filtering
logic that keys off `UserHandle.getCallingUserId()` will silently never
apply to these surfaces; key off the device's actual current user
(`UserManagerService`'s own `getCurrentUserId()`) instead. A previously
"hardware-confirmed" fix for one such surface (the QS user-switcher dialog,
ADR-060/063) turned out to have never actually worked because of exactly
this gap (ADR-066) — a passing hardware test for one SystemUI-hosted dialog
does not generalize to every other one; check each surface's own window
ownership, don't assume from a sibling's result.

## Synthetic taps are unreliable against this build's Compose-based SystemUI in a headless emulator

`adb input tap`/`touchscreen swipe` against this build's Compose-based
SystemUI QS panel proved unreliable in a headless (`-no-window`) emulator
session: correct element bounds/resource-ids confirmed via `uiautomator
dump`, taps landed on the right coordinates, yet no resulting dialog opened
— reproduced on two different buttons, ruling out a single-element fluke.
`screencap`/`exec-out screencap` also returned solid-black images throughout
the same session despite `dumpsys power`/`dumpsys display` reporting the
display genuinely `ON`/`Awake`. Root cause not identified.

`uiautomator dump`'s XML view-hierarchy dump remained reliable for reading
on-screen text/state throughout this same session (it caught the real PIN
bouncer and its exact button bounds when `screencap` could not show them)
and is the fallback to reach for first the moment `screencap` output looks
suspiciously uniform, before spending further tool calls retrying taps
against a screen you can't actually see. Treat compile-time build
verification as sufficient for a fix's correctness in this kind of
environment, and defer real dynamic re-validation to physical hardware or a
differently-configured emulator, rather than burning many tool calls
chasing an unreliable headless-emulator input path.

## Squashing the decoy patch series (2026-09-25, ADR-098)

The `oblivios-platform/credential/duress-unlock-decoy` package went from
107 patches to 13 (`frameworks-base` 93 → 10, Settings 10 → 2, Multiuser
4 → 1). The old → new map and the verification tree hashes live in that
package's `SOURCE.md`; this note records the method and what to watch for
if the series is squashed or re-exported again.

Method, in order:

1. Seed a disposable local repo (`oblivios-platform/.worktrees/squash-*`)
   from the real base with a read-only `git archive` over SSH. Do not touch
   the build server's live tree.
2. `git am --3way` the existing package patches (for `frameworks-base`, the
   `duress-unlock-dummy` patches first). A clean apply already proves the
   package matches the base.
3. Compare every touched file against the build-server branch tip. The
   package carries the ADR-093 `AegisOS` → `SovereignOS` rename and the
   server branch does not, so normalize both sides before comparing.
   Without that, 32 of 48 `frameworks/base` files look different and it
   reads as a broken base.
4. Squash by cherry-pick per contiguous group and compare the final tree
   hash with the unsquashed tree. One group (`0028`) was moved behind
   `0029`-`0035`; the tree comparison is what makes that safe.
5. Export with `git format-patch`, then re-apply the exported files from
   scratch and compare tree hashes again. The check after the squash step
   is not the check of the shipped files.

Mistakes made while doing it, so they are not repeated:

- `git archive <rev> --` with an empty path list archives the whole tree,
  not nothing. An empty file list came from a `sed` using `|` both as the
  delimiter and as alternation, and the result was a 3.3 GB seed instead of
  48 files. Check the list is non-empty before using it.
- `ssh` inside a `while read` loop swallows the loop's stdin. The first
  fidelity run "checked" 1 file and reported no diffs. Use `ssh -n`, and
  print the count checked next to the result.
- `git diff base HEAD` on a branch named `base` while `HEAD` is that branch
  compares a ref with itself. Use the base commit hash.
- In zsh an unquoted `$G` holding `git -c a=b -c c=d` is not word-split, so
  `$G am ...` failed with "command not found" and the script still printed
  a tree hash. Read the tree hash together with the number of commits it has.

This is a source-tree-identity result only. The squashed form was not built
or run on a device, and the build-server branch was not rewritten (its SHAs
differ from anything the package records).

Squashed again on 2026-10-13 (ADR-163), 12 → 5 for `frameworks-base` and 4 → 2
for Settings, with the other packages outside `datamap` in the same pass. The
method above held, with these additions:

- The base is the parent of the first landed commit of the series on the
  server (`git log` on the branch), not the base a `SOURCE.md` or README
  names: the README of `duress-unlock-dummy` still names the pre-rebase
  hashes, which no longer exist as the parent.
- Only contiguous ranges can be joined by tree: a patch cannot move behind a
  later one unless the files are disjoint, which the tree comparison shows.
- The exported files were applied once more from the final worktree against
  the old series taken from `main`, not only inside the squash script.
- A series long enough for the narrative to outgrow the provenance moves the
  narrative to `HISTORY.md` of the package; `SOURCE.md` keeps the map, the
  commits and the apply steps.

Squashed a third time on 2026-11-15 (ADR-234): decoy `frameworks-base` 53 → 7,
`grab-detection` 12 → 2, `linkability` 10 → 4. The method held, with these
additions:

- Neighbouring patches join by tree identity, and so do patches of a series
  that were landed interleaved with other concerns when the files are disjoint
  (`linkability`: Clipboard `0002` and `0007`, Vibrator `0004`, `0008`, `0009`).
  The equal tree hash of the old and the new series is the proof; grouping by
  concern gives the reviewer one patch per concern.
- Three checks, all three: equal tree hash of the old and the new series from
  scratch, the blob of every file that only this series changes equals the build
  server branch tip, and the new files apply with plain `git am` on a tree that
  holds the `frameworks-base` series of the other packages. A first run claimed
  success on a base that did not match the server (three pre-image blobs
  differed); the blob comparison with the branch tip is what found it.
- The series are exported at different upstream generations. A new file must
  also apply to the base revision its `SOURCE.md` names, read file by file with
  `ssh -n ... git show <rev>:<file>` into a scratch directory (read-only, the
  live tree untouched). `privacy/compartments-profiles` `0011` fails on the base
  of `2026110200`: its pre-image of `LoadedApk.java` expects the import list of
  an older upstream, so that series is not squashed until it is re-exported.
- The old and new series stay in the disposable worktree
  `oblivios-platform/.worktrees/squash-2611` (branches `squash-old` and
  `squash-new`), which the `SOURCE.md` of the packages name.
- Series outside `frameworks-base` have no seed on the workstation: read the
  files at the documented base from the build server, build a scratch git
  repository, apply the old series, group, compare trees.

## Verifying a credential from an app: the wipe hook and decoy routing (2026-10-07, ADR-145)

`LockSettingsService.doVerifyCredential` calls `doVerifyCredentialInner` and then
`DuressPasswordHelper.onVerifyCredentialResult` with the result. Inside the
inner method, when the primary credential of the system user does not match,
`DecoyProfileHelper.maybeRouteToDecoy` may replace the response with the decoy's
matched response; the wipe hook then sees a match and returns, so a decoy PIN
equal to the wipe PIN means the wipe never runs.

Rules that follow:

- An app must never pass a typed or candidate PIN to `checkCredential`. A failed
  check runs the wipe hook and the decoy routing on it. A candidate that equals
  the wipe PIN would wipe the phone and one that equals a decoy PIN would switch
  the user. Use `LockPatternUtils.isDuressWipeCredential(ownerCredential,
  candidate)`, which only compares and needs the owner credential.
- `setLockCredential(new, saved, userId)` checks `saved` through
  `SyntheticPasswordManager.unlockLskfBasedProtector` directly, not through
  `doVerifyCredential`, so a wrong `saved` credential runs neither the wipe hook
  nor the routing. It still reaches Gatekeeper and Weaver for that user, so
  several wrong values can throttle that user for a while.
- The registration is stored under `decoy_profile_state` in lock settings
  storage with no read accessor. An app finds the decoy from the user list: the
  decoy type allows one user, and `getAliveUsers()` excludes a user being removed.
- With Auto confirm unlock on, SystemUI submits at the owner's PIN length and
  hides Enter (`AuthenticationInteractor.shouldSkipAuthenticationAttempt`), so a
  decoy PIN of another length can never be submitted whole. The set-up screen
  refuses it.
- `ExtSettingControllerHelper.getGlobalSettingAvailability` is `AVAILABLE` only for
  the system user, which hides a Settings row and its search entry in a decoy
  session.
- A new user unlocks its storage at its first start with no credential; a user
  that already has a credential stays locked at its first start. The set-up
  therefore starts the decoy, sets the PIN, then stops it with delayed locking.

Device findings of 2026-10-07 on `lynx` (rows `DUR-003` to `DUR-013`):

- The Auto confirm unlock switch is available only with a PIN of at least six digits
  (`AutoPinConfirmPreferenceController`, `MIN_AUTO_PIN_REQUIREMENT_LENGTH`), so with a
  shorter PIN it is absent from the screen lock page and from Settings search.
- Auto confirm unlock is stored per user. The decoy user does not have it, so the
  decoy session's lock screen asks for Enter while the owner's does not. The owner also
  reports different notifications in the decoy session (not read). Both make the decoy
  differ from the owner's session.
- A decoy takes about 4 s from creation to being stopped, with the screen on or off.
  The success toast is lost when the screen is off. User ids are never reused: removing
  and setting up again gives 11, 12, 13 and so on.
- Testing a cut-short set-up needs a watcher that reacts to any new non-owner user, not
  to a fixed id. Starting the two activities as a decoy user from the shell needs
  `adb root`, because they are not exported.

## The decoy user keeps running after the return (2026-10-23, ADR-194)

`ReturnToRealUserHelper.performRealUserSwitch` only calls `switchToUserSilently(0)`; nothing stops the decoy after the return. Stock `UserController.stopUserOnSwitchIfEnforced` would, but it is off unless `fw.stop_bg_users_on_switch` is 1, `setStopUserOnSwitch` was called or `config_multiuserDelayUserDataLocking` is true. The property stops every secondary user, not only the decoy; ADR-238 (`Proposed`, 2026-11-16) moves the rule into `stopUserOnSwitchIfEnforced` for the decoy user type and drops the property, so a later build script must not require `fw.stop_bg_users_on_switch=1` as the scripts up to `2026111501` do. On `stallion` the decoy stayed `RUNNING_UNLOCKED` 19 hours with 8 processes (602 MB RSS) and every broadcast (Settings battery usage every 4 to 19 minutes, gms, media on a USB event) started processes in it (`MEM-021`). Check after any Duress test: `am get-started-user-state <decoy>` must say `User is not started`; `am stop-user -w -f <decoy>` ends it and is safe. The stop does not lock the decoy's storage (delayed locking, see "Decoy start, memory and unlock timing" below), so the next lock-time warm start brings it up fully unlocked; only the first entry after a reboot meets a decoy whose storage is locked.

## The decoy credential follows the lock type (2026-11-02, ADR-210)

- The decoy credential has the type of the screen lock. `SyntheticPasswordManager` logs `Credential type mismatch` and rejects a typed credential whose type differs from the stored one (around line 1729) `[verified-in-source]`, and the keyguard types the lock's own type, so a PIN decoy under a password lock, or the reverse, never matches. A PIN pad cannot type a password either.
- Nothing in `frameworks/base` needs the type: `DecoyProfileHelper.maybeRouteToDecoy` verifies the typed credential against the decoy user whatever its type, and `DuressPasswordHelper.isDuressCredential` accepts `CREDENTIAL_TYPE_PIN` and `CREDENTIAL_TYPE_PASSWORD` `[verified-in-source]`. All PIN-only assumptions of ADR-145 sat in the two Settings activities (`isPin()` on the main screen, `createPin` on the set-up screen).
- A lock type that changes after the set-up leaves a decoy that never matches, with no sign at the bouncer. Settings reads `getCredentialTypeForUser` of the decoy to say so on the main screen, and Change types the current value as the type the decoy still has. Nothing prevents the lock change itself.
- Settings has no host-side type-check (SettingsLib does not link outside the module build), so the change is checked only by the module build and rows `DUR-014` to `DUR-018`.

## A finger as the decoy credential (2026-11-04, ADR-217)

- A finger carries no credential, and the decoy's storage opens only with a credential or a token (`unlockUserWithToken` ends in the same `onCredentialVerified`). The decoy credential is therefore kept for the finger: wrapped with `SyntheticPasswordCrypto.encrypt(sp.deriveDecoyFingerKey(), "decoy-finger-wrap", plain)` in `LockSettingsStorage` (`decoy_finger_state`, `version:fingerId:base64`) and unwrapped into system_server memory in the success branch of `doVerifyCredentialInner` for the real owner `[verified-in-source: DecoyFingerHelper, LockSettingsService]`.
- Dead end, escrow token: `LockSettingsService.activateEscrowTokens` runs on every credential verification and calls `disableEscrowTokenOnNonManagedDevicesIfNeeded`, which calls `mSpManager.destroyEscrowData(userId)` for a user that is not managed, supervised, automotive or test-only. The decoy would lose its escrow data at its first verification, before a token could be added `[verified-in-source: LockSettingsService.java, around 3955-3995 and 4274-4315]`.
- Dead end, a keystore key bound to biometric authentication: using it needs the real user's hardware token in the keystore (`addAuthToken`), which authorises every auth-bound key of the real user for the validity window.
- A fingerprint enrolled for the real user also authenticates an app's `BiometricPrompt` (`AuthenticationClient.isBiometricPrompt()`), where `BiometricService` adds the token to the keystore. The duress finger is therefore refused whenever the owner is not the keyguard.
- The interception point is `AuthenticationClient.onAuthenticated` (the matched `Identifier` carries `getBiometricId()`), before `addAuthToken`. `KeyguardUpdateMonitor.mFingerprintAuthenticationCallback` drops the finger id and `onFingerprintAuthenticated` already trusts and reports the unlock, so SystemUI is too late.
- `KeyguardUpdateMonitor.handleFingerprintAuthenticated` returns early when the success is for a user other than `mSelectedUserInteractor.getSelectedUserId()` and still sets the fingerprint state to stopped. A routed match is therefore delivered as a success for `UserHandle.USER_NULL` with no identifier and no token: the real lock screen is not dismissed, trusted or reported, and nothing of the real session shows while the switch runs `[verified-in-source]`; the SystemUI side of the null identifier is `[assumption]` (`DUR-020`).
- `LockscreenCredential` keeps the low byte of every char (`charsToBytesTruncating`), so a stored credential is turned back into chars with `ISO_8859_1`; decoding as UTF-8 corrupts every byte above 0x7F `[verified-in-source]`. Found by the own read of the diff, not by a test.
- A biometric allowance is not `STRONG_AUTH_NOT_REQUIRED`: `StrongAuthTracker.isBiometricAllowedForUser` also lets `SOME_AUTH_REQUIRED_AFTER_USER_REQUEST`, `..._TRUSTAGENT_EXPIRED` and `..._ADAPTIVE_AUTH_REQUEST` through. The policy takes the tracker's answer, so an ordinary finger and the duress finger behave alike.
- Host checks that exist for classes the module build cannot be run on: the pure `DecoyFingerPolicy`, `DecoyFingerCodec` and `DuressUnlockFingerFlow` run with `javac` and JUnit 4 on the JVM, and a parse-only pass over every other changed file (`com.sun.source.util.JavacTask.parse()`, which reports syntax errors and ignores missing Android symbols) catches editing mistakes until the first module build. Neither is a type-check. Since 2026-11-14 `tools/build/typecheck-duress-frameworks.sh <worktree> <base commit>` is one: it runs `javac` on the changed non-test Java files of the series on the build server against the classes of the last build, runs the base versions as a control, and fails only on errors the series adds (`TC_PROBE=1` and `TC_PROBE=2` plant an error in the services and the SystemUI tree to show the check detects one). The jars lack a few classes, so a handful of errors exist in both runs; Changed Kotlin files of SystemUI are compiled with `kotlinc` the same way (`TC_PROBE=3` plants an error there); tests are outside it. Two causes found while building it: `javac` stops before it attributes method bodies as soon as one import is missing, so every run needs `-XDshould-stop.ifError=FLOW` (without it the planted errors were not found); the `kotlinc/classpath.rsp` of the module is stale (September) and lacks the framework and the coroutines, so Kotlin uses the `javac` classpath of the module plus `kotlin-stdlib.jar` and `-jvm-target 21`. The classpaths exceed the length of one argument and go through `@argfile`s.

## Decoy start, memory and unlock timing (2026-11-10, ADR-222)

Measured on `lynx` `2026110502` (userdebug) with logcat buffers of 64 MiB, the device charging at 3-4% battery, so the
numbers locate causes and are not `DUR-019` results. Source read at the public GrapheneOS tag `2026110200`
(`frameworks/base` `ad133394d443`) with the package series applied.

- The decoy's storage stays open after the stop on the return from the decoy, not after the stop at an owner unlock
  (corrected 2026-11-12, ADR-228). The decoy user type sets `setAllowStoppingUserWithDelayedLocking(true)`
  (`frameworks-base/0001`, `UserTypeFactory`), so the stop that ADR-194 causes (`stopUsersLU(..., allowDelayedLocking=true)`)
  does not lock its credential-encrypted storage (`UserController.canDelayDataLockingForUser`); a lock-time warm start after
  that stop unlocks the decoy at once, without its credential `[measured on 2026110502: uc_start_user_internal 11 then
  ssm_user_unlocked 11 1.1 s later]`. The stop of `maybeStopUnusedWarmDecoy` at an owner unlock (`frameworks-base/0015`, in
  the images since `2026111101`) is a plain `stopUserWithCallback`: vold logs `Evicted fscrypt key` 0.2 s after it, and the
  next lock-time start stays `RUNNING_LOCKED` (`Not unlocking CE storage ... because user is secured`) until the decoy
  credential is verified. Only `ActivityManagerService.stopUserWithDelayedLocking` keeps the key `[measured 2026-11-12]`.
- A decoy unlocked in the background gets `BOOT_COMPLETED`, and the broadcast queue starts one boot receiver about every
  0.45 s for 14 s: 38 decoy processes and 2.0 GB PSS with the device locked `[measured: dumpsys meminfo per u11 process]`.
  Under secure app spawning (exec spawning, `persist.security.exec_spawn` empty, the GrapheneOS default) each process
  holds 46 to 91 MB PSS, of which about 24 MB is its own `.art mmap`. The launcher alone is 56 MB; it is bound at
  0.37 s after the start (`NotificationListener`), long before the boot receivers. `frameworks-base/0014` holds
  `BOOT_COMPLETED` back until the decoy is in the foreground.
- `maybeStopUnusedWarmDecoy` ran only after the owner's credential matched; after a finger unlock the decoy kept running
  with all its processes beside the owner's session `[measured]`. `frameworks-base/0015` stops it at every keyguard
  unlock in the owner's session.
- The `FallbackHome` route `[verified-in-source]`. If the decoy is not yet `RUNNING_UNLOCKED` when the switch starts
  (not running, or still booting from the warm start), `UserManagerInternal.isUserUnlockingOrUnlocked` is false, the
  package manager resolves only direct-boot-aware home activities and the switch starts Settings' `FallbackHome`
  (Launcher3 is not direct-boot aware). A foreground user steps from `RUNNING_LOCKED` to unlocked only in
  `UserController.finishUserSwitch`, which `ActivityTaskSupervisor.activityIdleInternal` calls once the first activity of
  the new user goes idle; `FallbackHome` then finishes on `ACTION_USER_UNLOCKED` (retrying every 500 ms until a real
  home resolves) and shows "Phone is starting..." after `config_progressTimeoutFallbackHome` (2000 ms). The decoy
  launcher then starts cold. In a running decoy the unlock happens inside the credential check instead
  (`LockSettingsService.unlockUser` waits up to 15 s), which is why the warm path never shows `FallbackHome`. Not
  reproduced in the five duress unlocks of 2026-11-10; `frameworks-base/0015` closes it by unlocking the decoy before
  the switch.
- Stage times from the start of the credential check (`Verifying primary lockscreen credential for user 0`) to the
  start of the keyguard exit (`STARTED ... from=PRIMARY_BOUNCER, to=GONE`) and its end:

  | Case | Exit starts | Exit ends | Decoy home drawn |
  |---|---|---|---|
  | Ordinary unlock (owner home already drawn) | 0.25 s | 0.80 s | - |
  | Duress, decoy unlocked and launcher process running | 0.72 s | 1.24 s | 0.52 s |
  | Duress, decoy launcher process cold (started 3 s before) | 2.22 s | 2.75 s | 1.82 s |
  | Duress, first credential after boot, decoy `RUNNING_LOCKED` | 1.43 s | 1.96 s | 3.57 s |

  The owner's own first unlock after a boot passed through `FallbackHome` and took 4.5 s, so a first-after-boot duress
  unlock is compared with a first-after-boot ordinary one.
- Where the warm duress path loses time against an ordinary unlock: the second credential check (about 50 ms); the
  user switch, whose largest part is `ssm.SwitchUser` (165 ms: `UiModeManagerService` 41, `HealthConnectManagerService`
  33, `NotificationManagerService` 29, `ContextHubSystemService` 16 ms) and the wallpaper observer (59 ms); SystemUI
  handles `onUserSwitchComplete` 85 ms after system_server dispatched it; and the bouncer's pre-hide animation (about
  217 ms, `KeyguardViewMediator.startPreHideAnimation`), which an ordinary unlock starts right after the credential
  (`keyguardDone`) but the duress path only after `onUserSwitchComplete`. The decoy launcher draws at 0.52 s, 380 ms after
  its activity starts in a warm process.
- For the pre-hide change of ADR-222 `[verified-in-source: KeyguardViewMediator]`: `keyguardDonePending(targetUserId)`
  returns at once unless the target is already the selected user, so it cannot start the animation at
  `onBeforeUserSwitching`; `tryKeyguardDone` goes away only when `mHideAnimationRun` is set and `mHideAnimationRunning`
  is clear; `OnHideAnimationFinished` calls `resetStateLocked` when its user is not the selected one. An early start
  therefore has to be a presentation-only call of `startPreHideAnimation` whose callback clears `mHideAnimationRunning`
  without calling `tryKeyguardDone`, gated on `mAuthorizedSwitchDismissPending`; the dismissal itself stays where it
  is. In the duress run of 2026-11-10 SystemUI never ran `keyguardDone` for user 0 on the routed OK.
- A cold launcher costs 1.5 to 2.3 s more, about 1.5 s of it before the app's own code runs: the exec-spawned process
  initialises the runtime itself (`ZygotePreload`, `ZygoteInit` in its own log). Forking it from the zygote would regress
  secure app spawning, so the launcher has to be running before the duress credential is typed.

## Duress unlock time and visual parity measured on `2026111101` (2026-11-12, ADR-228)

Logcat of 18 unlocks and a rolling screen recording on `lynx` `2026111101` (userdebug, the phone charging over USB at 89%,
so the numbers are `DUR-019` evidence with that caveat). Design and plan: `2026-11-12-duress-unlock-timing-design.md`.

- **Stage times.** Credential check (`Verifying primary lockscreen credential for user 0`) to the end of the keyguard exit
  (`FINISHED ... from=PRIMARY_BOUNCER, to=GONE`): ordinary, 10 runs, 0.77 to 0.79 s (the exit starts at 0.24 to 0.26 s).
  Duress, 8 runs: 2.57, 2.75 and 2.96 s with a cold launcher, 1.30 to 1.50 s with a running launcher. A duress unlock is
  `Verifying ... user 0` then `Verifying ... user 12` 25 to 50 ms later, then `startUser-12-fg`; the return from the decoy is
  `Verifying ... user 12` then `startUser-0-fg`. `tools/duress-timing-probe/stages.py` reads both from a logcat file.
- **Why the common case is cold.** Owner unlock: `User 12 state changed from RUNNING_UNLOCKED to STOPPING`, vold evicts the
  decoy's CE key (`Files still open after removing key`), at the next lock `startUser-12-bg-start-mode-2` brings it to
  `RUNNING_LOCKED` with two processes (`systemui`, `hbmsvmanager`). `0014` defers `BOOT_COMPLETED`, and the launcher was only
  ever started by the binding of its `NotificationListener` once the decoy was unlocked, so nothing starts it now. At the
  duress credential `Installed CE key for user 12` comes 0.36 s after the check, the launcher process starts `for top-activity`
  at 0.54 s and `Displayed` follows +2.9 to 3.0 s later. The decoy never lands on `FallbackHome` in this path: it is
  unlocked before the switch.
- **A locked decoy resolves only `FallbackHome`.** `cmd package query-activities --brief --user <decoy> -a android.intent.action.MAIN -c android.intent.category.HOME`
  lists `com.android.settings/.FallbackHome` alone, so Launcher3 is not direct-boot aware `[measured]`. The command has no
  `--flags` option.
- **Process start while the user is locked** `[verified-in-source, the first 60 lines of ProcessList.startProcessLocked only]`:
  no unlock check before the process record is made; the component-level checks sit elsewhere. `ActivityManagerInternal.startProcess`
  takes `(processName, info, knownToBeDead, isTop, hostingType, hostingName, isPcc, callerUid, callerProcessName)`. Spike
  `frameworks-base/0021` uses it; whether the launcher survives a locked user is not known.
- **What the screen shows** (video segment frames read one by one). Cold duress unlock: the bouncer, then 3 s of a black
  screen, first without and then with the navigation handle, no movement, then the decoy status bar and the home at +3.1 s.
  Warm duress unlock: the bouncer, then about 0.6 s of one flat pale mauve fill (mean luminance 140 falling to 115, only the
  navigation handle), then the dark decoy home; its cause is not known (a layer of the keyguard, the launcher's starting
  window and the wallpaper window that is rebound at the switch are the candidates: `WINDOW DIED ... ImageWallpaper`,
  `reportEngineShown: shouldWait=true`). Return to the real session: bouncer over the blurred wallpaper, the wallpaper, the
  home, smooth, 0.9 s after the check. The decoy home is black with six icons, the owner's home a red wallpaper.
- **Stalls at screen wake.** SystemUI (the process of user 0) logs `Choreographer: Skipped 46 to 94 frames` 0.3 to 1.6 s after
  `Waking up from Dozing` in 11 of 11 wakes, in the real session too; after a wake the bouncer sometimes shows without its
  wallpaper. Whether this is stock behaviour is not known. The return to the real session stalled the decoy launcher for 74
  frames and system_server for 40 once (16:51:08).
- **Differences between the owner and the decoy** (`settings --user N list`): `screen_brightness` 6 against 9,
  `screen_off_timeout` 1800000 against 30000, `accelerometer_rotation` 1 against 0, `lockscreen_show_controls`,
  `lockscreen_show_wallet`, `lock_screen_show_qr_code_scanner`, `sysui_qs_tiles` (the decoy has no `cell` and no `cast` tile),
  the volumes and the sounds. `DisplayPowerController` logs `Switching user newUserId=... newBrightness=...` with the target
  user's own value at every switch. `0018` to `0020` copy the screen and lock-screen keys at the lock.
- **Dead ends and quirks of the capture.** perfetto: `lynx` has no tracefs (`/sys/kernel/tracing` is empty); each ftrace
  source (`sched`, atrace categories) returned about 1 KB in 3 s and logcat said `Data source id=9 not found`; a config must be
  given on standard input (`perfetto --txt -c -`), a file in `/data/local/tmp` is refused; the trigger stop worked
  (`trigger_perfetto`, the session ended after an acknowledgement timeout of 5 s). `screenrecord` exits at once with
  `UNASSIGNED_LAYER_STACK` (exit 218) while the screen is off (`mWakefulness=Dozing`), so a loop retries inside one
  `adb shell` every 0.2 s; the bouncer is readable in the recording (no secure-window blanking); toybox `xargs` has no
  `-r`. A segment starts at the epoch second in its file name plus about 0.3 s. The laptop has no `ffmpeg`: in the browser
  pane `requestVideoFrameCallback` delivers 0 frames (a background tab, and also a foreground one, 2026-11-13). Seeking
  (`currentTime`, wait for `seeked`, draw to a canvas, read the mean luminance) works only when the server answers byte
  ranges: Python's `http.server` does not, the video is then not seekable (`seekable` is empty) and every seek draws frame 0,
  which gave a contact sheet of identical frames. A server with `206 Partial Content` and `Accept-Ranges: bytes` fixes it.
  To read every frame, play at 0.1 to 0.25 speed and poll `getVideoPlaybackQuality().totalVideoFrames` on a timer
  (a detached `video` element needs to be in the DOM). The `screenrecord` of the phone and the log do not line up to better
  than about 1 s; a video of the phone from a second phone (30 fps) read frame by frame showed the stages the owner saw. `dumpsys SurfaceFlinger` sampled in a loop on the phone gives about 10 samples a second of 82 KB.
- **Reviews.** The automated security review of `0017` to `0020` found three things that are fixed in `0019` and `0020`
  (the copy at the switch was on the critical path; a `custom(` tile names an app; a prefix check passes by spelling) and one
  that the owner decided (a resident decoy key, ADR-228).

- **Cold duress unlock, traced waits (`lynx` `2026111201`, 2026-11-13, ADR-229).** The cold unlock was five serial waits; the
  reference ordinary unlock has none of them. From the credential check (`Verifying primary lockscreen credential for user 0`,
  T0): the decoy credential verifies at T0+0.09 s and its CE key is installed at T0+0.16 s (`fscrypt_unlock_ce_storage 12`),
  but `LockSettingsService.unlockUser` waits on a latch (15 s at most) for the end of the decoy's unlock, so the credential
  response and the switch wait until T0+0.49 s (`ssm.UnlockedUser-12`). The switch itself dispatches `onUserSwitching` to
  SystemUI at T0+0.81 s. `UserTrackerImpl` runs its switch observer on SysUiBg; the log line is `User switch slowed down by
  observer #2 UserTrackerImpl: result took 1367 ms` and `Looper: Slow dispatch took 1594ms SysUiBg ...
  SecurityControllerImpl`. Cause: `SecurityControllerImpl` receives `ACTION_USER_UNLOCKED` for the decoy and runs
  `KeyChain.bindAsUser` on the same SysUiBg thread; the decoy's KeyChain process is started cold
  (`Start proc ... com.android.keychain/u12s1000`, created 1.1 s later because the zygote serves the other processes the decoy
  starts). A warm switch has no such start and the observer takes 77 to 96 ms. The home of the decoy starts inside the user
  switch transition (`START u12 ... QuickstepLauncher`, transition 100): `WindowManagerService.startUserSwitchTransition`
  collects it and `Finish Transition (#100): ... ready=34ms sent=719ms` shows the wait for the launcher's first draw
  (`Displayed ... for user 12: +750ms`). The exit is requested only after `onUserSwitchComplete` (T0+2.1 s):
  `KeyguardViewMediator.handleUserSwitchComplete` posts the dismissal. The keyguard going-away (transition 102) is then held
  787 ms (`sent=787.631ms`): `ThemeOverlayController.onUserChanged` for user 12 logs `Failed to parse
  THEME_CUSTOMIZATION_OVERLAY_PACKAGES` (no `theme_style` in the decoy's setting), applies new dynamic colour overlays
  (`AppCompatResourceOverlayPolicy ... result: true`, three `com.android.systemui-{neutral,accent,dynamic}` `.frro` swapped) and
  the launcher activity is relaunched (`Schedule relaunch activity`, a second `Launcher.onCreate`); the transition waits for
  that draw. While transitions 100 and 102 wait, `Transition.java` shows a screenshot of the display (`transition snapshot:
  Display{#0 ...}`, 0.56 s and 0.72 s in the layer samples), the flat white fill of the video. The display configuration
  changed at the switch (`PerDisplayTaskbarResource: ... configDiff={CONFIG_UI_MODE}`): the owner had `ui_night_mode=2`, the
  decoy none. The ordinary unlock: layers wallpaper, status bar, bouncer, launcher; the launcher layer joins under the
  bouncer at the credential check and the bouncer layer leaves 0.46 s later; going-away sent 25.6 ms after ready;
  `playCannedUnlockAnimation, surfaceBehindEntryAnimator#start` (447 ms); the duress exit ran the branch `authorized switch
  dismiss`, a cut, so the icons appear at once. How to read it: `adb logcat -v threadtime` into a file during the round and
  `tools/duress-timing-probe/stages.py` on it; `tools/duress-timing-probe/layers.sh <label> <seconds>` on the phone and
  `tools/duress-timing-probe/layerseq.py <dir> <from> <to>` for the layers between two times (the phone's local time; the
  logcat buffer of the start of `adb logcat` holds the earlier unlocks too). The notification card of the stage: the
  screenrecord of a cold duress unlock shows one card (a system notification, `USB debugging connected`) for 3 frames at
  the start of `BouncerToGone`; `BouncerToGoneFlows ... shadeNotifAlpha=0.49803922` is logged in all 13 unlocks of the day,
  ordinary ones included; it is a start state of the notification scrim (used only with the shade expanded or left open), not
  the alpha of the stack (corrected 2026-11-14; the cause is given below). The owner's
  report that cards freeze mid-screen was not seen in that evidence. Cause (2026-11-14, from the source and these logs): the
  stack's alpha is raised to 1 by `onFinish` of `PrimaryBouncerToGoneTransitionViewModel#notificationAlpha` (and the alternate
  bouncer twin) when the 500 ms transition ends; the shade alpha takes over only when the status bar state is SHADE, which
  follows the window manager's exit. A going-away held for longer than 500 ms (transition 102, 787 ms) leaves the stack
  visible over the stage until then. `0032` keeps it at 0 for an authorized switch (`AuthorizedSwitchExit`). The owner (2026-11-14):
  it happens to all notifications; the USB debugging card was the only one on the screen. The fix acts on the whole stack. It
  is not measured: `DUR-042` is the row.
- **Finding what betrays the decoy.** `adb shell "settings --user 0 list system"` and `... --user 12 list secure` (and
  `global`, which is shared) sorted into two files and compared key by key list every value the owner has and the decoy lacks
  or differs in. On `2026111201` the differences that can be seen or heard at the switch were `ui_night_mode`, the theme
  setting, the volumes (`volume_music`, `volume_system`, `volume_voice`, the per-device variants),
  `mode_ringer_streams_affected`, `peak_refresh_rate`, `show_touches` and the wallpaper (`/data/system/users/12` has no
  `wallpaper`, `wallpaper_orig`; the owner's directory has them). Identifiers and accounts differ by design and are not
  copied (`android_id`, the Bluetooth address, the autofill and credential services, tone URIs with per-user media ids).
- **Reading the new path on the image (`lynx` `2026111401`, `0033`, `0034`).** On a debuggable build the lines `Exit held`,
  `Exit released after N ms` (`ActivityTaskManagerService`), `Home start deferred`, `Home start after the deferral`
  (`WindowManagerService`) and `onBeforeUserSwitching, exit requested at the start of the switch` (`KeyguardViewMediator`)
  mark the hold and the release of the exit, the deferred home and the start of the exit; the stage times of
  `tools/duress-timing-probe/stages.py` stay the main reading. They are gated on `Build.IS_DEBUGGABLE`: an automated review found
  that a line that exists only for an authorized switch shows on a user build that one ran. `[estimated 2026-11-14, measured later the same day]` From the traced stage times the cold path was estimated at about 0.8 to 0.9 s
  against 0.77 to 0.82 s for the ordinary unlock; the measurement on the device gave 0.83 and 0.85 s for the duress unlock
  (`DUR-019`).
- **The disposable repository is sparse.** A file outside the sparse set is brought in with `git sparse-checkout add /<path>`
  (the leading slash selects one file; a path without it is read as a directory pattern with a warning) and committed with
  `git add --sparse`. Serena's `search_for_pattern` finds nothing inside the ignored `.worktrees` directory: read the file with
  `read_file`, or with `sed -n` over ssh on the build tree; its default multiline mode lets `.*` run across lines, so a line
  pattern needs `multiline=false`.
- **Disposable repository against the build server's tree.** The disposable repository
  (`oblivios-platform/.worktrees/<task>`) is a partial, sparse clone of GrapheneOS `frameworks/base` whose base is the
  pre-rename twin of the build server's branch: the same commit subjects, the same code, but "FreeholdOS" comments and
  identifiers where the server has "ObliviOS" (`git hash-object` of the same file differs). A patch made on that base
  conflicts at every changed comment. The working route: `git fetch ssh://<build host>/<path of frameworks/base>
  <branch>` (read-only on the server), `git checkout -b <task> FETCH_HEAD`, then `git cherry-pick` of the commits; and
  `git sparse-checkout add /<path>` for every file to edit. Compare the blobs of the files to patch between the server and
  the worktree before writing (`git hash-object <file>` on both).
- **Host checks without an Android build.** A JVM-only class and its JUnit test: `javac -d <out> -cp junit-4.13.2.jar:
  hamcrest-core-1.3.jar <class> <test>` then `java -cp <out>:<jars> org.junit.runner.JUnitCore <test class>`; the jars are in
  the Gradle cache (`<home>/.gradle/caches/modules-2/files-2.1/`), JDK 21. A mutation (the key removed from the list) must fail a
  test. For the Android-dependent files only syntax can be checked: `javac -proc:none <file>` and keep the errors that
  match `expected|illegal start|reached end of file|not a statement|unclosed` (unresolved symbols are expected). A compile
  against the tree happens in the build.
- **Wallpaper copy that never finished (`frameworks-base/0035`, measured 2026-11-14).** `WallpaperManagerService` finishes a static
  set (the crop, the metadata, the binding) in a `FileObserver` that only `switchUser` and `onUnlockUser` start. `WallpaperManager#setStream`
  for a user that is neither the current nor an unlocked one (the decoy while the owner is on screen) wrote only `wallpaper_orig`:
  `/data/system/users/12/wallpaper_info.xml` stayed at 759 bytes with `bindSource UNKNOWN` and no crop, and `0025` counted the copy as
  done until the next boot, so the decoy's home and lock screen were black and its theme colours had no wallpaper. `0035` copies the
  five files (`wallpaper_orig`, `wallpaper`, `wallpaper_lock_orig`, `wallpaper_lock`, `wallpaper_info.xml` last) in
  `DecoyWallpaperFiles`, size and modification time deciding, a temporary file moved over the target. Read back with
  `adb shell ls -la --full-time /data/system/users/12/` (a crop of the owner's size, `wallpaper_info.xml` of 8127 bytes) and
  `adb shell dumpsys wallpaper` (`mBindSource=SET_STATIC` for both users). Bringing an observer to the decoy instead would bind the
  decoy's wallpaper service while it is locked (about 240 MB of its SystemUI), which the owner rules out.
- **The decoy killed during the exit of the switch back (`0036`).** `UserController#stopPreviousUserPackagesIfEnabled` is stock
  `stopPreviousUserApps`: `am_kill ... stop user 12 due to early stop user packages` removed the decoy launcher 0.18 s into the
  return, while the keyguard exit animated over it. `0036` makes `isEarlyPackageKillEnabledForUserSwitch` false for a decoy-type
  outgoing user; the stop of the switch ends the decoy about 1.6 s after the return.
- **What stays black or moves wrongly after `0035` and `0036` (30 fps frames, `layers.sh`, logcat, 2026-11-14).** (1) Fast path: the
  exit ends at 0.85 s, the decoy launcher draws `Displayed ... +711 ms` after its start, and until a window of the decoy exists no
  wallpaper target exists, so WindowManager hides the wallpaper layer (`wm_wallpaper_surface [0,0,null]`, only StatusBar and
  ScreenDecor in the layers): about 0.8 s of black, icons on black for 0.25 s, then the decoy wallpaper pops in. The first duress after
  a boot (exit 1.21 s) shows no gap: the gap is the launch time minus the exit time. (2) Stock exit (`oblivios_duress_fast` 0): the
  exit starts when the switch completes (about 0.75 s) and ends at 1.27 to 1.37 s; a `transition snapshot: Display` layer is alone on
  screen for 0.45 s; the keyguard's wallpaper card slides up over black (the owner's "25% up"), 0.15 s of black with one notification
  card on a single frame, then the canned wallpaper fade-in (`KeyguardUnlockAnimationController#fadeInWallpaper`) with the home. The
  real animations play, but with nothing behind the keyguard when it moves. (3) Return: pad over the decoy wallpaper, wallpaper only,
  a flat blue-grey fill of 0.2 s, the wallpaper as a card over the top 75% with a blue-grey band over the bottom 25% for 0.25 s,
  a dark fill of 0.15 s, then the owner's home fades in; the log has `Combining appDied into #78 ... from kgGoAway` and the owner's
  launcher draws its first frame about 0.75 s after the switch. (4) The notification card appears in both directions, less often.
- **The decoy's styling (open).** The owner's `com.android.launcher3.prefs.xml` holds `icon_theme_id` `mono-icons:with-theme` (themed
  icons), `icon_shape_model` `square`, `pref_workspace_items_label_hidden` and `pref_add_icon_to_home`; the decoy's file has none, so its
  apps show default icons. The Launcher keeps them in credential-encrypted storage, evicted while the device is locked, so the lock-time
  copy cannot reach them: the copy has to run after the decoy's unlock and before the home start, and the lock-time launcher warm start
  (`0021`) must go, or the launcher has read its prefs before the copy. The file cannot be edited from system_server (mode 660, no DAC
  override): the copy goes through the launcher's provider, see "Round of 2026-11-15" below (ADR-231). The palette comes from the wallpaper colours at run time (`theme_customization_overlay_packages` is equal for both users:
  `color_source` `home_wallpaper`, `TONAL_SPOT`, `color_both`, no colour values); `ThemeOverlayController` runs in the system user's
  SystemUI. At the check both users showed the same `com.android.systemui:accent` and `:neutral` overlay values
  (`cmd overlay dump --user N <overlay>`) and `dumpsys wallpaper` printed `isColorExtracted=false` for both, so whether the decoy's
  palette ever differs from the owner's is not shown yet.
- **Module build and push, instead of an image (the owner's yes to `adb disable-verity` and module pushes, 2026-11-14).**
  `tools/build/modbuild-lynx.sh` builds `services` and `SystemUI` in 14 minutes (400
  steps) with the environment of the image script, detached with `nohup ... & disown`. The outputs are
  `out-lynx/target/product/lynx/system/framework/services.jar` and `oat/arm64/services.{art,odex,vdex}` (and the SystemUI apk with its
  `oat`). On the phone: `adb root`, `adb disable-verity` (prints `enabling overlayfs` and `Reboot the device`), `adb reboot`, `adb root`,
  `adb remount` (`Remount succeeded`), `adb push` of the jar to `/system/framework/` and of the three `oat` files to
  `/system/framework/oat/arm64/`, `chmod 644`, `restorecon -R`, `adb reboot`; compare `sha256sum` of the jar on both sides. The stale
  `.fsv_meta` files of the image's `oat` were not rejected. A `fastboot flashall` restores the partitions. Landing a patch on the build
  tree for it needs its own yes (`owner-working-rules.md`).
- **Reading frames and probes without `ffmpeg` (lessons of 2026-11-14).** The offset of a `flight-sr.sh` segment from its file name is
  off by up to a second: align by events instead: the mean luminance per 0.1 s, classed as black, dark, mid and home, gives the runs
  (screen off, pad, scrim, home), then contact sheets at 30 fps with 54 by 120 px frames, 8 per row (the pane screenshot is about 450
  px wide). A luminance threshold on the standard deviation misses a flat fill that carries the white navigation pill; look at the
  frames. A `pkill -f '<pattern>'` whose pattern occurs in its own command line kills the calling shell (exit 144): kill by pid from
  `ps -eo pid,cmd | grep -E '[p]attern'`, on the phone from `ps -A -o PID,PPID,ARGS`, the loop shell before its `screenrecord` child.

## Round of 2026-11-15 (module builds on `lynx` `2026111401`, ADR-231)

- **A module build replaces `services.jar` and `SystemUI`, never `framework.jar` (incident, 02:37).** Two abstract methods added to
  `ActivityManagerInternal` (`core/java/android/app/`, compiled into `framework.jar`) were in the pushed `services.jar` and not in the
  phone's `framework.jar`: the duress PIN, typed by the owner on the boot lock screen, ended system_server (`FATAL EXCEPTION IN SYSTEM
  PROCESS: DecoyLauncherLook`, `NoSuchMethodError: No virtual method onDecoyLookApplied()V in class Landroid/app/ActivityManagerInternal;
  ... (declaration ... appears in /system/framework/framework.jar)`) and the phone went to the boot animation. The type-check
  (`typecheck-duress-frameworks.sh`) compiles against the new sources and cannot see it. Rule: state shared between services is a
  static in `services.jar` (`DecoyLookGate`, `DecoyWallpaperHold`), and before a module build `git diff --stat <head of the flashed image>
  HEAD -- core` on the build tree must print nothing (`f26cefc13b00` for `2026111401`). A thread of the decoy code also catches
  `RuntimeException` now, so a failure of the look can no longer end system_server. The duress PIN works on the boot lock screen: the
  decoy is unlocked and entered before the owner's first unlock.
- **The decoy's launcher look goes through the provider, and what the provider returns (verified on the phone, root, 2026-11-15).**
  `content query --user N --uri content://com.android.launcher3.grid_control/icon_themed` (also `workspace_items_label_hidden`,
  `shape_options`) and `content update ... --uri .../icon_themed --bind boolean_value:b:true`, `.../shape --bind shape_key:s:square`,
  `.../set_workspace_items_label_hidden --bind boolean_value:b:true`: the decoy's `com.android.launcher3.prefs.xml` then holds
  `icon_theme_id` `mono-icons:with-theme`, `icon_shape_model` `square`, `pref_workspace_items_label_hidden` true. The prefs file is
  `-rw-rw---- u12_a163`, `privapp_data_file`, and system_server runs with `CapEff 0000001a06887c20` (no `CAP_DAC_OVERRIDE`), although
  `system_server.te` allows `app_data_file_type:file { getattr read write append map }`: SELinux allows it, DAC does not. A Boolean in a
  provider's `MatrixCursor` (`is_default` of `shape_options`) reaches the caller as the string "true"; `getInt` of it is 0. Every call
  of system_server into the provider logs `Outgoing transactions from this process must be FLAG_ONEWAY` with a stack: a warning, the
  call is processed (`GridCustomizationsProvider: query: path=/icon_themed` followed in the decoy's launcher process).
- **The theme colours of the decoy (measured 2026-11-15).** `theme_customization_overlay_packages` and `wallpaper_info.xml` (8127 bytes,
  with colour values) are equal for both users, and yet the accent overlay of the decoy is the default blue: `ThemeOverlayController`
  keeps `mCurrentColors` per user and fills it only from `onColorsChanged`, which the wallpaper service does not send for colours it
  already holds. `reevaluateSystemTheme` at the switch finds no entry for the decoy, `mainColor` is `Color.TRANSPARENT`. The log shows
  the accent overlay file replaced at each switch in both directions (`com.android.systemui-accent-TDkM.frro` for the owner, another
  one at the switch to the decoy and another at the return), and the replacement is the configuration change after which SystemUI
  redraws its windows. `dumpsys wallpaper` prints `isColorExtracted=false` for both users after a boot, so it is no indicator.
- **What is on screen during a duress exit, and why it is random (30 fps frames, `layers.sh` 1454 samples, protolog, 2026-11-15).**
  The going-away transition of a duress unlock is `OPEN f=0x100` with one change, `IS_WALLPAPER leash=WallpaperWindowToken`; that of an
  ordinary unlock is `TO_BACK f=0x104` with the home task (`SHOW_WALLPAPER`) and `DefaultTaskDisplayArea`. Frames of the first duress
  unlock after the first module build: the pad over the wallpaper, two frames of the pad over black (the wallpaper service of the other
  user is bound; in the layer samples the `Wallpaper BBQ wrapper` layer is absent for 0.10 to 0.16 s in 5 of 7 switches), three frames
  of a wallpaper card over the top 63% with black below (the engine surface is 1006x1506 px, `onSurfaceChanged ... 2, 1006, 1506` at
  every relayout, 36 times in the run, and shows at native size until the window manager applies its scale), a dim wallpaper without
  icons for 0.4 to 0.65 s, then the home with the colour back. One unlock of four had the card, one of three had the wallpaper absent
  for 0.38 s after the exit. Protolog (`cmd protolog_configuration logcat enable WM_DEBUG_WALLPAPER WM_DEBUG_WINDOW_TRANSITIONS`; the
  old `wm logging enable-text` is deprecated and does nothing): `viewroot_draw_event: [VRI[SwitchStage],Canceling draw.
  cancelDueToSync=true]` at 03:55:45.793, `wm_wallpaper_surface: [0,0,Window{SwitchStage}]` at .794, `Hiding wallpaper
  WallpaperWindowToken{showWhenLocked=true} from Window{SwitchStage} ... WindowStateAnimator.prepareSurfaceLocked:416` at 46.127, `New
  wallpaper target: Window{...QuickstepLauncher}` at 46.139, `Displayed ... QuickstepLauncher for user 12: +423ms` at 46.156.
  `WindowStateAnimator#prepareSurfaceLocked` hides a window that is not `isOnScreen()` and calls `hideWallpapers`. A transparent window
  that asks for the wallpaper is therefore a fragile target; `0042` and `0043` guard both.
- **First stage windows, what failed (frames of 04:27 on the third module build).** The stage drew a black middle with the wallpaper only
  in the strip of the status bar: `getBitmapAsUser(userId, true, FLAG_LOCK, true)` returned the empty default image (the engine calls
  it with the source flag of the home, `FLAG_SYSTEM`), and the window kept the default inset of the status bar (`setFitInsetsTypes(0)`
  and the cutout mode fix it). With the wallpaper held visible and no cover, the card of the engine surface stayed on screen for more
  than 2 s (bands of luminance 79, 108, 47, 0 for 2 s) until the home drew, so the stage has to stay until the home has drawn. The
  first signal to the stage, a counter in the secure settings, was refused by the automated security review (`ADR-231`) and replaced
  by a broadcast with `setPackage` and a receiver registered with `RECEIVER_NOT_EXPORTED`.
- **Stage times, `stages.py` (credential check to the end of the keyguard exit), module builds of 2026-11-15.** Ordinary unlocks 0.77 to
  0.81 s. Duress: 1.18, 0.97, 0.85, 0.92, 1.15 s (first build, one proof first); 1.17, 0.92, 0.85, 0.89 and 0.93, 0.90, 0.94 s
  (next two); 1.31 (first after a boot), 1.09, 1.09 s (stage with the bitmap). Returns 0.88 to 1.06 s. The decoy home draws about 0.9
  to 1.0 s after the check (`Displayed +240 to +423 ms` after its start at 0.4 to 0.55 s).
- **Capture and tools (lessons).** The recording of `screenrecord` is black for the whole frame while the secure PIN pad is up in an
  ordinary unlock, so the ordinary exit cannot be read from it (the owner's second-phone video can). `busybox httpd -f -p
  127.0.0.1:8765 -h <dir>` answers byte ranges, so the browser pane can seek the video; the page runs the canvas reads; a script over
  the whole segment times out after 45 s of `javascript_tool`: start it and read its result from a window variable. `adb pull` takes
  no `-q`. `git sparse-checkout add <path>` in the disposable repository removes uncommitted new files outside the set from disk (the
  commits survive): re-add them with `git sparse-checkout add`. `git add --sparse` is needed for a new file outside the set. A
  preflight must not contain `git am`: a patch that applies is applied, and `git am --abort` after success does nothing.
- **State left (2026-11-15, not a snapshot of a later day).** The phone runs a module build (the `services.jar` of the first module
  build of the day and the `SystemUI.apk` of patch `0049`, see "Second module round" below), not an image; verity is disabled
  and `adbd` runs as root; the decoy's launcher prefs hold the owner's look. The build tree holds patches `0046` to `0049` on top of
  `0045`. The measurements of `0049` are not made: the third run was armed and closed before the owner did it. `modbuild-lynx.sh`
  is not deployed on the build server's tool path; a copy was run from its scratch directory.

## Second module round of 2026-11-15 (`0046` to `0049`, ADR-232)

- **Black after the stage: the stage lived and died with the shade (measured, layer samples).** On the build of `0045` three of five
  duress unlocks showed 0.6 s of black after the stage picture; the others did not. In every unlock the `SwitchStage` layer was
  "hidden by parent or layer flag" in the sample in which the `NotificationShade` layer left, 0.45 to 0.55 s after the stage
  was added; the layer hierarchy listed the stage under the shade. A `transition snapshot: Display` layer then covered the screen for
  0.4 to 0.6 s until the launcher: it shows the stage picture when the snapshot was taken while the stage was up, and black when it
  was taken after. A stage in a window token of its own (`0046`) gave no black frame in four unlocks. Not proven: whether the stage
  was a child of the shade window or hidden by policy. How to read it: `layers.sh` samples every 0.1 s (2400 files in 240 s on a
  phone under load), `layerseq.py` lists the layer sequence, and in a sample file the `Layer [id] <name>` block says `visible` or
  `invisible reason=...`.
- **The background zoomed in when the stage gave way (measured, frames).** The owner saw it. The stage picture scaled by 1.10 about the
  centre equals the home wallpaper (mean absolute error 7.1 unscaled, 1.2 scaled, nothing shifted). Cause:
  `WallpaperController#zoomOutToScale` is `lerp(min, max, 1 - zoomOut)` (resources `config_wallpaperMinScale` and
  `config_wallpaperMaxScale`), SystemUI sends zoomOut from the blur ratio of the shade (`NotificationShadeDepthController#
  onZoomOutChanged`, 1 with the pad up, 0 when it is gone), and the stage drew the wallpaper at zoomOut 1. After `0047` the best
  scale is 1.00 with a normalised error of 0.01 to 0.08 in four unlocks (compare after dividing each frame by its mean: the scrim
  dims the picture). The method: the browser pane draws frames to a 54 by 120 canvas, grey values, a search over scale and shift.
- **The pad and the dim were cut after 0.2 s (logcat).** "Keyguard exit without a corresponding app to show" came 17 ms after
  `handleStartKeyguardExitAnimation` (the "remote animation disabled" branch of `KeyguardViewMediator`, no app behind the
  keyguard), the shade layer was gone 0.2 s into the 0.5 s of the bouncer to gone transition and the blur stopped at 66. An ordinary
  unlock, for comparison: `keyguardDone` 0.03 s after the check, the pre-hide animation (`OnHideAnimationFinished`, the pad's own
  disappear animation) 0.2 s, going-away at 0.23 to 0.25 s, the surface animation of the home about 0.43 s, the transition started
  to finished 0.55 s, the shade layer invisible at 0.5 to 0.55 s. A duress unlock: before-switch callback 0.07 to 0.1 s after the
  check, `keyguardDonePending` 0.10 s, going-away 0.31 to 0.42 s, so the pad flight starts 0.07 to 0.12 s later than the ordinary
  one (the decoy credential check). Blur samples: ordinary 89 until 0.28 s, 74 at 0.36, 29 at 0.44, gone at 0.56; duress 89 until
  0.36 s, 73 at 0.51, 22 at 0.61, gone at 0.67.
- **A hold that delays the whole exit made the home late (measured).** `0048` held `hide` and `onKeyguardExitFinished` for 450 ms.
  `onKeyguardExitFinished` carries `setShowingLocked(false)` and so `updateActivityLockScreenState(false, ...)`, the call that tells
  the window manager the keyguard is gone; with it held, the incoming home could not draw behind the keyguard's views: the decoy
  home was displayed 1.29 to 1.48 s after the check against 1.06 s on average on the build of `0045`. The owner reported it
  ("it takes longer before I see the apps"). Mean luminance per frame of a duress unlock showed the flash the owner reported: 48 to
  72 over 6 frames while the pad leaves, a drop to 45, a plateau of 51 to 76 percent of the final 86 that differed per unlock, then a
  jump to full when the shade went; the hide had come 37 ms before the transition finished (0.525 s from the going-away), so the
  scrim was frozen at the brightness of that moment. `0049` tells the window manager at once, holds 500 ms and fades the root view
  of the shade out in 250 ms; a hold of 320 ms was written, type-checked and then replaced before it was built, because it ends
  before the transition.
- **An automated security review of the commits (2026-11-15) found two real risks, both closed.** The early call to the window
  manager leaves it believing the keyguard is gone while SystemUI still shows it when the exit does not finish (the phone is locked
  again within 0.8 s, another switch starts, the exit or the fade is canceled): `restoreWmKeyguardShownAfterHeldExit` tells the
  window manager that the keyguard is shown again and restores the alpha of the shade on every such path.
- **The screen recording cannot show the pad.** The whole frame is black while the secure pad is up, so the pad flight and the dim
  of an ordinary unlock are not readable from it; the four ordinary unlocks of the run landed on a dark app (mean luminance 27
  against 86 for the home), so they were no reference for the decoy home either. The reference is a video of the phone from a
  second phone, an ordinary unlock from the home screen, a duress unlock and a return.
- **Working commands and lessons of the round.** A module build of `SystemUI` and `services` takes 13 to 15 minutes incremental;
  `format-patch <sha> --stdout` piped into `ssh <build host> 'cd <frameworks/base> && git am --3way'` lands a commit (compare
  `git hash-object <file>` on both sides first, and `git diff --stat <flashed head> HEAD -- core` must print nothing); the script is
  copied with `scp`, not piped from `cat` (the hook refuses a native read of a repository file); a running build is stopped by
  `kill` of the pids of `soong_ui`, `ninja` and the script, read from `ps` first, and its log then says `Got signal: terminated`.
  Proof of a push: `sha256sum` of the apk, the `odex` and the `vdex` on both sides and the start time of the `systemui` process after
  the reboot. A probe commit that plants a type error needs `git revert --no-edit HEAD` to undo (the flag `-q` after the commit
  name is refused); check that the tree equals the fix commit afterwards. The Bash hook resolves a `$VARIABLE` in a path as a
  relative path of the session directory and blocks it: write the absolute path out. `busybox httpd` serves `.mp4` as `text/html`
  unless it is started with `-c <conf>` holding `.mp4:video/mp4` (see the probe README). A `ps | grep -E '[x]'` inside a command that
  also contains the text of the pattern matches the shell itself and kills it (exit 144): kill in a call of its own. Killing the
  host side of `flight-sr.sh` leaves its loop running on the phone: kill its `sh` there.
- **Defect of `flight-sr.sh` (fixed).** `head -n -12`, the cleanup of old segments, is refused by the phone's `head` (`head: -n < 0`),
  so segments of earlier runs were never removed; the cleanup uses `sort -r | tail -n +13` now.

## Round of 2026-11-19 (image `2026111501`, ADR-274)

- **A deadlock killed `system_server` at the owner's unlock (`DUR-033`).** The lock at 15:58:53 had started a warm decoy
  (`startUser-12-bg-start-mode-2`, `RUNNING_UNLOCKED`, 14 processes, 793 MB summed PSS). The owner's unlock with the real PIN at
  about 16:02:13 froze the phone for 74 s and the Watchdog killed `system_server` at 16:03:27 (`WATCHDOG KILLING SYSTEM
  PROCESS`, dropbox `system_server_watchdog`, 21 KB; the framework restarted). The stacks: thread `LockSettingsService` runs
  `DecoyProfileHelper.maybeStopUnusedWarmDecoy` into `UserController.stopUser`, holds the UserController lock and waits in
  `UserManagerService.isPreCreated` for `mUsersLock`; binder thread `binder:1295_2` in `UserManagerService.isUserSwitcherEnabled`
  holds `mUsersLock` and waits for the UserController lock in `getCurrentUserId`. The cause is in `frameworks-base/0001` of
  `credential/duress-unlock-decoy`: `isUserSwitcherEnabled` calls `getCurrentUserId()` inside `synchronized (mUsersLock)`;
  `getUsersForUiDisplay` and `isMainForUiDisplay` of the same patch read it outside the lock. The fix reads it before the lock
  (commit `d662947` in `oblivios-platform/.worktrees/deadlock-timing`, base `7bc79c21e815`; the server type-check is OK with 0 errors
  in base and head and fails with a planted unknown symbol; not landed, not built, no device run: row `DUR-053`). One occurrence;
  whether every owner unlock with a warm decoy races is not known. How to read it: `adb root`, then `dumpsys dropbox --print
  system_server_watchdog` into a file and the stacks by `tid=` of the threads that `held by thread N` names.
- **The unlock time on `2026111501`, decomposed (`stages.py`, logcat of 6 duress unlocks, 2026-11-19).** From the credential check
  (T0): the owner credential fails at T0+0.027 s (`weaver read failed (INCORRECT_KEY)`), the decoy check starts at 0.031 and is
  verified at 0.100 s in a warm run (0.146 s in the cold run), the switch starts at 0.103, SystemUI receives
  `onBeforeUserSwitching` at 0.125 to 0.147, `keyguardDonePending` follows at 0.155 to 0.200 (RESET, a dismiss and a second
  message), the pad flight (`OnHideAnimationFinished`) takes 0.216 to 0.226 s as in the ordinary unlock (0.213 s; one run 0.322 s),
  going-away follows 0.03 s later and the exit takes 0.48 to 0.56 s (ordinary 0.50 s). Ordinary: SystemUI has the result at T0+0.033
  s (`sysui_latency [3,30]`, `keyguardDone`), before `Successfully verified` of the same call at 0.068 s, so the pad starts at once;
  the duress route has no early result and starts the pad 0.12 to 0.17 s later. Exit end: ordinary 0.78 s, duress warm 0.91 to
  1.03 s, duress cold 1.27 to 1.31 s. The cold route (the key was evicted at the owner unlock): verification at 0.146 s, the CE
  key installed at 0.156 s, then vold prepares the decoy's storage (`fscrypt_prepare_user_storage`, restorecon of `/data/system_ce`,
  `/data/vendor_ce`, `/data/misc_ce`, `vold_prepare_subdirs` of about 150 directories) until about 0.5 s, the switch starts at
  0.563 s, `onUserSwitching` at 0.93 s, and the held exit reached its limit (`Exit released after 2000 ms`); the decoy home was
  displayed 3.64 s after the check (`Displayed +3s206ms`). Weaver reads are serial in Citadel (about 17 to 19 ms each), so the
  second check cannot overlap the first.
- **What can and cannot be removed (arithmetic, not measured as a change).** The decoy verification costs 0.07 s more than the
  ordinary result (a second Weaver read and the scrypt of the decoy's credential), and the pad flight and the exit are 0.73 s
  together in both routes, so the exit cannot end before 0.10 + 0.03 + 0.213 + 0.03 + 0.50 = 0.87 s after a decision at 0.100 s,
  however fast the SystemUI chain is made. Removable: the SystemUI chain from `onBeforeUserSwitching` to the pad (0.03 to 0.05 s),
  the wait of the exit for the switch and for the decoy's storage preparation in the cold case (0.4 s and more; the stage window of
  `0046` covers the display, so the hold of `0026` is a safety that the stage may replace), and an early hint to SystemUI at the
  decoy's Weaver success (about 0.056 s) before the scrypt and the mint (0.100 s), which would put the cold decision at about
  0.08 s: 0.08 + 0.03 + 0.213 + 0.03 + 0.50 = 0.85 s, the owner's limit with no margin. The hint is presentation only and needs an
  abort path when the unlock that follows fails. Not removable without a decision of the owner: the 0.07 s of the second check
  against the ordinary result (the ordinary unlock waiting for the same time, ADR-088, or a faster duress pad flight and exit).
- **Decoy settings after a change in the decoy session (`DUR-048`, first half).** After a duress unlock, a change of brightness and
  dark mode, a lock and an unlock with the decoy PIN (0.78 and 0.79 s from the check, as fast as the ordinary unlock) and the return
  (1.33 s), `settings --user 12` read `screen_brightness` 1 and `ui_night_mode` 1 against 2 and 2 of user 0; after the framework
  restart both read 2 and 2.
- **Capture lessons.** `flight-sr.sh` wrote only three segments in the 9 minutes of the round (`fr_1795099724`, `770`, `815`), none
  after the third; the logcat file and `layers.sh` (2329 samples) covered the whole round. `adb shell` calls that need
  `system_server` hang while it is blocked: a read of the state during a hang cannot tell a slow call from a dead one, so read the
  uptime and `ps` first. A warm decoy (`RUNNING_UNLOCKED` while locked) after a return from the decoy is the state that raced.
- **Landed on the build tree (2026-11-19, the owner's yes).** `df45484fbd1a` (the early hint and the exit that is not held while the
  stage covers the display) and `cb61636661c2` (the deadlock fix), on `7bc79c21e815` of branch `oblivios-2026110200`, applied
  with `git am --3way` from the disposable repository (`.worktrees/deadlock-timing`, commits `82956d4` and `d662947`); read back
  after landing: the six touched files have the same blob hash on the server as in the disposable repository, the tree is clean and
  `git diff --stat 7bc79c21e815 HEAD -- core` is empty. The first `git am` carried only the second commit (`format-patch` took
  one range of two), and the deadlock fix followed in its own call. Reviewed by an own read of the diff of the timing patch (the
  hint is the existing `ICheckCredentialProgressCallback` of the credential check, wrapped for the decoy route; the mint is made
  before SystemUI is told; a failed route after the hint burns the grants and locks the device; the ordinary unlock does not reach
  the new code, which runs after `keyguardDonePending` only). Built as a module build and pushed to the phone the same day (the next bullets); the two switches
  `oblivios_duress_fast` and `oblivios_duress_hint` (both default 1) turn it off without a build.
- **The early hint failed on the device (module build `97b58169...`, 2026-11-19 18:55 to 19:02, the owner's report: "extreme
  regression").** Pushed with `adb disable-verity`, a reboot, `adb remount`, `adb push` of `services.jar`, `SystemUI.apk` and their
  `oat` files (`adb push` has no `-q`: the first push of `services.jar` failed silently behind a pipe, so every hash is read back on
  the phone), a second reboot. With the hint on, a cold duress unlock took 1.32 s with `Exit held` released after 2000 ms and the
  lock screen shown again, and the next one 0.67 s with a cut pad. Cause in the log: `SyntheticPasswordManager` calls the progress
  callback at the first stage of the credential, SystemUI's callback starts the pad of the user that is selected (user 0, the owner),
  `keyguardGoingAway` is asked for user 0 and the window manager holds it for the switch in flight; the later
  `keyguardDonePending: 12` finds the pad already running, and the pad of user 0 ends in `Not executing OnHideAnimationFinished.run()
  due to userId mismatch`. The design assumed that the pad starts for the decoy. `oblivios_duress_hint` was set to 0 on the phone
  (read back); the stage-covers bypass of the hold stays on. With the hint off the exit ends at 1.03 to 1.14 s (going-away at 0.52
  to 0.57 s) against 0.78 s ordinary, so the bypass alone does not reach 0.85 s.
- **What the frames show (30 fps, mean luminance of four quarters, no layer samples, `DUR-047`).** In both duress unlocks the
  wallpaper brightens as the pad leaves (61/91/109), one frame dims it (21/31/37), a plateau holds for 0.3 to 0.7 s at 75 or 44
  percent of the final brightness (77/114/137/109) and two frames jump to full; the plateau level differs per unlock, which the fade
  of `0049` was meant to remove. The dock of the decoy home appears about 3.0 s after the check although the launcher logs
  `Displayed` +0.45 s after its start (the first draw is the empty home). The return takes 0.95 to 1.17 s and shows a dip, a
  plateau at 93 percent and a step (the owner's "2 percent lighter"). `flight-sr.sh` wrote two segments in 9 minutes and none while
  the screen was off. Reading frames in the browser pane is fast now: 71 frames in under 20 s with `frames.html` (a video element,
  seek per frame, a 54 by 120 canvas, four luminance quarters per frame, a contact sheet) served by `busybox httpd` with byte ranges;
  the `-c` conf did not set the mp4 type, the browser plays it anyway.
- **The redesign of the hint and the state this round left (2026-11-19).** `da265fb` in `oblivios-platform/.worktrees/deadlock-timing`
  (one file, `KeyguardViewMediator`, on top of `82956d4`): the early start is armed from `keyguardDone`, the route that the match of the
  credential check takes (the first design hooked `keyguardDonePending` and the early match came through `keyguardDone`); the
  exit belongs to the decoy: `sameExitUser` lets the pad flight, the going-away and the exit animation go on when the switch changes the
  selected user from the owner to the decoy, and the user-present broadcast goes to the decoy; the decoy is looked up for each
  unlock, not cached at the lock. The server type-check was run again by this session: 0 errors in base and head, and a planted type
  error (`TC_PROBE=2`) fails it. Not landed, not built, not run on the phone at that point (landed, built and run later the same day, see the bullets below); the brightness plateau, the empty home of 3 s and the
  dip of the return are not addressed (hypotheses only), and every ordinary unlock now makes one `getUsers` call and one grant
  redemption off the main thread after the pad has started, so the ordinary unlock is to be measured after a build (ADR-088). State
  left: the phone runs the module build of `82956d4` with verity disabled, an overlayfs remount and `oblivios_duress_hint` 0 (a
  `fastboot flashall` of the flashset restores the partitions); the build tree is at `cb61636661c2`; the outputs of the module build
  are on the server under `out-lynx`. `tools/build/modbuild-lynx.sh` sets `BUILD_NUMBER=2026111401` while the flashed image is
  `2026111501`: the build of the day ran from a copy in the server's scratch directory with the image's number, so that the
  incremental state of `out-lynx` stayed that of the image (a changed number was not tried). Landing more than one commit:
  `git format-patch -1 <commit>` for each (`format-patch a^..a b^..b` gives only the second patch). The Bash hook reads a `$VARIABLE`
  in a path as a relative path and blocks it: write the path out. `flight-sr.sh` wrote two segments in 9 minutes and none while the
  screen was off, so a series that needs frames arms the recorder first and reads its segments before the 9 minutes are over.
- **What the source showed about the early start (read in the build tree at `7bc79c21e815` by the timing session, 2026-11-19).**
  The ordinary unlock starts the pad at 0.033 s because `SyntheticPasswordManager.unlockLskfBasedProtector` calls
  `progressCallback.onCredentialVerified()` right after the Weaver and Gatekeeper stage ("so the keyguard UI can proceed
  immediately"); in SystemUI the early match goes `onEarlyMatched`, `onPasswordChecked(matched)`, `dismiss`, `finish`, then
  `keyguardDone(0)`, `tryKeyguardDone(0)` and `startPreHideAnimation`, not through `keyguardDonePending` (the first design hooked
  `keyguardDonePending`, which this route never reaches: no stage, no stage-covers bit, so the window manager held the going-away for
  2000 ms, and the old chain of `handleBeforeUserSwitching` then ran on top of the owner's running exit). `onChecked(matched)` does
  nothing and `onChecked(not matched)` shows the wrong-PIN message. The duress route passed `progressCallback = null` to the decoy's
  `doVerifyCredentialInner`, so SystemUI got no early result. Four guards compare the requested user with the selected user
  (`OnHideAnimationFinished`, the going-away runnable on the background executor, `handleStartKeyguardExitAnimationInner`,
  `handleCancelKeyguardExitAnimation`) and the switch flips the selected user to the decoy in the middle of the pad flight (warm: about
  0.1 s after the hint), which is why the redesign needs `sameExitUser`. `ActivityTaskManagerService.keyguardGoingAway` holds the
  going-away while `isDecoySwitchInFlight()` (from the mint to `moveUserToForeground`, 2 s at most), so on a cold decoy the exit
  cannot start before about 1 s unless the stage covers; `deferDecoyHomeStart` already starts the decoy home at once when the keyguard
  is not showing. A pad or going-away that waits for the switch cannot meet 0.85 s (the cold switch starts at 0.56 s, the exit would
  end at 1.15 s or later): the exit has to run before the switch, covered by the stage. In the first design the hint passes through a
  thread of its own (the verifying thread holds the SyntheticPasswordManager lock and the mint reads the user list), the mint is
  made once, and a route that fails after the hint burns the two grants, ends `DecoyLookGate` and `DecoyWallpaperHold` and calls
  `IWindowManager.lockNow` (fail closed). Behaviour to check on a device once it runs: success feedback and
  `reportUnlockAttempt(user 0, true)` now happen at a duress unlock as at an ordinary one (haptic, the failed-attempt counters of
  user 0 reset); the stage window is not touchable, so touches go through to the owner's windows beneath for about 1 s on a cold
  decoy; the finger route has no hint (no progress callback) and only gets the stage-covers bypass (`DUR-029`); an unconsumed
  grant of an aborted mint stays for up to 30 s, harmless without a switch; `DUR-036` is not addressed.
  Two hypotheses without layer samples, for the next round: (1) the plateau: the old exit has no app behind the keyguard, so the
  held-exit branch (500 ms hold, then a 250 ms fade of the shade root) keeps the scrim at the alpha that the bouncer-to-gone
  transition reached (51 to 76 percent in the comment of the mediator) and then jumps; the fade of `0049` sits at the end of the hold
  and cannot remove it; an early exit runs on the owner's session, where apps exist, and may take the ordinary exit branch instead:
  check with `layers.sh` and the log line "Keyguard exit without a corresponding app". (2) the empty home of 3 s: the stage is
  released when an activity window becomes the wallpaper target, the first draw of the decoy's launcher (`Displayed` +0.45 s), but
  the dock and the icons are bound after that (cold `IconCache` and `LauncherModel` of the decoy); a candidate is to release the stage
  at `reportFullyDrawn` of the home with the stage's own 3 s limit as fallback; the launcher's own log (`Launcher`, `LoaderTask`,
  "Fully drawn") from the round decides it.
- **The redesign on the phone (module build of `735725759547` = `da265fb` on `cb61636661c2`, hint on, 2026-11-19 19:58 to 20:18, two series, `stages.py`, `screenrecord` frames in the browser pane, `layers.sh`; the owner types the PINs).** The time is met: the exit ends 0.76, 0.77, 0.78, 0.85 s (series A) and 0.77, 0.74, 0.80, 0.86 s (series B) after the check, ordinary 0.77 to 0.78 s, returns 0.88 to 1.07 s; `keyguardDone: 0` arrives at +0.05 s and `early hint, authorized exit armed for 12` 2 ms later. Two decoy states: cold (a lock after an ordinary unlock; the decoy is `RUNNING_LOCKED`, the CE key is installed at the check) and warm (a lock after a return; the decoy `RUNNING_UNLOCKED` 2.3 s before the check, started 0.4 s after the lock). The picture is not met. Layers of series B (`layerseq.py`, epoch-ms names), warm: `SwitchStage` at +0.13 s, `transition snapshot: Display` alone +0.82 to +1.32 s, `SwitchStage` again until +3.37 s, then launcher and wallpaper layer together; the decoy launcher logs `Displayed` +1.26 s, so the stage leaves on its `FALLBACK_MS` of 3000 ms (plus the fade), not on the release: `DecoyWallpaperHold.end()` (the only sender of `STAGE_RELEASE`, in `WallpaperController` when an activity window becomes the wallpaper target) did not release it in time; why is not read yet (candidates: the hold had ended or the target was already an activity window at the going-away). Cold: the stage at +0.06 s, the snapshot +1.76 to +2.76 s, the launcher at +2.76 s and the `Wallpaper BBQ wrapper` layer 0.36 s later (the black background of the owner; frames show status bar and icons on black, then the wallpaper); the cold decoy launcher logs `Displayed` +2.43 and +2.53 s after its start (a new process), about 2.8 s after the check, so a cold home with icons cannot come earlier than that while the launcher starts at the check. In the second cold unlock of series B a launcher layer is composited next to the shade at +0.56 s and the going-away is requested for user 0 (the owner launcher resumed); in series A the first (cold) unlock showed the owner home for 0.2 s (frames equal to the ordinary reveal) and then its icons on a black wallpaper for 2.3 s. The owner's "mirrored" icons: the two middle icons of the decoy home are swapped against the owner home (decoy: cube left, gallery right; owner: gallery left, cube right), because the decoy launcher database loads the default favorites (`WorkspaceItemProcessor` "marking restored: com.android.dialer ..."), and `DecoyLauncherLook` copies only the look (theme, shape, grid; it queries the owner's `GridCustomizationsProvider` from a `system_server` thread, which logs "Outgoing transactions from this process must be FLAG_ONEWAY"), and the decoy launcher activity is created twice 0.04 s apart. Frames of the warm unlocks show no brightness plateau (the first frame is at the final 77/114/137/109); the return still dips (41/54/60/53) and flickers 0.8 s between 77/113/137/109 and 62/92/110/89. The panel brightness stepped from 0.0050 to 0.0222 for 1.4 s at the switch of the first cold unlock of series A (`DisplayPowerController: Switching user`), the other switches kept the owner value. `adb pull` of the whole recorder directory stopped at a root-owned segment of an earlier boot (`Permission denied`): pull the segments of the round one by one; `layers.sh` of 330 s gave 3334 samples and its pull took about 6 minutes.
- **Options for a perfect picture (owner's choice, 2026-11-19: (a) with (c) and (d); (b) not chosen).** (a) A stage that shows the decoy home itself (wallpaper and icons, from a pre-rendered picture of the decoy home) until the real launcher has drawn: instant in both states, costs a stored or in-memory picture and its refresh. (b) A decoy launcher started before the check (at the warm start, or at every lock): the warm home then needs about 1 s, the cold state needs the decoy unlocked at every lock (memory and battery, `DUR-032`). (c) The same layout in the decoy as on the owner home (copy of the favorites of the owner launcher for the apps the decoy has) and a decoy wallpaper engine that is bound before the stage leaves. (d) The stage released on the first draw of the home with icons, not the wallpaper target, and the return rewritten without the dip. (a) with (c) and (d) reaches the picture in both states; (b) only the warm one.
- **Landing and module build of the redesign (2026-11-19 19:40 to 19:56, the owner's explicit yes for both).** Preflight on the build tree: head `cb61636661c2`, branch `oblivios-2026110200`, clean tree, no `soong_ui`, 39 GB free; `git format-patch -1 da265fb --stdout`, the sha256 of the patch equal on the workstation and the server, `git apply --check`, `git am` (author `ObliviOS Build`, committer the build user, as the tree's earlier commits), head `735725759547`, `git diff --stat cb61636661c2 HEAD` one file with 53 insertions and 23 deletions, the blob of `KeyguardViewMediator.java` equal to the disposable repository by `sha256sum`. Type-check before the build: `typecheck-duress-frameworks.sh <worktree> 82956d4` printed `typecheck: OK` (0 errors in base and head) and `TC_PROBE=2` failed with exactly the planted error. Build: a detached run of the scratch copy `modbuild-lynx-2026111501.sh` (the BUILD_NUMBER of the flashed image, `m -j6 services SystemUI`), 11:36, exit 0; `services.jar` unchanged (same sha256 as the earlier push), so only `SystemUI.apk`, `oat/arm64/SystemUI.odex` and `.vdex` were pushed (verity was already disabled and the overlay in place: `adb root`, `adb remount` printed `Remount succeeded`, three `adb push` with exit 0 and the sha256 of each file read back on the phone equal to the build output, the SELinux context unchanged), then `adb reboot` (boot completed 30 s later) and the owner's PIN; `oblivios_duress_hint` was set 0 to 1 only after that unlock (read back).
- **The picture work of the second session (disposable repository `oblivios-platform/.worktrees/deadlock-timing`, 7 commits on top of the untouched base copies of `DecoyLauncherLook` and `WallpaperController`, 2026-11-19 20:30 to 21:01, interrupted by the owner; type-checked at the close, not landed, not built, not run).** Causes found in source and log: `DecoyWallpaperHold` ended when any activity window became the wallpaper target; on a cold switch that fired on the starting window of the home and the stage left 1.7 s after the check, on a warm one the stage itself was the wallpaper target after the going-away and never released, so it left on its 3000 ms timer. Changes: the window manager polls for the home activity of the target user with a drawn window and a drawn wallpaper window of that user and ends the hold with the task of that home (the broadcast carries task and user; the hold lasts 7 s); the stage keeps a memory-only task snapshot of the home of each user, shows the incoming user's home over the wallpaper from the exit on, consumes touches, does not ask for the wallpaper (the home becomes the target behind it) and leaves on the release (fallback 6 s); with no wallpaper it covers with black and keeps only a picture that lets the wallpaper through (a transparent stage left the owner home on screen under the exit of the first duress unlock after a boot; an opaque snapshot would hide the wallpaper), taken through `TaskSnapshotManager` (the raw call of the snapshot service gave no reference back); the reveal starts where either exit starts (the exit of a cold decoy animates the owner home task behind the stage, the one of a warm decoy has no app); the release does not need `firstWindowDrawn` (an activity that was stopped and resumed keeps a drawn window with it cleared); the decoy home gets the layout of the owner home: the launcher's own export of the owner home is read when the device locks and imported into the decoy launcher before its home starts, only for packages installed for the decoy (the import keeps the text in the decoy blob store and a missing app would show as an installing placeholder; the pointer it leaves in the decoy secure settings is deleted), through a call with a timeout on a thread of its own because the launcher drops the export task while its model has not loaded; the look gate holds the home start up to 4 s for it; the decoy's own layout is not exported. Size against the base copies: 7 files, 678 insertions, 85 deletions. Type-check at the close (`typecheck-duress-frameworks.sh <worktree> 29ec93e`: 5 services and 2 SystemUI files): 0 errors in base and head, and the planted error (`TC_PROBE=2`) fails it. Not addressed: the dip and flicker of the return, the brightness step of the first cold switch. Open: a native review of the diff, the owner's yes to land (`git format-patch -1` per commit), the owner's yes to one module build, then series with frames and layers (cold, warm, return, ordinary). State left (2026-11-20, read from the phone, the build tree and the repositories): the phone runs image `2026111501` with the module build of `735725759547` (switch `oblivios_duress_hint` 1, verity disabled, overlay remount), the owner's session is the current user; the build tree holds `735725759547` on `cb61636661c2`, clean, no build running; the disposable worktree has an untracked `.serena/` that Serena's project activation created; the foundation repository is ahead of its upstream and not pushed. The frame reader of the round is `tools/duress-timing-probe/frames.html`. Superseded on 2026-11-20: the seven commits are landed on the build tree and the phone is unchanged ("Round of 2026-11-20").
- **Source and log findings behind the picture work (second session, build tree at `735725759547`).** The only release of the stage is `WallpaperController.updateWallpaperWindowsTarget` calling `DecoyWallpaperHold.end()` when the new wallpaper target is any window with an `ActivityRecord`; `findWallpaperTargetFunction` takes the top window that has `FLAG_SHOW_WALLPAPER` and is ready and skips a non-activity window in favour of the activity below it only while `isKeyguardGoingAway()`, so the stage (type `TYPE_STATUS_BAR_ADDITIONAL`, layer 16, asks for the wallpaper; `STATUS_BAR` is 15 and `NOTIFICATION_SHADE` 17) is the target after the going-away and no activity can become it while the stage exists. Warm unlock of series B: stage +0.07 s, `transition snapshot: Display` alone +0.76 to +1.26 s, stage again to +3.31 s (the launcher `Displayed` at +1.2 s hidden under it), left on the 3000 ms timer. Cold: the stage left at +1.7 s (the release fired early, on the starting window of the decoy home or the owner home), then the snapshot alone to +2.7 s. Timeline of the cold decoy launcher process: zygote fork +0.62 s, `am_proc_bound` +1.73 s, look written by `DecoyLauncherLook.applyTo` +2.2 s (`DecoyLookGate` holds the home start, at most 1.5 s), `wm_restart_activity` +2.27 s, `onCreate` +2.57 s, `Displayed` +2.72 s, its loader cancelled and restarted right after the first draw so the first launcher frame has no icons and they follow 0.2 s later. The status bar is not visible during the stage (the stage sits above it); frames of the cold segment: pad black to 40.6 s, wallpaper-only stage 40.8 to 42.2 s, black with status bar at 42.6 s, wallpaper and icons at 42.8 s. Launcher3 offers `ModelProxyProvider.call` with `EXPORT_LAYOUT_XML` and `IMPORT_LAYOUT_XML` (authority `com.android.launcher3.settings`, permission `ACCESS_LAUNCHER_DATA`, held by `system_server`): the import clears the database and loads the XML atomically, writes `Settings.Secure launcher3.layout.provider` and a blob in the launcher's own user, and drops items whose package is missing. `ITaskSnapshotManager.takeTaskSnapshot(taskId, updateCache=false, low=false, decors=false)` returns a real snapshot of a visible task (a home too) with alpha for a translucent window, without wallpaper and bars; SystemUI holds `READ_FRAME_BUFFER`. The module build is `m services SystemUI` only (no Launcher3), so a change in the launcher itself can never ride in a module build.

## Round of 2026-11-20 (review and landing of the picture work, ADR-274)

- **Native review of the seven commits (no subagent).** Diff `29ec93e..b793a08` of the disposable repository: 7 files, 678 insertions, 85 deletions. Read as whole files: `AuthorizedSwitchStage` and `DecoyLauncherLook`; the rest as diffs with the callers (`DecoyProfileHelper` for `DecoyWallpaperHold.end`, `DecoyLauncherLook.read` and `applyTo`). No defect that blocks a build was found. Not reviewed: the Launcher3 code beyond the export and import entry points, the return path (its dip is not addressed by these commits), and the behaviour on a device.
- **Checked by the session, not taken from the report of the earlier one.** (1) `typecheck-duress-frameworks.sh <worktree> 29ec93e`: `files: services 5, systemui 2 java and 0 kotlin`, 0 errors in base and head, last line `typecheck: OK`; with `TC_PROBE=2` the head has 1 error (`incompatible types: String cannot be converted to int` in `KeyguardViewMediator`) and the last line is `typecheck: FAILED`. The exit code of the script is 0 in both runs (its remote part ends in an `echo`): the last line decides. (2) Source on the build tree: `LauncherLayoutBuilder.writeNodes` writes `attribute(null, key, value)` with `ATTR_PACKAGE_NAME = "packageName"`, `TAG_FOLDER = "folder"` and `TAG_APP_PAIR = "apppair"` (`AutoInstallsLayout`), so `DecoyLauncherLook.keepInstalled` matches the real export; the export covers `CONTAINER_DESKTOP` and `CONTAINER_HOTSEAT` and runs through `model.enqueueModelUpdateTask`, the task that a launcher without a loaded model drops. Source read only, no run. (3) Lock order: `DecoyWallpaperHold.begin` runs under `UserController.mLock` and only calls `removeCallbacks` and `post` on the window manager's `mH`; the poll takes `mGlobalLock` on `mH` and calls `end` outside it; the two `end()` calls of `DecoyProfileHelper` run outside locks; `DecoyLauncherLook.read` at the lock runs on the thread `DecoyLauncherLookRead`. No inversion like the one of `DUR-033`.
- **Findings left for the device series (none blocks the build).** (1) The stage window is `PixelFormat.OPAQUE` in every case (the base had it only with a bitmap) and `fadeOut` fades the alpha of its root view; `ViewRootImpl` calls `setOpaque` on the surface and on the renderer (lines 10453 and 12508 of the build tree, the condition is not read), so the fade may darken toward black instead of showing the home beneath. A one-word fix is `TRANSLUCENT` (the black background is in the view); not measured, read it in the frames at the end of the stage. (2) A switch with no stored picture (the first duress unlock after a boot, after SystemUI restarted, or after `STAGE_RESET` for a changed look or layout) shows the wallpaper alone until the real home has drawn, now up to about 3.5 s cold because the home start waits for the layout import (`DecoyLookGate.MAX_MS` 4 s); that unlock cannot meet "no empty home", and memory only is the design (nothing is persisted): the owner's call once it is measured. (3) The stage consumes touches and sits above the status bar, with a fallback of 6 s: the icons of the picture do not react for about 3 s cold and the status bar appears when the stage fades (the base: not touchable, 3 s). (4) The picture is the home of the last visit: a clock, a date or a badge in it differs from the real home at the hand-over (a 200 ms fade). (5) SystemUI keeps up to two screen-size pictures (one per user) and the wallpaper bitmap: measure its PSS. (6) Minor: `prune` removes an `apppair` only when it is empty, not when one of its two apps is missing; the comment above `DECOY_LOOK_WAIT_MS` in `DecoyProfileHelper` still says the window manager starts the home after 1.5 s (now 4 s). (7) The import leaves the text of the layout in the decoy's launcher storage (the owner's choice for the layout) and the pointer `launcher3.layout.provider` in the decoy's secure settings until `applyLayout` deletes it after the import: after the first run read `settings list secure --user 12` and expect no `layout` key.
- **Landing on the build tree (2026-11-20, the owner's yes).** Preflight: branch `oblivios-2026110200`, head `735725759547`, tree clean, no `soong_ui`, 39 GB free. Seven patches by `git format-patch -1 <commit> --stdout` in the order `bee24bf`, `87fff7e`, `80eb7cf`, `2da339f`, `8f8739f`, `ca0408b`, `b793a08`; the sha256 of each patch equal on the workstation and the server (7 of 7). The patches touch the same files, so `git apply --check` of a later one fails against the unpatched tree: check and `git am` went patch by patch in one remote loop with `set -e`, with no committer override (author `beau4201` as in the disposable repository, committer the build user; the author of `735725759547` is `ObliviOS Build`). Head `70532eddce4d`, the commits in order `af9ea1e51ff2`, `85a5d02fba4f`, `5df6dcbfe7f1`, `7c72549f5859`, `b5715e4581c7`, `c01ad69d9b89`, `70532eddce4d`. Read back: `git diff --shortstat 735725759547 HEAD` is 7 files, 678 insertions, 85 deletions (equal to the disposable repository), the `sha256sum` of the seven touched files equal to the disposable repository (7 of 7), tree clean. The line `Auto packing deferred; not on AC` that the server's git prints is harmless.
- **What the module build and push of this change had to cover (the owner's yes came later the same day, see the next entries).** `services.jar` changes this time (`WallpaperController`, `UserController`, `DecoyWallpaperHold`, `DecoyLookGate` and `DecoyLauncherLook` are in it; the earlier build of the day left it unchanged), so the push is `services.jar` with `oat/arm64/services.odex`, `.vdex` and `.art`, and `SystemUI.apk` with its `oat/arm64` `.odex` and `.vdex`; an `odex` of the old jar is not used with a new one. The phone holds the files of the earlier module build (`services.jar` sha256 `97b58169e04027433616370c4333f83862c9b66a832c60ef0dc1db659d8fc2e4`, `SystemUI.apk` `73293096d46ea74f7639de34a0185293008cbce3eb51c069f5e5a6ec66b7a6ed`, read 2026-11-20; verity disabled, overlay remount in place, switch `oblivios_duress_hint` 1): pull them to the workstation before the push, so that a rollback is a push. A fault in the new `services.jar` at boot can loop the phone; the recovery is `fastboot flashall` of the flashset after `adb reboot fastboot`. The scratch script `<build-root>/scratch/modbuild-lynx-2026111501.sh` (not executable: `bash <script>`) and the patches in `<build-root>/scratch/land.*` are on the server.
- **Build, push and series of the picture work (2026-11-20, the owner's yes for one module build).** Module build of head `70532eddce4d`: exit 0 in 15:20 min; 7 of 7 files (`services.jar`, `services.{art,odex,vdex}`, `SystemUI.apk`, `.odex`, `.vdex`) equal by sha256 on the server, the workstation and the phone after `adb root`, `adb remount`, push, `chmod 644`, `restorecon`, reboot (boot completed, crash log empty). The files of the earlier module build are the rollback set in a folder `rollback-2026111501` next to the repositories (outside them). Owner after the first series: the first duress unlock after a boot takes about 3 s until the apps show, the dim glitch is still there, the dark glow of the return is far too fast ("the fourth time").
- **The method that was missing: a screen capture that shows the pad and the dim (2026-11-20).** `screenrecord --capture-secure` as root records the secure layers at 60 fps (`SurfaceFlinger::createVirtualDisplay` allows a secure display for root, graphics and system; `screenrecord` has the hidden flag, `gSecureDisplay`). Since then the dim is a number: mean luminance per frame. Ordinary unlock: pad 51, one smooth accelerating ramp to 108 in 0.47 s, no plateau. Warm duress unlock: the same ramp, then it stops at 95 or 75 for 0.5 to 0.6 s and goes to 109 in one frame at +1.0 to +1.24 s (the 250 ms fade of the held exit is not visible). Return: 85 in 0.18 s, back to 52, then 109 in 0.45 s, with flicker. Both exits finish the bouncer-to-gone transition at +0.73 s, so the scrim writer that holds the plateau is not found; ScrimController applies `BouncerToGoneFlows` alphas by steps only (`mBouncerToGoneScrimAlphaConsumer`). Evidence and numbers: `DUR-047`, `DUR-019`. Lesson: `adb shell` sessions die when the USB link drops (three series were lost on 2026-11-20); a series records on the phone, see `build-and-device-rules.md`.
- **State left at the close (2026-11-20, not a snapshot of a later day).** Phone: the module build of head `70532eddce4d` with verity disabled and the overlay remount, `oblivios_duress_hint` 1, the owner's session current; the USB link was down at the close, so a detached recorder loop (`/data/local/tmp/flightloop.sh`) and `logcat -f /data/local/tmp/series.log` may still run on it: after `adb root`, `touch /data/local/tmp/flight.stop` ends the loop and `ps -A -o PID,ARGS` names the `logcat` pid to kill by number; the series files (`flight`, `series.log*`, `probe_snap2`, the two scripts) stay in `/data/local/tmp`. Workstation: the rollback set (the seven files of the earlier module build) and the outputs of this build sit in two folders next to the repositories, outside them; the WireGuard connection `wgbeau` is up (its config copy with the private key is in the session scratchpad). Build server: the tree is at `70532eddce4d`, no build running. Disposable repository `oblivios-platform/.worktrees/deadlock-timing`: unchanged. Nothing of this series is pushed to a remote except the snapshot of the close.
- **Next (taken up in the two rounds of 2026-11-21), in this order.** (1) Confirm the cause without a build: enable the window manager's protolog groups for transitions and sync engine (`adb shell cmd protolog_configuration help` and `groups list`; the old `cmd window logging` is deprecated and does nothing) and read the lines of one duress unlock (the collected display area, `Screenshotting Display`, the sync set and its ready time) next to the secure capture and the layer sampler; compare the global configuration of the owner and the decoy (`updateConfigurationAndProfileIds` at +0.06 s) to find what changes it. Fallback when the log does not decide: a debug-only per-frame log in SystemUI of the scrim alphas (every writer goes through `ScrimView.setViewAlpha`, `ScrimState.java:610`, `ScrimController.java:311-373`), one module build, needs the owner's yes to land and build. (2) The fix from that log, verified before the owner looks: the duress and return luminance curves equal the ordinary curve (no plateau of 5 frames below 99 percent of the final, no step above 3 per frame, ramp length within 10 percent). (3) The first duress unlock after a boot: store the decoy home picture on disk so the stage shows it at once (ADR-280: no RAM cost, no prewarm, a forensic trace is accepted; the design is open). (4) The decoy `Displayed` of the warm unlock must be at most 1.1 s (it is 0.96 to 1.28 s).
- **Hypothesis for the plateau, read in source after the series (2026-11-20; confirmed in part on 2026-11-21, see the next round; supersedes the candidate "held exit" for the plateau).** The plateau and the one-frame step are a frozen picture, not the scrim: the user switch runs a window-manager transition (`Transition requested (#90) type OPEN` at +0.06 s, absent in an ordinary unlock) whose changes include the display (`IS_DISPLAY`, `snapshot=`); `DisplayArea.onConfigurationChanged` calls `TransitionController.collectForDisplayAreaChange` (`DisplayArea.java:655`), which calls `Transition.collectVisibleChange(display)` and `ScreenshotFreezer.freeze` (`Transition.java:4870`): a screenshot of the display (`SECURE_CONTENT_POLICY_CAPTURE`, so with the pad) is put on top (`setLayer MAX_VALUE`) as the layer `transition snapshot: Display` until the sync transaction applies, +1.0 to +1.3 s. Everything under it, the shade, the scrim animation, the held-exit fade and the decoy home, is hidden, which fits: the plateau level differs per unlock (the snapshot is taken at a different moment of the ramp), the end is one frame, the 250 ms fade is never visible, `DUR-036` (a flat fill) and, on the return, the drop back to the dark pad value (52) after the first ramp (the snapshot of the start state). To confirm: the layer sampler and the secure capture together (a `transition snapshot: Display` layer in the samples at the frames where the luminance is flat); to find: why a configuration change reaches the display on a switch (`updateConfigurationAndProfileIds` at +0.06 s; compare the global configuration of the owner and the decoy: font scale, locales, font weight). A fix would stop the freeze of an authorized switch in `Transition.collectVisibleChange` (services.jar), or make the configurations equal. Second series (14:43 to 14:44, secure capture, layer sampler and logcat together, three duress unlocks and a return; the sampler ran at about 12 samples per second): the plateau is lower than the peak of the ramp (82 then 78, in an earlier series 101 then 95), so the picture jumps back to an earlier frame; the layer `transition snapshot: Display` first appears +0.74 s (duress B), +0.82 s (duress C), +0.68 s (return) and +1.36 s (the cold duress A, with the launcher layer visible from +0.33 s), while the plateau starts at +0.52 s, so the snapshot alone does not explain the first 0.2 s; the shade window logs `Canceling draw cancelDueToSync=true` at +0.73 s of a duress unlock, so a held sync of the transition is the second candidate. Both hold frames of the same transition. Dead ends: playing the segment at 0.25 speed and counting `totalVideoFrames` gives about 2.4 samples per second in the browser pane (use `frames.html` with `step=0.016667`); the busybox `-c` conf did not change the content type of the mp4 (served as text/html), the pane plays it anyway; port 8765 was held by the server of another session, use another port.

## Round of 2026-11-21 (the protolog of the switch, ADR-274)

- **Series.** Phone: `lynx` `2026111501` with the module build of head `70532eddce4d` (`services.jar` sha256 `3e99d57312ad627524996b3ebfe6fae74374c685318fc76157a6e510640a5b0e`, equal to the build output on the workstation), up 6:20 h, the decoy user 12 not running before the series. Protolog to logcat with `cmd protolog_configuration logcat enable WM_DEBUG_WINDOW_TRANSITIONS WM_DEBUG_SYNC_ENGINE WM_DEBUG_CONFIGURATION WM_SHELL_TRANSITIONS` (it does not survive a reboot). Detached on the phone: `logcat -v threadtime -b main,system,events,crash -f /data/local/tmp/s3/series.log -r 30720 -n 6` and `flightloop.sh` (secure capture, 45 s segments); no layer sampler, whose load of about 12 samples per second may move the timing. Owner, 15:10 to 15:13: one ordinary unlock (15:10:59.5), four duress unlocks (A 15:11:15.2, cold and the first after the boot of 08:46; B 15:11:55.3; C 15:12:23.3; D 15:12:49.7) and three returns (15:11:38.0, 15:12:09.5, 15:12:42.4). Frames read with `frames.html` at `step=0.016667`.
- **The configuration change of a switch comes from the theme overlays of SystemUI [measured].** Every duress unlock logs, in this order: `ThemeOverlayController: ThemeHomeDelay: ThemeOverlayController ready with user 12`; 20 to 50 ms later `Config changes=80000000` (`CONFIG_ASSETS_PATHS`, twice, about 0.12 s apart); `TransitionChain: Combining updateGlobalConfig into #<the OPEN transition of the decoy home> from startHomeAct`; `SyncGroup <n>: Adding to group: Display{#0 ...}`; and 20 to 70 ms after the first change `Screenshotting Display{#0 ...}`. Times after the check (ready, change, screenshot): A +1.68, +1.73, +1.80; B +0.79, +0.80, +0.82; C +0.63, +0.67, +0.72. Just before, every app process logs `ActivityThread: assets removed: [/data/resource-cache/com.android.systemui-neutral-6hGu.frro, ...-accent-QTCh.frro, ...-dynamic-cCrN.frro]` and `assets added: [...-neutral-a1ZO.frro, ...-accent-KXCP.frro, ...-dynamic-52SE.frro]`, `idmap2d` starts, and the zygote logs `boot_progress_preload_start` in the same millisecond as the change. The upstream user-switch path of `ThemeOverlayController` (the user tracker callback calls `reevaluateSystemTheme(true /* forceReload */)`, then `updateThemeOverlays` passes new fabricated overlays to `ThemeOverlayApplier.applyCurrentUserOverlays`) registers the three fabricated overlays again under new file names; the framework is one of their targets, so the global configuration gets an asset change on every switch, even though owner and decoy have the same colours (`frameworks-base/0005` gives the decoy the owner's colours and does not stop the re-registration) [verified-in-source: `oblivios-platform/.worktrees/squash-2611/packages/SystemUI/src/com/android/systemui/theme/ThemeOverlayController.java`, lines 652 to 676 and 782 to 886; the copy on the build tree at `70532eddce4d` is not read]. The `ThemeHomeDelay` lines are upstream code (`ActivityManagerService`, `RootWindowContainer`, `ThemeOverlayController`).
- **What the change does to the switch [measured].** With the display in the sync group every window's draw is held (`Canceling draw ... cancelDueToSync=true` for NotificationShade, StatusBar, SwitchStage and ScreenDecorHwcOverlay from +0.82 in B and C), the display screenshot stays on top until the sync applies, and the decoy launcher, still starting, is relaunched (`finishDrawing of relaunch: Window{... u12 com.android.launcher3/...QuickstepLauncher} 205ms` in C), which keeps the sync open: `SyncGroup ... Finished!` at +1.18 (B), +1.13 (C) and +3.10 (A); the decoy home `Displayed` +416 ms (B) and +515 ms (C) after its transition started at +0.65 and +0.54, and +2774 ms in A. On the return the same change runs as a transition of its own (`CHANGE` #40 in return A, #55 in return B from +1.19 to +1.83, draws held by its sync), after `ThemeOverlayController ready with user 0`.
- **Luminance of the series [measured]** (mean of four quarters, final 108 to 109; times after the check, anchored on the wake, see the next bullet). Ordinary: pad 51 to 52, one smooth accelerating ramp to 108 from +0.09 to +0.54 s (0.45 s). Duress B: flat until +0.27, a step from 56 to 66 in one frame at +0.29, a ramp to 109 in 0.18 s ending at +0.48, no plateau (the ramp ended before the home transition started at +0.65); the step follows the start of the keyguard exit at +0.26 (`start keyguard going-away transition` of #46, `Keyguard exit without a corresponding app to show`). Duress C: ramp from +0.26, a plateau at 95 to 96 from +0.51 to +0.94 (26 frames), one frame to 109 at +0.96. Return A: a rise from 54 to 85 from +0.08 to +0.24, a drop to 52 in one frame at +0.26, flat for 0.23 s, a ramp to 109 from +0.51 to +0.79. Return B: a rise from 55 to 86, a drop to 52 at +0.23, a slow rise to 63, a step from 63 to 73 at +0.58 and a ramp to 109 ending at +0.70, a flicker of 102 to 109 at about +2.4 s. Every duress unlock and return of the series fails `DUR-047`.
- **Anchor of a segment and its limit [measured].** A segment's epoch name is the start of its loop, not its first frame, so each segment is anchored on the first frame with light after a wake. Two readings of that frame: the wake (`screen_toggled: 1`) or `DisplayPowerController[0]: Unblocked screen on after N ms`, which came 66, 257 and 53 ms after the wake in the three segments (257 ms after a screen-off of 0.5 s). In the segment of B and return A the wake fits the log (B's step on the exit start at +0.26, return A's drop on the switch start at +0.26) and the unblock time moves both 0.26 s away from any event; in the segment of C the two differ by 0.06 s, and with the unblock time the plateau starts at +0.57 (0.03 s after the decoy home transition started) and ends at +1.02 (on `Draw frame after cancel` at +1.01). Either way the plateau of C starts 0.10 to 0.16 s before the display joined the sync (+0.67): its first part is not explained by the theme change, within an anchor error of up to 0.06 s for that segment. A time burned into the frames (`screenrecord --bugreport`, the top quarter left out of the curve) removes the doubt (used in the next round: exact to the frame).
- **Backlight and settings [measured].** No `BrightnessEvent` line between any check and +4 s: the backlight does not change at a switch. The decoded settings files (`adb exec-out abx2xml /data/system/users/<user>/settings_<system|secure>.xml -`) show no difference between owner and decoy in `font_scale`, `system_locales`, `ui_night_mode`, density or font weight; they differ in `screen_brightness` (owner 5, decoy 19; both `screen_brightness_mode` 1, so it is not used) and `screen_auto_brightness_adj` (0.0 and 0.0017). `settings list <namespace> --user 12` for the stopped decoy returned the owner's values (the decoy's own `android_id` in the file differs): read the files, not the command.
- **The dip of the return has another cause [time measured, cause an assumption].** The drop to the pad value comes +0.26 (A) and +0.23 (B) after the owner's check, with the start of the switch to user 0: in return A `onBeforeUserSwitching 0` (+0.26), the return's SwitchStage drawn (+0.30) and `KeyguardViewMediator ... RESET` (+0.30), long before the theme change of the return (+1.19 in B). Candidate: the keyguard reset at the switch puts the scrim back to the bouncer state; not read in source.
- **State at the end (2026-11-21, not a snapshot of a later day).** Phone: the protolog groups still log to logcat until a reboot (`cmd protolog_configuration logcat disable <groups>` stops them); recorder and logcat stopped; the series in `/data/local/tmp/s3` and `/data/local/tmp/flight`. Workstation: the series in the session scratchpad. Nothing landed, nothing built.
- **Next (done in the next round).** The theme fix, the cause of the return's dip and the burned-in time; the late, compressed ramp of a duress unlock was gone with the theme fix.

## Round of 2026-11-21, the fixes (two module builds, ADR-274, ADR-280, ADR-293)

- **Scope.** The owner asked to fix all of `DUR-047` after the protolog round. For this round the owner allowed the landing on the build tree, module builds and pushes to `lynx` without a question per step; an image build, a flash or anything on `stallion` is asked separately; the owner is called for a series when one is needed.
- **Authoring.** Disposable repository `oblivios-platform/.worktrees/duress-perfect`, cloned from `.worktrees/deadlock-timing` and seeded read-only with the files of the build tree at `70532eddce4d` (base commits `f43bed8`, `1495dbb`, `fd9f61e`); six commits, `545c528`, `9441c4b`, `b2a450b` (build 1) and `68181d9`, `f6a4e1b`, `76442ff` (build 2). `typecheck-duress-frameworks.sh <worktree> <base>` printed `typecheck: OK` for both; for build 2 `files: services 4, systemui 2`, 0 errors in base and head, and the planted error of `TC_PROBE=2` gave `typecheck: FAILED`. For build 1 `ThemeOverlayController` has 16 errors in base and in head (14 `cannot find symbol`, 2 `package org.json does not exist`: the class path of the check lacks them), so for that file the check shows only that the head adds no error.
- **Fix 1, the theme overlays (build 1).** `ThemeOverlayController` keeps a key of the content of its fabricated overlays (seed colour, theme style, contrast; set in `createOverlays`) and passes no fabricated overlays to `ThemeOverlayApplier.applyCurrentUserOverlays` when the key equals that of the last registration that completed; the key of a registration is set in its completion callback and cleared when a new registration starts. Debuggable builds log `Keeping the registered overlays: <key>`.
- **Fix 2, the stored picture of ADR-280 (build 1, design in ADR-293).** `AuthorizedSwitchStage` writes the settled home picture of a user of the decoy type as a PNG through `AtomicFile` to `files/switch_stage/home-<user>.png` of SystemUI's device-encrypted storage, on one thread `SwitchStageDisk`; `show()` with no picture in memory decodes the file there (`ImageDecoder`, hardware allocator; a file whose size or aspect does not fit the largest window is not used) and reveals it when it arrives. The file is deleted on `STAGE_RESET` and on `ACTION_USER_REMOVED`; `DecoyProfileHelper.clearDecoyProfile` (Remove Duress Unlock) now sends `STAGE_RESET` for the registered decoy (`DecoyLauncherLook.sendStageReset`).
- **Module build 1.** Landed with `git am`, patch by patch, on `oblivios-2026110200` at `70532eddce4d` (tree clean, no `soong_ui`, 39 GB free): `c86b249ab002`, `96d2f0253ef4`, `314b1bc66192`; the sha256 of the patches equal on both sides, `git diff --shortstat 70532eddce4d HEAD` 4 files, 246 insertions, 19 deletions, the four touched files equal to the disposable repository. Module build (log `modbuild-20261121-154613.log`): `MOD_EXIT_CODE:0` at 16:01 after 14:47 min; the seven files equal by sha256 on the server, the workstation and the phone after the push; boot completed, crash log empty.
- **Series 1 on build 1 (16:07 to 16:10) [measured].** Recorder `tools/duress-timing-probe/series-sr.sh`; owner: two ordinary unlocks after the first after the boot, duress A (cold, the first after the boot), return A, duress B, return B, duress C, return C. Times after the credential check (the `V0`/`V12` time of `stages.py`), anchored by the burned-in time, luminance of quarters 2 to 4 (final 118 to 120).
  - Theme: every switch logs `Keeping the registered overlays: -65195/1/0.0`; after the boot no `Config changes=80000000`, no `Screenshotting Display`, no `Combining updateGlobalConfig`, no `assets added` and no launcher relaunch. The plateau is gone.
  - Duress luminance: ordinary from 57 at +0.36 to 118 at +0.78; duress A 57 at +0.40 to 120 at +0.815, B +0.37 to +0.77, C +0.41 to +0.76: the shape of the ordinary ramp within one or two frames, no plateau, no step.
  - Times: decoy launcher `Displayed` +3.00 s (A), +0.70 s (B), +0.80 s (C); end of the keyguard exit, ordinary 0.78 and 0.77, duress 0.77, 0.75 and 0.75, return 1.12, 0.86 and 0.94.
  - The stage was never released for the decoy [cause verified-in-source]: `Decoy stage released by the home` is logged on the returns only (task 2045, the owner's home); after a duress unlock the stage showed the wallpaper alone until its fallback of 6 s and faded with a flicker (B: 117, 112, 102, 120 three times from +6.09 to +6.27), over a decoy home displayed at +0.70. Cause: `WallpaperController.decoyHomeReadyTaskId` skipped every wallpaper window of another user's uid, and `ImageWallpaper` runs in SystemUI as user 0 (`singleUser`), so all wallpaper windows carry user 0's uid; at each switch the old one dies (`WINDOW DIED Window{... u0 com.android.systemui.wallpapers.ImageWallpaper}`) and a new one, also u0, is created. With no release no picture was taken: no `switch_stage` directory after the series.
  - The return [cause verified-in-source]: the scrim rose from 58 to 95 (+0.24 to +0.42), dropped to 56 in one frame, rose slowly and went to 120 in one step at +1.12 (A) or by a ramp ending +0.94 (C), then the stage fade flickered (+2.24 in A, +1.41 in C). Log: `onBeforeUserSwitching, exit requested at the start of the switch` +0.13, `KeyguardViewMediator queue processing message: RESET` +0.14 to +0.15, the bouncer hide finished +0.40, `exitKeyguardAndFinishSurfaceBehindRemoteAnimation` +1.118 (A) and +0.837 (C). The bouncer is dismissed only by `onEarlyMatched` of the progress callback (`KeyguardAbsKeyInputViewController`), and `ReturnToRealUserHelper`, which routes the owner's credential typed in the decoy, never sent it, so the pad waited for the switch and its keyguard reset.
  - Owner after the series: the return is fast, the dim glitch is still there; the way to the decoy is still not fixed.
- **Fixes of build 2.** (1) `WallpaperController` takes a snapshot of the wallpaper windows that exist when a hold begins (`DecoyWallpaperHold.sinceMillis` changes) and skips a window of another user's uid only when it is in that snapshot, so the new `ImageWallpaper` window of the switch counts for the decoy; the snapshot is cleared when the hold ends. (2) The stage window is `PixelFormat.TRANSLUCENT` (its view draws the black), so its fade shows the home beneath. (3) `ReturnToRealUserHelper.maybeRouteToRealUser` takes the progress callback and calls `onCredentialVerified` after a successful mint and before the switch is posted, when `oblivios_duress_fast` and `oblivios_duress_hint` are on; `KeyguardViewMediator.handleBeforeUserSwitching` then keeps the exit that the early match started (`mKeyguardDoneUserId`; log `onBeforeUserSwitching, exit kept from the early match`) instead of resetting the keyguard, consumes the active-dismiss grant of the incoming user and shows the stage.
- **Module build 2.** Landed with `git am` on `314b1bc66192`: `a695858ed00c`, `6613b7137ae7`, `139b017b5997`; the sha256 of the patches equal on both sides, the six touched files equal. Module build (log `modbuild-20261121-162657.log`): `MOD_EXIT_CODE:0` at 16:41:56 after 15 min; seven files equal on the server, the workstation and the phone; boot at 16:44 completed, crash log empty. Not measured: no series ran on it before the close (the log on the phone holds no unlock after that boot).
- **The criterion of `DUR-047` [measured].** The ordinary curve of series 1 ends with steps of 6 to 8 per frame (98, 104, 110, 118), so "no step above 3 per frame" fails for the ordinary unlock itself: a duress curve is to be compared frame by frame with the ordinary curve of the same series.
- **State left at the close (2026-11-21, not a snapshot of a later day).** Phone: `lynx` `2026111501` with module build 2, verity disabled, overlay remount, `oblivios_duress_hint` 1 (global); recorder and logcat stopped, protolog groups disabled; the series files in `/data/local/tmp/s4` and `/data/local/tmp/flight4` (of the protolog round in `s3` and `flight`). Workstation: the outputs of both module builds and of the module build of `70532eddce4d` (the rollback set) in folders `modbuild-2026111501-<head>` next to the repositories; series 1 in the session scratchpad. Build server: tree at `139b017b5997`, clean, no build; the patches in `<build-root>/scratch/land-perfect-1` and `-2`. Disposable repository at `76442ff`. The 16 `frameworks/base` commits `7bc79c21e815..139b017b5997` (the deadlock fix, the early hint, the picture work and this round) are landed and not exported to `credential/duress-unlock-decoy`; `frameworks-base/0008` is exported and not landed.
- **Next (taken up in the next round).** (1) Series 2 on build 2: two ordinary unlocks, duress A, B and C with their returns; read `Decoy stage released by the home` with the decoy's task, the file `home-12.png`, `exit kept from the early match` and no `RESET` on a return, every curve frame by frame against the ordinary one, no flicker at the stage fade. (2) Reboot, one owner unlock, lock, the first duress unlock after the boot: the stored picture shows at once. (3) Remove Duress Unlock deletes the file. (4) The export of the landed range, with a tree comparison. Open besides: the late exit of return A (+1.118 against +0.837 in C, cause not read); the return hint is sent after the full verification, about 25 ms later than a hint at the first stage would be; the owner's home picture is never stored, so the first return after a boot is not covered; a stale clock or badge in a stored picture.

## Round of 2026-11-21, series 2 and build 3 (ADR-274, ADR-280, ADR-293)

- **Scope and the owner's word.** The owner asked to continue Duress Unlock with no flaw left. Answers of the owner (2026-11-21): the stored decoy home picture stays (ADR-280 holds over the rule of `owner-working-rules.md` that no persisted file shows a Duress switch, after the platform's own record of the switch time was shown, see below); the platform's switch trace is closed in this round; one yes for the landing, the module build and the push of build 3.
- **Phone and build 2 before the series [measured].** `lynx` `2026111501` up since 16:44 with module build 2 (head `139b017b5997`): `services.jar` sha256 `144b2f33b548156d12a5deee7b8fa79be004e40f1c0697baa487eff544f88430` and `SystemUI.apk` `b2d4cb44cf3dfb3ed1f6a4c8534d405406ed8facf5c1097f04a89b632ef5f16b`, equal on the phone and in the build output on the workstation. `oblivios_duress_fast` is unset on the phone, which every reader treats as on (`Settings.Global.getInt(..., 1)`).
- **Own read of build 2 before the series.** No defect that blocks a run. The services part: the return's early match (`ReturnToRealUserHelper`) is sent only after the owner's credential matched and the mint succeeded, through the progress callback the check already has; the snapshot of the outgoing wallpaper windows is taken by the first poll of a hold, which `DecoyWallpaperHold.begin` posts at the mint, before the switch posts; a busy window-manager thread could still let the new wallpaper window into it (not seen in the series). The SystemUI part: a duress unlock leaves `handleBeforeUserSwitching` at its first check (`mEarlyAuthorizedUserId`); when the hint's background job loses the race the new branch arms the same exit, so no exit starts twice.
- **Series 2 (20:07:59 to 20:09:52) [measured].** Recorder `series-sr.sh` (`/data/local/tmp/series`, `/data/local/tmp/flight-series`); owner: two ordinary unlocks, duress A (the first decoy launcher start since the boot), return A, duress B, return B, duress C, return C, duress D. Segment offsets from the burned-in time (wall time = presentation time + c): `fr_1795288076` c = 20:07:56.898, `fr_1795288122` c = 20:08:42.894, `fr_1795288168` c = 20:09:28.595. Luminance of quarters 2 to 4 per 1/60 s, read in the browser pane with an in-page job (the pane was shown, so it played the segments; final value 118 to 120). Times after the credential check (`stages.py`).
  - Ramps: ordinary 57 at +383 ms to 120 at +783 ms (both); duress A +367 to +800, B +383 to +767 (120 at +900), C +417 to +833, D +417 to +783 (120 at +850): the ordinary shape within zero to three frames, no plateau, no step. Returns: A +450 to +867, B +483 to +900 (120 at +967), C +433 to +883: the shape of the ordinary ramp, 67 to 100 ms later; return B holds at 65 for five samples (+650 to +717, 83 ms) mid-ramp, where the ordinary curve holds at most three samples; cause not read.
  - End of the keyguard exit: ordinary 0.77 and 0.79 s; duress 0.78, 0.77, 0.81, 0.77; return 0.86, 0.89, 0.83.
  - Early match (`keyguardDone`): ordinary +40 ms; duress +34, +27, +25, +29 ms; return +123, +153, +75 ms. The return's comes after the decoy's own failed check, a full owner verification (`verifyPrimaryCredentialNoRouting`) and the mint.
  - Theme: `Keeping the registered overlays: -65195/1/0.0` at every switch; no `Config changes=80000000`, no `Screenshotting Display`.
  - Stage: `Decoy stage released by the home` for the decoy's task in all four duress unlocks (+3.19 s for A, whose launcher was `Displayed` +2.649 s after its start; +1.09, +1.10, +1.07 s warm) and for the owner's home (task 2045) in the returns (+0.53, +0.58, +0.37 s on the window-manager side). SystemUI received the release of a return late: its first snapshot came +1.76, +1.27 and +1.29 s after the check, 0.35 to 0.85 s after the exit had ended. The fade at the end of the stage shows no flicker (120, 119, 118 over 100 ms in B, C, D).
  - The home was empty behind the stage: frames of B show the wallpaper alone at +0.9, +1.5 and +1.9 s and the decoy icons fading in from about +2.05 s, though the decoy home was displayed at +0.9 s; the returns showed the owner's wallpaper without icons at +1.2 s. No frame of the decoy shows during a return (frames of return A at +0.3 to +1.2 s). No `switch_stage` directory was written.
- **Cause of the empty home and of the missing picture [verified-in-source, measured].** `AuthorizedSwitchStage.takeHomePicture` called `TaskSnapshot.getHardwareBuffer()`, which on this base is a stub that logs `getHardwareBuffer is deprecated!` and returns null (`frameworks/base/core/java/android/window/TaskSnapshot.java` at `139b017b5997`); the replacement is `wrapToBitmap()`. So the settle check never had a picture (twelve snapshots in 0.8 s after every release, none kept), no home picture was kept in memory or stored, and the stage showed the wallpaper alone until its fade. Measured with a read-only probe run as root on the phone (a dex compiled against the tree's `android.jar` in a scratch directory on the build server, run with `app_process -cp /data/local/tmp/snapprobe.jar / SnapProbe <task> <samples>`, reflection on `TaskSnapshotManager.takeTaskSnapshot(task, false, false, false)`): on the decoy home (task 1200004) `getHardwareBuffer` returned null six times of six; `wrapToBitmap` returned 864 by 1920 (`mHighResSnapshotScale` 0.8), sRGB, translucent, with 5.4 percent of the sampled pixels above alpha 16 and a mean difference of 0.00 between samples, so the settle check accepts at the second sample. A kept picture holds its own reference to the buffer (`frameworks/base/libs/hwui/hwui/Bitmap.cpp:362` acquires it), so it survives the snapshot's `closeBuffer`.
- **The switch trace of the platform [measured, verified-in-source].** `/data/system/users/12.xml` (readable before the first unlock) held `lastEnteredForeground` 16:09:31 (the last duress unlock of series 1) and `lastLoggedIn`; `0.xml` held the time of the last return. A watcher on the phone saved a decoded copy at every change of either file while the owner returned, unlocked into the decoy and returned again (20:35:21 to 20:35:49): at a return `0.xml` got `lastEnteredForeground` and `12.xml` got `lastLoggedIn` 3.7 and 4.8 s later (the decoy logs in again after a return: its storage stays open, ADR-194); at the duress unlock `12.xml` got `lastEnteredForeground` and `0.xml` was rewritten with no change, which still set the time of the file. Writers: `UserManagerService.LifeCycle.onUserSwitching` (the foreground time), `onUserLoggedIn` (the login time and the fingerprint) and `applyUserRestrictionsLR` at a user's start (the rewrite without a change). `UserDataPreparer` treats `lastLoggedInTime == 0` as a user that was never unlocked and destroys its data when preparing it fails, so the decoy keeps its creation time there instead of 0. The decoy's usage stats write pending event files every hour while it runs (`/data/system_de/12/usagestats/pendingevents_*`); battery history, network and process statistics were not read.
- **Build 3.** Disposable repository `.worktrees/duress-perfect`, four commits on `76442ff`: `51215f0` (the stage uses `wrapToBitmap`), `7c57fa8` (no foreground time on a switch to or from the decoy, no login time for the decoy, the fingerprint written when it changes, the old times replaced at boot, and a user record not written when its file already holds the same bytes), `9c9609a` (debuggable builds log `Return route: owner check <n> ms, mint <n> ms`), `0b8d343` (the decoy keeps its creation time as login time, not 0). `typecheck-duress-frameworks.sh <worktree> 76442ff`: `files: services 2, systemui 1`, 0 errors in base and head, `typecheck: OK`; the script's own planted errors target files this change does not touch, so a planted error in `UserManagerService` on a detached commit served as the control: 1 error, `typecheck: FAILED`. Landed with `git apply --check` and `git am` patch by patch on `oblivios-2026110200` at `139b017b5997` (tree clean, no `soong_ui`, 39 GB free): `6e9f81f35f91`, `8e6a51b7f86f`, `9a31a33785be`, `f37fb2df8d95`; the sha256 of the four patches equal on both sides, `git diff --shortstat 139b017b5997 HEAD` 3 files, 109 insertions, 5 deletions, the three touched files equal to the disposable repository. Module build started 20:36:49 (log `modbuild-20261121-203649.log`).
- **Left as known limits of build 3.** The return checks the typed credential against the decoy first and the owner second; checking the owner first would slow every decoy unlock by a failed check, which is the timing tell the order avoids, so the return keeps at least the time of that failed check over an ordinary unlock (the new log line splits the rest). The first login of a decoy and the first decoy unlock after an update write `12.xml` once (the fingerprint).
- **Module build 3 and push [measured].** `MOD_EXIT_CODE:0` at 20:50:03 after 13:11 min (log `modbuild-20261121-203649.log`); the seven files newer than the start, the dex strings of all three changes present; sha256 equal on the server, the workstation and the phone: `services.jar` `f5439cd56dd8e38a40fa26c8f2c0bc3f5f25a3a21d29d471a6b9fd598ddaea1a`, `services.art` `0d4a9bf2…`, `.odex` `f6743b8d…`, `.vdex` `e4918de7…`, `SystemUI.apk` `ed116c02297454830e7aadb8ea43d16765a2933b1add7c95d2ac5f4cfcd89101`, `.odex` `57414c6e…`, `.vdex` `2778c270…`. Boot completed at 20:52:08, crash log empty. The boot cleanup ran: `12.xml` written at 20:52:03 with `lastLoggedIn` equal to `created` and `lastEnteredForeground="0"`; `0.xml` holds the boot time as foreground time. Outputs in `modbuild-2026111501-f37fb2df8d95` next to the repositories; the rollback set is the folder of build 2, `modbuild-2026111501-139b017b5997`.
- **Series 3 (part 1 20:55 to 20:58 after the boot, part 2 21:06 to 21:08 after a second boot) [measured].** Recorder `series-sr.sh` and the user-record watcher; offsets c 20:55:43.625, 20:56:31.968, 20:57:17.973, 21:06:25.595 and 21:07:11.617. Anchor: the owner's credential check (`Verifying primary lockscreen credential for user 0`) for every unlock, the instant the owner presses Enter in both kinds of unlock; the duress numbers of series 2 above are anchored on the decoy's check line, 25 to 41 ms later. Part 1 has no ordinary unlock besides the first after the boot; part 2 has two.
  - User records: no change of `0.xml` or `12.xml` at any of the twelve switches; `0.xml` is written only at the first owner unlock after a boot (the login time, as on any phone).
  - Picture: `home-12.png` written after the first decoy visit (864 by 1920, the decoy home on a transparent background, no clock or date in this layout), kept across the boot, and shown by the first duress unlock after the second boot: icons under the dim from +0.5 s and in full at +0.8 s. Every warm duress unlock shows the decoy icons from the exit on, every return the owner's icons from +0.6 to +0.9 s; no flicker at the stage fade.
  - Ramps (57 to 118): ordinary +0.367 to +0.783 s, three unlocks equal frame by frame. 50 percent point behind the ordinary one: duress +37, +37, +41, +11, +35 and -6 ms; return about +50 ms warm and +150 ms for the first return after a boot. Early match after the owner's check: ordinary +22 to +29 ms; duress +54 to +77 ms (the typed decoy credential first fails the owner's check, 27 to 41 ms, then the decoy's first stage gives the hint); return +85 to +88 ms warm, +178 ms for the first after a boot, split by the new line into the decoy's failed check (28 to 57 ms) and the owner's full check (48 to 117 ms), mint 0 ms.
  - Defects left: one duress ramp of six (part 1, B, the first with a home picture in memory) froze 150 ms at its start (58 held from +0.38 to +0.52 s, then a step of 7), cause not read; returns hold three samples mid-ramp in some runs; the window manager logged no stage release for duress A and return B of part 1 (no `Early hint aborted` either), cause not read; all five releases of part 2 are logged.
  - The first duress unlock with no stored picture (part 1, A, the first after the boot of build 3): the wallpaper alone until +4.1 s, then the decoy launcher's old icons, one frame without icons at +4.33 s and the icons again: the launcher received the owner's layout import (`LayoutImportExportHelper: Importing XML as Home Screen Layout`, +4.13 s, `resetLauncherDb`) after its model had loaded and rebound the workspace at +4.30 s. In part 2 the same import came at +3.17 s with a rebind at +3.23 s, after the stage had given way to the home, and left no visible change (the curve stays at 118 from +0.78 to +5.2 s). The `Outgoing transactions from this process must be FLAG_ONEWAY` stacks of `DecoyLauncherLook` in the log are the warning of a blocking call from `system_server` to the launcher's provider, also present 31 times in series 2.
  - Drops of the luminance to about 60 at +1.7 to +2.9 s after duress C, D and returns of part 1 are the owner opening the app drawer (frames), not a defect.
- **State left (2026-11-21, not a snapshot of a later day).** Phone: `lynx` `2026111501` with module build 3, verity disabled, overlay remount, the decoy session current; recorder and logcat stopped, protolog groups disabled; series files in `/data/local/tmp/s5`, `flight5`, `uxml5` (series 2 and the record run), `s6`, `flight6`, `uxml6` (part 1), `series`, `flight-series` (part 2); the probe `/data/local/tmp/snapprobe.jar` and its picture `snap_1200004.png`. Build server: tree at `f37fb2df8d95`, clean, no build; patches in `<build-root>/scratch/land-perfect-3`, the probe in `<build-root>/scratch/snapprobe`. Disposable repository at `0b8d343`. The 20 `frameworks/base` commits `7bc79c21e815..f37fb2df8d95` are landed and not exported to `credential/duress-unlock-decoy`; `frameworks-base/0008` (ADR-239) is exported and not landed.

## Round of 2026-11-22 (export, ADR-295, series 4)

- **Scope and the owner's word.** The owner asked to continue Duress Unlock with all four next items of the status record, one by one, and left the arrangement to the agent; for the floor of ADR-274 "find the very best solution"; then declined a decoy credential held in memory from the owner's first unlock, chose to skip the Wi-Fi restart and to keep the Bluetooth restart, and gave one yes for each landing, module build and push of the round.
- **Export [measured].** `git format-patch --start-number=8 7bc79c21e815..f37fb2df8d95` on the build server: 20 files, sha256 equal on both sides; in `.worktrees/export-2611`, seeded with the 14 touched files at `7bc79c21e815`, they apply with plain `git am` and give the blob of `f37fb2df8d95` for all 13 changed files. ADR-239's patch became `0028`, later `0031` (`SOURCE.md` of the package).
- **Build 4 (ADR-295 items 1 to 3) [measured].** Disposable repository `.worktrees/duress-return-hint` (branch `return-hint` from the build tree state `f37fb2df8d95`): `33af34b`, `45d94e5`, `430b7d9`. `typecheck-duress-frameworks.sh <worktree> 5bb40ab`: `files: services 3, systemui 2`, 0 errors in base and head, `typecheck: OK`; planted errors in `KeyguardViewMediator` (`TC_PROBE=2`) and in `ReturnToRealUserHelper` (a detached commit) each gave `typecheck: FAILED`. JVM harnesses on the real code (scratch directory): `storedPictureUser` passes and four mutants fail it; `DecoySessionCredential` passes and four of five mutants fail it (the fifth drops a null check that `MessageDigest.isEqual` covers). Landed with `git apply --check` and `git am` on `f37fb2df8d95` (tree clean, no `soong_ui`, 39 GB free): `d51d94ab697f`, `5c229a93473a`, `e8a409514b01`, 5 files, 349 insertions, 24 deletions, the five blobs equal. Module build (`modbuild-20261122-032848.log`): `MOD_EXIT_CODE:0` at 03:50:55 after 22 min; the seven files newer than the start, the strings of the three changes in the dex; pushed to `lynx` (sha256 equal for 7 of 7: `services.jar` `9ff5ba11…`, `SystemUI.apk` `38933c3d…`), reboot, `boot_completed`, crash log empty. Outputs in `modbuild-2026111501-e8a409514b01` next to the repositories; the rollback set is `modbuild-2026111501-f37fb2df8d95`.
- **Prune of stored pictures [measured].** With the phone locked: `home-99.png` (a copy of `home-12.png`) and an empty `junk.txt` were put in SystemUI's `files/switch_stage` with its owner and label, SystemUI killed by pid (1970 to 3274); afterwards only `home-12.png` (37932 bytes, 21:08) was left (`DUR-054`).
- **Series 4 (03:57:53 to 04:01:30) [measured].** Recorder `series-sr.sh`, copied on the phone with the directories `s7` and `flight7` so the older series stay. Owner: two ordinary unlocks (the first after the boot), duress A, a wrong PIN in the decoy, return A, duress B, return B, duress C, return C, duress D. Log, from the credential check line to `keyguardDone`: ordinary +116 ms (first after the boot) and +26 ms; duress from the owner's check +140 ms (A, cold), +59, +48, +43 ms; returns +53, +46, +48 ms, each with `Return route: owner check 92 to 114 ms, mint 0 ms, hinted true`, the route starting at the check line (the owner checked first), `early hint, authorized exit armed for 0` and `onBeforeUserSwitching, exit already started at the hint`. The wrong PIN read Weaver slot 0 (the owner) and then slot 1 (the decoy), both `INCORRECT_KEY`. Split by the `citadeld` lines: ordinary 8 ms to the Weaver call, 14 ms in Weaver, 4 ms to `keyguardDone`; returns 16 to 24 ms, 19 to 24 ms and 5 to 13 ms; the wrong PIN on the same route reached Weaver after 7 ms. Why the return reaches Weaver later is not read.
- **Frames of series 4 [measured].** Read headless with Playwright from the busybox server of the scratch directory (port 8793), with two scratch pages: `regions.html` (strips of the top 8 % and the bottom 5 % of every frame, burned-in time visible) and `present.html` (per frame the 99th-percentile luminance of the Wi-Fi icon, battery icon and gesture handle spots; above 200 counts as shown). Segment offsets (wall time minus presentation time): `fr_1795316269` 03:57:48.954, `fr_1795316314` 03:58:34.824, `fr_1795316360` 03:59:20.868. Results in `DUR-056`, `DUR-057` and `DUR-058`; the clock spot is covered by the burned-in time and was not used. Playwright writes to `.playwright-mcp/` in the foundation repository (its only allowed root): screenshots and, at the close, the folder itself were moved to the scratch directory.
- **Wi-Fi at a switch [verified-in-source, measured].** `WifiServiceImpl.handleUserSwitch` calls `ActiveModeWarden.handleUserSwitch` behind `Environment.isSdkAtLeastC() && multiUserWifiEnhancement()`; it sends `CMD_USER_SWITCH`, and `EnabledState` answers with `shutdownWifi()`, then `CMD_USER_UNLOCK` starts Wi-Fi again (`packages/modules/Wifi` at `a92b10758b2c`, `ActiveModeWarden.java` lines 920 to 935 and 2968 to 2976). Log of duress B: `WifiConfigManager: Handling user switch for 12` +0.13 s, `WifiActiveModeWarden: Shutting down all mode managers` +0.17 s, `wlan0` removed, `DEAUTH_LEAVING`, `CTRL-EVENT-DISCONNECTED`, the IMS stack stopped, Wi-Fi started again +0.54 s. `mCurrentUserId` of `ActiveModeWarden` is used only by its user switch, unlock and stop handlers, so skipping the call keeps the owner as its user for the decoy session.
- **Bluetooth at a switch [verified-in-source, measured].** `BluetoothManagerService.handleSwitchUser` turns Bluetooth off (`ON` to `TURNING_OFF`, +0.13 s in duress B) and on again as the new user (`prepareUserSwitch`, `executeUserSwitch`). Skipping it would leave the stack of user 0 serving the decoy session, PBAP and MAP included. Kept (ADR-295).
- **Gesture handle [measured].** The handle is the Taskbar of the current user's launcher, not SystemUI's navigation bar. At the user change (+0.39 s in duress B) SystemUI's `LauncherProxyService` unbinds the owner's `TouchInteractionService` (`disconnectFromLauncherService ... onUserChanged`, `Skipping connection to TouchInteractionService until previous instance is cleaned up`), whose `onDestroy` takes the owner's Taskbar; the decoy's launcher logs `recreateTaskbarForDisplay` at +0.53 s and the surface of its Taskbar at +0.76 s; the frames have no handle from +0.43 to +0.79 s. `NavigationModeController.onUserChanged` sends the unchanged mode 2 to its listeners at the same moment.
- **Status bar icons [verified-in-source, measured].** The stage window is `TYPE_STATUS_BAR_ADDITIONAL` (above the status bar, below the shade), chosen in `frameworks-base/0046`; the battery icon shows +1.41 to +1.44 s after a warm duress check against +1.14 and +1.23 s in the ordinary unlocks. A window type below the status bar is one that the keyguard policy may hide during the exit; the design is ADR-296 (`DUR-058`).
- **Wi-Fi module patch.** Disposable repository `.worktrees/duress-wifi` (`WifiServiceImpl.java` at `a92b10758b2c`); landed `1a62e118cd71`. The module build of the APEX (`modbuild-wifi-20261122-043009.log`, a copy of the module build script with `m -j6 com.android.wifi`) failed after 2 min: `UserManager#getUserType` is not in `system_server_current`. Fix `1cb2f9416c` (`isUserOfType`, a system API), landed; second build `modbuild-wifi-20261122-043346.log` (both in `<build-root>/build-logs`, script `<build-root>/scratch/modbuild-wifi-2026111501.sh`): `MOD_EXIT_CODE:0` at 04:36:22. The phone's APEX before the push is kept in `rollback-wifi-apex-2026111501` next to the repositories (`/system/apex/com.android.wifi.apex`, sha256 `dace338c…`, version 370399999). The new APEX (sha256 `57cad6c6…`, kept in `modbuild-2026111501-wifi-1cb2f9416c` next to the repositories) was pushed to `/system/apex/com.android.wifi.apex` on `lynx` and the phone rebooted: `boot_completed`, crash log empty, `Wi-Fi is enabled`, and the active `/apex/com.android.wifi/javalib/service-wifi.jar` holds the string `Could not read the type of user` of the fix. Not run (`DUR-056`).
- **State left at the close (2026-11-22, not a snapshot of a later day).** Phone (last read after the push; the USB link was down at the close): `lynx` `2026111501` with the module build of `e8a409514b01` and the Wi-Fi APEX of `1cb2f9416c`, verity disabled, overlay remount, at the owner's lock screen; no recorder runs (the phone rebooted after series 4); the series 4 files in `/data/local/tmp/s7` and `flight7`; `home-12.png` kept in the store (`DUR-054` step 3 deletes it). Workstation: `modbuild-2026111501-e8a409514b01` (build 4), `modbuild-2026111501-f37fb2df8d95` (its rollback set), `modbuild-2026111501-wifi-1cb2f9416c` and `rollback-wifi-apex-2026111501` next to the repositories; the segments of series 4 and the two frame pages in the session scratchpad. Build server: `frameworks/base` at `e8a409514b01` and `packages/modules/Wifi` at `1cb2f9416c`, both clean, no build; the patches in `<build-root>/scratch/land-perfect-4`, `land-wifi-1` and `land-wifi-2`, the exports in `export-duress-2611`, `export-duress-2611b`, `export-wifi.v7na` and `export-wifi2.o9m2`. `frameworks-base/0008` to `0030` and `packages-modules-wifi/0001` and `0002` are landed and exported; `frameworks-base/0031` (ADR-239) is exported and not landed. The Wi-Fi series (`DUR-056`) and `DUR-054` step 3 did not run: the owner closed the session first. The foundation and `oblivios-platform` repositories are ahead of their upstreams and not pushed.

## Design of ADR-296 (2026-11-22, handle and status bar at a switch)

- **Scope.** Design and plan only (owner's choices in ADR-296); nothing landed, built or run; the phone was not connected. The source facts behind the design (build tree at `e8a409514b01`) are in its "Causes" and "Which surface, and its input" sections.
- **Reading an aconfig flag of the build [verified-in-source].** `use_client_surface` is `READ_ONLY=true` in `out-lynx/soong/.intermediates/frameworks/base/com.android.window.flags.window-aconfig/aconfig-flags.txt` (line 274); the generated `srcjar` of that module holds no `FeatureFlagsImpl.java` to read.
- **Plan check [measured].** Disposable repository `.worktrees/duress-handle-statusbar` in `oblivios-platform` (three files of `frameworks/base` at `e8a409514b01`, base commit `1c2962b`). The 19 code blocks of the plan applied in order on the branch `plan-check` (3 files created, 8 edits each found exactly once; `frames.html` on a scratch copy, `node --check` OK). Rules harness: `cannot find symbol` without the class, `rules: PASS` with it, 10 of 10 mutants killed. `typecheck-duress-frameworks.sh <repo> 1c2962b` on `3b2483a`: `files: services 5`, `errors in base: 0, in head: 0`, `typecheck: OK`; a planted `int x = "0";` in `AuthorizedSwitchHandle.java` and `boolean stage = "false";` in `WindowToken.java` each gave `typecheck: FAILED` (`incompatible types`).
- **State left at the close (2026-11-22, not a snapshot of a later day).** Disposable repository: branch `handle-statusbar` at the base commit `1c2962b`, ready for the plan's Task 1; branch `plan-check` at `3b2483a` holds the applied edits; `activate_project` created an untracked `.serena/` in it, so its commits stage `services` explicitly. Build server: `frameworks/base` at `e8a409514b01`, clean, no build. Phone: as the close above (not read this session). Rollback sets next to the repositories as above.

## Round of 2026-11-22 (ADR-296 landed, two series at the phone)

- **Scope and the owner's word.** The owner asked to execute the plan of ADR-296 natively (no subagents): Tasks 1 to 3 in the disposable repository, one question for the landing, the module build and the push (answered yes), then the series at the phone. After the first series the owner reported that the white swipe bar jumps to the top of the screen; a second yes covered landing, building and pushing the two fixes and refreshing the SBOM evidence; the owner chose to raise the page budget of the notes (ADR-297) rather than trim or split them. The session was closed before the two extra rounds that the layer capture needs.
- **Tasks 1 to 3 [measured].** The rules harness gave `cannot find symbol` before the class and `rules: PASS` after it, 10 of 10 mutants killed (14 of 14 after `isRecent`); `typecheck-duress-frameworks.sh <repo> 1c2962b`: `files: services 4` after `0033` and `services 5` after `0034`, 0 errors in base and head; a planted error in `AuthorizedSwitchHandle.java` and one in `WindowToken.java` each gave `typecheck: FAILED`; the tree of `handle-statusbar` after Task 3 equaled that of `plan-check`. The script reads `HEAD` of the repository, so the commit comes before the check (the plan had it after).
- **Landing and builds [measured].** `git apply --check` and `git am` on `e8a409514b01` (tree clean, no `soong_ui`, 39 GB free), blobs equal to the disposable repository: `daec3d72ab60`, `2dbebf6c1434`, `a83ef9ed4dd2`; module build 15:46 to 15:59 (13 min); then `41d009af25db` and `f14f297d88e1`, module build 16:31 to 16:37 (6 min, incremental). `modbuild.current` keeps naming the log of the previous build until the new script starts, so a waiter that looks for `MOD_EXIT_CODE:` in the named log exits at once: it has to wait for the pointer to change first. Push: `adb remount` (the overlay becomes writable), `adb push` of `services.jar` and `oat/arm64/services.{odex,vdex,art}`, sha256 equal for 4 of 4, `adb reboot`; `boot_completed` after 26 to 30 s, crash log empty, `system_server` maps the new files. On this image adb answers after a reboot while both users are still `RUNNING_LOCKED`.
- **Series [measured].** Recorder `series-sr.sh` copied with the directories `s8`/`flight8` (first series) and `s9`/`flight9` (second), so the older series stay. Anchors in the log: the credential check line (the first `Verifying primary lockscreen credential for user 0` of a duress unlock or an ordinary unlock, the first for the decoy's user in a return), `early hint, authorized exit armed`, `kept the handle of` and `dropped the kept handle`, `Decoy stage released by the home`, `Start collecting in Transition` and `Finish Transition`. Frames: `strips.html` for the burned-in time and, per segment, one asynchronous loop in `browser_evaluate` for the 99th-percentile luminance of the handle, battery and Wi-Fi spots (results in `DUR-056` to `DUR-058`). Timeline of duress B of the first series (seconds after the check): stage window +0.08, transition #48 played +0.28 for 12 ms, handle kept +0.40, dropped +0.85, `Decoy stage released by the home` +1.09, transition #49 (the home to the front) played +0.87 to +1.13, clock and left icons +1.20, Wi-Fi and battery icons fading in +1.30 to +1.48 (ordinary unlock: left icons +1.03, Wi-Fi and battery +1.03 to +1.18).
- **Why the handle was drawn at the top [verified-in-source, measured].** The log said `kept the handle ... at 0,0`. The Taskbar provides navigation insets, so its window container sits in an insets animation leash that carries the display offset: SurfaceFlinger's tree is `animation-leash of insets_animation` (`ty` 2337 of 2400) over `Taskbar` over `VRI-Taskbar`, and `WindowContainer.resetSurfacePositionForAnimationLeash` sets `mLastSurfacePosition` to 0,0 when the leash is made. The sum of the containers' `mLastSurfacePosition` that `AuthorizedSwitchHandle.keep` used was 0,0 and the kept surface lost the leash's offset when it was reparented to the overlay layer. `WindowState.mSurfacePosition` (frame minus the parent's origin, kept up to date by `updateSurfacePosition` before its leash check) holds the offset: `0035`.
- **Why a return kept nothing [measured].** No `kept the handle` line appeared for any of the four returns. On a return the owner's home is warm and draws at +0.33 to +0.52 s, which ends the hold (`Decoy stage released by the home`); SystemUI unbinds the decoy's launcher and its Taskbar goes 65 to 100 ms later (`removeTaskbarRootViewFromWindow` at +0.40 to +0.62 s), so `DecoyWallpaperHold.isActive()` was already false and the handle was missing for 0.07 to 0.10 s. In a duress unlock the hold ends at +1.09 s, after the Taskbar went at +0.40 s. `0036` asks whether a switch began within `MAX_MS` instead.
- **Why the icons of a warm duress unlock are late [measured].** After `0034` the icons of the first duress unlock come at +1.158 s (before: not by +3.57 s), so the stage no longer covers them; the warm duress unlocks still show them at +1.41 s. The frames show the clock and the left icons at +1.20 s against +1.03 s in the ordinary unlock and the Wi-Fi and battery icons fading in 0.2 to 0.28 s later, so the whole appearance is shifted: SystemUI's own timing after the keyguard exit, not the stage. `TransitionController.canAssignLayers` returns true for a window state and, for another container, only while no transition plays (for a task or display area also while not collecting), so a token's layer is not assigned while a transition plays; no transition played when the stage joined in the switches measured (the stage joined at +0.08 s, #48 was collected from +0.14 s), so the guard did not delay the order there; a switch in which a transition plays at the join was not run.
- **Open: the kept layer is drawn at the top although it is positioned at 0,2337 [measured].** In the second series the log says `at 0,2337` in all eight keeps and the returns keep now, but in the frames of the first duress unlock the handle bar is at the top of the display (about 60 px below the top edge, x 0.40 to 0.60) from +1.2 s to the drop at +3.36 s, and the handle spot at the bottom reads 129 instead of 246. Not read: the layer tree during the keep. Candidates, none tested: a transaction applied after the keep that sets the position again (the removal of the window container or of the leash); the position lost with the reparent; the buffer of the client surface placed inside a taller window. `tools/duress-timing-probe/kept-layers.sh` dumps SurfaceFlinger and the input windows at every keep (the order of its dumps and the 0.35 to 0.45 s of a warm keep make a hit likely only in the first duress unlock after a boot or over several tries). Also unexplained: no `dropped the kept handle` line after the keep of return C (0 `chatty` lines in the log).
- **Tooling quirks [measured].** The Serena hook of this repository reads `$SCRATCH` in a Bash redirect as a path inside the repository and blocks it: use literal absolute paths, or the Write tool, for files in the scratchpad. `adb pull` has no `-q`. Playwright refuses a screenshot `filename` outside its allowed root (the foundation repository); without a filename it writes to `.playwright-mcp/`, which is moved to the scratchpad afterwards; after a long `browser_evaluate` loop the next screenshot times out after 5 s, and closing the browser and opening the page again cures it. In `strips.html` the `v` element and `seek` are global lexical bindings, so a `browser_evaluate` can start an asynchronous loop of its own over the segment, keep a summary in `window.SUM` and be polled; a segment of 45 s with 5 windows of 3.8 s takes about a minute. `dumpsys power` and `dumpsys user` print `Failed to write while dumping ...: Broken pipe` when `head` or `grep -m` closes the pipe. `build-sbom.py --notice` prints the counts and rows of `NOTICE` read-only (the three code repositories must be clean).
- **State left at the close (2026-11-22, not a snapshot of a later day).** Phone: `lynx` `2026111501` with the `services` files of `f14f297d88e1`, the Wi-Fi APEX of `1cb2f9416c` and the `SystemUI.apk` of build 4, at the owner's session; recorder, capture and protolog groups stopped; series files in `/data/local/tmp/s8`, `flight8`, `s9` and `flight9` (and `s7`, `flight7`). Build server: `frameworks/base` at `f14f297d88e1`, clean, no build; patches and exports in `land-296`, `land-296b`, `export-296` and `export-296b` of the scratch directory. Workstation: `modbuild-2026111501-f14f297d88e1` (current), `-a83ef9ed4dd2` (rollback of the second build) and `-e8a409514b01` next to the repositories; the disposable repository `.worktrees/duress-handle-statusbar` at the branch `handle-statusbar` (five commits on the base, the fix commits `5d0dff9` and `085ce47` among them) with the branch `plan-check`.
