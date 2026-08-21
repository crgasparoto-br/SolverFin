# Exact-head delivery evidence — Issue 599 remediation

Material SHA: `add47e998e7b17f4a91396ae0c099d8bb04af5c7`

## Persisted-money inventory

The Issue 599 implementation still exposes the eleven persisted monetary fields widened to PostgreSQL BIGINT / Prisma BigInt across both Prisma schema files. The remediation delta since the rejected handoff changes only `apps/api/src/monetary-range.integration.test.ts`; no schema, migration, parser, aggregation, formatting, or production code changed.

## Migration and runtime boundaries

The material lineage retains the exact BIGINT widening, safe-integer CHECK constraints, explicit PostgreSQL int8 parser, guarded JavaScript number conversion, safe dashboard aggregation, exact currency formatting, and canonical account-remuneration trigger recreation reviewed in the rejected candidate. The current remediation does not alter those boundaries.

## Discriminant remediation scope

The immutable compare from rejected published handoff `135af8e5e8f1e4436b78684fcf29e9fe650fbd11` to this material candidate contains exactly one repository path: `apps/api/src/monetary-range.integration.test.ts`. This is the scope used for the new certificate rather than the historical issue base, preventing the previous handoff-scope mismatch.

## Formatter gate remediation

The failed CI run on the prior remediation candidate reached `npm run format:check`, reported only `apps/api/src/monetary-range.integration.test.ts`, and skipped lint, typecheck, test, and build. The current material change adds the supported `// prettier-ignore` directive immediately before the integration-test function so Prettier preserves the SQL/assertion fixture body without changing execution semantics. A fresh CI snapshot for this material SHA is recorded separately in `evidence-ci-snapshot.json`.

## Independent rejection closure

Independent rejection `audit-rejection:a7bb8dc7-7788-4d27-bbbd-d0323aea0b18` findings A-001 and A-002 are represented 1:1 in `audit-remediation.json`, `learning-closure.json`, and `audit-escape-closure.json`. The remediation is classified implementation-only because existing generic delivery rules already require exact issue-local scope, post-write refreeze, and a green required gate; no missing reusable rule was demonstrated.
