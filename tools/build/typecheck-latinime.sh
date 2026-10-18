#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
# Validates the resources of LatinIME with aapt2 (compile and link against the platform android.jar)
# and type-checks all its Java sources with javac, against a generated R.java and the androidx jars
# of the prebuilt repository. No image or module build; output goes to a temporary directory.
# usage: typecheck-latinime.sh <LatinIME java dir (the one with AndroidManifest.xml, res, src)>
# Prints "typecheck: OK" on success; any other output is a failure.
set -u
SRC=${1:?LatinIME java dir}
P="${PLATFORM_TREE:?set PLATFORM_TREE to the AOSP source tree}"
A2=$P/prebuilts/sdk/tools/linux/bin/aapt2
JB=$P/prebuilts/jdk/jdk21/linux-x86/bin
M=$P/prebuilts/sdk/current/androidx/m2repository/androidx
AJ=$P/prebuilts/sdk/current/public/android.jar
W=$(mktemp -d /tmp/latinime-tc.XXXXXX)
trap 'rm -rf "$W"' EXIT
cd "$W" || exit 1

# The exit status of aapt2 decides, not the existence of its output: on some errors aapt2 leaves a
# partial out.apk behind ("failed linking file resources").
$A2 compile --dir "$SRC/res" -o res.zip 2>&1 | head -40
[ "${PIPESTATUS[0]}" -eq 0 ] && [ -s res.zip ] || { echo "typecheck: FAILED (aapt2 compile)"; exit 1; }
mkdir gen
$A2 link -I $AJ --manifest "$SRC/AndroidManifest.xml" --min-sdk-version 24 --target-sdk-version 36 \
  --auto-add-overlay --java gen -o out.apk res.zip 2>&1 | head -40
[ "${PIPESTATUS[0]}" -eq 0 ] && [ -s out.apk ] || { echo "typecheck: FAILED (aapt2 link)"; exit 1; }

unzip -p $M/core/core/1.20.0-alpha01/core-1.20.0-alpha01.aar classes.jar > core.jar
unzip -p $M/viewpager/viewpager/1.1.0-alpha02/viewpager-1.1.0-alpha02.aar classes.jar > viewpager.jar
CP=$AJ:core.jar:viewpager.jar:$M/annotation/annotation-jvm/1.10.0/annotation-jvm-1.10.0.jar:$P/prebuilts/cmdline-tools/tools/lib/external/com/google/code/findbugs/jsr305/3.0.2/jsr305-3.0.2.jar
# the shared code of the package (com.android.inputmethod.latin.common) sits next to the java dir
find "$SRC/src" "$SRC/../common/src" gen -name '*.java' > files.txt
mkdir out
$JB/javac -proc:none -nowarn -encoding UTF-8 -d out -cp "$CP" @files.txt 2>&1 | grep -v -E '^(Note:|[0-9]+ warnings?)' | head -60
if [ "${PIPESTATUS[0]}" -eq 0 ]; then echo "typecheck: OK"; else echo "typecheck: FAILED (javac)"; exit 1; fi
