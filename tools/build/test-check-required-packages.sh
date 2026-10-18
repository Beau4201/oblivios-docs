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
    for n in Updater.apk Seedvault.apk Auditor.apk PdfViewerGOS.apk GuardianApp.apk \
      privapp-permissions-org.freeholdos.guardian.xml AirPodsApp.apk \
      privapp-permissions-org.freeholdos.airpods.xml \
      hidden-api-whitelisted-app-org.freeholdos.airpods.xml \
      default-permissions-org.freeholdos.airpods.xml; do
      echo "1 /system/x/$n"
    done
    if [[ "${4:-}" != "no-datamap" ]]; then
      echo "1 /system/priv-app/DataMapApp/DataMapApp.apk"
      echo "1 /system/etc/permissions/privapp-permissions-org.freeholdos.datamap.xml"
      echo "1 /system/etc/sysconfig/hidden-api-whitelisted-app-org.freeholdos.datamap.xml"
      echo "1 /system/etc/datamap/classifier.tsv"
      echo "1 /system/etc/datamap/ipmap.bin"
    fi
    if [[ "$3" == "with-harness" ]]; then
      echo "1 /system/priv-app/AirPodsDebugHarness/AirPodsDebugHarness.apk"
    fi
    if [[ "$3" == "xml-only" ]]; then
      echo "1 /system/etc/sysconfig/hidden-api-whitelisted-app-org.freeholdos.airpods.debugharness.xml"
    fi
  } > "$1/installed-files.txt"
  if [[ "${4:-}" != "no-datamap" ]]; then
    ipmapfile "$1/system/etc/datamap/ipmap.bin" 20000000 none
  fi
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
mkdir -p "$T/nb"; cp "$T/u1/installed-files.txt" "$T/nb/"; expect "missing build.prop fails closed" 1 "$T/nb"

# The Data Map (ADR-157): the app, its two system files and the classifier must all be there.
mkproduct "$T/nd" userdebug no-harness no-datamap; expect "a product without the Data Map is refused" 1 "$T/nd"
for n in DataMapApp.apk privapp-permissions-org.freeholdos.datamap.xml \
  hidden-api-whitelisted-app-org.freeholdos.datamap.xml datamap/classifier.tsv; do
  grep -q "MISSING: $n" "$T/out" || { echo "FAIL: $n not reported missing"; cat "$T/out"; exit 1; }
done
# only the classifier under datamap/ counts: a classifier.tsv elsewhere does not
mkproduct "$T/wp" userdebug no-harness no-datamap
{ echo "1 /system/priv-app/DataMapApp/DataMapApp.apk"
  echo "1 /system/etc/permissions/privapp-permissions-org.freeholdos.datamap.xml"
  echo "1 /system/etc/sysconfig/hidden-api-whitelisted-app-org.freeholdos.datamap.xml"
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
echo "all gate tests passed"
