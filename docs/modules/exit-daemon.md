# exit-daemon module

exit-daemon builds `exitd`, the exit daemon of Compartments (ADR-184, ADR-178, ADR-186): a Rust process that reads the packets of the apps that the platform steers into its tun interface, answers the DNS of masked apps, and carries the connections of apps set to Tor on each app's own Tor circuit family. The same binary, started with `--routes`, is the route helper that writes the rules that steer packets into the tun and nothing else. This page says what the crate is, what it is not, and how it is built and tested; the README of the crate in `oblivios-services` holds the detail and the known gaps.

## What it is

- A Rust crate with a typed control protocol, a per-app policy, a mask list, a speed guard, a failure ladder and a DNS rate limit, on top of a vendored and patched Onionmasq.
- Built with the committed `Cargo.lock` and always with `--locked`. The release profile sets `panic = "abort"`, because the Android standard library of the AOSP tree has no unwind strategy, so a panic ends the process and the init service restarts it.

## What it is not

- Not buildable on a workstation. The toolchain is the AOSP Rust 1.93.1 on a build server, and nothing is built elsewhere. There is no ten-minute path from a clean machine.
- Not covered as a whole by the host tests. The entry point itself, with the tun creation, the wait for the first Tor class and the signal handling, is run only on a phone, and the device row for it is `NET-009`.

## Build and test

`EXIT_BUILD_SSH` names the build server as `user@host`. The commands run from the root of the crate.

| Command | What it does |
| --- | --- |
| `EXIT_BUILD_SSH=user@host tools/check-on-server.sh [cargo test arguments]` | Copies the tree to the server, runs `cargo test --locked --offline` and fails when no test ran. It takes a lock on the workstation before it copies. |
| `tools/build-android.sh` | Builds `exitd` for `aarch64-linux-android` and checks the binary itself, not the exit code. |
| `tools/run-mutations.py` | Applies single-line mutations and counts one as killed only when the tests ran and failed. |
| `tools/audit-panics.py` | Compares the places where a panic can start with the list `PANIC-SITES.tsv`, and fails on a new or a removed site. |
| `tools/check-licences.sh` | Checks the licence of every package of `Cargo.lock` and keeps `NOTICE` current. |

Some tests need `CAP_NET_ADMIN`. They start themselves again under `unshare --user --map-root-user --net` and fail when that is not possible.

## What was run

- The last run of the host tests, on 2026-11-17, passed 344 tests. [measured: the run named in the README of `oblivios-services`, not repeated for this page]
- Not run for this page: the commands need the build server that a workstation does not have.
