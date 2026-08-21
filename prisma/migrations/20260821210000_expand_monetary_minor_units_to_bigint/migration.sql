-- Issue #599: widen persisted monetary minor-unit columns from signed 32-bit
-- INTEGER to signed 64-bit BIGINT. This is an exact widening conversion: no
-- scaling, rounding, or value rewrite is performed by application code.
--
-- PostgreSQL BIGINT is physically wider than JavaScript's exact integer range.
-- SolverFin's public API remains JSON numbers, so the database also enforces
-- the documented exact range to prevent any write path from persisting a value
-- that could only be exposed through a lossy Number coercion.
--
-- Transaction.amountMinor is referenced by the account-remuneration adjustment
-- trigger. PostgreSQL does not allow ALTER TYPE while that trigger definition is
-- attached, so preserve its canonical function and recreate the trigger after
-- the widening completes.

DROP TRIGGER "Transaction_account_remuneration_adjustment_trigger" ON "Transaction";

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

ALTER TABLE "AccountRemuneration"
  ALTER COLUMN "balanceBaseMinor" TYPE BIGINT USING "balanceBaseMinor"::bigint,
  ALTER COLUMN "originalAmountMinor" TYPE BIGINT USING "originalAmountMinor"::bigint,
  ADD CONSTRAINT "AccountRemunerationBalanceBaseMinorSafeRange"
    CHECK ("balanceBaseMinor" BETWEEN -9007199254740991 AND 9007199254740991),
  ADD CONSTRAINT "AccountRemunerationOriginalAmountMinorSafeRange"
    CHECK ("originalAmountMinor" BETWEEN -9007199254740991 AND 9007199254740991);

CREATE TRIGGER "Transaction_account_remuneration_adjustment_trigger"
AFTER UPDATE OF "amountMinor" ON "Transaction"
FOR EACH ROW
EXECUTE FUNCTION "markAccountRemunerationManualAdjustment"();
