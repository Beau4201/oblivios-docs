# AirPods engineering notes

Durable lessons from the AirPods compatibility work. Decisions are in the
decision log (ADR-106 through ADR-127), validation rows in
`validation-matrix.md`, and protocol and
platform facts in `docs/research/airpods-*.md`. This document keeps only what
a future change in this area must not rediscover. Status and open work:
`status-airpods.md`.

## Design and review

- **Verify the mechanism, not only the build.** Patch `0001` compiled and still
  leaked a device-wide SDP identity override and would have aborted the
  Bluetooth process on first registration. Read every assert, shared buffer
  and persistence path a patch touches in the live source (ADR-115).
- **Check the whole path before choosing a bridge.** `BluetoothDevice.setMetadata()`
  looked like a usable cross-process bridge but stores into a Java-side
  database in the Bluetooth process, unreachable from native SDP/L2CAP code.
  The bridge is a narrow privileged AIDL method behind a dedicated signature
  permission held only by `AirPodsApp`, feeding the existing native interop
  database (ADR-108). A bridge that trusts a peer's self-advertised UUID was
  rejected because any peer can advertise any UUID.
- **Platform assumptions are validated against the source before a plan states
  them.** The OS audio hardening ignores an app's own volume calls, so lowering
  the music volume needs a narrow Bluetooth call (ADR-127), not a privileged
  audio permission. `isMusicActive` stays true about 12 seconds after a pause
  and turns true about 2 seconds after a play key. Error Prone rules apply only
  in the module build, not in the host `javac`.
- **A setting that "has no effect" may be an unimplemented host function.**
  Automatic ear detection is a host function: the pair reports where the pods
  are (`0x0006`) and nothing but the host acts on it. Conversation awareness
  works the same way: the pods never lower the music volume themselves.
- **The AirPods serve one L2CAP client.** A probe run needs the app stopped
  first (`am force-stop`).
- Names in a plan must be read from the tree. The Bluetooth APEX is
  `com.android.bt`, not `com.android.btservices`.
- **A caught exception hides a missing privilege.** `setRemoteAlias` needs a
  companion-device association or `BLUETOOTH_PRIVILEGED`; the app caught the
  `SecurityException` silently, so the rename reached the pair but the phone's
  alias, and the Name row, kept the old value (`AIR-170`). Log or surface a
  refused privileged call, and check the platform API record for the caller's
  privilege before a plan promises a side effect.
- **A page built from SettingsLib needs Settings' base fragment, not only its
  theme.** The theme alone gives the toolbar and colours; the rounded card
  grouping comes from `SettingsBasePreferenceFragment`. The conformance check
  found it as 15 violations in both themes (`AIR-166`).
- **The model number differs between the pods of one pair.** The page showed
  `A3048` where an earlier capture had `A3047`; the two numbers are the left and
  right bud of the AirPods Pro 2 (USB-C) `[assumption]`. A test that compares the
  model number needs both values or the pod that is primary.
- **A build that finishes in a fraction of the planned time is verified in the
  log and on the files before it is believed.** Image `2026100211` took 3.5
  minutes against 80 planned because only five partitions changed; the log, the
  checksum of the flashset and the required-packages check confirmed it.
- **Settings' group adapter draws the cards, and its base fragment moves every
  `FooterPreference` to the end of the page.** A preference that should lie on
  the page colour (the rings) marks itself with `GroupSectionDividerMixin`; room
  between two rows is a `SpacePreference`; a footer that belongs to one section
  cannot stay in it, so the page has one footer for all of them.
- **The notification tap that opens Settings' device details** uses the action
  `com.android.settings.BLUETOOTH_DEVICE_DETAIL_SETTINGS` with the bundle
  `device_address` under `:settings:show_fragment_args`, as Settings' own
  `BluetoothKeyMissingReceiver` does `[verified-in-source]`.
- **SystemUI asks the provider too, not only Settings.** A provider found through metadata key 25 is
  also read by SystemUI's volume panel (setting id 1001, `DEVICE_SETTING_ID_ANC`) as uid 10150, through the
  same SettingsLib repository. An unexported service refuses that bind with a `SecurityException`, which
  SettingsLib did not catch (ADR-182). "Only Settings binds this" needs a check of every caller of the
  shared repository, including the log of `stallion`'s SystemUI, not a check of Settings alone.
