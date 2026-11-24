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
- Host checks that exist for classes the module build cannot be run on: the pure `DecoyFingerPolicy`, `DecoyFingerCodec` and `DuressUnlockFingerFlow` run with `javac` and JUnit 4 on the JVM, and a parse-only pass over every other changed file (`com.sun.source.util.JavacTask.parse()`, which reports syntax errors and ignores missing Android symbols) catches editing mistakes until the first module build. Neither is a type-check. Since 2026-11-14 `tools/build/typecheck-duress-frameworks.sh <worktree> <base commit>` is one: it runs `javac` on the changed non-test Java files of the series on the build server against the classes of the last build, runs the base versions as a control, and fails only on errors the series adds (`TC_PROBE=1` and `TC_PROBE=2` plant an error in the services and the SystemUI tree to show the check detects one). The jars lack a few classes, so a handful of errors exist in both runs; Changed Kotlin files of SystemUI are compiled with `kotlinc` the same way (`TC_PROBE=3` plants an error there); tests are outside it. A base that holds an older version of only some of the changed files gives false errors (a file that is absent from the base has no control, and a changed method that a file outside the changed set calls is missing from the jar): for a whole series make a synthetic base commit in a clone of the disposable repository that holds the base version of every changed file and pass it as `<base commit>`. `TC_PROBE=6` to `9` plant an error in one file of the ADR-309 close-out, and `TC_PROBE_ALL=1` plants a syntax error after the package line of every changed Java file: the run must end `typecheck: FAILED` and its list `files with new errors` must name every file. Two causes found while building it: `javac` stops before it attributes method bodies as soon as one import is missing, so every run needs `-XDshould-stop.ifError=FLOW` (without it the planted errors were not found); the `kotlinc/classpath.rsp` of the module is stale (September) and lacks the framework and the coroutines, so Kotlin uses the `javac` classpath of the module plus `kotlin-stdlib.jar` and `-jvm-target 21`. The classpaths exceed the length of one argument and go through `@argfile`s.

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
  `Verifying ... user 12` then `startUser-0-fg`. `tools/duress-timing-probe/stages.py` reads both from a logcat file. Since
  ADR-304 (P6) the lines name no user; `stages.py` then takes the kind from the switch that follows (its README).
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

## Picture and timing rounds of ADR-274 (2026-11-19 to 2026-11-23)

In [`duress-picture-engineering-notes.md`](duress-picture-engineering-notes.md): the rounds of 2026-11-19 to 2026-11-23
through series 13, the design of ADR-296 and the automated security review of series 7.

## Round of 2026-11-23 (forensic round, part 1, ADR-303)

- **Scope.** ADR-303; findings in `2026-11-duress-forensic-review.md`, procedure and result in `DUR-061`.
- **Working method [measured].** As root on the phone, in `/data/local/tmp/fx`: `touch m0; find /data -xdev 2>/dev/null | sort > l0`, a control round by the owner, `find /data -xdev -newer m0 | grep -v ^/data/local/tmp/fx | sort > c1; touch m1`, a duress round, `find /data -xdev -newer m1 ... > d2`; each listing takes a few seconds (68,299 paths). Compare on the workstation after `export LC_ALL=C` and sorting again: the phone's `sort` orders differently and `comm` stops with `file 2 is not in sorted order`. The stores that change in both rounds are read with their dumpers: `dumpsys batterystats --history | grep userfg`, `dumpsys usagestats` (events per user; a stopped decoy's events are not in memory), `dumpsys activity exit-info`, `dumpsys settings` ("Historical operations" per table, times in UTC), `dumpsys dropbox`. Logcat with `-v epoch` gives the switch times (`ssm_user_starting`, `uc_switch_user`, `ssm_user_switching`, `am_user_state_changed`).
- **Tooling quirks.** The Serena hook blocks a Bash command whose path contains `oblivios-foundation`, which includes the tool's own saved outputs under the project's folder in `<home>/.claude/projects/`: recompute from the scratch data instead of reading the saved output. Serena's `search_for_pattern` did not find a line just written by `replace_content` in the decision log; `git diff` showed it.
- **Own error.** `check-docs.py | tail -2 && git commit` committed `d01a262` while the gate failed (a status line of 4023 characters): the pipe gives `tail`'s exit code. Repaired in `472ccd6`. Run the gate without a pipe before `&&`.
- **The close of this session.** By the owner's word (2026-11-23) the sites were not synced at this close (`sync-site.py` not run, against the rule of ADR-275 for this one close), so the public snapshot does not hold the records of this day.
- **State left (2026-11-23).** Phone: `lynx` `2026111501` with the module files of the device run above, at the owner's session (user 0); the listings in `/data/local/tmp/fx`; grab detection mode 2. Build server: unchanged, no build. Workstation: the listings in the session's scratch directory (not kept).

