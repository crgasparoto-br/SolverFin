#!/usr/bin/env python3
"""Trusted exact-SHA session-review Check Run verifier for SolverFin.

This script must run from protected base/default code with checks:write. It
never checks out, imports or executes candidate Python/Node code. A successful
unit/CI run, a handoff, or a comment alone is never an approval.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

import prepare_session_review_packet as collector
import session_review_evidence as evidence
import session_review_github as facts
from session_review_checks import begin_check, finish_check, paged, review_watermark
from session_review import (
    ASSURANCE, POLICY_PATH, PREFIX, PROVENANCE_TYPE, allowed,
    canonical, digest, latest_review, require, review_snapshot, strict_json,
    validate_policy, verify_review,
)

ROOT = Path(__file__).resolve().parents[1]
TRUSTED_PATHS = (
    ".github/workflows/session-review.yml",
    ".github/workflows/session-review-evidence.yml",
    POLICY_PATH,
    "scripts/session_review.py",
    "scripts/session_review_specification.py",
    "scripts/session_review_github.py",
    "scripts/prepare_session_review_packet.py",
    "scripts/session_review_evidence.py",
    "scripts/session_review_checks.py",
    "scripts/verify_session_review.py",
)




def trusted_policy_and_code(repo: str, base_sha: str) -> tuple[dict, bytes]:
    repository = collector.api(f"/repos/{repo}")
    default = repository.get("default_branch")
    require(isinstance(default, str) and bool(default), "default branch unavailable")
    default_branch = collector.api(f"/repos/{repo}/branches/{default}")
    default_sha = (default_branch.get("commit") or {}).get("sha")
    require(isinstance(default_sha, str) and bool(collector.SHA_RE.fullmatch(default_sha)),
            "default branch SHA unavailable")
    for path in TRUSTED_PATHS:
        base_text, _ = collector.file_at(repo, path, base_sha)
        default_text, _ = collector.file_at(repo, path, default_sha)
        require(base_text == default_text == (ROOT / path).read_text(encoding="utf-8"),
                "trusted runner, default and protected base source differ: " + path)
    raw = (ROOT / POLICY_PATH).read_bytes()
    policy = strict_json(raw.decode())
    validate_policy(policy)
    return policy, raw


def authenticate_operator(repo: str, user: dict) -> None:
    repository = collector.api(f"/repos/{repo}")
    owner = repository.get("owner") or {}
    require(owner.get("type") == "User" and owner.get("id") == user.get("id")
            and str(owner.get("login", "")).casefold() == str(user.get("login", "")).casefold(),
            "reviewer is not the authenticated owner; no external identity is claimed")


def same_head_not_shared(repo: str, number: int, head: str) -> None:
    prs = paged(repo, f"commits/{head}/pulls")
    active = [p for p in prs if p.get("state") == "open" and p.get("head", {}).get("sha") == head]
    require(len(active) == 1 and active[0].get("number") == number,
            "more than one open PR shares this commit; Check Runs are not per-PR")




def event_watermark(policy: dict) -> int:
    event_path = os.environ.get("GITHUB_EVENT_PATH")
    if not event_path:
        return 0
    event = strict_json(Path(event_path).read_text(encoding="utf-8"))
    if event.get("action") not in {"edited", "deleted"}:
        return 0
    comment = event.get("comment") or {}
    prior_body = (event.get("changes", {}).get("body") or {}).get("from")
    marker = str(comment.get("body") or "").startswith(PREFIX) or str(prior_body or "").startswith(PREFIX)
    if marker and allowed(comment, policy) and type(comment.get("id")) is int:
        return comment["id"] + 1
    return 0


def live_identity(repo: str, number: int, issue_number: int, policy_raw: bytes) -> dict:
    pr = collector.api(f"/repos/{repo}/pulls/{number}")
    issue = collector.api(f"/repos/{repo}/issues/{issue_number}")
    require(pr.get("state") == "open" and pr.get("draft") is False,
            "only a ready PR can be approved")
    require(pr.get("head", {}).get("repo", {}).get("full_name") == repo
            and pr.get("base", {}).get("repo", {}).get("full_name") == repo,
            "cross-repository PR not accepted")
    require(collector.issue_reference(pr) == issue_number, "canonical issue changed")
    identity = {"repository": repo, "pull_request": number, "issue": issue_number,
                "base_ref": pr["base"]["ref"], "base_sha": pr["base"]["sha"],
                "head_sha": pr["head"]["sha"], "merge_preview_sha": pr.get("merge_commit_sha"),
                "issue_sha256": digest(issue["body"].encode()),
                "policy_sha256": digest(policy_raw)}
    require(identity["base_ref"] in {"develop", "main"}
            and all(isinstance(identity[k], str) and collector.SHA_RE.fullmatch(identity[k])
                    for k in ("base_sha", "head_sha", "merge_preview_sha")),
            "PR identity incomplete")
    return identity


def reconcile(packet: dict, current: dict) -> None:
    facts.reconcile_target(packet, current,
                           lambda identity: facts.authenticated_certificate_event(identity, collector.api),
                           lambda identity, certified: facts.authenticated_preview_reconciliation(
                               identity, certified, collector.api))


def prepare(repo: str, number: int, issue_number: int, initial: dict) -> tuple[dict, dict, set[str]]:
    policy, raw = trusted_policy_and_code(repo, initial["base_sha"])
    require(digest(raw) == initial["policy_sha256"], "policy changed during review")
    # A pull_request workflow can read an untrusted HEAD. Its YAML must be
    # unchanged from protected base or its JUnit could be fabricated.
    candidate_workflow, _ = collector.file_at(
        repo, evidence.WORKFLOW, initial["head_sha"])
    require(candidate_workflow == (ROOT / evidence.WORKFLOW).read_text(encoding="utf-8"),
            "candidate modified trusted evidence workflow")
    native = collector.collect(repo, number)
    ident = native["identity"]
    require(ident == initial and ident["issue"] == issue_number,
            "issue, PR, policy, base, HEAD or preview changed during collection")
    handoff = native["handoff"]
    visual_required = any(path.startswith(("head/apps/web/", "head/docs/GOLDEN_STATEMENT.md",
                                                "head/docs/adr/0018-golden-statement"))
                          for path in native["files"])
    metadata, passed = evidence.collect_verified(
        repo, number, ident["base_sha"], ident["head_sha"],
        handoff["material_head_sha"], handoff["certificate_sha256"],
        visual_required=visual_required)
    packet = {"identity": ident, "requirements": native["requirements"],
              "artifact_id": metadata["artifact_id"],
              "artifact_digest": metadata["artifact_digest"],
              "technical_check_ids": metadata["technical_check_ids"],
              "certified_at": metadata["certified_at"],
              "passed_tests": sorted(passed),
              "merge_preview_reconciliation": {
                  "certified_sha": ident["merge_preview_sha"],
                  "current_sha": ident["merge_preview_sha"], "mode": "exact"},
              "certification_event_sha256": digest(canonical(native["merge_preview"])),
              "sources": native["files"]}
    if policy.get("implementation_provenance") == {"mode": "enabled", "type": PROVENANCE_TYPE}:
        packet["implementation_provenance"] = facts.authenticated_implementation_provenance(
            ident, packet, paged, collector.api)
    return packet, policy, passed


def evaluate(repo: str, number: int, issue_number: int, run_id: str) -> int:
    pr = collector.api(f"/repos/{repo}/pulls/{number}")
    head = (pr.get("head") or {}).get("sha")
    require(isinstance(head, str) and collector.SHA_RE.fullmatch(head), "PR HEAD missing")
    watermark = review_watermark(repo, head)
    check_id = begin_check(repo, head, number, run_id)
    receipt = {"minimum_comment_id": watermark, "third_party_identity_proven": False,
               "assurance": ASSURANCE, "identity": {"repository": repo, "pull_request": number,
                                                   "head_sha": head}}
    try:
        require(type(issue_number) is int and issue_number > 0, "unambiguous canonical issue required")
        initial_policy_text, _ = collector.file_at(repo, POLICY_PATH, pr["base"]["sha"])
        initial = live_identity(repo, number, issue_number, initial_policy_text.encode())
        require(initial["head_sha"] == head, "PR changed after review check began")
        same_head_not_shared(repo, number, head)
        packet, policy, passed = prepare(repo, number, issue_number, initial)
        receipt["minimum_comment_id"] = max(watermark, event_watermark(policy))
        comments = paged(repo, f"issues/{number}/comments")
        selected = latest_review(comments, policy, watermark=receipt["minimum_comment_id"])
        snap = review_snapshot(selected, repo, number)
        authenticate_operator(repo, selected["user"])
        valid = verify_review(selected, packet, policy, packet["sources"], passed)
        receipt.update(valid)
        # Inputs are mutable. Rebuild all authority and inspect the latest
        # comment again before allowing the terminal Check Run to succeed.
        current = live_identity(repo, number, issue_number, (ROOT / POLICY_PATH).read_bytes())
        reconcile(packet, current)
        latest = collector.api(f"/repos/{repo}/issues/comments/{selected['id']}")
        require(review_snapshot(latest, repo, number) == snap, "review edited or deleted")
        selected_again = latest_review(paged(repo, f"issues/{number}/comments"), policy,
                                       watermark=selected["id"])
        require(review_snapshot(selected_again, repo, number) == snap,
                "review superseded or revoked")
        same_head_not_shared(repo, number, head)
        # Recheck the current technical gate and artifact identity. No cached
        # success is permitted after a new failing run or a changed artifact.
        fresh, _ = evidence.collect_verified(
            repo, number, current["base_sha"], current["head_sha"],
            native_material(packet, repo, number),
            collector.file_at(repo, ".audit/entregar-issue/handoff-ready.json", head)[1],
            visual_required=any(path.startswith(("head/apps/web/", "head/docs/GOLDEN_STATEMENT.md",
                                                 "head/docs/adr/0018-golden-statement"))
                                for path in packet["sources"]))
        require(fresh["artifact_digest"] == packet["artifact_digest"]
                and fresh["artifact_id"] == packet["artifact_id"],
                "technical audit evidence changed")
        rechecked_policy, rechecked_raw = trusted_policy_and_code(repo, current["base_sha"])
        require(rechecked_policy == policy and digest(rechecked_raw) == current["policy_sha256"],
                "default/base trust policy changed during final revalidation")
        finish_check(repo, head, check_id, run_id, receipt, True,
                     "Exact-SHA review accepted. Separate session declared by one operator, NOT independently authenticated third party.")
        return 0
    except (ValueError, KeyError, TypeError, OSError, subprocess.SubprocessError,
            json.JSONDecodeError) as exc:
        receipt["error_class"] = type(exc).__name__
        message = f"BLOCK: {type(exc).__name__}: {exc}"
        finish_check(repo, head, check_id, run_id, receipt, False, message)
        print(message, file=sys.stderr)
        return 2


def native_material(packet: dict, repo: str, number: int) -> str:
    cert = collector.inspect_handoff(repo, number, packet["identity"]["base_sha"],
                                     packet["identity"]["head_sha"])
    return cert["material_head_sha"]


def targets(repo: str, event: dict) -> list[tuple[int, int]]:
    require((event.get("repository") or {}).get("full_name") == repo, "event repository mismatch")
    if isinstance(event.get("pull_request"), dict):
        prs = [event["pull_request"]["number"]]
    elif isinstance(event.get("issue"), dict) and event["issue"].get("pull_request"):
        comment = event.get("comment") or {}
        if event.get("action") == "created" and not str(comment.get("body") or "").startswith(PREFIX):
            return []
        prs = [event["issue"]["number"]]
    elif isinstance(event.get("workflow_run"), dict):
        run = event["workflow_run"]
        if run.get("event") != "pull_request":
            return []
        prs = [p["number"] for p in run.get("pull_requests", [])]
        if not prs:
            prs = [p["number"] for p in paged(repo, f"commits/{run['head_sha']}/pulls")]
    else:
        prs = [p["number"] for p in paged(repo, "pulls?state=open")]
    result = []
    for number in sorted(set(prs)):
        pr = collector.api(f"/repos/{repo}/pulls/{number}")
        if pr.get("state") != "open" or pr.get("base", {}).get("ref") not in {"develop", "main"}:
            continue
        try:
            issue = collector.issue_reference(pr)
        except ValueError:
            issue = 0  # Keep target to revoke any earlier success on an ambiguous issue.
        if isinstance(event.get("issue"), dict) and not event["issue"].get("pull_request"):
            if issue != event["issue"].get("number"):
                continue
        result.append((number, issue))
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", required=True)
    parser.add_argument("--event", type=Path, required=True)
    args = parser.parse_args()
    require(re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", args.repo) is not None,
            "unexpected repository")
    run_id = os.environ.get("GITHUB_RUN_ID", "")
    require(run_id.isdecimal(), "trusted Actions run id is required")
    try:
        event = strict_json(args.event.read_text(encoding="utf-8"))
        selected = targets(args.repo, event)
        return max((evaluate(args.repo, number, issue, run_id) for number, issue in selected), default=0)
    except (ValueError, KeyError, TypeError) as exc:
        print(f"BLOCK: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
