# Issue 599 — change summary

- Material head: `45b779e6e760ea02f7dafe24c794290e7845ed39`
- Persisted monetary inventory: 11 fields across both Prisma schema files.
- Persistence: exact `INTEGER -> BIGINT` widening with safe-JSON-range checks.
- Runtime: explicit PostgreSQL `int8` parser and guarded aggregates.
- Presentation: exact minor-unit formatting without binary division loss.
- Migration lifecycle: remuneration adjustment trigger is dropped only for the type change and recreated canonically.
- Tests: boundaries, large aggregates, DB round-trip, DB rejection, trigger survival and UI values above 32-bit.
- Remote snapshot: CI and statement visual runs were in progress on the final material head; no polling was performed.
