# Keyboard Engineering Notes

## Purpose and status

Durable mechanics of the on-screen keyboard (LatinIME) learned while restyling it
on `lynx` (ADR-146, ADR-148) and while testing it on the device. The design is in
`2026-10-07-keyboard-restyle-design.md`,
the decisions in the decision log, the evidence in the `KBD-*` rows of the
validation matrix, the landscape measurement in
`keyboard-landscape-inset-investigation.md`.
Add to this file when another keyboard behaviour is found that source reading or a
type-check did not show. Claims carry `[verified-in-source]`, `[measured]` or
`[assumption]`.

## How a key is drawn

- `KeyboardView.onDrawKeyBackground` draws the key background over the key
  rectangle grown by the padding of the background drawable, and the label is
  centred on the key rectangle, not on the drawable `[verified-in-source]`. A cap
  is therefore centred on its label when the drawable's bottom padding equals the
  edge below the cap and the cap fills the key rectangle exactly. `check-centring.py`
  enforces this; digits and capitals measured within 1 dp `[measured]`.
- A view clips its drawing to its bounds. With `keyboardBottomPadding` at 0, the
  last row of keys ends at the bottom of the view and its bottom edge is cut, unless
  the keyboard background has bottom padding `[measured]`.
- The 9-patches that a drawable replaces carry paddings (key preview 4/2/4/64 dp,
  more-keys panel 4/2/4/8 dp, strip top 1 dp); a replacement has to reproduce them,
  because the preview and panel geometry is computed from them
  `[verified-in-source: KeyPreviewDrawParams.setGeometry]`.
- Lowercase letters without ascender or descender (a, s, z, m) sit about 2.6 dp low in
  the cap, because LatinIME centres the label by font metrics. That is not a cap
  offset; test centring with digits and capitals `[measured]`.

## Two readers of the intrinsic size of a background

A layer-list or shape without a `<size>` has an intrinsic size of -1. Two places read
it `[verified-in-source]`:

- `KeyboardView.onDrawKeyBackground`, for keys with the `keepBackgroundAspectRatio`
  flag (the enter and emoji keys, background type action): the background is scaled
  by its intrinsic size, and a drawable without one is drawn as a square of the longer
  key side.
- `KeyPreviewView.setTextAndScaleX`: the label is scaled by the intrinsic width minus
  the padding, so a drawable without a size gives a negative scale and the key preview
  balloon is not shown `[measured]: no balloon on image 2026100702, balloon on 2026100704`.

The action caps carry 38 dp and the key preview 56 by 78 dp, the sizes of the 9-patches
they replace. A type-check does not show either defect; `check-centring.py` checks
that the sizes are present.

## Resource variants and label groups

- The ratios of the large digits of the phone and number layouts exist per
  configuration: the default, `land`, `sw600dp` and `sw768dp`. A change of the default
  leaves landscape on the old value; read the built APK with
  `aapt2 dump resources <apk>` before trusting a resource change `[measured]`.
- A digit and its sub-label (`ABC`, `PQRS`) form one group at a fixed distance left of
  the key centre in units of the digit width (`keyLabelOffCenterRatio`,
  `keyHintLabelOffCenterRatio`). A smaller digit moves the group to the right; the
  offset was raised so the four-letter labels keep a margin to the cap
  `[measured: PQRS touched the cap edge at 70% digits and -80%]`.
- `keyHintLetterPadding` moves the hint digit of the top row horizontally only. At the
  corner radius of 10 dp the hint needs about 5 dp from the right edge to keep clear of
  the curve; the vertical gap follows the font ascent.

## The input window under the cutout

- The platform lays a window out inside the display cutout when its
  `layoutInDisplayCutoutMode` is not `ALWAYS`
  `[verified-in-source: WindowLayout.java, computeFrames]`. The input window of
  LatinIME was 118 px narrower than the display on the camera side in landscape, and
  the keyboard, which already excludes the cutout inset from its width, filled it
  exactly, so the app showed through the strip `[measured]`.
- With `ALWAYS` the cutout is dispatched to the window and the platform pads the
  content root of the window itself: `SoftInputWindow` keeps `decorFitsSystemWindows`
  and `PhoneWindow` applies the system-window insets to the content root
  `[verified-in-source]`; the emoji panel content starts at the cutout inset while the
  window spans the display `[measured]`. Nothing in LatinIME pads a second time; an
  early design that padded the input view would have padded twice.
- The input view is as tall as the screen in non-fullscreen mode
  (`updateSoftInputWindowLayoutParameters`), so it cannot carry an opaque keyboard
  background, and the padded content root clips it horizontally. The background is the
  window background, drawn from the keyboard top down over the whole width
  (`KeyboardWindowBackground`).
