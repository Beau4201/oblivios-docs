# Guardian Engineering Notes

## Purpose and status

Durable Guardian/AppOps mechanics learned from real hardware — distinct from
`docs/architecture/guardian-contracts.md` (the authoritative contract/design
record) and from `docs/governance/decision-log.md` (accepted decisions). This
doc is where "how the OS actually behaves, discovered the hard way" lives so
the next person building an AppOps-watching component doesn't have to
re-derive it from source. Add to it whenever a future session finds another
real-hardware-only OS behavior of this kind.

## AppOps has two independent dispatch paths

The AppOps system dispatches operations through at least two distinct,
non-overlapping mechanisms that must be monitored independently.

Instantaneous "noted" operations flow through `noteOperationUnchecked` →
`scheduleOpNotedIfNeededLocked`, dispatching callbacks registered via
`AppOpsManager.startWatchingNoted`. By contrast, duration-tracked "active"
operations flow through `startOp`/`finishOp` → `AttributedOp#started()` →
`scheduleOpActiveChangedIfNeededLocked`, dispatching callbacks registered via
`AppOpsManager.startWatchingActive`. These two paths never intersect: the
noted-ops dispatch code never calls into `scheduleOpActiveChangedIfNeededLocked`,
which itself has only one call site anywhere in the tree — verified directly
against the `AppOpsService.java` and `AttributedOp.java` source rather than
inferred from observed behavior.

GNSS-backed location fixes (identified as `GPS` and `MONITOR_LOCATION` AppOps)
use the duration-tracked "active" dispatch path exclusively on real hardware.
This means that a watcher architecture relying solely on `startWatchingNoted`
will have a complete blind spot for these operations; they bypass the noted
path entirely at the OS level and never appear on its dispatch channel,
making observation on both channels essential for complete coverage.

Coarse location derived from network data (WiFi/cell-based positioning) uses
the same noted channel described above, despite also being a location-related
op: it arrives as an instantaneous noted-style access event with no temporal
span. This highlights why watchers cannot rely on operation naming to infer
which dispatch channel will fire — semantically similar operations use entirely
separate internal machinery.

The dispatch channel used by any given operation is neither documented in public
APIs nor deducible from its name — it is not guessable from an op's name alone,
though it can be determined by actually reading the `AppOpsService`/
`AttributedOp` source, exactly as this document's own opening investigation did.
The only safe approach is to defend all code by monitoring *both* the noted and
active channels simultaneously for every operation of interest. When using
`startWatchingActive`, note that the overload accepting an explicit `Executor`
argument takes `String[]` operation names (not `int[]` codes) — the `int[]`-based
overload has no `Executor` parameter at all; it internally converts to `String[]`
and calls the other overload with `Context#getMainExecutor()` automatically.

## Package-visibility filtering (API 30+)

Android's package-visibility filtering system (API 30+) introduces a subtle
failure mode that affects any code checking permissions across package boundaries.

The `PackageManager.checkPermission()` API cannot distinguish between "the
caller is not allowed to see this package" and "the package lacks this
permission." Both conditions return identical `PERMISSION_DENIED` responses
with no diagnostic output. This means code that interprets a denial as proof of
actual permission absence will have blind spots: it may conclude an operation
cannot happen when in fact the caller simply cannot inspect the target package's
state at all.

For a component that needs to inspect an *arbitrary* third-party application's
permission state — rather than a fixed, pre-enumerated set of packages — the
solution is to declare `android.permission.QUERY_ALL_PACKAGES` in the manifest.
This permission is `protectionLevel="normal"` (confirmed in
`frameworks/base/core/res/AndroidManifest.xml`), which means it needs only a
plain manifest declaration: unlike most privileged permissions, it requires no
`privapp-permissions.xml` allowlist entry.

A narrower alternative, using `<queries>` declarations to name only specific
packages or intent filters, was considered and rejected for Guardian because
the entire purpose of the system is to watch packages it cannot enumerate
in advance.

## Permission-revocation edge cases

Some permission states cannot be modified by the `revokeRuntimePermission` API,
even in cases where the call completes successfully without raising an exception.

Permissions marked with the `SYSTEM_FIXED` flag (commonly found on system
components like framework services that have default background grants) are
immutable from the perspective of `revokeRuntimePermission` — the method returns
normally but the permission state is left untouched. This creates a class of
remediation failures that require active verification: code that only checks
"did the call throw?" will incorrectly believe success occurred. Any guardian
or remediation system must follow each revocation attempt with explicit
verification of the resulting state and roll back if the desired change did not
occur.

This fail-closed pattern has been validated against real hardware and real system
components, not just verified theoretically against framework source.

