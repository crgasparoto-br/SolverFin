# Exact-head adversarial evidence — Issue 599

Material SHA: `45b779e6e760ea02f7dafe24c794290e7845ed39`

## Persisted-money inventory

The complete Prisma schema directory contains two schema files. The monetary inventory is closed at eleven persisted fields:

- `Account.openingBalanceMinor`;
- `Card.creditLimitMinor`;
- `CardInstrument.creditLimitMinor`;
- `Transaction.amountMinor`;
- `Recurrence.amountMinor`;
- `Installment.amountMinor`;
- `Invoice.totalAmountMinor`;
- `Budget.plannedAmountMinor`;
- `PayableReceivable.amountMinor`;
- `AccountRemuneration.balanceBaseMinor`;
- `AccountRemuneration.originalAmountMinor`.

`prisma/schema.prisma` and `prisma/account-remuneration.prisma` declare those fields as `BigInt @db.BigInt`; the Issue 599 migration widens the same eleven columns with exact `::bigint` conversion and safe-integer CHECK constraints.

## Migration dependency control

The existing `Transaction_account_remuneration_adjustment_trigger` depends on `Transaction.amountMinor`. The migration drops only this trigger before `ALTER TYPE`, leaves the canonical `markAccountRemunerationManualAdjustment` function intact, and recreates the same trigger at the end. `apps/api/src/monetary-range.integration.test.ts` asserts the trigger is present after migrations.

## Runtime and JSON boundary

`packages/domain/src/money.ts` defines `Number.MIN_SAFE_INTEGER..Number.MAX_SAFE_INTEGER` as the supported minor-unit range and rejects values outside it. `apps/api/src/db.ts` registers OID 20 through `apps/api/src/db-safe-integer.ts`, so PostgreSQL BIGINT text is converted to JavaScript `number` only after exact-range validation. Dashboard SUM values remain text until guarded conversion, and the final aggregate is range-checked.

Negative boundary controls include `9007199254740992` and `-9007199254740992`; both are rejected instead of rounded. The integration test also verifies database rejection of `MAX_SAFE_INTEGER + 1`.

## Presentation precision

`packages/shared/src/formatting.ts` does not divide a near-limit integer by 100 as binary floating point. It converts the safe integer through `BigInt` to an exact decimal string before `Intl.NumberFormat`. Tests assert both safe boundaries render the final cent exactly and reject unsafe input.

## Migration preservation

Every old `INTEGER` value is representable exactly as `BIGINT`. The migration performs only `TYPE BIGINT USING column::bigint`; no scaling, rounding, backfill, currency conversion, sign change, or monetary rewrite occurs.

## Large aggregates

Domain tests cover an exact aggregate of `9_000_000_000_000_000` minor units and fail closed when `MAX_SUPPORTED_MONEY_MINOR + 1` would be produced. The API integration test performs the same large aggregate through PostgreSQL `SUM(... )::text` before guarded conversion.

## Documentation scan

The current architecture decision is ADR 0015. Repository documentation reviewed for the affected account-remuneration API already describes the multifile Prisma schema and does not assert a competing 32-bit monetary range. Searches for stale `nove campos monetários` claims returned no current source, and the remaining `2_147_483_647` occurrence is the historical pre-change fixture in the base version of the long-values test, replaced by the Issue 599 branch.

## Pass C

The issue body was re-read independently of the PR description. Each acceptance criterion is mapped to a material control above, the Prisma multifile inventory was re-opened after the first handoff exposed the omission, and the trigger dependency found by CI was incorporated into the migration before refreeze.
