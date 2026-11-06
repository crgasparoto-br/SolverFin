#!/usr/bin/env python3
"""Exact-SHA test evidence from a read-only PR workflow, never an approval.

A trusted reviewer verifies semantics separately. This module only proves
that the listed test cases ran successfully at the GitHub-authenticated HEAD.
"""
from __future__ import annotations

import argparse
import io
import json
import re
import stat
import subprocess
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree

from session_review import canonical, digest, require, safe_path
from prepare_session_review_packet import api, file_at

WORKFLOW = ".github/workflows/session-review-evidence.yml"
RUN_NAME = "Session review evidence (exact SHA)"
ARTIFACT_PREFIX = "session-review-evidence-"
MAX_ZIP = 16 * 1024 * 1024
MAX_XML = 8 * 1024 * 1024
SHA = re.compile(r"[0-9a-f]{40}\Z")


def passed_cases(raw: bytes) -> set[str]:
    require(len(raw) < MAX_XML and b"<!DOCTYPE" not in raw.upper()
            and b"<!ENTITY" not in raw.upper(), "unsafe or oversized JUnit")
    root = ElementTree.fromstring(raw)
    require(root.tag in {"testsuites", "testsuite"}, "JUnit root is invalid")
    rows = list(root.iter("testcase"))
    require(0 < len(rows) <= 5000, "JUnit test inventory must be complete")
    observed: set[str] = set()
    for row in rows:
        name, classname = row.get("name"), row.get("classname")
        require(isinstance(name, str) and bool(name) and isinstance(classname, str)
                and bool(classname), "JUnit test identity missing")
        key = classname + "::" + name
        require(key not in observed and len(key) <= 1200, "JUnit test identity duplicate or oversized")
        observed.add(key)
        require(not any(child.tag in {"failure", "error", "skipped"} for child in row),
                "JUnit includes failing, errored or skipped tests")
    return observed


def write_evidence(junit: Path, certificate: Path, out: Path, repository: str,
                   number: int, base: str, head: str) -> None:
    require(bool(SHA.fullmatch(head)) and bool(SHA.fullmatch(base))
            and type(number) is int and number > 0, "invalid exact SHA evidence target")
    raw = junit.read_bytes()
    cases = passed_cases(raw)
    cert = certificate.read_bytes()
    require(len(cert) < 2 * 1024 * 1024, "handoff certificate too large")
    document = json.loads(cert)
    require(document.get("schema_version") == 2 and document.get("status") == "ready"
            and (document.get("subject") or {}).get("repository") == repository
            and (document.get("subject") or {}).get("pull_request_number") == number
            and (document.get("identity") or {}).get("base_sha") == base,
            "exact SHA certificate is not bound to this PR")
    payload = {"schema_version": 1, "repository": repository, "pull_request": number,
               "base_sha": base, "head_sha": head, "material_head_sha": document["identity"]["material_head_sha"],
               "junit_sha256": digest(raw), "certificate_sha256": digest(cert),
               "passed_cases": len(cases), "exit_code": 0}
    out.mkdir(parents=True, exist_ok=True)
    (out / "junit.xml").write_bytes(raw)
    (out / "handoff-ready.json").write_bytes(cert)
    (out / "session-review-evidence.json").write_bytes(canonical(payload) + b"\n")


def artifact_zip(repo: str, artifact_id: int) -> bytes:
    endpoint = f"/repos/{repo}/actions/artifacts/{artifact_id}/zip"
    process = subprocess.run(["gh", "api", "--method", "GET", endpoint],
                             capture_output=True, check=False, timeout=90)
    require(process.returncode == 0, "authenticated evidence download failed")
    require(len(process.stdout) <= MAX_ZIP, "evidence archive exceeds budget")
    return process.stdout


