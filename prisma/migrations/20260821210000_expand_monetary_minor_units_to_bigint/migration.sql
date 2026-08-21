-- Issue #599: widen persisted monetary minor-unit columns from signed 32-bit
-- INTEGER to signed 64-bit BIGINT. This is an exact widening conversion: no
-- scaling, rounding, or value rewrite is performed by application code.

ALTER TABLE "Account"
  ALTER COLUMN "openingBalanceMinor" TYPE BIGINT USING "openingBalanceMinor"::bigint;

ALTER TABLE "Card"
  ALTER COLUMN "creditLimitMinor" TYPE BIGINT USING "creditLimitMinor"::bigint;

ALTER TABLE "CardInstrument"
  ALTER COLUMN "creditLimitMinor" TYPE BIGINT USING "creditLimitMinor"::bigint;

ALTER TABLE "Transaction"
  ALTER COLUMN "amountMinor" TYPE BIGINT USING "amountMinor"::bigint;

ALTER TABLE "Recurrence"
  ALTER COLUMN "amountMinor" TYPE BIGINT USING "amountMinor"::bigint;

ALTER TABLE "Installment"
  ALTER COLUMN "amountMinor" TYPE BIGINT USING "amountMinor"::bigint;

ALTER TABLE "Invoice"
  ALTER COLUMN "totalAmountMinor" TYPE BIGINT USING "totalAmountMinor"::bigint;

ALTER TABLE "Budget"
  ALTER COLUMN "plannedAmountMinor" TYPE BIGINT USING "plannedAmountMinor"::bigint;

ALTER TABLE "PayableReceivable"
  ALTER COLUMN "amountMinor" TYPE BIGINT USING "amountMinor"::bigint;
