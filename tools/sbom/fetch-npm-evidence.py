#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Fetch the registry evidence behind the npm part of the SBOM (ADR-253, gate W-7).

    fetch-npm-evidence.py SITE_DIR OUT_DIR     write OUT_DIR/npm.json and OUT_DIR/osv-npm.json
    fetch-npm-evidence.py --self-test          run the built-in check

For every registry package of SITE_DIR/package-lock.json, one request to the npm registry (licence, integrity,
deprecation notice), then one batched query to OSV. The requests carry only public package names and versions. The
output is an input of build-sbom.py: the SBOM build itself is offline and deterministic. A run resumes from an
existing npm.json; osv-npm.json is always rebuilt, because a vulnerability list is a statement about one day.
"""
import datetime
import importlib.util
import json
import sys
import time
import urllib.parse
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True  # a cache directory next to the scripts would become a file of the described repository
sys.path.insert(0, str(HERE))
import common  # noqa: E402

_spec = importlib.util.spec_from_file_location("fetch_evidence", HERE / "fetch-evidence.py")
fe = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fe)  # the request helper and the OSV scan are shared with the Rust evidence

REGISTRY = "https://registry.npmjs.org/{}/{}"
DELAY = 0.2


def registry_packages(site):
    """{(name, version): integrity} of every registry package of the lockfile in SITE (an entry may sit at several paths)."""
    lock = json.loads((Path(site) / "package-lock.json").read_text(encoding="utf-8"))
    return {(n, v): e.get("integrity") for _, n, v, e in common.npm_packages(lock)}


def licence(v):
    """The licence of a registry version record as one string: `license` is a string or {type}, `licenses` the old list."""
    lic = v.get("license")
    if isinstance(lic, dict):
        lic = lic.get("type")
    if not lic and v.get("licenses"):
        lic = " OR ".join(x.get("type", "") if isinstance(x, dict) else str(x) for x in v["licenses"])
    return lic or None


def record(v):
    return {"license": licence(v), "integrity": v.get("dist", {}).get("integrity"), "deprecated": v.get("deprecated")}


def main(site, out):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    want = registry_packages(site)
    cfile = out / "npm.json"
    have = json.loads(cfile.read_text(encoding="utf-8"))["packages"] if cfile.exists() else {}
    today = datetime.date.today().isoformat()
    todo = [k for k in sorted(want) if f"{k[0]}@{k[1]}" not in have]
    print(f"{len(want)} registry packages, {len(todo)} to fetch")
    for i, (n, v) in enumerate(todo, 1):
        data = fe.request(REGISTRY.format(urllib.parse.quote(n, safe="@"), v))
        key = f"{n}@{v}"
        have[key] = {"error": "not found"} if data is None else record(data)
        have[key]["retrieved"] = today
        if i % 25 == 0 or i == len(todo):
            cfile.write_text(json.dumps({"source": "https://registry.npmjs.org/{name}/{version}",
                                         "packages": dict(sorted(have.items()))}, indent=1) + "\n", encoding="utf-8")
            print(f"  {i}/{len(todo)}", flush=True)
        time.sleep(DELAY)
    osv = fe.osv_scan(sorted(want), "npm", today)
    (out / "osv-npm.json").write_text(json.dumps(osv, indent=1) + "\n", encoding="utf-8")
    bad = [k for k, r in have.items() if "error" in r]
    mismatch = [f"{n}@{v}" for (n, v), i in want.items() if have.get(f"{n}@{v}", {}).get("integrity") != i]
    print(f"npm: {len(have)} records, {len(bad)} not found, {len(mismatch)} integrity mismatches")
    print(f"osv: {len(osv['vulnerable'])} packages with advisories, {len(osv['unresolved_pages'])} unresolved")
    sys.exit(1 if bad or mismatch or osv["unresolved_pages"] else 0)


def self_test():
    import tempfile
    with tempfile.TemporaryDirectory() as d:
        (Path(d) / "package-lock.json").write_text(json.dumps({"packages": {
            "": {"name": "root"}, "shared": {"name": "s"},
            "node_modules/s": {"resolved": "shared", "link": True},
            "node_modules/a": {"version": "1.0.0", "integrity": "sha512-x"},
            "node_modules/a/node_modules/@b/c": {"version": "2.0.0", "integrity": "sha512-y"}}}), encoding="utf-8")
        assert registry_packages(d) == {("a", "1.0.0"): "sha512-x", ("@b/c", "2.0.0"): "sha512-y"}
    assert urllib.parse.quote("@b/c", safe="@") == "@b%2Fc"
    assert licence({"license": "MIT"}) == "MIT" and licence({"license": {"type": "ISC"}}) == "ISC"
    assert licence({"licenses": [{"type": "MIT"}, {"type": "Apache-2.0"}]}) == "MIT OR Apache-2.0" and licence({}) is None
    assert record({"license": "MIT", "dist": {"integrity": "i"}, "deprecated": "x", "extra": 1}) == \
        {"license": "MIT", "integrity": "i", "deprecated": "x"}
    print("self-test: OK")


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        self_test()
    elif len(sys.argv) == 3:
        main(sys.argv[1], sys.argv[2])
    else:
        sys.exit(__doc__)
