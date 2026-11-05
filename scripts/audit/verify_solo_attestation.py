#!/usr/bin/env python3
"""SolverFin adapter for the pinned official Skill solo Ed25519 audit gate.

Only the protected SolverFin workflow and pinned Skill sources are executed.
Candidate branches, issue contents and comments are untrusted data.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from contextlib import suppress
from pathlib import Path
from urllib.parse import urlsplit
from typing import Any, Callable

SKILL_SHA = "a28be10db466631cd5e5e4dbe0429da250cd8b42"
WORKFLOW = ".github/workflows/solo-audit-attestation.yml"
SOURCES = (WORKFLOW, "scripts/audit/verify_solo_attestation.py")
CI_WORKFLOW = ".github/workflows/delivery-v2-ci.yml"
CI_WORKFLOW_NAME = "Repository CI"
CI_JOB_NAME = "Delivery V2 gate"
ACTIONS_APP_ID = 15368
SHA_RE = re.compile(r"[a-f0-9]{40}\Z")
RUN_JOB_RE = re.compile(r"/actions/runs/([1-9][0-9]*)/job/([1-9][0-9]*)\Z")


def require(condition: bool, reason: str) -> None:
    if not condition:
        raise ValueError(reason)


def check_identity(identity: dict[str, Any]) -> None:
    require(type(identity.get("pull_request")) is int and identity["pull_request"] > 0,
            "invalid target PR")
    require(identity.get("base_ref") in {"develop", "main"}, "invalid target base")
    for field in ("head_sha", "base_sha", "merge_preview_sha"):
        require(isinstance(identity.get(field), str) and SHA_RE.fullmatch(identity[field]) is not None,
                "invalid exact target SHA")


def job_from_url(url: object, repository: str) -> tuple[int, int]:
    require(isinstance(url, str), "CI job URL missing")
    parsed = urlsplit(url)
    require(parsed.scheme == "https" and parsed.hostname == "github.com"
            and parsed.port is None and parsed.username is None and parsed.password is None
            and not parsed.query and not parsed.fragment, "CI job URL must be a canonical GitHub URL")
    match = RUN_JOB_RE.fullmatch(parsed.path.removeprefix("/" + repository))
    require(parsed.path.startswith("/" + repository + "/") and match is not None,
            "CI job URL does not bind the repository and run")
    return int(match.group(1)), int(match.group(2))


def validate_delivery_gate(
    repo: str,
    identity: dict[str, Any],
    checks: list[dict[str, Any]],
    api: Callable[[str], dict[str, Any]],
) -> int:
    """Prove one successful Actions job belongs to this PR, HEAD, base and workflow."""
    check_identity(identity)
    require(isinstance(checks, list), "check-run inventory missing")
    matches = [item for item in checks if item.get("name") == CI_JOB_NAME
               and item.get("head_sha") == identity["head_sha"]
               and (item.get("app") or {}).get("id") == ACTIONS_APP_ID]
    # Never arbitrarily adopt an older green run after re-runs or base changes.
    require(bool(matches), "trusted delivery gate check is missing")
    require(all(type(item.get("id")) is int and item["id"] > 0 for item in matches),
            "delivery check inventory contains an invalid ID")
    # Re-runs may create several check runs for one SHA. Only the newest is authoritative.
    require(len({item["id"] for item in matches}) == len(matches),
            "delivery check inventory has duplicate IDs")
    check = max(matches, key=lambda item: item["id"])
    require(type(check.get("id")) is int and check["id"] > 0,
            "delivery check ID unavailable")
    require(check.get("status") == "completed" and check.get("conclusion") == "success",
            "delivery gate is not terminally successful")
    run_id, job_id = job_from_url(check.get("details_url"), repo)
    job = api(f"/repos/{repo}/actions/jobs/{job_id}")
    require(isinstance(job, dict) and job.get("id") == job_id and job.get("run_id") == run_id
            and job.get("name") == CI_JOB_NAME
            and job.get("status") == "completed" and job.get("conclusion") == "success"
            and job.get("head_sha") == identity["head_sha"],
            "delivery job does not bind the exact HEAD")
    require(job.get("check_run_url") == f"https://api.github.com/repos/{repo}/check-runs/{check['id']}",
            "delivery job is not bound to the selected Check Run")
    run = api(f"/repos/{repo}/actions/runs/{run_id}")
    require(isinstance(run, dict) and run.get("id") == run_id
            and run.get("event") == "pull_request"
            and run.get("status") == "completed" and run.get("conclusion") == "success"
            and run.get("head_sha") == identity["head_sha"]
            and run.get("name") == CI_WORKFLOW_NAME
            and isinstance(run.get("path"), str)
            and run["path"].split("@", 1)[0] == CI_WORKFLOW
            and (run.get("head_repository") or {}).get("full_name") == repo,
            "delivery workflow run is not an exact-HEAD repository CI run")
    linked = run.get("pull_requests")
    require(isinstance(linked, list) and any(
        type(pr.get("number")) is int and pr["number"] == identity["pull_request"]
        and (pr.get("base") or {}).get("ref") == identity["base_ref"]
        and (pr.get("base") or {}).get("sha") == identity["base_sha"]
        and (pr.get("head") or {}).get("sha") == identity["head_sha"]
        for pr in linked if isinstance(pr, dict)
    ), "delivery workflow run is not linked to the current PR/base/HEAD")
    workflow = api(f"/repos/{repo}/actions/workflows/delivery-v2-ci.yml")
    require(isinstance(workflow, dict) and run.get("workflow_id") == workflow.get("id")
            and workflow.get("path") == CI_WORKFLOW,
            "delivery workflow identity differs from the trusted CI workflow")
    return check["id"]


def evidence_ids(repo: str, identity: dict[str, Any], official: Any) -> list[int]:
    checks = official.session.pages(
        repo, f"commits/{identity['head_sha']}/check-runs?filter=all", field="check_runs"
    )
    gate_id = validate_delivery_gate(repo, identity, checks, official.session.api)
    reviews = official.github.page_all(repo, f"pulls/{identity['pull_request']}/reviews",
                                       official.github.github_token())
    active = official.checks.latest_reviews(reviews)
    require(not any(review.get("state") == "CHANGES_REQUESTED" for review in active.values()),
            "an outstanding change request blocks solo attestation")
    return [gate_id]


def git_sha(root: Path) -> str:
    result = subprocess.run(["git", "rev-parse", "HEAD"], cwd=root,
                            capture_output=True, text=True, timeout=15, check=False)
    require(result.returncode == 0 and SHA_RE.fullmatch(result.stdout.strip()) is not None,
            "trusted checkout commit is unavailable")
    return result.stdout.strip()


def source_state(repo: str, base_sha: str, workflow_sha: str,
                 root: Path, skill_root: Path, official: Any) -> dict[str, Any]:
    require(os.getenv("GITHUB_WORKFLOW_SHA") == workflow_sha, "workflow SHA not authenticated")
    require(os.getenv("GITHUB_REF_PROTECTED") == "true", "workflow ref is not protected")
    ref = os.getenv("GITHUB_WORKFLOW_REF", "")
    require(ref in {f"{repo}/{WORKFLOW}@refs/heads/develop",
                    f"{repo}/{WORKFLOW}@refs/heads/main"},
            "workflow source is not a protected branch")
    require(git_sha(root) == workflow_sha, "SolverFin checkout differs from workflow SHA")
    require(git_sha(skill_root) == SKILL_SHA, "official Skill checkout differs from immutable pin")
    files = []
    for path in SOURCES:
        local = root / path
        require(local.is_file() and not local.is_symlink(), "trusted SolverFin source is not a regular file")
        local_data = local.read_bytes()
        remote_data, blob_sha = official.session.content(repo, path, base_sha)
        require(local_data == remote_data, "trusted SolverFin source differs from protected PR base")
        files.append({"path": path, "blob_sha": blob_sha,
                      "sha256": hashlib.sha256(local_data).hexdigest()})
    # Require an authenticated default-branch anchor as in the official Skill gate.
    main_sha = official.source.default_branch_head(repo)
    return {"workflow_sha": workflow_sha, "skill_sha": SKILL_SHA,
            "base_sha": base_sha, "default_branch_sha": main_sha,
            "files_sha256": hashlib.sha256(official.session.canonical(files)).hexdigest()}


def recheck_source(repo: str, source: dict[str, Any], root: Path,
                   skill_root: Path, official: Any) -> None:
    require(git_sha(root) == source["workflow_sha"] and git_sha(skill_root) == source["skill_sha"],
            "trusted checkout moved during revalidation")
    require(official.source.default_branch_head(repo) == source["default_branch_sha"],
            "trusted default branch moved during revalidation")
    files = []
    for path in SOURCES:
        local = root / path
        require(local.is_file() and not local.is_symlink(), "trusted source disappeared")
        data, blob = official.session.content(repo, path, source["base_sha"])
        require(data == local.read_bytes(), "protected source changed during revalidation")
        files.append({"path": path, "blob_sha": blob,
                      "sha256": hashlib.sha256(data).hexdigest()})
    require(hashlib.sha256(official.session.canonical(files)).hexdigest() == source["files_sha256"],
            "trusted source inventory changed")


def load_official(skill_root: Path) -> Any:
    require(skill_root.is_dir() and not skill_root.is_symlink(), "official Skill checkout missing")
    sys.path.insert(0, str(skill_root / "scripts"))
    import solo_audit_check_runs as checks
    import solo_audit_events as events
    import solo_audit_github as github
    import solo_audit_source as source
    import verify_session_review as session
    import verify_solo_audit_attestation as gate
    from types import SimpleNamespace
    return SimpleNamespace(checks=checks, events=events, github=github,
                           source=source, session=session, gate=gate)


def evaluate(repo: str, number: int, issue: int | None, workflow_sha: str,
             run_id: str, root: Path, skill_root: Path, official: Any) -> int:
    check_id = None
    head = ""
    identity = None
    receipt: dict[str, Any] = {"schema_version": 1, "assurance_mode": "single-operator-separate-context",
                               "third_party_human_approval_claimed": False, "pull_request": number}
    try:
        initial = official.session.api(f"/repos/{repo}/pulls/{number}")
        head = (initial.get("head") or {}).get("sha", "")
        require(isinstance(head, str) and SHA_RE.fullmatch(head) is not None,
                "PR HEAD is malformed")
        check_id = official.checks.begin_check(repo, head, number, run_id)
        identity, _ = official.github.current_target(repo, number, issue, pr=initial)
        require(identity["head_sha"] == head, "PR HEAD moved during evaluation")
        official.github.require_unique_open_pr_head(repo, number, head)
        receipt.update({name: identity[name] for name in (
            "issue", "base_ref", "base_sha", "head_sha", "merge_preview_sha", "issue_body_sha256")})
        config = official.github.load_config(repo)
        source = source_state(repo, identity["base_sha"], workflow_sha, root, skill_root, official)
        selected, report, raw = official.github.report_comment(repo, number, config)
        require(report.get("issue") == identity["issue"] and report.get("pull_request") == number,
                "signed report target differs from current PR")
        receipt["report_sha256"] = official.github.validate_signed_report(repo, identity, config,
                                                                          selected, raw)
        required_ids = evidence_ids(repo, identity, official)
        receipt["configuration_fingerprint"] = config.fingerprint
        receipt["required_check_ids"] = required_ids

        def revalidate() -> None:
            require(evidence_ids(repo, identity, official) == required_ids,
                    "exact-HEAD CI evidence changed")
            recheck_source(repo, source, root, skill_root, official)
            latest, _ = official.github.current_target(repo, number, identity["issue"])
            require(latest == identity, "PR, issue, base or HEAD changed")
            updated_config = official.github.load_config(repo)
            require(updated_config.fingerprint == config.fingerprint, "trusted key or opt-in changed")
            updated, updated_report, updated_raw = official.github.report_comment(repo, number, updated_config)
            require(updated["snapshot"] == selected["snapshot"] and updated_raw == raw,
                    "signed comment changed")
            require(updated_report.get("issue") == identity["issue"]
                    and updated_report.get("pull_request") == number,
                    "signed report target changed")
            official.gate._recheck_comment(repo, number, selected, updated_config)
            user = updated["comment"]["user"]["login"]
            require(official.github.is_authorized_reviewer(repo, user, official.github.github_token()),
                    "operator permission changed")
            official.github.require_unique_open_pr_head(repo, number, head)

        revalidate()
        official.checks.publish_check(repo, head, number, check_id, run_id,
                                      "success", receipt, identity=identity, before_patch=revalidate)
        print("READY: solo-context signed audit accepted; no third-party approval claimed")
        return 0
    except Exception as exc:
        receipt["blocker"] = type(exc).__name__
        if isinstance(head, str) and SHA_RE.fullmatch(head) is not None:
            with suppress(Exception):
                official.checks.publish_check(repo, head, number, check_id, run_id,
                                              "failure", receipt, identity=identity)
        print(f"BLOCK: SolverFin solo attestation failed ({type(exc).__name__})", file=sys.stderr)
        return 2


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repository", required=True)
    parser.add_argument("--event", type=Path, required=True)
    parser.add_argument("--trusted-root", type=Path, required=True)
    parser.add_argument("--skill-root", type=Path, required=True)
    parser.add_argument("--workflow-sha", required=True)
    parser.add_argument("--run-id", required=True)
    args = parser.parse_args()
    try:
        official = load_official(args.skill_root.resolve())
        official.gate.verify_runtime_context(args.repository, args.workflow_sha, args.run_id,
                                              os.getenv("GITHUB_EVENT_NAME", ""))
        require(git_sha(args.skill_root.resolve()) == SKILL_SHA, "official Skill pin mismatch")
        data = args.event.read_bytes()
        require(len(data) <= 5 * 1024 * 1024, "event exceeds size limit")
        event = json.loads(data)
        targets = official.events.resolve_targets(args.repository, event,
                                                  os.getenv("GITHUB_EVENT_NAME", ""))
        if not targets:
            print("No eligible open PRs for this event")
            return 0
        results = [evaluate(args.repository, pr, issue, args.workflow_sha, args.run_id,
                            args.trusted_root.resolve(), args.skill_root.resolve(), official)
                   for pr, issue in targets]
        return 0 if all(result == 0 for result in results) else 2
    except Exception as exc:
        print(f"BLOCK: SolverFin solo attestation controller rejected event ({type(exc).__name__})",
              file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
