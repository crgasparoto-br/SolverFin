"""SolverFin-specific fail-closed contract tests for solo audit bootstrap.

No GitHub API is contacted. Full authenticated flow must be proven separately
on a protected workflow run before adopting the check in branch protection.
"""
from __future__ import annotations

import hashlib
import sys
import unittest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "entregar-issue" / "scripts"))
import solo_audit_check_runs as solo_checks
import solo_audit_github as solo_github
sys.path.insert(0, str(ROOT / "auditar-issue" / "scripts"))
from audit_signature import sign_report, verify_report
import verify_independent_pr_audit as trusted_checks

HEAD = "a" * 40
BASE = "b" * 40
APP_ID = 15368


def check(name: str, number: int, *, status: str = "completed",
          conclusion: str = "success", app_id: int = APP_ID):
    return {
        "id": number, "name": name, "head_sha": HEAD,
        "status": status, "conclusion": conclusion, "app": {"id": app_id},
    }


class SolverFinTrustedChecks(unittest.TestCase):
    def test_expected_jobs_are_bound_to_protected_workflow_paths(self):
        self.assertEqual(
            trusted_checks.TECHNICAL,
            ("Delivery V2 gate", "Repository CI gate"),
        )
        self.assertEqual(trusted_checks.HANDOFF, "export")
        self.assertEqual(trusted_checks.EXPECTED_WORKFLOWS, {
            "Delivery V2 gate": ".github/workflows/delivery-v2-ci.yml",
            "Repository CI gate": ".github/workflows/delivery-v2-ci.yml",
            "export": ".github/workflows/delivery-audit-workspace.yml",
        })
        for path in trusted_checks.EXPECTED_WORKFLOWS.values():
            self.assertTrue((ROOT / path).is_file(), path)

    def test_develop_requires_three_green_checks(self):
        rows = [check("Delivery V2 gate", 1),
                check("Repository CI gate", 2), check("export", 3)]
        trusted_checks.required_checks_green(
            {"total_count": len(rows), "check_runs": rows}, HEAD, "develop",
            lambda name, item: name == item["name"],
        )

    def test_main_requires_two_green_checks(self):
        rows = [check("Delivery V2 gate", 1), check("Repository CI gate", 2)]
        trusted_checks.required_checks_green(
            {"total_count": len(rows), "check_runs": rows}, HEAD, "main",
            lambda name, item: True,
        )

    def test_missing_develop_export_fails_closed(self):
        rows = [check("Delivery V2 gate", 1), check("Repository CI gate", 2)]
        with self.assertRaisesRegex(ValueError, "missing: export"):
            trusted_checks.required_checks_green(
                {"total_count": len(rows), "check_runs": rows}, HEAD, "develop",
                lambda name, item: True,
            )

    def test_latest_failed_rerun_cannot_hide_behind_old_green(self):
        rows = [check("Delivery V2 gate", 1), check("Delivery V2 gate", 4,
                conclusion="failure"), check("Repository CI gate", 2),
                check("export", 3)]
        with self.assertRaisesRegex(ValueError, "not green: Delivery V2 gate"):
            trusted_checks.required_checks_green(
                {"total_count": len(rows), "check_runs": rows}, HEAD, "develop",
                lambda name, item: True,
            )

    def test_app_spoofing_and_wrong_head_fail_closed(self):
        rows = [check("Delivery V2 gate", 1, app_id=42),
                check("Repository CI gate", 2), check("export", 3)]
        with self.assertRaisesRegex(ValueError, "missing: Delivery V2 gate"):
            trusted_checks.required_checks_green(
                {"total_count": len(rows), "check_runs": rows}, HEAD, "develop",
                lambda name, item: True,
            )
        rows[0]["app"]["id"] = APP_ID
        rows[0]["head_sha"] = BASE
        with self.assertRaisesRegex(ValueError, "missing: Delivery V2 gate"):
            trusted_checks.required_checks_green(
                {"total_count": len(rows), "check_runs": rows}, HEAD, "develop",
                lambda name, item: True,
            )

    def test_truncated_inventory_cannot_be_approved(self):
        rows = [check("Delivery V2 gate", 1), check("Repository CI gate", 2),
                check("export", 3)]
        with self.assertRaisesRegex(ValueError, "truncated"):
            trusted_checks.required_checks_green(
                {"total_count": 4, "check_runs": rows}, HEAD, "develop",
                lambda name, item: True,
            )

    def test_solo_evidence_requires_real_check_ids(self):
        rows = [check("Delivery V2 gate", 1), check("Repository CI gate", 2),
                check("export", 3), check("Verify solo audit attestation (exact SHA)", 4)]
        identity = {"head_sha": HEAD, "base_ref": "develop",
                    "base_sha": BASE, "pull_request": 100}
        with (patch.object(solo_checks, "github_token", return_value="mock-token"),
              patch.object(solo_checks.session_runner, "pages", return_value=rows),
              patch.object(solo_checks, "page_all", return_value=[]),
              patch.object(solo_checks, "trusted_workflow_check", return_value=True)):
            self.assertEqual(solo_checks.required_evidence("crgasparoto-br/SolverFin", identity),
                             [1, 2, 3])

    def test_solo_evidence_rejects_changes_requested(self):
        rows = [check("Delivery V2 gate", 1), check("Repository CI gate", 2),
                check("export", 3)]
        identity = {"head_sha": HEAD, "base_ref": "develop",
                    "base_sha": BASE, "pull_request": 100}
        reviews = [{"id": 1, "user": {"login": "reviewer"},
                    "state": "CHANGES_REQUESTED", "submitted_at": "2026-01-01T00:00:00Z"}]
        with (patch.object(solo_checks, "github_token", return_value="mock-token"),
              patch.object(solo_checks.session_runner, "pages", return_value=rows),
              patch.object(solo_checks, "page_all", return_value=reviews),
              patch.object(solo_checks, "trusted_workflow_check", return_value=True)):
            with self.assertRaisesRegex(ValueError, "request for changes"):
                solo_checks.required_evidence("crgasparoto-br/SolverFin", identity)



    def test_open_pr_uniqueness_blocks_shared_head_but_not_closed_or_other_sha(self):
        repo = "crgasparoto-br/SolverFin"
        associations = [
            {"number": 765, "state": "open", "head": {"sha": HEAD}},
            {"number": 771, "state": "open", "head": {"sha": HEAD}},
        ]
        with patch.object(solo_github.session_runner, "pages", return_value=associations):
            with self.assertRaisesRegex(ValueError, "multiple open PRs share one HEAD"):
                solo_github.require_unique_open_pr_head(repo, 765, HEAD)

            associations[1]["state"] = "closed"
            solo_github.require_unique_open_pr_head(repo, 765, HEAD)

            associations[1]["state"] = "open"
            associations[1]["head"]["sha"] = BASE
            solo_github.require_unique_open_pr_head(repo, 765, HEAD)

            associations[0]["head"]["sha"] = BASE
            with self.assertRaisesRegex(ValueError, "omitted the current PR"):
                solo_github.require_unique_open_pr_head(repo, 765, HEAD)

    def test_workflow_runs_on_solverfin_sources_without_candidate_checkout(self):
        text = (ROOT / ".github/workflows/solo-audit-attestation.yml").read_text()
        self.assertIn(
            'workflows: ["Repository CI", "Delivery audit workspace", "Statement visual validation"]',
            text,
        )
        self.assertIn("ref: ${{ github.workflow_sha }}", text)
        self.assertNotIn("workflow_dispatch:", text)
        self.assertIn("github.ref_protected", text)


