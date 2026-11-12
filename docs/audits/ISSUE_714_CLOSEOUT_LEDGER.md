# Issue #714 — Technical closeout ledger (updated 10 November 2026)

Repository: crgasparoto-br/SolverFin. Issue: #714. Epic: #702. Delivery PR: #760, base develop.

**Status: PARTIAL. This ledger is not a certificate, independent audit or approval to merge.**

## Decision effective 10 November 2026 — prospective independent review

The owner approved a **prospective** replacement of the historical independent-certification requirement for PR #713. The old merged commit and its historical handoff remain immutable and **must not** be recorded as independently approved or retrospectively certified. Mark the historical review obligation as `superseded-by-prospective-review` only for the prospective closure procedure, never as `passed`.

The approved assurance is `operator-attested-session-review`, with `third_party_identity_proven=false` and `separate-context-declared-not-cryptographically-proven`. The operative sources are issues #714 and #762, `docs/adr/0019-operator-attested-session-review.md`, and `crgasparoto-br/skill@develop/docs/WEB_INDEPENDENT_AUDIT.md`.

The M2 bootstrap has installed matching trusted session-review policies in `develop` and `main` with `mode=enabled`. This is an opt-in to evaluation, **not** an approval or an exemption from positive/negative/regression controls, exact-SHA CI/Chrome, a current `critical` handoff, or an authenticated separate-session review. The required `Delivery V2 gate`, protected branches and prohibition of fake/retroactive approval stay unchanged.

For the current PR #760, **OBL-003, OBL-008 and OBL-021 remain deferred**, alongside the four new governance obligations OBL-023 through OBL-026. The issue remains **partial (19/26)**: 19 covered and 7 deferred, never 26 passed. The prospective baseline-and-delta review still requires an authenticated neutral packet, a real separate-session reference, JUnit positive/negative/regression controls and a trusted exact-SHA receipt. Keep #714/#702 open; do not regenerate or retroactively approve the historic #713 certificate.

A subsequent merge of `develop` into this PR is a material change. Previous CI, Chrome and handoff evidence applies only to its own frozen SHAs: regenerate the current-target handoff and read back the new material/HEAD before inviting a separate-context audit. A successful merge probe does not satisfy any review requirement.

## Current canonical inventory (10 November 2026)

The issue #714 canonical body (source SHA-256 `43f5cf4ea9cb1662958682d8632d9e81e149b1638ae49bb7a24b1544b675ee07`) now contains **26 obligations**. Its current closure inventory is **19 covered / 7 deferred**; the four added prospective-governance candidates are not retroactive approvals.

| Current classification | Obligation IDs                                                | Resolution boundary                                                                                                                                |
| ---------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Covered (19)           | OBL-001, OBL-002, OBL-004–007, OBL-009–020, OBL-022           | Historical/reference and documented material with existing supporting evidence; independent acceptance is not inferred                             |
| Deferred (7)           | OBL-003, OBL-008, OBL-021, OBL-023, OBL-024, OBL-025, OBL-026 | Prospective audit of integrated baseline and exact PR delta, session provenance, protected checks, negative and revocation trials, trusted receipt |

The previous `critical` certificate (`c4979487f60fea7419c2936972e03aa1d1df5552` on `develop@ab3083b3f268292c654e653b811a54612e123cc6`) **does not certify the later material**, irrespective of green CI. The material must have a **new direct result-only child**, authenticated exact-SHA CI/Chrome and canonical Skill preflight before separate-context review. Do not mark the 7 deferred obligations as passed merely because the handoff is READY.

The session-review policies are installed in `develop` and `main`, but their effective rulesets #25007371 and #18882937 still require only `Delivery V2 gate`. Operational positive/negative/revocation validation and explicit read-back of `Verify session review (exact SHA)` as an additional required check remain prerequisites under issue #762. `mode=enabled` alone does not implement the branch protection.

## Historical 4 November implementation ledger (retained for evidence)

The product's Golden Screen was visually accepted on 14 October 2026. PR #713 was merged as b50ee44238dd9e63129ebc87a3ee31c0965b19f8 and PR #721 as 8a56d2f3bdb59d5b0d7abeceee63601c1dfbffe5. Those integrations do not prove independent technical approval. The current PR changes only documentation plus a documentary regression test; it does not modify financial behavior.

## Historical 4 November inventory extracted by the official skill (superseded)

