#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
# Compiles AppGrouper.kt and its test and runs them with JUnit. No Android runtime: the category
# constants are inlined at compile time. usage: runtest.sh <dir with AppGrouper.kt and AppGrouperTest.kt>
set -u
W=${1:?dir}
P="${PLATFORM_TREE:?set PLATFORM_TREE to the AOSP source tree}"
J=$P/prebuilts/jdk/jdk21/linux-x86/bin
K=$P/external/kotlinc/lib
JU=$P/prebuilts/devtools/tools/lib
CP=$P/prebuilts/sdk/current/system/android.jar:$K/kotlin-stdlib.jar:$JU/junit-4.12.jar:$JU/hamcrest-core-1.3.jar
rm -rf $W/out && mkdir -p $W/out
$J/java -cp $K/kotlin-compiler.jar:$K/kotlin-stdlib.jar:$K/kotlin-reflect.jar:$K/trove4j.jar:$K/annotations-13.0.jar \
  org.jetbrains.kotlin.cli.jvm.K2JVMCompiler -no-stdlib -no-reflect -jvm-target 17 -cp "$CP" -d $W/out $W/AppGrouper.kt $W/AppGrouperTest.kt 2>&1 | grep -v "^warning:"
$J/java -cp $W/out:$K/kotlin-stdlib.jar:$JU/junit-4.12.jar:$JU/hamcrest-core-1.3.jar org.junit.runner.JUnitCore com.android.launcher3.allapps.category.AppGrouperTest 2>&1 | grep -E "^OK|^FAILURES|^Tests run|^[0-9]+\) " 