def consume_zip(data: bytes) -> tuple[dict, set[str], bytes]:
    require(len(data) <= MAX_ZIP, "oversized artifact")
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        files = archive.infolist()
        expected = {"session-review-evidence.json", "handoff-ready.json", "junit.xml"}
        require({f.filename for f in files} == expected and len(files) == len(expected),
                "artifact files are missing, foreign or duplicated")
        total = 0
        for info in files:
            total += info.file_size
            require(safe_path(info.filename) and not stat.S_ISLNK(info.external_attr >> 16)
                    and total <= MAX_ZIP, "unsafe evidence archive")
        facts_raw = archive.read("session-review-evidence.json")
        require(len(facts_raw) < 4096, "evidence metadata too large")
        def unique(pairs):
            obj = {}
            for key, value in pairs:
                require(key not in obj, "duplicate evidence metadata key")
                obj[key] = value
            return obj
        facts = json.loads(facts_raw, object_pairs_hook=unique)
        xml = archive.read("junit.xml")
        cert = archive.read("handoff-ready.json")
    require(facts.get("junit_sha256") == digest(xml)
            and facts.get("certificate_sha256") == digest(cert), "evidence bytes mismatch")
    cases = passed_cases(xml)
    require(facts.get("passed_cases") == len(cases) and facts.get("exit_code") == 0,
            "evidence test execution not proven")
    return facts, cases, cert


CI_WORKFLOWS = {
    "Repository CI": ".github/workflows/delivery-v2-ci.yml",
    "Statement visual validation": ".github/workflows/statement-visual-validation.yml",
    "Delivery audit workspace": ".github/workflows/delivery-audit-workspace.yml",
}


def authenticate_ci_workflows(repo: str, base: str, material: str, head: str,
                              required: tuple[str, ...]) -> None:
    """Only protected-base CI producers can provide evidence for this review.

    Run name/path alone is insufficient: a candidate could edit a workflow to
    emit green without its original controls. Reads authenticate Git blobs.
    """
    for name in required:
        require(name in CI_WORKFLOWS, "unknown technical CI workflow")
        path = CI_WORKFLOWS[name]
        trusted, expected_digest = file_at(repo, path, base)
        for candidate_sha in (material, head):
            current, actual_digest = file_at(repo, path, candidate_sha)
            require(current == trusted and actual_digest == expected_digest,
                    f"technical CI workflow differs from protected base: {path}")


def prove_ci(repo: str, head: str, required: tuple[str, ...],
             number: int, base: str) -> dict[str, dict]:
    """Accept only complete, exact-base CI history for this authenticated PR.

    A green run from another PR sharing an immutable commit cannot certify this
    delivery; the run must name the same PR, base SHA and candidate head SHA.
    """
    require(type(number) is int and number > 0 and SHA.fullmatch(base),
            "invalid technical CI PR/base identity")
    rows = api(f"/repos/{repo}/actions/runs?head_sha={head}&event=pull_request&per_page=100")
    require(isinstance(rows, dict) and type(rows.get("total_count")) is int
            and 0 <= rows["total_count"] <= 100
            and isinstance(rows.get("workflow_runs"), list)
            and len(rows["workflow_runs"]) == rows["total_count"],
            "unbounded or incomplete CI history")

    def belongs_to_target(run: dict) -> bool:
        prs = run.get("pull_requests")
        return isinstance(prs, list) and any(
            isinstance(pr, dict) and pr.get("number") == number
            and (pr.get("base") or {}).get("sha") == base
            and (pr.get("head") or {}).get("sha") == head
            for pr in prs
        )

    good: dict[str, dict] = {}
    for name in required:
        matches = [r for r in rows["workflow_runs"] if isinstance(r, dict)
                   and r.get("name") == name
                   and r.get("path") == CI_WORKFLOWS[name]
                   and r.get("head_sha") == head and r.get("event") == "pull_request"
                   and belongs_to_target(r)]
        require(bool(matches), f"required technical workflow {name} missing for exact PR/base/HEAD")
        newest = max(matches, key=lambda r: r["id"])
        require(newest.get("status") == "completed" and newest.get("conclusion") == "success",
                f"latest technical workflow {name} not terminal green")
        good[name] = newest
    return good


