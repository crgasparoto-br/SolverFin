#!/usr/bin/env python3
"""Authenticate a handoff certificate through a trusted exact-SHA Actions run.

Self-consistent candidate hashes cannot prove who certified the handoff.
The trusted producer runs the pinned official Skill validator without executing
candidate scripts or granting mutation permissions.
"""
from __future__ import annotations

import argparse
import io
import json
import os
import stat
import subprocess
import sys
import zipfile
from pathlib import Path

from session_review import digest, require, strict_json

WORKFLOW = ".github/workflows/session-review-certificate.yml"
RUN_NAME = "Verify certified handoff provenance"
ARTIFACT_PREFIX = "trusted-session-handoff-"
ATTESTATION_NAME = "session-review-handoff-attestation.json"
TRUSTED_PATHS = (WORKFLOW, "scripts/prepare_session_review_packet.py",
                 "scripts/session_review_packet_handoff.py", "scripts/session_review_certificate.py")


def artifact_zip(repo: str, artifact_id: int) -> bytes:
    require(type(artifact_id) is int and artifact_id > 0, "invalid artifact ID")
    result = subprocess.run(
        ["gh", "api", "--method", "GET",
         f"/repos/{repo}/actions/artifacts/{artifact_id}/zip"],
        capture_output=True, check=False, timeout=90)
    require(result.returncode == 0 and len(result.stdout) <= 2 * 1024 * 1024,
            "authenticated certificate artifact unavailable or oversized")
    return result.stdout


def parse_artifact(raw: bytes) -> dict:
    require(len(raw) <= 2 * 1024 * 1024, "oversized producer attestation")
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        files = archive.infolist()
        require(len(files) == 1 and files[0].filename == ATTESTATION_NAME
                and files[0].file_size <= 4096
                and not stat.S_ISLNK(files[0].external_attr >> 16),
                "certificate attestation ZIP contains foreign or unsafe paths")
        data = archive.read(files[0])
    return strict_json(data.decode("utf-8"))


def verify_attestation(repo: str, pr: int, base: str, head: str,
                       material: str, certificate_sha256: str,
                       *, api, file_at, download=artifact_zip) -> dict:
    repository = api(f"/repos/{repo}")
    default = repository.get("default_branch")
    require(isinstance(default, str) and bool(default), "default branch unavailable")
    branch = api(f"/repos/{repo}/branches/{default}")
    default_sha = (branch.get("commit") or {}).get("sha")
    require(isinstance(default_sha, str) and len(default_sha) == 40,
            "default-branch SHA unavailable")
    for path in TRUSTED_PATHS:
        trusted, sha = file_at(repo, path, base)
        for ref in (default_sha, head):
            actual, actual_sha = file_at(repo, path, ref)
            require(actual == trusted and actual_sha == sha,
                    "certificate producer differs from protected base: " + path)
    response = api(f"/repos/{repo}/actions/runs?head_sha={head}&event=pull_request&per_page=100")
    require(isinstance(response, dict) and type(response.get("total_count")) is int
            and response["total_count"] <= 100
            and len(response.get("workflow_runs", [])) == response["total_count"],
            "certificate producer run inventory incomplete")
    matches = [r for r in response["workflow_runs"]
               if r.get("name") == RUN_NAME and r.get("path") == WORKFLOW
               and r.get("head_sha") == head and r.get("event") == "pull_request"]
    require(bool(matches), "trusted certificate producer run missing at exact SHA")
    latest = max(matches, key=lambda r: r["id"])
    require(latest.get("status") == "completed" and latest.get("conclusion") == "success",
            "newest trusted certificate producer run was not successful")
    require(any(row.get("number") == pr for row in latest.get("pull_requests", [])),
            "trusted certificate producer run belongs to another PR")
    jobs = api(f"/repos/{repo}/actions/runs/{latest['id']}/jobs?per_page=100")
    require(isinstance(jobs, dict) and jobs.get("total_count") == len(jobs.get("jobs", []))
            and type(jobs["total_count"]) is int and jobs["total_count"] <= 100,
            "trusted producer jobs inventory incomplete")
    require(len([job for job in jobs["jobs"] if job.get("name") == "provenance"
                 and job.get("conclusion") == "success"]) == 1,
            "trusted certificate producer validator job did not pass")
    inventory = api(f"/repos/{repo}/actions/runs/{latest['id']}/artifacts?per_page=100")
    require(isinstance(inventory, dict)
            and inventory.get("total_count") == len(inventory.get("artifacts", [])),
            "certificate producer artifact inventory incomplete")
    artifacts = [a for a in inventory["artifacts"]
                 if a.get("name") == ARTIFACT_PREFIX + head and not a.get("expired")]
    require(len(artifacts) == 1, "trusted certificate artifact missing or ambiguous")
    artifact = artifacts[0]
    raw = download(repo, artifact["id"])
    require(artifact.get("digest") == "sha256:" + digest(raw),
            "certificate attestation transport digest mismatch")
    fact = parse_artifact(raw)
    expected = {"schema_version": 1, "repository": repo, "pull_request": pr,
                "base_sha": base, "head_sha": head,
                "material_head_sha": material,
                "certificate_sha256": certificate_sha256, "run_id": latest["id"]}
    require(fact == expected, "trusted certificate attestation is stale or foreign")
    return {"run_id": latest["id"], "artifact_id": artifact["id"],
            "artifact_digest": artifact["digest"]}


