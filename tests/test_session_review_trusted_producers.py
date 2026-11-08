# Stage-A trusted producers. Workflow assertions remain in the candidate PR until the protected source bootstrap is complete.
"""Adversarial controls for freshness and authenticated certificate provenance."""
import io
import json
import sys
import zipfile
from pathlib import Path
from unittest.mock import patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import session_review_certificate as source
import session_review_evidence as evidence

REPO = "owner/repo"
BASE, HEAD, MATERIAL = "b" * 40, "a" * 40, "c" * 40
DIGEST = "d" * 64


def zip_data(fact):
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as archive:
        archive.writestr(source.ATTESTATION_NAME, json.dumps(fact))
    return out.getvalue()


def successful_run(number=10):
    return {"id": 10, "name": source.RUN_NAME, "path": source.WORKFLOW,
            "head_sha": HEAD, "event": "pull_request",
            "status": "completed", "conclusion": "success",
            "pull_requests": [{"number": number}]}


def facts():
    return {"schema_version": 1, "repository": REPO, "pull_request": 10,
            "base_sha": BASE, "head_sha": HEAD,
            "material_head_sha": MATERIAL, "certificate_sha256": DIGEST,
            "run_id": 10}


def api(path, newer=None):
    if path == f"/repos/{REPO}":
        return {"default_branch": "main"}
    if path == f"/repos/{REPO}/branches/main":
        return {"commit": {"sha": "e" * 40}}
    if path.startswith(f"/repos/{REPO}/actions/runs?"):
        runs = [successful_run()]
        if newer:
            runs.append(newer)
        return {"total_count": len(runs), "workflow_runs": runs}
    if path.endswith("/actions/runs/10/jobs?per_page=100"):
        return {"total_count": 1, "jobs": [{"name": "provenance", "conclusion": "success"}]}
    if path.endswith("/actions/runs/10/artifacts?per_page=100"):
        return {"total_count": 1, "artifacts": [{
            "id": 33, "name": source.ARTIFACT_PREFIX + HEAD,
            "expired": False, "digest": "sha256:" + source.digest(zip_data(facts()))}]}
    raise AssertionError(path)


def trusted_file(repo, path, sha):
    assert path in source.TRUSTED_PATHS
    return "trusted", "a" * 64


def verify(**kw):
    return source.verify_attestation(
        REPO, 10, BASE, HEAD, MATERIAL, DIGEST,
        api=lambda path: api(path, **kw),
        file_at=trusted_file, download=lambda repo, aid: zip_data(facts()))


def test_provenance_positive_and_exact_identity():
    assert verify()["run_id"] == 10
    with patch.object(source, "parse_artifact", return_value={
            **facts(), "pull_request": 11}):
        with pytest.raises(ValueError, match="foreign"):
            verify()


@pytest.mark.parametrize("state", ["failure", "cancelled", "pending"])
def test_newer_failed_or_pending_producer_revokes_old_green(state):
    newer = {**successful_run(), "id": 11,
             "conclusion": state, "status": "completed" if state != "pending" else "in_progress"}
    with pytest.raises(ValueError, match="newest trusted certificate producer"):
        verify(newer=newer)


def test_modified_candidate_producer_fails_before_green_status():
    refs = []
    def file_at(repo, path, sha):
        refs.append(sha)
        return ("tampered" if sha == HEAD else "trusted", "a" * 64)
    with pytest.raises(ValueError, match="differs from protected base"):
        source.verify_attestation(
            REPO, 10, BASE, HEAD, MATERIAL, DIGEST,
            api=lambda path: api(path), file_at=file_at)
    assert HEAD in refs


def test_forged_artifact_digest_and_foreign_zip_path_rejected():
    wrong = zip_data({**facts(), "certificate_sha256": "0" * 64})
    with pytest.raises(ValueError, match="transport digest mismatch"):
        source.verify_attestation(
            REPO, 10, BASE, HEAD, MATERIAL, DIGEST, api=api,
            file_at=trusted_file, download=lambda _repo, _id: wrong)
    payload = io.BytesIO()
    with zipfile.ZipFile(payload, "w") as archive:
        archive.writestr(source.ATTESTATION_NAME, json.dumps(facts()))
        archive.writestr("../escape", "bad")
    with pytest.raises(ValueError, match="foreign or unsafe"):
        source.parse_artifact(payload.getvalue())


def test_evidence_latest_failed_or_running_never_reuses_older_green():
    old = {"id": 21, "name": evidence.RUN_NAME, "path": evidence.WORKFLOW,
           "head_sha": HEAD, "event": "pull_request", "status": "completed",
           "conclusion": "success", "pull_requests": [{"number": 10}]}
    for state, conclusion in (("completed", "failure"), ("in_progress", None)):
        new = {**old, "id": 22, "status": state, "conclusion": conclusion}
        with patch.object(evidence, "authenticate_ci_workflows"), \
             patch.object(evidence, "prove_ci", return_value={}), \
             patch.object(evidence, "api", return_value={
                 "total_count": 2, "workflow_runs": [old, new]}):
            with pytest.raises(ValueError, match="newest exact-SHA evidence workflow"):
                evidence.collect_verified(REPO, 10, BASE, HEAD, MATERIAL, DIGEST)


