#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
# Host test for check-required-packages.sh: the userdebug-only AirPods harness (ADR-120)
# is tolerated in userdebug and forbidden in user builds. Fake product dirs, no server.
set -o errexit -o nounset -o pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
GATE="$HERE/check-required-packages.sh"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT

mkproduct() { # $1 = dir, $2 = build type, $3 = "with-harness" | "xml-only" | "no-harness", $4 = "no-datamap" to leave the Data Map out
  mkdir -p "$1/system"
  echo "ro.build.type=$2" > "$1/system/build.prop"
  {
    for n in Updater.apk Seedvault.apk Auditor.apk PdfViewerGOS.apk AirPodsApp.apk \
      privapp-permissions-org.oblivios.airpods.xml \
      hidden-api-whitelisted-app-org.oblivios.airpods.xml \
      default-permissions-org.oblivios.airpods.xml; do
      echo "1 /system/x/$n"
    done
    if [[ "${4:-}" != "no-datamap" ]]; then
      echo "1 /system/priv-app/DataMapApp/DataMapApp.apk"
      echo "1 /system/etc/permissions/privapp-permissions-org.oblivios.datamap.xml"
      echo "1 /system/etc/sysconfig/hidden-api-whitelisted-app-org.oblivios.datamap.xml"
      echo "1 /system/etc/datamap/classifier.tsv"
      echo "1 /system/etc/datamap/ipmap.bin"
    fi
    if [[ "${4:-}" != "no-persona" ]]; then
      echo "1 /product/etc/compartments/places.tsv"
      echo "1 /product/etc/compartments/cells.tsv"
      mkdir -p "$1/product/etc/compartments"
      head -c 1000000 /dev/zero > "$1/product/etc/compartments/places.tsv"
      head -c 5000000 /dev/zero > "$1/product/etc/compartments/cells.tsv"
    fi
    if [[ "${4:-}" != "no-passwords" ]]; then
      echo "1 /product/app/PasswordsApp/PasswordsApp.apk"
      echo "1 /product/app/PasswordsApp/lib/arm64/libvault_core.so"
    fi
    if [[ "${4:-}" != "no-exit" ]]; then
      echo "1 /system/bin/exitd"
      echo "1 /system/priv-app/ExitApp/ExitApp.apk"
      echo "1 /system/etc/init/exit.rc"
      echo "1 /system/etc/oblivios/exit-mask-list.tsv"
      echo "1 /system/etc/permissions/privapp-permissions-org.oblivios.exit.xml"
      echo "1 /system/etc/default-permissions/default-permissions-org.oblivios.exit.xml"
    fi
    if [[ "$3" == "with-harness" ]]; then
      echo "1 /system/priv-app/AirPodsDebugHarness/AirPodsDebugHarness.apk"
    fi
    if [[ "$3" == "with-exitprobe" ]]; then
      echo "1 /system/priv-app/ExitProbe/ExitProbe.apk"
      echo "1 /system/etc/permissions/privapp-permissions-org.oblivios.exitprobe.xml"
    fi
    if [[ "$3" == "exitprobe-xml-only" ]]; then
      echo "1 /system/etc/permissions/privapp-permissions-org.oblivios.exitprobe.xml"
    fi
    if [[ "$3" == "xml-only" ]]; then
      echo "1 /system/etc/sysconfig/hidden-api-whitelisted-app-org.oblivios.airpods.debugharness.xml"
    fi
  } > "$1/installed-files.txt"
  updaterapk "$1/system/x/Updater.apk" "${UPDATER_URL-https://ota.test.example/}"
  if [[ "${4:-}" != "no-datamap" ]]; then
    ipmapfile "$1/system/etc/datamap/ipmap.bin" 20000000 none
  fi
  if [[ "${4:-}" != "no-exit" ]]; then
    exitfiles "$1"
  fi
}

updaterapk() { # $1 = path, $2 = the URL that the Updater's resources.arsc holds (empty: none); the gate reads that string
  mkdir -p "$(dirname "$1")"
  python3 -I - "$1" "$2" <<'PY'
import sys, zipfile
with zipfile.ZipFile(sys.argv[1], "w") as z:
    z.writestr("resources.arsc", b"\x02\x00\x0c\x00junk" + sys.argv[2].encode() + b"\x00more")
PY
}

