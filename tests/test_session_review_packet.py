"""Negative and positive controls for the neutral, non-authoritative packet collector."""
import base64
import gzip
import json
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import prepare_session_review_packet as collector

REPO = "owner/repo"
BASE = "b" * 40
HEAD = "a" * 40
MATERIAL = "c" * 40
PREVIEW = "d" * 40
DEFAULT = "e" * 40


def test_git_blob_verification_rejects_modified_data():
    blob = b"known trusted bytes\n"
    record = {"type": "file", "encoding": "base64", "size": len(blob),
              "sha": collector.git_sha(blob), "content": base64.b64encode(blob).decode()}
    with patch.object(collector, "api", return_value=record):
        assert collector.file_at(REPO, "docs/proof.md", HEAD)[0] == blob.decode()
    with patch.object(collector, "api", return_value={**record, "sha": "0" * 40}):
        with pytest.raises(ValueError, match="blob metadata mismatch"):
            collector.file_at(REPO, "docs/proof.md", HEAD)
    with patch.object(collector, "api", return_value={**record, "size": len(blob) + 1}):
        with pytest.raises(ValueError, match="size mismatch"):
            collector.file_at(REPO, "docs/proof.md", HEAD)


def test_preview_requires_base_then_head_parents():
    response = {"tree": {"sha": "0" * 40}, "parents": [{"sha": BASE}, {"sha": HEAD}]}
    with patch.object(collector, "api", return_value=response):
        assert collector.checked_preview(REPO, PREVIEW, BASE, HEAD)["parents"] == [BASE, HEAD]
    with patch.object(collector, "api", return_value={**response, "parents": list(reversed(response["parents"]))}):
        with pytest.raises(ValueError, match="parents"):
            collector.checked_preview(REPO, PREVIEW, BASE, HEAD)


def test_disabled_policy_does_not_claim_approval():
    p = {"mode": "disabled", "assurance": "operator-attested-session-review",
         "acknowledgement": "separate-context-declared-not-cryptographically-proven"}
    data = json.dumps(p)
    with patch.object(collector, "file_at", side_effect=[(data, "x"), (data, "y")]):
        assert collector.trusted_policy(REPO, BASE, DEFAULT)[0]["mode"] == "disabled"
    with patch.object(collector, "file_at", side_effect=[(data, "x"), (data + " ", "z")]):
        with pytest.raises(ValueError, match="policy drift"):
            collector.trusted_policy(REPO, BASE, DEFAULT)


def test_result_only_child_cannot_mutate_application():
    cert = {"schema_version": 2, "status": "ready", "phase": "final", "evidence_profile": "critical",
            "identity": {"base_sha": BASE, "head_sha": MATERIAL, "material_head_sha": MATERIAL},
            "subject": {"repository": REPO, "pull_request_number": 10, "base_ref": "develop",
                        "work_item_kind": "issue", "issue_number": 9, "work_item_number": 9}}
    with patch.object(collector, "file_at", return_value=(json.dumps(cert), "0" * 64)), \
         patch.object(collector, "api", side_effect=[
             {"parents": [{"sha": MATERIAL}]},
             {"files": [{"filename": "src/devious.py", "status": "modified"}], "total_commits": 1}]):
        with pytest.raises(ValueError, match="non-result-only"):
            collector.inspect_handoff(REPO, 10, BASE, HEAD)
    with patch.object(collector, "file_at", return_value=(json.dumps(cert), "0" * 64)), \
         patch.object(collector, "api", side_effect=[
             {"parents": [{"sha": BASE}]},
             {"files": [{"filename": ".audit/entregar-issue/ok.json", "status": "added"}], "total_commits": 1}]):
        with pytest.raises(ValueError, match="direct result-only child"):
            collector.inspect_handoff(REPO, 10, BASE, HEAD)


