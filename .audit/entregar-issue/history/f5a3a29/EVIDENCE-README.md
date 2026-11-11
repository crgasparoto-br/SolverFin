# Issue 745 delivery evidence

Material candidate: `c696281f6dcbc802098d05786266c26ace9e7765`.
Target: crgasparoto-br/SolverFin issue 745 / PR 746, base develop.

The original user-uploaded binary was executed privately: SHA256 `44b7106b387f515f4dd22983d53529c68cf1037ec96ab619b6df6c28c3e95956`, 61469 bytes, 3 pages, 38 movements. All 38 rows and running-balance transitions were compared against a separate pdftotext -layout reconstruction. Reports publish counts, booleans and hashes only. The binary, extracted values, operation identifiers, descriptions and page images are intentionally NOT in this repository or CI. An auditor needs the authorized private input to repeat original-document execution.

`original-preview.json` is a production-service test with an explicit database target-lookup double. It is NOT a real database, HTTP or browser session. Existing API/PostgreSQL regression coverage comes separately from authenticated exact-head Repository CI run 40397886122; workspace export run 40397886198 supplies trusted Git objects.

Focused local command:
```sh
node --test .tmp-tests/domain/document-imports.test.js .tmp-tests/domain/mercado-pago-pdf.test.js .tmp-tests/closure/pdf-text-extraction.test.js
```
23 tests passed, no skips or failures. The log with source test paths is `evidence/issue-745-focused-execution.txt`. The original negative controls remove an actual movement ID below the table header, invalidate its date, and truncate the original bytes; each blocks with no partial proposals.

The foreign issue-742 inherited artifacts remain historical, outside this certificate. Subject-specific inherited/escape filenames preserve their history without importing it into issue 745. The previous issue-745 escape snapshot is explicitly normalized from the immutable prior independent report; it is not invented prior execution evidence.

This certificate proves delivery readiness and internal remediation. It does NOT grant independent approval, merge, release or issue closure. A separate auditor must evaluate the certified material and these evidence boundaries.

## A-006 targeted recertification

The prior read-only audit report is retained verbatim in `evidence/a006-source-audit.md`. The semantic-effect saturation now references every declared surface and preserves the existing control evidence. The failed official saturation command was reproduced (exit 2), fixed (exit 0), and checked with missing/disabled-family negative controls. `REGRESSION-A-006` prevents this packet omission from being silently forgotten. The previous source report, escape ledger and inherited controls remain available in the previous-* files. No product code, test source, original PDF measurement or financial data changed.

This remediation is internal verification only. LIM-001 remains an auditor runtime limitation: the private original PDF was not made available to this remediation, and its prior exact-material evidence is preserved rather than relabeled as a new independent replay. The original PR and develop base are retained.
