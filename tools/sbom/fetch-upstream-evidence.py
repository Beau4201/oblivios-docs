#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Fetch the licence evidence of the upstream inputs of the SBOM (ADR-244).

    fetch-upstream-evidence.py MANIFEST_XML PLATFORM_DIR OUT_DIR   write upstream-licences.json and maven.json
    fetch-upstream-evidence.py --self-test                         run the built-in check

upstream-licences.json: for every upstream project that a patch of PLATFORM_DIR modifies, the licence files at the
root of the project at the revision pinned in MANIFEST_XML (SHA-256, size, and what the text is).
maven.json: for every Gradle test artifact (common.GRADLE_TEST_ARTIFACTS), the POM (SHA-256, declared licences,
dependencies) and the SHA-256 of the jar as Maven Central publishes it. The requests carry public project names and
revisions only. The SBOM build is offline and reads these files.
"""
import base64
import datetime
import hashlib
import json
import re
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402

UA = "sbom-evidence-fetcher/1.0"
CANDIDATES = ["NOTICE", "LICENSE", "LICENSE.md", "LICENSE.txt", "COPYING", "MODULE_LICENSE_APACHE2", "MODULE_LICENSE_MIT",
              "MODULE_LICENSE_BSD", "MODULE_LICENSE_PUBLIC_DOMAIN", "MODULE_LICENSE_UNICODE"]
CENTRAL = "https://repo1.maven.org/maven2/"
DELAY = 0.4


def get(url, decode_base64=False, head=False):
    """The body of url, or only its first 4 KiB when head (a licence header sits at the top of a file)."""
    req = urllib.request.Request(url, headers={"User-Agent": UA, **({"Range": "bytes=0-4095"} if head else {})})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read(4096 if head and not decode_base64 else -1)
            return base64.b64decode(data) if decode_base64 else data
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code not in (429, 500, 502, 503, 504):
                raise
        except urllib.error.URLError:
            pass
        time.sleep(4 * (attempt + 1))
    raise RuntimeError(f"giving up on {url}")


def classify(data):
    t = data.decode("utf-8", "replace")
    if not t.strip():
        return "empty marker file"
    if "Apache License" in t and "Version 2.0" in t:
        return "Apache License 2.0 text"
    if "Permission is hereby granted" in t:
        return "MIT-style text"
    if "public domain" in t.lower():
        return "public domain statement"
    return "other"


def header_kind(data):
    """What the top of an upstream file says about its licence."""
    if b"\0" in data[:512]:
        return "binary"
    t = data.decode("utf-8", "replace")
    if re.search(r"Apache License,? Version 2\.0|Apache-2\.0", t):
        return "Apache-2.0"
    if "Permission is hereby granted" in t or re.search(r"SPDX-License-Identifier:\s*MIT", t):
        return "MIT"
    if re.search(r"public domain", t, re.I):
        return "public domain"
    m = re.search(r"SPDX-License-Identifier:\s*([^\n*]+)", t)
    if m:
        return m.group(1).strip(" -->/")
    return "no header"


def modified_files(platform, patches):
    """Upstream files that a project's patches change (modified or deleted, not created by a patch)."""
    mod, new = set(), set()
    for p in patches:
        m, n, g = common.patch_effects((Path(platform) / p).read_text(encoding="utf-8", errors="replace"))
        mod |= m | g
        new |= n
    return sorted(mod - new)


def rename_sources(platform, patches):
    """{new path: path at the pinned revision} for every file that a patch renames: the file exists upstream under its
    old name, so that is where its licence header is read."""
    ren = {}
    for p in patches:
        text = (Path(platform) / p).read_text(encoding="utf-8", errors="replace")
        for old, new in re.findall(r"(?m)^rename from (\S+)\nrename to (\S+)$", text):
            ren[new] = ren.get(old, old)
    return ren


def raw_url(project, name):
    if project["fetch"].startswith("https://github.com/"):
        return f"https://raw.githubusercontent.com/{project['fetch'].split('github.com/')[1].rstrip('/')}/{project['name']}/{project['revision']}/{name}", False
    return f"{project['fetch'].rstrip('/')}/{project['name']}/+/{project['revision']}/{name}?format=TEXT", True


