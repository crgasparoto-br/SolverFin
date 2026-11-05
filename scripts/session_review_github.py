#!/usr/bin/env python3
"""Authenticated GitHub facts for session review, evaluated only by trusted code.

The caller injects the GitHub API transport; untrusted candidate code and
operator narratives cannot select the source of authority.
"""
from __future__ import annotations

import copy
import json
import os
import re
import sys
from typing import TYPE_CHECKING

from session_review import PROVENANCE_TYPE, SHA, canonical, digest, require, strict_json

if TYPE_CHECKING:
    from pathlib import Path


def authenticated_certificate_event(identity: dict, api) -> dict:
    """Rebuild the certificate event using live GitHub PR and ordered merge parents."""
    repo, number = identity["repository"], identity["pull_request"]
    pr = api(f"/repos/{repo}/pulls/{number}")
    require(isinstance(pr, dict), "malformed authenticated PR response")
    head, base = pr.get("head") or {}, pr.get("base") or {}
    require(isinstance(head, dict) and isinstance(base, dict), "malformed PR base/head")
    preview = pr.get("merge_commit_sha")
    require(pr.get("number") == number and pr.get("state") == "open" and pr.get("draft") is False
            and head.get("sha") == identity["head_sha"]
            and base.get("sha") == identity["base_sha"] and base.get("ref") == identity["base_ref"]
            and (head.get("repo") or {}).get("full_name") == repo
            and (base.get("repo") or {}).get("full_name") == repo
            and isinstance(preview, str) and re.fullmatch("[0-9a-f]{40}", preview)
            and preview == identity["merge_preview_sha"], "PR identity/preview drift")
    merge = api(f"/repos/{repo}/git/commits/{preview}")
    parents = merge.get("parents") if isinstance(merge, dict) else None
    require(isinstance(merge, dict) and merge.get("sha") == preview and isinstance(parents, list)
            and len(parents) == 2 and all(isinstance(p, dict) for p in parents)
            and [p.get("sha") for p in parents] == [identity["base_sha"], identity["head_sha"]],
            "merge preview has incorrect ordered base/HEAD parents")
    return {"repository": {"full_name": repo}, "pull_request": {
        "number": number, "title": pr.get("title") or "", "body": pr.get("body") or "",
        "merge_commit_sha": preview, "base": {"ref": identity["base_ref"], "sha": identity["base_sha"]},
        "head": {"sha": identity["head_sha"], "repo": {"full_name": repo}}}}


def authenticated_preview_reconciliation(identity: dict, certified_sha: str, api) -> dict:
    """Reconcile GitHub synthetic merges only after authenticating both Git commits."""
    current = identity["merge_preview_sha"]
    require(isinstance(certified_sha, str) and SHA.fullmatch(certified_sha)
            and isinstance(current, str) and SHA.fullmatch(current),
            "invalid certified or current merge preview identity")
    proof = {"certified_sha": certified_sha, "current_sha": current}
    if certified_sha == current:
        # The authenticated_certificate_event reader already validated parents.
        return {**proof, "mode": "exact"}

    def checked_commit(sha: str) -> str:
        obj = api(f"/repos/{identity['repository']}/git/commits/{sha}")
        parents = obj.get("parents") if isinstance(obj, dict) else None
        tree = obj.get("tree") if isinstance(obj, dict) else None
        require(isinstance(obj, dict) and obj.get("sha") == sha
                and isinstance(parents, list) and len(parents) == 2
                and all(isinstance(p, dict) for p in parents)
                and [p.get("sha") for p in parents] == [identity["base_sha"], identity["head_sha"]],
                "merge preview has incorrect ordered base/HEAD parents")
        require(isinstance(tree, dict) and isinstance(tree.get("sha"), str)
                and SHA.fullmatch(tree["sha"]), "authenticated merge preview tree is missing")
        return tree["sha"]

    original_tree = checked_commit(certified_sha)
    current_tree = checked_commit(current)
    require(original_tree == current_tree, "merge preview tree differs from certified result")
    return {**proof, "mode": "equivalent-ordered-parents-and-tree", "tree_sha": original_tree,
            "ordered_parents": [identity["base_sha"], identity["head_sha"]]}


def reconcile_target(packet: dict, live_identity: dict,
                     authenticated_certificate_event, authenticated_preview_reconciliation) -> dict | None:
    """Stabilize the certified preview without weakening the exact base/HEAD checks."""
    original = packet["identity"]
    if "merge_preview_reconciliation" not in packet:
        require(live_identity == original, "PR or issue identity/preview changed")
        return None
    current_fields = {k: v for k, v in live_identity.items() if k != "merge_preview_sha"}
    stable_fields = {k: v for k, v in original.items() if k != "merge_preview_sha"}
    require(current_fields == stable_fields, "PR or issue base/HEAD/source identity changed")
    authenticated_certificate_event(live_identity)
    proof = authenticated_preview_reconciliation(live_identity, original["merge_preview_sha"])
    require(packet["merge_preview_reconciliation"]["certified_sha"] == proof["certified_sha"],
            "certification preview identity was replaced")
    return proof


def authenticated_implementation_provenance(identity: dict, metadata: dict, pages, api) -> dict:
    """Rebuild the linear material commit chain using only authenticated GitHub API."""
    repo, number = identity["repository"], identity["pull_request"]
    commits = pages(repo, f"pulls/{number}/commits")
    require(bool(commits) and len(commits) <= 2500, "material GitHub PR commits missing or truncated")
    seen, previous, shas = set(), identity["base_sha"], []
    for row in commits:
        sha = row.get("sha")
        require(isinstance(sha, str) and SHA.fullmatch(sha) and sha not in seen,
                "invalid or duplicate GitHub PR material commit")
        obj = api(f"/repos/{repo}/git/commits/{sha}")
        parents = obj.get("parents") if isinstance(obj, dict) else None
        require(isinstance(obj, dict) and obj.get("sha") == sha
                and isinstance(parents, list) and len(parents) == 1
                and isinstance(parents[0], dict) and parents[0].get("sha") == previous,
                "GitHub PR commits are not an authenticated linear material chain from base")
        seen.add(sha)
        shas.append(sha)
        previous = sha
    require(previous == identity["head_sha"], "GitHub PR commits do not terminate at material HEAD")
    return {"type": PROVENANCE_TYPE, "repository": repo, "pull_request": number,
            "issue": identity["issue"], "base_sha": identity["base_sha"],
            "head_sha": identity["head_sha"], "commits": shas,
            "handoff": {"artifact_id": metadata["artifact_id"], "digest": metadata["artifact_digest"]}}


