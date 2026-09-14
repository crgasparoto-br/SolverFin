import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { classifyDeliveryV2Ci } from './delivery-v2-ci-classifier.mjs';

const SOURCE_COMMIT = '00eb10545f2f7209ef649d2834300515e0b85106';

test('generated classifier package is intact and pinned to the orchestrator source', () => {
  const verify = spawnSync(process.execPath, [fileURLToPath(new URL('../.delivery-v2/verify.mjs', import.meta.url))], { encoding: 'utf8' });
  assert.equal(verify.status, 0, verify.stderr);
  const lock = JSON.parse(readFileSync(new URL('../.delivery-v2/lock.json', import.meta.url), 'utf8'));
  assert.equal(lock.source.commit, SOURCE_COMMIT);
  assert.equal(lock.target.repository, 'crgasparoto-br/SolverFin');
});

test('design-system-only change is FAST', () => {
  const result = classifyDeliveryV2Ci({ changedPaths: ['apps/web/src/design-system/button.ts'] });
  assert.equal(result.riskProfile, 'fast');
  assert.equal(result.webChanged, true);
  assert.equal(result.databaseRequired, false);
});

test('public static asset is FAST', () => {
  assert.equal(classifyDeliveryV2Ci({ changedPaths: ['apps/web/public/icon.svg'] }).riskProfile, 'fast');
});

test('ordinary non-financial web code is STANDARD', () => {
  const result = classifyDeliveryV2Ci({ changedPaths: ['apps/web/src/app-shell/navigation.ts'] });
  assert.equal(result.riskProfile, 'standard');
  assert.equal(result.webChanged, true);
});

test('financial and multi-currency surfaces are CRITICAL', () => {
  for (const path of [
    'apps/web/src/dashboard/financial-summary.ts',
    'apps/web/src/financial-catalog/currency-selector.ts',
    'docs/API_CREDIT_CARDS_INVOICES.md'
  ]) {
    assert.equal(classifyDeliveryV2Ci({ changedPaths: [path] }).riskProfile, 'critical', `${path} must be CRITICAL`);
  }
});

test('all API source is CRITICAL during initial rollout', () => {
  assert.equal(classifyDeliveryV2Ci({ changedPaths: ['apps/api/src/routes/health.ts'] }).riskProfile, 'critical');
});

test('shared/domain/config/AI packages are CRITICAL', () => {
  for (const path of ['packages/shared/src/index.ts', 'packages/domain/src/index.ts', 'packages/config/src/index.ts', 'packages/ai/src/index.ts']) {
    assert.equal(classifyDeliveryV2Ci({ changedPaths: [path] }).riskProfile, 'critical', `${path} must be CRITICAL`);
  }
});

test('Prisma migration is CRITICAL and marks database validation', () => {
  const result = classifyDeliveryV2Ci({ changedPaths: ['prisma/migrations/202609140001_delivery_v2/migration.sql'] });
  assert.equal(result.riskProfile, 'critical');
  assert.equal(result.databaseRequired, true);
});

test('workflow and classifier changes are CRITICAL', () => {
  assert.equal(classifyDeliveryV2Ci({ changedPaths: ['.github/workflows/delivery-v2-ci.yml'] }).riskProfile, 'critical');
  assert.equal(classifyDeliveryV2Ci({ changedPaths: ['scripts/delivery-v2-ci-classifier.mjs'] }).riskProfile, 'critical');
});

test('explicit FAST never downgrades observed CRITICAL risk', () => {
  const result = classifyDeliveryV2Ci({ requested: 'fast', changedPaths: ['prisma/schema.prisma'] });
  assert.equal(result.riskProfile, 'critical');
  assert.equal(result.promoted, true);
});

test('unknown path fails closed to CRITICAL', () => {
  const result = classifyDeliveryV2Ci({ changedPaths: ['infra/custom-policy.txt'] });
  assert.equal(result.riskProfile, 'critical');
  assert.ok(result.reasons.some((reason) => reason === 'unknown-path:infra/custom-policy.txt'));
});

test('empty changed-path evidence fails closed to CRITICAL', () => {
  assert.equal(classifyDeliveryV2Ci({ changedPaths: [] }).riskProfile, 'critical');
});