On 4 November, the official build_specification_snapshot.py and init_requirement_closure.py extracted 22 obligations from the then-current #714 issue description. A local validation trial with 19 covered and 3 deferred obligations passed validate_specification_coverage.py, but this was **not** a terminal or published certificate. The standard evidence validator refused the lower profile because it detected critical requirements (OBL-007, OBL-009, OBL-012, OBL-013, OBL-020). **Do not downgrade these risks or claim READY.**

| ID      | Scope and available proof                                                    | Final state                                     |
| ------- | ---------------------------------------------------------------------------- | ----------------------------------------------- |
| OBL-001 | Historical material SHA / handoff child recorded on #714; integrated PR #713 | Historical evidence                             |
| OBL-002 | Old CI #38768319333 and Chrome #38768319363 exact historical head            | Historical evidence                             |
| OBL-003 | Independent audit not established by merge or CI                             | **Pending independent audit**                   |
| OBL-004 | Product-approved baseline and separate #715–#719 propagation                 | Documented                                      |
| OBL-005 | Preserve 14/10 visual approval                                               | Documented                                      |
| OBL-006 | Baseline SHA, Chrome and centered dialogs registered on #702                 | Documented                                      |
| OBL-007 | Individual / all-account transfers and currency                              | **Critical semantic gate pending**              |
| OBL-008 | Final independent audit on historical PR #713                                | **Pending independent decision**                |
| OBL-009 | Historic #702/#713 handoff; new #714/#760 binding needed                     | **Critical isolation and handoff gate pending** |
| OBL-010 | Exact PR #713/#721 integrated merge refs                                     | Documented                                      |
| OBL-011 | Distinct approval stages                                                     | Documented                                      |
| OBL-012 | Current exact-SHA certified handoff, not inherited                           | **Critical reference-liveness gate pending**    |
| OBL-013 | Transfers on individual account cards                                        | **Critical semantic gate pending**              |
| OBL-014 | Closeout report distinguishes approval/CI/audit/certificate                  | Documented here                                 |
| OBL-015 | Golden Screen approved, not candidate                                        | Documented                                      |
| OBL-016 | No statement that #714 implements propagation                                | Documented                                      |
| OBL-017 | Product acceptance source from #702                                          | Historical evidence                             |
| OBL-018 | Individual, all accounts and FX selected-currency semantics                  | Documented                                      |
| OBL-019 | New/edit/clone dialogs centered post-mockup                                  | Historical PR #713                              |
| OBL-020 | Canonical documentation consistent with tested behavior                      | **Critical semantic gate pending**              |
| OBL-021 | Certified material and independent PR audit                                  | **Pending independent decision**                |
| OBL-022 | Baseline published to epic #702                                              | Historical evidence                             |

## Regression test

scripts/statement-visual/issue-714-documentation-contract.test.mjs defines 22 positive checks and for each one a text-removal negative mutation and restoration check. It runs automatically as part of npm run visual-coverage-contract:check (glob: scripts/statement-visual/\*.test.mjs), reached by Repository CI. This is only a documentation contract; historical Chrome checks from PR #721 cannot be relabeled exact-SHA evidence for this new PR.

## Verifiable remote references

- Product acceptance: https://github.com/crgasparoto-br/SolverFin/issues/702#issuecomment-6181511794
- Historical PR #713: https://github.com/crgasparoto-br/SolverFin/pull/713
- Historical PR #721: https://github.com/crgasparoto-br/SolverFin/pull/721
- Historical Chrome with nine viewport/dialog scenarios and 18 touch-target mutations: https://github.com/crgasparoto-br/SolverFin/actions/runs/38789336146
- Repository CI on preceding material 393834e82e00db27f025a5a0bdbde7bea9543e7e: https://github.com/crgasparoto-br/SolverFin/actions/runs/41844054089

## Remaining blocking work

1. Rebuild the closure and exact-SHA critical attack-matrix, saturation, inherited-controls and relevant provenance using crgasparoto-br/skill@develop. Do not treat a lexical/documentary mutation as a substitute for a financial or browser behavior test.
2. Run the canonical official builders and prepublication validation for #714 / PR #760 on the current material SHA. Publish only a valid direct result-only child and verify the remote terminal handoff. The inherited .audit/entregar-issue/handoff-ready.json on the base belongs to #728 / PR #759 and cannot be reused.
3. Confirm all required new-head CI and visual evidence according to the frozen scope. Historical Chrome runs are supporting evidence, not new-head proof.
4. Obtain and register technical review in a genuinely independent context. Only then decide on closing #714; keep epic #702 open for other pending subissues.

CI passing by itself is not independent certification. No approval, merge, release or issue closure is declared by this ledger.