def test_event_comment_cannot_be_spoofed(tmp_path):
    event = {"repository": {"full_name": REPO}, "issue": {"number": 10, "pull_request": {}},
             "comment": {"id": 31, "body": "/solverit-audit-packet", "user": {"id": 12}}}
    event["issue"]["pull_request"] = {"url": "github"}
    f = tmp_path / "event.json"
    f.write_text(json.dumps(event))
    with patch.object(collector, "api", return_value={"body": "changed", "issue_url": f"https://api.github.com/repos/{REPO}/issues/10", "user": {"id": 12}}):
        with pytest.raises(ValueError, match="changed after authentication"):
            collector.validate_event(REPO, f)
    event["comment"]["body"] = "/solverit-audit-packet\n<script>"
    f.write_text(json.dumps(event))
    with pytest.raises(ValueError, match="explicit packet request"):
        collector.validate_event(REPO, f)


def test_file_inventory_rejects_path_traversal_and_oversize():
    with pytest.raises(ValueError, match="unsafe file change"):
        collector.freeze_files(REPO, [{"status": "added", "filename": "../secret"}], BASE, HEAD)
    with patch.object(collector, "file_at", return_value=("x" * (collector.MAX_TOTAL + 1), "0" * 64)):
        with pytest.raises(ValueError, match="exceed budget"):
            collector.freeze_files(REPO, [{"status": "modified", "filename": "docs/a.md"}], BASE, HEAD)


@pytest.mark.parametrize("base_ref", ["develop", "main"])
def test_neutral_packet_rederives_issue_and_checks_identity(base_ref):
    issue = "## Requisitos\n- Deve preservar os valores sem mistura de moeda.\n"
    pr = {"state": "open", "draft": False, "body": "Refs #9", "merge_commit_sha": PREVIEW,
          "head": {"sha": HEAD, "ref": "feature/audit", "repo": {"full_name": REPO}},
          "base": {"sha": BASE, "ref": base_ref, "repo": {"full_name": REPO}}}
    cert = {"subject": {"issue_number": 9}, "material_head_sha": MATERIAL,
            "certificate_sha256": "f" * 64,
            "result_only_changed_paths": [".audit/entregar-issue/proof.json"],
            "certificate": {"schema_version": 2, "status": "ready", "evidence_profile": "critical", "subject": {"issue_number": 9},
                            "completion": {"issue_completion": "partial"}}}
    def mocked_api(path):
        if path.endswith("/pulls/10"): return pr
        if path.endswith("/issues/9"): return {"number": 9, "body": issue}
        if path.endswith(f"/repos/{REPO}"): return {"default_branch": "main"}
        if path.endswith("/branches/main"): return {"commit": {"sha": DEFAULT}}
        raise AssertionError(path)
    with patch.object(collector, "api", side_effect=mocked_api), \
         patch.object(collector, "trusted_policy", return_value=({"mode": "disabled"}, "1" * 64)), \
         patch.object(collector, "checked_preview", return_value={"sha": PREVIEW, "parents": [BASE, HEAD]}), \
         patch.object(collector, "inspect_handoff", return_value=cert), \
         patch.object(collector, "paged", return_value=[{"status": "added", "filename": "docs/foo.md"}]), \
         patch.object(collector, "freeze_files", return_value=({"head/docs/foo.md": "hello"}, {"docs/foo.md": "diff"})), \
         patch.object(collector, "ci_runs", return_value=[{"name": "Repository CI", "conclusion": "success"}]):
        result = collector.collect(REPO, 10)
    assert result["identity"]["issue"] == 9
    assert result["identity"]["base_ref"] == base_ref
    assert result["collector"]["approved"] is False
    assert result["handoff"]["completion"]["issue_completion"] == "partial"
    assert result["requirements"] and result["source_sha256"]
    assert not result["implementation_conclusions_included"]


def test_issue_reference_accepts_canonical_pr_760_prose():
    assert collector.issue_reference({"body": "Refs #714; parent epic #702.\n\n## Escopo"}) == 714
    with pytest.raises(ValueError, match="one canonical issue"):
        collector.issue_reference({"body": "Refs #714\nRefs #702"})


