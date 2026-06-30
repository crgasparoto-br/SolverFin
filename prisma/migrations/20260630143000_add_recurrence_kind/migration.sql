-- Recurrences need to know whether they are income or expense so that
-- materialized installments can create a Transaction with the right kind.
-- Card-scoped recurrences are always expense; existing rows default to
-- EXPENSE since most pre-existing recurrences are bills/subscriptions.

ALTER TABLE "Recurrence"
  ADD COLUMN "kind" "TransactionKind" NOT NULL DEFAULT 'EXPENSE';
