"""Negative and positive checks for the SolverFin-specific exact-HEAD CI binding."""
from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("verify_solo_attestation.py")
SPEC = importlib.util.spec_from_file_location("solverfin_solo", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
solo = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(solo)

REPO = "crgasparoto-br/SolverFin"
BASE = "a" * 40
HEAD = "b" * 40
PREVIEW = "c" * 40


def fixture():
    target = {"pull_request": 761, "base_ref": "develop", "base_sha": BASE,
              "head_sha": HEAD, "merge_preview_sha": PREVIEW}
    check = {"id": 111, "name": "Delivery V2 gate", "head_sha": HEAD,
             "status": "completed", "conclusion": "success",
             "details_url": f"https://github.com/{REPO}/actions/runs/444/job/555",
             "app": {"id": solo.ACTIONS_APP_ID}}
    job = {"id": 555, "run_id": 444, "name": "Delivery V2 gate",
           "status": "completed", "conclusion": "success", "head_sha": HEAD,
           "check_run_url": f"https://api.github.com/repos/{REPO}/check-runs/111"}
    run = {"id": 444, "event": "pull_request", "status": "completed",
           "conclusion": "success", "head_sha": HEAD, "name": "Repository CI",
           "path": ".github/workflows/delivery-v2-ci.yml",
           "workflow_id": 777, "head_repository": {"full_name": REPO},
           "pull_requests": [{"number": 761,
                              "base": {"ref": "develop", "sha": BASE},
                              "head": {"sha": HEAD}}]}
    workflow = {"id": 777, "path": ".github/workflows/delivery-v2-ci.yml"}
    responses = {
        f"/repos/{REPO}/actions/jobs/555": job,
        f"/repos/{REPO}/actions/runs/444": run,
        f"/repos/{REPO}/actions/workflows/delivery-v2-ci.yml": workflow,
    }
    return target, [check], responses


def validate(target, checks, responses):
    def api(path):
        return responses[path]
    return solo.validate_delivery_gate(REPO, target, checks, api)


class ExactShaDeliveryGateTests(unittest.TestCase):
    def test_positive_exact_binding(self):
        target, checks, responses = fixture()
        self.assertEqual(validate(target, checks, responses), 111)

    def test_selects_newest_run_not_stale_green_run(self):
        target, checks, responses = fixture()
        previous = dict(checks[0], id=100, conclusion="failure")
        self.assertEqual(validate(target, [previous, checks[0]], responses), 111)
        checks[0]["conclusion"] = "failure"
        with self.assertRaisesRegex(ValueError, "not terminally successful"):
            validate(target, [previous, checks[0]], responses)

    def test_missing_or_duplicate_gate_blocks(self):
        target, checks, responses = fixture()
        with self.assertRaisesRegex(ValueError, "missing"):
            validate(target, [], responses)
        with self.assertRaisesRegex(ValueError, "duplicate IDs"):
            validate(target, [checks[0], dict(checks[0])], responses)

    def test_wrong_app_blocks(self):
        target, checks, responses = fixture()
        checks[0]["app"]["id"] = 123
        with self.assertRaises(ValueError):
            validate(target, checks, responses)

    def test_pending_or_failed_check_blocks(self):
        for status, conclusion in [("queued", None), ("completed", "failure")]:
            with self.subTest(status=status):
                target, checks, responses = fixture()
                checks[0].update(status=status, conclusion=conclusion)
                with self.assertRaises(ValueError):
                    validate(target, checks, responses)

    def test_wrong_head_blocks_at_each_layer(self):
        for layer in ("check", "job", "run", "linked"):
            with self.subTest(layer=layer):
                target, checks, responses = fixture()
                if layer == "check":
                    checks[0]["head_sha"] = "d" * 40
                elif layer == "job":
                    responses[f"/repos/{REPO}/actions/jobs/555"]["head_sha"] = "d" * 40
                elif layer == "run":
                    responses[f"/repos/{REPO}/actions/runs/444"]["head_sha"] = "d" * 40
                else:
                    responses[f"/repos/{REPO}/actions/runs/444"]["pull_requests"][0]["head"]["sha"] = "d" * 40
                with self.assertRaises(ValueError):
                    validate(target, checks, responses)

    def test_wrong_base_or_pr_blocks(self):
        for key, value in (("number", 762), ("base.ref", "main"), ("base.sha", "e" * 40)):
            with self.subTest(key=key):
                target, checks, responses = fixture()
                linked = responses[f"/repos/{REPO}/actions/runs/444"]["pull_requests"][0]
                if "." in key:
                    parent, child = key.split(".")
                    linked[parent][child] = value
                else:
                    linked[key] = value
                with self.assertRaises(ValueError):
                    validate(target, checks, responses)

    def test_reject_forged_workflow_or_event(self):
        for field, value in (("event", "push"), ("name", "Impersonated CI"),
                             ("path", ".github/workflows/evil.yml"),
                             ("workflow_id", 999), ("head_repository", {"full_name": "other/repo"})):
            with self.subTest(field=field):
                target, checks, responses = fixture()
                responses[f"/repos/{REPO}/actions/runs/444"][field] = value
                with self.assertRaises(ValueError):
                    validate(target, checks, responses)

    def test_reject_check_run_job_binding_drift(self):
        target, checks, responses = fixture()
        responses[f"/repos/{REPO}/actions/jobs/555"]["check_run_url"] = (
            f"https://api.github.com/repos/{REPO}/check-runs/112")
        with self.assertRaisesRegex(ValueError, "not bound"):
            validate(target, checks, responses)

    def test_reject_wrong_job_result(self):
        for field, value in (("run_id", 111), ("name", "Fake Gate"),
                             ("conclusion", "failure"), ("head_sha", "e" * 40)):
            with self.subTest(field=field):
                target, checks, responses = fixture()
                responses[f"/repos/{REPO}/actions/jobs/555"][field] = value
                with self.assertRaises(ValueError):
                    validate(target, checks, responses)

    def test_reject_malicious_job_urls(self):
        urls = [
            "http://github.com/" + REPO + "/actions/runs/444/job/555",
            "https://github.com.evil.invalid/" + REPO + "/actions/runs/444/job/555",
            "https://github.com/other/repo/actions/runs/444/job/555",
            "https://github.com/" + REPO + "/actions/runs/444/job/555?token=1",
            "https://github.com/" + REPO + "/actions/runs/444/job/555#more",
            "https://github.com/" + REPO + "/actions/runs/444/job/555/../../4",
        ]
        for url in urls:
            with self.subTest(url=url):
                target, checks, responses = fixture()
                checks[0]["details_url"] = url
                with self.assertRaises(ValueError):
                    validate(target, checks, responses)

    def test_reject_malformed_target_sha(self):
        target, checks, responses = fixture()
        target["base_sha"] = "not-a-sha"
        with self.assertRaises(ValueError):
            validate(target, checks, responses)


class TrustedSourceTests(unittest.TestCase):
    def setUp(self):
        self.root = MODULE_PATH.parents[2]
        self.skill_root = self.root / "skill-fixture-not-executed"
        self.sha = "a" * 40

    def official(self, tamper=False, change_default=False):
        from types import SimpleNamespace
        import json
        def content(repo, path, sha):
            assert repo == REPO and sha == self.sha
            data = (self.root / path).read_bytes()
            if tamper and path == solo.WORKFLOW:
                data += b"# tampered\n"
            return data, "b" * 40
        def main_head(repo):
            assert repo == REPO
            return "d" * 40 if change_default else "c" * 40
        return SimpleNamespace(
            session=SimpleNamespace(content=content,
                                    canonical=lambda obj: json.dumps(obj, sort_keys=True).encode()),
            source=SimpleNamespace(default_branch_head=main_head),
        )

    def runtime(self):
        return {
            "GITHUB_WORKFLOW_SHA": self.sha,
            "GITHUB_REF_PROTECTED": "true",
            "GITHUB_WORKFLOW_REF": f"{REPO}/{solo.WORKFLOW}@refs/heads/main",
        }

    def test_protected_source_must_match_base_bytes(self):
        from unittest.mock import patch
        with patch.dict("os.environ", self.runtime(), clear=False), patch.object(solo, "git_sha") as git:
            git.side_effect = [self.sha, solo.SKILL_SHA]
            result = solo.source_state(REPO, self.sha, self.sha, self.root,
                                       self.skill_root, self.official())
            self.assertEqual(result["skill_sha"], solo.SKILL_SHA)
            self.assertEqual(result["default_branch_sha"], "c" * 40)

    def test_tampered_base_source_blocks(self):
        from unittest.mock import patch
        with patch.dict("os.environ", self.runtime(), clear=False), patch.object(solo, "git_sha") as git:
            git.side_effect = [self.sha, solo.SKILL_SHA]
            with self.assertRaisesRegex(ValueError, "differs from protected PR base"):
                solo.source_state(REPO, self.sha, self.sha, self.root,
                                  self.skill_root, self.official(tamper=True))

    def test_unprotected_workflow_ref_blocks(self):
        from unittest.mock import patch
        invalid = dict(self.runtime(), GITHUB_REF_PROTECTED="false")
        with patch.dict("os.environ", invalid, clear=False):
            with self.assertRaisesRegex(ValueError, "not protected"):
                solo.source_state(REPO, self.sha, self.sha, self.root,
                                  self.skill_root, self.official())

    def test_changed_default_branch_blocks_revalidation(self):
        from unittest.mock import patch
        state = {"workflow_sha": self.sha, "skill_sha": solo.SKILL_SHA,
                 "base_sha": self.sha, "default_branch_sha": "c" * 40}
        with patch.object(solo, "git_sha") as git:
            git.side_effect = [self.sha, solo.SKILL_SHA]
            with self.assertRaisesRegex(ValueError, "default branch moved"):
                solo.recheck_source(REPO, state, self.root, self.skill_root,
                                    self.official(change_default=True))


if __name__ == "__main__":
    unittest.main()
