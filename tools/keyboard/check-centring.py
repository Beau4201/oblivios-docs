#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Checks the centring invariants of the restyled LatinIME key drawables (ADR-146, spec section 4).

usage: check-centring.py <LatinIME java dir>

LatinIME draws a key background over the key rectangle grown by the drawable's padding
(KeyboardView.onDrawKeyBackground) and centres the label on the key rectangle, not on the drawable.
A key is therefore centred on its cap exactly when:
  1. the cap fill is inset from the bottom by the same amount as the drawable's bottom padding
     (the edge below the cap is the padding, and nothing else is);
  2. no cap has any other padding;
  3. every cap that the normal, functional or space-bar background can select has the same padding,
     because KeyboardView reads the padding of the normal background only and applies it to all keys
     (and a StateListDrawable takes the largest padding of its children).
  4. an action cap and a key preview have an intrinsic size (see check_cap and the end of the file).
Prints "centring: OK" or one line per violation; exits 1 on a violation.
"""
import pathlib
import re
import sys
import xml.etree.ElementTree as ET

A = "{http://schemas.android.com/apk/res/android}"
root = pathlib.Path(sys.argv[1]) / "res"
bad = []


def parse(rel):
    # The input is the pinned source tree, not untrusted data; a DTD or entity is still refused,
    # which is what the stdlib parser is unsafe against.
    text = (root / rel).read_text()
    if "<!DOCTYPE" in text or "<!ENTITY" in text:
        sys.exit("centring: %s declares a DOCTYPE or ENTITY, refused" % rel)
    return ET.fromstring(text)


def drawable_file(ref):
    m = re.fullmatch(r"@drawable/(\w+)", ref or "")
    return ("drawable/%s.xml" % m.group(1)) if m and (root / ("drawable/%s.xml" % m.group(1))).is_file() else None


def padding_of(rel):
    """(left, top, right, bottom) as written, for a layer-list; None for anything else."""
    r = parse(rel)
    if r.tag != "layer-list":
        return None
    return tuple(r.get(A + k) for k in ("paddingLeft", "paddingTop", "paddingRight", "paddingBottom"))


def check_cap(rel):
    r = parse(rel)
    pad = padding_of(rel)
    if pad != ("0dp", "0dp", "0dp", "@dimen/freeholdos_key_edge"):
        bad.append("%s: padding %s, want only a bottom padding of @dimen/freeholdos_key_edge" % (rel, pad))
    items = r.findall("item")
    if len(items) < 2:
        bad.append("%s: expected an edge item and a cap item" % rel)
        return
    if any(items[0].get(A + k) for k in ("left", "top", "right", "bottom")):
        bad.append("%s: the edge item must fill the whole drawable" % rel)
    for i, it in enumerate(items[1:], 1):
        if it.get(A + "bottom") != "@dimen/freeholdos_key_edge" or any(it.get(A + k) for k in ("left", "top", "right")):
            bad.append("%s: item %d must be inset only from the bottom, by the edge height" % (rel, i))
    if "key_cap_action" in rel:
        # The enter and emoji keys have the keepBackgroundAspectRatio label flag and the action
        # background; onDrawKeyBackground scales that background by its intrinsic size, and a
        # drawable without one is drawn as a square of the longer key side.
        for i, it in enumerate(items):
            size = it.find("shape/size")
            if size is None or not size.get(A + "width") or not size.get(A + "height"):
                bad.append("%s: item %d of an action cap needs a <size> (intrinsic size)" % (rel, i))


for theme in ("light", "dark"):
    refs = {}
    for sel in ("btn_keyboard_key_lxx_%s", "btn_keyboard_key_functional_lxx_%s", "btn_keyboard_spacebar_lxx_%s"):
        rel = "drawable/%s.xml" % (sel % theme)
        for it in parse(rel).findall("item"):
            d = it.get(A + "drawable")
            if d is None:
                bad.append("%s: an item without an android:drawable" % rel)
            elif d.startswith("@drawable/"):
                refs[d] = rel
            elif d not in ("@android:color/transparent", "@color/key_background_pressed_lxx_" + theme):
                bad.append("%s: unexpected drawable %s" % (rel, d))
    for d, rel in refs.items():
        f = drawable_file(d)
        if f is None:
            bad.append("%s: %s does not resolve to a drawable file" % (rel, d))
        elif not d.startswith("@drawable/freeholdos_key_cap"):
            bad.append("%s: %s is not a restyled cap" % (rel, d))
        else:
            check_cap(f)
    if not refs:
        bad.append("%s: no caps found" % theme)

for theme in ("light", "dark"):
    # KeyPreviewView scales the label by the intrinsic width of its background; without a size the
    # scale is negative and the key preview is not shown.
    rel = "drawable/freeholdos_key_preview_%s.xml" % theme
    for i, it in enumerate(parse(rel).findall("item")):
        size = it.find("shape/size")
        if size is None or not size.get(A + "width") or not size.get(A + "height"):
            bad.append("%s: item %d of a key preview needs a <size> (intrinsic size)" % (rel, i))

print("\n".join(bad) if bad else "centring: OK")
sys.exit(1 if bad else 0)