- **A report that ear detection "does not act" may be an image without the code.** The owner's reports of
  2026-10-20 matched ADR-172, and the proof was one string: the broadcast action of the receiver was absent
  from the dex of the installed app, while the strings of the older receivers were present. Check the
  installed artefact before reading the source for a cause.
- **The pair ignores every listening mode write while neither pod is in an ear**
  (`AIR-192`). A report that a mode "does not take" starts with the ear state.
- **A bounded new input type is `UnrecognisedMessage`, not an error**, when its
  range comes from third-party notes: a malformed frame ends the session after
  eight in a row.

## Testing

- Run a plan's code before trusting it. Running it in disposable copies found a
  repeated "both out" report that put audio back on pods that were not worn, two
  codec tests asserting the opposite of the new behaviour, and a conversation
  check that missed levels `03` to `05`.
- A test of a lock counts only if removing the lock fails it. The first
  concurrency test passed five of five without the lock.
- A surviving mutation is information: the test has a gap, or two layers guard
  the same thing on purpose. State which.
- Host checks and the compile gate cannot find device defects. Run every open
  row on the flashed image, collect all defects, then build once. Do not
  rebuild per finding.
- Do not start a timed capture until the owner confirms the app is open, and
  syntax-check on-device scripts with `sh -n` first.
- **A page that redraws on a timer never becomes idle.** `uiautomator dump`
  waits for about a second without events and answers `ERROR: could not get
  idle state`, or returns the previous window. A poll must redraw only when
  something changed.
- **A tap from a stale dump hits another row.** One did, and toggled sleep
  detection on the owner's pair. Before every tap compare the top activity and a
  fresh dump of the same screen, and read the setting back afterwards.
  `am force-stop` of the app (every probe read) also closes the open page, so a
  test driver reopens it after each measurement.
- **Native Settings buttons did not react to `adb input tap`** on the device
  page; the same buttons of the own page did. Test through the own page and ask
  the owner for the native one.
- **Never run `git apply` after a glob in an `&&` chain in zsh.** `rm -rf dir/*`
  failed on "no matches", the chain stopped, and the next line applied the
  diffs to the real repository. `git apply -R` with the same diffs restored it.
- **`cmd | tail` hides the exit code.** A failed docs gate was followed by a
  commit. Read the gate's last line before committing, or use `pipefail`.
- **A log filter must match both logcat formats.** `logcat -v time` writes
  `Tag(pid): text` and the default writes `Tag: text`. A pattern with `Tag: `
  counted zero session frames after a restart and produced a wrong "no frames"
  claim that had to be retracted. Count with `Tag.*text`, and count a known-good
  period first.
- **A recording in the camera app does not test the pods' microphone;** it
  records through the phone's own microphone. A valid check is a page that calls
  `getUserMedia` and shows the level, served from the workstation over
  `adb reverse` (`localhost` is a secure context), compared across the settings
  with only one pod in the ear (`AIR-189`: -82.5 against -52.6 dBFS).
- **The volume keys change the speaker volume while the pods are out of the
  ears.** The pods' volume changes only while audio plays through them, so a
  loudness test presses the keys during the sound (`AIR-190`).
- **A Settings page reads the config once and then follows the published
  list.** The provider publishes an empty list when the session ends and the
  values when it is up again, and the config of a recognised pair without a
  session still lists every row, so an open page gets its rows back without
  being reopened (`AIR-194`, 2026-10-05). Before that change the open page kept
  only the default rows after a case cycle. Two `BACK` presses from a page
  opened from the device page can leave Settings.
- **Revoking a runtime permission kills the process.** After `pm grant` the
  session starts again only through a broadcast to `ConnectionReceiver`
  (`AIR-156`).
- **An exception in a Binder method of the app crashes the caller.** Settings
  is the caller of the config provider; a `SecurityException` from
  `BluetoothDevice.isConnected` with `BLUETOOTH_CONNECT` revoked crashed
  `com.android.settings` (`AIR-156 (d)`). Every Bluetooth call on a path that
  Settings can reach catches `SecurityException`.
- **A `user` build logs only the lifecycle lines of the app.** The debug lines are off (`isDebuggableBuild()`), and `onLinkUp` returns without a line when the pair is not recognised, so a missed first connection on `stallion` left no trace (`AIR-197`). Add a log line for the not-recognised return if it recurs.
- **A foreground service needs a notification object, not a granted
  `POST_NOTIFICATIONS`.** Without the grant the service stays foreground and
  the package has no notification record, so the app shows none (ADR-138,
  `AIR-172`).
