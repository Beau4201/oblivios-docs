# airpods-core module

airpods-core is the platform-independent logic for AirPods support, written in Java: the codec for the AirPods control messages (`AapCodec`), the validated settings and states, and the state machine that the platform integration drives. Its prebuilt `airpods-core.jar` is committed in `oblivios-platform`. This page says what the module is, what it is not, and how to build and test it; the README of the module in `oblivios-services` holds its provenance.

## What it is

- A Java 21 module of `oblivios-services`, built with the Gradle wrapper of that repository and tested with JUnit 5. [verified-in-source: `oblivios-services/airpods-core/build.gradle.kts`]
- The codec of the control messages, written from tables restated in the project's own words. The byte layouts were taken from the protocol notes of the LibrePods project, which are published under GPL-3.0; only the layouts, which are facts about a protocol, were taken, and no code and no text was copied.

## What it is not

- Not the AirPods pages or the platform integration: the integration that drives the state machine is in `oblivios-platform`.
- Not shown to work with every model. The notes were taken with AirPods Pro 2 (USB-C) firmware 7A305, and other models and firmware may differ.

## Build and test

Run from the root of `oblivios-services`, with a JDK that provides Java 21:

```
./gradlew :airpods-core:test
```

## What was run

- On 2026-11-19, on the workstation of the owner with JDK 21.0.13, the command above ended with `BUILD SUCCESSFUL in 9s` and nine test classes ran 57 tests with no failure, no error and none skipped. [measured: the Gradle output and the XML reports of the run]
- Not run on a clean machine: the Gradle cache of that workstation was warm, so the download of JUnit from the public Maven repository is not covered by this run.