exitfiles() { # $1 = product dir: the three exit files the gate reads, in their good form
  mkdir -p "$1/system/bin" "$1/system/etc/init" "$1/system/etc/oblivios"
  { printf '\177ELF'; head -c 5999996 /dev/zero; } > "$1/system/bin/exitd"
  printf 'service exitd /system/bin/exitd --x\n    class main\nservice exitd_route /system/bin/exitd --routes\n    class main\n' > "$1/system/etc/init/exit.rc"
  { printf 'exit-mask-list\t1\n'; for i in $(seq 1 1000); do printf 'd%s.example\t%s\tN\n' "$i" "$i"; done; } > "$1/system/etc/oblivios/exit-mask-list.tsv"
}

ipmapfile() { # $1 = path, $2 = size in bytes, $3 = what is wrong with it (none, magic, version, reserved, city, asn, gap, trailing)
  mkdir -p "$(dirname "$1")"
  python3 -I - "$1" "$2" "$3" <<'PY'
import struct, sys
path, size, flaw = sys.argv[1], int(sys.argv[2]), sys.argv[3]
header = 8 + 8 * 13
lens = [0] * 13
body = size - header
for i in range(12):
    lens[i] = body // 13
lens[12] = body - sum(lens[:12])
if flaw == "city":
    lens[12] += lens[2]; lens[2] = 0
if flaw == "asn":
    lens[12] += lens[1]; lens[1] = 0
offs, pos = [], header
for n in lens:
    offs.append(pos); pos += n
if flaw == "gap":
    offs[5] += 1
if flaw == "trailing":
    lens[12] -= 1
blob = bytearray(size)
blob[0:4] = b"XXXX" if flaw == "magic" else b"DMIP"
blob[4:6] = struct.pack(">H", 2 if flaw == "version" else 1)
blob[6:8] = struct.pack(">H", 1 if flaw == "reserved" else 0)
for i in range(13):
    blob[8 + 8 * i:16 + 8 * i] = struct.pack(">II", offs[i], lens[i])
open(path, "wb").write(blob)
PY
}

expect() { # $1 = name, $2 = expected exit, $3.. = gate args
  local name="$1" want="$2"; shift 2
  set +o errexit
  "$GATE" "$@" > "$T/out" 2>&1
  local got=$?
  set -o errexit
  if [[ $got -ne $want ]]; then
    echo "FAIL $name: exit $got, wanted $want"; cat "$T/out"; exit 1
  fi
  echo "ok   $name"
}

mkproduct "$T/ud" userdebug with-harness;  expect "userdebug with harness passes" 0 "$T/ud"
mkproduct "$T/u1" user no-harness;         expect "user without harness passes" 0 "$T/u1"
mkproduct "$T/u2" user with-harness;       expect "user with harness is refused" 1 "$T/u2"
grep -q "FORBIDDEN: AirPodsDebugHarness.apk" "$T/out" || { echo "FAIL: wrong message"; cat "$T/out"; exit 1; }
mkproduct "$T/u3" user xml-only;           expect "user with only the exemption file is refused" 1 "$T/u3"
mkproduct "$T/ud2" userdebug xml-only;     expect "userdebug with the exemption file passes" 0 "$T/ud2"
# The exit probe (ADR-184, NET-001b) rides PRODUCT_PACKAGES_DEBUG as the AirPods harness does.
mkproduct "$T/ep1" userdebug with-exitprobe;  expect "userdebug with the exit probe passes" 0 "$T/ep1"
mkproduct "$T/ep2" user with-exitprobe;       expect "user with the exit probe is refused" 1 "$T/ep2"
grep -q "FORBIDDEN: ExitProbe.apk" "$T/out" || { echo "FAIL: wrong message"; cat "$T/out"; exit 1; }
grep -q "FORBIDDEN: privapp-permissions-org.oblivios.exitprobe.xml" "$T/out" || { echo "FAIL: allowlist not reported"; cat "$T/out"; exit 1; }
mkproduct "$T/ep3" user exitprobe-xml-only;   expect "user with only the exit probe allowlist is refused" 1 "$T/ep3"
mkdir -p "$T/nb"; cp "$T/u1/installed-files.txt" "$T/nb/"; expect "missing build.prop fails closed" 1 "$T/nb"

