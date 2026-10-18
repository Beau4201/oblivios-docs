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

The `freeholdos-platform/credential/duress-unlock-decoy` package went from
107 patches to 13 (`frameworks-base` 93 → 10, Settings 10 → 2, Multiuser
4 → 1). The old → new map and the verification tree hashes live in that
package's `SOURCE.md`; this note records the method and what to watch for
if the series is squashed or re-exported again.

Method, in order:

1. Seed a disposable local repo (`freeholdos-platform/.worktrees/squash-*`)
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