## Duress Unlock on the emulator (2026-11-24, ADR-304, ADR-306)

- **Patch and build [measured].** The ADR-304 patch was written in a disposable repository of only the touched files
  (`oblivios-platform/.worktrees/duress-adr304`, base commit = `frameworks/base` `16e2102e12f0`, equal on the build
  server and in the emulator tree that day), applied with `git am` to the emulator tree on branch
  `oblivios-adr304-emulator` (the mirror of ADR-305 now carries a branch of its own), and built with
  `tools/emulator/build-emulator.sh` run in the background: 5 min 18 s incrementally, exit 0. Proof that the image holds
  it: unzip `out-emulator/target/product/emu64x/system/framework/services.jar` and `grep -c -a` its `classes*.dex` for a
  new string. The emulator's `ro.build.version.incremental` (`2026112300`) has the form of a `lynx` image number; a result
  names it as `emulator emu64x 2026112300` with the `frameworks/base` head.
- **JVM tests without the Android test stack.** The finger policy and codec tests run with plain `javac` and JUnit 4.13
  plus Hamcrest from the Gradle cache. `SoftwareRateLimiterTest` needs Mockito, Truth and AndroidJUnit4, which are not on
  the laptop: its cases were copied into a harness with stubs of `LockscreenCredential`, `ArrayMap`, `Slog`, `Slogf`,
  `FrameworkStatsLog`, `ArrayUtils`, `IndentingPrintWriter`, `TextUtils`, `LockPatternUtils` and the annotations, compiled
  against the real `SoftwareRateLimiter`, `LskfIdentifier` and `SoftwareRateLimiterResult`. Mutants were applied with
  `sed` to copies in the scratch directory. Note: a `replace_content` replacement that starts with a digit after `$!1`
  reads as group 11; use literal mode then.
- **A decoy from the shell.** `adb shell locksettings set-pin <owner test PIN>`; `pm create-user --user-type
  org.oblivios.usertype.full.DECOY Decoy`; `am start-user -w <id>`; `locksettings set-pin --user <id> <decoy test PIN>`;
  `cmd lock_settings set-decoy-profile --owner-credential <owner test PIN> <id>`; `am stop-user -w -f <id>`. The Settings
  screens set one up as well (Security, Device unlock, Duress Unlock, Set up).
- **Driving the keyguard.** `input keyevent KEYCODE_SLEEP`, 2 to 3 s, `KEYCODE_WAKEUP`, `input swipe 540 1800 540 600 200`,
  `input text <PIN>`, `input keyevent 66`. A swipe while the screen dozes opens no bouncer and the PIN goes nowhere: wake
  first. Read the result with `am get-current-user` and `dumpsys window | grep isKeyguardShowing`. A switch to another user
  started with `am switch-user` removes the owner's bouncer before a PIN typed through `adb` arrives. `DUR-091` is reached through the shell instead (see the close-out section below).
- **Fingers.** The emulator's HAL is `fingerprint-service.ranchu`: `adb emu finger touch <n>` then `adb emu finger remove`
  is a touch of finger n. Enrolment through `am start -a android.settings.FINGERPRINT_ENROLL` (the owner PIN, More four
  times, then 12 touches); the HAL calls the fingers by their n (`fpHash=<n>`). The finger link is read from
  `sqlite3 /data/system/locksettings.db` as root: names `decoy_finger_state` and `decoy_finger_tombstone`, print only the
  version and finger id of the state, never its wrapped part.
- **Reading the owner's rate limiter.** `dumpsys lock_settings`, the block `userId=0, protectorId=...` (`numFailures`,
  `lockoutEndTime`, `numSavedWrongGuesses`), and `od -An -tu1 /data/system_de/0/spblob/<protector>.failure_counter`. The
  emulator's Gatekeeper answers a wrong PIN with a generic failure, so no wrong guess is saved and the duplicate path of P2
  cannot be reached there (`DUR-090`).
