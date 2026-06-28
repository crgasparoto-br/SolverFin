-- Allow a recurrence to repeat against a credit card instead of a bank account,
-- so "Fixo" works the same way for card purchases as it does for account transactions.
-- accountId becomes optional and cardId is added; exactly one of the two must be set.

ALTER TABLE "Recurrence"
  ALTER COLUMN "accountId" DROP NOT NULL;

ALTER TABLE "Recurrence"
  ADD COLUMN "cardId" UUID;

ALTER TABLE "Recurrence"
  ADD CONSTRAINT "Recurrence_accountId_or_cardId_check"
  CHECK (("accountId" IS NOT NULL) <> ("cardId" IS NOT NULL));

ALTER TABLE "Recurrence"
  ADD CONSTRAINT "Recurrence_cardId_organizationId_financialProfileId_fkey"
  FOREIGN KEY ("cardId", "organizationId", "financialProfileId")
  REFERENCES "Card" ("id", "organizationId", "financialProfileId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Recurrence_organizationId_financialProfileId_cardId_idx"
  ON "Recurrence" ("organizationId", "financialProfileId", "cardId");
