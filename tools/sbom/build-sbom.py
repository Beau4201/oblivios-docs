#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Build and check the SBOM of the source-only publication (ADR-244).

    build-sbom.py --root DIR --docs DIR [--evidence DIR] [--schemas DIR] OUT_DIR   write the SBOM files into OUT_DIR
    build-sbom.py ... --check                                                      rebuild and compare with OUT_DIR
    build-sbom.py --self-test                                                      run the built-in check

ROOT holds the three code repositories (oblivios-manifest, oblivios-platform, oblivios-services) at the commits to
describe; their working trees must be clean. DOCS is the snapshot directory of oblivios-docs (the `sbom/` directory
inside it is left out of the description). The build is offline and deterministic: the same commits and evidence give
the same bytes. Evidence that needs the network is fetched by fetch-evidence.py and fetch-upstream-evidence.py.

Output: oblivios.cdx.json (CycloneDX 1.6), oblivios.spdx.json (SPDX 2.3), files.sha256 (every file of the four
repositories, `sha256sum -c` format), the evidence files, and README.md.

The build fails when a fact cannot be proven: a file that no rule covers, a hash that differs from the record that states
it, a commit that is not in the repository, a licence that the policy cannot satisfy, a record that lacks a string the
inputs rely on, a licence of a crate that differs from the registry's, a claim of a NOTICE or README that the files do
not support (CLAIMS). With --schemas DIR both documents are validated against the official JSON schemas with ajv.
"""
import fnmatch
import hashlib
import json
import re
import subprocess
import sys
import tempfile
import tomllib
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True  # a cache directory written next to the scripts would become a file of the described repository
sys.path.insert(0, str(HERE))
import common  # noqa: E402

TOOL = "build-sbom.py"
NS = uuid.UUID("5d0f1a52-6c1e-5f4b-9b53-0a4f6f3c7a10")  # fixed namespace for the serial number
REGISTRY = "registry+https://github.com/rust-lang/crates.io-index"
ALLOWED = {  # licence terms the project accepts in a dependency (the policy of exit-daemon/tools/check-licences.py)
    "MIT", "Apache-2.0", "BSD-1-Clause", "BSD-2-Clause", "BSD-3-Clause", "ISC", "Unicode-3.0", "Zlib", "0BSD", "CC0-1.0",
    "MIT-0", "Unlicense", "MPL-2.0", "LLVM-exception",
}
SPDX_KNOWN = ALLOWED | {"GPL-3.0-or-later", "CC-BY-SA-3.0", "CC-BY-SA-4.0", "CC-BY-4.0", "OFL-1.1", "PDDL-1.0", "EPL-2.0",
                        "LGPL-3.0-or-later", "LGPL-2.1-or-later", "OpenSSL", "WITH", "AND", "OR"}
CODE_REPOS = ["manifest", "platform", "services"]
CLAIM_NOTES = []  # filled by check_claims


# ----- licences -------------------------------------------------------------------------------------------------

def norm(expr):
    """The old crates.io `A/B` form becomes `A OR B`."""
    return re.sub(r"\s*/\s*", " OR ", expr.strip())


def tokens(expr):
    return re.findall(r"\(|\)|[A-Za-z0-9.+-]+", expr)


def satisfied(expr):
    """Can the SPDX expression be met with ALLOWED terms only? OR < AND < WITH."""
    toks = tokens(norm(expr))
    pos = 0

    def peek():
        return toks[pos] if pos < len(toks) else None

    def take():
        nonlocal pos
        pos += 1
        return toks[pos - 1]

    def atom():
        t = take()
        if t == "(":
            v = parse_or()
            if take() != ")":
                raise ValueError("unbalanced")
            return v
        ok = t in ALLOWED
        if peek() == "WITH":
            take()
            ok = ok and take() in ALLOWED
        return ok

    def parse_and():
        v = atom()
        while peek() == "AND":
            take()
            v = atom() and v
        return v

    def parse_or():
        v = parse_and()
        while peek() == "OR":
            take()
            v = parse_and() or v
        return v

    v = parse_or()
    if pos != len(toks):
        raise ValueError("trailing tokens")
    return v


def is_spdx_expression(expr):
    return all(t in SPDX_KNOWN or t in "()" for t in tokens(norm(expr)))


def licence_choice(expr):
    """CycloneDX `licenses` entry: an SPDX expression, or a free name when the text is not one."""
    e = norm(expr)
    return [{"expression": e}] if is_spdx_expression(e) else [{"license": {"name": expr}}]


def spdx_licence(expr):
    e = norm(expr)
    return e if is_spdx_expression(e) else "NOASSERTION"


# ----- repositories ---------------------------------------------------------------------------------------------

def sha256_file(path):
    p = Path(path)
    if p.is_symlink():
        return hashlib.sha256(str(p.readlink()).encode()).hexdigest()
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


class Repo:
    def __init__(self, name, path, docs=False):
        self.name, self.path, self.docs = name, Path(path), docs
        if docs:
            self.commit = self.tree = None
            self.files = sorted(str(p.relative_to(path)) for p in self.path.rglob("*")
                                if p.is_file() and not p.relative_to(path).parts[0] == "sbom"
                                and not {".git", "__pycache__"} & set(p.parts))
        else:
            if common.git(path, "status", "--porcelain").strip():
                raise SystemExit(f"{name}: the working tree is not clean; commit or stash first")
            self.commit = common.git(path, "rev-parse", "HEAD").strip()
            self.tree = common.git(path, "rev-parse", "HEAD^{tree}").strip()
            self.date = common.git(path, "show", "-s", "--format=%cI", "HEAD").strip()
            self.files = sorted(common.tracked(path))
        self.hashes = {f: sha256_file(self.path / f) for f in self.files}

    def text(self, rel):
        return (self.path / rel).read_text(encoding="utf-8", errors="replace")


# ----- the build ------------------------------------------------------------------------------------------------

def utc(iso):
    """An ISO 8601 date with an offset as UTC with a trailing Z (the form both schemas accept)."""
    from datetime import datetime, timezone
    return datetime.fromisoformat(iso).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def purl_cargo(name, version):
    return f"pkg:cargo/{name}@{version}"


def spdxid(ref):
    return "SPDXRef-" + re.sub(r"[^A-Za-z0-9.-]", "-", ref)


def parse_dep(s, by_name):
    """A Cargo.lock dependency entry (`name`, `name 1.2.3`, `name 1.2.3 (source)`) as (name, version)."""
    parts = s.split()
    name = parts[0]
    if len(parts) > 1:
        return name, parts[1]
    versions = by_name[name]
    if len(versions) != 1:
        raise ValueError(f"ambiguous dependency {s}")
    return name, versions[0]


def read_lock(text):
    pk = tomllib.loads(text)["package"]
    by_name = {}
    for p in pk:
        by_name.setdefault(p["name"], []).append(p["version"])
    return pk, by_name


class Ctx:
    pass


def load_inputs(repos):
    inputs = json.loads((HERE / "inputs.json").read_text(encoding="utf-8"))
    problems = []
    for coll in ("sources", "datafiles", "prebuilts", "advisories"):
        entries = [dict(v, id=k) for k, v in inputs[coll].items()] if coll == "advisories" else inputs[coll]
        for e in entries:
            ref = e["record"]
            repo, rel = ref.split(":", 1)
            try:
                text = repos[repo].text(rel)
            except OSError:
                problems.append(f"inputs: record {ref} of {e['id']} does not exist")
                continue
            for s in e.get("evidence", []):
                if s.lower() not in text.lower():
                    problems.append(f"inputs: {ref} lacks the string {s!r} that {e['id']} relies on")
    return inputs, problems


def build(root, docs, evidence):
    root = Path(root)
    problems = []
    repos = {n: Repo(n, root / f"oblivios-{n}") for n in CODE_REPOS}
    repos["docs"] = Repo("docs", docs, docs=True)
    inputs, p = load_inputs(repos)
    problems += p
    crates_ev = json.loads((evidence / "crates-io.json").read_text(encoding="utf-8"))["packages"]
    osv = json.loads((evidence / "osv.json").read_text(encoding="utf-8"))
    up_ev = json.loads((evidence / "upstream-licences.json").read_text(encoding="utf-8"))
    mvn = json.loads((evidence / "maven.json").read_text(encoding="utf-8"))
    ctx = Ctx()
    ctx.repos, ctx.inputs, ctx.problems = repos, inputs, problems
    ctx.comps, ctx.deps, ctx.vulns, ctx.claims, ctx.notes = {}, {}, [], [], []

    def add(ref, comp):
        if ref in ctx.comps:
            raise ValueError(f"duplicate bom-ref {ref}")
        comp["bom-ref"] = ref
        ctx.comps[ref] = comp
        ctx.deps.setdefault(ref, set())

    def dep(a, b):
        ctx.deps.setdefault(a, set()).add(b)

    def prop(comp, name, value):
        comp.setdefault("properties", []).append({"name": "oblivios:" + name, "value": str(value)})

    # --- file coverage: every file of every repository falls in exactly one category
    datafiles = inputs["datafiles"]
    prebuilt_by_file = {(e["repo"], e["file"]): e for e in inputs["prebuilts"]}
    manifest_files = {}
    cover = {}  # (repo, path) -> (category, id)
    used_globs = set()
    for rn, repo in repos.items():
        for f in repo.files:
            hits = [(d["id"], g) for d in datafiles if d["repo"] == rn for g in d["files"] if fnmatch.fnmatch(f, g)]
            ids = {h[0] for h in hits}
            used_globs |= {(h[0], h[1]) for h in hits}
            if len(ids) > 1:
                problems.append(f"{rn}:{f} is covered by several data components: {sorted(ids)}")
            if ids:
                cover[(rn, f)] = ("datafile", next(iter(ids)))
            elif (rn, f) in prebuilt_by_file:
                cover[(rn, f)] = ("prebuilt", prebuilt_by_file[(rn, f)]["id"])
            elif f.endswith(".patch"):
                cover[(rn, f)] = ("patch", rn)
            elif rn == "manifest" and re.fullmatch(r"manifest/upstream-\d+\.xml", f):
                cover[(rn, f)] = ("manifest-copy", f)
            else:
                cover[(rn, f)] = ("own", rn)
    for d in datafiles:
        for g in d["files"]:
            if (d["id"], g) not in used_globs:
                problems.append(f"data component {d['id']}: the pattern {g} matches no file")

    # --- the subject and the repositories
    when = max(utc(r.date) for r in repos.values() if not r.docs)
    names = {"manifest": "oblivios-manifest", "platform": "oblivios-platform", "services": "oblivios-services",
             "docs": "oblivios-docs"}
    subject = {"type": "application", "name": "ObliviOS source-only publication", "version": "source-stage",
               "description": "The published source of ObliviOS: oblivios-manifest, oblivios-platform, oblivios-services, "
                              "oblivios-docs. No image, update or supported device is offered (ADR-171).",
               "licenses": [{"license": {"name": "per component; see the licences of the components"}}]}
    ctx.subject = subject
    own_licence = {"manifest": "Apache-2.0", "platform": "Apache-2.0", "services": "Apache-2.0"}
    for rn, repo in repos.items():
        comp = {"type": "application", "name": names[rn], "supplier": {"name": inputs["owner"]},
                "description": f"Repository {names[rn]} (own work; third-party material is listed as separate components)",
                "hashes": [{"alg": "SHA-256", "content": hashlib.sha256(
                    "".join(f"{repo.hashes[f]}  {f}\n" for f in repo.files).encode()).hexdigest()}]}
        if rn == "docs":
            comp["version"] = "snapshot"
            comp["licenses"] = [{"expression": "CC-BY-4.0 AND Apache-2.0"}]
            prop(comp, "licence-note", "documents CC-BY-4.0; the scripts under tools/ Apache-2.0")
            prop(comp, "version-note", "a one-way snapshot without history; identified by the hash of its file list")
        else:
            comp["version"] = repo.commit
            comp["purl"] = f"pkg:github/Beau4201/{names[rn]}@{repo.commit}"
            comp["licenses"] = licence_choice(own_licence[rn])
            comp["externalReferences"] = [{"type": "vcs", "url": f"https://github.com/Beau4201/{names[rn]}"}]
            prop(comp, "git-tree", repo.tree)
        prop(comp, "files", len(repo.files))
        add(f"repo:{rn}", comp)
        dep("subject", f"repo:{rn}")

    # --- platform packages: the shallowest directory with a SOURCE.md
    plat = repos["platform"]
    pkgs = set()
    for f in plat.files:
        if re.search(r"(^|/)SOURCE\.md$", f) and "/" in f:
            d = f.rsplit("/", 1)[0]
            if not any(d.startswith(q + "/") for q in pkgs):
                pkgs = {q for q in pkgs if not q.startswith(d + "/")} | {d}
    pkgs = sorted(pkgs)
    pkg_files = {q: [f for f in plat.files if f.startswith(q + "/")] for q in pkgs}
    for q in pkgs:
        comp = {"type": "library", "name": f"oblivios-platform/{q}", "version": plat.commit,
                "licenses": licence_choice("Apache-2.0"),
                "description": f"Patch package {q}: its own files are Apache-2.0; each patch keeps the licence of the "
                               "upstream file it changes",
                "hashes": [{"alg": "SHA-256", "content": hashlib.sha256("".join(
                    f"{plat.hashes[f]}  {f}\n" for f in pkg_files[q]).encode()).hexdigest()}]}
        prop(comp, "files", len(pkg_files[q]))
        prop(comp, "patches", sum(f.endswith(".patch") for f in pkg_files[q]))
        add(f"pkg:{q}", comp)
        dep("repo:platform", f"pkg:{q}")

    # --- upstream projects patched by the platform patches (revisions of the baseline tag)
    mpath = repos["manifest"].path / "manifest" / f"upstream-{common.BASELINE}.xml"
    projects = common.manifest_projects(mpath)
    patched = common.patched_projects(plat.path, projects)
    ctx.patched = patched
    ctx.upstream_stats = {}
    for path, patches in patched.items():
        pr = projects[path]
        ev = up_ev["projects"].get(path)
        if not ev or ev["revision"] != pr["revision"]:
            problems.append(f"upstream evidence for {path} is missing or for another revision; fetch it again")
            continue
        mod, new, gone = set(), set(), set()
        for pf in patches:
            m, n, g = common.patch_effects(plat.text(pf))
            mod |= m
            new |= n
            gone |= g
        modified = sorted((mod | gone) - new)
        heads = ev["modified_file_headers"]
        kinds = {}
        for k in heads.values():
            kinds[k] = kinds.get(k, 0) + 1
        files = ev["files"]
        if any(v["kind"] == "Apache License 2.0 text" for v in files.values()):
            lic, basis = "Apache-2.0", "root licence file: " + ", ".join(sorted(files))
        elif any(v["kind"] == "MIT-style text" for v in files.values()):
            lic, basis = "MIT", "root licence file: " + ", ".join(sorted(files))
        elif "MODULE_LICENSE_PUBLIC_DOMAIN" in files:
            lic, basis = "Public domain", "root marker file: MODULE_LICENSE_PUBLIC_DOMAIN"
        elif "MODULE_LICENSE_APACHE2" in files:
            lic, basis = "Apache-2.0", "root marker file: MODULE_LICENSE_APACHE2"
        else:
            real = {k for k in kinds if k not in ("no header", "binary", "absent upstream")}
            if len(real) == 1:
                lic, basis = real.pop(), f"header on {sum(v for k, v in kinds.items() if k not in ('no header', 'binary', 'absent upstream'))} of {len(modified)} modified files; no licence file at the project root"
            else:
                lic, basis = "NOASSERTION", "no licence file and no single header licence"
        ctx.upstream_stats[path] = {"modified": len(modified), "created": len(new - gone), "deleted": len(gone - new),
                                    "kinds": kinds, "licence": lic, "basis": basis, "patches": len(patches),
                                    "root_files": sorted(files)}
        comp = {"type": "library", "name": path, "version": pr["revision"], "supplier": {"name": "GrapheneOS" if "grapheneos" in pr["remote"] else "Android Open Source Project"},
                "licenses": licence_choice(lic) if lic != "NOASSERTION" else [{"license": {"name": "not established"}}],
                "description": f"Upstream project {path} at the revision pinned by manifest {common.BASELINE}; modified by "
                               f"{len(patches)} ObliviOS patches",
                "externalReferences": [{"type": "vcs", "url": f"{pr['fetch'].rstrip('/')}/{pr['name']}"}],
                "pedigree": {"patches": [{"type": "unofficial", "diff": {"url": f"https://github.com/Beau4201/oblivios-platform/blob/{plat.commit}/{pf}"}} for pf in patches]}}
        prop(comp, "licence-basis", basis)
        prop(comp, "files-modified", len(modified))
        prop(comp, "files-created-by-patches", len(new - gone))
        add(f"upstream:{path}", comp)
        for pf in patches:
            q = next(q for q in pkgs if pf.startswith(q + "/"))
            dep(f"pkg:{q}", f"upstream:{path}")
    manifest_files = {f: repos["manifest"].hashes[f] for f in repos["manifest"].files if f.startswith("manifest/upstream-")}
    for f, h in manifest_files.items():
        tag = re.search(r"upstream-(\d+)\.xml", f).group(1)
        prov = repos["manifest"].text(f"provenance/{tag}.md")
        if h not in prov:
            problems.append(f"manifest: provenance/{tag}.md does not record the SHA-256 of {f} ({h})")
        m = re.search(r"Resolved manifest commit: `([0-9a-f]{40})`", prov) or re.search(r"commit[^`\n]*`([0-9a-f]{40})`", prov)
        comp = {"type": "data", "name": f"grapheneos-platform-manifest-{tag}", "version": tag,
                "supplier": {"name": "GrapheneOS"}, "hashes": [{"alg": "SHA-256", "content": h}],
                "licenses": [{"license": {"name": "not established (the upstream repository has no licence file at the pinned commit)"}}],
                "description": f"default.xml of GrapheneOS platform_manifest at tag {tag}, byte for byte ({f}); lists "
                               "every upstream project with its revision",
                "externalReferences": [{"type": "vcs", "url": "https://github.com/GrapheneOS/platform_manifest"}]}
        if m:
            prop(comp, "manifest-commit", m.group(1))
        add(f"manifest:{tag}", comp)
        dep("repo:manifest", f"manifest:{tag}")
    dep("repo:platform", f"manifest:{common.BASELINE}")

    # --- patches as file components
    for (rn, f), (cat, cid) in sorted(cover.items()):
        if cat != "patch":
            continue
        repo = repos[rn]
        if rn == "platform":
            path = next(k for k, v in patched.items() if f in v)
            st = ctx.upstream_stats.get(path, {})
            lic = st.get("licence", "NOASSERTION") if st.get("modified") else "Apache-2.0"  # a created file is ObliviOS work
            owner = next(q for q in pkgs if f.startswith(q + "/"))
            proj = f"upstream:{path}"
        else:
            lic, owner, proj = "MIT OR Apache-2.0", None, "src:onionmasq"
        comp = {"type": "file", "name": f"{names[rn]}/{f}", "version": repo.commit,
                "hashes": [{"alg": "SHA-256", "content": repo.hashes[f]}],
                "licenses": licence_choice(lic) if lic not in ("NOASSERTION",) else [{"license": {"name": "not established"}}],
                "description": "Patch; it keeps the licence of the upstream files it changes"}
        add(f"patch:{rn}/{f}", comp)
        dep(f"patch:{rn}/{f}", proj)
        dep(f"pkg:{owner}" if owner else "repo:services", f"patch:{rn}/{f}")

    # --- third-party sources and data components
    for s in inputs["sources"]:
        comp = {"type": "data" if s["id"] not in ("gradle-wrapper", "onionmasq", "aosp-devicesettings") else "library",
                "name": s["name"], "version": s["version"], "supplier": {"name": s["supplier"]},
                "licenses": licence_choice(s["licence"]) if is_spdx_expression(s["licence"]) else [{"license": {"name": s["licence"]}}],
                "externalReferences": [{"type": "website", "url": s["url"]}]}
        if s.get("upstream_hashes"):
            comp["hashes"] = [{"alg": "SHA-256", "content": h["sha256"]} for h in s["upstream_hashes"]]
            prop(comp, "hashes-of", "; ".join(h["what"] for h in s["upstream_hashes"]))
        if s.get("note"):
            comp["description"] = s["note"]
        prop(comp, "record", s["record"])
        if s.get("in_tree") is False:
            prop(comp, "in-published-tree", "false (the file made from it is not in the repositories)")
        add(f"src:{s['id']}", comp)
    for d in datafiles:
        repo = repos[d["repo"]]
        fs = sorted(f for (rn, f), (cat, cid) in cover.items() if rn == d["repo"] and cat == "datafile" and cid == d["id"])
        one = len(fs) == 1  # the hash of a one-file component is the hash of the file, as its record states it
        comp = {"type": "data", "name": d["name"], "version": repo.commit,
                "licenses": licence_choice(d["licence"]) if is_spdx_expression(d["licence"]) else [{"license": {"name": d["licence"]}}],
                "hashes": [{"alg": "SHA-256", "content": repo.hashes[fs[0]] if one else hashlib.sha256("".join(
                    f"{repo.hashes[f]}  {f}\n" for f in fs).encode()).hexdigest()}]}
        if not one:
            prop(comp, "hash-of", "the sorted lines `sha256  path` of the files, as in files.sha256")
        prop(comp, "files", len(fs))
        prop(comp, "paths", ", ".join(d["files"]))
        prop(comp, "record", d["record"])
        add(f"data:{d['id']}", comp)
        for src in d["derived_from"]:
            dep(f"data:{d['id']}", f"src:{src}" if f"src:{src}" in ctx.comps else f"data:{src}")
        owner = [q for q in pkgs if fs and fs[0].startswith(q + "/")] if d["repo"] == "platform" else []
        dep(f"pkg:{owner[0]}" if owner else f"repo:{d['repo']}", f"data:{d['id']}")
    # derived_from may name a datafile that comes later in the list: fix the references
    for ref in list(ctx.deps):
        ctx.deps[ref] = {r if r in ctx.comps else (r.replace("src:", "data:") if r.replace("src:", "data:") in ctx.comps else r) for r in ctx.deps[ref]}

    # --- Rust: both Cargo.lock files, the registry evidence, the OSV result
    svc = repos["services"]
    locks = {}
    for name in ("exit-daemon", "vault-core"):
        locks[name] = read_lock(svc.text(f"{name}/Cargo.lock"))
    crate_refs = {}
    for lname, (pk, by_name) in locks.items():
        for p in pk:
            key = (p["name"], p["version"])
            ref = f"crate:{p['name']}@{p['version']}"
            crate_refs.setdefault(key, ref)
            if ref not in ctx.comps:
                if p.get("source") == REGISTRY:
                    ev = crates_ev.get(f"{p['name']}@{p['version']}")
                    if not ev or "error" in ev:
                        problems.append(f"crates.io evidence for {p['name']}@{p['version']} is missing")
                        continue
                    if ev["checksum"] != p["checksum"]:
                        problems.append(f"{p['name']}@{p['version']}: the registry checksum differs from Cargo.lock")
                    lic = ev["license"]
                    if not lic:
                        problems.append(f"{p['name']}@{p['version']}: the registry states no licence")
                        lic = "NOASSERTION"
                    elif not satisfied(lic):
                        problems.append(f"{p['name']}@{p['version']}: licence {lic!r} cannot be met with the allowed terms")
                    comp = {"type": "library", "name": p["name"], "version": p["version"], "purl": purl_cargo(p["name"], p["version"]),
                            "hashes": [{"alg": "SHA-256", "content": p["checksum"]}],
                            "licenses": licence_choice(lic) if lic != "NOASSERTION" else [{"license": {"name": "not stated"}}],
                            "externalReferences": [{"type": "distribution", "url": f"https://crates.io/crates/{p['name']}/{p['version']}"}]}
                    prop(comp, "licence-as-declared", lic)
                    prop(comp, "yanked", str(bool(ev["yanked"])).lower())
                    if ev["yanked"]:
                        problems.append(f"{p['name']}@{p['version']} is yanked on crates.io")
                    prop(comp, "crate-size", ev["crate_size"])
                    prop(comp, "published", ev["created_at"])
                    prop(comp, "evidence-retrieved", ev["retrieved"])
                    add(ref, comp)
                else:
                    first = {"exit-daemon", "vault-core"}
                    onion = {"onion-tunnel", "onionmasq-device-testing", "simple-proc-net"}
                    lic = "MIT OR Apache-2.0" if p["name"] in onion else "Apache-2.0"
                    comp = {"type": "library", "name": p["name"], "version": p["version"], "licenses": licence_choice(lic),
                            "description": "Package of the repository (path dependency in Cargo.lock)"}
                    if p["name"] in onion:
                        comp["supplier"] = {"name": "The Tor Project"}
                    prop(comp, "in-tree", "true")
                    add(ref, comp)
        for p in pk:
            ref = crate_refs[(p["name"], p["version"])]
            for d in p.get("dependencies", []):
                n, v = parse_dep(d, by_name)
                dep(ref, crate_refs.get((n, v), f"crate:{n}@{v}"))
    for lname, (pk, by_name) in locks.items():
        root_pkg = next(p for p in pk if p["name"] == lname)
        for p in pk:
            comp = ctx.comps.get(crate_refs[(p["name"], p["version"])])
            if comp:
                prop(comp, f"in-{lname}-lock", "true")
        owner = "pkg:privacy/exit" if lname == "exit-daemon" else "pkg:passwords"
        dep("repo:services", crate_refs[(lname, root_pkg["version"])])
    # the registry's licences must equal the project's own records: exit-daemon/NOTICE (made from `cargo metadata`) and the
    # table of vault-core/SOURCE.md (read from crates.io by hand)
    notice_ex = {}
    for line in svc.text("exit-daemon/NOTICE").splitlines():
        if line.strip() and not line.startswith("#"):
            n, v, e = line.split(" ", 2)
            notice_ex[(n, v)] = e
    if len(notice_ex) != len(locks["exit-daemon"][0]):
        problems.append(f"exit-daemon/NOTICE lists {len(notice_ex)} packages, Cargo.lock {len(locks['exit-daemon'][0])}")
    for p in locks["exit-daemon"][0]:
        if p.get("source") == REGISTRY:
            ev = crates_ev[f"{p['name']}@{p['version']}"]
            if notice_ex.get((p["name"], p["version"])) != ev["license"]:
                problems.append(f"exit-daemon/NOTICE gives {notice_ex.get((p['name'], p['version']))!r} for {p['name']} {p['version']}, "
                                f"the registry gives {ev['license']!r}")
    vlock = {(p["name"], p["version"]): p for p in locks["vault-core"][0]}
    rows = re.findall(r"\| `([^`]+)` \| ([0-9][^|]*?) \| `([0-9a-f]{64})` \| ([^|]+?) \|", svc.text("vault-core/SOURCE.md"))
    if len(rows) != 11:
        problems.append(f"vault-core/SOURCE.md: {len(rows)} crate rows read, 11 expected")
    for n, v, c, lic in rows:
        p = vlock.get((n, v))
        ev = crates_ev.get(f"{n}@{v}")
        if not p or p["checksum"] != c:
            problems.append(f"vault-core/SOURCE.md: {n} {v} is not in Cargo.lock with that checksum")
        elif ev and ev["license"] != lic:
            problems.append(f"vault-core/SOURCE.md gives {lic!r} for {n} {v}, the registry gives {ev['license']!r}")
    # files of a foreign copyright or licence inside an `own` rule would be missing from the third-party components
    code_ext = {".java", ".kt", ".rs", ".py", ".sh", ".xml", ".bp", ".mk", ".c", ".cpp", ".h", ".aidl", ".mjs", ".js", ".gradle", ".kts"}
    for (rn, f), (cat, cid) in sorted(cover.items()):
        if cat != "own" or rn == "docs" or Path(f).suffix not in code_ext:
            continue
        head = repos[rn].text(f)[:2000]
        for m in re.finditer(r"Copyright\s*(?:\(c\)|\(C\)|©)?\s*(?:\d{4}(?:\s*[-,]\s*\d{4})*)?\s*,?\s*(?:by\s+)?([^\n\r*]{3,60})", head, re.I):
            if not re.match(r"(Beau ten Berge|ObliviOS)", m.group(1).strip(" .*/#-"), re.I):
                problems.append(f"{rn}:{f} carries the copyright of {m.group(1).strip()!r} but no third-party rule covers it")
        for m in re.finditer(r"SPDX-License-Identifier:\s*([A-Za-z0-9.+-]+)", head):
            if m.group(1) != "Apache-2.0":
                problems.append(f"{rn}:{f} carries the licence {m.group(1)} but no third-party rule covers it")
    # psl embeds the Public Suffix List
    psl = [r for r in ctx.comps if r.startswith("crate:psl@")]
    for r in psl:
        dep(r, "src:public-suffix-list")
        prop(ctx.comps[r], "embeds", "Public Suffix List data (MPL-2.0), data/rules.txt; see vault-core/SOURCE.md")
    for key, ids in osv["vulnerable"].items():
        for vid in ids:
            d = osv["details"][vid]
            adv = inputs["advisories"].get(vid)
            fixed = ", ".join(d["fixed_in"]) or "none listed"
            if adv:
                detail = f"{adv['detail']} OSV of {osv['queried']}: fixed in {fixed}."
            else:
                detail = f"Not assessed by the project. Listed by OSV on {osv['queried']}; fixed in {fixed}."
                ctx.notes.append(f"{vid} ({key}): {d['summary']}; fixed in {fixed}; no assessment in the project records")
            ctx.vulns.append({"id": vid, "source": {"name": "OSV", "url": f"https://osv.dev/vulnerability/{vid}"},
                              "description": d["summary"] or vid, "affects": [{"ref": f"crate:{key}"}],
                              "analysis": {"state": "in_triage", "detail": detail}})
    if osv["unresolved_pages"]:
        problems.append(f"OSV left results unread: {osv['unresolved_pages']}")

    # --- prebuilt binaries
    for e in inputs["prebuilts"]:
        repo = repos[e["repo"]]
        h = repo.hashes[e["file"]]
        rec = repo.text(e["record"].split(":", 1)[1])
        if h not in rec:
            problems.append(f"{e['file']}: its SHA-256 {h} is not stated in {e['record']}")
        sr = repos[e["source_repo"]]
        try:
            full = common.git(sr.path, "rev-parse", "--verify", e["source_commit"] + "^{commit}").strip()
            onbranch = common.git(sr.path, "branch", "-r", "--contains", full).split()
            if not any(b.endswith("/master") for b in onbranch):
                problems.append(f"{e['id']}: source commit {full} is not on a published branch")
            tree = common.git(sr.path, "rev-parse", f"{full}:{e['source_dir']}").strip()
            headtree = common.git(sr.path, "rev-parse", f"HEAD:{e['source_dir']}").strip()
        except subprocess.CalledProcessError:
            problems.append(f"{e['id']}: source commit {e['source_commit']} is not in {e['source_repo']}")
            continue
        if e["lock"]:
            at = common.git(sr.path, "show", f"{full}:{e['lock']}")
            if at != sr.text(e["lock"]):
                problems.append(f"{e['id']}: Cargo.lock at the source commit differs from the published one")
        comp = {"type": "file", "name": e["file"], "version": h[:12], "hashes": [{"alg": "SHA-256", "content": h}],
                "licenses": licence_choice(e["licence"]),
                "description": f"Prebuilt binary committed in oblivios-platform; built from {e['source_repo']} {e['source_dir']} at {full}",
                "externalReferences": [{"type": "vcs", "url": f"https://github.com/Beau4201/oblivios-{e['source_repo']}/tree/{full}/{e['source_dir']}"},
                                       {"type": "build-meta", "url": f"https://github.com/Beau4201/oblivios-platform/blob/{plat.commit}/{e['record'].split(':', 1)[1]}"}]}
        prop(comp, "source-commit", full)
        prop(comp, "source-tree-equals-head", str(tree == headtree).lower())
        prop(comp, "toolchain", e["toolchain"])
        prop(comp, "size", (repo.path / e["file"]).stat().st_size)
        prop(comp, "reproduced", "per the record: two builds, same SHA-256; not re-run by this build")
        add(f"bin:{e['id']}", comp)
        q = next(q for q in pkgs if e["file"].startswith(q + "/"))
        dep(f"pkg:{q}", f"bin:{e['id']}")
        if e["lock"]:
            rootname = e["lock"].split("/")[0]
            dep(f"bin:{e['id']}", crate_refs[(rootname, next(p["version"] for p in locks[rootname][0] if p["name"] == rootname))])
        dep(f"bin:{e['id']}", "repo:services")
    # build tools
    add("tool:rust-1.93.1", {"type": "application", "name": "Rust toolchain (AOSP prebuilts/rust-toolchain)", "version": "1.93.1",
                              "licenses": licence_choice("MIT OR Apache-2.0"), "scope": "excluded",
                              "description": "Build-time tool of the prebuilt Rust binaries; named in their records"})
    add("tool:gradle", {"type": "application", "name": "Gradle", "version": "9.6.1", "scope": "excluded",
                         "licenses": licence_choice("Apache-2.0"), "supplier": {"name": "Gradle Inc."},
                         "hashes": [{"alg": "SHA-256", "content": "9c0f7faeeb306cb14e4279a3e084ca6b596894089a0638e68a07c945a32c9e14"}],
                         "description": "Build tool of the Java modules (gradle-9.6.1-bin.zip, the distributionSha256Sum of the wrapper)"})
    # Gradle test artifacts
    gset = set()
    for coord, rec in mvn["artifacts"].items():
        g, a, v = coord.split(":")
        gset.add((g, a))
        lic = ", ".join(rec["licences"]) or "not stated"
        lmap = {"Eclipse Public License v2.0": "EPL-2.0", "Eclipse Public License 2.0": "EPL-2.0",
                "The Apache License, Version 2.0": "Apache-2.0", "Apache License, Version 2.0": "Apache-2.0"}
        spdx = lmap.get(rec["licences"][0]) if rec["licences"] else None
        comp = {"type": "library", "name": f"{g}:{a}", "version": v, "purl": f"pkg:maven/{g}/{a}@{v}", "scope": "excluded",
                "licenses": licence_choice(spdx) if spdx else [{"license": {"name": lic}}],
                "externalReferences": [{"type": "distribution", "url": f"https://repo1.maven.org/maven2/{g.replace('.', '/')}/{a}/{v}/"}]}
        hashes = [{"alg": "SHA-256", "content": rec["jar_sha256"]}] if rec["jar_sha256"] else []
        if hashes:
            comp["hashes"] = hashes
        prop(comp, "pom-sha256", rec["pom_sha256"])
        prop(comp, "use", "test classpath only; no runtime dependency (services/NOTICE)")
        add(f"maven:{coord}", comp)
        dep("repo:services", f"maven:{coord}")
    ctx.maven_extra = sorted({(d["group"], d["artifact"], d["version"]) for rec in mvn["artifacts"].values() for d in rec["dependencies"]
                              if d["scope"] in (None, "compile", "runtime") and d["optional"] != "true"
                              and (d["group"], d["artifact"]) not in gset})
    ctx.mvn = mvn

    # --- claims of the published NOTICE and README files that the files must support
    check_claims(ctx, crate_refs, locks)

    return ctx, when, cover


# ----- claims ---------------------------------------------------------------------------------------------------

def notice_row(path, s):
    """The row of the platform NOTICE for one patched upstream project (build-sbom.py --notice prints them)."""
    lic = s["licence"] if s["licence"] != "NOASSERTION" else "Not established"
    files = s["root_files"]
    root = (" and ".join(files) + " in the project root") if files else "no licence file in the project root"
    if s["licence"] == "Public domain":
        tail = f"; {s['kinds'].get('Apache-2.0', 0)} of {s['modified']} modified files carry an Apache-2.0 header, the others none"
    elif s["modified"]:
        tail = f"; header on {s['kinds'].get(s['licence'], 0)} of {s['modified']} modified files"
    else:
        tail = "; the patches modify no upstream file, they only create files (ObliviOS work, Apache-2.0)"
    return f"| {path:<32} | {lic:<24} | {root}{tail} |"

def check_claims(ctx, crate_refs, locks):
    repos, problems = ctx.repos, ctx.problems

    def claim(repo, rel, pattern, expected, what):
        text = repos[repo].text(rel)
        m = re.search(pattern, text)
        if not m:
            problems.append(f"claim: {repo}:{rel} no longer states {what} ({pattern!r})")
            return
        got = m.group(1).replace(" ", "").replace(",", "")
        if got != str(expected):
            problems.append(f"claim: {repo}:{rel} says {m.group(1)} for {what}, the files give {expected}")

    ex = locks["exit-daemon"][0]
    vc = locks["vault-core"][0]
    reg_ex = sum(1 for p in ex if p.get("source") == REGISTRY)
    reg_vc = sum(1 for p in vc if p.get("source") == REGISTRY)
    claim("services", "NOTICE", r"names (\d+) Rust packages from crates\.io", reg_ex, "the registry packages of exit-daemon/Cargo.lock")
    claim("services", "NOTICE", r"and (\d+) in-tree packages", len(ex) - reg_ex, "the in-tree packages of exit-daemon/Cargo.lock")
    claim("platform", "NOTICE", r"Cargo\.lock lists (\d+) packages from crates\.io", reg_vc, "the registry packages of vault-core/Cargo.lock")
    stats = ctx.upstream_stats
    claim("platform", "NOTICE", r"for every file that a patch modifies \((\d+) files in", sum(s["modified"] for s in stats.values()), "the files that the patches modify")
    claim("platform", "NOTICE", r"for every file that a patch modifies \(\d+ files in (\d+)\s+projects\)", len(stats), "the upstream projects that the patches modify")
    claim("platform", "NOTICE", r"The\s+patches create (\d+) files in these projects", sum(s["created"] for s in stats.values()), "the files that the patches create")
    notice = repos["platform"].text("NOTICE")
    for path, s in stats.items():
        want = notice_row(path, s)
        if want not in notice:
            problems.append(f"claim: platform:NOTICE lacks the row for {path}: {want}")
    # the index of the manifest repository and the package list of the platform README name every patch package
    pkgnames = sorted(c["name"].split("/", 1)[1] for r, c in ctx.comps.items() if r.startswith("pkg:"))
    overlays = repos["manifest"].text("overlays/README.md")
    plat_readme = repos["platform"].text("README.md")
    for q in pkgnames:
        if f"`oblivios-platform/{q}/`" not in overlays:
            problems.append(f"claim: manifest:overlays/README.md lists no row for the package {q}")
        if f"`{q}`" not in plat_readme:
            problems.append(f"claim: platform:README.md does not list the package {q}")
    claim("manifest", "overlays/README.md", r"should equal the number of package rows above \((\d+) as of", len(pkgnames), "the patch packages of oblivios-platform")
    # exit-daemon README: the number of patches of the vendored library
    npatch = sum(1 for f in repos["services"].files if f.startswith("exit-daemon/third_party/patches/") and f.endswith(".patch"))
    claim("services", "exit-daemon/README.md", r"\((\w+) patches", {4: "four", 5: "five", 6: "six", 7: "seven"}.get(npatch, npatch), "the patches of the vendored Onionmasq")
    # SOURCE.md of exit-daemon: lock size
    claim("services", "exit-daemon/SOURCE.md", r"reduced by `cargo metadata --offline` to the daemon's tree: (\d+) packages", len(ex), "the packages of the daemon's Cargo.lock")
    claim("services", "vault-core/SOURCE.md", r"\((\d+) packages, each with the SHA-256", len(vc), "the packages of vault-core/Cargo.lock")


# ----- documents ------------------------------------------------------------------------------------------------

def cyclonedx(ctx, when, cover):
    comps = ctx.comps
    refs = sorted(comps)
    sn = uuid.uuid5(NS, "|".join(f"{n}:{r.commit or r.hashes.get('README.md', '')}" for n, r in sorted(ctx.repos.items())))
    meta = {"timestamp": when, "lifecycles": [{"phase": "pre-build"}],
            "tools": {"components": [{"type": "application", "name": TOOL, "version": "1", "supplier": {"name": ctx.inputs["owner"]},
                                      "hashes": [{"alg": "SHA-256", "content": sha256_file(__file__)}]}]},
            "authors": [{"name": ctx.inputs["owner"]}], "component": dict(ctx.subject, **{"bom-ref": "subject"}),
            "supplier": {"name": ctx.inputs["owner"]},
            "properties": [
                {"name": "oblivios:stage", "value": "source only (ADR-171): no image, update service or supported device"},
                {"name": "oblivios:baseline-tag", "value": common.BASELINE},
                {"name": "oblivios:files-described", "value": str(sum(len(r.files) for r in ctx.repos.values()))},
                {"name": "oblivios:file-list", "value": "files.sha256 holds every file of the four repositories with its SHA-256"},
                {"name": "oblivios:cargo-scope", "value": "Cargo.lock lists every package that any target, feature or dev/build "
                                                        "configuration may resolve; the subset linked into a binary has not been computed"},
                {"name": "oblivios:coverage", "value": json.dumps(
                    {c: sum(1 for v in cover.values() if v[0] == c) for c in sorted({v[0] for v in cover.values()})}, sort_keys=True)}]}
    out = {"$schema": "http://cyclonedx.org/schema/bom-1.6.schema.json", "bomFormat": "CycloneDX", "specVersion": "1.6",
           "serialNumber": f"urn:uuid:{sn}", "version": 1, "metadata": meta,
           "components": [comps[r] for r in refs]}
    for c in out["components"]:
        if "properties" in c:
            c["properties"].sort(key=lambda p: (p["name"], p["value"]))
    out["dependencies"] = [{"ref": "subject", "dependsOn": sorted(ctx.deps.get("subject", ()))}] + [
        {"ref": r, "dependsOn": sorted(d for d in ctx.deps.get(r, ()) if d in comps or d == "subject")} for r in refs]
    out["compositions"] = [
        {"aggregate": "complete", "assemblies": [f"repo:{n}" for n in sorted(ctx.repos)],
         "bom-ref": "composition:files"},
        {"aggregate": "complete", "assemblies": [r for r in refs if r.startswith("crate:")], "bom-ref": "composition:cargo-lock"},
        {"aggregate": "incomplete", "assemblies": [r for r in refs if r.startswith("upstream:")], "bom-ref": "composition:upstream"}]
    out["vulnerabilities"] = sorted(ctx.vulns, key=lambda v: (v["id"], v["affects"][0]["ref"]))
    return out


def spdx(ctx, when, cdx):
    pk, rel = [], []
    for c in cdx["components"]:
        ref = c["bom-ref"]
        lic = c.get("licenses", [{}])[0]
        declared = spdx_licence(lic["expression"]) if "expression" in lic else "NOASSERTION"
        p = {"SPDXID": spdxid(ref), "name": c["name"], "versionInfo": c.get("version", "NOASSERTION"),
             "downloadLocation": "NOASSERTION", "filesAnalyzed": False, "licenseConcluded": "NOASSERTION",
             "licenseDeclared": declared, "copyrightText": "NOASSERTION",
             "supplier": f"Organization: {c['supplier']['name']}" if c.get("supplier") else "NOASSERTION"}
        if c.get("hashes"):
            p["checksums"] = [{"algorithm": "SHA256", "checksumValue": h["content"]} for h in c["hashes"]]
        refs = []
        if c.get("purl"):
            refs.append({"referenceCategory": "PACKAGE-MANAGER", "referenceType": "purl", "referenceLocator": c["purl"]})
        if refs:
            p["externalRefs"] = refs
        pk.append(p)
        rel.append({"spdxElementId": "SPDXRef-DOCUMENT", "relationshipType": "DESCRIBES" if ref.startswith("repo:") else "CONTAINS",
                    "relatedSpdxElement": spdxid(ref)})
    for d in cdx["dependencies"]:
        for t in d["dependsOn"]:
            if d["ref"] != "subject":
                rel.append({"spdxElementId": spdxid(d["ref"]), "relationshipType": "DEPENDS_ON", "relatedSpdxElement": spdxid(t)})
    rel = [r for r in rel if r["spdxElementId"] != r["relatedSpdxElement"]]
    return {"spdxVersion": "SPDX-2.3", "dataLicense": "CC0-1.0", "SPDXID": "SPDXRef-DOCUMENT",
            "name": "ObliviOS source-only publication",
            "documentNamespace": "https://spdx.org/spdxdocs/oblivios-source-stage-" + cdx["serialNumber"][9:],
            "creationInfo": {"created": when, "creators": [f"Tool: {TOOL}", f"Organization: {ctx.inputs['owner']}"]},
            "packages": pk, "relationships": rel}


def write_all(out, ctx, when, cover, cdx, sp, evidence):
    out.mkdir(parents=True, exist_ok=True)
    (out / "oblivios.cdx.json").write_text(json.dumps(cdx, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    (out / "oblivios.spdx.json").write_text(json.dumps(sp, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    lines = []
    for rn in ("manifest", "platform", "services", "docs"):
        repo = ctx.repos[rn]
        lines += [f"{repo.hashes[f]}  oblivios-{rn}/{f}" for f in repo.files]
    (out / "files.sha256").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (out / "evidence").mkdir(exist_ok=True)
    for f in sorted(evidence.glob("*.json")):
        (out / "evidence" / f.name).write_bytes(f.read_bytes())
    (out / "README.md").write_text(README.format(
        commits="\n".join(f"- `oblivios-{n}` `{ctx.repos[n].commit}`" for n in CODE_REPOS), baseline=common.BASELINE), encoding="utf-8")


README = """# SBOM of the source-only publication

