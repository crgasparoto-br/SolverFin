#!/usr/bin/env python3
"""Validate critical certificate bytes and result-only-child structure.

Inputs are authenticated GitHub readers supplied by the trusted caller; this
module never approves reviews, executes candidate code, or grants authority.
"""
from __future__ import annotations

import base64
import gzip
import io
import re

from session_review import digest, require, safe_path, strict_json

MAX_TOTAL = 24 * 1024 * 1024
SHA_RE = re.compile(r"[0-9a-f]{40}\Z")


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


# The official Skill defines five mandatory critical artefacts. All other
# recognised artefacts are conditional on the certified controls/review state.
# Every *declared* artefact is authenticated, including optional ones.
CRITICAL_REQUIRED_ARTIFACTS = frozenset({
    "specification_snapshot", "requirement_closure", "requirement_attack_matrix",
    "risk_saturation", "inherited_controls",
})
CRITICAL_ARTIFACT_NAMES = {
    "specification_snapshot": "specification-snapshot.json",
    "requirement_closure": "requirement-closure.json",
    "requirement_attack_matrix": "requirement-attack-matrix.json",
    "risk_saturation": "risk-saturation.json",
    "inherited_controls": "inherited-controls.json",
    "evidence_provenance": "evidence-provenance.json",
    "codebase_grounding": "codebase-grounding.json",
    "code_growth": "code-growth.json",
    "standard_evidence": "standard-evidence.json",
    "audit_remediation": "audit-remediation.json",
    "audit_source_result": "audit-source-result.json",
    "audit_escape_closure": "audit-escape-closure.json",
    "learning_closure": "learning-closure.json",
}


def validate_critical_payloads(cert: dict, documents: dict[str, dict]) -> None:
    """Bind all required and declared critical documents to the issue and material."""
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
    if "evidence_provenance" in documents:
        provenance = documents["evidence_provenance"]
        require(provenance.get("material_head_sha") == material
                and provenance.get("base_sha") == base
                and isinstance(provenance.get("evidence"), list) and bool(provenance["evidence"]),
                "critical evidence provenance missing or stale")
    if "codebase_grounding" in documents:
        grounding = documents["codebase_grounding"]
        require(grounding.get("subject_sha") == material and grounding.get("base_sha") == base
                and isinstance(grounding.get("test_decisions"), list),
                "critical codebase grounding missing or stale")
    if "code_growth" in documents:
        growth = documents["code_growth"]
        require(growth.get("control_id") == "CODE-GROWTH-001"
                and growth.get("subject_sha") == material and growth.get("base_sha") == base
                and growth.get("status") == "passed" and growth.get("blocking_files") == [],
                "critical code growth control did not pass")


def _verified_certificate_artifacts(repo: str, cert: dict, head: str, *, file_at, api_json) -> None:
    """Authenticate distinct canonical Git blobs and critical document contents."""
    sub = cert["subject"]
    prefix = f".audit/entregar-issue/issue-{sub['issue_number']}/"
    inventory = cert.get("artifacts")
    controls = cert.get("controls") or {}
    required = set(CRITICAL_REQUIRED_ARTIFACTS)
    for key in ("codebase_grounding", "code_growth"):
        if (controls.get(key) or {}).get("applicable") is True:
            required.add(key)
    if cert.get("previous_independent_rejection") is True:
        required.update({"audit_remediation", "audit_source_result",
                         "audit_escape_closure", "learning_closure"})
    require(isinstance(inventory, dict)
            and required <= set(inventory)
            and set(inventory) <= set(CRITICAL_ARTIFACT_NAMES),
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
                     expected_base_ref: str | None = None, file_at, api, api_json, max_files: int) -> dict:
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
    require(0 < len(files) <= max_files and diff.get("total_commits") == 1,
            "unbounded or non-child handoff diff")
    require(all(str(item.get("filename", "")).startswith(".audit/entregar-issue/")
                and item.get("status") != "removed" for item in files),
            "non-result-only change after material freeze")
    permitted = (cert.get("certificate_commit_policy") or {}).get("allowed_paths")
    require(isinstance(permitted, list) and set(permitted) == {i["filename"] for i in files}
            and len(permitted) == len(files), "result-only certificate allowlist differs from committed diff")
    _verified_certificate_artifacts(repo, cert, head, file_at=file_at, api_json=api_json)
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


