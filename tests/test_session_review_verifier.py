"""M2 checks: forged workflow, stale CI, unsafe ZIP, revocation and Check Runs."""
from __future__ import annotations

import io
import json
import sys
import zipfile
from pathlib import Path
from unittest.mock import patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import session_review_evidence as evidence
import verify_session_review as verifier
import session_review_checks as checks

REPO = "owner/repo"
HEAD = "a" * 40
BASE = "b" * 40
MATERIAL = "c" * 40


def junit(name="Case A", classname="real-tests") -> bytes:
    return (f'<testsuites><testsuite tests="1" failures="0" errors="0">'
            f'<testcase name="{name}" classname="{classname}"/></testsuite></testsuites>').encode()


def certificate():
    return {"schema_version": 2, "status": "ready", "subject": {"repository": REPO, "pull_request_number": 10},
            "identity": {"base_sha": BASE, "material_head_sha": MATERIAL}}


def archive(mapping):
    f = io.BytesIO()
    with zipfile.ZipFile(f, "w") as z:
        for k, v in mapping.items():
            z.writestr(k, v)
    return f.getvalue()


def test_junit_passed_ids_are_exact_and_unique():
    assert evidence.passed_cases(junit()) == {"real-tests::Case A"}
    for bad in (
        b'<!DOCTYPE x><testsuites><testcase name="a" classname="b"/></testsuites>',
        b'<testsuites><testcase name="a" classname="b"><failure/></testcase></testsuites>',
        b'<testsuites><testcase name="a" classname="b"><skipped/></testcase></testsuites>',
        b'<testsuites><testcase name="a" classname="b"/><testcase name="a" classname="b"/></testsuites>',
        b'<testsuites/>',
    ):
        with pytest.raises((ValueError, Exception)):
            evidence.passed_cases(bad)


def test_generated_evidence_is_exact_sha_and_not_a_lookalike(tmp_path):
    j = tmp_path / "junit.xml"
    j.write_bytes(junit())
    cert = tmp_path / "handoff-ready.json"
    cert.write_text(json.dumps(certificate()))
    out = tmp_path / "out"
    evidence.write_evidence(j, cert, out, REPO, 10, BASE, HEAD)
    doc = json.loads((out / "session-review-evidence.json").read_text())
    assert doc["head_sha"] == HEAD and doc["material_head_sha"] == MATERIAL
    assert doc["passed_cases"] == 1
    facts, cases, _ = evidence.consume_zip(archive({x.name: x.read_bytes() for x in out.iterdir()}))
    assert facts == doc and cases == {"real-tests::Case A"}
    with pytest.raises(ValueError, match="bound"):
        evidence.write_evidence(j, cert, out, REPO, 99, BASE, HEAD)


def test_sharded_or_malicious_zip_is_never_accepted():
    payload = {"junit.xml": junit(), "handoff-ready.json": json.dumps(certificate()),
               "session-review-evidence.json": json.dumps({"junit_sha256": "0" * 64})}
    with pytest.raises(ValueError, match="mismatch"):
        evidence.consume_zip(archive(payload))
    with pytest.raises(ValueError, match="missing, foreign"):
        evidence.consume_zip(archive({**payload, "../escape": "bad"}))
    with pytest.raises(ValueError, match="missing, foreign"):
        evidence.consume_zip(archive({"junit.xml": junit()}))


def test_successful_ci_must_be_newest_and_use_canonical_workflow_path():
    ok = {"id": 10, "name": "Repository CI", "path": evidence.CI_WORKFLOWS["Repository CI"],
          "head_sha": HEAD, "event": "pull_request", "status": "completed", "conclusion": "success"}
    with patch.object(evidence, "api", return_value={"total_count": 1, "workflow_runs": [ok]}):
        assert evidence.prove_ci(REPO, HEAD, ("Repository CI",))["Repository CI"]["id"] == 10
    newer_failure = {**ok, "id": 11, "conclusion": "failure"}
    with patch.object(evidence, "api", return_value={"total_count": 2, "workflow_runs": [ok, newer_failure]}):
        with pytest.raises(ValueError, match="latest technical workflow"):
            evidence.prove_ci(REPO, HEAD, ("Repository CI",))
    with patch.object(evidence, "api", return_value={"total_count": 1, "workflow_runs": [{**ok, "path": "forged.yml"}]}):
        with pytest.raises(ValueError, match="missing"):
            evidence.prove_ci(REPO, HEAD, ("Repository CI",))


