import assert from "node:assert/strict";

import {
  findFinancialInstitution,
  listFinancialInstitutions,
  persistFinancialInstitutionLogo,
  refreshFinancialInstitutionsFromDefaults,
  updateFinancialInstitutionStatus,
} from "./repositories/financial-institutions.js";

await refreshFinancialInstitutionsFromDefaults();
await bancoDoBrasilKeepsCompeCodeAsText();
await listFiltersCanBeCombined();
await missingBankCodeFilterShowsPendingRecords();
await statusChangesAreVisibleAndRefreshDoesNotReactivate();
await logoMetadataSurvivesRefreshFallback();

async function bancoDoBrasilKeepsCompeCodeAsText(): Promise<void> {
  const bancoDoBrasil = await findFinancialInstitution("banco_do_brasil");

  assert.ok(bancoDoBrasil);
  assert.equal(bancoDoBrasil.bankCode, "001");
}

async function listFiltersCanBeCombined(): Promise<void> {
  const byName = await listFinancialInstitutions({ q: "Banco do Brasil", status: "active" });
  const bySlug = await listFinancialInstitutions({ q: "banco_do_brasil", status: "active" });
  const byCode = await listFinancialInstitutions({ q: "001", bankCode: "001" });

  assert.deepEqual(
    byName.institutions.map((institution) => institution.key),
    ["banco_do_brasil"],
  );
  assert.deepEqual(
    bySlug.institutions.map((institution) => institution.key),
    ["banco_do_brasil"],
  );
  assert.deepEqual(
    byCode.institutions.map((institution) => institution.key),
    ["banco_do_brasil"],
  );
}

async function missingBankCodeFilterShowsPendingRecords(): Promise<void> {
  const result = await listFinancialInstitutions({ missing: "bankCode" });

  assert.ok(result.institutions.some((institution) => institution.key === "nubank"));
  assert.ok(!result.institutions.some((institution) => institution.key === "banco_do_brasil"));
}

async function statusChangesAreVisibleAndRefreshDoesNotReactivate(): Promise<void> {
  await updateFinancialInstitutionStatus("banco_do_brasil", "inactive");

  const inactive = await listFinancialInstitutions({ status: "inactive" });

  assert.ok(inactive.institutions.some((institution) => institution.key === "banco_do_brasil"));

  await refreshFinancialInstitutionsFromDefaults();

  const bancoDoBrasil = await findFinancialInstitution("banco_do_brasil");

  assert.equal(bancoDoBrasil?.status, "inactive");
  await updateFinancialInstitutionStatus("banco_do_brasil", "active");
}

async function logoMetadataSurvivesRefreshFallback(): Promise<void> {
  await persistFinancialInstitutionLogo("nubank", {
    institutionKey: "nubank",
    objectKey: "institutions/nubank/logo-hash.png",
    publicUrl: "https://assets.example.invalid/institutions/nubank/logo-hash.png",
    mimeType: "image/png",
    sizeBytes: 10,
    contentSha256: "a".repeat(64),
    uploadedAt: "2026-07-02T14:50:00.000Z",
  });
  await refreshFinancialInstitutionsFromDefaults();

  const result = await listFinancialInstitutions({ logoStatus: "r2_asset" });

  assert.ok(result.institutions.some((institution) => institution.key === "nubank"));
}
