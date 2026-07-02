-- Persist the global catalog of banks and financial institutions.
CREATE TYPE "FinancialInstitutionStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "FinancialInstitution" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "key" VARCHAR(80) NOT NULL,
  "label" VARCHAR(160) NOT NULL,
  "description" VARCHAR(500),
  "fallbackLabel" VARCHAR(12) NOT NULL,
  "status" "FinancialInstitutionStatus" NOT NULL DEFAULT 'ACTIVE',
  "financialInstitutionCode" VARCHAR(80),
  "bankCode" CHAR(3),
  "ispb" VARCHAR(20),
  "institutionType" VARCHAR(40),
  "logoAssetPath" VARCHAR(500),
  "logoObjectKey" VARCHAR(500),
  "logoPublicUrl" VARCHAR(800),
  "logoMimeType" VARCHAR(80),
  "logoSizeBytes" INTEGER,
  "logoContentSha256" VARCHAR(64),
  "logoUploadedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FinancialInstitution_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancialInstitution_key_key" UNIQUE ("key")
);

CREATE INDEX "FinancialInstitution_status_idx" ON "FinancialInstitution" ("status");
CREATE INDEX "FinancialInstitution_bankCode_idx" ON "FinancialInstitution" ("bankCode") WHERE "bankCode" IS NOT NULL;
CREATE INDEX "FinancialInstitution_ispb_idx" ON "FinancialInstitution" ("ispb") WHERE "ispb" IS NOT NULL;
CREATE INDEX "FinancialInstitution_label_lower_idx" ON "FinancialInstitution" (lower("label"));

INSERT INTO "FinancialInstitution"
  ("key", "label", "description", "fallbackLabel", "status", "financialInstitutionCode", "bankCode", "ispb", "institutionType", "logoAssetPath")
VALUES
  ('banco_do_brasil', 'Banco do Brasil', 'Banco múltiplo brasileiro com ampla rede de varejo e serviços digitais.', 'BB', 'ACTIVE', 'banco_do_brasil', '001', NULL, 'bank', NULL),
  ('banco_pan', 'Banco Pan', 'Banco brasileiro com contas digitais, cartões, crédito e financiamento.', 'PN', 'ACTIVE', 'banco_pan', '623', NULL, 'bank', NULL),
  ('banco_xp', 'Banco XP', 'Instituição financeira ligada ao ecossistema XP, com conta, cartão e investimentos.', 'XP', 'ACTIVE', 'banco_xp', NULL, NULL, 'bank', NULL),
  ('bradesco', 'Bradesco', 'Banco múltiplo brasileiro com contas, cartões, crédito e investimentos.', 'BR', 'ACTIVE', 'bradesco', '237', NULL, 'bank', '/images/institutions/bradesco.png'),
  ('btg_pactual', 'BTG Pactual', 'Banco brasileiro de investimentos com conta digital, cartão e serviços financeiros.', 'BT', 'ACTIVE', 'btg_pactual', '208', NULL, 'bank', NULL),
  ('c6', 'C6 Bank', 'Banco digital brasileiro com conta, cartões e serviços financeiros.', 'C6', 'ACTIVE', 'c6', '336', NULL, 'bank', NULL),
  ('caixa', 'Caixa', 'Banco público brasileiro com contas, cartões, crédito e serviços sociais.', 'CX', 'ACTIVE', 'caixa', '104', NULL, 'bank', NULL),
  ('inter', 'Inter', 'Banco digital brasileiro com conta, cartões, crédito e marketplace financeiro.', 'IN', 'ACTIVE', 'inter', '077', NULL, 'bank', '/images/institutions/inter.png'),
  ('itau', 'Itaú', 'Banco múltiplo brasileiro com contas, cartões, crédito e investimentos.', 'IT', 'ACTIVE', 'itau', '341', NULL, 'bank', NULL),
  ('mercado_pago', 'Mercado Pago', 'Conta de pagamento e serviços financeiros digitais do ecossistema Mercado Livre.', 'MP', 'ACTIVE', 'mercado_pago', NULL, NULL, 'payment_institution', NULL),
  ('neon', 'Neon', 'Conta digital brasileira com cartões, pagamentos e serviços financeiros.', 'NE', 'ACTIVE', 'neon', NULL, NULL, 'bank', NULL),
  ('nubank', 'Nubank', 'Banco digital brasileiro com conta, cartões, crédito e investimentos.', 'NU', 'ACTIVE', 'nubank', NULL, NULL, 'bank', NULL),
  ('original', 'Original', 'Banco digital brasileiro com conta, cartões e serviços financeiros.', 'OR', 'ACTIVE', 'original', '212', NULL, 'bank', NULL),
  ('pagbank', 'PagBank', 'Conta digital e serviços financeiros do ecossistema PagSeguro.', 'PG', 'ACTIVE', 'pagbank', NULL, NULL, 'payment_institution', NULL),
  ('picpay', 'PicPay', 'Carteira digital e conta de pagamento com serviços financeiros.', 'PP', 'ACTIVE', 'picpay', NULL, NULL, 'digital_wallet', NULL),
  ('porto_bank', 'Porto Bank', 'Banco e serviços financeiros ligados ao ecossistema Porto.', 'PB', 'ACTIVE', 'porto_bank', NULL, NULL, 'bank', '/images/institutions/porto-bank.svg'),
  ('safra', 'Safra', 'Banco brasileiro com contas, cartões, crédito, câmbio e investimentos.', 'SA', 'ACTIVE', 'safra', '422', NULL, 'bank', NULL),
  ('santander', 'Santander', 'Banco múltiplo com atuação no Brasil em contas, cartões, crédito e investimentos.', 'ST', 'ACTIVE', 'santander', '033', NULL, 'bank', NULL),
  ('sicredi', 'Sicredi', 'Instituição financeira cooperativa com contas, cartões, crédito e investimentos.', 'SI', 'ACTIVE', 'sicredi', NULL, NULL, 'cooperative', NULL),
  ('sicoob', 'Sicoob', 'Sistema de cooperativas financeiras com contas, cartões, crédito e investimentos.', 'SC', 'ACTIVE', 'sicoob', NULL, NULL, 'cooperative', NULL),
  ('solverfin_demo', 'Instituição demo', 'Instituição fictícia usada apenas em dados de demonstração do SolverFin.', 'SD', 'ACTIVE', 'solverfin_demo', NULL, NULL, 'demo', NULL)
ON CONFLICT ("key") DO NOTHING;