class SigningContract(unittest.TestCase):
    def setUp(self):
        self.private = Ed25519PrivateKey.generate()
        public = self.private.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        self.private_pem = self.private.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
        self.registry = {
            "schema_version": 1,
            "auditors": [{
                "key_id": "solverfin-test-key",
                "enabled": True,
                "repositories": ["crgasparoto-br/SolverFin"],
                "public_key_pem": public.decode("ascii"),
                "public_key_sha256": hashlib.sha256(public).hexdigest(),
            }],
        }
        self.report = {
            "repository": "crgasparoto-br/SolverFin", "issue": 692,
            "pull_request": 761,
            "head_sha": HEAD, "base_sha": BASE,
            "assurance_mode": "single-operator-separate-context",
            "independent": False, "same_conversation": False,
            "operator_github_id": 1,
        }
        sign_report(
            self.report, self.private_pem, None, "solverfin-test-key",
            "2026-11-05T13:00:00+00:00",
        )

    def test_valid_ed25519_report_verifies_against_exact_repository(self):
        self.assertEqual(verify_report(self.report, self.registry, exact_repository_only=True), [])

    def test_mutated_signed_payload_is_rejected(self):
        self.report["head_sha"] = BASE
        self.assertTrue(verify_report(self.report, self.registry, exact_repository_only=True))

    def test_wildcard_registry_scope_is_rejected(self):
        self.registry["auditors"][0]["repositories"] = ["crgasparoto-br/*"]
        self.assertTrue(verify_report(self.report, self.registry, exact_repository_only=True))

    def test_forged_public_key_fingerprint_is_rejected(self):
        self.registry["auditors"][0]["public_key_sha256"] = "0" * 64
        self.assertTrue(verify_report(self.report, self.registry, exact_repository_only=True))




