-- Serializa alterações de elegibilidade da conta e da configuração CDI por meio do lock da conta.
CREATE OR REPLACE FUNCTION "guardAccountRemunerationConfiguration"()
RETURNS TRIGGER AS $$
DECLARE
  account_status_value VARCHAR(32);
  account_currency_value VARCHAR(3);
BEGIN
  SELECT a."status", a."currency"
    INTO account_status_value, account_currency_value
    FROM "Account" a
   WHERE a."id" = NEW."accountId"
     AND a."organizationId" = NEW."organizationId"
     AND a."financialProfileId" = NEW."financialProfileId"
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'Account_remuneration_account_missing',
      MESSAGE = 'Conta não encontrada para este perfil.';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW."enabled" = false THEN
    NEW."remunerationPercent" := COALESCE(NEW."remunerationPercent", OLD."remunerationPercent");
    NEW."startsOn" := COALESCE(NEW."startsOn", OLD."startsOn");
    NEW."categoryId" := COALESCE(NEW."categoryId", OLD."categoryId");
  END IF;

  IF NEW."enabled" = true AND account_status_value <> 'ACTIVE' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'Account_remuneration_account_inactive',
      MESSAGE = 'A remuneração pelo CDI exige uma conta ativa.';
  END IF;

  IF NEW."enabled" = true AND account_currency_value <> 'BRL' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'Account_remuneration_currency_unsupported',
      MESSAGE = 'A remuneração pelo CDI está disponível somente para contas em BRL.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "AccountRemunerationConfiguration_account_integrity_guard"
  ON "AccountRemunerationConfiguration";

CREATE TRIGGER "AccountRemunerationConfiguration_account_integrity_guard"
BEFORE INSERT OR UPDATE ON "AccountRemunerationConfiguration"
FOR EACH ROW
EXECUTE FUNCTION "guardAccountRemunerationConfiguration"();

CREATE OR REPLACE FUNCTION "guardAccountEligibilityWithActiveRemuneration"()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM "AccountRemunerationConfiguration" c
     WHERE c."organizationId" = NEW."organizationId"
       AND c."financialProfileId" = NEW."financialProfileId"
       AND c."accountId" = NEW."id"
       AND c."enabled" = true
  ) THEN
    IF NEW."currency" IS DISTINCT FROM OLD."currency" AND NEW."currency" <> 'BRL' THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        CONSTRAINT = 'Account_remuneration_must_be_disabled',
        MESSAGE = 'Desative a remuneração pelo CDI antes de alterar a moeda da conta.';
    END IF;

    IF NEW."status" IS DISTINCT FROM OLD."status" AND NEW."status" <> 'ACTIVE' THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        CONSTRAINT = 'Account_remuneration_must_be_disabled',
        MESSAGE = 'Desative a remuneração pelo CDI antes de arquivar a conta.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "Account_active_remuneration_eligibility_guard" ON "Account";

CREATE TRIGGER "Account_active_remuneration_eligibility_guard"
BEFORE UPDATE OF "currency", "status" ON "Account"
FOR EACH ROW
EXECUTE FUNCTION "guardAccountEligibilityWithActiveRemuneration"();
