#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
# Type-check of the app drawer change against the tree's compiled Launcher3 classes. Not a build.
# usage: typecheck.sh <work dir that holds src/com/android/launcher3>; R.java (a shim of the resource ids)
# sits next to this script. Run it on the build server.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
W=${1:?work dir}
P="${PLATFORM_TREE:?set PLATFORM_TREE to the AOSP source tree}"
I=$P/out-lynx/soong/.intermediates
J=$P/prebuilts/jdk/jdk21/linux-x86/bin
K=$P/external/kotlinc/lib
L3=$I/packages/apps/Launcher3
CP=$L3/Launcher3QuickStepLib/android_common/javac/Launcher3QuickStepLib.jar
CP=$CP:$I/frameworks/libs/systemui/iconloaderlib/iconloader_base/android_common/kotlin/iconloader_base.jar
CP=$CP:$I/frameworks/libs/systemui/iconloaderlib/iconloader/android_common/javac/iconloader.jar
CP=$CP:$L3/aconfig/com_android_launcher3_flags_lib/android_common/javac/com_android_launcher3_flags_lib.jar
CP=$CP:$P/prebuilts/sdk/current/system/android.jar:$K/kotlin-stdlib.jar
CP=$CP:$L3/Launcher3QuickStepLib/android_common/kotlin/Launcher3QuickStepLib.jar
for j in $(find $I/prebuilts/sdk/current/androidx -path "*/android_common/aar/classes.jar" 2>/dev/null); do CP=$CP:$j; done
for j in $(find $I/prebuilts/sdk/current/androidx -path "*/android_common/*" -name "*.jar" -path "*annotation*" -not -path "*apex*" -not -path "*busybox*" 2>/dev/null | head -10); do CP=$CP:$j; done
for d in external/dagger2 external/javax_inject external/kotlinx.coroutines external/kotlin-annotations; do
  for j in $(find $I/$d -path "*android_common/*" -name "*.jar" \( -path "*javac*" -o -path "*combined*" -o -path "*kotlin/*" \) 2>/dev/null | head -6); do CP=$CP:$j; done
done
for j in $(find $I/frameworks/libs/systemui -maxdepth 4 -path "*android_common/javac/*.jar" 2>/dev/null | head -30); do CP=$CP:$j; done
CP=$CP:$I/frameworks/base/framework-minus-apex/android_common/combined/framework.jar
CP=$CP:$I/frameworks/base/framework-minus-apex/android_common/repackaged-jarjar/javac-47/framework.jar
for j in $(find $I/frameworks/base -maxdepth 4 -name "*multiuser*flags*lib*.jar" 2>/dev/null | head -3); do CP=$CP:$j; done
for j in $(find $I/prebuilts/sdk/current/androidx -path "*/android_common_apex10000_p/*" \( -name "*.jar" \) \( -path "*local-combined*" -o -path "*/aar/classes.jar" \) 2>/dev/null); do CP=$CP:$j; done
for j in $(find $I/frameworks/libs/systemui/iconloaderlib -path "*android_common/*" -name "*.jar" \( -path "*javac/*" -o -path "*kotlin/*" \) 2>/dev/null); do CP=$CP:$j; done
S=$W/src/com/android/launcher3
rm -rf $W/out && mkdir -p $W/out/kt $W/out/java
KT_LOG=$W/out/kotlin.log
JV_LOG=$W/out/javac.log
$J/java -cp $K/kotlin-compiler.jar:$K/kotlin-stdlib.jar:$K/kotlin-reflect.jar:$K/trove4j.jar:$K/annotations-13.0.jar \
  org.jetbrains.kotlin.cli.jvm.K2JVMCompiler -no-stdlib -no-reflect -jvm-target 17 -cp "$CP" -d $W/out/kt \
  $S/allapps/category/*.kt $HERE/R.java $S/AbstractFloatingView.java $S/allapps/BaseAllAppsAdapter.java 2>&1 \
  | grep -v "^warning:" > $KT_LOG
KT_EXIT=${PIPESTATUS[0]}
$J/javac -proc:none -Xmaxerrs 1000 -d $W/out/java -cp "$W/out/kt:$CP" $S/AbstractFloatingView.java \
  $S/allapps/BaseAllAppsAdapter.java $S/allapps/AlphabeticalAppsList.java $S/allapps/AllAppsGridAdapter.java \
  > $JV_LOG 2>&1
# The jars of the tree do not hold the framework flag class of one existing import in
# AlphabeticalAppsList (android.multiuser.Flags), so its errors are expected; any other error counts.
UNEXPECTED=$(python3 - "$JV_LOG" <<'PY'
import re, sys
blocks = re.split(r'(?m)^(?=\S+\.java:\d+: error:)', open(sys.argv[1]).read())
bad = [b for b in blocks if ': error:' in b.split('\n')[0]
       and 'enableMovingContentIntoPrivateSpace' not in b and 'android.multiuser' not in b]
print(len(bad))
for b in bad[:20]:
    sys.stderr.write(b)
PY
)
echo "kotlin exit: $KT_EXIT"; cat $KT_LOG | head -40
echo "javac unexpected errors: $UNEXPECTED"
if [ "$KT_EXIT" = 0 ] && [ "$UNEXPECTED" = 0 ]; then echo "typecheck: OK"; else echo "typecheck: FAILED"; exit 1; fi