- **Read a control's start value before a test moves it.** The start value of
  the volume-while-speaking slider was lost in `AIR-168` and could not be
  restored.
- **A control that the pair does not report cannot be read back.** Its row is
  proven only by the owner's observation of an effect: toggle it and compare,
  with the other state as the control (`AIR-188`, `AIR-189`: no effect).

## Build and deployment

- Every app change is an image build. `adb install` of a rebuilt system app is
  refused because system package updates need an fs-verity signature, and
  disabling verity would lower security. After a module build, an image with
  the previous numbers takes about 5 minutes; after a Bluetooth module change
  about 80 minutes.
- A named-target build also refreshes the staging copies in `out-lynx`. Use a
  new `BUILD_NUMBER` for every image. A module build reuses the last image's
  `BUILD_NUMBER` and `BUILD_DATETIME`.
- `frameworks/base` and `packages/apps/Settings` are separate git repositories.
  Generate patches with `git format-patch --relative`; tree-root paths make
  `git am` fail and leave `.git/rebase-apply`.
- A component-less `AirPodsApp` made R8 remove every class (no entry points),
  so dexpreopt failed on a missing `classes.dex`. `dex_preopt` was disabled
  temporarily and had to be removed with the first manifest component.
- `check-required-packages.sh` fails on a forbidden package (a test install that can
  linger in `out-lynx` staging). Remove it with `m installclean` (staged product
  output only, not the compile cache), then rebuild.
- `m -k` without a number is keep-going without limit, so one run collects every
  remaining failure.
- `.claude/hooks/check-official-build.py` matches only a bare `m` or
  `m -j<N>`. `m -j6 -k` and `m installclean` are not mechanically enforced;
  set `OFFICIAL_BUILD`, ccache and `OUT_DIR` in the script anyway.
- Flash sets are hardlinked copies (`cp -al old new`, then `rsync` only changed
  files). Verify each with `sha256sum -c` against hashes computed on the server.
- Commands handed to the owner must set every environment variable they need
  (`ANDROID_PRODUCT_OUT`) and use the real `user@host` or none.
- **Search the implementers of an interface, not only its callers.** The compile
  gate found a debug sink that had not been given the new members of
  `AirPodsCommandSink`.
- **A new `@SystemApi` rebuilds about 4000 steps (81 minutes); an app-only change
  takes about 4.5.** Land the platform change first, then iterate on the app.
- **A patch made with `git format-patch` carries the git identity of the
  authoring repository**; the repository copy of a patch gets the build identity
  like the earlier patches, and `SOURCE.md` says so.

## Device handling

- Tap only from a fresh `uiautomator` dump of the same screen, and read back
  from a fresh dump. Blind taps at fixed coordinates changed real settings.
  Find controls by `resource-id`, not by an English content description, so
  pseudolocales work.
- `adb shell settings put global k "a;b"` lets the device shell split at `;`.
- The device masks four bytes of a Bluetooth address in `dumpsys` and logcat.
  The full address is visible in a screenshot of the device page and must
  never be committed. A debug tool that finds the device by name avoids typing
  or logging it.
- `adb` drops when the phone locks, which stops a logcat capture; `logcat -c`
  erases the evidence of the previous step.
- `SubSettings` with the device fragment is not exported. Open the page through
  the gear in the connected-devices list.
- A per-app locale (`cmd locale set-app-locales com.android.settings --user 0
  --locales ar-XB`, reset with `""`) tests Settings' RTL and expansion without
  changing the system language. It does not reach the provider's strings.
- `screenrecord` frames: use `ffmpeg -fps_mode passthrough`; the per-frame luma
  of a crop (`signalstats`) shows a step when a stock drawing appears.
- The app process is cached and frozen after about 30 seconds. Putting the
  AirPods in the case and out again produces an `ACL_CONNECTED` event that wakes it.
- Read `dumpsys activity broadcasts` before relying on a broadcast for a manifest
  receiver: `BOND_STATE_CHANGED` shows `SKIPPED ... Background execution not
  allowed` for the app in the background, while `ACL_CONNECTED`,
  `ACL_DISCONNECTED` and the A2DP and hands-free connection broadcasts are
  delivered (`AIR-199`). A handler for the bond change only ran after the process
  registered the receiver itself; code that sat in the manifest branch never ran.
