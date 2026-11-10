# Grab detection engineering notes

Short, actionable lessons from authoring and reviewing the grab detection patches of ADR-169, for the next
change to `physical/grab-detection` in `oblivios-platform`. The design is
`2026-10-15-grab-detection-design.md`; the evidence rows
are `GRB-*` in the validation matrix. Claims are labelled `[verified-in-source]`,
`[measured]` or `[assumption]`.

- **`lockNow()` posts the lock; it does not lock.** `PhoneWindowManager.lockNow` removes and posts `mScreenLockTimeout` and
  sets a pending flag, then returns `[verified-in-source: services/core/.../policy/PhoneWindowManager.java:6068-6080]`.
  A return without an exception therefore proves nothing about the keyguard. The 60-second timer is armed before the lock
  (init ignores a request while a timer runs), so the service cancels it when the keyguard has not shown five seconds later.
- **Register and unregister of a pointer listener are not symmetric.** `WindowManagerService.registerPointerEventListener`
  does nothing when the display has no content, while `PointerEventDispatcher.unregisterInputEventListener` throws
  `IllegalStateException` for a listener that was never added `[verified-in-source: services/core/.../wm/WindowManagerService.java:4087-4093,
  wm/PointerEventDispatcher.java:84-93]`. A disarm must tolerate that, and a sensor registration returns a boolean that must be read.
- **Nothing may throw out of a service thread.** An exception from `onBootPhase` is rethrown as `RuntimeException("Failed to boot
  service …")` `[verified-in-source: services/core/.../SystemServiceManager.java:328-335]`; an exception that leaves the service's own
  `HandlerThread` reaches the uncaught-exception handler of `system_server` `[assumption]`. Every entry point of the service
  is wrapped, and the cosmetic write (the triggered flag) is separated from the lock.
- **A shadow log must show what the rule rejected.** The first detector returned nothing for a peak without recent touch, so the
  shadow phase could not answer the open question of a route without touch (design 4.2, 7). The detector now reports such a peak once per
  cool-down, marked untouched.
- **A release before the peak is void after a new touch.** A finger that went up and is down again at the peak counted as pulled out
  of the fingers `[measured: host harness, 2026-10-15, trigger=true released=true]`. The detector clears the earlier release when a
  new touch starts.
- **Changing a return contract can hollow out old assertions.** After the untouched-peak report, the assertion `d != null` no longer meant
  "a candidate", and the mutant "touch window is exclusive" survived `[measured: mutate.py, 25 of 26 killed before the assertions
  checked `touched`]`. Run the mutation check after every change of what a function returns.
- **Hidden `Settings.Global` keys are not readable by every app.** `SettingsProvider` runs `checkReadableAnnotation` for a read of a
  hidden global key `[verified-in-source: packages/SettingsProvider/.../SettingsProvider.java:2513,2640]`, so the keys of the feature are
  probably not an oracle for apps; the outcome is recorded by `GRB-014` and stays `[assumption]` until then.
- **Put `@hide` on its own javadoc line,** as the neighbouring keys do. A tag in the middle of a line may be missed by the API tooling
  and leak the key into the public API `[assumption]`; a module build does not catch that.
- **A module build proves little about the tests.** `m services SystemUI Settings` passed (`GRB-002`) but does not compile
  `tests/utils`, so the broken `BouncerMessageInteractorKosmos.kt` fixture and any API check of the keys stay unproven.
