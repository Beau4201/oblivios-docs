#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
# Fails when a package ObliviOS requires is missing from a real device
# build. A clean build exit proves nothing here: ADR-047 (OFFICIAL_BUILD
# packages) was skipped in a green build, and so was a privapp allowlist
# whose module name was left over from the AegisOS rename (2026-09-28).
# Only the product dir's own installed-files*.txt count, never
# obj/PACKAGING/ (the official-build rule of the project).
set -o errexit -o nounset -o pipefail

PRODUCT_OUT="${1:?usage: check-required-packages.sh <product-out-dir>}"
REQUIRED=(
  Updater.apk
  Seedvault.apk
  Auditor.apk
  PdfViewerGOS.apk
  AirPodsApp.apk
  privapp-permissions-org.oblivios.airpods.xml
  hidden-api-whitelisted-app-org.oblivios.airpods.xml
  default-permissions-org.oblivios.airpods.xml
  DataMapApp.apk
  privapp-permissions-org.oblivios.datamap.xml
  hidden-api-whitelisted-app-org.oblivios.datamap.xml
  datamap/classifier.tsv
  datamap/ipmap.bin
  exitd
  ExitApp.apk
  exit.rc
  oblivios/exit-mask-list.tsv
  privapp-permissions-org.oblivios.exit.xml
  default-permissions-org.oblivios.exit.xml
  PasswordsApp.apk
  libvault_core.so
  compartments/places.tsv
  compartments/cells.tsv
)

shopt -s nullglob
LISTS=("$PRODUCT_OUT"/installed-files*.txt)
if [[ ${#LISTS[@]} -eq 0 ]]; then
  echo "no installed-files*.txt in ${PRODUCT_OUT}" >&2
  exit 1
fi

# Modules that must never reach a device image. `m <module>` for a standalone
# test install still copies into the product staging dir, and the next image
# build picks it up: a test fixture shipped in lynx's 2026-09-26 image this way
# (found 2026-09-28).
# Guardian left the product (ADR-240) and the next update must remove it from
# the phone, so a tree that still builds it fails here. These three names are the
# only ones of Guardian that stay in the repositories.
FORBIDDEN=(
  GuardianApp.apk
  GuardianLocationFixture.apk
  privapp-permissions-org.oblivios.guardian.xml
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
    # The NET-001b probe of the exit service (ADR-184) rides PRODUCT_PACKAGES_DEBUG the same way.
    ExitProbe.apk
    privapp-permissions-org.oblivios.exitprobe.xml
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
# ADR-208: the persona place data is read, not only named. The policy service reads exactly /product/etc/compartments/places.tsv and
# the Telephony app cells.tsv; an empty module, or one made from a cut-short download, still carries the name. The real files are
# about 2 MB and 12 MB (data/SOURCES.md of privacy/compartments-profiles).
for pair in places.tsv:1000000 cells.tsv:5000000; do
  pname="${pair%%:*}"
  pfile="$PRODUCT_OUT/product/etc/compartments/$pname"
  if grep -qE "/compartments/${pname//./\\.}\$" "${LISTS[@]}"; then
    if [[ ! -f "$pfile" ]]; then
      echo "$pname is not in the product (product/etc/compartments/$pname)"
      bad=1
    elif (( $(stat -c %s "$pfile") < ${pair##*:} )); then
      echo "$pname is too small ($(stat -c %s "$pfile") bytes; the real file is larger than ${pair##*:})"
      bad=1
    fi
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
# ADR-186: the exit service is read as well. A name proves that a module was built, not what it holds: the daemon must be an
# ELF file of a size that holds the Tor client (the build script refuses anything under 5 MB), the init definition must define
# both services, and the mask list must have its header and the thousands of rows it is made of.
if grep -qE '/exitd$' "${LISTS[@]}"; then
  EXITD="$PRODUCT_OUT/system/bin/exitd"
  if [[ ! -f "$EXITD" ]]; then
    echo "exitd is not in the product (system/bin/exitd)"; bad=1
  elif (( $(stat -c %s "$EXITD") < 5000000 )) || [[ "$(head -c 4 "$EXITD" | od -An -c | tr -d ' ')" != '177ELF' ]]; then
    echo "exitd is not the daemon (an ELF file of at least 5 MB)"; bad=1
  fi
fi
if grep -qE '/exit\.rc$' "${LISTS[@]}"; then
  RC="$PRODUCT_OUT/system/etc/init/exit.rc"
  if [[ ! -f "$RC" ]] || ! grep -q '^service exitd ' "$RC" || ! grep -q '^service exitd_route ' "$RC"; then
    echo "exit.rc does not define the services exitd and exitd_route (system/etc/init/exit.rc)"; bad=1
  fi
fi
if grep -qE '/oblivios/exit-mask-list\.tsv$' "${LISTS[@]}"; then
  LIST="$PRODUCT_OUT/system/etc/oblivios/exit-mask-list.tsv"
  if [[ ! -f "$LIST" ]] || [[ "$(head -n 1 "$LIST")" != $'exit-mask-list\t1' ]] || (( $(wc -l < "$LIST") < 1000 )); then
    echo "exit-mask-list.tsv is not the mask list (header 'exit-mask-list', version 1, at least 1000 rows)"; bad=1
  fi
fi
# ADR-245: the Updater of the image must point at the private OTA server. The published patch carries a placeholder host and
# set-updater-url.sh puts the real one in; a tree that skipped it, or one that still has the upstream default, builds a
# phone that cannot update from the owner's server (or updates from someone else's). The URL is read from the built APK.
UPDATER_REL="$(grep -hE '/Updater\.apk$' "${LISTS[@]}" | awk '{print $NF}' | head -n 1)"
if [[ -n "$UPDATER_REL" ]]; then
  UPDATER_APK="$PRODUCT_OUT/${UPDATER_REL#/}"
  if [[ ! -f "$UPDATER_APK" ]]; then
    echo "Updater.apk is not in the product ($UPDATER_REL)"; bad=1
  else
    URLS="$(unzip -p "$UPDATER_APK" resources.arsc 2>/dev/null | grep -a -o -E 'https://[A-Za-z0-9./-]+' | sort -u || true)"
    if [[ -z "$URLS" ]]; then
      echo "Updater.apk holds no https URL in resources.arsc"; bad=1
    elif grep -qE 'releases\.grapheneos\.org|\.invalid/' <<<"$URLS"; then
      echo "Updater.apk points at the upstream default or the placeholder, not the private OTA server: run set-updater-url.sh on the tree"; bad=1
    fi
  fi
fi
[[ $bad -eq 0 ]] || exit 1
echo "all required packages present"
