-- Mantém a identidade dos lançamentos CDI protegida e permite somente o realinhamento
-- de occurredOn/plannedOn para o dia seguinte à competência vinculada.
CREATE OR REPLACE FUNCTION "protectAccountRemunerationTransactionIdentity"()
RETURNS TRIGGER AS $$
DECLARE
  expected_posting_on DATE;
  has_remuneration BOOLEAN;
BEGIN
  SELECT ar."competenceOn" + 1
    INTO expected_posting_on
    FROM "AccountRemuneration" ar
   WHERE ar."transactionId" = OLD."id";

  has_remuneration := FOUND;

  IF has_remuneration AND (
    NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
    OR NEW."financialProfileId" IS DISTINCT FROM OLD."financialProfileId"
    OR NEW."accountId" IS DISTINCT FROM OLD."accountId"
    OR NEW."destinationAccountId" IS DISTINCT FROM OLD."destinationAccountId"
    OR NEW."kind" IS DISTINCT FROM OLD."kind"
    OR NEW."source" IS DISTINCT FROM OLD."source"
    OR NEW."currency" IS DISTINCT FROM OLD."currency"
    OR NEW."description" IS DISTINCT FROM OLD."description"
    OR (
      (
        NEW."occurredOn" IS DISTINCT FROM OLD."occurredOn"
        OR NEW."plannedOn" IS DISTINCT FROM OLD."plannedOn"
      )
      AND (
        NEW."occurredOn" IS DISTINCT FROM expected_posting_on
        OR NEW."plannedOn" IS DISTINCT FROM expected_posting_on
      )
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Lançamentos de remuneração permitem alterar somente valor, categoria, conciliação e o realinhamento automático para D+1 da competência.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