The software bill of materials of the four published repositories (ADR-171, ADR-244): which files they hold, whose they
are, under which licence, which upstream projects the patches change, which prebuilt binaries are committed and from
what they were built, and which third-party packages and data the code and the data files rest on.

| File | What it is |
| --- | --- |
| `oblivios.cdx.json` | CycloneDX 1.6, the full description |
| `oblivios.spdx.json` | SPDX 2.3, the same components and relationships |
| `files.sha256` | every file of the four repositories with its SHA-256, in `sha256sum -c` format |
| `evidence/` | the registry and upstream answers the build read (crates.io, OSV, upstream licence files, Maven Central) |

## Described state

{commits}
- `oblivios-docs` is a snapshot without history; its files are in `files.sha256` (this directory is left out).
- Upstream baseline: manifest `{baseline}`.

## Verify

Clone the four repositories side by side (`oblivios-manifest`, `oblivios-platform`, `oblivios-services`, `oblivios-docs`)
at the commits above, then, in the directory that holds them:

```sh
sha256sum -c oblivios-docs/sbom/files.sha256
python3 oblivios-docs/tools/sbom/build-sbom.py --root . --docs oblivios-docs \\
    --evidence oblivios-docs/sbom/evidence --check oblivios-docs/sbom
```

The first command compares every file with its recorded SHA-256. The second rebuilds both documents from the same commits
and the evidence files, compares them byte for byte, and fails on any fact that the files do not support. The documents
validate against the official CycloneDX 1.6 and SPDX 2.3 JSON schemas. `--schemas DIR` holds `bom-1.6.schema.json`,
`spdx.schema.json` and `jsf-0.82.schema.json` from `schema/` of the tag `1.6` of `github.com/CycloneDX/specification`, and
`spdx-schema.json` from `schemas/` of the branch `support/2.3` of `github.com/spdx/spdx-spec`.
`tools/sbom/validate-schema.mjs` needs ajv 8 and ajv-formats for node, found in `NODEJS_LIB` (default `/usr/share/nodejs`);
the run of 2026-11-17 used ajv 8.17.1 and ajv-formats 3.0.1 from npm.

