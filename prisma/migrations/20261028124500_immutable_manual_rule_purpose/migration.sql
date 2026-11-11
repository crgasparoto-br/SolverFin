-- Persist origin independently from the user-editable display name.
ALTER TABLE "AutomationRule"
  ADD COLUMN "purpose" VARCHAR(20) NOT NULL DEFAULT 'automation';

-- Legacy manual-entry rules were previously identified by a name or explanation.
UPDATE "AutomationRule"
SET "purpose" = 'manual_entry', "status" = 'INACTIVE'
WHERE "name" LIKE 'Preenchimento: %'
   OR "explanation" = 'Sugestão manual de descrição e categoria. Nunca aplicar automaticamente.';

ALTER TABLE "AutomationRule"
  ADD CONSTRAINT "AutomationRule_purpose_check"
    CHECK ("purpose" IN ('automation', 'manual_entry')),
  ADD CONSTRAINT "AutomationRule_manual_entry_inactive_check"
    CHECK ("purpose" <> 'manual_entry' OR "status" = 'INACTIVE');

CREATE FUNCTION "preventAutomationRulePurposeChange"()
RETURNS trigger AS $$
BEGIN
  IF NEW."purpose" IS DISTINCT FROM OLD."purpose" THEN
    RAISE EXCEPTION 'AutomationRule purpose is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AutomationRulePurposeImmutable"
  BEFORE UPDATE ON "AutomationRule"
  FOR EACH ROW EXECUTE FUNCTION "preventAutomationRulePurposeChange"();