def test_trusted_producer_runs_official_validator_or_fails_closed(tmp_path, monkeypatch):
    import prepare_session_review_packet as collector
    import session_review_packet_handoff as handoff
    from types import SimpleNamespace

    monkeypatch.chdir(tmp_path)
    path = Path("candidate/.audit/entregar-issue/handoff-ready.json")
    path.parent.mkdir(parents=True)
    path.write_text('{"schema_version":2}')
    proof = {"certificate_sha256": source.digest(path.read_bytes()),
             "material_head_sha": MATERIAL,
             "result_only_changed_paths": [".audit/entregar-issue/handoff-ready.json"],
             "certificate": {"scope": {"issue_changed_paths": ["scripts/foo.py"]}}}
    pr = {"state": "open", "base": {"sha": BASE, "ref": "develop"},
          "head": {"sha": HEAD, "ref": "feature/governance"}}
    with patch.object(collector, "api", return_value=pr), \
         patch.object(collector, "issue_reference", return_value=9), \
         patch.object(handoff, "inspect_handoff", return_value=proof), \
         patch.object(source.subprocess, "run", return_value=SimpleNamespace(
             returncode=0, stdout="PASS", stderr="")) as runner:
        source.produce(REPO, 10, BASE, HEAD, 42, Path("skill"),
                       Path("out/session-review-handoff-attestation.json"))
    args = runner.call_args.args[0]
    assert "validate_handoff_certificate.py" in args[1]
    assert "--candidate-parent-sha" in args
    assert "--candidate-changed-path" in args
    attested = json.loads(Path("out/session-review-handoff-attestation.json").read_text())
    assert attested["run_id"] == 42 and attested["material_head_sha"] == MATERIAL

    with patch.object(collector, "api", return_value=pr), \
         patch.object(collector, "issue_reference", return_value=9), \
         patch.object(handoff, "inspect_handoff", return_value=proof), \
         patch.object(source.subprocess, "run", return_value=SimpleNamespace(
             returncode=2, stdout="BLOCK: invalid certified closure", stderr="")):
        with pytest.raises(ValueError, match="official Skill certificate validation failed"):
            source.produce(REPO, 10, BASE, HEAD, 43, Path("skill"), Path("failed.json"))
    assert not Path("failed.json").exists()


def test_junit_aggregates_cannot_hide_invalid_failures_or_test_counts():
    good = b'<testsuites><testsuite tests="1" failures="0" errors="0" skipped="0"><testcase classname="suite" name="case"/></testsuite></testsuites>'
    assert evidence.passed_cases(good) == {"suite::case"}
    for attribute in (b'failures="1"', b'errors="1"', b'skipped="1"',
                      b'tests="0"', b'tests="2"', b'tests="bogus"'):
        key = attribute.split(b"=", 1)[0]
        good_value = b'tests="1"' if key == b"tests" else key + b'="0"'
        malformed = good.replace(good_value, attribute, 1)
        with pytest.raises(ValueError, match="JUnit"):
            evidence.passed_cases(malformed)
    # Also enforce totals on the outer testsuites element, not just the leaf.
    with pytest.raises(ValueError, match="JUnit"):
        evidence.passed_cases(good.replace(b'<testsuites>', b'<testsuites failures="1">'))


@pytest.mark.parametrize("element", ["failure", "error", "skipped", "wrapper"])
def test_namespaced_junit_fails_closed_in_parser_producer_and_consumer(tmp_path, element):
    """A-005: a namespaced failure must never become positive exact-SHA evidence."""
    raw = (
        '<testsuites><testsuite tests="1" failures="0" errors="0" skipped="0">'
        '<testcase classname="suite" name="case">'
        f'<ns:{element} xmlns:ns="urn:untrusted:junit"/>'
        '</testcase></testsuite></testsuites>'
    ).encode()
    with pytest.raises(ValueError, match="JUnit"):
        evidence.passed_cases(raw)

    certificate = tmp_path / "handoff-ready.json"
    certificate.write_text(json.dumps({
        "schema_version": 2, "status": "ready",
        "subject": {"repository": REPO, "pull_request_number": 10},
        "identity": {"base_sha": BASE, "material_head_sha": MATERIAL},
    }))
    junit = tmp_path / "junit.xml"
    junit.write_bytes(raw)
    rejected_out = tmp_path / "rejected"
    with pytest.raises(ValueError, match="JUnit"):
        evidence.write_evidence(junit, certificate, rejected_out, REPO, 10, BASE, HEAD)
    assert not rejected_out.exists()

    # Build a valid archive first, then replace only XML and its authenticated
    # hash. This exercises semantic validation after byte-integrity checks.
    junit.write_bytes(
        b'<testsuites><testsuite tests="1"><testcase classname="suite" name="case"/>'
        b'</testsuite></testsuites>'
    )
    accepted_out = tmp_path / "accepted"
    evidence.write_evidence(junit, certificate, accepted_out, REPO, 10, BASE, HEAD)
    facts = json.loads((accepted_out / "session-review-evidence.json").read_text())
    facts["junit_sha256"] = source.digest(raw)
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("junit.xml", raw)
        archive.writestr("handoff-ready.json", certificate.read_bytes())
        archive.writestr("session-review-evidence.json", json.dumps(facts))
    with pytest.raises(ValueError, match="JUnit"):
        evidence.consume_zip(buffer.getvalue())