# ADR-245: the Updater must point at the private OTA server, read from the built APK.
UPDATER_URL='https://releases.grapheneos.org/' mkproduct "$T/up1" user no-harness; expect "an Updater with the upstream URL is refused" 1 "$T/up1"
grep -q "upstream default or the placeholder" "$T/out" || { echo "FAIL: wrong message"; cat "$T/out"; exit 1; }
UPDATER_URL='https://ota.example.invalid/' mkproduct "$T/up2" user no-harness; expect "an Updater with the placeholder is refused" 1 "$T/up2"
UPDATER_URL='' mkproduct "$T/up3" user no-harness; expect "an Updater with no URL is refused" 1 "$T/up3"
grep -q "holds no https URL" "$T/out" || { echo "FAIL: wrong message"; cat "$T/out"; exit 1; }
mkproduct "$T/up4" user no-harness; rm "$T/up4/system/x/Updater.apk"; expect "a listed Updater.apk that is not there is refused" 1 "$T/up4"

# ADR-240: Guardian left the product. A tree that still builds any part of it is refused, in a user and in a userdebug image.
for gn in "priv-app/GuardianApp/GuardianApp.apk" "app/GuardianLocationFixture/GuardianLocationFixture.apk" \
  "etc/permissions/privapp-permissions-org.oblivios.guardian.xml"; do
  for bt in user userdebug; do
    mkproduct "$T/g-$bt" "$bt" no-harness; echo "1 /system/$gn" >> "$T/g-$bt/installed-files.txt"
    expect "$bt image with ${gn##*/} is refused" 1 "$T/g-$bt"
    grep -q "FORBIDDEN: ${gn##*/}" "$T/out" || { echo "FAIL: ${gn##*/} not reported"; cat "$T/out"; exit 1; }
  done
done

# The Data Map (ADR-157): the app, its two system files and the classifier must all be there.
mkproduct "$T/nd" userdebug no-harness no-datamap; expect "a product without the Data Map is refused" 1 "$T/nd"
for n in DataMapApp.apk privapp-permissions-org.oblivios.datamap.xml \
  hidden-api-whitelisted-app-org.oblivios.datamap.xml datamap/classifier.tsv; do
  grep -q "MISSING: $n" "$T/out" || { echo "FAIL: $n not reported missing"; cat "$T/out"; exit 1; }
done
# only the classifier under datamap/ counts: a classifier.tsv elsewhere does not
mkproduct "$T/wp" userdebug no-harness no-datamap
{ echo "1 /system/priv-app/DataMapApp/DataMapApp.apk"
  echo "1 /system/etc/permissions/privapp-permissions-org.oblivios.datamap.xml"
  echo "1 /system/etc/sysconfig/hidden-api-whitelisted-app-org.oblivios.datamap.xml"
  echo "1 /system/etc/other/classifier.tsv"; } >> "$T/wp/installed-files.txt"
