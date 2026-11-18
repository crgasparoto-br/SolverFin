#!/usr/bin/env python3
"""Fail-closed, one-time recovery of six proven orphaned Ed25519 checks for PR #796.

Run only as a protected-branch GitHub Actions job with checks:write. Never claim
independent approval, never reopen checks and never trust user-supplied IDs.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys

REPOSITORY = "crgasparoto-br/SolverFin"
HEAD = "f279cb3af14e7e14d3c295f085e6e3f969f1f164"
PR = 796
WORKFLOW_ID = 408414787
CHECK_NAME = "Verify solo audit attestation (exact SHA)"
APP_ID = 15368
# Exact observed Check Run ID -> failed trusted workflow run ID. No broad search.
ORPHANS = {
    134062696828: 44090082816,
    134062938183: 44090141712,
    134064016714: 44090433659,
    134064117200: 44090481927,
    134067340580: 44091437545,
    134067878879: 44091547097,
}


def require(ok: bool, reason: str) -> None:
    if not ok:
        raise ValueError(reason)


def api(path: str, *, method: str = "GET", payload: dict | None = None) -> dict:
    require(path.startswith(f"/repos/{REPOSITORY}/"), "API path outside repository")
    require(method in {"GET", "PATCH"}, "unsupported write method")
    if method == "PATCH":
        require(re.fullmatch(rf"/repos/{re.escape(REPOSITORY)}/check-runs/[1-9][0-9]*", path)
                is not None and isinstance(payload, dict), "unsafe PATCH target")
    else:
        require(payload is None, "GET cannot carry a payload")
    command = ["gh", "api", "--method", method, path]
    if payload is not None:
        command += ["--input", "-"]
    result = subprocess.run(command, input=json.dumps(payload) if payload else None,
                            capture_output=True, text=True, check=False, timeout=40)
    require(result.returncode == 0 and len(result.stdout) <= 1024 * 1024,
            "authenticated GitHub API request failed")
    data = json.loads(result.stdout)
    require(isinstance(data, dict), "GitHub returned an invalid API object")
    return data


def validate_run(check_id: int, run_id: int, run: dict) -> None:
    require(run.get("id") == run_id and run.get("workflow_id") == WORKFLOW_ID
            and run.get("name") == "Verify solo Ed25519 audit attestation"
            and run.get("status") == "completed" and run.get("conclusion") == "failure"
            and (run.get("repository") or {}).get("full_name") == REPOSITORY
            and run.get("event") in {"pull_request_target", "workflow_run", "issue_comment"},
            f"failed trusted workflow identity unavailable for check {check_id}")


def validate_check(check_id: int, run_id: int, check: dict) -> None:
    expected_external_id = f"sa:{run_id}:p{PR}:{HEAD}"
    urls = {f"https://github.com/{REPOSITORY}/actions/runs/{run_id}",
            f"https://github.com/{REPOSITORY}/runs/{check_id}"}
    require(check.get("id") == check_id and check.get("name") == CHECK_NAME
            and check.get("head_sha") == HEAD and (check.get("app") or {}).get("id") == APP_ID
            and check.get("external_id") == expected_external_id
            and check.get("details_url") in urls,
            f"orphaned Check Run {check_id} is not the expected trusted target")
    require((check.get("status") == "in_progress" and check.get("conclusion") is None)
            or (check.get("status") == "completed" and check.get("conclusion") == "failure"),
            f"orphaned Check Run {check_id} is neither pending nor safely failed")


def recover_one(check_id: int, run_id: int) -> str:
    check_path = f"/repos/{REPOSITORY}/check-runs/{check_id}"
    check = api(check_path)
    validate_check(check_id, run_id, check)
    if check["status"] == "completed":
        return "already failed"
    run = api(f"/repos/{REPOSITORY}/actions/runs/{run_id}")
    validate_run(check_id, run_id, run)
    # Re-read live ownership and status immediately before PATCH.
    check = api(check_path)
    validate_check(check_id, run_id, check)
    if check["status"] == "completed":
        return "already failed"
    patched = api(check_path, method="PATCH", payload={
        "name": CHECK_NAME,
        "status": "completed",
        "conclusion": "failure",
        "external_id": check["external_id"],
        "details_url": check["details_url"],
        "output": {
            "title": "Legacy solo-context audit blocked",
            "summary": "Recovery of an orphaned Check Run after its exact trusted Actions run failed. No approval claimed.",
            "text": json.dumps({"repository": REPOSITORY, "pull_request": PR, "head_sha": HEAD,
                                "check_id": check_id, "failed_actions_run_id": run_id,
                                "recovery": "terminal failure only"}, sort_keys=True),
        },
    })
    validate_check(check_id, run_id, patched)
    require(patched.get("status") == "completed" and patched.get("conclusion") == "failure",
            "GitHub did not confirm terminal failure")
    return "recovered as failure"


def main() -> int:
    require(os.getenv("GITHUB_REPOSITORY") == REPOSITORY
            and os.getenv("GITHUB_REF") == "refs/heads/develop"
            and os.getenv("GITHUB_REF_PROTECTED") == "true",
            "recovery requires the protected develop branch")
    statuses = {}
    for check_id, run_id in ORPHANS.items():
        statuses[check_id] = recover_one(check_id, run_id)
    print(json.dumps(statuses, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, RuntimeError) as exc:
        print(f"BLOCK: legacy solo check recovery rejected ({type(exc).__name__})", file=sys.stderr)
        raise SystemExit(2) from exc
