-- Corrige lançamentos CDI existentes para o dia seguinte à competência.
-- A data real da execução permanece registrada em AccountRemuneration.processedOn.
UPDATE "Transaction" t
   SET "occurredOn" = ar."competenceOn" + 1,
       "plannedOn" = ar."competenceOn" + 1,
       "updatedAt" = now()
  FROM "AccountRemuneration" ar
 WHERE ar."transactionId" = t."id"
   AND t."source" = 'ACCOUNT_REMUNERATION'
   AND (
     t."occurredOn" IS DISTINCT FROM ar."competenceOn" + 1
     OR t."plannedOn" IS DISTINCT FROM ar."competenceOn" + 1
   );

-- Mantém a regra D+1 mesmo quando competências atrasadas são processadas em lote.
CREATE OR REPLACE FUNCTION "alignAccountRemunerationTransactionPostingDate"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."transactionId" IS NOT NULL THEN
    UPDATE "Transaction"
       SET "occurredOn" = NEW."competenceOn" + 1,
           "plannedOn" = NEW."competenceOn" + 1,
           "updatedAt" = now()
     WHERE "id" = NEW."transactionId"
       AND "source" = 'ACCOUNT_REMUNERATION'
       AND (
         "occurredOn" IS DISTINCT FROM NEW."competenceOn" + 1
         OR "plannedOn" IS DISTINCT FROM NEW."competenceOn" + 1
       );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "AccountRemuneration_transaction_posting_date_alignment"
  ON "AccountRemuneration";

CREATE TRIGGER "AccountRemuneration_transaction_posting_date_alignment"
AFTER INSERT OR UPDATE OF "competenceOn", "transactionId" ON "AccountRemuneration"
FOR EACH ROW
EXECUTE FUNCTION "alignAccountRemunerationTransactionPostingDate"();
