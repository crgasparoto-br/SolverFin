-- Issue #599: widen persisted monetary minor-unit columns from signed 32-bit
-- INTEGER to signed 64-bit BIGINT. This is an exact widening conversion: no
-- scaling, rounding, or value rewrite is performed by application code.
--
-- PostgreSQL BIGINT is physically wider than JavaScript's exact integer range.
-- SolverFin's public API remains JSON numbers, so the database also enforces
-- the documented exact range to prevent any write path from persisting a value
-- that could only be exposed through a lossy Number coercion.

ALTER TABLE "Account"
  ALTER COLUMN "openingBalanceMinor" TYPE BIGINT USING "openingBalanceMinor"::bigint,
  ADD CONSTRAINT "AccountOpeningBalanceMinorSafeRange"
    CHECK ("openingBalanceMinor" BETWEEN -9007199254740991 AND 9007199254740991);

ALTER TABLE "Card"
  ALTER COLUMN "creditLimitMinor" TYPE BIGINT USING "creditLimitMinor"::bigint,
  ADD CONSTRAINT "CardCreditLimitMinorSafeRange"
    CHECK ("creditLimitMinor" IS NULL OR "creditLimitMinor" BETWEEN -9007199254740991 AND 9007199254740991);

ALTER TABLE "CardInstrument"
  ALTER COLUMN "creditLimitMinor" TYPE BIGINT USING "creditLimitMinor"::bigint,
  ADD CONSTRAINT "CardInstrumentCreditLimitMinorSafeRange"
    CHECK ("creditLimitMinor" IS NULL OR "creditLimitMinor" BETWEEN -9007199254740991 AND 9007199254740991);

ALTER TABLE "Transaction"
  ALTER COLUMN "amountMinor" TYPE BIGINT USING "amountMinor"::bigint,
  ADD CONSTRAINT "TransactionAmountMinorSafeRange"
    CHECK ("amountMinor" BETWEEN -9007199254740991 AND 9007199254740991);

ALTER TABLE "Recurrence"
  ALTER COLUMN "amountMinor" TYPE BIGINT USING "amountMinor"::bigint,
  ADD CONSTRAINT "RecurrenceAmountMinorSafeRange"
    CHECK ("amountMinor" BETWEEN -9007199254740991 AND 9007199254740991);

ALTER TABLE "Installment"
  ALTER COLUMN "amountMinor" TYPE BIGINT USING "amountMinor"::bigint,
  ADD CONSTRAINT "InstallmentAmountMinorSafeRange"
    CHECK ("amountMinor" BETWEEN -9007199254740991 AND 9007199254740991);

ALTER TABLE "Invoice"
  ALTER COLUMN "totalAmountMinor" TYPE BIGINT USING "totalAmountMinor"::bigint,
  ADD CONSTRAINT "InvoiceTotalAmountMinorSafeRange"
    CHECK ("totalAmountMinor" BETWEEN -9007199254740991 AND 9007199254740991);

ALTER TABLE "Budget"
  ALTER COLUMN "plannedAmountMinor" TYPE BIGINT USING "plannedAmountMinor"::bigint,
  ADD CONSTRAINT "BudgetPlannedAmountMinorSafeRange"
    CHECK ("plannedAmountMinor" BETWEEN -9007199254740991 AND 9007199254740991);

ALTER TABLE "PayableReceivable"
  ALTER COLUMN "amountMinor" TYPE BIGINT USING "amountMinor"::bigint,
  ADD CONSTRAINT "PayableReceivableAmountMinorSafeRange"
    CHECK ("amountMinor" BETWEEN -9007199254740991 AND 9007199254740991);