def test_check_mutation_transport_does_not_allow_issue_or_branch_writes():
    for path in (f"/repos/{REPO}/issues/1", f"/repos/{REPO}/git/refs/heads/main", f"/repos/{REPO}/check-runs/0"):
        with pytest.raises(ValueError, match="unauthorized"):
            checks.write_api(path, "POST", {})
    with pytest.raises(ValueError, match="unauthorized"):
        checks.write_api(f"/repos/{REPO}/check-runs", "PATCH", {})


def test_begin_check_is_non_approved_and_publisher_checks_git_hub_app():
    captured = []

    def write(path, method, payload):
        captured.append((method, payload))
        return {"id": 12, "name": "Verify session review (exact SHA)",
                "head_sha": HEAD, "status": payload.get("status", "completed"),
                "conclusion": payload.get("conclusion")}

    with patch.object(checks, "write_api", side_effect=write):
        assert checks.begin_check(REPO, HEAD, 10, "1234") == 12
    assert captured[0][0] == "POST" and captured[0][1]["status"] == "in_progress"
    assert "conclusion" not in captured[0][1]
    with patch.object(checks.collector, "api", return_value={"id": 12, "head_sha": HEAD,
          "name": "Verify session review (exact SHA)", "app": {"id": 999}}), \
         patch.object(checks, "write_api") as writer:
        with pytest.raises(ValueError, match="not published by GitHub Actions"):
            checks.finish_check(REPO, HEAD, 12, "1234", {}, True, "ok")
        writer.assert_not_called()


def test_shared_head_can_never_create_pr_specific_success():
    prs = [{"state": "open", "number": 10, "head": {"sha": HEAD}},
           {"state": "open", "number": 11, "head": {"sha": HEAD}}]
    with patch.object(verifier, "paged", return_value=prs):
        with pytest.raises(ValueError, match="more than one open PR"):
            verifier.same_head_not_shared(REPO, 10, HEAD)


def test_changed_or_deleted_review_revokes_even_after_previous_check(tmp_path):
    event = {"action": "deleted", "comment": {"id": 52,
             "body": verifier.PREFIX + "{}", "user": {"id": 42, "login": "owner", "type": "User"}}}
    path = tmp_path / "event.json"
    path.write_text(json.dumps(event))
    policy = {"operators": [{"id": 42, "login": "owner"}]}
    with patch.dict(verifier.os.environ, {"GITHUB_EVENT_PATH": str(path)}):
        assert verifier.event_watermark(policy) == 53
    event["action"] = "edited"
    event["comment"]["body"] = "removed marker"
    event["changes"] = {"body": {"from": verifier.PREFIX + "{}"}}
    path.write_text(json.dumps(event))
    with patch.dict(verifier.os.environ, {"GITHUB_EVENT_PATH": str(path)}):
        assert verifier.event_watermark(policy) == 53


def test_ambiguous_issue_keeps_target_for_failure_check():
    pr = {"number": 10, "state": "open", "base": {"ref": "develop"},
          "body": "Refs #9\nRefs #8"}
    with patch.object(verifier.collector, "api", return_value=pr):
        assert verifier.targets(REPO, {"repository": {"full_name": REPO},
                                  "pull_request": {"number": 10}}) == [(10, 0)]


def test_workflow_never_checkout_candidate_under_writable_token():
    root = Path(__file__).resolve().parents[1]
    trusted = (root / ".github/workflows/session-review.yml").read_text()
    evidence_workflow = (root / ".github/workflows/session-review-evidence.yml").read_text()
    assert "checks: write" in trusted and "contents: write" not in trusted
    assert "github.workflow_sha" in trusted and "pull_request_target:" in trusted
    assert "cancel-in-progress: false" in trusted and "queue: max" in trusted
    assert "github.event.pull_request.head.sha" not in trusted
    assert "pull_request:" in evidence_workflow and "checks: write" not in evidence_workflow
    assert "persist-credentials: false" in evidence_workflow
    assert "candidate/.audit/entregar-issue/handoff-ready.json" in evidence_workflow


