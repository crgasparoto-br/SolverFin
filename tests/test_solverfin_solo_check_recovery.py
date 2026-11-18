"""Recovery never approves, forges, or modifies a check outside the exact allowlist."""
from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import repair_legacy_solo_checks as recovery

ID, RUN = next(iter(recovery.ORPHANS.items()))


def sample_check(*, check_id=ID, run_id=RUN, status="in_progress", conclusion=None):
    return {
        "id": check_id, "name": recovery.CHECK_NAME,
        "head_sha": recovery.HEAD, "app": {"id": recovery.APP_ID},
        "external_id": f"sa:{run_id}:p{recovery.PR}:{recovery.HEAD}",
        "details_url": f"https://github.com/{recovery.REPOSITORY}/runs/{check_id}",
        "status": status, "conclusion": conclusion,
    }


def sample_run(*, run_id=RUN):
    return {
        "id": run_id, "workflow_id": recovery.WORKFLOW_ID,
        "name": "Verify solo Ed25519 audit attestation",
        "status": "completed", "conclusion": "failure",
        "repository": {"full_name": recovery.REPOSITORY},
        "event": "workflow_run",
    }


class OrphanRecoveryTests(unittest.TestCase):
    def test_allowlist_is_six_exact_check_run_pairs(self):
        self.assertEqual(len(recovery.ORPHANS), 6)
        self.assertEqual(len(set(recovery.ORPHANS.values())), 6)

    def test_validated_failure_is_patched_only_to_terminal_failure(self):
        writes = []
        def api(path, *, method="GET", payload=None):
            if method == "PATCH":
                writes.append((path, payload))
                return sample_check(status="completed", conclusion="failure")
            if "/actions/runs/" in path:
                return sample_run()
            return sample_check()
        with patch.object(recovery, "api", side_effect=api):
            self.assertEqual(recovery.recover_one(ID, RUN), "recovered as failure")
        self.assertEqual(len(writes), 1)
        self.assertEqual(writes[0][1]["conclusion"], "failure")
        self.assertEqual(writes[0][1]["status"], "completed")
        self.assertEqual(writes[0][0], f"/repos/{recovery.REPOSITORY}/check-runs/{ID}")

    def test_completed_failure_is_idempotent(self):
        with patch.object(recovery, "api", return_value=sample_check(
            status="completed", conclusion="failure")) as api:
            self.assertEqual(recovery.recover_one(ID, RUN), "already failed")
        api.assert_called_once()

    def test_rejects_tampered_check_app_head_run_or_status(self):
        for field, wrong in (("id", ID + 1), ("head_sha", "0" * 40),
                             ("external_id", "sa:wrong"), ("details_url", "https://evil"),
                             ("status", "queued")):
            with self.subTest(field=field):
                target = sample_check()
                target[field] = wrong
                with patch.object(recovery, "api", return_value=target) as api:
                    with self.assertRaises(ValueError):
                        recovery.recover_one(ID, RUN)
                api.assert_called_once()

    def test_rejects_unverified_trusted_workflow_run(self):
        for field, wrong in (("workflow_id", 1), ("conclusion", "success"),
                             ("status", "in_progress"), ("event", "push")):
            with self.subTest(field=field):
                run = sample_run()
                run[field] = wrong
                def api(path, *, method="GET", payload=None):
                    return run if "/actions/runs/" in path else sample_check()
                with patch.object(recovery, "api", side_effect=api) as caller:
                    with self.assertRaises(ValueError):
                        recovery.recover_one(ID, RUN)
                self.assertEqual(caller.call_count, 2)

    def test_only_protected_develop_can_run(self):
        for ref, protected in (("refs/heads/main", "true"),
                               ("refs/heads/develop", "false")):
            with self.subTest(ref=ref, protected=protected):
                with (patch.dict(os.environ, {"GITHUB_REPOSITORY": recovery.REPOSITORY,
                                             "GITHUB_REF": ref,
                                             "GITHUB_REF_PROTECTED": protected}),
                      patch.object(recovery, "recover_one") as mutate):
                    with self.assertRaises(ValueError):
                        recovery.main()
                    mutate.assert_not_called()


if __name__ == "__main__":
    unittest.main()