def produce(repo: str, pr_number: int, base: str, head: str, run_id: int,
            skill: Path, output: Path) -> None:
    import prepare_session_review_packet as collector
    import session_review_packet_handoff as handoff

    pr = collector.api(f"/repos/{repo}/pulls/{pr_number}")
    require(pr.get("state") == "open" and pr.get("base", {}).get("sha") == base
            and pr.get("head", {}).get("sha") == head
            and pr.get("base", {}).get("ref") in {"develop", "main"},
            "authenticated PR base/head changed")
    issue = collector.issue_reference(pr)
    proof = handoff.inspect_handoff(
        repo, pr_number, base, head, expected_issue=issue,
        expected_head_ref=pr["head"]["ref"], expected_base_ref=pr["base"]["ref"],
        file_at=collector.file_at, api=collector.api,
        api_json=collector.api_json, max_files=collector.MAX_FILES)
    cert = proof["certificate"]
    certificate_path = Path("candidate/.audit/entregar-issue/handoff-ready.json")
    require(certificate_path.is_file()
            and digest(certificate_path.read_bytes()) == proof["certificate_sha256"],
            "checked-out certificate does not match authenticated Git blob")
    command = [
        sys.executable,
        str(skill / "entregar-issue/scripts/validate_handoff_certificate.py"),
        "--certificate", str(certificate_path),
        "--artifacts-dir", f"candidate/.audit/entregar-issue/issue-{issue}",
        "--head-sha", head, "--base-sha", base,
        "--candidate-parent-sha", proof["material_head_sha"],
        "--repository", repo, "--issue-number", str(issue),
        "--work-item-kind", "issue", "--work-item-number", str(issue),
        "--pull-request-number", str(pr_number),
        "--base-ref", pr["base"]["ref"], "--head-ref", pr["head"]["ref"],
        "--work-item-start-sha", base,
        "--source-repository-root", "candidate",
    ]
    for path in proof["result_only_changed_paths"]:
        command.extend(("--candidate-changed-path", path))
    for path in cert["scope"]["issue_changed_paths"]:
        command.extend(("--issue-changed-path", path))
    validation = subprocess.run(command, capture_output=True, text=True, check=False, timeout=90)
    require(validation.returncode == 0,
            "official Skill certificate validation failed: " + validation.stdout[-600:])
    record = {"schema_version": 1, "repository": repo, "pull_request": pr_number,
              "base_sha": base, "head_sha": head,
              "material_head_sha": proof["material_head_sha"],
              "certificate_sha256": proof["certificate_sha256"], "run_id": run_id}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(json.dumps(record, sort_keys=True, separators=(",", ":")).encode() + b"\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", required=True)
    parser.add_argument("--pr", required=True, type=int)
    parser.add_argument("--base", required=True)
    parser.add_argument("--head", required=True)
    parser.add_argument("--skill", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    try:
        require(os.environ.get("GITHUB_ACTIONS") == "true"
                and str(os.environ.get("GITHUB_RUN_ID", "")).isdecimal(),
                "trusted GitHub Actions run identity is required")
        produce(args.repo, args.pr, args.base, args.head,
                int(os.environ["GITHUB_RUN_ID"]), args.skill, args.output)
        return 0
    except (ValueError, OSError, KeyError, TypeError, subprocess.SubprocessError) as exc:
        print(f"BLOCK: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
