#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
# Fails when a package ObliviOS requires is missing from a real device
# build. A clean build exit proves nothing here: ADR-047 (OFFICIAL_BUILD
# packages) and Guardian's privapp allowlist on lynx (2026-09-28, a module
# name left over from the AegisOS rename) both shipped from green builds.
# Only the product dir's own installed-files*.txt count, never
# obj/PACKAGING/ (the official-build rule of the project).
set -o errexit -o nounset -o pipefail

PRODUCT_OUT="${1:?usage: check-required-packages.sh <product-out-dir>}"
REQUIRED=(
  Updater.apk
  Seedvault.apk
  Auditor.apk
  PdfViewerGOS.apk
  GuardianApp.apk
  privapp-permissions-org.oblivios.guardian.xml
  AirPodsApp.apk
  privapp-permissions-org.oblivios.airpods.xml
  hidden-api-whitelisted-app-org.oblivios.airpods.xml
  default-permissions-org.oblivios.airpods.xml
  DataMapApp.apk
  privapp-permissions-org.oblivios.datamap.xml
  hidden-api-whitelisted-app-org.oblivios.datamap.xml
  datamap/classifier.tsv
  datamap/ipmap.bin
)

shopt -s nullglob
LISTS=("$PRODUCT_OUT"/installed-files*.txt)
if [[ ${#LISTS[@]} -eq 0 ]]; then
  echo "no installed-files*.txt in ${PRODUCT_OUT}" >&2
  exit 1
fi

# Test-only modules that must never reach a device image. `m <module>` for a
# standalone test install still copies into the product staging dir, and the
# next image build picks it up: GuardianLocationFixture shipped in lynx's
# 2026-09-26 image this way (found 2026-09-28).
FORBIDDEN=(
  GuardianLocationFixture.apk
)

# The userdebug-only AirPods validation harness (ADR-120) rides PRODUCT_PACKAGES_DEBUG and
# must never reach a user image. Fail closed if the build type cannot be read: a gate that
# silently skips this check would defeat it.
BUILD_PROP="$PRODUCT_OUT/system/build.prop"
BUILD_TYPE="$(sed -n 's/^ro\.build\.type=//p' "$BUILD_PROP" 2>/dev/null | head -n 1 || true)"
if [[ -z "$BUILD_TYPE" ]]; then
  echo "cannot read ro.build.type from ${BUILD_PROP}" >&2
  exit 1
fi
if [[ "$BUILD_TYPE" == "user" ]]; then
  FORBIDDEN+=(
    AirPodsDebugHarness.apk
    AirPodsProbeNoPerm.apk
    AirPodsProbeBtPriv.apk
    privapp-permissions-org.oblivios.airpods.debugharness.xml
    hidden-api-whitelisted-app-org.oblivios.airpods.debugharness.xml
  )
fi

bad=0
for name in "${REQUIRED[@]}"; do
  # Anchor on "/<name>" at end of line so FooUpdater.apk never counts as Updater.apk.
  if ! grep -qE "/${name//./\\.}\$" "${LISTS[@]}"; then
    echo "MISSING: ${name}"
    bad=1
  fi
done
for name in "${FORBIDDEN[@]}"; do
  if grep -qE "/${name//./\\.}\$" "${LISTS[@]}"; then
    echo "FORBIDDEN: ${name}"
    bad=1
  fi
done
# ADR-161: the address data is read, not only named. A name in installed-files proves that a module was built, not
# what it holds: the fixture of the data tool (a few KB), a file made from a cut-short download and a file of another
# kind all carry that name. DataMapService reads exactly /system/etc/datamap/ipmap.bin; a real file is about 48 MB.
if grep -qE '/datamap/ipmap\.bin$' "${LISTS[@]}"; then
  IPMAP="$PRODUCT_OUT/system/etc/datamap/ipmap.bin"
  if [[ ! -f "$IPMAP" ]]; then
    echo "ipmap.bin is not in the product (system/etc/datamap/ipmap.bin)"
    bad=1
  elif (( $(stat -c %s "$IPMAP") < 16777216 )); then
    echo "ipmap.bin is too small ($(stat -c %s "$IPMAP") bytes; the real file is about 48 MB)"
    bad=1
  else
    # The header (ipmap.bin layout in build-ipmap.py): magic, version 1, a reserved field of 0 and 13 sections of (offset,
    # length) that follow each other from byte 112 to the end of the file; the country, ASN, city and anchor parts must not be
    # empty. A file that the service would refuse at boot, or one built without the city data, would otherwise ship as
    # "no server places" without a word.
    mapfile -t hdr < <(head -c 112 "$IPMAP" | od -An -v -tu1 -w1)
    be32() { echo $(( (hdr[$1] << 24) | (hdr[$1 + 1] << 16) | (hdr[$1 + 2] << 8) | hdr[$1 + 3] )); }
    good=1
    (( ${#hdr[@]} == 112 && hdr[0] == 68 && hdr[1] == 77 && hdr[2] == 73 && hdr[3] == 80 && hdr[4] == 0 && hdr[5] == 1 \
        && hdr[6] == 0 && hdr[7] == 0 )) || good=0
    if (( good )); then
      pos=112
      for i in $(seq 0 12); do
        off=$(be32 $((8 + 8 * i))); len=$(be32 $((12 + 8 * i)))
        (( off == pos )) || good=0
        pos=$((off + len)); lens[i]=$len
      done
      (( pos == $(stat -c %s "$IPMAP") && lens[0] > 0 && lens[1] > 0 && lens[2] > 0 && lens[11] > 0 )) || good=0
    fi
    if (( ! good )); then
      echo "ipmap.bin is not an ipmap file (magic DMIP, version 1, 13 sections that fill it, country, ASN, city and anchor parts present)"
      bad=1
    fi
  fi
fi
[[ $bad -eq 0 ]] || exit 1
echo "all required packages present"
