import assert from "node:assert/strict";

import {
  findFinancialInstitution,
  financialInstitutionCatalog,
  getVisualFallbackLabel,
  isFinancialInstitutionKey,
} from "./visual-identities.js";

financialInstitutionCatalogHasRequiredFieldsAndUniqueKeys();
financialInstitutionCatalogPreservesExistingKeys();
financialInstitutionCatalogIncludesPriorityBrazilianBanks();
financialInstitutionLocalLogoPathsUseSafeControlledAssets();
financialInstitutionLookupHandlesKnownEmptyAndUnknownKeys();
visualFallbackLabelIgnoresUnsafeCharacters();

function financialInstitutionCatalogHasRequiredFieldsAndUniqueKeys(): void {
  const keys = new Set<string>();
  const financialInstitutionCodes = new Set<string>();

  for (const institution of financialInstitutionCatalog) {
    assert.match(institution.key, /^[a-z0-9_]+$/);
    assert.equal(keys.has(institution.key), false, `${institution.key} must be unique`);
    assert.equal(
      financialInstitutionCodes.has(institution.financialInstitutionCode),
      false,
      `${institution.financialInstitutionCode} must be unique`,
    );
    assert.equal(institution.label.trim().length > 0, true);
    assert.equal(institution.description.trim().length > 0, true);
    assert.match(institution.fallbackLabel, /^[A-Z0-9-]{2,3}$/);
    assert.equal(["active", "inactive"].includes(institution.status), true);
    assert.match(institution.financialInstitutionCode, /^[a-z0-9_]+$/);

    keys.add(institution.key);
    financialInstitutionCodes.add(institution.financialInstitutionCode);
  }
}

function financialInstitutionCatalogPreservesExistingKeys(): void {
  const existingKeys = ["bradesco", "inter", "c6", "caixa", "porto_bank", "solverfin_demo"];

  for (const key of existingKeys) {
    assert.equal(isFinancialInstitutionKey(key), true, `${key} must remain valid`);
    assert.equal(findFinancialInstitution(key).key, key);
  }
}

function financialInstitutionCatalogIncludesPriorityBrazilianBanks(): void {
  const priorityKeys = [
    "banco_do_brasil",
    "itau",
    "santander",
    "nubank",
    "btg_pactual",
    "sicredi",
    "sicoob",
    "banco_pan",
    "mercado_pago",
    "picpay",
    "neon",
    "original",
    "safra",
    "banco_xp",
    "pagbank",
  ];

  for (const key of priorityKeys) {
    assert.equal(isFinancialInstitutionKey(key), true, `${key} must be available`);
  }
}

function financialInstitutionLocalLogoPathsUseSafeControlledAssets(): void {
  const logoPaths = financialInstitutionCatalog
    .map((institution) => institution.logoAssetPath)
    .filter((path): path is string => path !== undefined);

  assert.equal(logoPaths.length > 0, true);

  for (const logoPath of logoPaths) {
    assert.doesNotMatch(logoPath, /^https?:\/\//);
    assert.match(logoPath, /^\/images\/institutions\/[a-z0-9-]+\.(png|svg|webp)$/);
  }
}

function financialInstitutionLookupHandlesKnownEmptyAndUnknownKeys(): void {
  assert.equal(findFinancialInstitution(" Inter ").key, "inter");
  assert.equal(findFinancialInstitution(" Inter ").label, "Inter");
  assert.equal(findFinancialInstitution(undefined).label, "Sem instituição");
  assert.equal(findFinancialInstitution("").label, "Sem instituição");

  const unknown = findFinancialInstitution("legacy_bank");

  assert.equal(unknown.key, "legacy_bank");
  assert.equal(unknown.label, "Instituição não cadastrada");
  assert.equal(unknown.status, "unknown");
  assert.equal(unknown.isKnown, false);
  assert.equal(unknown.fallbackLabel, "LB");
  assert.equal(unknown.logoAssetPath, undefined);
}

function visualFallbackLabelIgnoresUnsafeCharacters(): void {
  assert.equal(getVisualFallbackLabel("<script>alert(1)</script>"), "S");
  assert.equal(getVisualFallbackLabel("Banco XP"), "BX");
}
