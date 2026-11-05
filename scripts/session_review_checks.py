#!/usr/bin/env python3
"""Review journal and fail-closed GitHub Check Run writer (trusted base only)."""
from __future__ import annotations

import json
import re
import subprocess

import prepare_session_review_packet as collector
from session_review import CHECK_NAME, canonical, require, strict_json

def write_api(path: str, method: str, payload: dict) -> dict:
    require(method in {"POST", "PATCH"}
            and re.fullmatch(r"/repos/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/check-runs(?:/[1-9][0-9]*)?", path)
            and ((method == "POST" and path.endswith("/check-runs"))
                 or (method == "PATCH" and not path.endswith("/check-runs"))),
            "unauthorized GitHub mutation endpoint")
    command = ["gh", "api", "--method", method, path, "--input", "-"]
    proc = subprocess.run(command, input=canonical(payload), capture_output=True,
                          check=False, timeout=90)
    require(proc.returncode == 0 and len(proc.stdout) <= 1024 * 1024,
            f"GitHub {method} Check Run request failed")
    return json.loads(proc.stdout)


def paged(repo: str, endpoint: str, *, field: str | None = None) -> list[dict]:
    rows = []
    expected_total = None
    for page in range(1, 26):
        sep = "&" if "?" in endpoint else "?"
        obj = collector.api(f"/repos/{repo}/{endpoint}{sep}per_page=100&page={page}")
        if field:
            total = obj.get("total_count") if isinstance(obj, dict) else None
            require(type(total) is int and total >= 0
                    and (expected_total is None or expected_total == total),
                    "GitHub inventory changed during pagination")
            expected_total, obj = total, obj.get(field)
        require(isinstance(obj, list) and all(isinstance(x, dict) for x in obj),
                "GitHub inventory contains invalid rows")
        rows.extend(obj)
        require(len(rows) <= 2500, "GitHub inventory exceeds review budget")
        if expected_total is not None:
            require(len(rows) <= expected_total, "GitHub inventory includes duplicate pages")
            if len(rows) == expected_total:
                return rows
        if len(obj) < 100:
            require(expected_total is None, "GitHub inventory truncated")
            return rows
    raise ValueError("GitHub inventory pagination incomplete")


def begin_check(repo: str, head: str, number: int, run_id: str) -> int:
    # Create a new in-progress instance before reading reviewer-controlled data.
    # Even if older checks were successful, the latest check is now fail-closed.
    result = write_api(f"/repos/{repo}/check-runs", "POST", {
        "name": CHECK_NAME, "head_sha": head, "status": "in_progress",
        "external_id": f"solverfin:pr:{number}:run:{run_id}",
        "details_url": f"https://github.com/{repo}/actions/runs/{run_id}",
        "output": {"title": "Review revalidation started",
                   "summary": "Approval is withheld until evidence and separate-session attestation are verified."},
    })
    require(result.get("head_sha") == head and result.get("name") == CHECK_NAME
            and type(result.get("id")) is int and result.get("status") != "completed",
            "unable to establish a fail-closed review Check Run")
    return result["id"]


def finish_check(repo: str, head: str, check_id: int, run_id: str, receipt: dict,
                 success: bool, message: str) -> None:
    current = collector.api(f"/repos/{repo}/check-runs/{check_id}")
    require(current.get("id") == check_id and current.get("head_sha") == head
            and current.get("name") == CHECK_NAME
            and (current.get("app") or {}).get("id") == 15368,
            "Check Run was replaced or is not published by GitHub Actions")
    result = write_api(f"/repos/{repo}/check-runs/{check_id}", "PATCH", {
        "name": CHECK_NAME, "status": "completed",
        "conclusion": "success" if success else "failure",
        "external_id": receipt.get("fingerprint", "blocked"),
        "details_url": f"https://github.com/{repo}/actions/runs/{run_id}",
        "output": {"title": "Operator-attested session review",
                   "summary": message[:65000],
                   "text": json.dumps(receipt, ensure_ascii=False, sort_keys=True)[:65000]},
    })
    require(result.get("head_sha") == head and result.get("id") == check_id
            and result.get("conclusion") == ("success" if success else "failure"),
            "terminal review Check Run publication not confirmed")


def review_watermark(repo: str, head: str) -> int:
    records = paged(repo, f"commits/{head}/check-runs?check_name={CHECK_NAME}&filter=all",
                    field="check_runs")
    watermark = 0
    for record in records:
        if record.get("name") != CHECK_NAME or (record.get("app") or {}).get("id") != 15368:
            continue
        require(record.get("head_sha") == head, "review journal entry has foreign SHA")
        raw = (record.get("output") or {}).get("text") or "{}"
        # GitHub may truncate historical review data; fail closed rather than
        # reuse an old approval with an unknown revocation watermark.
        prior = strict_json(raw)
        for key in ("review_comment_id", "minimum_comment_id"):
            value = prior.get(key, 0)
            require(type(value) is int and value >= 0, "review watermark corrupted")
            watermark = max(watermark, value)
    return watermark