def collect_verified(repo: str, number: int, base: str, head: str, material: str,
                     certificate_digest: str, *, visual_required: bool = False) -> tuple[dict, set[str]]:
    require(all(SHA.fullmatch(s) for s in (base, head, material)), "invalid evidence identities")
    required = ("Repository CI", "Delivery audit workspace")
    if visual_required:
        required += ("Statement visual validation",)
    authenticate_ci_workflows(repo, base, material, head, required)
    published_runs = prove_ci(repo, head, required, number, base)
    material_runs = prove_ci(repo, material, required, number, base)
    rows = api(f"/repos/{repo}/actions/runs?head_sha={head}&event=pull_request&per_page=100")
    require(isinstance(rows, dict) and type(rows.get("total_count")) is int
            and rows["total_count"] <= 100
            and len(rows.get("workflow_runs", [])) == rows["total_count"],
            "incomplete exact-SHA evidence workflow history")
    runs = [r for r in rows["workflow_runs"] if r.get("name") == RUN_NAME
            and r.get("path") == WORKFLOW and r.get("head_sha") == head
            and r.get("event") == "pull_request"]
    require(bool(runs), "trusted exact-SHA evidence workflow is missing")
    chosen = max(runs, key=lambda r: r["id"])
    require(chosen.get("status") == "completed" and chosen.get("conclusion") == "success",
            "newest exact-SHA evidence workflow failed or is not complete")
    require(any(row.get("number") == number for row in chosen.get("pull_requests", [])),
            "exact-SHA evidence workflow belongs to another PR")
    listing = api(f"/repos/{repo}/actions/runs/{chosen['id']}/artifacts?per_page=100")
    require(listing.get("total_count") == len(listing.get("artifacts", [])),
            "artifact list incomplete")
    matches = [r for r in listing["artifacts"] if r.get("name") == ARTIFACT_PREFIX + head
               and not r.get("expired")]
    require(len(matches) == 1, "exact-SHA evidence artifact missing or ambiguous")
    artifact = matches[0]
    raw = artifact_zip(repo, artifact["id"])
    require(artifact.get("digest") == "sha256:" + digest(raw),
            "GitHub artifact digest is not authenticated")
    facts, cases, cert = consume_zip(raw)
    require(facts.get("repository") == repo and facts.get("pull_request") == number
            and facts.get("base_sha") == base and facts.get("head_sha") == head
            and facts.get("material_head_sha") == material
            and facts.get("certificate_sha256") == certificate_digest,
            "artifact does not belong to exact PR, material or handoff")
    check_run_result = api(f"/repos/{repo}/commits/{head}/check-runs?per_page=100")
    require(isinstance(check_run_result.get("check_runs"), list), "check run inventory missing")
    delivery = [c for c in check_run_result["check_runs"] if c.get("name") == "Delivery V2 gate"
                and c.get("head_sha") == head and (c.get("app") or {}).get("id") == 15368]
    require(bool(delivery) and max(delivery, key=lambda c: c["id"]).get("conclusion") == "success",
            "trusted Delivery V2 gate did not pass on published HEAD")
    return ({"artifact_id": artifact["id"], "artifact_digest": artifact["digest"],
             "certified_at": chosen["updated_at"],
             "technical_check_ids": [max(delivery, key=lambda c: c["id"])["id"]],
             "junit_sha256": facts["junit_sha256"], "passed_test_count": len(cases)}, cases)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--junit", type=Path, required=True)
    parser.add_argument("--certificate", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--repo", required=True)
    parser.add_argument("--pr", type=int, required=True)
    parser.add_argument("--base", required=True)
    parser.add_argument("--head", required=True)
    args = parser.parse_args()
    try:
        write_evidence(args.junit, args.certificate, args.out, args.repo, args.pr,
                       args.base, args.head)
    except (ValueError, OSError, json.JSONDecodeError, ElementTree.ParseError) as exc:
        print(f"BLOCK: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 2
    print("Evidence built without approval; review must be conducted in a separate context")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