def test_handoff_rejects_base_ref_that_differs_from_authenticated_pr():
    cert = {"schema_version": 2, "status": "ready", "phase": "final",
            "evidence_profile": "critical", "identity": {"base_sha": BASE},
            "subject": {"repository": REPO, "pull_request_number": 10,
                        "base_ref": "develop", "work_item_kind": "issue",
                        "issue_number": 9, "work_item_number": 9}}
    with patch.object(collector, "file_at", return_value=(json.dumps(cert), "0" * 64)):
        with pytest.raises(ValueError, match="handoff protected base mismatch"):
            collector.inspect_handoff(REPO, 10, BASE, HEAD, expected_base_ref="main")


def test_critical_certificate_rejects_aliases_and_fake_versionless_json():
    names = collector.CRITICAL_ARTIFACT_NAMES
    payload = "{}"
    digest = collector.digest(payload.encode())
    template = {"sha256": digest, "logical_sha256": digest, "logical_size": len(payload)}
    cert = {"subject": {"issue_number": 9, "repository": REPO},
            "identity": {"base_sha": BASE, "material_head_sha": MATERIAL},
            "artifacts": {key: {**template, "name": "same.json"} for key in names}}
    with patch.object(collector, "file_at", return_value=(payload, digest)):
        with pytest.raises(ValueError, match="canonical or unique"):
            collector._verified_certificate_artifacts(REPO, cert, HEAD)
    distinct = {key: {**template, "name": name} for key, name in names.items()}
    with patch.object(collector, "file_at", return_value=(payload, digest)):
        with pytest.raises(ValueError, match="versioned JSON"):
            collector._verified_certificate_artifacts(REPO, {**cert, "artifacts": distinct}, HEAD)


def test_critical_certificate_rejects_cross_target_and_uncovered_requirements():
    cert = {"subject": {"repository": REPO, "issue_number": 9},
            "identity": {"material_head_sha": MATERIAL, "base_sha": BASE},
            "artifacts": {"specification_snapshot": {"sha256": "a" * 64}}}
    docs = {
        "specification_snapshot": {"repository": REPO, "issue": 9, "sources": [{"id": "x"}]},
        "requirement_closure": {"obligations": [{"candidate_key": "x"}],
            "specification_snapshot": {"sha256": "a" * 64},
            "pass_c": {"status": "passed"}, "scope_reduction_review": {"status": "passed"}},
        "requirement_attack_matrix": {"head_sha": MATERIAL, "requirements": [{"id": "x"}],
            "uncovered_requirements": []},
        "risk_saturation": {"head_sha": MATERIAL, "families": [], "material_families_missing_controls": []},
        "inherited_controls": {"head_sha": MATERIAL, "controls": [], "unresolved_controls": []},
        "evidence_provenance": {"material_head_sha": MATERIAL, "base_sha": BASE,
            "evidence": [{"id": "e"}]},
        "codebase_grounding": {"subject_sha": MATERIAL, "base_sha": BASE, "test_decisions": []},
        "code_growth": {"control_id": "CODE-GROWTH-001", "subject_sha": MATERIAL,
                        "base_sha": BASE, "status": "passed", "blocking_files": []}}
    collector.validate_critical_payloads(cert, docs)
    with pytest.raises(ValueError, match="snapshot"):
        collector.validate_critical_payloads(cert, {**docs,
            "specification_snapshot": {**docs["specification_snapshot"], "issue": 8}})
    with pytest.raises(ValueError, match="unresolved"):
        collector.validate_critical_payloads(cert, {**docs,
            "requirement_attack_matrix": {**docs["requirement_attack_matrix"],
                "uncovered_requirements": ["REQ-X"]}})
    with pytest.raises(ValueError, match="provenance"):
        collector.validate_critical_payloads(cert, {**docs,
            "evidence_provenance": {**docs["evidence_provenance"], "base_sha": HEAD}})


def test_gzip_inflation_is_bounded_and_invalid_data_rejected():
    data = gzip.compress(b"X" * 32768)
    assert collector.bounded_gzip_decompress(data, limit=32768) == b"X" * 32768
    with pytest.raises(ValueError, match="inflation"):
        collector.bounded_gzip_decompress(data, limit=100)
    with pytest.raises(ValueError, match="malformed"):
        collector.bounded_gzip_decompress(b"not-gzip", limit=100)


