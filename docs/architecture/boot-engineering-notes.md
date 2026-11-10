# Boot picture engineering notes

Short, actionable lessons from authoring the boot picture of ADR-152, for the
next change to `branding/boot` in `oblivios-platform`. The design and the
renderer constraints are in
`2026-10-11-boot-picture-design.md`;
the evidence rows are `BOOT-*` in the validation matrix.

- **Simulate the renderer, do not read it once.** The renderer draws only two
  copies of the scrolling texture, so a texture narrower than the right edge of
  the window leaves part of the bar blank at some offsets. The first simulation
  used the wrong composite mode (`-compose Src`) and showed a full bar at every
  offset, so it hid the defect; a simulation needs a case that must fail before
  it is trusted. The package test now composes the renderer's drawing at twelve
  offsets and is mutation-checked with the narrow texture.
- **A test that passes first time is not yet a test.** Mutate each assertion.
  Two of the checks here were too weak: the name check was met by the mint word
  alone, and the texture-width defect was caught by an earlier unrelated check.
  Both were found only by removing the thing under test.
- **ImageMagick noise at this amplitude does nothing.** `-attenuate` with
  `+noise Uniform` changed no pixel for values up to 0.08 on an 8-bit image
  (maximum difference 0). Use `-fx` with a function of the pixel position; it is
  deterministic, and the measured maximum difference is one 8-bit level.
  `-fx` rejects built-in single letters as user symbols (`t`, `k`); use a longer
  name.
- **Check a font generator against a known output.** The glyph and kerning code
  reproduced the width of the old Aegis lockup exactly (242.3 px) before it was
  used for the new name.
- **Headless Chromium captures animation phases.** `--virtual-time-budget`
  advances SVG animation time, so a still can be taken at any phase of a loop.
- **Author renderer-facing patches twice and compare.** The package patches are
  based on the stock files; the build tree carries the earlier ADR-019 commits,
  so a delta commit is landed there. Compare `git rev-parse HEAD:<path>` of both
  routes before landing.
- **Measure the geometry the simulation assumes.** The first simulation put the
  loading texture at the top of the mask and the test passed; the renderer puts
  every texture on the bottom edge (`drawTexturedQuad` maps y upwards), so the bar
  was hidden and the picture still. A simulation counts only after one frame of
  it equals a frame captured from the real renderer on a device; this one was
  checked afterwards (5e-8 of the pixels differ on the bottom edge, 8e-5 on the
  top edge).
- **Replay the boot animation on a `userdebug` device instead of building to look
  at it.** With `adb root`: `setprop service.bootanim.exit 1` and wait until
  `init.svc.bootanim` is `stopped`, then `setprop service.bootanim.exit 0` and
  `setprop ctl.start bootanim`, and `screencap` frames 0.37 s apart. A service
  that still runs ignores `ctl.start`, which gave six identical frames and a
  false negative once. To try an asset without an image, bind-mount a copy of
  `framework-res.apk` over `/system/framework/framework-res.apk` for the replay
  (rewrite the zip with the entry replaced and run `zipalign -p 4`), confirm in
  `/proc/<pid>/maps` that the process mapped the copy (the inode of the copy),
  and `umount` and compare the hash of the original afterwards. `adb unroot`
  when done.
- **A pixel equal to the clear colour is no evidence of a drawn texture.** The
  edge colour of the loading texture equals the clear colour, so an empty window
  looked the same as a window that showed texture rows of the wrong place. Give a
  test texture a colour that cannot be the background (the track `#1A3B35` is not).
