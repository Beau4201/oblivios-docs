# SPDX-License-Identifier: Apache-2.0
"""Shared pieces of the SBOM scripts (ADR-244): git access, the pinned manifest, the patch files."""
import re
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path

# The tag whose revisions the patches apply to. provenance/2026110200.md: 2026100600 stays the baseline of the
# running candidates until an image on 2026110200 has booted.
BASELINE = "2026100600"

# The test classpath of both Java modules (services/NOTICE, "Third-party dependencies"): group, artifact, version.
GRADLE_TEST_ARTIFACTS = [
    ("org.junit.jupiter", "junit-jupiter", "5.11.4"),
    ("org.junit.jupiter", "junit-jupiter-api", "5.11.4"),
    ("org.junit.jupiter", "junit-jupiter-engine", "5.11.4"),
    ("org.junit.jupiter", "junit-jupiter-params", "5.11.4"),
    ("org.junit.platform", "junit-platform-commons", "1.11.4"),
    ("org.junit.platform", "junit-platform-engine", "1.11.4"),
    ("org.junit.platform", "junit-platform-launcher", "1.11.4"),
    ("org.junit", "junit-bom", "5.11.4"),
    ("org.opentest4j", "opentest4j", "1.3.0"),
]


def git(repo, *args):
    r = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, check=True)
    return r.stdout.decode("utf-8")


def tracked(repo):
    return [p for p in git(repo, "ls-files", "-z").split("\0") if p]


def manifest_projects(xml_path):
    """{path: {name, revision, remote, fetch}} of every project of a pinned default.xml."""
    root = ET.parse(xml_path).getroot()
    fetch = {r.get("name"): r.get("fetch") for r in root.findall("remote")}
    default = root.find("default").attrib
    out = {}
    for p in root.findall("project"):
        path = p.get("path") or p.get("name")
        remote = p.get("remote") or default["remote"]
        out[path] = {"name": p.get("name"), "revision": p.get("revision") or default["revision"],
                     "remote": remote, "fetch": fetch[remote]}
    return out


def npm_packages(lock):
    """[(path, name, version, entry)] of the registry packages of a package-lock.json (lockfile version 3): every
    `node_modules/` entry that is not a workspace link. The name is what follows the last `node_modules/` of the path."""
    return [(p, p.rsplit("node_modules/", 1)[1], e["version"], e) for p, e in sorted(lock["packages"].items())
            if "node_modules/" in p and not e.get("link")]


def npm_resolve(packages, path, dep):
    """The lockfile path that `dep` resolves to from the package at `path`: the nearest `node_modules/` up the tree."""
    base = path
    while True:
        cand = f"{base}/node_modules/{dep}" if base else f"node_modules/{dep}"
        if cand in packages:
            return cand
        if not base:
            return None
        base = base.rsplit("/node_modules/", 1)[0] if "/node_modules/" in base else ""


def project_key(path):
    """packages/apps/Settings and the patch directory packages-apps-settings name the same project."""
    return path.lower().replace("/", "-")


def patch_project_dir(patch_path):
    return patch_path.rsplit("/", 1)[0].rsplit("/", 1)[-1]


def patched_projects(platform, projects):
    """{upstream path: [patch paths]}: patch directory names mapped to manifest paths, an unknown name is an error."""
    keys = {}
    for path in projects:
        k = project_key(path)
        if k in keys:
            raise ValueError(f"two manifest paths share the key {k}: {keys[k]} and {path}")
        keys[k] = path
    out = {}
    for f in tracked(platform):
        if f.endswith(".patch"):
            d = patch_project_dir(f).lower()
            if d not in keys:
                raise ValueError(f"patch directory {d} of {f} names no manifest project")
            out.setdefault(keys[d], []).append(f)
    return {k: sorted(v) for k, v in sorted(out.items())}


def patch_effects(text):
    """(modified, created, deleted) path sets of one patch file, read from its `diff --git` blocks."""
    mod, new, gone = set(), set(), set()
    for block in re.split(r"(?m)^diff --git ", text)[1:]:
        m = re.match(r"a/(\S+) b/(\S+)", block)
        if not m:
            continue
        head = block.split("\n@@", 1)[0]
        if "\nnew file mode" in head:
            new.add(m.group(2))
        elif "\ndeleted file mode" in head:
            gone.add(m.group(1))
        else:
            mod.add(m.group(2))
    return mod, new, gone
