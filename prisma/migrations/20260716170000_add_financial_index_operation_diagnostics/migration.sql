ALTER TABLE "FinancialIndexOperation"
ADD COLUMN "diagnostics" JSONB;

COMMENT ON COLUMN "FinancialIndexOperation"."diagnostics" IS
'Aggregated, non-tenant operational diagnostics for CDI imports and account-remuneration processing.';
