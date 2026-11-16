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
- **Replay of the boot animation on a running phone** (2026-11-03, `lynx` `2026110203`, `adb root`): `setprop service.bootanim.exit 1` and wait until `getprop init.svc.bootanim` reads `stopped`, then `setprop service.bootanim.exit 0` and `setprop ctl.start bootanim`; `ctl.start` does nothing while the previous replay still runs. The service stays up until `service.bootanim.exit` is set to 1 again. `screencap -p` of eight frames 0.37 s apart shows the segment (`#4AC2A3`, 34 pixels wide in the row 2154) in four frames and the track alone in the other four, so a check that needs the segment reads several frames. The replay is not the boot: 2.5 s after the start the process has 33 MB PSS (84 MB RSS, 71 MB of graphics in `dumpsys meminfo`, 0.72 to 0.75 s of CPU), a figure for no comparison with the stock image until one is read the same way.
- **A `bootanimation.zip` on the device hides the textures of `framework-res.apk`** (2026-11-05, `lynx` `2026110501`, tag `2026110200`): `BootAnimation.cpp` plays `/product/media/bootanimation.zip` (lookup: the apex, then `/product/media/`, `/oem/media/`, `/system/media/`) before it falls back to the built-in textures `android-logo-mask.png` and `android-logo-shine.png`, so a correct `framework-res.apk` (the two PNGs equal to the source, read with `unzip -p framework-res.apk assets/images/<name> | sha256sum`) can still boot with another picture. Tag `2026110200` added the upstream project `branding`, whose `bootanimation_zip` (a GrapheneOS logo, 540 frames of 433 x 586, 3615757 bytes) `base_product.mk` installs in every product (ADR-219). First read on a device: `adb shell ls -l /product/media` and `unzip -l` of the pulled zip; look at one frame (`part2/00040.png`). The replay of the service then shows the window pixels `000000` in every frame instead of the track `1A3B35`. Hide the zip for one replay with `adb root`, `mount -t tmpfs tmpfs /product/media`, the replay, `umount /product/media`, the hash of the zip read before and after, `adb unroot`: the same replay then showed the track in every frame and the segment `4AC2A3` in two of six. A check that reads only `framework-res.apk` passes while the real boot is wrong (the replay of `BOOT-009` does catch it); read `/product/media` first on the first image of every new tag.