def upstream(manifest_xml, platform, out):
    projects = common.manifest_projects(manifest_xml)
    patched = common.patched_projects(platform, projects)
    today = datetime.date.today().isoformat()
    result = {}
    for path in patched:
        p = projects[path]
        files = {}
        for name in CANDIDATES:
            url, b64 = raw_url(p, name)
            data = get(url, b64)
            if data is not None:
                files[name] = {"sha256": hashlib.sha256(data).hexdigest(), "size": len(data), "kind": classify(data)}
            time.sleep(DELAY)
        headers = {}
        renamed = rename_sources(platform, patched[path])
        for name in modified_files(platform, patched[path]):
            url, b64 = raw_url(p, renamed.get(name, name))
            data = get(url, b64, head=True)
            headers[name] = "absent upstream" if data is None else header_kind(data)
            time.sleep(DELAY / 2)
        result[path] = {"name": p["name"], "revision": p["revision"], "remote": p["fetch"], "files": files,
                        "modified_file_headers": headers}
        print(f"  {path}: {', '.join(files) or 'no licence file'}; {len(headers)} modified files read", flush=True)
    (out / "upstream-licences.json").write_text(json.dumps(
        {"manifest": Path(manifest_xml).name, "retrieved": today, "projects": result}, indent=1) + "\n", encoding="utf-8")


def pom_facts(pom):
    root = ET.fromstring(pom)
    ns = {"m": root.tag.split("}")[0].strip("{")} if root.tag.startswith("{") else {}
    q = (lambda t: f"m:{t}") if ns else (lambda t: t)
    def text(e, tag):
        return e.findtext(q(tag), None, ns)

    licences = [text(e, "name") for e in root.findall(f".//{q('licenses')}/{q('license')}", ns)]
    deps = []
    for d in root.findall(f"{q('dependencies')}/{q('dependency')}", ns):
        deps.append({"group": text(d, "groupId"), "artifact": text(d, "artifactId"), "version": text(d, "version"),
                     "scope": text(d, "scope"), "optional": text(d, "optional")})
    return {"licences": licences, "dependencies": deps}


def maven(out):
    today = datetime.date.today().isoformat()
    result = {}
    for g, a, v in common.GRADLE_TEST_ARTIFACTS:
        base = f"{CENTRAL}{g.replace('.', '/')}/{a}/{v}/{a}-{v}"
        pom = get(base + ".pom")
        if pom is None:
            sys.exit(f"no POM for {g}:{a}:{v}")
        jar = get(base + ".jar.sha256")
        rec = {"pom_sha256": hashlib.sha256(pom).hexdigest(), "jar_sha256": jar.decode().split()[0] if jar else None}
        rec.update(pom_facts(pom))
        result[f"{g}:{a}:{v}"] = rec
        print(f"  {g}:{a}:{v}", flush=True)
        time.sleep(DELAY)
    (out / "maven.json").write_text(json.dumps({"source": CENTRAL, "retrieved": today, "artifacts": result}, indent=1) + "\n",
                                    encoding="utf-8")


def self_test():
    pom = (b'<project xmlns="http://maven.apache.org/POM/4.0.0"><licenses><license><name>EPL-2.0</name></license></licenses>'
           b'<dependencies><dependency><groupId>g</groupId><artifactId>a</artifactId><version>1</version>'
           b'<scope>compile</scope></dependency></dependencies></project>')
    f = pom_facts(pom)
    assert f["licences"] == ["EPL-2.0"] and f["dependencies"][0]["artifact"] == "a"
    assert classify(b"") == "empty marker file" and classify(b"Apache License\nVersion 2.0") == "Apache License 2.0 text"
    assert header_kind(b"/* Licensed under the Apache License, Version 2.0 */") == "Apache-2.0"
    assert header_kind(b"package x;\n") == "no header" and header_kind(b"\x89PNG\0\0") == "binary"
    assert header_kind(b"# SPDX-License-Identifier: BSD-3-Clause\n") == "BSD-3-Clause"
    import tempfile
    with tempfile.TemporaryDirectory() as d:
        (Path(d) / "a.patch").write_text("diff --git a/A.java b/A.kt\nsimilarity index 51%\nrename from A.java\nrename to A.kt\n")
        (Path(d) / "b.patch").write_text("diff --git a/A.kt b/B.kt\nrename from A.kt\nrename to B.kt\n")
        assert rename_sources(d, ["a.patch", "b.patch"]) == {"A.kt": "A.java", "B.kt": "A.java"}
    p = {"fetch": "https://github.com/GrapheneOS/", "name": "platform_x", "revision": "abc"}
    assert raw_url(p, "NOTICE") == ("https://raw.githubusercontent.com/GrapheneOS/platform_x/abc/NOTICE", False)
    p = {"fetch": "https://android.googlesource.com", "name": "platform/x", "revision": "abc"}
    assert raw_url(p, "NOTICE")[1] is True
    print("self-test: OK")


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        self_test()
    elif len(sys.argv) == 4:
        out = Path(sys.argv[3])
        out.mkdir(parents=True, exist_ok=True)
        upstream(sys.argv[1], sys.argv[2], out)
        maven(out)
    else:
        sys.exit(__doc__)
