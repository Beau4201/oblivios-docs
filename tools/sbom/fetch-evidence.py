#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Fetch the registry evidence behind the Rust part of the SBOM (ADR-244).

    fetch-evidence.py SERVICES_DIR OUT_DIR     write OUT_DIR/crates-io.json and OUT_DIR/osv.json
    fetch-evidence.py --self-test              run the built-in check

For every registry package of every Cargo.lock under SERVICES_DIR, one request to the crates.io API
(licence expression, registry checksum, yanked flag, crate size, publication date), then one batched query
to OSV for known vulnerabilities. The requests carry only public package names and versions. The output is
an input of build-sbom.py: the SBOM build itself is offline and deterministic. A run resumes from an existing
crates-io.json, so an interrupted run loses nothing. osv.json is always rebuilt, because a vulnerability
list is a statement about one day.
"""
import datetime
import json
import sys
import time
import tomllib
import urllib.error
import urllib.request
from pathlib import Path

CRATES_API = "https://crates.io/api/v1/crates/{}/{}"
OSV_BATCH = "https://api.osv.dev/v1/querybatch"
OSV_VULN = "https://api.osv.dev/v1/vulns/{}"
REGISTRY = "registry+https://github.com/rust-lang/crates.io-index"
UA = "sbom-evidence-fetcher/1.0"
DELAY = 1.1  # the crates.io crawler policy allows one request per second


def registry_packages(services):
    """{(name, version): checksum} of every registry package in every Cargo.lock under services."""
    found = {}
    for lock in sorted(Path(services).glob("*/Cargo.lock")):
        for p in tomllib.loads(lock.read_text(encoding="utf-8"))["package"]:
            if p.get("source") == REGISTRY:
                found[(p["name"], p["version"])] = p["checksum"]
    return found


def request(url, payload=None):
    body = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(url, data=body, headers={"User-Agent": UA, "Content-Type": "application/json"})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code not in (429, 500, 502, 503, 504):
                raise
        except urllib.error.URLError:
            pass
        time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"giving up on {url}")


def record(v):
    return {"license": v.get("license"), "checksum": v.get("checksum"), "yanked": v.get("yanked"),
            "crate_size": v.get("crate_size"), "created_at": v.get("created_at"),
            "rust_version": v.get("rust_version")}


def osv_queries(keys, ecosystem="crates.io"):
    return [{"package": {"name": n, "ecosystem": ecosystem}, "version": v} for n, v in keys]


def osv_scan(keys, ecosystem, today):
    """The OSV answer for the sorted [(name, version)] of one ecosystem, as the document written to osv*.json."""
    vulnerable, unknown = {}, []
    for start in range(0, len(keys), 500):
        chunk = keys[start:start + 500]
        res = request(OSV_BATCH, {"queries": osv_queries(chunk, ecosystem)})["results"]
        if len(res) != len(chunk):
            sys.exit("OSV answered a different number of results than queries")
        for (n, v), r in zip(chunk, res):
            if r.get("next_page_token"):
                unknown.append(f"{n}@{v}")
            if r.get("vulns"):
                vulnerable[f"{n}@{v}"] = sorted(x["id"] for x in r["vulns"])
    details = {}
    for vid in sorted({i for ids in vulnerable.values() for i in ids}):
        d = request(OSV_VULN.format(vid)) or {}
        fixed = sorted({e["fixed"] for a in d.get("affected", []) for r in a.get("ranges", []) for e in r.get("events", [])
                        if "fixed" in e})
        details[vid] = {"summary": d.get("summary"), "aliases": sorted(d.get("aliases", [])), "published": d.get("published"),
                        "withdrawn": d.get("withdrawn"), "fixed_in": fixed}
    return {"source": OSV_BATCH, "queried": today, "queried_packages": len(keys), "unresolved_pages": unknown,
            "vulnerable": dict(sorted(vulnerable.items())), "details": details}


def main(services, out):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    want = registry_packages(services)
    cfile = out / "crates-io.json"
    have = json.loads(cfile.read_text(encoding="utf-8"))["packages"] if cfile.exists() else {}
    today = datetime.date.today().isoformat()
    todo = [k for k in sorted(want) if f"{k[0]}@{k[1]}" not in have]
    print(f"{len(want)} registry packages, {len(todo)} to fetch")
    for i, (n, v) in enumerate(todo, 1):
        data = request(CRATES_API.format(n, v))
        key = f"{n}@{v}"
        have[key] = {"error": "not found"} if data is None else record(data["version"])
        have[key]["retrieved"] = today
        if i % 25 == 0 or i == len(todo):
            cfile.write_text(json.dumps({"source": "https://crates.io/api/v1/crates/{name}/{version}",
                                         "packages": dict(sorted(have.items()))}, indent=1) + "\n", encoding="utf-8")
            print(f"  {i}/{len(todo)}", flush=True)
        time.sleep(DELAY)
    keys = sorted(want)
    osv = osv_scan(keys, "crates.io", today)
    vulnerable, unknown = osv["vulnerable"], osv["unresolved_pages"]
    (out / "osv.json").write_text(json.dumps(osv, indent=1) + "\n", encoding="utf-8")
    bad = [k for k, r in have.items() if "error" in r]
    mismatch = [f"{n}@{v}" for (n, v), c in want.items() if have.get(f"{n}@{v}", {}).get("checksum") != c]
    print(f"crates.io: {len(have)} records, {len(bad)} not found, {len(mismatch)} checksum mismatches")
    print(f"osv: {len(vulnerable)} packages with advisories, {len(unknown)} unresolved")
    sys.exit(1 if bad or mismatch or unknown else 0)


def self_test():
    import tempfile
    with tempfile.TemporaryDirectory() as d:
        (Path(d) / "a").mkdir()
        (Path(d) / "a/Cargo.lock").write_text(
            'version = 4\n[[package]]\nname = "x"\nversion = "1.0.0"\n'
            '[[package]]\nname = "y"\nversion = "2.1.0"\nsource = "' + REGISTRY + '"\nchecksum = "ab"\n'
            '[[package]]\nname = "z"\nversion = "0.1.0"\nsource = "git+https://example.org/z"\n', encoding="utf-8")
        assert registry_packages(d) == {("y", "2.1.0"): "ab"}
    assert osv_queries([("y", "2.1.0")]) == [{"package": {"name": "y", "ecosystem": "crates.io"}, "version": "2.1.0"}]
    assert record({"license": "MIT", "checksum": "c", "yanked": False, "crate_size": 1, "created_at": "t",
                   "extra": 1})["license"] == "MIT"
    print("self-test: OK")


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        self_test()
    elif len(sys.argv) == 3:
        main(sys.argv[1], sys.argv[2])
    else:
        sys.exit(__doc__)