- On a first pairing the bond completes before the service discovery delivers
  the UUIDs (bond, then UUIDs and the A2DP connect within 0.4 s), so recognising
  the pair at the bond event fails. The first audio profile connection is the
  first event that sees the UUIDs.
- A stock Settings page for a bonded pair with a running session means the
  provider tags (key 25) are missing: read the stored keys in the `Custom
  Metadata` table of `BluetoothStorageManager.Database` in `dumpsys
  bluetooth_manager`. The platform drops all keys of a pair at the unbond.
- With the audio profiles of the pair switched off in Settings the pair raises no
  ACL link, so a session without audio cannot be made that way. After
  `am force-stop` the process starts again from an explicit broadcast of an
  unhandled action to the receiver; the shell cannot send `BOOT_COMPLETED`.

- The pair sends its full settings burst (18 control frames) only while the
  phone holds it as a connected audio device. Check `dumpsys bluetooth_manager`
  for `Connected count: 1` before every read; on a link the probe raises itself
  the pair sends a thin set, and every control then reads `absent`.
- A write can land while every read returns `absent`: a run on a disconnected
  pair still left two controls changed. After such a run read every control in
  a full burst, compare with the starting table and restore the differences.
- The probe's write cycle must stop on `absent`; `aap-write-test.sh` itself
  does not.
- Opcode `0x0017` frames carry the pair's serial number. The probe prints 64
  bytes of them, never the whole frame; decode them in a scratch file and do
  not paste a decoded string into chat.
- A listening-mode change by the owner's long press during a capture changes
  `0D`. Record it as the owner's change, do not restore it without asking.
- Play sound from Find My is not visible on the accessory channel, so it cannot
  be measured from the phone.

## Shell pitfalls

- Never use `pkill -f` with a pattern that appears in the command itself; it
  kills the tool shell (exit 144). Use PIDs.
- In zsh `"$O:core"` is parsed as the modifier `:c`; use `${O}`. An unquoted
  variable is not split in a loop; write a bash script.
- `grep -c` exits 1 on zero matches; guard with `|| true` inside monitors.
- Filter a process check on `args`, not `comm`.
- A monitor expires after 30 minutes. A workstation or link pause can show as a
  false "unreachable".
- **A session end is not a link decision.** `STREAM_ENDED` arrives 4 ms after the
  ACL timeout, before the audio profiles disconnect (37 to 39 ms later). Restoring
  the audio route in the session end handler made the pods the active A2DP device
  just as A2DP went away, and the becoming-noisy broadcast paused the music on the
  phone. State that the stack tracks itself (here the route, forgotten on A2DP and
  hands-free disconnect) is restored only after the link is known to be up
  (ADR-154, `AIR-200`). Read the order of the events in a `logcat` capture before
  fixing a "pauses by itself" report.
- **The session opens before the audio profiles connect.** On `stallion` the first
  frame came 537 ms after the session start and A2DP and HFP became active 0.2 to
  0.3 s later. A route-away driven only by the ear count runs once, finds no active
  device and leaves the app believing the route is gone, so pods that connect out of
  the ears play (ADR-172, `AIR-201`). State kept by the app about a stack-side effect
  is re-applied on the stack event that undoes it, not only on the app-side event
  that caused it.
- **The Bluetooth volume has no software ceiling on the phone.** With absolute
  volume the phone maps the music index linearly to AVRCP (index 12 of 25 is 61 of
  127) and applies no curve; `dumpsys audio` shows the behaviour as
  `DEVICE_VOLUME_BEHAVIOR_ABSOLUTE` and the safe media volume as disabled. A
  report that the maximum is soft is therefore about the pods or the source level,
  not about a phone setting.

## The connection sheet and picture-in-picture (2026-11-02, `AIR-203`)

- The sheet starts a translucent activity in a new task from a service. `ActivityStarter` sets `mUserLeaving` for every start without `FLAG_ACTIVITY_NO_USER_ACTION`, so the app below gets `onUserLeaveHint`; `TaskFragment.shouldAutoPip` skips auto-enter picture-in-picture when the resuming activity is translucent, so the auto-enter path is not the one a fullscreen video takes `[verified-in-source: frameworks/base/services/core/java/com/android/server/wm]`.
- That a browser enters picture-in-picture on `onUserLeaveHint` is `[assumption]`. The sheet start now carries `FLAG_ACTIVITY_NO_USER_ACTION`; the device row is not run.