## What the SBOM does not claim

- Rust: `Cargo.lock` lists every package that any target, feature or dev/build configuration may resolve. The subset
  linked into a given binary has not been computed. Licence and checksum are those of the crates.io registry for each
  locked version; the crate sources were not read again.
- Upstream: only the projects that the patches modify are listed, with their licence evidence. The other projects of the
  manifest are in `manifest/upstream-*.xml`.
- The licence texts of the registry packages of both `Cargo.lock` files are in `THIRD-PARTY-LICENSES.txt` next to the two Rust
  prebuilts in `oblivios-platform`; whether that is enough notice for each licence is not a legal opinion. `ipmap.bin`, which the
  Data Map reads, is not in the repositories; its sources are listed as `in-published-tree: false`.
- The reproducibility of the prebuilt binaries is stated by their records. It was not re-run here.
- Vulnerabilities are those that OSV listed on the day named in `evidence/osv.json`; the assessments are in the records
  of the project where they exist.
- No legal opinion: the licence of a component is what its publisher states.
"""


def validate(out, schemas):
    script = HERE / "validate-schema.mjs"
    for doc, schema in (("oblivios.cdx.json", "bom-1.6.schema.json"), ("oblivios.spdx.json", "spdx-schema.json")):
        r = subprocess.run(["node", str(script), str(Path(schemas) / schema), str(out / doc), str(schemas)], capture_output=True)
        if r.returncode:
            return [f"{doc}: {r.stdout.decode()[-1500:]}{r.stderr.decode()[-500:]}"]
    return []


def main(argv):
    import argparse
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("out", nargs="?")
    ap.add_argument("--root")
    ap.add_argument("--docs")
    ap.add_argument("--evidence", default=str(HERE / "evidence"))
    ap.add_argument("--schemas")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--notice", action="store_true", help="print the NOTICE rows of the patched projects and exit")
    a = ap.parse_args(argv)
    if not (a.out and a.root and a.docs):
        sys.exit(__doc__)
    evidence = Path(a.evidence)
    ctx, when, cover = build(a.root, a.docs, evidence)
    if a.notice:
        stats = ctx.upstream_stats
        print("modified", sum(s["modified"] for s in stats.values()), "created", sum(s["created"] for s in stats.values()))
        print("\n".join(notice_row(p, s) for p, s in sorted(stats.items())))
        sys.exit(0)
    cdx = cyclonedx(ctx, when, cover)
    sp = spdx(ctx, when, cdx)
    out = Path(a.out)
    target = out
    if a.check:
        tmp = tempfile.mkdtemp()
        target = Path(tmp)
    write_all(target, ctx, when, cover, cdx, sp, evidence)
    problems = list(ctx.problems)
    if a.check:
        for f in ("oblivios.cdx.json", "oblivios.spdx.json", "files.sha256", "README.md"):
            if (out / f).read_bytes() != (target / f).read_bytes():
                problems.append(f"{f} differs from a fresh build")
    if a.schemas:
        problems += validate(target, a.schemas)
    stats = {c: sum(1 for v in cover.values() if v[0] == c) for c in sorted({v[0] for v in cover.values()})}
    print(f"components {len(cdx['components'])}, files {sum(stats.values())} {stats}, vulnerabilities {len(cdx['vulnerabilities'])}")
    for n, r in ((n, ctx.repos[n]) for n in CODE_REPOS):
        print(f"  oblivios-{n} {r.commit[:12]}")
    if ctx.maven_extra:
        print("note: Maven POMs declare compile/runtime dependencies beyond the nine artifacts of services/NOTICE:",
              ", ".join(f"{g}:{a}:{v}" for g, a, v in ctx.maven_extra))
    for n in ctx.notes:
        print("NOTE:", n)
    for p in problems:
        print("FAIL:", p)
    sys.exit(1 if problems else 0)


def self_test():
    assert norm("MIT/Apache-2.0") == "MIT OR Apache-2.0" and norm("Apache-2.0 / MIT") == "Apache-2.0 OR MIT"
    assert satisfied("MIT OR GPL-3.0-or-later") and not satisfied("GPL-3.0-or-later") and not satisfied("MIT AND GPL-3.0-or-later")
    assert satisfied("(MIT OR Apache-2.0) AND Unicode-3.0") and satisfied("Apache-2.0 WITH LLVM-exception OR MIT")
    assert is_spdx_expression("MIT OR Apache-2.0") and not is_spdx_expression("Public domain")
    assert licence_choice("Public domain") == [{"license": {"name": "Public domain"}}]
    assert spdxid("crate:a_b@1.0+x") == "SPDXRef-crate-a-b-1.0-x"
    pk, by = read_lock('version=4\n[[package]]\nname="a"\nversion="1"\ndependencies=["b","c 2.0.0 (registry+x)"]\n'
                       '[[package]]\nname="b"\nversion="1"\n[[package]]\nname="c"\nversion="2.0.0"\n')
    assert parse_dep("b", by) == ("b", "1") and parse_dep("c 2.0.0 (registry+x)", by) == ("c", "2.0.0")
    try:
        parse_dep("zz", {"zz": ["1", "2"]})
        raise AssertionError("ambiguity not detected")
    except ValueError:
        pass
    mod, new, gone = common.patch_effects("diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n"
                                          "diff --git a/n b/n\nnew file mode 100644\n--- /dev/null\n+++ b/n\n@@ -0,0 +1 @@\n")
    assert mod == {"x"} and new == {"n"}
    assert uuid.uuid5(NS, "x") == uuid.uuid5(NS, "x")
    assert utc("2026-11-16T15:30:00+01:00") == "2026-11-16T14:30:00Z"
    print("self-test: OK")


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        self_test()
    else:
        main(sys.argv[1:])