class AuthenticatedActionsJobTests(unittest.TestCase):
    """Carry forward unique #765 provenance attacks against the #766 controller."""

    REPOSITORY = "crgasparoto-br/SolverFin"
    PR = 765

    def setUp(self):
        repo = self.REPOSITORY
        self.check = {
            "id": 111, "name": "Delivery V2 gate",
            "head_sha": HEAD, "status": "completed", "conclusion": "success",
            "details_url": f"https://github.com/{repo}/actions/runs/444/job/555",
            "app": {"id": APP_ID}, "check_suite": {"id": 999},
        }
        self.run = {
            "path": ".github/workflows/delivery-v2-ci.yml",
            "name": "Repository CI", "event": "pull_request",
            "head_sha": HEAD, "head_repository": {"full_name": repo},
            "check_suite_id": 999,
            "status": "completed", "conclusion": "success",
            "pull_requests": [{"number": self.PR, "base": {"sha": BASE}}],
        }
        self.job = {
            "id": 555, "run_id": 444, "name": "Delivery V2 gate",
            "head_sha": HEAD, "status": "completed", "conclusion": "success",
            "check_run_url": f"https://api.github.com/repos/{repo}/check-runs/111",
        }

    def verify(self):
        repo = self.REPOSITORY
        api = {
            f"/repos/{repo}/actions/runs/444": self.run,
            f"/repos/{repo}/actions/jobs/555": self.job,
        }
        with (patch.object(trusted_checks, "github", side_effect=lambda p, _token: api[p]),
              patch.object(trusted_checks, "verify_trusted_workflow_source") as source):
            result = trusted_checks.trusted_workflow_check(
                repo, self.PR, "Delivery V2 gate", self.check, HEAD, BASE,
                "test-token",
            )
            if result:
                source.assert_called_once_with(
                    repo, ".github/workflows/delivery-v2-ci.yml", BASE,
                    HEAD, "test-token",
                )
            return result

    def test_valid_authenticated_run_job_and_check(self):
        self.assertTrue(self.verify())

    def test_reject_malicious_details_url_without_querying(self):
        original = self.check["details_url"]
        for forged in (
            original.replace("github.com/", "github.com.evil.test/"),
            original + "?redirect=1",
            original.replace("/actions/runs/444/", "/actions/runs/0/"),
            original.replace("/actions/runs/444/", "/actions/runs/444/evil/"),
        ):
            with self.subTest(forged=forged):
                self.check["details_url"] = forged
                self.assertFalse(self.verify())
        self.check["details_url"] = original

    def test_reject_forged_run_workflow_identity_and_origin(self):
        variations = (
            ("path", ".github/workflows/other.yml"),
            ("name", "Fake CI"),
            ("event", "push"),
            ("head_sha", BASE),
        )
        for field, forged in variations:
            with self.subTest(field=field):
                self.setUp()
                self.run[field] = forged
                self.assertFalse(self.verify())
        self.setUp()
        self.run["head_repository"]["full_name"] = "attacker/SolverFin"
        self.assertFalse(self.verify())

    def test_reject_wrong_pr_base_and_check_suite(self):
        self.run["pull_requests"][0]["number"] = 999
        self.assertFalse(self.verify())
        self.setUp()
        self.run["pull_requests"][0]["base"]["sha"] = HEAD
        self.assertFalse(self.verify())
        self.setUp()
        self.run["check_suite_id"] = 998
        self.assertFalse(self.verify())

    def test_reject_wrong_job_identity_head_and_check_binding(self):
        variations = (
            ("id", 556), ("run_id", 445),
            ("name", "Fake job"), ("head_sha", BASE),
            ("check_run_url",
             "https://api.github.com/repos/crgasparoto-br/SolverFin/check-runs/999"),
        )
        for field, forged in variations:
            with self.subTest(field=field):
                self.setUp()
                self.job[field] = forged
                self.assertFalse(self.verify())

    def test_reject_false_success_or_stale_job_result(self):
        self.job["status"] = "in_progress"
        with self.assertRaisesRegex(ValueError, "outcome mismatch"):
            self.verify()
        self.setUp()
        self.run["conclusion"] = "failure"
        with self.assertRaisesRegex(ValueError, "not green"):
            self.verify()

    def test_reject_candidate_modified_ci_workflow(self):
        from unittest.mock import Mock
        repo = self.REPOSITORY
        api = {
            f"/repos/{repo}/actions/runs/444": self.run,
            f"/repos/{repo}/actions/jobs/555": self.job,
        }
        with (patch.object(trusted_checks, "github", side_effect=lambda p, _token: api[p]),
              patch.object(trusted_checks, "verify_trusted_workflow_source",
                           side_effect=ValueError("required workflow differs from trusted base"))):
            with self.assertRaisesRegex(ValueError, "differs from trusted base"):
                trusted_checks.trusted_workflow_check(
                    repo, self.PR, "Delivery V2 gate", self.check, HEAD, BASE,
                    "test-token",
                )

    def test_single_trusted_controller_not_a_second_parallel_gate(self):
        workflow = (ROOT / ".github/workflows/solo-audit-attestation.yml").read_text()
        self.assertIn("scripts/verify_solo_audit_attestation.py", workflow)
        self.assertNotIn("scripts/audit/verify_solo_attestation.py", workflow)
        self.assertFalse((ROOT / "scripts/audit/verify_solo_attestation.py").exists())
        self.assertFalse((ROOT / "scripts/audit/test_verify_solo_attestation.py").exists())


if __name__ == "__main__":
    unittest.main()