expect "a classifier outside datamap/ does not count" 1 "$T/wp"
grep -q "MISSING: datamap/classifier.tsv" "$T/out" || { echo "FAIL: wrong path accepted"; cat "$T/out"; exit 1; }
# ADR-161: the address data counts only under datamap/
mkproduct "$T/ip" userdebug no-harness
grep -v '/system/etc/datamap/ipmap.bin' "$T/ip/installed-files.txt" > "$T/ip/x" && mv "$T/ip/x" "$T/ip/installed-files.txt"
echo "1 /system/etc/other/ipmap.bin" >> "$T/ip/installed-files.txt"
expect "an address file outside datamap/ does not count" 1 "$T/ip"
grep -q "MISSING: datamap/ipmap.bin" "$T/out" || { echo "FAIL: wrong path accepted"; cat "$T/out"; exit 1; }
# ADR-161: the file itself is read, not only its name. The fixture of the tool is a few KB, a build from a truncated
# download is smaller than the real file, and a file of another kind has another magic.
mkproduct "$T/ip2" userdebug no-harness
ipmapfile "$T/ip2/system/etc/datamap/ipmap.bin" 1530 none
expect "the fixture file of the tool is refused" 1 "$T/ip2"
grep -q "ipmap.bin is too small" "$T/out" || { echo "FAIL: wrong message"; cat "$T/out"; exit 1; }
mkproduct "$T/ip3" userdebug no-harness
ipmapfile "$T/ip3/system/etc/datamap/ipmap.bin" 20000000 magic
expect "a file that is not an ipmap is refused" 1 "$T/ip3"
grep -q "ipmap.bin is not an ipmap file" "$T/out" || { echo "FAIL: wrong message"; cat "$T/out"; exit 1; }
mkproduct "$T/ip4" userdebug no-harness
rm "$T/ip4/system/etc/datamap/ipmap.bin"
expect "a file that is listed and not there is refused" 1 "$T/ip4"
grep -q "ipmap.bin is not in the product" "$T/out" || { echo "FAIL: wrong message"; cat "$T/out"; exit 1; }
mkproduct "$T/ip5" userdebug no-harness
ipmapfile "$T/ip5/system/etc/datamap/ipmap.bin" 20000000 version
expect "a file of another version is refused" 1 "$T/ip5"
mkproduct "$T/ip6" userdebug no-harness
ipmapfile "$T/ip6/system/etc/datamap/ipmap.bin" 16777215 none
expect "a file one byte under the lower bound is refused" 1 "$T/ip6"
mkproduct "$T/ip7" userdebug no-harness
ipmapfile "$T/ip7/system/etc/datamap/ipmap.bin" 16777216 none
expect "a file of exactly the lower bound passes" 0 "$T/ip7"
for flaw in reserved city asn gap trailing; do
  mkproduct "$T/f-$flaw" userdebug no-harness
  ipmapfile "$T/f-$flaw/system/etc/datamap/ipmap.bin" 20000000 "$flaw"
  expect "an ipmap with a broken header ($flaw) is refused" 1 "$T/f-$flaw"
  grep -q "ipmap.bin is not an ipmap file" "$T/out" || { echo "FAIL: wrong message"; cat "$T/out"; exit 1; }
done
# ADR-186: the exit service. The six names must be there, and the three files that the gate reads must be what they claim.
mkproduct "$T/ne" userdebug no-harness no-exit;  expect "a product without the exit service is refused" 1 "$T/ne"
for n in exitd ExitApp.apk exit.rc oblivios/exit-mask-list.tsv privapp-permissions-org.oblivios.exit.xml \
  default-permissions-org.oblivios.exit.xml; do
  grep -q "MISSING: $n" "$T/out" || { echo "FAIL: $n not reported missing"; cat "$T/out"; exit 1; }
done
# ADR-185: the Passwords app and its Rust core. A name proves a module was built; the core is the file that the app cannot start without.
mkproduct "$T/np" userdebug no-harness no-passwords;  expect "a product without the Passwords app is refused" 1 "$T/np"
for n in PasswordsApp.apk libvault_core.so; do
  grep -q "MISSING: $n" "$T/out" || { echo "FAIL: $n not reported missing"; cat "$T/out"; exit 1; }
done
# ADR-208: the persona place data. Both names must be there, and a file under the floor is refused.
mkproduct "$T/npd" userdebug no-harness no-persona;  expect "a product without the persona data is refused" 1 "$T/npd"
for n in compartments/places.tsv compartments/cells.tsv; do
  grep -q "MISSING: $n" "$T/out" || { echo "FAIL: $n not reported missing"; cat "$T/out"; exit 1; }