def test_disabled_or_missing_policy_can_only_publish_failure():
    pr = {"head": {"sha": HEAD}, "base": {"sha": BASE}}
    issued = []

    def finish(*args):
        issued.append(args)

    with patch.object(verifier.collector, "api", return_value=pr), \
         patch.object(verifier, "review_watermark", return_value=0), \
         patch.object(verifier, "begin_check", return_value=42), \
         patch.object(verifier, "live_identity", return_value={"head_sha": HEAD, "base_sha": BASE}), \
         patch.object(verifier.collector, "file_at", return_value=('{}', '0' * 64)), \
         patch.object(verifier, "same_head_not_shared"), \
         patch.object(verifier, "prepare", side_effect=ValueError("session-review policy is disabled")), \
         patch.object(verifier, "finish_check", side_effect=finish):
        assert verifier.evaluate(REPO, 10, 9, "12345") == 2
    assert len(issued) == 1 and issued[0][5] is False
    assert "policy is disabled" in issued[0][6]


def test_trusted_code_drift_fails_even_when_base_policy_claims_enabled(tmp_path):
    candidate = {"default_branch": "main"}
    default = {"commit": {"sha": "d" * 40}}
    real = verifier.TRUSTED_PATHS[0]
    root = tmp_path
    for path in verifier.TRUSTED_PATHS:
        f = root / path
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text("unchanged")
    with patch.object(verifier, "ROOT", root), \
         patch.object(verifier.collector, "api", side_effect=[candidate, default]), \
         patch.object(verifier.collector, "file_at", side_effect=[
             ("changed", "0" * 64), ("unchanged", "1" * 64)]):
        with pytest.raises(ValueError, match="trusted runner, default"):
            verifier.trusted_policy_and_code(REPO, BASE)


def test_authentic_head_workflow_cannot_be_altered_by_candidate():
    identity = {"base_sha": BASE, "head_sha": HEAD, "policy_sha256": "x" * 64, "issue": 9}
    with patch.object(verifier, "trusted_policy_and_code", return_value=({}, b"policy")), \
         patch.object(verifier, "digest", return_value="x" * 64), \
         patch.object(verifier.collector, "file_at", return_value=("altered", "0" * 64)):
        with pytest.raises(ValueError, match="candidate modified trusted evidence workflow"):
            verifier.prepare(REPO, 10, 9, identity)


def test_official_contract_not_satisfied_by_ci_or_fake_marker():
    from session_review import verify_review
    packet = {"identity": {"repository": REPO}, "requirements": [], "certified_at": "2026-11-05T00:00:00+00:00"}
    bad_comment = {"id": 12, "body": "APPROVED", "user": {"id": 42, "login": "owner"},
                   "created_at": "2026-11-05T00:01:00+00:00", "updated_at": "2026-11-05T00:01:00+00:00"}
    policy = {"mode": "disabled"}
    with pytest.raises(ValueError, match="unexpected policy fields|session-review policy is disabled"):
        verify_review(bad_comment, packet, policy, {}, set())


@pytest.mark.parametrize("modified_ref", [MATERIAL, HEAD])
def test_technical_ci_workflow_must_match_protected_base(modified_ref):
    original = "name: Repository CI\non: pull_request\n"
    malicious = "name: Repository CI\non: pull_request\njobs: fake-green\n"

    def authenticated_file(_repo, path, sha):
        assert path == evidence.CI_WORKFLOWS["Repository CI"]
        value = malicious if sha == modified_ref else original
        return value, evidence.digest(value.encode())

    with patch.object(evidence, "file_at", side_effect=authenticated_file):
        with pytest.raises(ValueError, match="technical CI workflow differs from protected base"):
            evidence.authenticate_ci_workflows(REPO, BASE, MATERIAL, HEAD, ("Repository CI",))

    with patch.object(evidence, "file_at", side_effect=lambda _repo, path, sha:
                      (original, evidence.digest(original.encode()))):
        evidence.authenticate_ci_workflows(REPO, BASE, MATERIAL, HEAD, ("Repository CI",))


def test_technical_ci_tampering_blocks_before_green_status_is_considered():
    trusted = "name: Repository CI\n"
    altered = "name: Repository CI\njobs: pretend-success\n"
    with patch.object(evidence, "file_at", side_effect=[
            (trusted, evidence.digest(trusted.encode())),
            (altered, evidence.digest(altered.encode()))]), \
         patch.object(evidence, "prove_ci") as status:
        with pytest.raises(ValueError, match="differs from protected base"):
            evidence.collect_verified(REPO, 10, BASE, HEAD, MATERIAL, "0" * 64)
        status.assert_not_called()