## Real hardware-only defects found (worked examples)

### Defect 1: GPS/MONITOR_LOCATION missing from the watched-ops array

A location-monitoring implementation watched only `OPSTR_FINE_LOCATION`, treating
`OPSTR_GPS` and `OPSTR_MONITOR_LOCATION` as redundant. However, reading
`AppOpsManager.java` directly shows that `OP_GPS` uses `OP_COARSE_LOCATION`
as its switch-op, not `OP_FINE_LOCATION`. This means `FINE_LOCATION` alone
provides no visibility into GPS-backed location operations.

This gap remained undetected in emulator validation because the emulator's
location simulator reports `FINE_LOCATION` entries directly, matching what a
developer would expect from the API names. Physical hardware behavior is
materially different: actual GNSS location fixes appear as `GPS` and
`MONITOR_LOCATION` AppOps entries (observable via `dumpsys appops` on device),
never as `FINE_LOCATION` entries. This means emulator-only testing created a
false sense of coverage.

The fix required adding `OPSTR_GPS` and `OPSTR_MONITOR_LOCATION` to the
watched-operations array in the actual watcher code. This illustrates why
emulator validation, while necessary, is fundamentally insufficient for
AppOps-watching components: the emulator's simulated providers differ from
real hardware in ways that are not obvious from the API surface alone.

### Defect 2: Callback never fired for specific app despite OS-level AppOps note

After Defect 1 was fixed and the OS-level AppOps event confirmed firing at the
right time, callbacks still failed to arrive for a specific application, despite
`dumpsys appops` independently recording a background access event for that same
package at the exact moment the watcher should have been notified.

A systematic investigation followed, reading the real `AppOpsService.java` and
`AppOpsManager.java` source to evaluate potential causes. Several plausible
explanations were constructed and methodically eliminated via source review:
switch-op remapping (ruled out — `scheduleOpNotedIfNeededLocked` uses raw op
codes), permission-based filtering via `MANAGE_APPOPS` (ruled out — the
location ops lack `restrictRead` set), per-UID watch scoping (ruled out — the
unrestricted `INVALID_UID` constant applies here), and batched dispatch
(ruled out — batch code still routes through the same noted path).

One plausible framework defect — a `RemoteException` silently swallowed in
`AppOpsService.notifyOpChecked()` during callback dispatch — was testable via
live instrumentation: diagnostic code was rebuilt into `services.jar` and
live-pushed to the running device via the established push pattern, and the
instrumentation consistently produced zero hits, disconfirming this hypothesis entirely.

The actual cause: GPS/MONITOR_LOCATION are active-path operations, not
noted-path, making them categorically invisible to watchers registered only
on the noted channel — the dispatch-mechanism gap underlying this defect,
distinct from Defect 1's watched-ops-array gap.

A practical diagnostic shortcut for any future "callbacks never arrive"
problem: `dumpsys activity processes` can quickly rule out process freezing
(`isFrozen=false`) and cached app suspension (`cached=false`), which are
plausible causes for a non-persistent watcher that costs nothing to
eliminate early.

## Guardian-specific testing notes

A test fixture that triggers a delayed background action (for example, a
location request fired several seconds after the app is backgrounded) may
need an empirically-tuned real pause between launching the fixture and
backgrounding it. Issuing both commands back-to-back with zero delay can
unreliably prevent the delayed action from ever firing, even though the
fixture code itself is correct and the same sequence works when a real pause
is inserted. The root cause of this timing sensitivity was never conclusively
established, but likely involves a race between the async intent dispatch and
the activity's initialization before backgrounding interrupts the launch
sequence. Insert a real, measured delay between the two steps rather than
assuming zero-delay automation is reliable.

When multiple distinct AppOps operations fire their own notes in quick
succession during a single user action, the detection queue can accumulate
multiple incidents for the same package. A single location request, for
instance, may simultaneously trigger both `FINE_LOCATION` and `MONITOR_LOCATION`
AppOps entries a few milliseconds apart, resulting in separate queued
detections for the same app. By design, an already-remediated package should
absorb a later duplicate detection through a precondition-failed or no-op
path instead of triggering a second remediation attempt — the queue behaving
this way is not a defect.

A background-location test fixture needs every relevant background-location
permission granted, including `ACCESS_BACKGROUND_LOCATION` itself — a grant
sequence that only covers `ACCESS_FINE_LOCATION`/`ACCESS_COARSE_LOCATION`
leaves the OS's background-location split enforcing a denial, so the
"vulnerable baseline" state a watcher is meant to detect never actually
exists and the test silently proves nothing.