def test_critical_inventory_accepts_seven_real_stage_a_artifacts_and_known_extensions():
    """Regression A-002: the official critical certificate need not include provenance."""
    import session_review_packet_handoff as handoff

    source_docs = {
        "specification_snapshot": {"schema_version": 1, "repository": REPO,
                                   "issue": 9, "sources": [{"id": "issue-9"}]},
        "requirement_closure": {"schema_version": 1, "obligations": [{"candidate_key": "req-9"}],
                                "pass_c": {"status": "passed"},
                                "scope_reduction_review": {"status": "passed"}},
        "requirement_attack_matrix": {"schema_version": 1, "head_sha": MATERIAL,
                                      "requirements": [{"id": "req-9"}],
                                      "uncovered_requirements": []},
        "risk_saturation": {"schema_version": 1, "head_sha": MATERIAL,
                            "families": [], "material_families_missing_controls": []},
        "inherited_controls": {"schema_version": 1, "head_sha": MATERIAL,
                               "controls": [], "unresolved_controls": []},
        "codebase_grounding": {"schema_version": 1, "subject_sha": MATERIAL,
                               "base_sha": BASE, "test_decisions": []},
        "code_growth": {"schema_version": 1, "control_id": "CODE-GROWTH-001",
                        "subject_sha": MATERIAL, "base_sha": BASE,
                        "status": "passed", "blocking_files": []},
    }
    stored = {}
    artifacts = {}
    for key, body in source_docs.items():
        name = handoff.CRITICAL_ARTIFACT_NAMES[key]
        data = json.dumps(body, ensure_ascii=False, sort_keys=True)
        sha = collector.digest(data.encode())
        stored[name] = (data, sha)
        artifacts[key] = {"name": name, "sha256": sha,
                          "logical_sha256": sha, "logical_size": len(data.encode()),
                          "artifact_transport": {"format": "plain-json", "version": 1}}
    source_docs["requirement_closure"]["specification_snapshot"] = {
        "sha256": artifacts["specification_snapshot"]["sha256"]}
    key = "requirement_closure"
    data = json.dumps(source_docs[key], ensure_ascii=False, sort_keys=True)
    sha = collector.digest(data.encode())
    stored[handoff.CRITICAL_ARTIFACT_NAMES[key]] = (data, sha)
    artifacts[key].update(sha256=sha, logical_sha256=sha, logical_size=len(data.encode()))
    cert = {"subject": {"repository": REPO, "issue_number": 9},
            "identity": {"base_sha": BASE, "material_head_sha": MATERIAL},
            "controls": {"code_growth": {"applicable": True},
                         "codebase_grounding": {"applicable": True}},
            "artifacts": artifacts}
    reads = []

    def reader(repo, path, head):
        assert repo == REPO and head == HEAD
        reads.append(path)
        return stored[path.rsplit("/", 1)[-1]]

    check = lambda c: handoff._verified_certificate_artifacts(
        REPO, c, HEAD, file_at=reader, api_json=lambda raw: json.loads(raw))
    check(cert)
    assert len(reads) == 7 and "evidence_provenance" not in cert["artifacts"]

    # Additional certified, recognized artifacts are authenticated, not rejected.
    extra_key = "audit_remediation"
    content = '{"schema_version": 1, "status": "passed"}'
    checksum = collector.digest(content.encode())
    name = handoff.CRITICAL_ARTIFACT_NAMES[extra_key]
    stored[name] = (content, checksum)
    extended = {**cert, "artifacts": {**artifacts, extra_key: {
        "name": name, "sha256": checksum, "logical_sha256": checksum,
        "logical_size": len(content.encode()),
        "artifact_transport": {"format": "plain-json", "version": 1}}}}
    reads.clear()
    check(extended)
    assert len(reads) == 8
    with pytest.raises(ValueError, match="digest mismatch"):
        check({**extended, "artifacts": {**artifacts, extra_key: {
            **extended["artifacts"][extra_key], "sha256": "0" * 64}}})

    # Regression A-004: targeted corrections require only the audit source and
    # remediation ledger, while systemic/mixed corrections require lineage.
    source_key = "audit_source_result"
    source_name = handoff.CRITICAL_ARTIFACT_NAMES[source_key]
    stored[source_name] = (content, checksum)
    source_artifact = {"name": source_name, "sha256": checksum,
                       "logical_sha256": checksum, "logical_size": len(content),
                       "artifact_transport": {"format": "plain-json", "version": 1}}
    targeted = {**cert, "previous_independent_rejection": True,
                "remediation_mode": "targeted-remediation",
                "artifacts": {**extended["artifacts"], source_key: source_artifact}}
    reads.clear()
    check(targeted)
    assert len(reads) == 9
    for missing_key in ("audit_remediation", "audit_source_result"):
        with pytest.raises(ValueError, match="inventory"):
            check({**targeted, "artifacts": {
                key: value for key, value in targeted["artifacts"].items()
                if key != missing_key}})

    for mode in ("systemic-remediation", "mixed-remediation"):
        with pytest.raises(ValueError, match="inventory"):
            check({**targeted, "remediation_mode": mode})
    lineage = {}
    for key in ("audit_escape_closure", "learning_closure"):
        name = handoff.CRITICAL_ARTIFACT_NAMES[key]
        stored[name] = (content, checksum)
        lineage[key] = {"name": name, "sha256": checksum,
                        "logical_sha256": checksum, "logical_size": len(content),
                        "artifact_transport": {"format": "plain-json", "version": 1}}
    for mode in ("systemic-remediation", "mixed-remediation"):
        with_lineage = {**targeted, "remediation_mode": mode,
                        "artifacts": {**targeted["artifacts"], **lineage}}
        check(with_lineage)
        for missing_key in lineage:
            with pytest.raises(ValueError, match="inventory"):
                check({**with_lineage, "artifacts": {
                    key: value for key, value in with_lineage["artifacts"].items()
                    if key != missing_key}})
    with pytest.raises(ValueError, match="digest mismatch"):
        check({**targeted, "artifacts": {
            **targeted["artifacts"], source_key: {
                **source_artifact, "sha256": "0" * 64}}})

    # Conditional provenance is verified when present, and its base must match.
    provenance = {"schema_version": 1, "material_head_sha": MATERIAL,
                  "base_sha": BASE, "evidence": [{"id": "test"}]}
    good = json.dumps(provenance, sort_keys=True)
    phash = collector.digest(good.encode())
    stored[handoff.CRITICAL_ARTIFACT_NAMES["evidence_provenance"]] = (good, phash)
    with_provenance = {**extended, "artifacts": {**extended["artifacts"],
        "evidence_provenance": {"name": "evidence-provenance.json", "sha256": phash,
        "logical_sha256": phash, "logical_size": len(good),
        "artifact_transport": {"format": "plain-json", "version": 1}}}}
    check(with_provenance)
    provenance["base_sha"] = HEAD
    corrupt = json.dumps(provenance, sort_keys=True)
    corrupt_hash = collector.digest(corrupt.encode())
    stored["evidence-provenance.json"] = (corrupt, corrupt_hash)
    with pytest.raises(ValueError, match="provenance"):
        check({**with_provenance, "artifacts": {**with_provenance["artifacts"],
            "evidence_provenance": {**with_provenance["artifacts"]["evidence_provenance"],
                                    "sha256": corrupt_hash,
                                    "logical_sha256": corrupt_hash,
                                    "logical_size": len(corrupt)}}})

    # Mandatory, controlled, and foreign records must always fail closed.
    for missing_key in ("specification_snapshot", "code_growth", "codebase_grounding"):
        with pytest.raises(ValueError, match="inventory"):
            check({**cert, "artifacts": {k: v for k, v in artifacts.items()
                                         if k != missing_key}})
    with pytest.raises(ValueError, match="inventory"):
        check({**cert, "artifacts": {**artifacts, "untrusted_custom": {}}})
    with pytest.raises(ValueError, match="inventory"):
        check({**cert, "previous_independent_rejection": True})
