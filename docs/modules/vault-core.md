# vault-core module

vault-core is the Rust core of the ObliviOS Passwords app (ADR-185): the sealed vault file, the key wrappers, the domain index, the checkup and the export file. The Kotlin app in `oblivios-platform` reaches it through one JNI module, and the prebuilt `libvault_core.so` there is built from this crate. This page says what the crate is, what it is not, and how it is built and tested; the README of the crate in `oblivios-services` holds the detail.

## What it is

- A Rust crate that holds the sealed container and envelope, key derivation and wrappers, the vault and its store, the domain index, the checkup, the export and import files, the password generator and the JNI surface.
- A crate with three rules: `unsafe` code is denied everywhere except the JNI module; every panic ends the process (`panic = "abort"`), so code reachable from the JNI surface validates its input first; and `Cargo.lock` holds no network crate and the library no network import.

## What it is not

- Not buildable on a workstation. Both scripts copy the tree to a build server and run there with the AOSP Rust toolchain, and the environment file needs a finished image build for the Bionic sysroot. There is no ten-minute path from a clean machine.
- Not a record of what works on a device. What was tested on a device is stated in the records of the Passwords app.

## Build and test

`VAULT_BUILD_SSH` names the build server as `user@host`. The commands run from the root of the crate.

| Command | What it does |
| --- | --- |
| `VAULT_BUILD_SSH=user@host tools/check-on-server.sh [filter]` | Runs `cargo test --locked --offline` on the server and fails when no test ran. |
| `VAULT_BUILD_SSH=user@host tools/build-android.sh` | Builds `libvault_core.so` for `aarch64-linux-android` and checks the library itself: architecture, needed libraries, exported symbol, no network import, no build path, size. |
| `VAULT_BUILD_SSH=user@host tools/update-lock.sh` | After a change of `Cargo.toml`: resolves and fetches, which needs the network, and copies `Cargo.lock` back. |

## What was run

- Not run for this page. The commands are copied from the README of the crate, and they need the build server that a workstation does not have.
