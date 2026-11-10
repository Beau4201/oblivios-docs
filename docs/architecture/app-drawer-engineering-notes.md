# App drawer engineering notes

Durable lessons from the app drawer work (themed icons, category groups, the
System group). Decisions are in the decision log (ADR-141, ADR-142), the design
in the spec,
validation rows `DRW-*` in `validation-matrix.md`,
and the patches with their provenance in `launcher/app-drawer` of
`oblivios-platform`. This document keeps only what a future change in this
area must not rediscover. State and open work: `status-app-surfaces.md`.

## What the type-check does not see

The type-check (`tools/build/launcher-drawer-typecheck/typecheck.sh`)
compiles the new Kotlin and the edited Java against the tree's compiled
Launcher3 and passed for every patch. Every layout and colour defect below was
found only on the device, each costing a build, a flash and an unlock.

- **`BubbleTextView.centerVertically` needs a definite height.**
  `BubbleTextView.onMeasure` computes its top padding from the height it is
  given. With `wrap_content` that is all the space there is: the icon cells of
  the opened card measured 950, 475 and 229 px. A cell layout either gives an
  explicit height or leaves `centerVertically` out and gets the natural height
  (icon plus label, which also grows with the font scale).
- **Colour attributes are not interchangeable between day and night.** In the
  dark theme `allAppsSurfaceHighest` stayed light (card pixel (212,173,177))
  while `groupHighlight` was dark (container pixel (65,26,31)) in the same
  context, and the text colour had turned light. The cause was not found; a new
  surface uses an attribute already proven on screen in both themes.
- **Check a custom list item against the clip of the drawer list.**
  `FloatingHeaderView` sets a clip on the list (`mRVClip`); stock icon rows start lower inside their cells and so clear it.
  The first container started 15 px above the clip and was cut flat.
- **A tap during an animation hits what is invisible.** The icons of the opened
  card were clickable while the card was still the size of the container, so
  a second tap on the container launched an app. Block touches until the card
  is open and from the start of the close.

## Icons a view draws itself

- **Ask the icon cache for the themed icon.** A generated monochrome icon (an
  app without a monochrome layer) is only loaded when a view asks for it with
  `IconCache.updateIconInBackground(..., DESKTOP_ICON_FLAG)`, as
  `BubbleTextView.verifyHighRes` and the folder preview do. A view that only
  calls `newIcon(FLAG_THEMED)` keeps the app's own colours. Request once per
  binding; a request in the callback can loop if the cache cannot deliver.
- **A custom adapter item must rebind.** Stock icon items return `false` from
  `isContentSame`, so the list rebinds them on every update. An item that
  compares equal by name keeps the icons of its first binding.
- **Remove a pre-draw listener from the observer it was added to.** After a
  detach `viewTreeObserver` is another object; the listener stays on the root
  and fires every frame. A card closed before its first frame must not open
  again (a stale listener re-blurred the drawer).

## List mechanics that were checked and need no workaround

- `ScrollableLayoutManager` caches the height of laid-out children, not of a
  sample view, so a view whose height depends on its width (the square
  container) is cached correctly.
- `AbstractFloatingView`: the new type bit (`1 << 27`) is free; the masks
  `TYPE_ACCESSIBLE` and `TYPE_TOUCH_CONTROLLER_NO_INTERCEPT` include it by
  construction, `TYPE_REBIND_SAFE` does not, so a model rebind closes the card.
- Collection info for accessibility: a custom row type must be counted
  (`isCountedForAccessibility`) and exempted from `getRowsNotForAccessibility`,
  or the row count becomes negative. Verified in code only, not with TalkBack
  (`DRW-012`).
- Grouping is limited to the main list of the phone launcher: `showsCategoryGroups`
  needs a non-null store, a null work manager and a `Launcher` host.
- A category read is a binder call (`LauncherApps.getApplicationInfo`): do not
  read it for an app whose group does not depend on it.

## Tools

- `tools/device/category-probe.sh`: reads `ApplicationInfo.category` of every
  app on a phone (no package list is printed or committed).
- `tools/build/test-app-grouper.sh`: compiles `AppGrouper.kt` and its test on
  the build server and runs them with JUnit (no Android runtime).
- `tools/build/launcher-drawer-typecheck/`: the type-check and the shim of
  the resource ids it needs (add every new resource id to `R.java`).
- Device checks that worked headless: `uiautomator dump` for bounds and view
  ids, `dumpsys gfxinfo` after a `reset` for frame times, `cmd uimode night`,
  `settings put system font_scale` and `wm density` for the theme and size
  checks (restore all of them). A `fastboot flash*` is the owner's action.

## Process

- Review the final sources (own read and one independent reviewer, each
  finding checked against upstream) before a build is requested, not after the
  flash. The review of 2026-10-07 found a negative accessibility row count, a
  pre-draw race and touches during the animation; it also made two claims that
  the upstream code disproved (a wrong cached row height, a fast scroller
  dereference).
- A fix for a measured layout defect is a change like any other: the first fix
  for the overlapping labels produced the cells of 950 px.
- The cold emulator build of this product on the build server is described in
  `build-and-signing-engineering-notes.md`.
- **A floating view that stays over a drag must listen for the drag.** The opened
  card is an `AbstractFloatingView`; it stayed open over the home screen when an
  icon was dragged out of it, because nothing told it. The stock icon menu
  (`PopupContainer`) is a `DragController.DragListener` that closes on
  `onDragStart` and keeps its view until the drag ends, because removing a view
  in the middle of the gesture interferes with the touch events. The card does
  the same (ADR-155).
- **`input swipe` is not a long press.** It starts moving at once, so it scrolls
  or flings and never starts a drag; a drag test needs `input touchscreen
  motionevent DOWN`, a wait of about a second, then `MOVE` and `UP`. A drop on
  the workspace adds the app there; drop where nothing accepts it to leave the
  home screen as it was.
- **A margin above a row is no space below the last row.** Each group has space
  above it and the last one touched the next section; the space is a property of
  the row position, so the item carries `inLastRow` and the view adds the
  bottom space for it. The row count is the number of groups divided by the two
  per row, rounded up.