- **Screens.** Settings' Duress Unlock screens are secure windows: `screencap` gives black; read them with `uiautomator
  dump`. The view tree does not tell the check icon of the finger list from the finger icon.
- **Seen in passing [measured].** At a duress unlock `DecoyLauncherLook.readBoolean` (from `applyOwnerLookToDecoy`) logs
  `Outgoing transactions from this process must be FLAG_ONEWAY` with a stack: a blocking provider query from
  `system_server`, a warning, not a crash; not changed. A refused duress finger no longer reports a success on the emulator tree, but
  it still leaves the sensor deaf until the re-arm of the close-out section is built (`DUR-104`).
## Close-out of the forensic round (2026-11-24, ADR-309 and ADR-310)

- **Where the work is [measured].** The emulator tree (`<home>/aosp/platform-primary`, branch `oblivios-adr304-emulator`) holds the ADR-304 patch, the three fixes of ADR-309 (`DUR-097`, `DUR-098`, the first link of `DUR-104`; built into the image) and, landed with `git am` after the cause cards and not built, the fixes of ADR-310: five commits in `frameworks/base` (the re-arm of the sensor, the failure counter at every success, the fewer traces of a switch, the stop of the decoy after a refused route, the stage copy of the wallpaper), one in `packages/modules/Wifi` (`DUR-111`) and one in `packages/services/Telecomm` (`DUR-112`). The image in `out-emulator` is the one built before them. `build-emulator.sh` was stopped by the session close after 47 minutes, with the Soong analysis done and 1300 of 3330 steps compiled; a new run of the same script with the same environment continues from there. The two new source files (`UnchangedWrite`, `BatteryStatsHiddenUsers`) and their tests change the globs, so Soong analyses the whole tree again: two runs stopped at the swap guard (40064 and 40268 MB; `GOGC=40` changed nothing) because 11.7 GB of old swap was in use before the build started, and the third, with `SWAP_LIMIT_MB=44500`, passed the analysis in about 22 minutes. The disposable repositories under `oblivios-platform/.worktrees/` (ignored by git) are `duress-adr304` (branch `master`: the base files fetched from the build server, each equal to the emulator tree by `sha1sum`, then one commit per fix), `duress-adr309-wifi` and `duress-adr309-telecom` (one base and one fix commit each). The landing patches are made against the emulator tree's own file contents: a scratch repository with one baseline commit of the tree's files and one commit per fix, then `git format-patch`; `patch -p1 --dry-run` in the tree is the preflight, because a `git apply --check` counts as a landing for the cause-card hook. The build server's tree is unchanged; nothing is in `oblivios-platform`.
- **Checks run [measured, 2026-11-24].** JVM tests: `BatteryStatsHiddenUsersTest` (7 cases, 8 mutants of the class fail it), `UnchangedWriteTest` (11 cases, 7 mutants fail it) and the rate limiter cases in the stub harness of the ADR-304 round (8 cases; the new case fails on the old code, two mutants fail it). The type-check of the whole series (17 files, a synthetic base) ends `typecheck: OK` with 18 errors in base and in head, and with `TC_PROBE_ALL=1` ends `typecheck: FAILED` with new errors in every file; the re-arm alone ends OK and, with `TC_PROBE=6`, FAILED. The Wi-Fi and Telecom files have no host type-check: the module build is their first compile. The matrix rows `DUR-089`, `DUR-091`, `DUR-099`, `DUR-104` to `DUR-112`, `DUR-114` and `DUR-115` state each prediction; none is run on the new code.
- **Emulator state left.** Stopped (`adb emu kill`). The userdata holds an owner PIN and a decoy PIN chosen by the agent, the decoy user 10 and a user `Third` (11); start with `-wipe-data` for a clean device.
- **Working commands [measured].** `DUR-091`: `am switch-user <third user>` in the background and, 0.15 s later, `locksettings verify --user 0 --old <duress PIN>` in the same `adb shell`; without `--user 0` the command runs for the current user and answers `Old password provided but user has no password`. The next duress PIN after that refusal: `am switch-user 0`, wake, swipe up, type the PIN (this is the sequence that crashed SystemUI, `DUR-115`; with the owner's PIN in between the decoy is stopped first and nothing happens). Removing Duress Unlock from the shell: `cmd lock_settings clear-decoy-profile --owner-credential <PIN>` (the option is not `--old`). The Settings activities start directly: `am start -n com.android.settings/.security.DuressUnlockMainActivity`, the owner PIN, `Choose duress finger`, the finger, the second PIN, `Choose`. Fingerprint enrolment: `am start -a android.settings.FINGERPRINT_ENROLL`, the owner PIN, `More` until `I agree`, then 14 to 16 times `adb emu finger touch <n>` and `adb emu finger remove`, 0.7 s and 0.9 s apart, per finger, `Add another`, `Done`. The screens are secure windows: read and tap them from the bounds of `adb shell uiautomator dump`. The stores are Android binary XML (`abx2xml <in> <out>` on the device before `adb pull`). A forensic round: snapshot the candidate stores (`cp -p`, `stat -c '%y %z %n'`, `md5sum`) and the dumps `dumpsys batterystats --history`, `usagestats`, `activity exit-info` and `activity start-info` after the control, the duress unlock and the return, with one warm-up round first (the decoy's first-use writes are in the first round only); the events log (`uc_switch_user`, `ssm_user_switching`, `am_kill`, `am_proc_start` with its hosting type and component, `am_crash`) names the switch times and why a process started. A listing of the whole data partition (`touch m0`, `find /data -xdev -newer m0` after a control round and after a duress round, `comm -13` of the sorted lists) finds the stores in the first place.
- **Facts read.** `[verified-in-source]` The HAL ends the authenticate operation at an accepted finger (`hardware/interfaces/biometrics/fingerprint/aidl/android/hardware/biometrics/fingerprint/ISession.aidl`, authenticate); a finger that the framework then refuses needs a new `authenticate` call. `[measured]` `dumpsys fingerprint` shows `State: 2` for the normal listening client of this HAL, and `Lockout is implemented by the HAL`. `[measured]` An unenrolled finger leaves the sensor listening; a refused duress finger does not (`DUR-104`). `[verified-in-source]` The usage statistics keep every event (`UserUsageStatsService#reportEvent`) and `ActivityManagerService#reportGlobalUsageEvent` reports to the current user only, which at a foreground start is still the outgoing one. `[measured]` The failure counter file and its directory `spblob` get the same modification and change time at a duress unlock by PIN; ctime cannot be set from a program, so restoring the modification time does not hide the write, and upstream writes the counter at a success only when it is not zero (`SoftwareRateLimiter#reportSuccess`). `[measured]` In a round with snapshots the Wi-Fi stores, `wallpaper_info.xml`, the owner's `subtypes.xml`, the Telecom registrar and the dialer version file kept their bytes while their times moved at the switches; `overlays.xml` changed only in the order of the user 0 items (each theme apply moves them to the end of the global list; only the order within a user ranks overlays) and, at the first duress, in the user 10 items; `notification_policy.xml` gained the user 10 zen config and channels at the first duress and a rule condition at the return; the zen etag value follows the user because `ZenModeConfig#hashCode` includes it; `settings_global.xml` also gains a `watch_ranging_supported_by_primary_device` write of `com.android.settings` at the first start of the decoy. `[measured]` The decoy's processes leave exit records (`dumpsys activity exit-info`, user 10, timestamped at the return) and start records (`activity start-info`, user 10). `[measured]` The switch kills the outgoing user's cached processes while the decoy's processes start, and `AudioService` kills its RECORD_AUDIO holders (`killBackgroundUserProcessesWithRecordAudioPermission`, `ACTION_USER_BACKGROUND`); the dialer restarts 2.3 s later for its `TaskSchedulerJobService`, and every start of the dialer process moves the times of its datastore version file (a plain start and a same-size `truncate` both do). `[measured]` `telephony_analytics.db` is written in idle and in the control round too: it is no trace of a switch. `[verified-in-source]` The Bluetooth snoop log is disabled by default on a `user` build (`packages/modules/Bluetooth/system/gd/hal/snoop_logger.cc:65`). `[measured]` After a refused route the decoy stays `RUNNING_UNLOCKED` until the owner's next PIN unlock stops it (`DecoyProfileHelper#maybeStopUnusedWarmDecoy`); with the decoy still running, the duress PIN right after `am switch-user 0` crashed SystemUI twice (`Canvas: trying to use a recycled bitmap`, in the stage's `ImageView`), and a duress unlock with a warm decoy alone did not. `[verified-in-source]` The stage preloads the wallpaper with `getBitmapAsUser(hardware=true)`; `WallpaperManager` returns its cached bitmap for the same user and flag whatever the hardware argument says, the wallpaper engine of the same process loads that entry with `hardware=false` and recycles it when it unloads or loads another; which of the two recycle sites ran in the crashed run is not read.
- **Dead ends and quirks.** The first fix of `DUR-104` removed the wrong success report and left the sensor deaf; a control with an unenrolled finger after a PIN unlock showed that the HAL ended its operation, and the first prediction (the ordinary finger opens afterwards) was wrong at that link. The cause-card hook refuses a command that holds `platform-primary` and `git ... show` in the same words, also when only one part is a read: fetch the base file in a command of its own and compare with `sha1sum`. It also counts a card only when it follows the last landing: land every repository of a bundle in one command, or each separate landing needs its own card in the closing message of a turn (the Wi-Fi and Telecom landings cost two extra card messages). The Serena hook blocks a path with a `$VARIABLE` (write the absolute path) and a `grep .` inside an `adb shell` string (the `.` reads as a file argument). `adb pull` has no `-q`. `create_text_file` writes into the Serena project that is active, not into the repository of the last command: two new files of the worktree landed in `oblivios-foundation` and were moved back with `mv`; check the active project before an edit after switching. A mutation script that points at a missing file reports every mutant as killed: the original must pass first. A mutant that survives because the code is redundant (a length test in front of `Arrays.equals`) means the code is dead: remove it. The exit code of a background command is that of its last command (`tail`), so the build's own line is read from the output file. The stage's preload and the wallpaper engine share a bitmap object by accident of the cache key, not by design.