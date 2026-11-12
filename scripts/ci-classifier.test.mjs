import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { classifyDeliveryV2Ci } from "./ci-classifier.mjs";

test("design-system-only change is FAST", () => {
  const result = classifyDeliveryV2Ci({
    changedPaths: ["apps/web/src/design-system/button.ts"],
  });
  assert.equal(result.riskProfile, "fast");
  assert.equal(result.webChanged, true);
  assert.equal(result.databaseRequired, false);
});

test("public static asset is FAST", () => {
  assert.equal(
    classifyDeliveryV2Ci({ changedPaths: ["apps/web/public/icon.svg"] }).riskProfile,
    "fast",
  );
});

test("ordinary non-financial web code is STANDARD", () => {
  const result = classifyDeliveryV2Ci({
    changedPaths: ["apps/web/src/app-shell/navigation.ts"],
  });
  assert.equal(result.riskProfile, "standard");
  assert.equal(result.webChanged, true);
});

test("financial and multi-currency surfaces are CRITICAL", () => {
  for (const path of [
    "apps/web/src/dashboard/financial-summary.ts",
    "apps/web/src/financial-catalog/currency-selector.ts",
    "docs/API_CREDIT_CARDS_INVOICES.md",
  ]) {
    assert.equal(
      classifyDeliveryV2Ci({ changedPaths: [path] }).riskProfile,
      "critical",
      `${path} must be CRITICAL`,
    );
  }
});

test("all API source is CRITICAL during initial rollout", () => {
  assert.equal(
    classifyDeliveryV2Ci({ changedPaths: ["apps/api/src/routes/health.ts"] }).riskProfile,
    "critical",
  );
});

test("shared/domain/config/AI packages are CRITICAL", () => {
  for (const path of [
    "packages/shared/src/index.ts",
    "packages/domain/src/index.ts",
    "packages/config/src/index.ts",
    "packages/ai/src/index.ts",
  ]) {
    assert.equal(
      classifyDeliveryV2Ci({ changedPaths: [path] }).riskProfile,
      "critical",
      `${path} must be CRITICAL`,
    );
  }
});

test("Prisma migration is CRITICAL and marks database validation", () => {
  const result = classifyDeliveryV2Ci({
    changedPaths: ["prisma/migrations/202609140001_delivery_v2/migration.sql"],
  });
  assert.equal(result.riskProfile, "critical");
  assert.equal(result.databaseRequired, true);
});

test("workflow and classifier changes are CRITICAL", () => {
  assert.equal(
    classifyDeliveryV2Ci({ changedPaths: [".github/workflows/delivery-v2-ci.yml"] }).riskProfile,
    "critical",
  );
  assert.equal(
    classifyDeliveryV2Ci({ changedPaths: ["scripts/ci-classifier.mjs"] }).riskProfile,
    "critical",
  );
});

test("explicit FAST never downgrades observed CRITICAL risk", () => {
  const result = classifyDeliveryV2Ci({
    requested: "fast",
    changedPaths: ["prisma/schema.prisma"],
  });
  assert.equal(result.riskProfile, "critical");
  assert.equal(result.promoted, true);
});

test("unknown path fails closed to CRITICAL", () => {
  const result = classifyDeliveryV2Ci({ changedPaths: ["infra/custom-policy.txt"] });
  assert.equal(result.riskProfile, "critical");
  assert.ok(result.reasons.includes("unknown-path:infra/custom-policy.txt"));
});

test("empty changed-path evidence fails closed to CRITICAL", () => {
  assert.equal(classifyDeliveryV2Ci({ changedPaths: [] }).riskProfile, "critical");
});

test("local CI policy is independent of external or orchestrator locks", () => {
  const plan = classifyDeliveryV2Ci({ changedPaths: ["scripts/ci-risk-policy.json"] });
  assert.equal(plan.riskProfile, "critical");
  assert.equal(plan.codeChanged, true);
});

test("FAST public SVG installs dependencies before merge-preview typecheck", () => {
  const result = classifyDeliveryV2Ci({ changedPaths: ["apps/web/public/icon.svg"] });
  assert.equal(result.riskProfile, "fast");
  assert.equal(result.codeChanged, true);
  assert.equal(result.webChanged, true);
  const workflow = readFileSync(".github/workflows/delivery-v2-ci.yml", "utf8");
  const preview = workflow.split("  merge_preview:")[1]?.split("  fast_validation:")[0];
  assert.ok(preview, "merge preview job exists");
  const dependencyCondition =
    "if: needs.classify.outputs.code_changed == 'true' || (needs.classify.outputs.risk_profile == 'fast' && needs.classify.outputs.web_changed == 'true')";
  assert.equal(
    preview.split(dependencyCondition).length - 1,
    2,
    "setup-node and npm ci must cover public assets",
  );
  const installIndex = preview.indexOf("npm ci --no-audit --no-fund");
  const typecheckIndex = preview.indexOf("FAST web type compatibility");
  assert.ok(installIndex < typecheckIndex);
});

test("web-only typechecks run after building workspace packages in all CI paths", () => {
  const workflow = readFileSync(".github/workflows/delivery-v2-ci.yml", "utf8");
  const paths = [
    ["merge_preview", "fast_validation", "FAST web type compatibility"],
    ["fast_validation", "standard_validation", "Web typecheck"],
    ["standard_validation", "critical_validation", "npm run typecheck --workspace @solverfin/web"],
  ];
  for (const [job, nextJob, typecheck] of paths) {
    const section = workflow.split(`  ${job}:\n`)[1]?.split(`  ${nextJob}:\n`)[0];
    assert.ok(section, `${job} section exists`);
    const installAt = section.indexOf("npm ci --no-audit --no-fund");
    const buildAt = section.indexOf("run: npm run build:packages");
    const typecheckAt = section.indexOf(typecheck);
    assert.ok(
      installAt >= 0 && installAt < buildAt && buildAt < typecheckAt,
      `${job}: build before typecheck`,
    );
  }

  const preview = workflow.split("  merge_preview:\n")[1]?.split("  fast_validation:\n")[0];
  const fast = workflow.split("  fast_validation:\n")[1]?.split("  standard_validation:\n")[0];
  assert.match(
    preview,
    /name: Build workspace packages for FAST merge preview\n        if: needs\.classify\.outputs\.risk_profile == 'fast' && needs\.classify\.outputs\.web_changed == 'true'\n        run: npm run build:packages/,
  );
  assert.match(
    fast,
    /name: Build workspace packages for FAST web validation\n        if: needs\.classify\.outputs\.web_changed == 'true'\n        run: npm run build:packages/,
  );
});