done
mkproduct "$T/pd1" userdebug no-harness; head -c 999999 /dev/zero > "$T/pd1/product/etc/compartments/places.tsv"
expect "a places.tsv under 1000000 bytes is refused" 1 "$T/pd1"
grep -q "places.tsv is too small" "$T/out" || { echo "FAIL: wrong message"; cat "$T/out"; exit 1; }
mkproduct "$T/pd2" userdebug no-harness; head -c 4999999 /dev/zero > "$T/pd2/product/etc/compartments/cells.tsv"
expect "a cells.tsv under 5000000 bytes is refused" 1 "$T/pd2"
grep -q "cells.tsv is too small" "$T/out" || { echo "FAIL: wrong message"; cat "$T/out"; exit 1; }
mkproduct "$T/pd3" userdebug no-harness; rm "$T/pd3/product/etc/compartments/cells.tsv"
expect "a cells.tsv that is listed and not there is refused" 1 "$T/pd3"
grep -q "cells.tsv is not in the product" "$T/out" || { echo "FAIL: wrong message"; cat "$T/out"; exit 1; }
mkproduct "$T/x1" userdebug no-harness;  expect "a product with the exit service passes" 0 "$T/x1"
mkproduct "$T/x2" userdebug no-harness; rm "$T/x2/system/bin/exitd"
expect "an exitd that is listed and not there is refused" 1 "$T/x2"
grep -q "exitd is not in the product" "$T/out" || { echo "FAIL: wrong message"; cat "$T/out"; exit 1; }
mkproduct "$T/x3" userdebug no-harness; head -c 4999999 /dev/zero | { printf '\177ELF'; cat; } | head -c 4999999 > "$T/x3/system/bin/exitd"
expect "an exitd under 5 MB is refused" 1 "$T/x3"
mkproduct "$T/x3b" userdebug no-harness; head -c 5000000 "$T/x1/system/bin/exitd" > "$T/x3b/system/bin/exitd"
expect "an exitd of exactly 5 MB passes" 0 "$T/x3b"
mkproduct "$T/x4" userdebug no-harness; head -c 6000000 /dev/zero > "$T/x4/system/bin/exitd"
expect "an exitd that is not an ELF file is refused" 1 "$T/x4"
grep -q "exitd is not the daemon" "$T/out" || { echo "FAIL: wrong message"; cat "$T/out"; exit 1; }
mkproduct "$T/x5" userdebug no-harness; sed -i '/^service exitd_route /d' "$T/x5/system/etc/init/exit.rc"
expect "an exit.rc without the route helper is refused" 1 "$T/x5"
grep -q "exit.rc does not define" "$T/out" || { echo "FAIL: wrong message"; cat "$T/out"; exit 1; }
mkproduct "$T/x6" userdebug no-harness; sed -i '/^service exitd /d' "$T/x6/system/etc/init/exit.rc"
expect "an exit.rc without the daemon is refused" 1 "$T/x6"
mkproduct "$T/x7" userdebug no-harness; rm "$T/x7/system/etc/init/exit.rc"
expect "an exit.rc that is listed and not there is refused" 1 "$T/x7"
mkproduct "$T/x8" userdebug no-harness; sed -i '1s/.*/not a list/' "$T/x8/system/etc/oblivios/exit-mask-list.tsv"
expect "a mask list without its header is refused" 1 "$T/x8"
grep -q "exit-mask-list.tsv is not the mask list" "$T/out" || { echo "FAIL: wrong message"; cat "$T/out"; exit 1; }
mkproduct "$T/x9" userdebug no-harness; head -n 999 "$T/x1/system/etc/oblivios/exit-mask-list.tsv" > "$T/x9/system/etc/oblivios/exit-mask-list.tsv"
expect "a mask list of 998 rows is refused" 1 "$T/x9"
mkproduct "$T/xa" userdebug no-harness; head -n 1000 "$T/x1/system/etc/oblivios/exit-mask-list.tsv" > "$T/xa/system/etc/oblivios/exit-mask-list.tsv"
expect "a mask list of 1000 lines passes" 0 "$T/xa"
mkproduct "$T/xb" userdebug no-harness; rm "$T/xb/system/etc/oblivios/exit-mask-list.tsv"
expect "a mask list that is listed and not there is refused" 1 "$T/xb"
echo "all gate tests passed"
