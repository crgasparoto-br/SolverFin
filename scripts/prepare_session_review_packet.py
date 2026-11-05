#!/usr/bin/env python3
"""Read-only, exact-SHA neutral packet collector for operator-attested session review.

Bootstrap stage: this does NOT verify a review or publish an approval check.
All authenticated data comes from GitHub; no candidate code is executed.
Canonical contract: crgasparoto-br/skill@a28be10 (WEB_INDEPENDENT_AUDIT.md).
"""
from __future__ import annotations

import argparse
import base64
import difflib
import gzip
import io
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote

from session_review import canonical, digest, safe_path, strict_json, require, POLICY_PATH

REPO_RE = re.compile(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\Z")
SHA_RE = re.compile(r"[0-9a-f]{40}\Z")
MAX_FILE = 2 * 1024 * 1024
MAX_TOTAL = 24 * 1024 * 1024
MAX_FILES = 200
MAX_PAGES = 25
ROOT = Path(__file__).resolve().parents[1]


def git_sha(data: bytes) -> str:
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()


def api_json(payload: bytes) -> dict | list:
    def unique(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, "duplicate GitHub response key")
            result[key] = value
        return result
    return json.loads(payload, object_pairs_hook=unique,
                      parse_constant=lambda value: (_ for _ in ()).throw(ValueError("non-JSON constant")))


def api(path: str) -> dict | list:
    require(path.startswith("/repos/") and ".." not in path, "unsafe GitHub endpoint")
    process = subprocess.run(["gh", "api", "--method", "GET", path],
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                             check=False, timeout=75)
    require(process.returncode == 0, f"GitHub read failed for {path.split('?', 1)[0]}")
    require(len(process.stdout) < MAX_TOTAL, "GitHub response exceeds budget")
    return api_json(process.stdout)


def paged(repo: str, endpoint: str) -> list[dict]:
    rows = []
    for page in range(1, MAX_PAGES + 1):
        sep = "&" if "?" in endpoint else "?"
        data = api(f"/repos/{repo}/{endpoint}{sep}per_page=100&page={page}")
        require(isinstance(data, list) and all(isinstance(x, dict) for x in data), "invalid GitHub page")
        rows.extend(data)
        require(len(rows) <= MAX_FILES, "inventory exceeds audited path budget")
        if len(data) < 100:
            return rows
    raise ValueError("truncated GitHub pagination")


def file_at(repo: str, path: str, sha: str) -> tuple[str, str]:
    require(safe_path(path) and not path.endswith("/") and SHA_RE.fullmatch(sha), "unsafe source reference")
    row = api(f"/repos/{repo}/contents/{quote(path, safe='/')}?ref={sha}")
    require(isinstance(row, dict) and row.get("type") == "file"
            and row.get("encoding") == "base64", "regular file bytes missing")
    data = base64.b64decode("".join(row["content"].split()), validate=True)
    require(len(data) <= MAX_FILE and row.get("size") == len(data), "source size mismatch")
    require(row.get("sha") == git_sha(data), "GitHub blob metadata mismatch")
    text = data.decode("utf-8")
    return text, digest(data)


def parse_requirements(repo: str, issue_number: int, issue_body: str) -> list[dict]:
    # Copy of official parser is pinned and tested separately; it is not
    # replaced by a candidate-authored list in the PR description.
    import tempfile
    from session_review_specification import extract_candidates
    with tempfile.TemporaryDirectory() as temporary:
        work = Path(temporary)
        (work / "issue.txt").write_text(issue_body, encoding="utf-8")
        snapshot = {"schema_version": 1, "repository": repo, "issue": issue_number,
                    "primary_source_id": f"SRC-ISSUE-{issue_number}",
                    "sources": [{"id": f"SRC-ISSUE-{issue_number}", "kind": "issue-body",
                                 "textual": True, "path": "issue.txt",
                                 "sha256": digest(issue_body.encode())}]}
        (work / "snapshot.json").write_bytes(canonical(snapshot))
        errors = []
        _, _, requirements = extract_candidates(work / "snapshot.json", errors)
        require(not errors and requirements, "canonical issue extraction failed")
        return requirements


def issue_reference(pr: dict) -> int:
    matches = {int(m) for m in re.findall(r"(?im)^\s*(?:refs|fixes|closes)\s+#([1-9][0-9]*)(?:[ \t]*;[^\n]*)?[ \t]*$",
                                             pr.get("body") or "")}
    require(len(matches) == 1, "PR must reference one canonical issue")
    return next(iter(matches))


def trusted_policy(repo: str, base_sha: str, default_sha: str) -> tuple[dict, str]:
    base, _ = file_at(repo, POLICY_PATH, base_sha)
    default, _ = file_at(repo, POLICY_PATH, default_sha)
    require(base == default, "default and base policy drift")
    policy = strict_json(base)
    # Disabled mode is valid for bootstrap collection but never approval.
    require(policy.get("mode") in {"enabled", "disabled"}, "invalid policy mode")
    require(policy.get("assurance") == "operator-attested-session-review"
            and policy.get("acknowledgement") == "separate-context-declared-not-cryptographically-proven",
            "policy assurance has been misrepresented")
    return policy, digest(base.encode())


def checked_preview(repo: str, sha: str, base: str, head: str) -> dict:
    require(isinstance(sha, str) and SHA_RE.fullmatch(sha), "missing merge preview")
    raw = api(f"/repos/{repo}/git/commits/{sha}")
    parents = [x.get("sha") for x in raw.get("parents", [])]
    require(parents == [base, head], "merge preview parents do not match base and head")
    return {"sha": sha, "tree_sha": raw["tree"]["sha"], "parents": parents}


def bounded_gzip_decompress(raw: bytes, *, limit: int = MAX_TOTAL) -> bytes:
    """Reject gzip bombs during bounded reads, never after full expansion."""
    require(isinstance(raw, bytes) and type(limit) is int and limit > 0,
            "invalid gzip input or size budget")
    try:
        with gzip.GzipFile(fileobj=io.BytesIO(raw), mode="rb") as stream:
            result = stream.read(limit + 1)
            require(len(result) <= limit, "sharded artifact inflation exceeds budget")
            require(stream.read(1) == b"", "sharded artifact has trailing output")
            return result
    except (OSError, EOFError) as exc:
        raise ValueError("malformed sharded gzip artifact") from exc


CRITICAL_ARTIFACT_NAMES = {
    "specification_snapshot": "specification-snapshot.json",
    "requirement_closure": "requirement-closure.json",
    "requirement_attack_matrix": "requirement-attack-matrix.json",
    "risk_saturation": "risk-saturation.json",
    "inherited_controls": "inherited-controls.json",
    "evidence_provenance": "evidence-provenance.json",
    "codebase_grounding": "codebase-grounding.json",
    "code_growth": "code-growth.json",
}


def validate_critical_payloads(cert: dict, documents: dict[str, dict]) -> None:
    """Bind the eight critical documents to the certified issue, base and material."""
    subject, identity = cert["subject"], cert["identity"]
    material, base = identity["material_head_sha"], identity["base_sha"]
    snapshot = documents["specification_snapshot"]
    require(snapshot.get("repository") == subject["repository"]
            and snapshot.get("issue") == subject["issue_number"]
            and isinstance(snapshot.get("sources"), list) and bool(snapshot["sources"]),
            "critical specification snapshot does not bind to issue")
    closure = documents["requirement_closure"]
    obligations = closure.get("obligations")
    require(isinstance(obligations, list) and bool(obligations)
            and all(isinstance(item, dict) and isinstance(item.get("candidate_key"), str)
                    and bool(item["candidate_key"]) for item in obligations)
            and (closure.get("specification_snapshot") or {}).get("sha256")
            == cert["artifacts"]["specification_snapshot"]["sha256"]
            and (closure.get("pass_c") or {}).get("status") == "passed"
            and (closure.get("scope_reduction_review") or {}).get("status") == "passed",
            "critical requirement closure is incomplete or unbound")
    for key, rows, gaps in (
        ("requirement_attack_matrix", "requirements", "uncovered_requirements"),
        ("risk_saturation", "families", "material_families_missing_controls"),
        ("inherited_controls", "controls", "unresolved_controls"),
    ):
        data = documents[key]
        require(data.get("head_sha") == material and isinstance(data.get(rows), list)
                and (key != "requirement_attack_matrix" or bool(data[rows]))
                and data.get(gaps) == [],
                "critical control inventory stale or unresolved: " + key)
    provenance = documents["evidence_provenance"]
    require(provenance.get("material_head_sha") == material
            and provenance.get("base_sha") == base
            and isinstance(provenance.get("evidence"), list) and bool(provenance["evidence"]),
            "critical evidence provenance missing or stale")
    grounding = documents["codebase_grounding"]
    require(grounding.get("subject_sha") == material and grounding.get("base_sha") == base
            and isinstance(grounding.get("test_decisions"), list),
            "critical codebase grounding missing or stale")
    growth = documents["code_growth"]
    require(growth.get("control_id") == "CODE-GROWTH-001"
            and growth.get("subject_sha") == material and growth.get("base_sha") == base
            and growth.get("status") == "passed" and growth.get("blocking_files") == [],
            "critical code growth control did not pass")


def _verified_certificate_artifacts(repo: str, cert: dict, head: str) -> None:
    """Authenticate distinct canonical Git blobs and critical document contents."""
    sub = cert["subject"]
    prefix = f".audit/entregar-issue/issue-{sub['issue_number']}/"
    inventory = cert.get("artifacts")
    require(isinstance(inventory, dict)
            and set(inventory) == set(CRITICAL_ARTIFACT_NAMES),
            "critical certificate artifact inventory missing or foreign")
    documents: dict[str, dict] = {}
    seen_names: set[str] = set()
    for key, artifact in inventory.items():
        require(isinstance(artifact, dict), "invalid certificate artifact entry")
        name = artifact.get("name")
        require(name == CRITICAL_ARTIFACT_NAMES[key] and name not in seen_names,
                "critical certificate artifact filename is not canonical or unique")
        seen_names.add(name)
        text, actual_sha = file_at(repo, prefix + name, head)
        require(artifact.get("sha256") == actual_sha,
                f"certificate artifact digest mismatch: {key}")
        transport = artifact.get("artifact_transport") or {}
        kind = transport.get("format", "plain-json")
        if kind == "plain-json":
            decoded = text.encode("utf-8")
            require(artifact.get("logical_sha256") == digest(decoded),
                    "plain artifact content/digest mismatch")
        else:
            require(kind == "base64-shards-v1", "unsupported critical artifact transport")
            manifest = strict_json(text)
            require(manifest.get("artifact_format") == "base64-shards-v1"
                    and isinstance(manifest.get("parts"), list) and manifest["parts"],
                    "sharded artifact manifest invalid")
            encoded = []
            size = 0
            for part in manifest["parts"]:
                rel = part.get("path")
                require(isinstance(rel, str) and safe_path(rel)
                        and rel.startswith(name.rsplit(".", 1)[0] + ".parts/"),
                        "artifact shard path escaped package")
                piece, hash_value = file_at(repo, prefix + rel, head)
                require(hash_value == part.get("sha256") and len(piece.encode()) == part.get("size"),
                        "artifact shard digest or size mismatch")
                size += len(piece)
                require(size <= MAX_TOTAL, "sharded artifact exceeds audit budget")
                encoded.append(piece)
            encoded_text = "".join(encoded).encode()
            require(manifest.get("encoded_sha256") == digest(encoded_text),
                    "sharded artifact aggregate digest mismatch")
            compressed = base64.b64decode(encoded_text, validate=True)
            require(len(compressed) <= MAX_TOTAL, "compressed artifact exceeds budget")
            decoded = bounded_gzip_decompress(compressed) if manifest.get("compression") == "gzip" else compressed
            require(len(decoded) <= MAX_TOTAL and manifest.get("decoded_sha256") == digest(decoded)
                    and artifact.get("logical_sha256") == digest(decoded),
                    "sharded artifact logical bytes mismatch")
        require(artifact.get("logical_size") == len(decoded) and len(decoded) <= MAX_TOTAL,
                "critical artifact logical size mismatch")
        parsed = api_json(decoded)
        require(isinstance(parsed, dict) and type(parsed.get("schema_version")) is int
                and parsed["schema_version"] > 0,
                "critical artifact is not a versioned JSON document")
        documents[key] = parsed
    validate_critical_payloads(cert, documents)


def inspect_handoff(repo: str, pr_number: int, base: str, head: str,
                    *, expected_issue: int | None = None, expected_head_ref: str | None = None,
                     expected_base_ref: str | None = None) -> dict:
    certificate_text, certificate_digest = file_at(repo, ".audit/entregar-issue/handoff-ready.json", head)
    cert = strict_json(certificate_text)
    ident, sub = cert.get("identity", {}), cert.get("subject", {})
    require(cert.get("schema_version") == 2 and cert.get("status") == "ready"
            and cert.get("phase") == "final" and cert.get("evidence_profile") == "critical",
            "critical handoff is not ready")
    require(sub.get("repository") == repo and sub.get("pull_request_number") == pr_number
            and sub.get("base_ref") in {"develop", "main"} and sub.get("work_item_kind") == "issue"
            and sub.get("issue_number") == sub.get("work_item_number"),
            "handoff subject mismatch")
    if expected_issue is not None:
        require(sub.get("issue_number") == expected_issue, "handoff canonical issue mismatch")
    if expected_head_ref is not None:
        require(sub.get("head_ref") == expected_head_ref, "handoff candidate branch mismatch")
    if expected_base_ref is not None:
        require(expected_base_ref in {"develop", "main"}
                and sub.get("base_ref") == expected_base_ref,
                "handoff protected base mismatch")
    require(ident.get("base_sha") == base, "handoff base mismatch")
    material = ident.get("material_head_sha")
    require(isinstance(material, str) and SHA_RE.fullmatch(material) and ident.get("head_sha") == material,
            "handoff material identity missing or inconsistent")
    head_commit = api(f"/repos/{repo}/git/commits/{head}")
    require([x.get("sha") for x in head_commit.get("parents", [])] == [material],
            "published HEAD is not a direct result-only child of the material")
    diff = api(f"/repos/{repo}/compare/{material}...{head}")
    files = diff.get("files", [])
    require(0 < len(files) <= MAX_FILES and diff.get("total_commits") == 1,
            "unbounded or non-child handoff diff")
    require(all(str(item.get("filename", "")).startswith(".audit/entregar-issue/")
                and item.get("status") != "removed" for item in files),
            "non-result-only change after material freeze")
    permitted = (cert.get("certificate_commit_policy") or {}).get("allowed_paths")
    require(isinstance(permitted, list) and set(permitted) == {i["filename"] for i in files}
            and len(permitted) == len(files), "result-only certificate allowlist differs from committed diff")
    _verified_certificate_artifacts(repo, cert, head)
    scope = cert.get("scope") or {}
    require(scope.get("work_item_start_sha") == base and scope.get("material_head_sha") == material,
            "certificate material scope is stale")
    actual_scope = api(f"/repos/{repo}/compare/{base}...{material}")
    require(actual_scope.get("status") == "ahead" and not actual_scope.get("too_large")
            and {i["filename"] for i in actual_scope.get("files", [])}
            == set(scope.get("issue_changed_paths") or []),
            "certificate scope does not match actual material diff")
    return {"certificate_sha256": certificate_digest, "certificate": cert,
            "material_head_sha": material,
            "result_only_changed_paths": [item["filename"] for item in files]}


def ci_runs(repo: str, sha: str) -> list[dict]:
    require(SHA_RE.fullmatch(sha), "invalid workflow target")
    result = api(f"/repos/{repo}/actions/runs?head_sha={sha}&event=pull_request&per_page=100")
    rows = result.get("workflow_runs", [])
    require(isinstance(rows, list) and len(rows) <= 100, "unbounded workflow runs")
    return [{"id": x["id"], "name": x.get("name"), "head_sha": x.get("head_sha"),
             "status": x.get("status"), "conclusion": x.get("conclusion"),
             "event": x.get("event"), "html_url": x.get("html_url")}
            for x in rows if x.get("head_sha") == sha and x.get("event") == "pull_request"]


def freeze_files(repo: str, paths: list[dict], base: str, head: str) -> tuple[dict, dict]:
    files, patches = {}, {}
    size = 0
    require(len(paths) <= MAX_FILES, "changed-file inventory too large")
    for info in paths:
        status, path = info.get("status"), info.get("filename")
        require(status in {"added", "modified", "removed", "renamed"}
                and isinstance(path, str) and safe_path(path), "unsupported or unsafe file change")
        old = info.get("previous_filename", path)
        require(isinstance(old, str) and safe_path(old), "unsafe previous path")
        before = "" if status == "added" else file_at(repo, old, base)[0]
        after = "" if status == "removed" else file_at(repo, path, head)[0]
        size += len(before.encode()) + len(after.encode())
        require(size <= MAX_TOTAL, "changed source bytes exceed budget")
        if status != "added":
            files["base/" + old] = before
        if status != "removed":
            files["head/" + path] = after
        patches[path] = "".join(difflib.unified_diff(before.splitlines(keepends=True),
            after.splitlines(keepends=True), fromfile="base/" + old, tofile="head/" + path))
    return files, patches


def collect(repo: str, number: int) -> dict:
    require(REPO_RE.fullmatch(repo) and type(number) is int and number > 0, "invalid target")
    raw_pr = api(f"/repos/{repo}/pulls/{number}")
    require(raw_pr.get("state") == "open" and not raw_pr.get("draft"), "PR not ready")
    require(raw_pr["head"]["repo"]["full_name"] == repo
            and raw_pr["base"]["repo"]["full_name"] == repo,
            "cross-repository candidate not authorized")
    base, head = raw_pr["base"]["sha"], raw_pr["head"]["sha"]
    base_ref = raw_pr["base"]["ref"]
    require(base_ref in {"develop", "main"} and SHA_RE.fullmatch(base)
            and SHA_RE.fullmatch(head), "untrusted PR identity")
    number_issue = issue_reference(raw_pr)
    issue = api(f"/repos/{repo}/issues/{number_issue}")
    require(issue.get("number") == number_issue and "pull_request" not in issue
            and isinstance(issue.get("body"), str), "canonical issue unavailable")
    repository = api(f"/repos/{repo}")
    default_branch = repository["default_branch"]
    branch = api(f"/repos/{repo}/branches/{quote(default_branch)}")
    _, policy_sha = trusted_policy(repo, base, branch["commit"]["sha"])
    preview = checked_preview(repo, raw_pr.get("merge_commit_sha"), base, head)
    handoff = inspect_handoff(repo, number, base, head, expected_issue=number_issue,
                              expected_head_ref=raw_pr["head"]["ref"],
                              expected_base_ref=base_ref)
    require(handoff["certificate"]["subject"]["issue_number"] == number_issue,
            "handoff canonical issue mismatch")
    material = handoff["material_head_sha"]
    changed = paged(repo, f"pulls/{number}/files")
    sources, diffs = freeze_files(repo, changed, base, head)
    runs = {"material": ci_runs(repo, material), "published_head": ci_runs(repo, head)}
    identity = {"repository": repo, "pull_request": number, "issue": number_issue,
                "base_ref": base_ref, "base_sha": base, "head_sha": head,
                "merge_preview_sha": preview["sha"], "issue_sha256": digest(issue["body"].encode()),
                "policy_sha256": policy_sha}
    # Re-read mutable identity after collection to avoid an apparently fresh but stale packet.
    current = api(f"/repos/{repo}/pulls/{number}")
    require(current["head"]["sha"] == head and current["base"]["sha"] == base
            and current.get("merge_commit_sha") == preview["sha"], "PR moved during collection")
    return {"schema_version": 1, "identity": identity,
            "implementation_conclusions_included": False,
            "implementation_narrative_included": False,
            "canonical_issue_body": issue["body"],
            "requirements": parse_requirements(repo, number_issue, issue["body"]),
            "merge_preview": preview,
            "handoff": {"material_head_sha": material,
                        "certificate_sha256": handoff["certificate_sha256"],
                        "certificate_schema": handoff["certificate"]["schema_version"],
                        "certificate_status": handoff["certificate"]["status"],
                        "evidence_profile": handoff["certificate"]["evidence_profile"],
                        "completion": handoff["certificate"]["completion"],
                        "result_only_changed_paths": handoff["result_only_changed_paths"]},
            "ci_observations": runs, "files": sources, "diffs": diffs,
            "source_sha256": {path: digest(value.encode()) for path, value in sources.items()},
            "collector": {"source": "SolverFin trusted default branch",
                          "third_party_identity_proven": False,
                          "approved": False}}


def validate_event(repo: str, path: Path) -> int:
    event = strict_json(path.read_text(encoding="utf-8"))
    require(event.get("repository", {}).get("full_name") == repo,
            "event repository mismatch")
    issue = event.get("issue", {})
    comment = event.get("comment", {})
    require(issue.get("pull_request") and type(issue.get("number")) is int,
            "comment target must be a PR")
    require(comment.get("body") == "/solverit-audit-packet", "not an explicit packet request")
    require(type(comment.get("id")) is int and comment["id"] > 0,
            "unidentified packet request")
    actual = api(f"/repos/{repo}/issues/comments/{comment['id']}")
    require(actual.get("body") == "/solverit-audit-packet"
            and actual.get("issue_url", "").endswith(f"/issues/{issue['number']}")
            and actual.get("user", {}).get("id") == comment.get("user", {}).get("id"),
            "packet request changed after authentication")
    # Only the repository owner's authenticated account can trigger packet collection.
    repository = api(f"/repos/{repo}")
    owner = repository.get("owner") or {}
    require(actual.get("user", {}).get("id") == owner.get("id")
            and actual.get("user", {}).get("login") == owner.get("login"),
            "packet requester is not the repository owner")
    return issue["number"]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", required=True)
    parser.add_argument("--pr", type=int)
    parser.add_argument("--event", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    require(bool(args.pr) != bool(args.event), "provide exactly one PR selector")
    try:
        pr = args.pr if args.pr else validate_event(args.repo, args.event)
        packet = collect(args.repo, pr)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_bytes(canonical(packet) + b"\n")
        print(f"RAW NEUTRAL PACKET: PR #{pr}; no independent approval or check emitted")
        return 0
    except (ValueError, KeyError, TypeError, OSError, subprocess.SubprocessError) as exc:
        print(f"BLOCK: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