- The insets and the touchable region are in window coordinates, and the input view
  may no longer start at the window origin: in an immersive app the window top is 0 and
  the content root is padded by the top cutout. `onComputeInsets` adds the input view's
  position in the window `[measured: visible top 1497 against 1381 plus 118]`.
- The key preview, the more-keys and more-suggestions panels and the gesture trail are
  added to `android.R.id.content` but were placed from `getLocationInWindow`; the two
  differ by the padding of the content root. `WindowContentOrigin` makes the three
  placements relative to the content view `[measured: panel centred over the key with
  the camera on the left and in an immersive app]`.
- The upstream shadow comes from the elevation of the input view with an outline from the
  insets. With the background below that view the shadow would fall on the keyboard, so
  the elevation is 0 and there is no shadow above the keyboard.

## Key tones

Only the caps-lock keyset of upstream uses the sticky-on background of the shift key;
one tap and the automatic capital used the functional tone. The two shifted keysets now
use the letter tone. The phone mode keys (`*#`, `123`) have the functional text colour
and are functional keys.

## Testing on the device

- `uiautomator dump` does not list the keys of the keyboard, also not with an
  accessibility service on and `--windows`: the keys are virtual nodes, and only the
  suggestion strip appears `[measured]`. Centring is measured from screenshot pixels
  (cap bounds from the colour run around a glyph-free row, then `glyph-offset.sh`).
- A key held with `adb shell input swipe x y x y 2500` shows the pressed cap, the key
  preview and the more-keys panel. A synthetic touch did not show the pressed look of a
  suggestion; a finger did.
- The browser opens only `http` and `https` addresses. A test page with one field of each
  input type is served from the workstation through `adb reverse` and removed afterwards.
  `pkill -f '<pattern>'` run from a shell whose command line contains the pattern
  kills that shell; use `pgrep -f '[p]attern'` and kill the pids.
- TalkBack on the phone took over the touch input and could not be switched off from
  the screen. With the phone unlocked and `adb` up,
  `settings put secure enabled_accessibility_services null` and
  `settings put secure accessibility_enabled 0` turn it off `[measured]`. Prefer the
  Accessibility Menu service for node dumps and leave TalkBack to a checked, announced
  step with the owner.
- A page for the autofill chips must be `https`: the Passwords app offers nothing on a plain `http` page by design
  (`StructureParser` returns nothing for `plainHttp`, review P-03), and the log reads `Empty dataset` after every
  fill request. A self-signed certificate served from the workstation through `adb reverse` works; Vanadium shows the
  certificate warning once and the owner proceeds. The website of a login is a host without a port or a scheme, and a
  name without a dot such as `localhost` has no registrable domain in the vault index, so the test login is for
  `chip.localhost`, which Vanadium resolves to the loopback `[measured 2026-10-30, lynx 2026103001]`.
- A sequence of keyboard actions is read from a screenshot per second taken while the owner works (`adb exec-out
  screencap -p` in a loop), then reduced per frame to the focus border of the field, the chip pill and the strip. A
  classification by colour needs one control per theme; a grid of strip and field crops is the check.
- The platform treats an empty field as "show everything": `InlineFillUi.includeDataset` returns every dataset for an
  empty filter text, and `Session` sends the filtered response to the keyboard on each value change `[verified-in-source]`.
  It also stops filtering a field after a character was removed and then added, as a defence against a keyboard that
  probes the datasets (`updateFilteringStateOnValueChangedLocked`). The chips use a null filter, so neither rule changes
  what the keyboard sees; the offer after typing is the keyboard's own policy (ADR-191, ADR-207).
- A generator that refuses to run twice leaves an untracked new file behind after a
  `git reset --hard`; the next run then refuses. Start each attempt from a fresh branch
  of the base commit.
- `adb shell input tap` on the keyboard pages (2026-11-03, `lynx` `2026110203`): the page changes about a second after a tap, `uiautomator dump --windows` read right after a tap still lists the key labels of the previous page, and a tap sent before the page has changed lands on the old layout (taps on the position of the shift key, sent while the symbols page was still showing, left the characters `↑|` in the search field; the cause was not traced). Wait 1.5 s or more after each tap, read the screenshot of the page instead of the dump to know where you are, and leave the field empty afterwards. The key preview and the long-press panel of `e` show only while a swipe of 2.5 s on the key is held (`input swipe X Y X Y 2500` in the background, `screencap` after 1.0 to 1.4 s). Caps lock and one-tap shift have the same tone (white cap, teal arrow), so a screenshot cannot tell them apart.
