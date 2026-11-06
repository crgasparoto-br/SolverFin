import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { closePool, type QueryExecutor, withSharedTransaction, withTransaction } from "./db.js";

const MIGRATION_PATH =
  "prisma/migrations/20261028124500_immutable_manual_rule_purpose/migration.sql";
const MANUAL_EXPLANATION =
  "Sugestão manual de descrição e categoria. Nunca aplicar automaticamente.";

class RollbackAfterAssertions extends Error {}

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closePool);

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for migration tests.");
  const migration = await readMigrationSql();

  try {
    await withSharedTransaction(async (executeQuery) => {
      await createLegacyTable(executeQuery);
      const manualPrefix = randomUUID();
      const manualExplanation = randomUUID();
      const regularActive = randomUUID();
      const regularInactive = randomUUID();
      const similarName = randomUUID();
      const fixtures = [
        { id: manualPrefix, name: "Preenchimento: Mercado", explanation: null, status: "ACTIVE" },
        { id: manualExplanation, name: "Regra anterior", explanation: MANUAL_EXPLANATION, status: "ACTIVE" },
        { id: regularActive, name: "Mercado automático", explanation: null, status: "ACTIVE" },
        { id: regularInactive, name: "Aluguel pausado", explanation: null, status: "INACTIVE" },
        { id: similarName, name: "Classificar Preenchimento: manual", explanation: null, status: "ACTIVE" },
      ] as const;
      const organizationId = randomUUID();
      const financialProfileId = randomUUID();
      for (const fixture of fixtures) {
        await executeQuery(
          'insert into "AutomationRule" ("id", "organizationId", "financialProfileId", ' +
            '"name", "explanation", "status") values ($1, $2, $3, $4, $5, $6)',
          [fixture.id, organizationId, financialProfileId, fixture.name, fixture.explanation, fixture.status],
        );
      }

      await executeQuery(migration);

      const rows = await executeQuery<{
        id: string;
        name: string;
        explanation: string | null;
        status: string;
        purpose: string;
        organizationId: string;
        financialProfileId: string;
      }>(
        'select "id", "name", "explanation", "status", "purpose", "organizationId", ' +
          '"financialProfileId" from "AutomationRule"',
      );
      assert.equal(rows.length, fixtures.length);
      const byId = new Map(rows.map((row) => [row.id, row]));
      for (const fixture of fixtures) {
        const actual = byId.get(fixture.id);
        assert.ok(actual);
        assert.equal(actual.id, fixture.id);
        assert.equal(actual.name, fixture.name);
        assert.equal(actual.explanation, fixture.explanation);
        assert.equal(actual.organizationId, organizationId);
        assert.equal(actual.financialProfileId, financialProfileId);
        const manual = fixture.id === manualPrefix || fixture.id === manualExplanation;
        assert.equal(actual.purpose, manual ? "manual_entry" : "automation");
        assert.equal(actual.status, manual ? "INACTIVE" : fixture.status);
      }

      await assert.rejects(
        () =>
          withTransaction(async (nested) => {
            await nested(
              'update "AutomationRule" set "purpose" = $2 where "id" = $1',
              [manualPrefix, "automation"],
            );
          }),
        /purpose is immutable/,
      );
      await assert.rejects(
        () =>
          withTransaction(async (nested) => {
            await nested('update "AutomationRule" set "status" = $2 where "id" = $1', [
              manualPrefix,
              "ACTIVE",
            ]);
          }),
        /AutomationRule_manual_entry_inactive_check/,
      );

      await executeQuery('update "AutomationRule" set "name" = $2 where "id" = $1', [
        regularActive,
        "Automação renomeada",
      ]);
      const legitimate = await executeQuery<{ status: string; purpose: string }>(
        'select "status", "purpose" from "AutomationRule" where "id" = $1',
        [regularActive],
      );
      assert.deepEqual(legitimate[0], { status: "ACTIVE", purpose: "automation" });
      throw new RollbackAfterAssertions();
    });
  } catch (error) {
    if (!(error instanceof RollbackAfterAssertions)) throw error;
  }
}

async function createLegacyTable(executeQuery: QueryExecutor): Promise<void> {
  await executeQuery('create schema "ManualRulePurposeMigrationTest"');
  await executeQuery('set local search_path to "ManualRulePurposeMigrationTest", public');
  await executeQuery(
    'create table "AutomationRule" (' +
      '"id" uuid primary key, "organizationId" uuid not null, ' +
      '"financialProfileId" uuid not null, "name" text not null, ' +
      '"explanation" text, "status" text not null)',
  );
}

async function readMigrationSql(): Promise<string> {
  for (const candidate of [
    resolve(process.cwd(), MIGRATION_PATH),
    resolve(process.cwd(), "..", "..", MIGRATION_PATH),
  ]) {
    try {
      return await readFile(candidate, "utf8");
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") continue;
      throw error;
    }
  }
  throw new Error("Migration file not found: " + MIGRATION_PATH);
}
