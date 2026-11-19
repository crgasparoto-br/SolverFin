"""Adversarial contract tests for trusted solo Ed25519 check publication.

All tests use mocked GitHub responses; successful publication never substitutes
for the separate semantic or cryptographic audit requirements.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "entregar-issue" / "scripts"))

import solo_audit_check_runs as checks
import verify_solo_audit_attestation as controller

REPO = "crgasparoto-br/SolverFin"
HEAD = "a" * 40
RUN = "44091547097"
PR = 796
ID = 134067878879
URL = f"https://github.com/{REPO}/actions/runs/{RUN}"
CHECK_URL = f"https://github.com/{REPO}/runs/{ID}"
EXTERNAL = checks.provisional_external_id(PR, HEAD, RUN)


def check_record(*, status="in_progress", conclusion=None, details=CHECK_URL,
                 external=EXTERNAL, check_id=ID, app=checks.APP_ID):
    return {"id": check_id, "name": checks.CHECK_NAME, "head_sha": HEAD,
            "status": status, "conclusion": conclusion, "external_id": external,
            "details_url": details, "app": {"id": app}}


class SoloCheckLifecycleTests(unittest.TestCase):
    def test_workflow_ignores_unrelated_comments_but_revalidates_signed_edits(self):
        workflow = (ROOT / ".github/workflows/solo-audit-attestation.yml").read_text()
        self.assertIn("startsWith(github.event.comment.body, 'SOLVERIT_EXTERNAL_AUDIT_JSON:')", workflow)
        self.assertIn("startsWith(github.event.changes.body.from, 'SOLVERIT_EXTERNAL_AUDIT_JSON:')", workflow)
        self.assertIn("github.event.issue.pull_request", workflow)

    def test_accept_github_canonical_check_url_and_exact_actions_run_url(self):
        for url in (CHECK_URL, URL):
            with self.subTest(url=url):
                self.assertTrue(checks._trusted_details_url(REPO, RUN, ID, url))

    def test_reject_external_details_urls_wrong_ids_query_or_prefix(self):
        for url in (CHECK_URL + "?redirect=1", CHECK_URL + "/evil",
                    CHECK_URL.replace("github.com/", "github.com.evil.test/"),
                    f"https://github.com/{REPO}/runs/{ID + 1}",
                    URL + "?x=1", URL.replace(RUN, "123"), "", None):
            with self.subTest(url=url):
                self.assertFalse(checks._trusted_details_url(REPO, RUN, ID, url))

    def test_created_check_id_survives_post_validation_error(self):
        response = check_record(app=777)
        captured = []
        with patch.object(checks.session_runner, "api", return_value=response):
            with self.assertRaisesRegex(ValueError, "did not enter a fail-closed state"):
                checks.begin_check(REPO, HEAD, PR, RUN, on_created=captured.append)
        self.assertEqual(captured, [ID])

    def test_begin_accepts_check_ui_url_and_retains_authentication(self):
        for url in (CHECK_URL, URL):
            with self.subTest(url=url):
                with patch.object(checks.session_runner, "api", return_value=check_record(details=url)):
                    self.assertEqual(checks.begin_check(REPO, HEAD, PR, RUN), ID)
        for forged in (check_record(external="sa:wrong"), check_record(app=7),
                       check_record(check_id=ID + 1), check_record(details=CHECK_URL + "?x")):
            with self.subTest(forged=forged):
                with patch.object(checks.session_runner, "api", return_value=forged):
                    with self.assertRaises(ValueError):
                        checks.begin_check(REPO, HEAD, PR, RUN)

    def test_failure_patches_original_check_to_terminal_state(self):
        captured = []
        def api(path, *, method="GET", data=None):
            if method == "GET":
                return check_record()
            self.assertEqual(method, "PATCH")
            captured.append((path, data))
            return check_record(status="completed", conclusion="failure")
        with patch.object(checks.session_runner, "api", side_effect=api):
            checks.publish_check(REPO, HEAD, PR, ID, RUN, "failure", {"blocker": "ValueError"})
        self.assertEqual(captured[0][0], f"/repos/{REPO}/check-runs/{ID}")
        self.assertEqual(captured[0][1]["conclusion"], "failure")
        self.assertEqual(captured[0][1]["status"], "completed")

    def test_failure_refuses_foreign_or_retargeted_check(self):
        for bad in (check_record(external="someone-else"), check_record(app=1),
                    check_record(check_id=ID + 1), check_record(details=CHECK_URL + "?evil"),
                    check_record(status="completed", conclusion="success")):
            with self.subTest(bad=bad):
                with patch.object(checks.session_runner, "api", return_value=bad) as api:
                    with self.assertRaises(ValueError):
                        checks.publish_check(REPO, HEAD, PR, ID, RUN, "failure", {})
                self.assertEqual(api.call_count, 1)

    def test_draft_pr_does_not_create_solo_check(self):
        with (patch.object(controller.session_runner, "api", return_value={
                  "head": {"sha": HEAD}, "draft": True,
              }) as api,
              patch.object(controller, "begin_check") as begin,
              patch.object(controller, "publish_check") as publish):
            self.assertEqual(controller.evaluate_target(REPO, PR, None, "b" * 40, RUN), 0)
        api.assert_called_once_with(f"/repos/{REPO}/pulls/{PR}")
        begin.assert_not_called()
        publish.assert_not_called()

    def test_partial_exact_identity_still_closes_with_provisional_failure(self):
        partial = {"head_sha": HEAD, "issue": 801}
        with (patch.object(controller.session_runner, "api", return_value={
                  "head": {"sha": HEAD}, "draft": False,
              }),
              patch.object(controller, "begin_check", return_value=ID),
              patch.object(controller, "current_target", return_value=(partial, {})),
              patch.object(controller, "require_unique_open_pr_head",
                           side_effect=ValueError("revoked or ambiguous PR")),
              patch.object(controller, "publish_check") as publish):
            self.assertEqual(controller.evaluate_target(REPO, PR, None, "b" * 40, RUN), 2)
        publish.assert_called_once()
        args, kwargs = publish.call_args
        self.assertEqual(args[:6], (REPO, HEAD, PR, ID, RUN, "failure"))
        self.assertNotIn("identity", kwargs)

    def test_controller_failure_after_create_completes_check_not_orphan(self):
        calls = []
        def api(path, *, method="GET", data=None):
            calls.append((method, path))
            if method == "GET" and path.endswith(f"/pulls/{PR}"):
                return {"head": {"sha": HEAD}}
            if method == "POST":
                return check_record()
            if method == "GET":
                return check_record()
            if method == "PATCH":
                return check_record(status="completed", conclusion="failure")
            raise AssertionError(f"unexpected {method} {path}")
        with (patch.object(controller.session_runner, "api", side_effect=api),
              patch.object(controller, "current_target", side_effect=ValueError("draft PR"))):
            self.assertEqual(controller.evaluate_target(REPO, PR, None, "b" * 40, RUN), 2)
        self.assertIn(("PATCH", f"/repos/{REPO}/check-runs/{ID}"), calls)

    def test_controller_closure_failure_is_reported(self):
        from io import StringIO
        output = StringIO()
        with (patch.object(controller.session_runner, "api", return_value={"head": {"sha": HEAD}}),
              patch.object(controller, "begin_check", return_value=ID),
              patch.object(controller, "current_target", side_effect=ValueError("draft PR")),
              patch.object(controller, "publish_check", side_effect=RuntimeError("connection")),
              patch("sys.stderr", output)):
            self.assertEqual(controller.evaluate_target(REPO, PR, None, "b" * 40, RUN), 2)
        self.assertIn("could not be finalized (RuntimeError)", output.getvalue())


    def test_all_six_issue_801_acceptance_criteria_are_extracted(self):
        """Regression: an unrecognized heading silently dropped three requirements."""
        import hashlib
        import json
        from tempfile import TemporaryDirectory

        from specification import extract_candidates

        issue_source = (ROOT / ".audit/entregar-issue/issue-801/specification-sources/"
                        "SRC-ISSUE-801.txt").read_text(encoding="utf-8")
        with TemporaryDirectory() as directory:
            tmp = Path(directory)
            source = tmp / "SRC-ISSUE-801.txt"
            source.write_text(issue_source, encoding="utf-8")
            snapshot = tmp / "specification-snapshot.json"
            snapshot.write_text(json.dumps({
                "schema_version": 1,
                "primary_source_id": "SRC-ISSUE-801",
                "sources": [{
                    "id": "SRC-ISSUE-801", "kind": "issue-body",
                    "path": source.name,
                    "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
                    "textual": True,
                }],
            }), encoding="utf-8")
            errors = []
            _, _, candidates = extract_candidates(snapshot, errors)
        self.assertFalse(errors, errors)
        self.assertEqual([c["source_line"] for c in candidates], [7, 8, 9, 10, 11, 12])


if __name__ == "__main__":
    unittest.main()
